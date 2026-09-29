// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for copy.ts.
 *
 * Fixture packages are hand-built under a temp dir per test (tiny fake
 * `.wasm` byte content — `copy` never parses wasm, so the bytes only need to
 * be distinguishable and hashable). Every test calls `run()` in-process
 * (never spawns a child process) for real coverage; the top-level `index.ts`
 * dispatch is separately exercised via its own `run({args:[...]})`.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { run as runCopy, renderManifest, parseManifest, type ManifestRow } from "./copy.ts";
import { run as runIndex, applyPkgDir } from "../index.ts";
import type { WasmCryptoConfig } from "../index.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

function baseConfig(overrides: Partial<WasmCryptoConfig> = {}): WasmCryptoConfig {
    return {
        wasiSdkPath: "",
        srcDir: "",
        outDir: "out",
        targetsFile: "targets.json",
        ...overrides,
    };
}

/** Config with `--pkg <pkgDir>` applied, mirroring index.ts's CLI-level flag. */
function pkgConfig(pkgDir: string): WasmCryptoConfig {
    return applyPkgDir(baseConfig(), pkgDir);
}

let tmp: string;
let pkgDir: string;
let distDir: string;
let dstDir: string;

beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "wasm-crypto-copy-"));
    pkgDir = join(tmp, "pkg");
    distDir = join(pkgDir, "dist");
    dstDir = join(tmp, "into");
    await mkdir(distDir, { recursive: true });
});

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
});

async function writeFixture(name: string, content: string): Promise<Uint8Array> {
    const bytes = new TextEncoder().encode(content);
    await writeFile(join(distDir, name), bytes);
    return bytes;
}

// ─── renderManifest / parseManifest (pure) ────────────────────────────────────

describe("renderManifest / parseManifest", () => {
    test("round-trips rows sorted by filename, LF-terminated, sha256sum shape", () => {
        const rows: ManifestRow[] = [
            { hash: "a".repeat(64), file: "sha3.scalar.wasm" },
            { hash: "b".repeat(64), file: "sha3.simd.wasm" },
        ];
        const text = renderManifest(rows);
        expect(text).toBe(
            `${"a".repeat(64)}  sha3.scalar.wasm\n${"b".repeat(64)}  sha3.simd.wasm\n`,
        );
        expect(parseManifest(text)).toEqual(rows);
    });

    test("parseManifest skips blank lines and malformed rows", () => {
        const text = `${"a".repeat(64)}  x.scalar.wasm\n\nnot-a-valid-row\n`;
        expect(parseManifest(text)).toEqual([{ hash: "a".repeat(64), file: "x.scalar.wasm" }]);
    });
});

// ─── copy (apply) ─────────────────────────────────────────────────────────────

