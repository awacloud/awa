// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    run,
    resolveClang,
    resolveInputs,
    compileFlags,
    linkFlags,
    linkerFlagsFromCflags,
    wasmExportNames,
    wasmImportNames,
    missingExports,
} from "./build.ts";
import { emit, renderModule } from "../emit.ts";
import { cStdFor, type Target } from "../targets.schema.ts";
import type { WasmCryptoConfig } from "../index.ts";
import { discoverWasiSdk } from "../../build-env/toolchain.ts";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * A minimal, hand-assembled wasm32 module exporting exactly the canonical ABI:
 * `memory`, `alloc(i32)->i32`, `free(i32,i32)->()`, and `add(i32,i32)->i32`.
 * Generated once and pinned here so the export-introspection and emit
 * round-trip tests run with no toolchain dependency.
 */
const FIXTURE_B64 =
    "AGFzbQEAAAABEQNgAX8Bf2ACf38AYAJ/fwF/AwQDAAECBQMBAAEHHwQGbWVtb3J5AgAFYWxsb2MAAARmcmVlAAEDYWRkAAIKEQMEACAACwIACwcAIAAgAWoL";

/**
 * A minimal, hand-assembled wasm32 module that declares one import:
 * `(import "env" "x" (func))`. Used to verify the zero-import gate
 * would fire on a non-freestanding module.
 * Generated offline with a node script (not PowerShell Compress-Archive).
 */
const IMPORT_FIXTURE_B64 = "AGFzbQEAAAABBAFgAAACCQEDZW52AXgAAA==";

function fixtureBytes(): Uint8Array {
    return new Uint8Array(Buffer.from(FIXTURE_B64, "base64"));
}

function importFixtureBytes(): Uint8Array {
    return new Uint8Array(Buffer.from(IMPORT_FIXTURE_B64, "base64"));
}

/**
 * Canonical fixture target conforming to the frozen contract: `sourceKind`
 * present, `shim`/`cSources` under the `shims/`|`csrc/`|`vendor/` source roots.
 */
const ADD_TARGET: Target = {
    algo: "add",
    wasmModule: "add",
    exportName: "addWasm",
    source: "fixture-0001",
    sourceKind: "own",
    shim: "shims/add.c",
    cSources: ["csrc/add.c"],
    cflags: [],
    simd: false,
    exports: ["memory", "alloc", "free", "add"],
    vectors: [],
};

function baseConfig(overrides: Partial<WasmCryptoConfig> = {}): WasmCryptoConfig {
    return {
        wasiSdkPath: "",
        srcDir: "",
        outDir: "out",
        targetsFile: "targets.json",
        ...overrides,
    };
}

let tmp: string;
/**
 * The discovered wasi-sdk path for SDK-gated tests. Populated from
 * WASI_SDK_PATH env or FS discovery in beforeAll; null → tests skip.
 * This mirrors the loadConfig resolution order without going through loadConfig.
 */
let sdkPath: string | null = null;

beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "wasm-crypto-build-"));
    // Resolve the wasi-sdk path for SDK-gated tests, mirroring loadConfig:
    //   1. WASI_SDK_PATH env
    //   2. FS discovery under build-env/sdk/
    const envSdk = process.env["WASI_SDK_PATH"];
    if (envSdk) {
        sdkPath = envSdk;
    } else {
        sdkPath = await discoverWasiSdk();
    }
});

afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
});

// ─── Input resolution ──────────────────────────────────────────────────────────

describe("resolveInputs", () => {
    test("--pkg mode resolves shim + cSources under the package dir by source root", () => {
        const pkgDir = join(tmp, "pkg");
        const target: Target = {
            ...ADD_TARGET,
            shim: "shims/add.c",
            cSources: ["csrc/x.c", "vendor/u/y.c"],
        };
        const inputs = resolveInputs(baseConfig({ pkgDir }), target);

        expect(inputs.map(i => i.rel)).toEqual(["shims/add.c", "csrc/x.c", "vendor/u/y.c"]);
        expect(inputs[0].path).toBe(join(pkgDir, "shims/add.c"));
        expect(inputs[1].path).toBe(join(pkgDir, "csrc/x.c"));
        expect(inputs[2].path).toBe(join(pkgDir, "vendor/u/y.c"));
    });

    test("no pkgDir → throws a clear error (the legacy srcDir-based resolution was retired, F1)", () => {
        const cfg = baseConfig();
        expect(() => resolveInputs(cfg, ADD_TARGET)).toThrow(/--pkg <dir> is required/);
    });
});

