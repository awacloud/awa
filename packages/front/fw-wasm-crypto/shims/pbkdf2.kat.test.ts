// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * pbkdf2.kat.test.ts — package-local build + zero-import + ABI + RFC 7914 §11
 * KAT for the OWN C23 PBKDF2 (RFC 8018 §5.2 over the own HMAC core)
 * (shims/pbkdf2.c over csrc/pbkdf2/ over csrc/hmac/ over csrc/sha2/,
 * targets.json `pbkdf2`, retargeted off BearSSL to `sourceKind:"own"`).
 *
 * Toolchain-gated, mirroring shims/hkdf.kat.test.ts (PRIOR ART — not imported).
 * When a WASI SDK is discoverable (`WASI_SDK_PATH` env → `discoverWasiSdk()`),
 * this builds the scalar variant (`pbkdf2` is `simd:false`) via the frozen
 * `build --pkg`, then:
 *
 *   - asserts the zero-import invariant + the 4 ABI exports
 *     (memory/alloc/free/pbkdf2),
 *   - runs the RFC 7914 §11 PBKDF2-HMAC-SHA-256 KAT byte-for-byte
 *     (both vectors: c=1 and c=80000),
 *   - asserts rejection of iters <= 0 → WC_EBADPARAM (-1),
 *   - asserts bad hashId → WC_EBADPARAM (-1).
 *
 * KAT anchor lives at references/SPEC/RFC/rfc6070-pbkdf2.json (SHA-256 vectors
 * from RFC 7914 §11; SHA-1 cases from RFC 6070 are omitted as the own
 * implementation supports hashId 256/384/512 only).
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + vector file on disk, record the
 *     build + KAT as deferred; do NOT claim a pass.
 *   - any byte mismatch / unexpected status → the test FAILS.
 *
 * Constant-time note: the framing is straight-line over the public hashId (the
 * in-engine CT proof is acvp-wasm-ct-fuzz's job — this test does NOT
 * self-attest CT as a pass).
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";

import { run as runWasmCrypto, type WasmCryptoConfig } from "../../../../tools/wasm-crypto/src/index.ts";
import { resolveClang, wasmImportNames, wasmExportNames } from "../../../../tools/wasm-crypto/src/cmd/build.ts";
import { discoverWasiSdk } from "../../../../tools/wasm-crypto/build-env/toolchain.ts";
import { AbiHost, type WasmDataModule, type LoadedWasm } from "../../../../tools/wasm-crypto/src/abi-host.ts";
import { validateTargets, type Target } from "../../../../tools/wasm-crypto/src/targets.schema.ts";
import { katDeferral } from "./_kat-toolchain.ts";

// ─── Paths ──────────────────────────────────────────────────────────────────

const SHIMS_DIR = import.meta.dir;
const PKG_DIR = join(SHIMS_DIR, "..");
const REPO_ROOT = join(PKG_DIR, "..", "..", "..");
const TARGETS_FILE = join(PKG_DIR, "targets.json");
const OUT_DIR = join(PKG_DIR, "dist");

const RFC6070_JSON = join(REPO_ROOT, "references/SPEC/RFC/rfc6070-pbkdf2.json");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "pbkdf2"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
    if (hex.length === 0) return new Uint8Array(0);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function bytesToHex(b: Uint8Array): string {
    let s = "";
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
}

async function makeConfig(wasiSdkPath: string): Promise<WasmCryptoConfig> {
    return {
        wasiSdkPath,
        srcDir: PKG_DIR,
        outDir: OUT_DIR,
        targetsFile: TARGETS_FILE,
        pkgDir: PKG_DIR,
    };
}

/** Load the built scalar variant directly from its raw `.wasm` bytes. */
async function loadScalar(host: AbiHost): Promise<LoadedWasm> {
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "pbkdf2.scalar.wasm")).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "pbkdf2Wasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: false,
    };
    return host.load(dataModule);
}

/**
 * Marshal one pbkdf2(hashId, pwd, salt, iters, outLen) → DK bytes.
 */
function runPbkdf2(
    host: AbiHost,
    loaded: LoadedWasm,
    hashId: number,
    pwd: Uint8Array,
    salt: Uint8Array,
    iters: number,
    outLen: number,
): Uint8Array {
    const pwdIn  = host.withBytes(loaded, pwd.length  ? pwd  : new Uint8Array(1));
    const saltIn = host.withBytes(loaded, salt.length ? salt : new Uint8Array(1));
    const out    = host.withBytes(loaded, new Uint8Array(outLen));
    try {
        const rc = host.run(loaded, "pbkdf2", [
            hashId,
            pwdIn.ptr,  pwd.length,
            saltIn.ptr, salt.length,
            iters,
            out.ptr, outLen,
        ]);
        if (rc !== 0) throw new Error(`pbkdf2(${hashId}) rc=${rc}`);
        return host.readBytes(loaded, out.ptr, outLen);
    } finally {
        out.free();
        saltIn.free();
        pwdIn.free();
    }
}

