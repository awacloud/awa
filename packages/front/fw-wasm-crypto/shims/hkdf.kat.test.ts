// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * hkdf.kat.test.ts — package-local build + zero-import + ABI + RFC 5869 KAT
 * for the OWN C23 HKDF (RFC 5869 extract/expand over the own HMAC core)
 * (shims/hkdf.c over csrc/hkdf/ over csrc/hmac/ over csrc/sha2/,
 * targets.json `hkdf`, retargeted off BearSSL to `sourceKind:"own"`).
 *
 * Toolchain-gated, mirroring shims/hmac.kat.test.ts (PRIOR ART — not imported).
 * When a WASI SDK is discoverable (`WASI_SDK_PATH` env → `discoverWasiSdk()`),
 * this builds the scalar variant (`hkdf` is `simd:false`) via the frozen
 * `build --pkg`, then:
 *
 *   - asserts the zero-import invariant + the 4 ABI exports
 *     (memory/alloc/free/hkdf),
 *   - runs the RFC 5869 Appendix A SHA-256 KAT byte-for-byte (all 3 cases:
 *     A.1 basic, A.2 longer inputs/outputs, A.3 zero-length salt/info),
 *   - asserts rejection of outLen > 255*HashLen → WC_EBADPARAM (-1),
 *   - asserts bad hashId → WC_EBADPARAM (-1).
 *
 * KAT anchor lives at references/SPEC/RFC/rfc5869-hkdf.json (derived from
 * rfc5869.txt Appendix A; SHA-1 test cases A.4–A.7 are not included as the
 * own implementation supports hashId 256/384/512 only).
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

const RFC5869_JSON = join(REPO_ROOT, "references/SPEC/RFC/rfc5869-hkdf.json");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "hkdf"];

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
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "hkdf.scalar.wasm")).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "hkdfWasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: false,
    };
    return host.load(dataModule);
}

/**
 * Marshal one hkdf(hashId, ikm, salt, info, outLen) → OKM bytes.
 * Passes NULL for ikm/salt/info pointers when the corresponding length is 0,
 * but the ABI always expects a valid pointer so we pass the arena base for
 * zero-length inputs (actual bytes ignored by the shim when len==0).
 */
function runHkdf(
    host: AbiHost,
    loaded: LoadedWasm,
    hashId: number,
    ikm: Uint8Array,
    salt: Uint8Array,
    info: Uint8Array,
    outLen: number,
): Uint8Array {
    const ikmIn  = host.withBytes(loaded, ikm.length  ? ikm  : new Uint8Array(1));
    const saltIn = host.withBytes(loaded, salt.length ? salt : new Uint8Array(1));
    const infoIn = host.withBytes(loaded, info.length ? info : new Uint8Array(1));
    const out    = host.withBytes(loaded, new Uint8Array(outLen));
    try {
        const rc = host.run(loaded, "hkdf", [
            hashId,
            ikmIn.ptr,  ikm.length,
            saltIn.ptr, salt.length,
            infoIn.ptr, info.length,
            out.ptr,    outLen,
        ]);
        if (rc !== 0) throw new Error(`hkdf(${hashId}) rc=${rc}`);
        return host.readBytes(loaded, out.ptr, outLen);
    } finally {
        out.free();
        infoIn.free();
        saltIn.free();
        ikmIn.free();
    }
}

/** Raw status — used to assert error contracts. */
function hkdfStatus(
    host: AbiHost,
    loaded: LoadedWasm,
    hashId: number,
    ikm: Uint8Array,
    salt: Uint8Array,
    info: Uint8Array,
    outLen: number,
): number {
    const ikmIn  = host.withBytes(loaded, ikm.length  ? ikm  : new Uint8Array(1));
    const saltIn = host.withBytes(loaded, salt.length ? salt : new Uint8Array(1));
    const infoIn = host.withBytes(loaded, info.length ? info : new Uint8Array(1));
    const outBuf = outLen > 0 ? outLen : 1;
    const out    = host.withBytes(loaded, new Uint8Array(outBuf));
    try {
        return host.run(loaded, "hkdf", [
            hashId,
            ikmIn.ptr,  ikm.length,
            saltIn.ptr, salt.length,
            infoIn.ptr, info.length,
            out.ptr,    outLen,
        ]);
    } finally {
        out.free();
        infoIn.free();
        saltIn.free();
        ikmIn.free();
    }
}

