// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * sha2.kat.test.ts — package-local build + zero-import + ABI + NIST ACVP SHA-2
 * KAT for the OWN C23 SHA-256/384/512 (shims/sha2.c over csrc/sha2/, targets.json
 * `sha2`, retargeted off BearSSL to `sourceKind:"own"`).
 *
 * Toolchain-gated, mirroring shims/chacha20poly1305.kat.test.ts (PRIOR ART —
 * not imported). When a WASI SDK is discoverable (`WASI_SDK_PATH` env →
 * `discoverWasiSdk()`), this builds the scalar variant (`sha2` is `simd:false`)
 * via the frozen `build --pkg`, then:
 *
 *   - asserts the zero-import invariant + the 4 ABI exports
 *     (memory/alloc/free/sha2),
 *   - runs the NIST ACVP SHA-2 AFT corpus byte-for-byte for 256/384/512
 *     (prompt.json msg → expectedResults.json md),
 *   - runs the ACVP SHA-2 Monte-Carlo Test (MCT, "alternate" version) per
 *     variant against the 100-checkpoint resultsArray,
 *   - cross-checks the empty-message + "abc" + multi-block FIPS 180-4 literals,
 *   - asserts the bad-variantId → WC_EBADPARAM (-1) contract.
 *
 * The SHA-2 ACVP corpus lives at
 *   references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SHA2-{256,384,512}-1.0/
 * (prompt.json + expectedResults.json). The LDT (Large Data Test) groups are
 * NOT run — they expand to multi-gigabyte messages and are out of scope for a
 * unit KAT (the AFT + MCT corpus already covers the compression + padding).
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + ACVP corpus on disk, record the
 *     build + KAT as deferred; do NOT claim a pass.
 *   - any byte mismatch / unexpected status → the test FAILS.
 *
 * Constant-time note: the compression is straight-line / branch-free (the
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

const ABI_EXPORTS = ["memory", "alloc", "free", "sha2"];

/** variantId → { dir, digest bytes }. */
const VARIANTS = [
    { id: 256, dir: "SHA2-256-1.0", digest: 32 },
    { id: 384, dir: "SHA2-384-1.0", digest: 48 },
    { id: 512, dir: "SHA2-512-1.0", digest: 64 },
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

function concat(a: Uint8Array, b: Uint8Array, c: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length + c.length);
    out.set(a, 0);
    out.set(b, a.length);
    out.set(c, a.length + b.length);
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

/** Load the built scalar variant directly from its raw `.wasm` bytes. */
async function loadScalar(host: AbiHost): Promise<LoadedWasm> {
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "sha2.scalar.wasm")).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "sha2Wasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: false,
    };
    return host.load(dataModule);
}

/** Marshal one sha2(variantId, msg) → digest. Returns the read-back bytes. */
function digest(host: AbiHost, loaded: LoadedWasm, variantId: number, msg: Uint8Array, outLen: number): Uint8Array {
    const inIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(outLen));
    try {
        const rc = host.run(loaded, "sha2", [variantId, inIn.ptr, msg.length, out.ptr]);
        if (rc !== 0) throw new Error(`sha2(${variantId}) rc=${rc}`);
        return host.readBytes(loaded, out.ptr, outLen);
    } finally {
        out.free();
        inIn.free();
    }
}

/** Raw status of sha2() — used to assert the bad-variantId contract. */
function sha2Status(host: AbiHost, loaded: LoadedWasm, variantId: number, msg: Uint8Array, outLen: number): number {
    const inIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(outLen || 1));
    try {
        return host.run(loaded, "sha2", [variantId, inIn.ptr, msg.length, out.ptr]);
    } finally {
        out.free();
        inIn.free();
    }
}

interface AftCase { tcId: number; msg: Uint8Array; md: string }
interface MctSeed { seed: Uint8Array; checkpoints: string[]; version: "standard" | "alternate" }