/** Raw status — used to assert error contracts. */
function pbkdf2Status(
    host: AbiHost,
    loaded: LoadedWasm,
    hashId: number,
    pwd: Uint8Array,
    salt: Uint8Array,
    iters: number,
    outLen: number,
): number {
    const pwdIn  = host.withBytes(loaded, pwd.length  ? pwd  : new Uint8Array(1));
    const saltIn = host.withBytes(loaded, salt.length ? salt : new Uint8Array(1));
    const outBuf = outLen > 0 ? outLen : 1;
    const out    = host.withBytes(loaded, new Uint8Array(outBuf));
    try {
        return host.run(loaded, "pbkdf2", [
            hashId,
            pwdIn.ptr,  pwd.length,
            saltIn.ptr, salt.length,
            iters,
            out.ptr, outLen,
        ]);
    } finally {
        out.free();
        saltIn.free();
        pwdIn.free();
    }
}

interface Rfc7914Pbkdf2Case {
    tcId: number;
    comment: string;
    hashId: number;
    passwordHex: string;
    saltHex: string;
    iterationCount: number;
    dkLen: number;
    dk: string;
}

// ─── Toolchain discovery ──────────────────────────────────────────────────────

let wasiSdkPath = "";
let toolchainPresent = false;

beforeAll(async () => {
    const envPath = process.env["WASI_SDK_PATH"];
    wasiSdkPath = envPath ? envPath : ((await discoverWasiSdk()) ?? "");
    if (wasiSdkPath) {
        const clang = await resolveClang(await makeConfig(wasiSdkPath));
        toolchainPresent = clang !== null;
    }
});

// ─── Manifest + corpus presence (toolchain-independent) ───────────────────────

describe("pbkdf2 manifest wiring", () => {
    test("targets.json `pbkdf2` retargeted to the own C23 PBKDF2 core over own HMAC+SHA-2", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "pbkdf2");
        expect(t, "no pbkdf2 target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own bascule: source/shim retargeted off bearssl/bearssl.c.
        expect(t!.source).toBe("own-pbkdf2");
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/pbkdf2.c");
        // cSources must list the own PBKDF2 core + own HMAC core + own SHA-2 core.
        expect(t!.cSources.some(c => c.includes("csrc/pbkdf2/pbkdf2.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/hmac/hmac.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/sha2/sha2.c"))).toBe(true);
        // No BearSSL sources.
        expect(t!.cSources.some(c => c.includes("bearssl"))).toBe(false);
        // own → cStdFor binds c23; cStd MUST be unset; -I<pkgDir> auto-spliced.
        expect(t!.cStd).toBeUndefined();
        expect(t!.cflags).toEqual([]);
        // PBKDF2 has no SIMD benefit (scalar-only).
        expect(t!.simd).toBe(false);
        // The frozen 4-export ABI.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
        // RFC 6070 / RFC 7914 JSON vector path declared.
        expect(t!.vectors).toContain("references/SPEC/RFC/rfc6070-pbkdf2.json");
    });

    test("RFC 6070 / RFC 7914 PBKDF2 JSON vector file exists on disk", async () => {
        expect(await Bun.file(RFC6070_JSON).exists(), "rfc6070-pbkdf2.json must exist on disk").toBe(true);
    });

    test("RFC 7914 PBKDF2-HMAC-SHA-256 vector file has SHA-256 test cases", async () => {
        const vec = JSON.parse(await Bun.file(RFC6070_JSON).text()) as { testCases: Rfc7914Pbkdf2Case[] };
        expect(Array.isArray(vec.testCases), "testCases must be an array").toBe(true);
        expect(vec.testCases.length).toBeGreaterThanOrEqual(2);
        for (const tc of vec.testCases) {
            expect(tc.hashId).toBe(256);
            expect(typeof tc.dk).toBe("string");
            expect(tc.dk.length).toBe(tc.dkLen * 2);
            expect(tc.iterationCount).toBeGreaterThan(0);
        }
    });

    test("shim exports the frozen pbkdf2() ABI over the own PBKDF2 core (not BearSSL)", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "pbkdf2.c")).text();
        expect(src).toContain("int pbkdf2(");
        expect(src).toContain('#include "csrc/pbkdf2/pbkdf2.h"');
        expect(src).toContain('#include "_arena.h"');
        // Validates via hmac_digest_size (mirrors bearssl.c's !vt check).
        expect(src).toContain("hmac_digest_size");
        // No BearSSL symbol binding.
        expect(src).not.toContain("br_pbkdf2");
        expect(src).not.toContain("br_hash");
    });

    test("csrc/pbkdf2 core consumes (not duplicates) own HMAC read-only", async () => {
        const c = await Bun.file(join(PKG_DIR, "csrc/pbkdf2/pbkdf2.c")).text();
        const h = await Bun.file(join(PKG_DIR, "csrc/pbkdf2/pbkdf2.h")).text();
        // Includes the own HMAC header (which in turn includes own SHA-2).
        expect(h).toContain('#include "csrc/hmac/hmac.h"');
        // Uses the own HMAC streaming API.
        expect(c).toContain("hmac_init");
        expect(c).toContain("hmac_update");
        expect(c).toContain("hmac_final");
        // No BearSSL, no SHA-2 direct calls.
        expect(c).not.toContain("br_");
        expect(c).not.toContain("sha256_init");
        expect(c).not.toContain("sha512_init");
        // RFC 8018 §5.2 XOR loop and big-endian block counter.
        expect(c).toContain("xor");
        expect(c).toContain("be32");
        // F-function / block derivation.
        expect(c).toContain("pbkdf2_block");
    });
});

