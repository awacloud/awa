// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * aes.kat.test.ts — package-local build + zero-import + ABI + AES-GCM ACVP KAT
 * for the constant-time AES shim over BearSSL ct64 (shims/aes.c, targets.json
 * `aes`).
 *
 * Toolchain-gated, mirroring shims/mlkem.kat.test.ts and shims/mldsa.kat.test.ts
 * (PRIOR ART — not imported). When a WASI SDK is discoverable (`WASI_SDK_PATH`
 * env → `discoverWasiSdk()`), this builds the scalar variant (the `aes` target
 * is `simd:false` — AES/GHASH stay bitsliced; SIMD gains are W4 ChaCha/Keccak,
 * not AES) via the frozen `build --pkg`, loads the emitted `aes.wasm.js` through
 * `AbiHost`, asserts the zero-import invariant + the eight ABI exports, then:
 *
 *   - AES-GCM ACVP (ACVP-AES-GCM-1.0, FIPS via SP800-38D): byte-for-byte against
 *     expectedResults.json. The frozen ABI uses a 96-bit IV + a full 16-byte tag
 *     stored after the ciphertext, so the KAT covers the encrypt/decrypt groups
 *     with ivLen=96; for shorter tagLen (e.g. 32) the seal tag is truncated to
 *     tagLen/8 bytes for comparison (ACVP semantics), and decrypt is exercised
 *     only where tagLen=128 (the ABI verifies a full 16-byte tag). Decrypt covers
 *     both the accept path (pt byte-for-byte) and the auth-fail negative case
 *     (`testPassed:false` → aes_gcm_open returns non-zero).
 *   - GCM seal→open round-trip for AES-192 / AES-256 with a non-empty payload and
 *     AAD (the ACVP default file is key=128 only) + a tamper→reject negative.
 *   - CBC known-answer: NIST SP800-38A §F.2.1 (CBC-AES128.Encrypt) + its inverse.
 *   - CTR known-answer: a WebCrypto AES-CTR reference (16-byte counter =
 *     nonce(12)||be32(0), matching the shim's J0-style counter) for 128/192/256.
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + vectors-on-disk, record the build
 *     + KAT as deferred; do NOT claim a pass.
 *   - vectors missing on disk → record "vectors unavailable"; do NOT pass.
 *   - any byte mismatch / non-zero status → the test FAILS.
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

const ACVP_GCM_DIR = join(
    REPO_ROOT,
    "references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-GCM-1.0",
);

// ─── AES ABI constants ────────────────────────────────────────────────────────

const ABI_EXPORTS = [
    "memory",
    "alloc",
    "free",
    "aes_gcm_seal",
    "aes_gcm_open",
    "aes_cbc_enc",
    "aes_cbc_dec",
    "aes_ctr",
];

const TAG_BYTES = 16; // the frozen ABI stores/verifies a full 16-byte GCM tag

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

function eqBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
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

function indexExpected(
    expected: { testGroups?: Array<{ tgId: number; tests?: Array<{ tcId: number }> }> },
): Map<string, Record<string, string | boolean | number>> {
    const map = new Map<string, Record<string, string | boolean | number>>();
    for (const g of expected.testGroups ?? []) {
        for (const t of g.tests ?? []) {
            map.set(`${g.tgId}:${t.tcId}`, t as Record<string, string | boolean | number>);
        }
    }
    return map;
}

/** Load the `aes` data module of the built scalar variant from its emitted `.wasm.js`. */
async function loadVariant(host: AbiHost): Promise<LoadedWasm> {
    const mod = (await import(join(OUT_DIR, "aes.wasm.js"))) as Record<string, WasmDataModule>;
    const dataModule = Object.values(mod).find(
        m => m && typeof m === "object" && "bytes" in m,
    );
    if (!dataModule) throw new Error("aes.wasm.js: no wasm data module export found");
    return host.load(dataModule);
}

/** Marshal a seal: returns ct||tag(16) read back out of wasm memory. */
function sealGcm(
    host: AbiHost,
    loaded: LoadedWasm,
    key: Uint8Array,
    iv: Uint8Array,
    pt: Uint8Array,
    aad: Uint8Array,
): Uint8Array {
    const keyIn = host.withBytes(loaded, key);
    const ivIn = host.withBytes(loaded, iv);
    const ptIn = host.withBytes(loaded, pt.length ? pt : new Uint8Array(1));
    const aadIn = host.withBytes(loaded, aad.length ? aad : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(pt.length + TAG_BYTES));
    try {
        const rc = host.run(loaded, "aes_gcm_seal", [
            keyIn.ptr, key.length, ivIn.ptr,
            ptIn.ptr, pt.length, aadIn.ptr, aad.length, out.ptr,
        ]);
        if (rc !== 0) throw new Error(`aes_gcm_seal rc=${rc}`);
        return host.readBytes(loaded, out.ptr, pt.length + TAG_BYTES);
    } finally {
        out.free();
        aadIn.free();
        ptIn.free();
        ivIn.free();
        keyIn.free();
    }
}

/**
 * Marshal an open: in = ct||tag(16). Returns `{ rc, pt }`. The tag MUST be the
 * full 16 bytes the ABI verifies; rc !== 0 means auth fail.
 */
function openGcm(
    host: AbiHost,
    loaded: LoadedWasm,
    key: Uint8Array,
    iv: Uint8Array,
    ctTag: Uint8Array,
    aad: Uint8Array,
): { rc: number; pt: Uint8Array } {
    const ctLen = ctTag.length - TAG_BYTES;
    const keyIn = host.withBytes(loaded, key);
    const ivIn = host.withBytes(loaded, iv);
    const dataIn = host.withBytes(loaded, ctTag); // ct||tag laid out contiguously
    const aadIn = host.withBytes(loaded, aad.length ? aad : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(ctLen || 1));
    try {
        const rc = host.run(loaded, "aes_gcm_open", [
            keyIn.ptr, key.length, ivIn.ptr,
            dataIn.ptr, ctLen, aadIn.ptr, aad.length, out.ptr,
        ]);
        const pt = rc === 0 ? host.readBytes(loaded, out.ptr, ctLen) : new Uint8Array(0);
        return { rc, pt };
    } finally {
        out.free();
        aadIn.free();
        dataIn.free();
        ivIn.free();
        keyIn.free();
    }
}

function cbc(
    host: AbiHost,
    loaded: LoadedWasm,
    fn: "aes_cbc_enc" | "aes_cbc_dec",
    key: Uint8Array,
    iv: Uint8Array,
    data: Uint8Array,
): Uint8Array {
    const keyIn = host.withBytes(loaded, key);
    const ivIn = host.withBytes(loaded, iv);
    const dataIn = host.withBytes(loaded, data);
    const out = host.withBytes(loaded, new Uint8Array(data.length));
    try {
        const rc = host.run(loaded, fn, [keyIn.ptr, key.length, ivIn.ptr, dataIn.ptr, data.length, out.ptr]);
        if (rc !== 0) throw new Error(`${fn} rc=${rc}`);
        return host.readBytes(loaded, out.ptr, data.length);
    } finally {
        out.free();
        dataIn.free();
        ivIn.free();
        keyIn.free();
    }
}

function ctr(
    host: AbiHost,
    loaded: LoadedWasm,
    key: Uint8Array,
    nonce12: Uint8Array,
    data: Uint8Array,
): Uint8Array {
    const keyIn = host.withBytes(loaded, key);
    const ivIn = host.withBytes(loaded, nonce12);
    const dataIn = host.withBytes(loaded, data);
    const out = host.withBytes(loaded, new Uint8Array(data.length));
    try {
        const rc = host.run(loaded, "aes_ctr", [keyIn.ptr, key.length, ivIn.ptr, dataIn.ptr, data.length, out.ptr]);
        if (rc !== 0) throw new Error(`aes_ctr rc=${rc}`);
        return host.readBytes(loaded, out.ptr, data.length);
    } finally {
        out.free();
        dataIn.free();
        ivIn.free();
        keyIn.free();
    }
}

/**
 * WebCrypto AES-CTR reference matching the shim's J0-style counter: the 16-byte
 * counter block is nonce(12)||be32(0), with a 32-bit counter field (`length:32`).
 */
async function ctrRef(key: Uint8Array, nonce12: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const counter = concatBytes(nonce12, new Uint8Array(4));
    const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "AES-CTR" }, false, ["encrypt"]);
    const ct = await crypto.subtle.encrypt({ name: "AES-CTR", counter: counter as BufferSource, length: 32 }, k, data as BufferSource);
    return new Uint8Array(ct);
}

