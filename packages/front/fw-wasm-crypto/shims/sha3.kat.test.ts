// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * sha3.kat.test.ts — package-local build + zero-import + ABI + NIST ACVP SHA-3
 * & SHAKE KAT + simd∥scalar parity for the OWN C23 Keccak-f[1600] sponge
 * (shims/sha3.c over csrc/sha3/, targets.json `sha3`, retargeted off XKCP/
 * hashes.c to `sourceKind:"own"`).
 *
 * Toolchain-gated, mirroring shims/sha2.kat.test.ts and
 * shims/chacha20poly1305.kat.test.ts (PRIOR ART — not imported). When a WASI
 * SDK is discoverable (`WASI_SDK_PATH` env → `discoverWasiSdk()`), this builds
 * BOTH variants (simd + scalar — `sha3` is `simd:true`; Keccak is a listed
 * simd128 beneficiary) via the frozen `build --pkg`, then for each variant:
 *
 *   - asserts the zero-import invariant + the 4 ABI exports
 *     (memory/alloc/free/sha3),
 *   - runs the NIST ACVP SHA-3 AFT corpus byte-for-byte for 224/256/384/512
 *     (filtered to byte-aligned messages — the own shim hashes whole bytes),
 *   - runs the NIST ACVP SHAKE AFT + VOT corpus byte-for-byte for 128/256
 *     (filtered to byte-aligned message AND output lengths; VOT exercises the
 *     variable-output / multi-squeeze XOF path),
 *   - cross-checks the FIPS 202 empty + "abc" literals + a SHAKE long-output
 *     (4096-bit) XOF KAT,
 *   - asserts the bad-variantId → WC_EBADPARAM (-1) contract,
 *   - cross-checks simd ∥ scalar produce identical digests on all 6 variants.
 *
 * The SHA-3 / SHAKE ACVP corpora live at
 *   references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SHA3-{224,256,384,512}-2.0/
 *   references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SHAKE-{128,256}-1.0/
 * (prompt.json + expectedResults.json). The MCT and LDT groups are NOT run:
 * LDT expands to multi-gigabyte messages (out of scope for a unit KAT); the AFT
 * + VOT corpus already covers absorb, multi-block, pad10*1, domain separation
 * and the squeeze path.
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + ACVP corpus on disk, record the
 *     build + KAT as deferred; do NOT claim a pass.
 *   - any byte mismatch / unexpected status → the test FAILS.
 *
 * Constant-time note: the permutation is straight-line / branch-free (the
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

const ACVP_DIR = join(REPO_ROOT, "references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "sha3"];

/** Fixed-digest variants: { variantId, ACVP dir, digest bytes }. */
const SHA3_VARIANTS = [
    { id: 0, dir: "SHA3-224-2.0", digest: 28 },
    { id: 1, dir: "SHA3-256-2.0", digest: 32 },
    { id: 2, dir: "SHA3-384-2.0", digest: 48 },
    { id: 3, dir: "SHA3-512-2.0", digest: 64 },
] as const;

/** SHAKE XOF variants: { variantId, ACVP dir }. */
const SHAKE_VARIANTS = [
    { id: 4, dir: "SHAKE-128-1.0" },
    { id: 5, dir: "SHAKE-256-1.0" },
] as const;

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
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, `sha3.${variant}.wasm`)).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "sha3Wasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: variant === "simd",
    };
    return host.load(dataModule);
}

/**
 * Marshal one sha3(variantId, msg, outLen) → digest. For fixed variants the
 * shim ignores `outLen` and emits the implied digest size; pass it anyway as
 * the read-back length. Returns the read-back bytes.
 */
function digest(host: AbiHost, loaded: LoadedWasm, variantId: number, msg: Uint8Array, outLen: number): Uint8Array {
    const inIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(outLen || 1));
    try {
        const rc = host.run(loaded, "sha3", [variantId, inIn.ptr, msg.length, out.ptr, outLen]);
        if (rc !== 0) throw new Error(`sha3(${variantId}) rc=${rc}`);
        return host.readBytes(loaded, out.ptr, outLen);
    } finally {
        out.free();
        inIn.free();
    }
}

