// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * argon2.kat.test.ts — package-local build + zero-import + ABI + RFC 9106 KAT
 * for the OWN C23 Argon2id core (shims/argon2.c over csrc/argon2/ over the OWN
 * csrc/blake2/ BLAKE2b lib from task 04; targets.json `argon2`, retargeted off
 * the vendored P-H-C reference to `sourceKind:"own"`).
 *
 * Toolchain-gated, mirroring shims/blake2b.kat.test.ts (PRIOR ART — not
 * imported). When a WASI SDK is discoverable (`WASI_SDK_PATH` env →
 * `discoverWasiSdk()`), this builds the scalar variant (argon2 is `simd:false`
 * — the memory-hard fill dominates, OQ-3) via the frozen `build --pkg`, then:
 *
 *   - asserts the zero-import invariant + the 4 ABI exports
 *     (memory/alloc/free/argon2id_hash),
 *   - validates the RFC 9106 §5.3 Argon2id test vector byte-for-byte
 *     (t=3, m=32 KiB, p=4 lanes, 32-byte tag; password/salt/secret/ad as
 *     documented → the documented tag),
 *   - asserts the bad-param → negative contract (t=0 / p=0 / m below the 8·p
 *     floor / outLen<4).
 *
 * The KAT anchor lives at references/SPEC/RFC/rfc9106.txt (RFC 9106 §5.3 — the
 * Argon2id vector is transcribed inline here, the same way the other shim KATs
 * transcribe their RFC literals; the .txt is never read at runtime per the
 * testing convention — vector data is vendored inline).
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + KAT anchor on disk, record the
 *     build + KAT as deferred; do NOT claim a pass.
 *   - any byte mismatch / unexpected status → the test FAILS.
 *   - arena ceiling: the RFC §5.3 vector's m' matrix is 32 KiB (32 blocks ×
 *     1024 B), far under the 16 MiB arena — it fits. A vector whose m' exceeded
 *     the host arena would make the shim return ARGON2_ERR_MEMORY (recorded,
 *     never silently capped).
 *
 * Constant-time note: pass-0 first-half addressing is data-independent of the
 * password/salt/secret (Argon2i indexing). The in-engine CT proof is
 * acvp-wasm-ct-fuzz's job (G2) — this test does NOT self-attest CT as a pass.
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

const RFC9106_TXT = join(REPO_ROOT, "references/SPEC/RFC/rfc9106.txt");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "argon2id_hash"];

// ─── RFC 9106 §5.3 Argon2id KAT (transcribed; .txt never read at runtime) ─────

// Memory: 32 KiB, Passes: 3, Parallelism: 4 lanes, Tag length: 32 bytes.
const KAT_T = 3;
const KAT_M = 32;
const KAT_P = 4;
const KAT_OUTLEN = 32;
const KAT_PWD = new Uint8Array(32).fill(0x01);
const KAT_SALT = new Uint8Array(16).fill(0x02);
const KAT_SECRET = new Uint8Array(8).fill(0x03);
const KAT_AD = new Uint8Array(12).fill(0x04);
const KAT_TAG =
    "0d640df58d78766c08c037a34a8b53c9" + "d01ef0452d75b65eb52520e96b01e659";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

/** Load the scalar variant directly from its raw `.wasm` bytes. */
async function loadScalar(host: AbiHost): Promise<LoadedWasm> {
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "argon2.scalar.wasm")).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "argon2Wasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: false,
    };
    return host.load(dataModule);
}

/**
 * Marshal one argon2id_hash(pwd, salt, secret, ad, t, m, p, outLen) → tag and
 * read back the tag bytes. Throws on a non-zero status (callers probing the
 * bad-param contract use `argon2Status`).
 */
function argon2(
    host: AbiHost,
    loaded: LoadedWasm,
    pwd: Uint8Array,
    salt: Uint8Array,
    secret: Uint8Array,
    ad: Uint8Array,
    t: number,
    m: number,
    p: number,
    outLen: number,
): Uint8Array {
    const pwdIn = host.withBytes(loaded, pwd.length ? pwd : new Uint8Array(1));
    const saltIn = host.withBytes(loaded, salt.length ? salt : new Uint8Array(1));
    const secIn = host.withBytes(loaded, secret.length ? secret : new Uint8Array(1));
    const adIn = host.withBytes(loaded, ad.length ? ad : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(outLen || 1));
    try {
        const rc = host.run(loaded, "argon2id_hash", [
            pwdIn.ptr, pwd.length,
            saltIn.ptr, salt.length,
            secIn.ptr, secret.length,
            adIn.ptr, ad.length,
            t, m, p,
            out.ptr, outLen,
        ]);
        if (rc !== 0) throw new Error(`argon2id_hash rc=${rc}`);
        return host.readBytes(loaded, out.ptr, outLen);
    } finally {
        out.free();
        adIn.free();
        secIn.free();
        saltIn.free();
        pwdIn.free();
    }
}