interface Rfc5869Case {
    tcId: number;
    comment: string;
    hashId: number;
    ikm: string;
    salt: string;
    info: string;
    l: number;
    prk: string;
    okm: string;
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

describe("hkdf manifest wiring", () => {
    test("targets.json `hkdf` retargeted to the own C23 HKDF core over own HMAC+SHA-2", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "hkdf");
        expect(t, "no hkdf target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own bascule: source/shim retargeted off bearssl/bearssl.c.
        expect(t!.source).toBe("own-hkdf");
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/hkdf.c");
        // cSources must list the own HKDF core + own HMAC core + own SHA-2 core.
        expect(t!.cSources.some(c => c.includes("csrc/hkdf/hkdf.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/hmac/hmac.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/sha2/sha2.c"))).toBe(true);
        // No BearSSL sources.
        expect(t!.cSources.some(c => c.includes("bearssl"))).toBe(false);
        // own → cStdFor binds c23; cStd MUST be unset; -I<pkgDir> auto-spliced.
        expect(t!.cStd).toBeUndefined();
        expect(t!.cflags).toEqual([]);
        // HKDF has no SIMD benefit (scalar-only).
        expect(t!.simd).toBe(false);
        // The frozen 4-export ABI.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
        // RFC 5869 JSON vector path declared.
        expect(t!.vectors).toContain("references/SPEC/RFC/rfc5869-hkdf.json");
    });

    test("RFC 5869 HKDF JSON vector file exists on disk", async () => {
        expect(await Bun.file(RFC5869_JSON).exists(), "rfc5869-hkdf.json must exist on disk").toBe(true);
    });

    test("RFC 5869 JSON vector file contains 3 SHA-256 test cases", async () => {
        const vec = JSON.parse(await Bun.file(RFC5869_JSON).text()) as { testCases: Rfc5869Case[] };
        expect(Array.isArray(vec.testCases), "testCases must be an array").toBe(true);
        expect(vec.testCases.length).toBeGreaterThanOrEqual(3);
        for (const tc of vec.testCases) {
            expect(tc.hashId).toBe(256);
            expect(typeof tc.okm).toBe("string");
            expect(tc.okm.length).toBe(tc.l * 2);
        }
    });

    test("shim exports the frozen hkdf() ABI over the own HKDF core (not BearSSL)", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "hkdf.c")).text();
        expect(src).toContain("int hkdf(");
        expect(src).toContain('#include "csrc/hkdf/hkdf.h"');
        expect(src).toContain('#include "_arena.h"');
        // No BearSSL symbol binding and no shim-local heap.
        expect(src).not.toContain("br_hkdf");
        expect(src).not.toContain("br_hash");
        expect(src).not.toContain("g_heap");
    });

    test("csrc/hkdf core consumes (not duplicates) own HMAC read-only", async () => {
        const c = await Bun.file(join(PKG_DIR, "csrc/hkdf/hkdf.c")).text();
        const h = await Bun.file(join(PKG_DIR, "csrc/hkdf/hkdf.h")).text();
        // Includes the own HMAC header (which in turn includes own SHA-2).
        expect(h).toContain('#include "csrc/hmac/hmac.h"');
        // Uses the own HMAC streaming API.
        expect(c).toContain("hmac_init");
        expect(c).toContain("hmac_update");
        expect(c).toContain("hmac_final");
        expect(c).toContain("hmac_oneshot");
        // No BearSSL, no SHA-2 direct calls (HMAC is the only dependency).
        expect(c).not.toContain("br_");
        expect(c).not.toContain("sha256_init");
        expect(c).not.toContain("sha512_init");
        // RFC 5869 extract + expand present.
        expect(c).toContain("hkdf_extract");
        expect(c).toContain("hkdf_expand");
        // Counter loop for expand.
        expect(c).toContain("counter");
    });
});

// ─── Build + RFC 5869 KAT (toolchain-gated) ───────────────────────────────────

describe("hkdf build + RFC 5869 KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, RFC 5869 KAT byte-for-byte, rejects outLen>255*hashLen", async () => {
        if (katDeferral("hkdf", toolchainPresent, "RFC 5869 HKDF KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build the scalar variant (simd:false). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "hkdf"],
            config: cfg,
        });
        expect(code, "wasm-crypto build hkdf exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "hkdf.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) expect(exports.has(e), `scalar missing export ${e}`).toBe(true);

        const host = new AbiHost();
        const loaded = await loadScalar(host);

        // ── RFC 5869 Appendix A test cases (SHA-256 only) byte-for-byte. ──
        const vec = JSON.parse(await Bun.file(RFC5869_JSON).text()) as { testCases: Rfc5869Case[] };
        expect(vec.testCases.length, "RFC 5869 JSON must have test cases").toBeGreaterThan(0);

        let katCount = 0;
        for (const tc of vec.testCases) {
            const ikm  = hexToBytes(tc.ikm);
            const salt = hexToBytes(tc.salt);
            const info = hexToBytes(tc.info);
            const got = runHkdf(host, loaded, tc.hashId, ikm, salt, info, tc.l);
            expect(
                bytesToHex(got),
                `RFC 5869 tcId=${tc.tcId} (${tc.comment}): OKM mismatch`,
            ).toBe(tc.okm);
            katCount++;
        }

        // ── Reject outLen > 255 * hashLen → WC_EBADPARAM (-1). ──
        // SHA-256 hashLen=32 → 255*32=8160; test with 8161.
        const ikmShort = hexToBytes("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");
        const saltShort = hexToBytes("000102030405060708090a0b0c");
        const infoShort = hexToBytes("f0f1f2f3f4f5f6f7f8f9");
        expect(
            hkdfStatus(host, loaded, 256, ikmShort, saltShort, infoShort, 8161),
            "outLen > 255*hashLen must return WC_EBADPARAM (-1)",
        ).toBe(-1);

        // ── Bad hashId → WC_EBADPARAM (-1). ──
        expect(
            hkdfStatus(host, loaded, 224, ikmShort, saltShort, infoShort, 32),
            "bad hashId 224 must return WC_EBADPARAM (-1)",
        ).toBe(-1);
        expect(
            hkdfStatus(host, loaded, 0, ikmShort, saltShort, infoShort, 32),
            "bad hashId 0 must return WC_EBADPARAM (-1)",
        ).toBe(-1);

        console.warn(
            `[hkdf.kat] RFC 5869 HKDF OKM byte-for-byte OK on ${katCount} SHA-256 test cases; ` +
                "outLen>255*hashLen + bad hashId contracts verified.",
        );
    }, 300_000);
});