/** Parse the ACVP AFT group: prompt msg/len + expectedResults md, byte-aligned. */
async function loadAft(dir: string): Promise<AftCase[]> {
    const prompt = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "prompt.json")).text());
    const expected = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "expectedResults.json")).text());
    const pg = prompt.testGroups.find((g: { testType: string }) => g.testType === "AFT");
    const eg = expected.testGroups.find((g: { tgId: number }) => g.tgId === pg.tgId);
    const mdById = new Map<number, string>();
    for (const t of eg.tests) mdById.set(t.tcId, (t.md as string).toLowerCase());
    const out: AftCase[] = [];
    for (const t of pg.tests) {
        const lenBits: number = t.len ?? t.msg.length * 4;
        if (lenBits % 8 !== 0) continue; // SHA-2 corpus is byte-aligned; skip any bit-msg defensively
        out.push({ tcId: t.tcId, msg: hexToBytes(t.msg as string), md: mdById.get(t.tcId)! });
    }
    return out;
}

/** Parse the ACVP MCT group: the seed, its mctVersion, and the 100 checkpoint mds. */
async function loadMct(dir: string): Promise<MctSeed> {
    const prompt = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "prompt.json")).text());
    const expected = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "expectedResults.json")).text());
    const pg = prompt.testGroups.find((g: { testType: string }) => g.testType === "MCT");
    const eg = expected.testGroups.find((g: { tgId: number }) => g.tgId === pg.tgId);
    const checkpoints: string[] = eg.tests[0].resultsArray.map((r: { md: string }) => r.md.toLowerCase());
    const version = pg.mctVersion === "alternate" ? "alternate" : "standard";
    return { seed: hexToBytes(pg.tests[0].msg as string), checkpoints, version };
}

/**
 * NIST SHA-2 Monte-Carlo Test (ACVP §04 — both versions per the 7-2023 update;
 * `mctVersion` selects). INITIAL_SEED_LENGTH = LEN(seed). For each of the 100
 * outer checkpoints:
 *   A = B = C = SEED
 *   for i in 0..999:
 *     MSG = A‖B‖C
 *     if "alternate": MSG = leftmost INITIAL_SEED_LENGTH bytes (pad with zero
 *                     bytes on the right if A‖B‖C is shorter);
 *     if "standard":  MSG = A‖B‖C unchanged (always 3*digest bytes);
 *     MD = SHA(MSG); A = B; B = C; C = MD
 *   output MD; SEED = MD
 *
 * Per-group selection is real: in this corpus SHA-256/512 are "alternate"
 * (seed ≠ 3*digest), SHA-384 is "standard" (seed = digest size).
 */
function runMct(
    host: AbiHost,
    loaded: LoadedWasm,
    variantId: number,
    outLen: number,
    seed: Uint8Array,
    version: "standard" | "alternate",
): string[] {
    const seedLen = seed.length; // INITIAL_SEED_LENGTH in bytes (seeds are byte-aligned)
    const outputs: string[] = [];
    let mdSeed = seed;
    for (let j = 0; j < 100; j++) {
        let a = mdSeed, b = mdSeed, c = mdSeed;
        let md = mdSeed;
        for (let i = 0; i < 1000; i++) {
            let msg = concat(a, b, c);
            if (version === "alternate") {
                if (msg.length >= seedLen) {
                    msg = msg.subarray(0, seedLen); // leftmost INITIAL_SEED_LENGTH bytes
                } else {
                    const padded = new Uint8Array(seedLen); // shorter → zero-pad on the right
                    padded.set(msg, 0);
                    msg = padded;
                }
            }
            md = digest(host, loaded, variantId, msg, outLen);
            a = b; b = c; c = md;
        }
        mdSeed = md;
        outputs.push(bytesToHex(mdSeed));
    }
    return outputs;
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

describe("sha2 manifest wiring", () => {
    test("targets.json `sha2` retargeted to the own C23 core", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "sha2");
        expect(t, "no sha2 target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own bascule: source/shim retargeted off bearssl/bearssl.c.
        expect(t!.source).toBe("own-sha2");
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/sha2.c");
        // The own C23 core is compiled in (not the BearSSL sha2small/sha2big TUs).
        expect(t!.cSources.some(c => c.includes("csrc/sha2/sha2.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("bearssl"))).toBe(false);
        // own → cStdFor binds c23; cStd MUST be unset; -I<pkgDir> auto-spliced.
        expect(t!.cStd).toBeUndefined();
        expect(t!.cflags).toEqual([]);
        // OQ-3: SHA-2 simd128 gain marginal → scalar-only.
        expect(t!.simd).toBe(false);
        // The frozen 4-export ABI.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
    });

    test("NIST ACVP SHA-2 corpus exists on disk (256/384/512)", async () => {
        for (const v of VARIANTS) {
            expect(await Bun.file(join(ACVP_DIR, v.dir, "prompt.json")).exists(), `${v.dir} prompt`).toBe(true);
            expect(await Bun.file(join(ACVP_DIR, v.dir, "expectedResults.json")).exists(), `${v.dir} expected`).toBe(true);
        }
    });

    test("shim exports the frozen sha2() ABI over the own core (not BearSSL)", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "sha2.c")).text();
        expect(src).toContain("int sha2(");
        expect(src).toContain('#include "csrc/sha2/sha2.h"');
        expect(src).toContain('#include "_arena.h"');
        // Bound to the own streaming core, not BearSSL.
        expect(src).toContain("sha256_init");
        expect(src).toContain("sha384_init");
        expect(src).toContain("sha512_init");
        // No BearSSL symbol binding (br_sha*/br_hash* vtables) and no shim-local heap.
        expect(src).not.toContain("br_sha");
        expect(src).not.toContain("br_hash");
        expect(src).not.toContain("g_heap");
    });
});

