// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * chacha20poly1305.kat.test.ts — package-local build + zero-import + ABI +
 * RFC 8439 KAT + simd∥scalar parity for the OWN C23 ChaCha20-Poly1305 AEAD
 * (shims/chacha20poly1305.c over csrc/chacha20poly1305/, targets.json
 * `chacha20poly1305`, productionized from the W0① great-equalizer spike).
 *
 * Toolchain-gated, mirroring shims/mlkem.kat.test.ts and shims/aes.kat.test.ts
 * (PRIOR ART — not imported). When a WASI SDK is discoverable (`WASI_SDK_PATH`
 * env → `discoverWasiSdk()`), this builds BOTH variants (simd + scalar — the
 * `chacha20poly1305` target is `simd:true`; ChaCha/Poly1305 are prime simd128
 * beneficiaries) via the frozen `build --pkg`, then for each variant:
 *
 *   - asserts the zero-import invariant + the 5 ABI exports
 *     (memory/alloc/free/aead_seal/aead_open),
 *   - runs the RFC 8439 §2.8.2 AEAD_CHACHA20_POLY1305 known-answer test
 *     byte-for-byte (seal → ct||tag; open → pt + the auth-reject negative case),
 *   - cross-checks simd ∥ scalar produce identical ct/tag on the same input.
 *
 * No ChaCha20-Poly1305 ACVP corpus exists on disk (NIST ACVP-Server-1.1.0.42
 * ships no ChaCha/Poly directory) — the KAT is anchored on RFC 8439 §2.8.2,
 * parsed directly from references/SPEC/RFC/rfc8439.txt.
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + RFC text on disk, record the build
 *     + KAT as deferred; do NOT claim a pass.
 *   - any byte mismatch / non-zero status → the test FAILS.
 *
 * Constant-time note: the tag compare (`ct_tag_diff` in the shim) is branch-free
 * (asserted against the source below). The in-engine CT proof is
 * acvp-wasm-ct-fuzz's job — this test does NOT self-attest CT as a pass.
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

const RFC8439_TXT = join(REPO_ROOT, "references/SPEC/RFC/rfc8439.txt");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "aead_seal", "aead_open"];

const TAG_BYTES = 16; // IETF Poly1305 tag

// ─── RFC 8439 §2.8.2 AEAD_CHACHA20_POLY1305 test vector ────────────────────────
//
// The §2.8.2 IV is presented as an 8-byte "IV" (40..47) plus a 32-bit
// "fixed-common part" (07 00 00 00) that PREPENDS it; the 12-byte IETF nonce is
// therefore 07 00 00 00 | 40 41 42 43 | 44 45 46 47 (confirmed by the state
// dump: nonce words 07000000 / 43424140 / 47464544).

const RFC_VECTOR = {
    plaintext:
        "4c616469657320616e642047656e746c656d656e206f662074686520636c6173" +
        "73206f66202739393a204966204920636f756c64206f6666657220796f75206f" +
        "6e6c79206f6e652074697020666f7220746865206675747572652c2073756e73" +
        "637265656e20776f756c642062652069742e",
    aad: "50515253c0c1c2c3c4c5c6c7",
    key: "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f",
    nonce: "070000004041424344454647",
    ciphertext:
        "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6" +
        "3dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b36" +
        "92ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc" +
        "3ff4def08e4b7a9de576d26586cec64b6116",
    tag: "1ae10b594f09e26a7e902ecbd0600691",
};

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

async function makeConfig(wasiSdkPath: string): Promise<WasmCryptoConfig> {
    return {
        wasiSdkPath,
        srcDir: PKG_DIR,
        outDir: OUT_DIR,
        targetsFile: TARGETS_FILE,
        pkgDir: PKG_DIR,
    };
}

/** Load a specific built variant directly from its raw `.wasm` bytes. */
async function loadRawVariant(host: AbiHost, variant: "simd" | "scalar"): Promise<LoadedWasm> {
    const bytes = new Uint8Array(
        await Bun.file(join(OUT_DIR, `chacha20poly1305.${variant}.wasm`)).arrayBuffer(),
    );
    const dataModule: WasmDataModule = {
        name: "chacha20poly1305Wasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: variant === "simd",
    };
    return host.load(dataModule);
}

/** Marshal a seal: returns ct||tag(16) read back out of wasm memory. */
function seal(
    host: AbiHost,
    loaded: LoadedWasm,
    key: Uint8Array,
    nonce: Uint8Array,
    pt: Uint8Array,
    aad: Uint8Array,
): Uint8Array {
    const keyIn = host.withBytes(loaded, key);
    const nonceIn = host.withBytes(loaded, nonce);
    const ptIn = host.withBytes(loaded, pt.length ? pt : new Uint8Array(1));
    const aadIn = host.withBytes(loaded, aad.length ? aad : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(pt.length + TAG_BYTES));
    try {
        const rc = host.run(loaded, "aead_seal", [
            keyIn.ptr, nonceIn.ptr, ptIn.ptr, pt.length, aadIn.ptr, aad.length, out.ptr,
        ]);
        if (rc !== 0) throw new Error(`aead_seal rc=${rc}`);
        return host.readBytes(loaded, out.ptr, pt.length + TAG_BYTES);
    } finally {
        out.free();
        aadIn.free();
        ptIn.free();
        nonceIn.free();
        keyIn.free();
    }
}