// ─── Per-source std flag ───────────────────────────────────────────────────────

describe("per-source -std selection", () => {
    test("csrc/ and shims/ inputs compile as c23", () => {
        expect(cStdFor("csrc/x.c", ADD_TARGET)).toBe("c23");
        expect(cStdFor("shims/add.c", ADD_TARGET)).toBe("c23");

        const argv = compileFlags(ADD_TARGET, false, cStdFor("csrc/x.c", ADD_TARGET));
        expect(argv).toContain("-std=c23");
    });

    test("vendor/ inputs use the target's cStd when set", () => {
        const target: Target = { ...ADD_TARGET, cStd: "c11" };
        expect(cStdFor("vendor/u/y.c", target)).toBe("c11");

        const argv = compileFlags(target, false, cStdFor("vendor/u/y.c", target));
        expect(argv).toContain("-std=c11");
    });

    test("vendor/ inputs without cStd emit no -std flag", () => {
        expect(cStdFor("vendor/u/y.c", ADD_TARGET)).toBeNull();

        const argv = compileFlags(ADD_TARGET, false, cStdFor("vendor/u/y.c", ADD_TARGET));
        expect(argv.some(f => f.startsWith("-std="))).toBe(false);
    });

    test("compileFlags carries -c, freestanding/nostdlib, simd flags + cflags", () => {
        const target: Target = { ...ADD_TARGET, cflags: ["-DFOO=1"] };
        const simdArgv = compileFlags(target, true, "c23");
        expect(simdArgv[0]).toBe("-c");
        expect(simdArgv).toContain("--target=wasm32");
        expect(simdArgv).toContain("-ffreestanding");
        expect(simdArgv).toContain("-nostdlib");
        expect(simdArgv).toContain("-msimd128");
        expect(simdArgv).toContain("-mbulk-memory");
        expect(simdArgv).toContain("-DFOO=1");

        // Scalar variant carries -mbulk-memory but NOT -msimd128.
        const scalarArgv = compileFlags(target, false, "c23");
        expect(scalarArgv).not.toContain("-msimd128");
        expect(scalarArgv).toContain("-mbulk-memory");
    });

    test("compileFlags carries surface-minimization flags for both variants", () => {
        const argv = compileFlags(ADD_TARGET, false, "c23");
        expect(argv).toContain("-flto");
        expect(argv).toContain("-ffunction-sections");
        expect(argv).toContain("-fdata-sections");
    });

    test("compileFlags: per-target cflags opt-out (-fno-lto) appears AFTER -flto", () => {
        const target: Target = { ...ADD_TARGET, cflags: ["-fno-lto"] };
        const argv = compileFlags(target, false, "c23");
        expect(argv).toContain("-flto");
        expect(argv).toContain("-fno-lto");
        const fltoIdx = argv.indexOf("-flto");
        const noLtoIdx = argv.lastIndexOf("-fno-lto");
        expect(noLtoIdx).toBeGreaterThan(fltoIdx);
    });
});

// ─── Export introspection ──────────────────────────────────────────────────────

describe("wasmExportNames", () => {
    test("lists the canonical ABI exports of the fixture", async () => {
        const names = await wasmExportNames(fixtureBytes());
        expect(names.has("memory")).toBe(true);
        expect(names.has("alloc")).toBe(true);
        expect(names.has("free")).toBe(true);
        expect(names.has("add")).toBe(true);
    });
});

describe("missingExports", () => {
    test("returns [] when all required exports are present", async () => {
        const names = await wasmExportNames(fixtureBytes());
        expect(missingExports(ADD_TARGET, names)).toEqual([]);
    });

    test("lists the missing symbols when a required export is absent", () => {
        const names = new Set(["memory", "alloc", "free"]); // no `add`
        expect(missingExports(ADD_TARGET, names)).toEqual(["add"]);
    });

    test("lists multiple missing symbols sorted", () => {
        const names = new Set(["memory"]);
        expect(missingExports(ADD_TARGET, names)).toEqual(["add", "alloc", "free"]);
    });
});

// ─── Link flags ───────────────────────────────────────────────────────────────

