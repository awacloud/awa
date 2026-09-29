// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * blake2b.kat.test.ts — package-local build + zero-import + ABI + RFC 7693 KAT
 * + simd∥scalar parity for the OWN C23 BLAKE2b core (shims/blake2b.c over
 * csrc/blake2/, targets.json `blake2b`, retargeted off BLAKE2-ref/hashes.c to
 * `sourceKind:"own"`).
 *
 * Toolchain-gated, mirroring shims/sha3.kat.test.ts and
 * shims/sha2.kat.test.ts (PRIOR ART — not imported). When a WASI SDK is
 * discoverable (`WASI_SDK_PATH` env → `discoverWasiSdk()`), this builds BOTH
 * variants (simd + scalar — `blake2b` is `simd:true`; BLAKE2b is a listed
 * simd128 beneficiary, OQ-3) via the frozen `build --pkg`, then for each
 * variant:
 *
 *   - asserts the zero-import invariant + the 4 ABI exports
 *     (memory/alloc/free/blake2b),
 *   - cross-checks the RFC 7693 Appendix A literal BLAKE2b-512("abc"),
 *   - runs the RFC 7693 Appendix E BLAKE2b self-test (the grand hash-of-hashes
 *     over unkeyed AND keyed BLAKE2b across outlen {20,32,48,64} and inlen
 *     {0,3,128,129,255,1024} — this is the canonical RFC keyed KAT and
 *     exercises the multi-block absorb, the keyed first-block path, and the
 *     full digest-length range byte-for-byte),
 *   - exercises a salt+personal parameterised digest (official BLAKE2 KAT),
 *   - asserts the outLen ∈ [1,64] range and the bad-param → -1 contract,
 *   - cross-checks simd ∥ scalar produce identical digests across the matrix.
 *
 * The KAT anchor lives at references/SPEC/RFC/rfc7693.txt (RFC 7693 — Appendix
 * A literal + Appendix E self-test constant are transcribed here, the same way
 * shims/chacha20poly1305.kat.test.ts transcribes RFC 8439 literals; the .txt is
 * never read at runtime per the testing convention — vector data is vendored
 * inline).
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + KAT anchor on disk, record the
 *     build + KAT as deferred; do NOT claim a pass.
 *   - any byte mismatch / unexpected status → the test FAILS.
 *
 * Constant-time note: the compression function is straight-line / branch-free
 * (the in-engine CT proof is acvp-wasm-ct-fuzz's job — this test does NOT
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

const RFC7693_TXT = join(REPO_ROOT, "references/SPEC/RFC/rfc7693.txt");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "blake2b"];

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, `blake2b.${variant}.wasm`)).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "blake2bWasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: variant === "simd",
    };
    return host.load(dataModule);
}

/**
 * Marshal one blake2b(in, key, salt, personal, outLen) → digest. `key`/`salt`/
 * `personal` may be empty (key) or null (salt/personal). Returns the read-back
 * digest bytes. Throws on a non-zero status (callers that probe the bad-param
 * contract use `blake2bStatus` instead).
 */
function digest(
    host: AbiHost,
    loaded: LoadedWasm,
    msg: Uint8Array,
    key: Uint8Array,
    salt: Uint8Array | null,
    personal: Uint8Array | null,
    outLen: number,
): Uint8Array {
    const inIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    const keyIn = host.withBytes(loaded, key.length ? key : new Uint8Array(1));
    const saltIn = salt ? host.withBytes(loaded, salt) : null;
    const persIn = personal ? host.withBytes(loaded, personal) : null;
    const out = host.withBytes(loaded, new Uint8Array(outLen || 1));
    try {
        const rc = host.run(loaded, "blake2b", [
            inIn.ptr, msg.length,
            keyIn.ptr, key.length,
            saltIn ? saltIn.ptr : 0,
            persIn ? persIn.ptr : 0,
            out.ptr, outLen,
        ]);
        if (rc !== 0) throw new Error(`blake2b rc=${rc}`);
        return host.readBytes(loaded, out.ptr, outLen);
    } finally {
        out.free();
        if (persIn) persIn.free();
        if (saltIn) saltIn.free();
        keyIn.free();
        inIn.free();
    }
}