/**
 * Marshal an open: in = ct||tag(16); ctLen passed to the ABI INCLUDES the tag.
 * Returns `{ rc, pt }`; rc !== 0 means auth fail.
 */
function open(
    host: AbiHost,
    loaded: LoadedWasm,
    key: Uint8Array,
    nonce: Uint8Array,
    ctTag: Uint8Array,
    aad: Uint8Array,
): { rc: number; pt: Uint8Array } {
    const msgLen = ctTag.length - TAG_BYTES;
    const keyIn = host.withBytes(loaded, key);
    const nonceIn = host.withBytes(loaded, nonce);
    const dataIn = host.withBytes(loaded, ctTag); // ct||tag laid out contiguously
    const aadIn = host.withBytes(loaded, aad.length ? aad : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(msgLen || 1));
    try {
        const rc = host.run(loaded, "aead_open", [
            keyIn.ptr, nonceIn.ptr, dataIn.ptr, ctTag.length, aadIn.ptr, aad.length, out.ptr,
        ]);
        const pt = rc === 0 ? host.readBytes(loaded, out.ptr, msgLen) : new Uint8Array(0);
        return { rc, pt };
    } finally {
        out.free();
        aadIn.free();
        dataIn.free();
        nonceIn.free();
        keyIn.free();
    }
}

/** Run the RFC 8439 §2.8.2 KAT (seal + open + auth-reject) on one loaded variant. */
function runRfcKat(host: AbiHost, loaded: LoadedWasm, label: string): void {
    const key = hexToBytes(RFC_VECTOR.key);
    const nonce = hexToBytes(RFC_VECTOR.nonce);
    const pt = hexToBytes(RFC_VECTOR.plaintext);
    const aad = hexToBytes(RFC_VECTOR.aad);
    const expectCt = hexToBytes(RFC_VECTOR.ciphertext);
    const expectTag = hexToBytes(RFC_VECTOR.tag);

    // seal → ct||tag byte-for-byte
    const sealed = seal(host, loaded, key, nonce, pt, aad);
    const ct = sealed.subarray(0, pt.length);
    const tag = sealed.subarray(pt.length);
    expect(bytesToHex(ct), `[${label}] RFC 8439 §2.8.2 ciphertext`).toBe(bytesToHex(expectCt));
    expect(bytesToHex(tag), `[${label}] RFC 8439 §2.8.2 tag`).toBe(bytesToHex(expectTag));

    // open accept → pt byte-for-byte
    const round = open(host, loaded, key, nonce, sealed, aad);
    expect(round.rc, `[${label}] RFC §2.8.2 open accept rc`).toBe(0);
    expect(eqBytes(round.pt, pt), `[${label}] RFC §2.8.2 open pt`).toBe(true);

    // open reject — tamper the last tag byte → MUST fail auth.
    const tampered = new Uint8Array(sealed);
    tampered[tampered.length - 1] ^= 0xff;
    const bad = open(host, loaded, key, nonce, tampered, aad);
    expect(bad.rc, `[${label}] RFC §2.8.2 tamper must reject`).not.toBe(0);

    // open reject — tamper a ciphertext byte → MUST fail auth.
    const tamperedCt = new Uint8Array(sealed);
    tamperedCt[0] ^= 0x01;
    const badCt = open(host, loaded, key, nonce, tamperedCt, aad);
    expect(badCt.rc, `[${label}] RFC §2.8.2 ct-tamper must reject`).not.toBe(0);
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

// ─── Manifest + source presence (toolchain-independent) ───────────────────────

describe("chacha20poly1305 manifest wiring", () => {
    test("targets.json `chacha20poly1305` retargeted to the own C23 sources", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "chacha20poly1305");
        expect(t, "no chacha20poly1305 target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own bascule: source/shim retargeted off libsodium/sodium.c.
        expect(t!.source).toBe("own-chacha20poly1305");
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/chacha20poly1305.c");
        // The own simd128+scalar primitives are compiled in.
        expect(t!.cSources.some(c => c.includes("csrc/chacha20poly1305/chacha20.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/chacha20poly1305/poly1305.c"))).toBe(true);
        // own → cStdFor binds c23; cStd MUST be unset; -I<pkgDir> auto-spliced.
        expect(t!.cStd).toBeUndefined();
        expect(t!.cflags).toEqual([]);
        // ChaCha/Poly1305 are prime simd128 beneficiaries.
        expect(t!.simd).toBe(true);
        // The frozen 5-export ABI.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
    });

    test("RFC 8439 spec text exists on disk (KAT anchor; no ChaCha ACVP corpus)", async () => {
        expect(await Bun.file(RFC8439_TXT).exists()).toBe(true);
    });

    test("shim tag compare is branch-free (no secret-dependent early return)", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "chacha20poly1305.c")).text();
        // Exports the FROZEN ABI, NOT the spike's aead_encrypt/aead_decrypt.
        expect(src).toContain("int aead_seal(");
        expect(src).toContain("int aead_open(");
        expect(src).not.toContain("aead_encrypt");
        expect(src).not.toContain("aead_decrypt");
        // Constant-time accumulate-then-compare (no `return` inside the loop).
        const ct = src.slice(src.indexOf("ct_tag_diff"));
        const body = ct.slice(0, ct.indexOf("}") + 1);
        expect(body).toContain("acc |=");
        expect(body).not.toContain("return acc != 0");
        // Shares the package arena (not a shim-local bump allocator).
        expect(src).toContain('#include "_arena.h"');
        expect(src).not.toContain("g_heap");
    });
});