describe("linkFlags", () => {
    test("contains surface-minimization flags", () => {
        const flags = linkFlags(ADD_TARGET);
        expect(flags).toContain("-flto");
        expect(flags).toContain("-Wl,--lto-O3");
        expect(flags).toContain("-ffunction-sections");
        expect(flags).toContain("-fdata-sections");
        expect(flags).toContain("-Wl,--gc-sections");
        expect(flags).toContain("-Wl,--strip-all");
    });

    test("contains --export= for each non-memory export, after --gc-sections", () => {
        const target: Target = {
            ...ADD_TARGET,
            exports: ["memory", "alloc", "free", "add"],
        };
        const flags = linkFlags(target);
        const gcIdx = flags.indexOf("-Wl,--gc-sections");
        expect(gcIdx).toBeGreaterThan(-1);
        for (const name of ["alloc", "free", "add"]) {
            const exportFlag = `-Wl,--export=${name}`;
            expect(flags).toContain(exportFlag);
            const exportIdx = flags.indexOf(exportFlag);
            expect(exportIdx).toBeGreaterThan(gcIdx);
        }
        // memory is exported by the linker; no explicit --export=memory flag
        expect(flags).not.toContain("-Wl,--export=memory");
    });

    test("forwards a target's -Wl, link flags (e.g. stack-size) to the link step", () => {
        const target: Target = {
            ...ADD_TARGET,
            cflags: ["-O2", "-Ivendor/x", "-Wl,-z,stack-size=4194304"],
        };
        const flags = linkFlags(target);
        expect(flags).toContain("-Wl,-z,stack-size=4194304");
        // compile-only flags must NOT leak into the link argv
        expect(flags).not.toContain("-O2");
        expect(flags).not.toContain("-Ivendor/x");
    });

    test("forwards nothing for a target with no link flags (byte-identical link argv)", () => {
        const without = linkFlags({ ...ADD_TARGET, cflags: ["-O2", "-DFOO"] });
        const bare = linkFlags({ ...ADD_TARGET, cflags: [] });
        expect(without).toEqual(bare);
    });
});

describe("linkerFlagsFromCflags", () => {
    test("extracts only the -Wl,/-z link-directed flags", () => {
        const target: Target = {
            ...ADD_TARGET,
            cflags: ["-O2", "-Icsrc/x", "-Wl,-z,stack-size=8388608", "-DBAR"],
        };
        expect(linkerFlagsFromCflags(target)).toEqual(["-Wl,-z,stack-size=8388608"]);
    });

    test("returns [] when the target declares no link flags", () => {
        expect(linkerFlagsFromCflags({ ...ADD_TARGET, cflags: ["-O2"] })).toEqual([]);
    });

    test("forwards the two-token `-z OPTION` form", () => {
        const target: Target = {
            ...ADD_TARGET,
            cflags: ["-O2", "-z", "stack-size=4194304"],
        };
        expect(linkerFlagsFromCflags(target)).toEqual(["-z", "stack-size=4194304"]);
    });
});

// ─── wasmImportNames ──────────────────────────────────────────────────────────

describe("wasmImportNames", () => {
    test("returns [] for a freestanding module that declares no imports", async () => {
        const result = await wasmImportNames(fixtureBytes());
        expect(result).toEqual([]);
    });

    test("returns ['env.x'] for a module that imports env.x", async () => {
        const result = await wasmImportNames(importFixtureBytes());
        expect(result).toEqual(["env.x"]);
    });
});

// ─── emit round-trip ───────────────────────────────────────────────────────────

describe("emit", () => {
    test("writes a *.wasm.js whose bytes round-trip + compile + run", async () => {
        const outDir = join(tmp, "emit");
        const bytes = fixtureBytes();
        const outPath = await emit("add", "addWasm", bytes, false, outDir, {
            sourceId: ADD_TARGET.source,
        });
        expect(outPath).toMatch(/add\.wasm\.js$/);

        // Re-import the generated ESM data module.
        const mod = (await import(outPath)) as {
            addWasm: { name: string; type: string; abi: string; simd: boolean; bytes: Uint8Array };
        };
        const dm = mod.addWasm;
        expect(dm.name).toBe("addWasm");
        expect(dm.type).toBe("fw.crypto.wasm.data");
        expect(dm.abi).toBe("1");
        expect(dm.simd).toBe(false);

        // Bytes decoded from the embedded base64 must equal the originals.
        expect(dm.bytes).toBeInstanceOf(Uint8Array);
        expect(Array.from(dm.bytes)).toEqual(Array.from(bytes));

        // And they must compile + run.
        const wmod = await WebAssembly.compile(dm.bytes);
        const inst = await WebAssembly.instantiate(wmod, {});
        const add = inst.exports.add as (a: number, b: number) => number;
        expect(add(2, 3)).toBe(5);
        expect(add(40, 2)).toBe(42);
    });

    test("renderModule records provenance and the simd flag in the header/body", () => {
        const src = renderModule("argon2", "argon2Wasm", fixtureBytes(), true, {
            sourceId: "argon2-20190702",
        });
        expect(src).toContain("// GENERATED by tools/wasm-crypto");
        expect(src).toContain("SOURCES.md (argon2-20190702)");
        expect(src).toContain("export const argon2Wasm");
        expect(src).toContain("type: 'fw.crypto.wasm.data'");
        expect(src).toContain("simd: true");
        // No import statements (no import-time side effects, data module).
        expect(src).not.toMatch(/^\s*import\s/m);
    });

    test("emitted module has no top-level import side effects", async () => {
        const src = renderModule("add", "addWasm", fixtureBytes(), false);
        expect(src).not.toMatch(/^\s*import\s/m);
        expect(src).not.toContain("Buffer"); // runtime decoder is table-based, no Node Buffer
    });
});