// NIST SP 800-38A §F.2.1 — CBC-AES128.Encrypt (canonical published KAT).
const CBC_F21 = {
    key: hexToBytes("2b7e151628aed2a6abf7158809cf4f3c"),
    iv: hexToBytes("000102030405060708090a0b0c0d0e0f"),
    pt: hexToBytes(
        "6bc1bee22e409f96e93d7e117393172a" +
            "ae2d8a571e03ac9c9eb76fac45af8e51" +
            "30c81c46a35ce411e5fbc1191a0a52ef" +
            "f69f2445df4f9b17ad2b417be66c3710",
    ),
    ct: hexToBytes(
        "7649abac8119b246cee98e9b12e9197d" +
            "5086cb9b507219ee95db113a917678b2" +
            "73bed6b8e3c1743b7116e69e22229516" +
            "3ff1caa1681fac09120eca307586e1a7",
    ),
};

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

// ─── Manifest + vector presence (toolchain-independent) ───────────────────────

describe("aes manifest wiring", () => {
    test("targets.json `aes` retargeted to shims/aes.c over BearSSL ct64 (constant-time)", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "aes");
        expect(t, "no aes target").toBeDefined();
        expect(t!.source).toBe("bearssl");
        expect(t!.shim).toBe("shims/aes.c");
        // Constant-time mandate: ct64 + ghash_ctmul64, no AES-NI, simd off.
        expect(t!.cSources.some(c => c.includes("aes_ct64"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("ghash_ctmul64"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("aead/gcm.c"))).toBe(true);
        expect(t!.cflags.join(" ")).toContain("WASM_NO_AESNI");
        expect(t!.simd).toBe(false);
        // The frozen 5-export AES ABI (+ memory/alloc/free) is declared.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
        // Vectors point at the real on-disk ACVP-AES-GCM dir.
        expect(t!.vectors.some(v => v.includes("ACVP-AES-GCM-1.0"))).toBe(true);
    });

    test("ACVP-AES-GCM vectors exist on disk", async () => {
        const prompt = Bun.file(join(ACVP_GCM_DIR, "prompt.json"));
        const expected = Bun.file(join(ACVP_GCM_DIR, "expectedResults.json"));
        expect(await prompt.exists()).toBe(true);
        expect(await expected.exists()).toBe(true);
        const j = JSON.parse(await prompt.text());
        expect(j.algorithm).toBe("ACVP-AES-GCM");
    });
});