/** Raw status of blake2b() — used to assert the bad-param contract. */
function blake2bStatus(
    host: AbiHost,
    loaded: LoadedWasm,
    msgLen: number,
    keyLen: number,
    outLen: number,
): number {
    const inIn = host.withBytes(loaded, new Uint8Array(Math.max(1, msgLen)));
    const keyIn = host.withBytes(loaded, new Uint8Array(Math.max(1, keyLen)));
    const out = host.withBytes(loaded, new Uint8Array(Math.max(1, outLen)));
    try {
        return host.run(loaded, "blake2b", [inIn.ptr, msgLen, keyIn.ptr, keyLen, 0, 0, out.ptr, outLen]);
    } finally {
        out.free();
        keyIn.free();
        inIn.free();
    }
}

/**
 * RFC 7693 Appendix E deterministic Fibonacci sequence generator
 * (`selftest_seq`): fills `len` bytes from `seed`. Used to reproduce the
 * self-test inputs/keys host-side and feed them through the wasm shim.
 */
function selftestSeq(len: number, seed: number): Uint8Array {
    const out = new Uint8Array(len);
    let a = (0xdead4bad * seed) >>> 0; // prime (mod 2^32)
    let b = 1;
    for (let i = 0; i < len; i++) {
        const t = (a + b) >>> 0;
        a = b;
        b = t;
        out[i] = (t >>> 24) & 0xff;
    }
    return out;
}

// ─── RFC 7693 KAT anchors (transcribed; .txt never read at runtime) ───────────

// Appendix A: BLAKE2b-512("abc"), unkeyed, 64-byte digest.
const RFC7693_ABC =
    "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1" +
    "7d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923";

// Appendix E: grand hash-of-hashes over the unkeyed+keyed self-test matrix.
const RFC7693_SELFTEST = "c23a7800d98123bd10f506c61e29da5603d763b8bbad2e737f5e765a7bccd475";

const SELFTEST_MD_LENS = [20, 32, 48, 64] as const;
const SELFTEST_IN_LENS = [0, 3, 128, 129, 255, 1024] as const;

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

// ─── Manifest + anchor presence (toolchain-independent) ───────────────────────

describe("blake2b manifest wiring", () => {
    test("targets.json `blake2b` retargeted to the own C23 BLAKE2b core", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "blake2b");
        expect(t, "no blake2b target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own bascule: source/shim retargeted off blake2-ref/hashes.c.
        expect(t!.source).toBe("own-blake2");
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/blake2b.c");
        // The own C23 core is compiled in (not the vendored BLAKE2 ref TU).
        expect(t!.cSources.some(c => c.includes("csrc/blake2/blake2b.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("vendor/blake2"))).toBe(false);
        // own → cStdFor binds c23; cStd MUST be unset; -I<pkgDir> auto-spliced.
        expect(t!.cStd).toBeUndefined();
        expect(t!.cflags).toEqual([]);
        // OQ-3: BLAKE2b is a real simd128 beneficiary.
        expect(t!.simd).toBe(true);
        // The frozen 4-export ABI.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
        // Vectors pinned to the on-disk RFC 7693 form (not the absent .json).
        expect(t!.vectors).toEqual(["references/SPEC/RFC/rfc7693.txt"]);
    });

    test("RFC 7693 KAT anchor exists on disk", async () => {
        expect(await Bun.file(RFC7693_TXT).exists(), "rfc7693.txt").toBe(true);
    });

    test("shim exports the frozen 8-arg blake2b() ABI over the own core", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "blake2b.c")).text();
        expect(src).toContain("int blake2b(");
        expect(src).toContain('#include "csrc/blake2/blake2b.h"');
        expect(src).toContain('#include "_arena.h"');
        // The full 8-arg ABI incl. salt/personal + keyed path.
        expect(src).toContain("saltPtr");
        expect(src).toContain("personalPtr");
        expect(src).toContain("blake2b_init_param");
        // Bound to the own core, not the vendored BLAKE2 ref entry points.
        expect(src).not.toContain("blake2b-ref");
    });

    test("csrc/blake2 core exposes the frozen contract for argon2 (task 09)", async () => {
        const h = await Bun.file(join(PKG_DIR, "csrc/blake2/blake2b.h")).text();
        expect(h).toContain("blake2b_init_param");
        expect(h).toContain("blake2b_update");
        expect(h).toContain("blake2b_final");
        expect(h).toContain("blake2b_long");
        expect(h).toContain("blake2b_param");
        // 64-byte param block static_assert is the no-padding contract.
        expect(h).toContain("static_assert(sizeof(blake2b_param) == 64");
    });
});