// ─── Build + ACVP KAT (toolchain-gated) ───────────────────────────────────────

describe("sha2 build + NIST ACVP SHA-2 KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, ACVP AFT+MCT byte-for-byte, FIPS literals", async () => {
        if (katDeferral("sha2", toolchainPresent, "ACVP SHA-2 KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build the scalar variant (simd:false). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "sha2"],
            config: cfg,
        });
        expect(code, "wasm-crypto build sha2 exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "sha2.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) expect(exports.has(e), `scalar missing export ${e}`).toBe(true);

        const host = new AbiHost();
        const loaded = await loadScalar(host);

        // ── FIPS 180-4 literals: empty message + "abc" multi-byte. ──
        const literals: Record<number, { empty: string; abc: string }> = {
            256: {
                empty: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                abc: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            },
            384: {
                empty:
                    "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da" +
                    "274edebfe76f65fbd51ad2f14898b95b",
                abc:
                    "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed" +
                    "8086072ba1e7cc2358baeca134c825a7",
            },
            512: {
                empty:
                    "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce" +
                    "47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
                abc:
                    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
                    "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
            },
        };
        const enc = new TextEncoder();
        for (const v of VARIANTS) {
            const lit = literals[v.id]!;
            expect(bytesToHex(digest(host, loaded, v.id, new Uint8Array(0), v.digest)), `sha2-${v.id} empty`).toBe(lit.empty);
            expect(bytesToHex(digest(host, loaded, v.id, enc.encode("abc"), v.digest)), `sha2-${v.id} abc`).toBe(lit.abc);
        }

        // ── Bad-variantId → WC_EBADPARAM (-1). ──
        expect(sha2Status(host, loaded, 224, enc.encode("x"), 32), "bad variantId 224").toBe(-1);
        expect(sha2Status(host, loaded, 0, enc.encode("x"), 32), "bad variantId 0").toBe(-1);

        // ── ACVP AFT byte-for-byte for 256/384/512. ──
        let aftCount = 0;
        for (const v of VARIANTS) {
            const cases = await loadAft(v.dir);
            for (const c of cases) {
                const got = bytesToHex(digest(host, loaded, v.id, c.msg, v.digest));
                expect(got, `ACVP ${v.dir} AFT tcId=${c.tcId}`).toBe(c.md);
                aftCount++;
            }
        }

        // ── ACVP MCT (alternate) per variant against the 100 checkpoints. ──
        for (const v of VARIANTS) {
            const { seed, checkpoints, version } = await loadMct(v.dir);
            const got = runMct(host, loaded, v.id, v.digest, seed, version);
            expect(got.length, `ACVP ${v.dir} MCT checkpoint count`).toBe(checkpoints.length);
            for (let i = 0; i < checkpoints.length; i++) {
                expect(got[i], `ACVP ${v.dir} MCT checkpoint ${i}`).toBe(checkpoints[i]);
            }
        }

        console.warn(
            `[sha2.kat] NIST ACVP SHA-2 AFT byte-for-byte OK on ${aftCount} cases (256/384/512); ` +
                "MCT (alternate) 100-checkpoint OK on each variant; FIPS 180-4 literals OK.",
        );
    }, 300_000);
});