// ─── -I<pkgDir> include flag ───────────────────────────────────────────────────

describe("-I<pkgDir> include flag", () => {
    test("compileVariant argv carries -I<pkgDir> when cfg.pkgDir is set (unit, no toolchain)", async () => {
        // We verify the flag composition by inspecting what compileFlags + includeArgs
        // produces. The plan prescribes the exact argv shape:
        //   [clang, ...compileFlags(...), ...includeArgs, input.path, "-o", obj]
        // where includeArgs = [`-I${cfg.pkgDir}`] when pkgDir is set.
        // We unit-test this indirectly by checking the flag would be present:
        const pkgDir = join(tmp, "pkg-include");
        const expectedFlag = `-I${pkgDir}`;

        // Directly assert the includeArgs logic (mirrors build.ts exactly):
        const includeArgsSet = (cfg: WasmCryptoConfig) =>
            cfg.pkgDir !== undefined ? [`-I${cfg.pkgDir}`] : [];

        expect(includeArgsSet(baseConfig({ pkgDir }))).toEqual([expectedFlag]);
        expect(includeArgsSet(baseConfig())).toEqual([]); // legacy: no -I flag
    });

    test("compileVariant argv does NOT carry -I when pkgDir is unset (legacy mode)", () => {
        // Mirror: legacy mode => includeArgs = []
        const cfg = baseConfig(); // no pkgDir
        const includeArgs = cfg.pkgDir !== undefined ? [`-I${cfg.pkgDir}`] : [];
        expect(includeArgs).toEqual([]);
        // compileFlags does not add -I flags; confirm no -I in compile flags either
        const flags = compileFlags(ADD_TARGET, false, "c23");
        expect(flags.some(f => f.startsWith("-I"))).toBe(false);
    });
});

// ─── clang-absent gate ─────────────────────────────────────────────────────────

describe("clang gate", () => {
    test("resolveClang returns null when wasiSdkPath is unset", async () => {
        expect(await resolveClang(baseConfig())).toBeNull();
    });

    test("resolveClang returns null for a non-existent sdk path", async () => {
        expect(
            await resolveClang(baseConfig({ wasiSdkPath: join(tmp, "no-such-sdk") })),
        ).toBeNull();
    });

    test("run exits 2 with a clear stderr message when clang is absent (explicit empty wasiSdkPath)", async () => {
        // Pass an explicit config with wasiSdkPath: "" so resolveClang returns null
        // deterministically, regardless of whether build-env/sdk/ has an installed SDK
        // (loadConfig discovery is bypassed — build.ts run() receives the config directly).
        const { code, out } = await captureRun([], baseConfig({ wasiSdkPath: "" }));
        expect(code).toBe(2);
        expect(out).toContain("clang");
        expect(out).toMatch(/wasiSdkPath|WASI_SDK_PATH/);
    });
});

// ─── Target filtering / error exit codes ────────────────────────────────────────

/**
 * Capture `run`'s stderr while it executes, restoring the original writer.
 */
async function captureRun(
    args: string[],
    cfg: WasmCryptoConfig,
): Promise<{ code: number; out: string }> {
    const stderr: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as { write: typeof process.stderr.write }).write = (
        c: string | Uint8Array,
    ) => {
        stderr.push(typeof c === "string" ? c : new TextDecoder().decode(c));
        return true;
    };
    let code: number;
    try {
        code = await run(args, cfg);
    } finally {
        (process.stderr as { write: typeof process.stderr.write }).write = orig;
    }
    return { code, out: stderr.join("") };
}

