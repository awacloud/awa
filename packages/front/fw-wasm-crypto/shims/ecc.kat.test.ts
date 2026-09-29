// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * ecc.kat.test.ts — package-local build + zero-import + ABI + ECDSA/ECDH ACVP KAT
 * for the Tier-B ECDSA/ECDH shim over fiat-crypto machine-verified field
 * arithmetic with BearSSL EC framing (shims/ecc.c, targets.json `ecc`).
 *
 * Toolchain-gated, mirroring shims/aes.kat.test.ts (PRIOR ART — not imported).
 * When a WASI SDK is discoverable (`WASI_SDK_PATH` env → `discoverWasiSdk()`),
 * this builds the scalar variant (the `ecc` target is `simd:false`) via the
 * frozen `build --pkg`, loads the emitted `ecc.wasm.js` through `AbiHost`,
 * asserts the zero-import invariant + the nine ABI exports, then drives:
 *
 *   - ECDSA keyGen (ECDSA-KeyGen-FIPS186-5): self-consistency — generate a key
 *     pair deterministically through the rng seam, then sign+verify a message
 *     under it. (ACVP keyGen uses rejection sampling over a random candidate
 *     scalar, NOT a seed→d KDF, so byte-for-byte d/qx/qy reproduction is not an
 *     ABI obligation — same class as the RSA keyGen note in shims/rsa.c.)
 *   - ECDSA sigGen (DetECDSA-SigGen-FIPS186-5): BearSSL's signer is deterministic
 *     RFC-6979, so r||s match the FIPS-186-5 *deterministic* ECDSA vectors
 *     BYTE-FOR-BYTE (the random-k ECDSA-SigGen vectors are NOT reproducible and
 *     are deliberately not used for byte equality).
 *   - ECDSA sigVer (ECDSA-SigVer-FIPS186-5): accept + expected-FAIL verdicts.
 *   - ECDH (KAS-ECC-1.0, P-521 staticUnified noKdfNoKc): shared-secret Z (the
 *     raw d·Q X coordinate) byte-for-byte against the internalProjection `z`.
 *     (The KAS-ECC-SSC-Sp800-56Ar3 on-disk corpus is binary-Koblitz-only —
 *     K-233/283/409 — so it cannot exercise the P-curve shim; KAS-ECC-1.0 is
 *     the prime-curve ECDH source on disk.)
 *   - fiat-crypto path cross-check: the shim's `wc_fiat_p256_ok` field
 *     round-trip is exercised by every keygen call (the W0③ 2·G-style proof
 *     that the machine-verified fiat field arithmetic is built and run).
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + vectors-on-disk, record the build
 *     + KAT as deferred; do NOT claim a pass.
 *   - build fails to LINK (e.g. an un-vendored BearSSL provider file) → the test
 *     FAILS with the wasm-ld diagnostic; do NOT mask it. (At authoring time the
 *     ECDSA legs need `vendor/bearssl/src/ec/ecdsa_i31_bits2int.c`, which task 02
 *     did not vendor — see the task-05 report `registrations_needed`.)
 *   - any byte mismatch / wrong verdict → the test FAILS.
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

const ACVP_DIR = join(REPO_ROOT, "references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files");
const KEYGEN_DIR = join(ACVP_DIR, "ECDSA-KeyGen-FIPS186-5");
const SIGGEN_DIR = join(ACVP_DIR, "DetECDSA-SigGen-FIPS186-5");
const SIGVER_DIR = join(ACVP_DIR, "ECDSA-SigVer-FIPS186-5");
const KAS_DIR = join(ACVP_DIR, "KAS-ECC-1.0");

// ─── ECC ABI constants ────────────────────────────────────────────────────────

const ABI_EXPORTS = [
    "memory",
    "alloc",
    "free",
    "ecdsa_keygen",
    "ecdsa_sign",
    "ecdsa_verify",
    "ecdh",
    "rng_stage",
    "rng_reset",
];