describe("copy — apply", () => {
    test("copies dist/*.{scalar,simd}.wasm into --into and writes an exact manifest", async () => {
        const aScalar = await writeFixture("aes.scalar.wasm", "AES-SCALAR");
        const aSimd = await writeFixture("aes.simd.wasm", "AES-SIMD");
        // A non-variant file in dist/ (e.g. the base64 .wasm.js sibling) must be ignored.
        await writeFixture("aes.wasm.js", "not a wasm variant");

        const code = await runCopy(["--into", dstDir], pkgConfig(pkgDir));
        expect(code).toBe(0);

        const copiedScalar = await readFile(join(dstDir, "aes.scalar.wasm"));
        const copiedSimd = await readFile(join(dstDir, "aes.simd.wasm"));
        expect(new Uint8Array(copiedScalar)).toEqual(aScalar);
        expect(new Uint8Array(copiedSimd)).toEqual(aSimd);
        expect(await Bun.file(join(dstDir, "aes.wasm.js")).exists()).toBe(false);

        const manifestText = await readFile(join(distDir, "MANIFEST.sha256"), "utf8");
        const expected = renderManifest([
            { hash: sha256Hex(aScalar), file: "aes.scalar.wasm" },
            { hash: sha256Hex(aSimd), file: "aes.simd.wasm" },
        ]);
        expect(manifestText).toBe(expected);
    });

    test("idempotent: a second run with no rebuild rewrites a byte-identical manifest and dst", async () => {
        await writeFixture("sha3.scalar.wasm", "SHA3-SCALAR");
        await writeFixture("sha3.simd.wasm", "SHA3-SIMD");

        const code1 = await runCopy(["--into", dstDir], pkgConfig(pkgDir));
        expect(code1).toBe(0);
        const manifest1 = await readFile(join(distDir, "MANIFEST.sha256"), "utf8");
        const dst1 = await readFile(join(dstDir, "sha3.scalar.wasm"));

        const code2 = await runCopy(["--into", dstDir], pkgConfig(pkgDir));
        expect(code2).toBe(0);
        const manifest2 = await readFile(join(distDir, "MANIFEST.sha256"), "utf8");
        const dst2 = await readFile(join(dstDir, "sha3.scalar.wasm"));

        expect(manifest2).toBe(manifest1);
        expect(new Uint8Array(dst2)).toEqual(new Uint8Array(dst1));
    });

    test("--target filters which module's variants are copied, manifest stays full", async () => {
        const aScalar = await writeFixture("aes.scalar.wasm", "AES-SCALAR");
        await writeFixture("aes.simd.wasm", "AES-SIMD");
        const bScalar = await writeFixture("blake2b.scalar.wasm", "BLAKE2B-SCALAR");

        const code = await runCopy(["--into", dstDir, "--target", "aes"], pkgConfig(pkgDir));
        expect(code).toBe(0);

        expect(await Bun.file(join(dstDir, "aes.scalar.wasm")).exists()).toBe(true);
        expect(await Bun.file(join(dstDir, "aes.simd.wasm")).exists()).toBe(true);
        expect(await Bun.file(join(dstDir, "blake2b.scalar.wasm")).exists()).toBe(false);

        // Manifest is dist's full index, independent of the --target copy scope.
        const rows = parseManifest(await readFile(join(distDir, "MANIFEST.sha256"), "utf8"));
        expect(rows.map(r => r.file).sort()).toEqual([
            "aes.scalar.wasm",
            "aes.simd.wasm",
            "blake2b.scalar.wasm",
        ]);
        const byFile = new Map(rows.map(r => [r.file, r.hash]));
        expect(byFile.get("aes.scalar.wasm")).toBe(sha256Hex(aScalar));
        expect(byFile.get("blake2b.scalar.wasm")).toBe(sha256Hex(bScalar));
    });

    test("--target matching no file exits 1", async () => {
        await writeFixture("aes.scalar.wasm", "AES-SCALAR");
        const code = await runCopy(["--into", dstDir, "--target", "bogus"], pkgConfig(pkgDir));
        expect(code).toBe(1);
    });

    test("missing dist/ (nothing built) exits 2", async () => {
        await rm(distDir, { recursive: true, force: true });
        const code = await runCopy(["--into", dstDir], pkgConfig(pkgDir));
        expect(code).toBe(2);
    });

    test("missing --into exits 2", async () => {
        await writeFixture("aes.scalar.wasm", "AES-SCALAR");
        const code = await runCopy([], pkgConfig(pkgDir));
        expect(code).toBe(2);
    });

    test("missing --pkg exits 2", async () => {
        const code = await runCopy(["--into", dstDir], baseConfig());
        expect(code).toBe(2);
    });
});

// ─── copy --check ─────────────────────────────────────────────────────────────