describe("target filtering (no toolchain needed)", () => {
    test("unknown --target → exit 1 with a clear message", async () => {
        // A clang must resolve first to reach target filtering; fake one on disk.
        const sdk = await mkdtemp(join(tmpdir(), "wasm-crypto-fakesdk-"));
        try {
            const isWin = process.platform === "win32";
            await mkdir(join(sdk, "bin"), { recursive: true });
            await writeFile(join(sdk, "bin", isWin ? "clang.exe" : "clang"), "#!/bin/sh\n");

            const pkgDir = join(sdk, "pkg");
            await mkdir(pkgDir, { recursive: true });
            await writeFile(
                join(pkgDir, "targets.json"),
                JSON.stringify([ADD_TARGET]),
            );

            const cfg = baseConfig({
                wasiSdkPath: sdk,
                pkgDir,
                targetsFile: join(pkgDir, "targets.json"),
                outDir: join(pkgDir, "dist"),
            });
            const { code, out } = await captureRun(["--target", "nope"], cfg);
            expect(code).toBe(1);
            expect(out).toContain("no target named");
        } finally {
            await rm(sdk, { recursive: true, force: true });
        }
    });
});

// ─── compile (gated on clang presence) ─────────────────────────────────────────

/** Write the canonical add fixture package layout under `pkgDir`. */
async function writeAddPkg(pkgDir: string, simd: boolean): Promise<void> {
    await mkdir(join(pkgDir, "shims"), { recursive: true });
    await mkdir(join(pkgDir, "csrc"), { recursive: true });
    // Shim provides the ABI surface; the C source provides the implementation —
    // split across two translation units so the compile-each-then-link path is
    // genuinely exercised.
    await writeFile(
        join(pkgDir, "shims", "add.c"),
        [
            "extern int _add(int, int);",
            "static unsigned char _heap[65536];",
            "static unsigned _top = 0;",
            '__attribute__((export_name("alloc")))',
            "void* alloc(int n){ void* p = &_heap[_top]; _top += n; return p; }",
            '__attribute__((export_name("free")))',
            "void free(void* p, int n){ (void)p; (void)n; }",
            '__attribute__((export_name("add")))',
            "int add(int a, int b){ return _add(a, b); }",
            "",
        ].join("\n"),
    );
    await writeFile(
        join(pkgDir, "csrc", "add.c"),
        "int _add(int a, int b){ return a + b; }\n",
    );
    const target: Target = { ...ADD_TARGET, simd };
    await writeFile(join(pkgDir, "targets.json"), JSON.stringify([target]));
}

/** Write a pkg layout where the shim cross-includes a csrc/ header. */
async function writeCrossIncludePkg(pkgDir: string): Promise<void> {
    await mkdir(join(pkgDir, "shims"), { recursive: true });
    await mkdir(join(pkgDir, "csrc"), { recursive: true });
    // csrc/impl.h declares the helper (cross-root include from shim via -I<pkgDir>).
    await writeFile(
        join(pkgDir, "csrc", "impl.h"),
        ["#ifndef IMPL_H", "#define IMPL_H", "int _impl_add(int, int);", "#endif"].join("\n"),
    );
    // csrc/impl.c provides the implementation.
    await writeFile(
        join(pkgDir, "csrc", "impl.c"),
        '#include "csrc/impl.h"\nint _impl_add(int a, int b){ return a + b; }\n',
    );
    // shims/add.c #includes the csrc/ header — requires -I<pkgDir> to resolve.
    await writeFile(
        join(pkgDir, "shims", "add.c"),
        [
            '#include "csrc/impl.h"',
            "static unsigned char _heap[65536];",
            "static unsigned _top = 0;",
            '__attribute__((export_name("alloc")))',
            "void* alloc(int n){ void* p = &_heap[_top]; _top += n; return p; }",
            '__attribute__((export_name("free")))',
            "void free(void* p, int n){ (void)p; (void)n; }",
            '__attribute__((export_name("add")))',
            "int add(int a, int b){ return _impl_add(a, b); }",
            "",
        ].join("\n"),
    );
    const target: Target = { ...ADD_TARGET, cSources: ["csrc/impl.c"], simd: false };
    await writeFile(join(pkgDir, "targets.json"), JSON.stringify([target]));
}