/** Raw status of argon2id_hash() — used to assert the bad-param contract. */
function argon2Status(
    host: AbiHost,
    loaded: LoadedWasm,
    t: number,
    m: number,
    p: number,
    outLen: number,
): number {
    const buf = host.withBytes(loaded, new Uint8Array(16));
    const out = host.withBytes(loaded, new Uint8Array(Math.max(1, outLen)));
    try {
        return host.run(loaded, "argon2id_hash", [
            buf.ptr, 16, buf.ptr, 16, buf.ptr, 0, buf.ptr, 0, t, m, p, out.ptr, outLen,
        ]);
    } finally {
        out.free();
        buf.free();
    }
}

// ─── Toolchain discovery ──────────────────────────────────────────────────────

let wasiSdkPath = "";
let toolchainPresent = false;
/** Set once this run has rebuilt `dist/argon2.scalar.wasm` from source. */
let builtThisRun = false;

/** Build the scalar variant unless an earlier test of this run already did. */
async function ensureBuilt(): Promise<void> {
    if (builtThisRun) return;
    const code = await runWasmCrypto({
        args: ["build", "--pkg", PKG_DIR, "--target", "argon2"],
        config: await makeConfig(wasiSdkPath),
    });
    expect(code, "wasm-crypto build argon2 exit code").toBe(0);
    builtThisRun = true;
}

beforeAll(async () => {
    const envPath = process.env["WASI_SDK_PATH"];
    wasiSdkPath = envPath ? envPath : ((await discoverWasiSdk()) ?? "");
    if (wasiSdkPath) {
        const clang = await resolveClang(await makeConfig(wasiSdkPath));
        toolchainPresent = clang !== null;
    }
});

// ─── Manifest + anchor presence (toolchain-independent) ───────────────────────

describe("argon2 manifest wiring", () => {
    test("targets.json `argon2` retargeted to the own C23 Argon2id core", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "argon2");
        expect(t, "no argon2 target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own bascule: source/shim retargeted off the vendored P-H-C reference.
        expect(t!.source).toBe("own-argon2");
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/argon2.c");
        // The own C23 core + the consumed own BLAKE2b lib (task 04) are compiled
        // in; the vendored argon2 TUs are gone.
        expect(t!.cSources.some(c => c.includes("csrc/argon2/argon2.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/blake2/blake2b.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("vendor/argon2"))).toBe(false);
        // own → cStdFor binds c23; cStd MUST be unset; -I<pkgDir> auto-spliced.
        expect(t!.cStd).toBeUndefined();
        expect(t!.cflags).toEqual([]);
        // The memory-hard fill dominates → scalar (OQ-3).
        expect(t!.simd).toBe(false);
        // The frozen 4-export ABI.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
        // Vectors pinned to the on-disk RFC 9106 form (not the absent .json).
        expect(t!.vectors).toEqual(["references/SPEC/RFC/rfc9106.txt"]);
    });

    test("RFC 9106 KAT anchor exists on disk", async () => {
        expect(await Bun.file(RFC9106_TXT).exists(), "rfc9106.txt").toBe(true);
    });

    test("shim exports the frozen argon2id_hash() ABI over the own core", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "argon2.c")).text();
        expect(src).toContain("int argon2id_hash(");
        expect(src).toContain('#include "csrc/argon2/argon2.h"');
        expect(src).toContain('#include "_arena.h"');
        // The frozen 13-arg ABI (pwd/salt/secret/ad + t/m/p + out).
        expect(src).toContain("secretPtr");
        expect(src).toContain("adPtr");
        expect(src).toContain("argon2id_core");
        // Bound to the own core, not the vendored P-H-C reference entry points.
        expect(src).not.toContain("argon2id_ctx");
    });

    test("own argon2 core consumes (not duplicates) the own BLAKE2b lib", async () => {
        const c = await Bun.file(join(PKG_DIR, "csrc/argon2/argon2.c")).text();
        // H0 / H' run over the own BLAKE2b core, included read-only.
        expect(c).toContain('#include "csrc/blake2/blake2b.h"');
        expect(c).toContain("blake2b_init_param");
        expect(c).toContain("blake2b_long");
        // BLAKE2b is NOT re-implemented (no compression / sigma table copied in).
        expect(c).not.toContain("blake2b_sigma");
        expect(c).not.toContain("blake2b_compress");
    });
});

// ─── Build + RFC 9106 KAT (toolchain-gated) ───────────────────────────────────