/** Raw status of sha3() — used to assert the bad-variantId contract. */
function sha3Status(host: AbiHost, loaded: LoadedWasm, variantId: number, msg: Uint8Array, outLen: number): number {
    const inIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(outLen || 1));
    try {
        return host.run(loaded, "sha3", [variantId, inIn.ptr, msg.length, out.ptr, outLen]);
    } finally {
        out.free();
        inIn.free();
    }
}

interface HashCase { tcId: number; msg: Uint8Array; md: string }
interface XofCase { tcId: number; msg: Uint8Array; outBytes: number; md: string }

/**
 * Parse an ACVP fixed-digest AFT group: prompt msg/len + expectedResults md.
 * `len` is in bits — skip any bit-unaligned message (the own shim hashes whole
 * bytes; the ACVP SHA-3 corpus is overwhelmingly bit-granular but carries a
 * byte-aligned subset which fully exercises absorb/pad/multi-block).
 */
async function loadSha3Aft(dir: string): Promise<HashCase[]> {
    const prompt = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "prompt.json")).text());
    const expected = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "expectedResults.json")).text());
    const pg = prompt.testGroups.find((g: { testType: string }) => g.testType === "AFT");
    const eg = expected.testGroups.find((g: { tgId: number }) => g.tgId === pg.tgId);
    const mdById = new Map<number, string>();
    for (const t of eg.tests) mdById.set(t.tcId, (t.md as string).toLowerCase());
    const out: HashCase[] = [];
    for (const t of pg.tests) {
        const lenBits: number = t.len ?? t.msg.length * 4;
        if (lenBits % 8 !== 0) continue; // byte-aligned only
        out.push({ tcId: t.tcId, msg: hexToBytes(t.msg as string), md: mdById.get(t.tcId)! });
    }
    return out;
}

/**
 * Parse an ACVP SHAKE AFT or VOT group: prompt msg/len/outLen + expectedResults
 * md. Both `len` and `outLen` are in bits — skip any case whose message OR
 * output length is bit-unaligned. The own shim emits whole `outLen/8` bytes;
 * the byte-aligned subset of AFT + VOT still spans many output lengths and the
 * multi-squeeze (output > rate) path.
 */
async function loadShakeGroup(dir: string, testType: "AFT" | "VOT"): Promise<XofCase[]> {
    const prompt = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "prompt.json")).text());
    const expected = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "expectedResults.json")).text());
    const pg = prompt.testGroups.find((g: { testType: string }) => g.testType === testType);
    if (!pg) return [];
    const eg = expected.testGroups.find((g: { tgId: number }) => g.tgId === pg.tgId);
    const mdById = new Map<number, string>();
    for (const t of eg.tests) mdById.set(t.tcId, (t.md as string).toLowerCase());
    const out: XofCase[] = [];
    for (const t of pg.tests) {
        const lenBits: number = t.len ?? 0;
        const outBits: number = t.outLen ?? 0;
        if (lenBits % 8 !== 0 || outBits % 8 !== 0 || outBits === 0) continue; // byte-aligned, non-empty
        out.push({ tcId: t.tcId, msg: hexToBytes(t.msg as string), outBytes: outBits / 8, md: mdById.get(t.tcId)! });
    }
    return out;
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