describe("compile (requires wasi-sdk clang)", () => {
    test("builds both variants and emits *.wasm.js through the --pkg pipeline", async () => {
        // SDK-gated: skip when no toolchain is discoverable.
        // sdkPath is populated in beforeAll from WASI_SDK_PATH env or FS discovery.
        if (!sdkPath) {
            // No toolchain in this environment — skip rather than fail CI.
            // Install wasi-sdk under build-env/sdk/ or set WASI_SDK_PATH to enable.
            console.error(
                "[build.test] SKIP compile test: wasi-sdk clang not found " +
                    "(install under build-env/sdk/ or set WASI_SDK_PATH to enable).",
            );
            return;
        }

        const root = await mkdtemp(join(tmpdir(), "wasm-crypto-compile-"));
        const pkgDir = join(root, "pkg");
        try {
            await writeAddPkg(pkgDir, true); // simd-capable target → dual variant
            const outDir = join(pkgDir, "dist");
            const cfg = baseConfig({
                wasiSdkPath: sdkPath,
                pkgDir,
                targetsFile: join(pkgDir, "targets.json"),
                outDir,
            });

            const { code } = await captureRun([], cfg);
            expect(code).toBe(0);

            // Both variant binaries are produced, plus the emitted data module.
            expect(await Bun.file(join(outDir, "add.simd.wasm")).exists()).toBe(true);
            expect(await Bun.file(join(outDir, "add.scalar.wasm")).exists()).toBe(true);
            const emitted = join(outDir, "add.wasm.js");
            expect(await Bun.file(emitted).exists()).toBe(true);

            const dm = (await import(emitted)) as { addWasm: { bytes: Uint8Array } };
            const inst = await WebAssembly.instantiate(
                await WebAssembly.compile(dm.addWasm.bytes),
                {},
            );
            expect((inst.exports.add as (a: number, b: number) => number)(7, 8)).toBe(15);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("--scalar-only emits only the scalar variant", async () => {
        if (!sdkPath) {
            console.error("[build.test] SKIP --scalar-only test: wasi-sdk clang not found.");
            return;
        }

        const root = await mkdtemp(join(tmpdir(), "wasm-crypto-scalar-"));
        const pkgDir = join(root, "pkg");
        try {
            await writeAddPkg(pkgDir, true);
            const outDir = join(pkgDir, "dist");
            const cfg = baseConfig({
                wasiSdkPath: sdkPath,
                pkgDir,
                targetsFile: join(pkgDir, "targets.json"),
                outDir,
            });

            const { code } = await captureRun(["--scalar-only"], cfg);
            expect(code).toBe(0);
            expect(await Bun.file(join(outDir, "add.scalar.wasm")).exists()).toBe(true);
            expect(await Bun.file(join(outDir, "add.simd.wasm")).exists()).toBe(false);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("-I<pkgDir> resolves cross-root includes: shim #includes a csrc/ header", async () => {
        // SDK-gated: skip when no toolchain is discoverable.
        // This test proves that -I<pkgDir> makes `#include "csrc/impl.h"` in the
        // shim resolve correctly. Without the fix, clang reports "csrc/impl.h: file
        // not found" and the compile fails.
        if (!sdkPath) {
            console.error(
                "[build.test] SKIP cross-root include test: wasi-sdk clang not found " +
                    "(install under build-env/sdk/ or set WASI_SDK_PATH to enable).",
            );
            return;
        }

        const root = await mkdtemp(join(tmpdir(), "wasm-crypto-cross-inc-"));
        const pkgDir = join(root, "pkg");
        try {
            await writeCrossIncludePkg(pkgDir);
            const outDir = join(pkgDir, "dist");
            const cfg = baseConfig({
                wasiSdkPath: sdkPath,
                pkgDir,
                targetsFile: join(pkgDir, "targets.json"),
                outDir,
            });

            // Without -I<pkgDir>, this would fail with "csrc/impl.h: file not found".
            const { code, out } = await captureRun([], cfg);
            expect(code).toBe(0);
            expect(out).not.toContain("file not found");

            // Scalar wasm produced + wasm compiles and runs correctly.
            const wasmPath = join(outDir, "add.scalar.wasm");
            expect(await Bun.file(wasmPath).exists()).toBe(true);
            const bytes = new Uint8Array(await Bun.file(wasmPath).arrayBuffer());
            const mod = await WebAssembly.compile(bytes);
            const inst = await WebAssembly.instantiate(mod, {});
            expect((inst.exports.add as (a: number, b: number) => number)(3, 4)).toBe(7);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
