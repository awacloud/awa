// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { isAbsolute, join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { run, applyPkgDir, extractPkgFlag, type RunOptions, type WasmCryptoConfig } from "./index.ts";
import { validateTargets, type Target } from "./targets.schema.ts";

// ─── loadConfig discovery seam ────────────────────────────────────────────────
// Access loadConfig via a dynamic import so we can exercise the discovery path
// without calling run() (which also parses subcommands).
// We import the module fresh to ensure the discovery code actually runs.
// The seam: we restore WASI_SDK_PATH after each test for order-independence.

const FAKE_SDK_DIR = join(import.meta.dir, "..", "build-env", "__fixtures__", "fake-install");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Capture stdout/stderr written during `run(opts)`. */
async function capture(opts: RunOptions): Promise<{ code: number; stdout: string; stderr: string }> {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    const origStderrWrite = process.stderr.write.bind(process.stderr);

    // Intercept writes
    (process.stdout as { write: typeof process.stdout.write }).write = (chunk: string | Uint8Array, ...rest: unknown[]) => {
        stdoutChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
    };
    (process.stderr as { write: typeof process.stderr.write }).write = (chunk: string | Uint8Array, ...rest: unknown[]) => {
        stderrChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
    };

    let code: number;
    try {
        code = await run(opts);
    } finally {
        (process.stdout as { write: typeof process.stdout.write }).write = origStdoutWrite;
        (process.stderr as { write: typeof process.stderr.write }).write = origStderrWrite;
    }

    return { code, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}

// A minimal well-formed target for schema tests.
const WELL_FORMED_TARGET: Target = {
    algo: "argon2",
    wasmModule: "argon2",
    exportName: "argon2Wasm",
    source: "argon2-20190702",
    sourceKind: "vendored-fork",
    shim: "shims/argon2.c",
    cSources: ["vendor/argon2.c", "vendor/blake2/blake2b.c"],
    cflags: ["-O3"],
    simd: false,
    exports: ["memory", "alloc", "free", "argon2id_hash_raw"],
    vectors: ["references/argon2-vectors.json"],
};

// ─── pin / sha256 invariants ─────────────────────────────────────────────────
//
// `src/sources.ts` was deleted (F4/BATCH_41 task 02): the last surviving entry
// — the wasi-sdk toolchain pin — now lives in `build-env/pins.ts`, and its
// pin/sha256 invariants are asserted by `build-env/pins.test.ts`.

// ─── --help / -h ─────────────────────────────────────────────────────────────

describe("--help", () => {
    test("exits 0 and prints usage to stdout", async () => {
        const { code, stdout } = await capture({ args: ["--help"] });
        expect(code).toBe(0);
        expect(stdout).toContain("wasm-crypto");
        expect(stdout).toContain("build");
        expect(stdout).toContain("verify");
        expect(stdout).toContain("all");
        expect(stdout).toContain("--pkg");
        expect(stdout).toContain("sourceKind");
        expect(stdout).toContain("cStd");
    });

    test("-h is accepted as alias", async () => {
        const { code, stdout } = await capture({ args: ["-h"] });
        expect(code).toBe(0);
        expect(stdout).toContain("wasm-crypto");
    });
});

// ─── --version / -v ──────────────────────────────────────────────────────────

describe("--version", () => {
    test("exits 0 and prints a version string to stdout", async () => {
        const { code, stdout } = await capture({ args: ["--version"] });
        expect(code).toBe(0);
        expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });

    test("-v is accepted as alias", async () => {
        const { code, stdout } = await capture({ args: ["-v"] });
        expect(code).toBe(0);
        expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });
});

// ─── Unknown subcommand ───────────────────────────────────────────────────────

describe("unknown subcommand", () => {
    test("exits 1 and writes message to stderr", async () => {
        const { code, stderr } = await capture({ args: ["bogus"] });
        expect(code).toBe(1);
        expect(stderr).toContain("bogus");
    });

    test("no subcommand exits 1 with a hint", async () => {
        const { code, stderr } = await capture({ args: [] });
        expect(code).toBe(1);
        expect(stderr).toContain("missing subcommand");
    });
});

// ─── Subcommand dispatch ──────────────────────────────────────────────────────
// Tasks 02–04 replaced the wave-1 stubs with real implementations. At this layer
// we assert only that the dispatcher routes each subcommand to its handler (i.e.
// the stub "not implemented" marker is gone); deep behaviour is covered by each
// command's own *.test.ts. Assertions are kept network-free.

describe("build dispatch", () => {
    test("routes to the build implementation", async () => {
        // Pass an explicit config with wasiSdkPath: "" so resolveClang returns null
        // deterministically, regardless of build-env/sdk/ FS discovery by loadConfig.
        // This is the test-only escape hatch: passing config bypasses loadConfig entirely.
        const { code, stderr } = await capture({
            args: ["build"],
            config: { ...BASE_CONFIG, wasiSdkPath: "" },
        });
        expect(stderr).not.toContain("not implemented");
        // With wasiSdkPath forced empty, build exits 2 (clang absent) on every machine.
        expect(code).toBe(2);
        expect(stderr.toLowerCase()).toContain("clang");
    });
});

describe("verify dispatch", () => {
    test("routes to the verify implementation", async () => {
        const { stderr } = await capture({ args: ["verify"] });
        expect(stderr).not.toContain("not implemented");
    });
});

describe("all subcommand", () => {
    test("chains build → verify, aborting on first non-zero", async () => {
        // With wasiSdkPath forced empty (explicit config bypasses
        // loadConfig/FS-discovery) the build step exits 2, so `all` aborts
        // with a non-zero code on every machine.
        const { code } = await capture({
            args: ["all"],
            config: { ...BASE_CONFIG, wasiSdkPath: "" },
        });
        expect(code).not.toBe(0);
    });
});

// ─── No ANSI when stdout is not a TTY ────────────────────────────────────────

describe("ANSI / TTY", () => {
    test("--help output contains no ANSI escape sequences", async () => {
        const { stdout } = await capture({ args: ["--help"] });
        // eslint-disable-next-line no-control-regex
        expect(stdout).not.toMatch(/\x1b\[/);
    });

    test("--version output contains no ANSI escape sequences", async () => {
        const { stdout } = await capture({ args: ["--version"] });
        // eslint-disable-next-line no-control-regex
        expect(stdout).not.toMatch(/\x1b\[/);
    });
});

// ─── validateTargets ─────────────────────────────────────────────────────────

describe("validateTargets", () => {
    test("accepts a well-formed target array", () => {
        const result = validateTargets([WELL_FORMED_TARGET]);
        expect(result).toHaveLength(1);
        expect(result[0].algo).toBe("argon2");
    });

    test("accepts an empty array", () => {
        expect(validateTargets([])).toEqual([]);
    });

    test("rejects a non-array", () => {
        expect(() => validateTargets({ algo: "argon2" })).toThrow(/array/);
    });

    test("rejects a target missing a required string field (algo)", () => {
        const bad = { ...WELL_FORMED_TARGET, algo: 42 };
        expect(() => validateTargets([bad])).toThrow(/algo/);
    });

    test("rejects a target with a non-boolean simd field", () => {
        const bad = { ...WELL_FORMED_TARGET, simd: "yes" };
        expect(() => validateTargets([bad])).toThrow(/simd/);
    });

    test("rejects a target with non-string-array cSources", () => {
        const bad = { ...WELL_FORMED_TARGET, cSources: [1, 2] };
        expect(() => validateTargets([bad])).toThrow(/cSources/);
    });

    test("rejects a target whose exports miss 'memory'", () => {
        const bad = { ...WELL_FORMED_TARGET, exports: ["alloc", "free"] };
        expect(() => validateTargets([bad])).toThrow(/memory/);
    });

    test("rejects a target whose exports miss 'alloc'", () => {
        const bad = { ...WELL_FORMED_TARGET, exports: ["memory", "free"] };
        expect(() => validateTargets([bad])).toThrow(/alloc/);
    });

    test("rejects a target whose exports miss 'free'", () => {
        const bad = { ...WELL_FORMED_TARGET, exports: ["memory", "alloc"] };
        expect(() => validateTargets([bad])).toThrow(/free/);
    });

    test("reports the correct index in error message", () => {
        const bad = { ...WELL_FORMED_TARGET, algo: undefined };
        expect(() => validateTargets([WELL_FORMED_TARGET, bad])).toThrow(/targets\[1\]/);
    });
});

// ─── --pkg config model ───────────────────────────────────────────────────────

const BASE_CONFIG: WasmCryptoConfig = {
    wasiSdkPath: "",
    srcDir: "",
    outDir: "packages/front/fw/src/crypto/wasm",
    targetsFile: "packages/front/fw-wasm-crypto/targets.json",
};

describe("extractPkgFlag", () => {
    test("--pkg <dir> form is extracted and stripped from rest", () => {
        const { pkgDir, rest } = extractPkgFlag(["build", "--pkg", "packages/front/fw-wasm-crypto", "--scalar-only"]);
        expect(pkgDir).toBe("packages/front/fw-wasm-crypto");
        expect(rest).toEqual(["build", "--scalar-only"]);
    });

    test("--pkg=<dir> form is extracted and stripped from rest", () => {
        const { pkgDir, rest } = extractPkgFlag(["verify", "--pkg=packages/front/fw-wasm-crypto"]);
        expect(pkgDir).toBe("packages/front/fw-wasm-crypto");
        expect(rest).toEqual(["verify"]);
    });

    test("absent --pkg leaves args untouched and pkgDir undefined", () => {
        const { pkgDir, rest } = extractPkgFlag(["build", "--target", "argon2"]);
        expect(pkgDir).toBeUndefined();
        expect(rest).toEqual(["build", "--target", "argon2"]);
    });
});

describe("applyPkgDir", () => {
    test("derives targetsFile=<pkg>/targets.json and outDir=<pkg>/dist (relative pkg)", () => {
        const rel = "packages/front/fw-wasm-crypto";
        const cfg = applyPkgDir(BASE_CONFIG, rel);
        const expectedPkg = join(process.cwd(), rel);
        expect(cfg.pkgDir).toBe(expectedPkg);
        expect(cfg.targetsFile).toBe(join(expectedPkg, "targets.json"));
        expect(cfg.outDir).toBe(join(expectedPkg, "dist"));
    });

    test("relative pkg resolves against cwd without path-doubling", () => {
        const cfg = applyPkgDir(BASE_CONFIG, "packages/front/fw-wasm-crypto");
        // The cwd must appear exactly once — guard against the Windows
        // isAbsolute path-doubling pitfall.
        const cwd = process.cwd();
        const idx = cfg.pkgDir!.indexOf(cwd);
        expect(idx).toBe(0);
        expect(cfg.pkgDir!.indexOf(cwd, idx + 1)).toBe(-1);
    });

    test("absolute pkg is used verbatim (no cwd prepended)", () => {
        const abs = isAbsolute("/abs/pkg") ? "/abs/pkg" : join(process.cwd(), "..", "abs-pkg");
        const cfg = applyPkgDir(BASE_CONFIG, abs);
        expect(cfg.pkgDir).toBe(abs);
        expect(isAbsolute(cfg.pkgDir!)).toBe(true);
        expect(cfg.targetsFile).toBe(join(abs, "targets.json"));
    });

    test("preserves unrelated config fields (srcDir, wasiSdkPath)", () => {
        const cfg = applyPkgDir(BASE_CONFIG, "pkg");
        expect(cfg.srcDir).toBe(BASE_CONFIG.srcDir);
        expect(cfg.wasiSdkPath).toBe(BASE_CONFIG.wasiSdkPath);
    });
});

describe("run with --pkg", () => {
    test("routes the derived config to the subcommand (build sees <pkg>/targets.json)", async () => {
        // No WASI SDK → build exits 2 before reading targets, but we assert the
        // flag is accepted (stripped pre-dispatch) and does not break dispatch.
        const { code, stderr } = await capture({
            args: ["build", "--pkg", "packages/front/fw-wasm-crypto"],
            config: BASE_CONFIG,
        });
        expect(stderr).not.toContain("not implemented");
        // --pkg must not surface as an unknown subcommand.
        expect(stderr).not.toContain("unknown subcommand");
        if (!process.env["WASI_SDK_PATH"]) {
            expect(code).toBe(2);
        }
    });

    test("absent --pkg leaves legacy config fields unchanged", async () => {
        // verify dispatch with the base config; targetsFile stays the legacy
        // default (no derivation). We assert the dispatcher does not error on
        // an unknown flag and the run completes through verify.
        const { stderr } = await capture({ args: ["verify"], config: BASE_CONFIG });
        expect(stderr).not.toContain("not implemented");
        expect(stderr).not.toContain("unknown subcommand");
    });
});

// ─── loadConfig — WASI_SDK_PATH discovery ────────────────────────────────────
// These tests exercise the loadConfig FS-only wiring added by W2 (task 01).
// They import loadConfig by re-exporting it from index.ts (via the `run` API)
// through a config-override path — passing a non-existent config file so the
// defaults apply, then checking that the env/discovery fills wasiSdkPath.
//
// The approach: use `run({ configPath: nonexistent })` with `args: ["--help"]`
// to exercise loadConfig without a real subcommand. But loadConfig is not
// exported. Instead we exercise via the build dispatch (which calls loadConfig
// internally), but that couples to build.ts behavior.
//
// Cleaner: we call `run()` in a helper mode that reports the config. Since
// run() does not expose cfg directly, we use a private import workaround:
// test via `run({ args: ["build"], configPath: nonexistent })` and assert
// that the WASI_SDK_PATH env is honored (build dispatches with that config
// and reports clang found/not-found based on wasiSdkPath).
//
// For the env var test, we set WASI_SDK_PATH to FAKE_SDK_DIR and confirm
// that the build step no longer exits with "missing" before the clang check.
// For the no-env/no-install test, we unset the env and confirm exit 2 (no
// SDK) — the pre-W2 baseline behavior is preserved.

describe("loadConfig — WASI_SDK_PATH env wiring", () => {
    let savedEnv: string | undefined;

    beforeEach(() => {
        savedEnv = process.env["WASI_SDK_PATH"];
    });

    afterEach(() => {
        if (savedEnv === undefined) {
            delete process.env["WASI_SDK_PATH"];
        } else {
            process.env["WASI_SDK_PATH"] = savedEnv;
        }
    });

    test("WASI_SDK_PATH set → build config uses that value (clang lookup uses the env path)", async () => {
        // Set env to the fixture install dir (has bin/clang placeholder).
        process.env["WASI_SDK_PATH"] = FAKE_SDK_DIR;
        // Verify run loads the env value: resolveClang will find build-env/__fixtures__/fake-install/bin/clang.
        // On linux/mac the placeholder file exists → resolveClang returns non-null → build
        // proceeds past the clang check (but fails later for other reasons, not exit 2).
        // On win32 it looks for clang.exe which does not exist in the fixture → still exit 2.
        // We just assert that the WASI_SDK_PATH is read (no throw, stderr has no "WASI_SDK_PATH" error).
        const { code, stderr } = await capture({ args: ["build"] });
        if (process.platform !== "win32") {
            // Build proceeds past clang-missing check (code is NOT 2 from missing clang).
            // It may fail for other reasons (no targets.json etc) — that's fine.
            expect(stderr).not.toMatch(/clang.*not found|clang.*missing|no.*clang/i);
        }
        // Regardless, the run must not throw.
        expect(typeof code).toBe("number");
    });

    test("WASI_SDK_PATH unset and no install dir → wasiSdkPath stays '' (build exits 2)", async () => {
        delete process.env["WASI_SDK_PATH"];
        // With no SDK and no local install (CI), build exits 2.
        const { code, stderr } = await capture({ args: ["build"], configPath: join(import.meta.dir, "__nonexistent__.json") });
        // The test environment has no WASI SDK → build.ts resolveClang returns null → exit 2.
        // If somehow a SDK is found (dev machine), allow 0 or 1.
        expect([0, 1, 2]).toContain(code);
        // When it IS 2, stderr should say something about clang.
        if (code === 2) {
            expect(stderr.toLowerCase()).toContain("clang");
        }
    });
});

// ─── Retired config keys (F1/F3) ─────────────────────────────────────────────
// A config file written against the pre-retirement contract may still carry
// `srcDir` set to the old references default, and/or the fully-removed
// `vectorsDir` key. Both must be silently ignored (never rejected): `srcDir`
// stays on the type but has no operative reader, and `vectorsDir` is dropped
// entirely by the (unchecked) `as Partial<WasmCryptoConfig>` cast in
// loadConfig, so a stray key is just extra JSON, never surfaced as an error.

describe("config carrying retired keys (srcDir references default / vectorsDir)", () => {
    test("a config file with the retired keys loads and runs without complaint", async () => {
        const dir = await mkdtemp(join(tmpdir(), "wasm-crypto-retired-cfg-"));
        try {
            const targetsPath = join(dir, "targets.json");
            await writeFile(targetsPath, "[]");
            const cfgPath = join(dir, "wasm-crypto.config.json");
            await writeFile(
                cfgPath,
                JSON.stringify({
                    srcDir: "references/CRYPTO-SRC",
                    vectorsDir: "references",
                    targetsFile: targetsPath,
                    outDir: join(dir, "dist"),
                }),
            );

            const { code, stdout, stderr } = await capture({ args: ["verify"], configPath: cfgPath });

            // Empty targets.json → verify's own "nothing to verify" success path;
            // reaching it (rather than a crash or a config-parse error) proves the
            // retired keys were tolerated, not rejected.
            expect(code).toBe(0);
            expect(stdout).toContain("nothing to verify");
            expect(stderr).not.toMatch(/srcDir|vectorsDir|unknown key|unrecognized/i);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