describe("copy --check", () => {
    async function seed(): Promise<void> {
        await writeFixture("aes.scalar.wasm", "AES-SCALAR");
        await writeFixture("aes.simd.wasm", "AES-SIMD");
        const applyCode = await runCopy(["--into", dstDir], pkgConfig(pkgDir));
        expect(applyCode).toBe(0);
    }

    test("green on match, never writes", async () => {
        await seed();
        const before = await readFile(join(distDir, "MANIFEST.sha256"), "utf8");

        const code = await runCopy(["--into", dstDir, "--check"], pkgConfig(pkgDir));
        expect(code).toBe(0);

        const after = await readFile(join(distDir, "MANIFEST.sha256"), "utf8");
        expect(after).toBe(before); // --check never writes
    });

    test("drift (one modified byte in dst) → exit 1 + one stderr line naming the file", async () => {
        await seed();

        // Tamper the committed destination bytes (simulating drift), not dist/.
        await writeFile(join(dstDir, "aes.scalar.wasm"), "AES-SCALAR-TAMPERED");

        const stderrChunks: string[] = [];
        const orig = process.stderr.write.bind(process.stderr);
        (process.stderr as { write: typeof process.stderr.write }).write = (
            chunk: string | Uint8Array,
        ) => {
            stderrChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
            return true;
        };
        let code: number;
        try {
            code = await runCopy(["--into", dstDir, "--check"], pkgConfig(pkgDir));
        } finally {
            (process.stderr as { write: typeof process.stderr.write }).write = orig;
        }

        expect(code).toBe(1);
        const stderr = stderrChunks.join("");
        expect(stderr).toContain("aes.scalar.wasm");
        expect(stderr.split("\n").filter(l => l.includes("aes.scalar.wasm")).length).toBe(1);
        // The untouched sibling must not be reported as drifted.
        expect(stderr).not.toContain("aes.simd.wasm");
    });

    test("missing file in dst → drift, exit 1", async () => {
        await seed();
        await rm(join(dstDir, "aes.simd.wasm"));

        const code = await runCopy(["--into", dstDir, "--check"], pkgConfig(pkgDir));
        expect(code).toBe(1);
    });

    test("missing manifest exits 2", async () => {
        // No prior `copy` run — MANIFEST.sha256 was never written.
        await writeFixture("aes.scalar.wasm", "AES-SCALAR");
        const code = await runCopy(["--into", dstDir, "--check"], pkgConfig(pkgDir));
        expect(code).toBe(2);
    });

    test("--target scopes which manifest rows are checked", async () => {
        await writeFixture("blake2b.scalar.wasm", "BLAKE2B-SCALAR");
        await seed(); // re-writes aes.* + regenerates the full manifest incl. blake2b

        // Drift blake2b's dst copy, but check only "aes" — must stay green.
        await mkdir(dstDir, { recursive: true });
        await Bun.write(join(dstDir, "blake2b.scalar.wasm"), "UNRELATED-DRIFT");

        const code = await runCopy(["--into", dstDir, "--check", "--target", "aes"], pkgConfig(pkgDir));
        expect(code).toBe(0);
    });
});

// ─── index.ts dispatch ─────────────────────────────────────────────────────────

describe("index.ts dispatch — copy", () => {
    test("routes 'copy' to the copy subcommand (in-process, no spawn)", async () => {
        await writeFixture("aes.scalar.wasm", "AES-SCALAR");

        const code = await runIndex({
            args: ["--pkg", pkgDir, "copy", "--into", dstDir],
        });
        expect(code).toBe(0);
        expect(await Bun.file(join(dstDir, "aes.scalar.wasm")).exists()).toBe(true);
    });

    test("--help lists the copy subcommand", async () => {
        const stdoutChunks: string[] = [];
        const orig = process.stdout.write.bind(process.stdout);
        (process.stdout as { write: typeof process.stdout.write }).write = (
            chunk: string | Uint8Array,
        ) => {
            stdoutChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
            return true;
        };
        let code: number;
        try {
            code = await runIndex({ args: ["--help"] });
        } finally {
            (process.stdout as { write: typeof process.stdout.write }).write = orig;
        }
        expect(code).toBe(0);
        expect(stdoutChunks.join("")).toContain("copy");
    });
});