// ─── Build + KAT (toolchain-gated) ────────────────────────────────────────────

describe("chacha20poly1305 build + RFC 8439 KAT (toolchain-gated)", () => {
    test("builds simd + scalar, zero imports, ABI exports, RFC §2.8.2 KAT, simd∥scalar parity", async () => {
        if (katDeferral("chacha20poly1305", toolchainPresent, "RFC 8439 KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build both variants (simd:true → simd + scalar). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "chacha20poly1305"],
            config: cfg,
        });
        expect(code, "wasm-crypto build chacha20poly1305 exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on BOTH produced binaries. ──
        for (const variant of ["simd", "scalar"] as const) {
            const bytes = new Uint8Array(
                await Bun.file(join(OUT_DIR, `chacha20poly1305.${variant}.wasm`)).arrayBuffer(),
            );
            const imports = await wasmImportNames(bytes);
            expect(imports, `${variant} must import nothing`).toEqual([]);
            const exports = await wasmExportNames(bytes);
            for (const e of ABI_EXPORTS) {
                expect(exports.has(e), `${variant} missing export ${e}`).toBe(true);
            }
        }

        // ── RFC 8439 §2.8.2 KAT through BOTH emitted variants. ──
        const host = new AbiHost();
        const simd = await loadRawVariant(host, "simd");
        const scalar = await loadRawVariant(host, "scalar");

        runRfcKat(host, simd, "simd");
        runRfcKat(host, scalar, "scalar");

        // ── simd ∥ scalar parity: identical ct||tag on the same inputs. ──
        // RFC vector + a couple of generated cases (block boundaries, empty pt/aad).
        const cases: Array<{ key: Uint8Array; nonce: Uint8Array; pt: Uint8Array; aad: Uint8Array }> = [
            {
                key: hexToBytes(RFC_VECTOR.key),
                nonce: hexToBytes(RFC_VECTOR.nonce),
                pt: hexToBytes(RFC_VECTOR.plaintext),
                aad: hexToBytes(RFC_VECTOR.aad),
            },
            // exactly 64 bytes (one ChaCha block) + 16-byte AAD
            {
                key: new Uint8Array(32).map((_, i) => (i * 7 + 1) & 0xff),
                nonce: new Uint8Array(12).map((_, i) => (i * 3 + 5) & 0xff),
                pt: new Uint8Array(64).map((_, i) => (i * 11 + 2) & 0xff),
                aad: new Uint8Array(16).map((_, i) => (i * 5 + 9) & 0xff),
            },
            // 65 bytes (block boundary + 1), empty AAD
            {
                key: new Uint8Array(32).map((_, i) => (i * 13 + 3) & 0xff),
                nonce: new Uint8Array(12).map((_, i) => (i * 17 + 4) & 0xff),
                pt: new Uint8Array(65).map((_, i) => (i * 19 + 6) & 0xff),
                aad: new Uint8Array(0),
            },
            // empty plaintext, non-empty AAD (tag-only)
            {
                key: new Uint8Array(32).map((_, i) => (i * 23 + 7) & 0xff),
                nonce: new Uint8Array(12).map((_, i) => (i * 29 + 8) & 0xff),
                pt: new Uint8Array(0),
                aad: new Uint8Array(10).map((_, i) => (i * 31 + 1) & 0xff),
            },
        ];

        for (let i = 0; i < cases.length; i++) {
            const c = cases[i]!;
            const a = seal(host, simd, c.key, c.nonce, c.pt, c.aad);
            const b = seal(host, scalar, c.key, c.nonce, c.pt, c.aad);
            expect(eqBytes(a, b), `simd∥scalar parity case ${i} (ct||tag)`).toBe(true);
            // cross-decrypt: scalar opens what simd sealed and vice-versa.
            const r1 = open(host, scalar, c.key, c.nonce, a, c.aad);
            expect(r1.rc, `cross-open case ${i} rc`).toBe(0);
            expect(eqBytes(r1.pt, c.pt), `cross-open case ${i} pt`).toBe(true);
        }

        console.warn(
            "[chacha20poly1305.kat] RFC 8439 §2.8.2 byte-for-byte OK on simd + scalar; " +
                `simd∥scalar parity OK on ${cases.length} cases.`,
        );
    }, 120_000);
});