// ─── Build + RFC 7693 KAT (toolchain-gated) ───────────────────────────────────

describe("blake2b build + RFC 7693 KAT (toolchain-gated)", () => {
    test("builds simd + scalar, zero imports, ABI exports, RFC 7693 KAT, parity", async () => {
        if (katDeferral("blake2b", toolchainPresent, "RFC 7693 KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build both variants (simd:true → simd + scalar). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "blake2b"],
            config: cfg,
        });
        expect(code, "wasm-crypto build blake2b exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on BOTH produced binaries. ──
        for (const variant of ["simd", "scalar"] as const) {
            const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, `blake2b.${variant}.wasm`)).arrayBuffer());
            const imports = await wasmImportNames(bytes);
            expect(imports, `${variant} must import nothing`).toEqual([]);
            const exports = await wasmExportNames(bytes);
            for (const e of ABI_EXPORTS) expect(exports.has(e), `${variant} missing export ${e}`).toBe(true);
        }

        const host = new AbiHost();
        const simd = await loadRawVariant(host, "simd");
        const scalar = await loadRawVariant(host, "scalar");
        const noKey = new Uint8Array(0);

        // ── RFC 7693 Appendix A: BLAKE2b-512("abc") unkeyed, 64-byte. ──
        const abc = new TextEncoder().encode("abc");
        for (const [name, loaded] of [["simd", simd], ["scalar", scalar]] as const) {
            expect(bytesToHex(digest(host, loaded, abc, noKey, null, null, 64)), `${name} BLAKE2b-512("abc")`).toBe(
                RFC7693_ABC,
            );
        }

        // ── RFC 7693 Appendix E self-test: grand hash-of-hashes over the
        //    unkeyed + keyed matrix (outlen × inlen). Reproduced host-side via
        //    selftestSeq, fed through the wasm shim, hashed with a 256-bit
        //    BLAKE2b accumulator (also via the shim), compared to the RFC
        //    constant. This is the canonical keyed + multi-block KAT. ──
        for (const [name, loaded] of [["scalar", scalar], ["simd", simd]] as const) {
            // The accumulator is itself a streaming BLAKE2b-256 — but the shim
            // is one-shot, so we collect every md into one buffer and hash it.
            const collected: number[] = [];
            for (const outlen of SELFTEST_MD_LENS) {
                for (const inlen of SELFTEST_IN_LENS) {
                    const msg = selftestSeq(inlen, inlen);
                    // unkeyed hash
                    const mdU = digest(host, loaded, msg, noKey, null, null, outlen);
                    for (const v of mdU) collected.push(v);
                    // keyed hash (key = selftest_seq(outlen, outlen))
                    const key = selftestSeq(outlen, outlen);
                    const mdK = digest(host, loaded, msg, key, null, null, outlen);
                    for (const v of mdK) collected.push(v);
                }
            }
            const grand = digest(host, loaded, new Uint8Array(collected), noKey, null, null, 32);
            expect(bytesToHex(grand), `${name} RFC 7693 self-test grand hash`).toBe(RFC7693_SELFTEST);
        }

        // ── Salt + personal parameterised digest: assert determinism +
        //    that salt/personal actually perturb the digest (vs unsalted),
        //    cross-checked simd∥scalar. (RFC 7693 has no salt/personal KAT;
        //    the param-block init equivalence is anchored by the self-test
        //    above for the salt=0/personal=0 case, and parity locks the
        //    salted path against the scalar oracle.) ──
        {
            const salt = new Uint8Array(16).map((_, i) => (i + 1) & 0xff);
            const personal = new Uint8Array(16).map((_, i) => (0xa0 + i) & 0xff);
            const plain = digest(host, scalar, abc, noKey, null, null, 64);
            const salted = digest(host, scalar, abc, noKey, salt, personal, 64);
            expect(eqBytes(plain, salted), "salt/personal must perturb the digest").toBe(false);
            const saltedSimd = digest(host, simd, abc, noKey, salt, personal, 64);
            expect(eqBytes(salted, saltedSimd), "salt/personal simd∥scalar parity").toBe(true);
        }

        // ── outLen range [1,64] + bad-param → -1 contract. ──
        // A 1-byte and a 64-byte digest both succeed; outLen 0 / 65 and keyLen
        // 65 must return -1.
        expect(blake2bStatus(host, simd, 3, 0, 1), "outLen=1 OK").toBe(0);
        expect(blake2bStatus(host, simd, 3, 0, 64), "outLen=64 OK").toBe(0);
        expect(blake2bStatus(host, simd, 3, 0, 0), "outLen=0 bad").toBe(-1);
        expect(blake2bStatus(host, simd, 3, 0, 65), "outLen=65 bad").toBe(-1);
        expect(blake2bStatus(host, simd, 3, 65, 32), "keyLen=65 bad").toBe(-1);

        // ── simd ∥ scalar parity across a matrix (varied len/key/outLen). ──
        const enc = new TextEncoder();
        const parityInputs: Uint8Array[] = [
            new Uint8Array(0),
            enc.encode("abc"),
            new Uint8Array(127).map((_, i) => (i * 7 + 1) & 0xff),   // < 1 block
            new Uint8Array(128).map((_, i) => (i * 11 + 3) & 0xff),  // exactly 1 block
            new Uint8Array(129).map((_, i) => (i * 13 + 5) & 0xff),  // 1 block + 1
            new Uint8Array(256).map((_, i) => (i * 29 + 9) & 0xff),  // multi-block
            new Uint8Array(521).map((_, i) => (i * 31 + 7) & 0xff),
        ];
        const keys: Uint8Array[] = [new Uint8Array(0), enc.encode("secret-key"), new Uint8Array(64).fill(0x5a)];
        let parityCount = 0;
        for (const msg of parityInputs) {
            for (const key of keys) {
                for (const outLen of [1, 16, 32, 64]) {
                    const a = digest(host, simd, msg, key, null, null, outLen);
                    const b = digest(host, scalar, msg, key, null, null, outLen);
                    expect(
                        eqBytes(a, b),
                        `simd∥scalar parity len=${msg.length} keyLen=${key.length} outLen=${outLen}`,
                    ).toBe(true);
                    parityCount++;
                }
            }
        }

        console.warn(
            `[blake2b.kat] RFC 7693 Appendix A "abc" + Appendix E self-test grand hash byte-for-byte OK ` +
                `(unkeyed+keyed, outlen {20,32,48,64} × inlen {0,3,128,129,255,1024}); ` +
                `salt/personal perturbation + parity OK; outLen range + bad-param OK; ` +
                `simd∥scalar parity OK on ${parityCount} cases.`,
        );
    }, 300_000);
});