// ─── Build + RFC 7914 KAT (toolchain-gated) ───────────────────────────────────

describe("pbkdf2 build + RFC 7914 §11 PBKDF2-HMAC-SHA-256 KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, RFC 7914 KAT byte-for-byte, rejects iters<=0", async () => {
        if (katDeferral("pbkdf2", toolchainPresent, "RFC 7914 PBKDF2-HMAC-SHA-256 KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build the scalar variant (simd:false). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "pbkdf2"],
            config: cfg,
        });
        expect(code, "wasm-crypto build pbkdf2 exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "pbkdf2.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) expect(exports.has(e), `scalar missing export ${e}`).toBe(true);

        const host = new AbiHost();
        const loaded = await loadScalar(host);

        // ── RFC 7914 §11 PBKDF2-HMAC-SHA-256 test cases byte-for-byte. ──
        const vec = JSON.parse(await Bun.file(RFC6070_JSON).text()) as { testCases: Rfc7914Pbkdf2Case[] };
        expect(vec.testCases.length, "RFC 7914 PBKDF2 JSON must have test cases").toBeGreaterThan(0);

        let katCount = 0;
        for (const tc of vec.testCases) {
            const pwd  = hexToBytes(tc.passwordHex);
            const salt = hexToBytes(tc.saltHex);
            const got  = runPbkdf2(host, loaded, tc.hashId, pwd, salt, tc.iterationCount, tc.dkLen);
            expect(
                bytesToHex(got),
                `RFC 7914 tcId=${tc.tcId} (${tc.comment}): DK mismatch`,
            ).toBe(tc.dk);
            katCount++;
        }

        // ── Reject iters <= 0 → WC_EBADPARAM (-1). ──
        const samplePwd  = hexToBytes("706173737764"); // "passwd"
        const sampleSalt = hexToBytes("73616c74");     // "salt"
        expect(
            pbkdf2Status(host, loaded, 256, samplePwd, sampleSalt, 0, 32),
            "iters=0 must return WC_EBADPARAM (-1)",
        ).toBe(-1);
        expect(
            pbkdf2Status(host, loaded, 256, samplePwd, sampleSalt, -1, 32),
            "iters=-1 must return WC_EBADPARAM (-1)",
        ).toBe(-1);

        // ── Reject outLen <= 0 → WC_EBADPARAM (-1). ──
        expect(
            pbkdf2Status(host, loaded, 256, samplePwd, sampleSalt, 1, 0),
            "outLen=0 must return WC_EBADPARAM (-1)",
        ).toBe(-1);

        // ── Bad hashId → WC_EBADPARAM (-1). ──
        expect(
            pbkdf2Status(host, loaded, 224, samplePwd, sampleSalt, 1, 32),
            "bad hashId 224 must return WC_EBADPARAM (-1)",
        ).toBe(-1);
        expect(
            pbkdf2Status(host, loaded, 0, samplePwd, sampleSalt, 1, 32),
            "bad hashId 0 must return WC_EBADPARAM (-1)",
        ).toBe(-1);

        console.warn(
            `[pbkdf2.kat] RFC 7914 PBKDF2-HMAC-SHA-256 DK byte-for-byte OK on ${katCount} test cases; ` +
                "iters<=0 + outLen<=0 + bad hashId contracts verified.",
        );
    }, 600_000); /* c=80000 may take ~60s under wasm; allow 10 min */
});