describe("argon2 build + RFC 9106 KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, RFC 9106 §5.3 KAT byte-for-byte", async () => {
        if (katDeferral("argon2", toolchainPresent, "RFC 9106 KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build the scalar variant (simd:false → scalar only). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "argon2"],
            config: cfg,
        });
        expect(code, "wasm-crypto build argon2 exit code").toBe(0);
        builtThisRun = true;

        // ── Zero-import + ABI-export invariants on the produced binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "argon2.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) expect(exports.has(e), `scalar missing export ${e}`).toBe(true);

        const host = new AbiHost();
        const scalar = await loadScalar(host);

        // ── RFC 9106 §5.3 Argon2id KAT byte-for-byte. ──
        const tag = argon2(host, scalar, KAT_PWD, KAT_SALT, KAT_SECRET, KAT_AD, KAT_T, KAT_M, KAT_P, KAT_OUTLEN);
        expect(bytesToHex(tag), "RFC 9106 §5.3 Argon2id tag").toBe(KAT_TAG);

        // ── Determinism: a second call yields the identical tag. ──
        const tag2 = argon2(host, scalar, KAT_PWD, KAT_SALT, KAT_SECRET, KAT_AD, KAT_T, KAT_M, KAT_P, KAT_OUTLEN);
        expect(bytesToHex(tag2), "argon2id determinism").toBe(KAT_TAG);

        // ── Bad-param → negative contract. ──
        expect(argon2Status(host, scalar, 0, 32, 4, 32), "t=0 bad").toBeLessThan(0);
        expect(argon2Status(host, scalar, 3, 32, 0, 32), "p=0 bad").toBeLessThan(0);
        expect(argon2Status(host, scalar, 3, 8, 4, 32), "m below 8·p floor bad").toBeLessThan(0);
        expect(argon2Status(host, scalar, 3, 32, 4, 3), "outLen<4 bad").toBeLessThan(0);

        // ── A second valid param set differs from the KAT tag (sanity). ──
        const tagAlt = argon2(host, scalar, KAT_PWD, KAT_SALT, new Uint8Array(0), new Uint8Array(0), 3, 32, 4, 32);
        expect(bytesToHex(tagAlt) === KAT_TAG, "no-secret/no-ad must differ from the full KAT").toBe(false);

        console.warn(
            "[argon2.kat] RFC 9106 §5.3 Argon2id tag byte-for-byte OK " +
                "(t=3, m=32 KiB, p=4 lanes, 32-byte tag); determinism + bad-param contract OK.",
        );
    }, 300_000);
});

// ─── OWASP parameters beyond the 16 MiB arena (BL-1843, tools/LIGHT_62) ───────
//
// The OWASP Password Storage Cheat Sheet's two Argon2id rows: m=19456 KiB
// (19 MiB), t=2, p=1 and m=47104 KiB (47 MiB), t=1, p=1. Both block matrices
// exceed the shared 16 MiB arena (`_arena.h`), so the shim takes the matrix
// from linear memory grown for the call instead. Expected tags: the pure-JS
// fw `crypto/hash/argon2` module, cross-checked against Node's OpenSSL
// `crypto.argon2Sync` (both agree byte-for-byte):
//   pwd = 32 × 0x01, salt = 16 × 0x02, no secret, no ad, 32-byte tag.

const OWASP_19M = { t: 2, m: 19456, p: 1, tag: "551d2b516a3d92963b2cd1e8fdc17251" + "29e15824dfb6c8d9bb8a599ffcabfc1c" };
const OWASP_47M = { t: 1, m: 47104, p: 1, tag: "e02aa2fa10a4b7901d5fd54a9f936859" + "0c591b23d57a457a63ce12a5cff461c9" };

/** The documented ceiling: the largest `m` (KiB) the binary accepts — 1 GiB. */
const MAX_MEMORY_KIB = 1024 * 1024;
const ARGON2_ERR_PARAM = -1;