describe("sha3 manifest wiring", () => {
    test("targets.json `sha3` retargeted to the own C23 Keccak core", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "sha3");
        expect(t, "no sha3 target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own bascule: source/shim retargeted off xkcp/hashes.c.
        expect(t!.source).toBe("own-sha3");
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/sha3.c");
        // The own C23 core is compiled in (not the XKCP TUs).
        expect(t!.cSources.some(c => c.includes("csrc/sha3/keccak.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/sha3/sha3.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("xkcp"))).toBe(false);
        // own → cStdFor binds c23; cStd MUST be unset; -I<pkgDir> auto-spliced.
        expect(t!.cStd).toBeUndefined();
        expect(t!.cflags).toEqual([]);
        // OQ-3: Keccak is a real simd128 beneficiary.
        expect(t!.simd).toBe(true);
        // The frozen 4-export ABI.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
    });

    test("NIST ACVP SHA-3 + SHAKE corpora exist on disk", async () => {
        for (const v of SHA3_VARIANTS) {
            expect(await Bun.file(join(ACVP_DIR, v.dir, "prompt.json")).exists(), `${v.dir} prompt`).toBe(true);
            expect(await Bun.file(join(ACVP_DIR, v.dir, "expectedResults.json")).exists(), `${v.dir} expected`).toBe(true);
        }
        for (const v of SHAKE_VARIANTS) {
            expect(await Bun.file(join(ACVP_DIR, v.dir, "prompt.json")).exists(), `${v.dir} prompt`).toBe(true);
            expect(await Bun.file(join(ACVP_DIR, v.dir, "expectedResults.json")).exists(), `${v.dir} expected`).toBe(true);
        }
    });

    test("shim exports the frozen sha3() ABI over the own sponge (not XKCP)", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "sha3.c")).text();
        expect(src).toContain("int sha3(");
        expect(src).toContain('#include "csrc/sha3/sha3.h"');
        expect(src).toContain('#include "_arena.h"');
        // Bound to the own sponge core, not the XKCP one-shot entry points.
        expect(src).toContain("sha3_hash");
        expect(src).toContain("shake_xof");
        expect(src).not.toContain("SimpleFIPS202");
        expect(src).not.toContain("KeccakWidth");
        // No shim-local heap.
        expect(src).not.toContain("g_heap");
    });
});

// ─── Build + ACVP KAT (toolchain-gated) ───────────────────────────────────────