// ─── Build + KAT (toolchain-gated) ────────────────────────────────────────────

describe("aes build + ACVP KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, AES-GCM ACVP + CBC/CTR KAT", async () => {
        if (katDeferral("aes", toolchainPresent)) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build (simd:false → scalar only). ──
        const code = await runWasmCrypto({ args: ["build", "--pkg", PKG_DIR, "--target", "aes"], config: cfg });
        expect(code, "wasm-crypto build aes exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced scalar binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "aes.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) {
            expect(exports.has(e), `scalar missing export ${e}`).toBe(true);
        }

        // ── KAT through the emitted data module (AbiHost). ──
        const host = new AbiHost();
        const loaded = await loadVariant(host);

        // ===== AES-GCM ACVP byte-for-byte =====
        const prompt = JSON.parse(await Bun.file(join(ACVP_GCM_DIR, "prompt.json")).text());
        const expected = indexExpected(
            JSON.parse(await Bun.file(join(ACVP_GCM_DIR, "expectedResults.json")).text()),
        );

        let encChecked = 0;
        let decAcceptChecked = 0;
        let decRejectChecked = 0;

        for (const g of prompt.testGroups ?? []) {
            // The frozen ABI takes a 96-bit IV only; skip other IV lengths.
            if (g.ivLen !== 96) continue;
            const tagLenBytes = (g.tagLen as number) / 8;

            if (g.direction === "encrypt") {
                for (const t of g.tests ?? []) {
                    const exp = expected.get(`${g.tgId}:${t.tcId}`);
                    if (!exp) continue;
                    const key = hexToBytes(t.key);
                    const iv = hexToBytes(t.iv);
                    const pt = hexToBytes(t.pt ?? "");
                    const aad = hexToBytes(t.aad ?? "");
                    const sealed = sealGcm(host, loaded, key, iv, pt, aad);
                    const ct = sealed.subarray(0, pt.length);
                    const tagFull = sealed.subarray(pt.length);
                    const tag = tagFull.subarray(0, tagLenBytes); // ACVP-truncated tag
                    expect(
                        bytesToHex(ct),
                        `GCM encrypt ${g.keyLen}/tag${g.tagLen} tc ${t.tcId} ct`,
                    ).toBe((exp.ct as string).toLowerCase());
                    expect(
                        bytesToHex(tag),
                        `GCM encrypt ${g.keyLen}/tag${g.tagLen} tc ${t.tcId} tag`,
                    ).toBe((exp.tag as string).toLowerCase());
                    encChecked++;
                }
            } else if (g.direction === "decrypt") {
                // The ABI verifies a FULL 16-byte tag → only tagLen=128 groups.
                if (g.tagLen !== 128) continue;
                for (const t of g.tests ?? []) {
                    const exp = expected.get(`${g.tgId}:${t.tcId}`);
                    if (!exp) continue;
                    const key = hexToBytes(t.key);
                    const iv = hexToBytes(t.iv);
                    const ct = hexToBytes(t.ct ?? "");
                    const tag = hexToBytes(t.tag);
                    const aad = hexToBytes(t.aad ?? "");
                    const ctTag = concatBytes(ct, tag);
                    const { rc, pt } = openGcm(host, loaded, key, iv, ctTag, aad);
                    if (exp.testPassed === false) {
                        // Auth-fail negative case — open MUST reject.
                        expect(rc, `GCM decrypt tc ${t.tcId} must reject`).not.toBe(0);
                        decRejectChecked++;
                    } else {
                        expect(rc, `GCM decrypt tc ${t.tcId} must accept`).toBe(0);
                        expect(
                            bytesToHex(pt),
                            `GCM decrypt tc ${t.tcId} pt`,
                        ).toBe((exp.pt as string).toLowerCase());
                        decAcceptChecked++;
                    }
                }
            }
        }

        expect(encChecked, "GCM encrypt vectors checked").toBeGreaterThan(0);
        expect(decAcceptChecked, "GCM decrypt-accept vectors checked").toBeGreaterThan(0);
        expect(decRejectChecked, "GCM decrypt-reject vectors checked").toBeGreaterThan(0);

        // ===== GCM seal→open round-trip for AES-192 / AES-256 (non-empty payload + AAD) =====
        // The default ACVP file is key=128 only; exercise the larger key sizes
        // and a real payload via the module's own self-consistency, plus a tamper.
        for (const keyLen of [24, 32]) {
            const key = new Uint8Array(keyLen).map((_, i) => (i * 7 + 1) & 0xff);
            const iv = new Uint8Array(12).map((_, i) => (i * 3 + 5) & 0xff);
            const pt = new Uint8Array(40).map((_, i) => (i * 11 + 2) & 0xff);
            const aad = new Uint8Array(13).map((_, i) => (i * 5 + 9) & 0xff);
            const sealed = sealGcm(host, loaded, key, iv, pt, aad);
            const round = openGcm(host, loaded, key, iv, sealed, aad);
            expect(round.rc, `GCM-${keyLen * 8} round-trip rc`).toBe(0);
            expect(eqBytes(round.pt, pt), `GCM-${keyLen * 8} round-trip pt`).toBe(true);
            // Tamper the last tag byte → MUST reject.
            const tampered = new Uint8Array(sealed);
            tampered[tampered.length - 1] ^= 0xff;
            const bad = openGcm(host, loaded, key, iv, tampered, aad);
            expect(bad.rc, `GCM-${keyLen * 8} tamper must reject`).not.toBe(0);
        }

        // ===== CBC known-answer: NIST SP800-38A §F.2.1 + inverse =====
        const cbcCt = cbc(host, loaded, "aes_cbc_enc", CBC_F21.key, CBC_F21.iv, CBC_F21.pt);
        expect(bytesToHex(cbcCt), "CBC-AES128 SP800-38A F.2.1 encrypt").toBe(bytesToHex(CBC_F21.ct));
        const cbcPt = cbc(host, loaded, "aes_cbc_dec", CBC_F21.key, CBC_F21.iv, CBC_F21.ct);
        expect(bytesToHex(cbcPt), "CBC-AES128 SP800-38A F.2.1 decrypt").toBe(bytesToHex(CBC_F21.pt));

        // ===== CTR known-answer: WebCrypto reference (J0-style counter) 128/192/256 =====
        for (const keyLen of [16, 24, 32]) {
            const key = new Uint8Array(keyLen).map((_, i) => (i * 13 + 3) & 0xff);
            const nonce12 = new Uint8Array(12).map((_, i) => (i * 17 + 4) & 0xff);
            const data = new Uint8Array(48).map((_, i) => (i * 19 + 6) & 0xff);
            const expectCt = await ctrRef(key, nonce12, data);
            const ct = ctr(host, loaded, key, nonce12, data);
            expect(bytesToHex(ct), `CTR-AES${keyLen * 8} vs WebCrypto`).toBe(bytesToHex(expectCt));
            // CTR is its own inverse → re-running on the ciphertext recovers pt.
            const back = ctr(host, loaded, key, nonce12, ct);
            expect(eqBytes(back, data), `CTR-AES${keyLen * 8} round-trip`).toBe(true);
        }

        console.warn(
            `[aes.kat] ACVP byte-for-byte OK — GCM enc=${encChecked} ` +
                `dec-accept=${decAcceptChecked} dec-reject=${decRejectChecked}; ` +
                "GCM-192/256 round-trip + CBC F.2.1 + CTR 128/192/256 OK.",
        );
    }, 120_000);
});