describe("argon2 OWASP parameters beyond the arena (toolchain-gated)", () => {
    test("19 MiB / 2 passes and 47 MiB / 1 pass match the pure-JS tags; ceiling refused; small call after", async () => {
        if (katDeferral("argon2", toolchainPresent, "OWASP legs")) return;
        await ensureBuilt();

        const host = new AbiHost();
        const scalar = await loadScalar(host);
        const none = new Uint8Array(0);

        // ── OWASP leg 1: 19 MiB, 2 passes. ──
        const a = argon2(host, scalar, KAT_PWD, KAT_SALT, none, none, OWASP_19M.t, OWASP_19M.m, OWASP_19M.p, 32);
        expect(bytesToHex(a), "OWASP 19 MiB / 2 passes").toBe(OWASP_19M.tag);

        // ── OWASP leg 2: 47 MiB, 1 pass (the matrix region grows). ──
        const b = argon2(host, scalar, KAT_PWD, KAT_SALT, none, none, OWASP_47M.t, OWASP_47M.m, OWASP_47M.p, 32);
        expect(bytesToHex(b), "OWASP 47 MiB / 1 pass").toBe(OWASP_47M.tag);
        const grown = scalar.mem.buffer.byteLength;
        expect(grown, "linear memory holds the 47 MiB matrix").toBeGreaterThanOrEqual(OWASP_47M.m * 1024);

        // ── A smaller call reuses the grown region: no further growth. ──
        const a2 = argon2(host, scalar, KAT_PWD, KAT_SALT, none, none, OWASP_19M.t, OWASP_19M.m, OWASP_19M.p, 32);
        expect(bytesToHex(a2), "OWASP 19 MiB after 47 MiB").toBe(OWASP_19M.tag);
        expect(scalar.mem.buffer.byteLength, "region reused, memory not grown again").toBe(grown);

        // ── The ceiling: refused up front with ARGON2_ERR_PARAM, nothing grown. ──
        expect(argon2Status(host, scalar, 1, MAX_MEMORY_KIB + 1, 1, 32), "m above the ceiling").toBe(ARGON2_ERR_PARAM);
        expect(argon2Status(host, scalar, 1, 0x7fffffff, 1, 32), "m at INT_MAX").toBe(ARGON2_ERR_PARAM);
        expect(scalar.mem.buffer.byteLength, "a refused call grows nothing").toBe(grown);

        // ── A small call after the large ones: arena + cursor intact. ──
        const kat = argon2(host, scalar, KAT_PWD, KAT_SALT, KAT_SECRET, KAT_AD, KAT_T, KAT_M, KAT_P, KAT_OUTLEN);
        expect(bytesToHex(kat), "RFC 9106 §5.3 after the OWASP calls").toBe(KAT_TAG);

        console.warn(
            "[argon2.kat] OWASP 19 MiB/t=2 + 47 MiB/t=1 tags OK (grown matrix region, " +
                `${grown} bytes of linear memory); ceiling ${MAX_MEMORY_KIB} KiB refused above; KAT after OK.`,
        );
    }, 300_000);
});

// ─── Segment-addressing regression (BL-1843, tools/LIGHT_62) ──────────────────
//
// The RFC 9106 §5.3 vector has a segment length of 2, so slice 0 of pass 0
// fills no block and the address-word cursor of the data-independent phase is
// never exercised there. The own core started that cursor at word 0 instead
// of word 2 (RFC 9106 §3.4.1.2: block i takes word i mod 128), which diverged
// from RFC 9106 for every segment length ≥ 4 — every realistic parameter set.
// These shapes pin the fix; tags quoted from Node's OpenSSL `crypto.argon2Sync`
// (an independent implementation), pwd = 32 × 0x01, salt = 16 × 0x02, no
// secret, no ad, 32-byte tag. The last two have `m` not a multiple of 4·p.

const SEGMENT_SHAPES = [
    { t: 1, m: 16, p: 1, tag: "8fb24849a32603a29bc4f7977557638157e540b82c230966c66d0a517df638a6" },
    { t: 3, m: 32, p: 1, tag: "30e0b44b7e23423b7282859ea36f02825b5828dde3c25f124d59d42d7235e132" },
    { t: 3, m: 64, p: 2, tag: "491e4e07b4d0a1ca19778a7388c6cbd6aa6ca07033dda98047818a7d6e18e551" },
    { t: 3, m: 128, p: 4, tag: "1f2c769bc643bac9f9e91ee2cbed66e5722a260cbf5b904e06695e8d6b89f1ce" },
    { t: 3, m: 1000, p: 3, tag: "75cb1f00d1c6c6ef11c03a79bdef96f66e3ef6200b783c443972446211ce2ce8" },
    { t: 1, m: 4096, p: 7, tag: "c1a045a69706fa3f1bd0c2e7753738140d5621743cc95a22f2db8ea53827e626" },
];

describe("argon2 segment addressing vs an independent implementation (toolchain-gated)", () => {
    test("segment lengths ≥ 4 match OpenSSL argon2id byte-for-byte", async () => {
        if (katDeferral("argon2", toolchainPresent, "segment-addressing vectors")) return;
        await ensureBuilt();

        const host = new AbiHost();
        const scalar = await loadScalar(host);
        const none = new Uint8Array(0);
        for (const v of SEGMENT_SHAPES) {
            const tag = argon2(host, scalar, KAT_PWD, KAT_SALT, none, none, v.t, v.m, v.p, 32);
            expect(bytesToHex(tag), `t=${v.t} m=${v.m} p=${v.p}`).toBe(v.tag);
        }
    }, 300_000);
});