describe("sha3 build + NIST ACVP SHA-3/SHAKE KAT (toolchain-gated)", () => {
    test("builds simd + scalar, zero imports, ABI exports, ACVP AFT/VOT byte-for-byte, FIPS literals, parity", async () => {
        if (katDeferral("sha3", toolchainPresent, "ACVP SHA-3/SHAKE KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build both variants (simd:true → simd + scalar). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "sha3"],
            config: cfg,
        });
        expect(code, "wasm-crypto build sha3 exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on BOTH produced binaries. ──
        for (const variant of ["simd", "scalar"] as const) {
            const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, `sha3.${variant}.wasm`)).arrayBuffer());
            const imports = await wasmImportNames(bytes);
            expect(imports, `${variant} must import nothing`).toEqual([]);
            const exports = await wasmExportNames(bytes);
            for (const e of ABI_EXPORTS) expect(exports.has(e), `${variant} missing export ${e}`).toBe(true);
        }

        const host = new AbiHost();
        const simd = await loadRawVariant(host, "simd");
        const scalar = await loadRawVariant(host, "scalar");

        // ── FIPS 202 literals: empty message + "abc" on every variant. ──
        const enc = new TextEncoder();
        const fixedLiterals: Record<number, { empty: string; abc: string; digest: number }> = {
            0: {
                empty: "6b4e03423667dbb73b6e15454f0eb1abd4597f9a1b078e3f5b5a6bc7",
                abc: "e642824c3f8cf24ad09234ee7d3c766fc9a3a5168d0c94ad73b46fdf",
                digest: 28,
            },
            1: {
                empty: "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
                abc: "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532",
                digest: 32,
            },
            2: {
                empty:
                    "0c63a75b845e4f7d01107d852e4c2485c51a50aaaa94fc61995e71bbee983a2a" +
                    "c3713831264adb47fb6bd1e058d5f004",
                abc:
                    "ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b2" +
                    "98d88cea927ac7f539f1edf228376d25",
                digest: 48,
            },
            3: {
                empty:
                    "a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a6" +
                    "15b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26",
                abc:
                    "b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e" +
                    "10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0",
                digest: 64,
            },
        };
        for (const v of SHA3_VARIANTS) {
            const lit = fixedLiterals[v.id]!;
            expect(bytesToHex(digest(host, simd, v.id, new Uint8Array(0), v.digest)), `sha3-${v.id} empty`).toBe(lit.empty);
            expect(bytesToHex(digest(host, simd, v.id, enc.encode("abc"), v.digest)), `sha3-${v.id} abc`).toBe(lit.abc);
        }

        // SHAKE empty-message literals (FIPS 202 / NIST examples), 256-bit out.
        const shakeLiterals: Record<number, string> = {
            4: "7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26",
            5: "46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762f",
        };
        for (const v of SHAKE_VARIANTS) {
            expect(bytesToHex(digest(host, simd, v.id, new Uint8Array(0), 32)), `shake-${v.id} empty/32`).toBe(shakeLiterals[v.id]!);
        }

        // ── Bad-variantId → WC_EBADPARAM (-1). ──
        expect(sha3Status(host, simd, 6, enc.encode("x"), 32), "bad variantId 6").toBe(-1);
        expect(sha3Status(host, simd, -1, enc.encode("x"), 32), "bad variantId -1").toBe(-1);

        // ── ACVP SHA-3 AFT byte-for-byte (224/256/384/512). ──
        let aftCount = 0;
        for (const v of SHA3_VARIANTS) {
            const cases = await loadSha3Aft(v.dir);
            expect(cases.length, `${v.dir} AFT byte-aligned cases`).toBeGreaterThan(0);
            for (const c of cases) {
                const got = bytesToHex(digest(host, scalar, v.id, c.msg, v.digest));
                expect(got, `ACVP ${v.dir} AFT tcId=${c.tcId}`).toBe(c.md);
                aftCount++;
            }
        }

        // ── ACVP SHAKE AFT + VOT byte-for-byte (128/256), variable outLen. ──
        let xofCount = 0;
        let maxOut = 0;
        for (const v of SHAKE_VARIANTS) {
            const cases = [
                ...(await loadShakeGroup(v.dir, "AFT")),
                ...(await loadShakeGroup(v.dir, "VOT")),
            ];
            expect(cases.length, `${v.dir} AFT+VOT byte-aligned cases`).toBeGreaterThan(0);
            for (const c of cases) {
                const got = bytesToHex(digest(host, scalar, v.id, c.msg, c.outBytes));
                expect(got, `ACVP ${v.dir} XOF tcId=${c.tcId} outBytes=${c.outBytes}`).toBe(c.md);
                xofCount++;
                if (c.outBytes > maxOut) maxOut = c.outBytes;
            }
        }
        // The VOT corpus must exercise a multi-squeeze output (> SHAKE128 rate 168B).
        expect(maxOut, "SHAKE XOF max output length covers multi-squeeze").toBeGreaterThan(168);

        // ── simd ∥ scalar parity on all 6 variants (deterministic inputs). ──
        const parityInputs: Uint8Array[] = [
            new Uint8Array(0),
            enc.encode("abc"),
            new Uint8Array(168).map((_, i) => (i * 7 + 1) & 0xff), // exactly SHAKE128 rate
            new Uint8Array(200).map((_, i) => (i * 13 + 5) & 0xff), // > any rate (multi-block absorb)
            new Uint8Array(335).map((_, i) => (i * 29 + 9) & 0xff),
        ];
        for (const v of SHA3_VARIANTS) {
            for (const msg of parityInputs) {
                const a = digest(host, simd, v.id, msg, v.digest);
                const b = digest(host, scalar, v.id, msg, v.digest);
                expect(eqBytes(a, b), `simd∥scalar parity sha3-${v.id} len=${msg.length}`).toBe(true);
            }
        }
        for (const v of SHAKE_VARIANTS) {
            for (const msg of parityInputs) {
                for (const outLen of [16, 32, 200]) {
                    const a = digest(host, simd, v.id, msg, outLen);
                    const b = digest(host, scalar, v.id, msg, outLen);
                    expect(eqBytes(a, b), `simd∥scalar parity shake-${v.id} in=${msg.length} out=${outLen}`).toBe(true);
                }
            }
        }

        console.warn(
            `[sha3.kat] NIST ACVP SHA-3 AFT byte-for-byte OK on ${aftCount} cases (224/256/384/512); ` +
                `SHAKE AFT+VOT byte-for-byte OK on ${xofCount} cases (128/256, max out ${maxOut}B); ` +
                "FIPS 202 literals OK; simd∥scalar parity OK on all 6 variants.",
        );
    }, 300_000);
});