// curveId enum + field/order byte length per curve.
const CURVE_ID: Record<string, number> = { "P-256": 0, "P-384": 1, "P-521": 2 };
const FLEN: Record<string, number> = { "P-256": 32, "P-384": 48, "P-521": 66 };
// hashAlg → hashId (only the SHA-2 family the frozen ABI supports).
const HASH_ID: Record<string, number> = { "SHA2-256": 256, "SHA2-384": 384, "SHA2-512": 512 };

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
    if (!hex || hex.length === 0) return new Uint8Array(0);
    const h = hex.length % 2 ? "0" + hex : hex;
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function bytesToHex(b: Uint8Array): string {
    let s = "";
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
}

/** Left-pad (or check) a big-endian field element to `flen` bytes. */
function fieldBytes(hex: string, flen: number): Uint8Array {
    const raw = hexToBytes(hex);
    if (raw.length === flen) return raw;
    if (raw.length > flen) {
        // strip leading zeros down to flen
        const off = raw.length - flen;
        for (let i = 0; i < off; i++) if (raw[i] !== 0) throw new Error("field element too large");
        return raw.subarray(off);
    }
    const out = new Uint8Array(flen);
    out.set(raw, flen - raw.length);
    return out;
}

/** SEC1 uncompressed point 0x04 || X || Y. */
function sec1Point(xHex: string, yHex: string, flen: number): Uint8Array {
    const out = new Uint8Array(1 + 2 * flen);
    out[0] = 0x04;
    out.set(fieldBytes(xHex, flen), 1);
    out.set(fieldBytes(yHex, flen), 1 + flen);
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

/** Load the `ecc` data module of the built scalar variant from its emitted `.wasm.js`. */
async function loadVariant(host: AbiHost): Promise<LoadedWasm> {
    const mod = (await import(join(OUT_DIR, "ecc.wasm.js"))) as Record<string, WasmDataModule>;
    const dataModule = Object.values(mod).find(
        m => m && typeof m === "object" && "bytes" in m,
    );
    if (!dataModule) throw new Error("ecc.wasm.js: no wasm data module export found");
    return host.load(dataModule);
}

/** Stage deterministic entropy into the module seam (rng_stage). */
function stageEntropy(host: AbiHost, loaded: LoadedWasm, entropy: Uint8Array): void {
    const buf = host.withBytes(loaded, entropy);
    try {
        const rc = host.run(loaded, "rng_stage", [buf.ptr, entropy.length]);
        if (rc !== 0) throw new Error(`rng_stage rc=${rc}`);
    } finally {
        buf.free();
    }
}

/** Deterministic keygen: returns { pk (SEC1 point), sk (raw scalar) }. */
function keygen(
    host: AbiHost,
    loaded: LoadedWasm,
    curve: string,
    seed: Uint8Array,
): { pk: Uint8Array; sk: Uint8Array } {
    const flen = FLEN[curve]!;
    stageEntropy(host, loaded, seed);
    const pkOut = host.withBytes(loaded, new Uint8Array(1 + 2 * flen));
    const skOut = host.withBytes(loaded, new Uint8Array(flen));
    try {
        const rc = host.run(loaded, "ecdsa_keygen", [CURVE_ID[curve]!, pkOut.ptr, skOut.ptr]);
        if (rc !== 0) throw new Error(`ecdsa_keygen rc=${rc}`);
        return {
            pk: host.readBytes(loaded, pkOut.ptr, 1 + 2 * flen),
            sk: host.readBytes(loaded, skOut.ptr, flen),
        };
    } finally {
        skOut.free();
        pkOut.free();
    }
}

function sign(
    host: AbiHost,
    loaded: LoadedWasm,
    curve: string,
    hashId: number,
    sk: Uint8Array,
    msg: Uint8Array,
): Uint8Array {
    const flen = FLEN[curve]!;
    const skIn = host.withBytes(loaded, sk);
    const msgIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    const sigOut = host.withBytes(loaded, new Uint8Array(2 * flen));
    try {
        const rc = host.run(loaded, "ecdsa_sign", [
            CURVE_ID[curve]!, hashId, skIn.ptr, msgIn.ptr, msg.length, sigOut.ptr,
        ]);
        if (rc !== 0) throw new Error(`ecdsa_sign rc=${rc}`);
        return host.readBytes(loaded, sigOut.ptr, 2 * flen);
    } finally {
        sigOut.free();
        msgIn.free();
        skIn.free();
    }
}

function verify(
    host: AbiHost,
    loaded: LoadedWasm,
    curve: string,
    hashId: number,
    pk: Uint8Array,
    sig: Uint8Array,
    msg: Uint8Array,
): number {
    const pkIn = host.withBytes(loaded, pk);
    const sigIn = host.withBytes(loaded, sig);
    const msgIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    try {
        return host.run(loaded, "ecdsa_verify", [
            CURVE_ID[curve]!, hashId, pkIn.ptr, sigIn.ptr, msgIn.ptr, msg.length,
        ]);
    } finally {
        msgIn.free();
        sigIn.free();
        pkIn.free();
    }
}

function ecdh(
    host: AbiHost,
    loaded: LoadedWasm,
    curve: string,
    sk: Uint8Array,
    pk: Uint8Array,
): Uint8Array {
    const flen = FLEN[curve]!;
    const skIn = host.withBytes(loaded, sk);
    const pkIn = host.withBytes(loaded, pk);
    const out = host.withBytes(loaded, new Uint8Array(flen));
    try {
        const rc = host.run(loaded, "ecdh", [CURVE_ID[curve]!, skIn.ptr, pkIn.ptr, out.ptr]);
        if (rc !== 0) throw new Error(`ecdh rc=${rc}`);
        return host.readBytes(loaded, out.ptr, flen);
    } finally {
        out.free();
        pkIn.free();
        skIn.free();
    }
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

describe("ecc manifest wiring", () => {
    test("targets.json `ecc` retargeted to shims/ecc.c over fiat-crypto + BearSSL EC", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "ecc");
        expect(t, "no ecc target").toBeDefined();
        // shims.test.ts pins source==fiat-crypto + cflags contain fiat-crypto.
        expect(t!.source).toBe("fiat-crypto");
        expect(t!.sourceKind).toBe("vendored-fork");
        expect(t!.shim).toBe("shims/ecc.c");
        expect(t!.cflags.join(" ")).toContain("fiat-crypto");
        // BearSSL EC framing + fiat field + rng seam in cSources.
        expect(t!.cSources.some(c => c.includes("ec/ec_prime_i31.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("ecdsa_i31_sign_raw.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("ecdsa_i31_vrfy_raw.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("fiat-crypto/fiat-c/src/p256_64.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/rng/rng.c"))).toBe(true);
        expect(t!.simd).toBe(false);
        // The frozen 4-export ECC ABI (+ memory/alloc/free + rng seam) is declared.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
    });

    test("ECDSA + ECDH ACVP vectors exist on disk", async () => {
        for (const d of [KEYGEN_DIR, SIGGEN_DIR, SIGVER_DIR, KAS_DIR]) {
            expect(await Bun.file(join(d, "prompt.json")).exists(), `${d}/prompt.json`).toBe(true);
            expect(await Bun.file(join(d, "expectedResults.json")).exists(), `${d}/expectedResults.json`).toBe(true);
        }
        const sg = JSON.parse(await Bun.file(join(SIGGEN_DIR, "prompt.json")).text());
        expect(sg.algorithm).toBe("DetECDSA");
        expect(sg.revision).toBe("FIPS186-5");
    });
});

// ─── Build + KAT (toolchain-gated) ────────────────────────────────────────────

describe("ecc build + ECDSA/ECDH ACVP KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, ECDSA keyGen/sigGen/sigVer + ECDH KAT", async () => {
        if (katDeferral("ecc", toolchainPresent)) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build (simd:false → scalar only). A LINK failure (e.g. an un-vendored
        //    BearSSL provider TU) is NOT masked — exit code must be 0. ──
        const code = await runWasmCrypto({ args: ["build", "--pkg", PKG_DIR, "--target", "ecc"], config: cfg });
        expect(code, "wasm-crypto build ecc exit code (link must succeed)").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced scalar binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "ecc.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) {
            expect(exports.has(e), `scalar missing export ${e}`).toBe(true);
        }

        // ── KAT through the emitted data module (AbiHost). ──
        const host = new AbiHost();
        const loaded = await loadVariant(host);

        const curves = ["P-256", "P-384", "P-521"];

        // ===== ECDSA keyGen self-consistency (rng-seam deterministic) =====
        // ACVP keyGen is rejection sampling over a random candidate scalar — not a
        // seed→d KDF — so we verify the ABI invariant (a generated key is internally
        // consistent: sign+verify under it) rather than byte-equality with NIST d.
        let keygenChecked = 0;
        for (const curve of curves) {
            const flen = FLEN[curve]!;
            // Generous entropy so the rejection-sampling loop never under-drains.
            const seed = new Uint8Array(flen * 8).map((_, i) => (i * 31 + 7) & 0xff);
            const { pk, sk } = keygen(host, loaded, curve, seed);
            expect(pk.length, `${curve} pk len`).toBe(1 + 2 * flen);
            expect(pk[0], `${curve} pk SEC1 prefix`).toBe(0x04);
            expect(sk.length, `${curve} sk len`).toBe(flen);
            const msg = new Uint8Array(32).map((_, i) => (i * 13 + 1) & 0xff);
            const sig = sign(host, loaded, curve, 256, sk, msg);
            expect(verify(host, loaded, curve, 256, pk, sig, msg), `${curve} self sign/verify`).toBe(0);
            keygenChecked++;
        }
        expect(keygenChecked, "keyGen self-consistency curves").toBe(3);

        // ===== ECDSA sigGen byte-for-byte (DetECDSA, RFC-6979) =====
        const sgPrompt = JSON.parse(await Bun.file(join(SIGGEN_DIR, "prompt.json")).text());
        const sgInternal = JSON.parse(await Bun.file(join(SIGGEN_DIR, "internalProjection.json")).text());
        const sgExpected = indexExpected(
            JSON.parse(await Bun.file(join(SIGGEN_DIR, "expectedResults.json")).text()),
        );
        // internalProjection carries the per-group private key `d`.
        const sgGroupD = new Map<number, { curve: string; hashAlg: string; d: string }>();
        for (const g of sgInternal.testGroups ?? []) {
            sgGroupD.set(g.tgId, { curve: g.curve, hashAlg: g.hashAlg, d: g.d });
        }
        let sigGenChecked = 0;
        const sigGenPerCurve = new Map<string, number>(); // curve -> byte-for-byte hits
        const PER_CURVE_CAP = 3;
        for (const g of sgPrompt.testGroups ?? []) {
            const meta = sgGroupD.get(g.tgId);
            if (!meta) continue;
            const curve = g.curve as string;
            const hashId = HASH_ID[g.hashAlg as string];
            if (!(curve in CURVE_ID) || hashId === undefined) continue; // SHA-2 256/384/512 only
            // Skip SP800-106 "message randomization" groups: those prepend a random
            // bit string before hashing, so a plain (non-randomized) DetECDSA signer
            // CANNOT reproduce r||s byte-for-byte. The shim implements standard
            // RFC-6979 DetECDSA — validate it against the non-conformance groups only.
            if (g.conformance) continue;
            if ((sigGenPerCurve.get(curve) ?? 0) >= PER_CURVE_CAP) continue; // cap per-curve work
            const flen = FLEN[curve]!;
            const sk = fieldBytes(meta.d, flen);
            for (const t of g.tests ?? []) {
                const exp = sgExpected.get(`${g.tgId}:${t.tcId}`);
                if (!exp) continue;
                const msg = hexToBytes(t.message);
                const sig = sign(host, loaded, curve, hashId, sk, msg);
                const r = bytesToHex(sig.subarray(0, flen));
                const s = bytesToHex(sig.subarray(flen));
                expect(r, `DetECDSA ${curve}/${g.hashAlg} tc ${t.tcId} r`).toBe(
                    bytesToHex(fieldBytes(exp.r as string, flen)),
                );
                expect(s, `DetECDSA ${curve}/${g.hashAlg} tc ${t.tcId} s`).toBe(
                    bytesToHex(fieldBytes(exp.s as string, flen)),
                );
                sigGenChecked++;
                sigGenPerCurve.set(curve, (sigGenPerCurve.get(curve) ?? 0) + 1);
                if ((sigGenPerCurve.get(curve) ?? 0) >= PER_CURVE_CAP) break;
            }
        }
        expect(sigGenChecked, "DetECDSA sigGen vectors checked byte-for-byte").toBeGreaterThan(0);
        // Prove all three supported curves were exercised byte-for-byte.
        for (const curve of curves) {
            expect(
                sigGenPerCurve.get(curve) ?? 0,
                `DetECDSA sigGen byte-for-byte hits for ${curve}`,
            ).toBeGreaterThan(0);
        }

        // ===== ECDSA sigVer (accept + expected-FAIL) =====
        const svPrompt = JSON.parse(await Bun.file(join(SIGVER_DIR, "prompt.json")).text());
        const svExpected = indexExpected(
            JSON.parse(await Bun.file(join(SIGVER_DIR, "expectedResults.json")).text()),
        );
        let svAccept = 0;
        let svReject = 0;
        for (const g of svPrompt.testGroups ?? []) {
            const curve = g.curve as string;
            const hashId = HASH_ID[g.hashAlg as string];
            if (!(curve in CURVE_ID) || hashId === undefined) continue;
            const flen = FLEN[curve]!;
            for (const t of g.tests ?? []) {
                const exp = svExpected.get(`${g.tgId}:${t.tcId}`);
                if (!exp) continue;
                const pk = sec1Point(t.qx, t.qy, flen);
                const sig = new Uint8Array(2 * flen);
                sig.set(fieldBytes(t.r, flen), 0);
                sig.set(fieldBytes(t.s, flen), flen);
                const msg = hexToBytes(t.message);
                const rc = verify(host, loaded, curve, hashId, pk, sig, msg);
                if (exp.testPassed === true) {
                    expect(rc, `sigVer ${curve}/${g.hashAlg} tc ${t.tcId} must accept`).toBe(0);
                    svAccept++;
                } else {
                    expect(rc, `sigVer ${curve}/${g.hashAlg} tc ${t.tcId} must reject`).not.toBe(0);
                    svReject++;
                }
                if (svAccept >= 6 && svReject >= 6) break;
            }
            if (svAccept >= 6 && svReject >= 6) break;
        }
        expect(svAccept, "sigVer accept vectors checked").toBeGreaterThan(0);
        expect(svReject, "sigVer expected-FAIL vectors checked").toBeGreaterThan(0);

        // ===== ECDH (KAS-ECC-1.0 P-521 staticUnified noKdfNoKc) byte-for-byte Z =====
        const kasInternal = JSON.parse(await Bun.file(join(KAS_DIR, "internalProjection.json")).text());
        let ecdhChecked = 0;
        for (const g of kasInternal.testGroups ?? []) {
            const curve = g.curve as string;
            if (!(curve in CURVE_ID)) continue; // P-256/384/521 only (corpus has P-521)
            if (g.kasMode !== "noKdfNoKc") continue; // raw Z = X(d·Q), no KDF
            if (g.scheme !== "staticUnified") continue; // single static d·Q multiply
            const flen = FLEN[curve]!;
            for (const t of g.tests ?? []) {
                if (!t.z || !t.staticPrivateIut) continue;
                const sk = fieldBytes(t.staticPrivateIut, flen);
                const peer = sec1Point(t.staticPublicServerX, t.staticPublicServerY, flen);
                const z = ecdh(host, loaded, curve, sk, peer);
                expect(bytesToHex(z), `ECDH ${curve} tc ${t.tcId} Z`).toBe(
                    bytesToHex(fieldBytes(t.z as string, flen)),
                );
                ecdhChecked++;
                if (ecdhChecked >= 4) break;
            }
            if (ecdhChecked >= 4) break;
        }
        expect(ecdhChecked, "ECDH KAS-ECC P-curve vectors checked byte-for-byte").toBeGreaterThan(0);

        console.warn(
            `[ecc.kat] ACVP byte-for-byte OK — keyGen self-consistent=${keygenChecked} ` +
                `DetECDSA sigGen=${sigGenChecked} sigVer accept=${svAccept}/reject=${svReject} ` +
                `ECDH=${ecdhChecked} (fiat-crypto field path exercised via keygen).`,
        );
    }, 180_000);
});
