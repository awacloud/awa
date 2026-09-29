// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * hmac.kat.test.ts — package-local build + zero-import + ABI + NIST ACVP HMAC
 * KAT for the OWN C23 HMAC (FIPS 198-1) over the own SHA-2 core (shims/hmac.c
 * over csrc/hmac/ over csrc/sha2/, targets.json `hmac`, retargeted off BearSSL
 * to `sourceKind:"own"`).
 *
 * Toolchain-gated, mirroring shims/sha2.kat.test.ts (PRIOR ART — not imported).
 * When a WASI SDK is discoverable (`WASI_SDK_PATH` env → `discoverWasiSdk()`),
 * this builds the scalar variant (`hmac` is `simd:false`) via the frozen
 * `build --pkg`, then:
 *
 *   - asserts the zero-import invariant + the 4 ABI exports
 *     (memory/alloc/free/hmac),
 *   - runs the NIST ACVP HMAC-SHA2-{256,384,512} AFT corpus byte-for-byte
 *     (prompt.json key/msg → expectedResults.json mac, truncated to macLen),
 *   - cross-checks the RFC 4231 test vectors as a secondary anchor,
 *   - asserts the bad-hashId → WC_EBADPARAM (-1) contract.
 *
 * The HMAC ACVP corpus lives at
 *   references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/HMAC-SHA2-{256,384,512}-2.0/
 * (prompt.json + expectedResults.json). ACVP HMAC fields (key/msg/mac, and the
 * keyLen/msgLen/macLen) are expressed in BITS; this corpus is byte-aligned
 * (every length ≡ 0 mod 8). The expected `mac` is the digest TRUNCATED to
 * macLen bits, so the KAT compares the leading macLen/8 bytes of the full
 * digest emitted by the shim.
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + ACVP corpus on disk, record the
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

const ACVP_DIR = join(REPO_ROOT, "references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "hmac"];

/** hashId → { dir, full digest bytes }. */
const VARIANTS = [
    { id: 256, dir: "HMAC-SHA2-256-2.0", digest: 32 },
    { id: 384, dir: "HMAC-SHA2-384-2.0", digest: 48 },
    { id: 512, dir: "HMAC-SHA2-512-2.0", digest: 64 },
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
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "hmac.scalar.wasm")).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "hmacWasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: false,
    };
    return host.load(dataModule);
}

/** Marshal one hmac(hashId, key, msg) → full digest. Returns the read-back bytes. */
function mac(host: AbiHost, loaded: LoadedWasm, hashId: number, key: Uint8Array, msg: Uint8Array, outLen: number): Uint8Array {
    const keyIn = host.withBytes(loaded, key.length ? key : new Uint8Array(1));
    const msgIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(outLen));
    try {
        const rc = host.run(loaded, "hmac", [hashId, keyIn.ptr, key.length, msgIn.ptr, msg.length, out.ptr]);
        if (rc !== 0) throw new Error(`hmac(${hashId}) rc=${rc}`);
        return host.readBytes(loaded, out.ptr, outLen);
    } finally {
        out.free();
        msgIn.free();
        keyIn.free();
    }
}

/** Raw status of hmac() — used to assert the bad-hashId contract. */
function macStatus(host: AbiHost, loaded: LoadedWasm, hashId: number, key: Uint8Array, msg: Uint8Array, outLen: number): number {
    const keyIn = host.withBytes(loaded, key.length ? key : new Uint8Array(1));
    const msgIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(outLen || 1));
    try {
        return host.run(loaded, "hmac", [hashId, keyIn.ptr, key.length, msgIn.ptr, msg.length, out.ptr]);
    } finally {
        out.free();
        msgIn.free();
        keyIn.free();
    }
}

interface AftCase { tcId: number; key: Uint8Array; msg: Uint8Array; macHex: string; macBytes: number }

/**
 * Parse the ACVP HMAC AFT group: prompt key/msg + expectedResults mac.
 * key/msg/mac are hex of byte-aligned bit lengths (keyLen/msgLen/macLen are
 * bits, all ≡ 0 mod 8 in this corpus); the expected mac is the digest
 * truncated to macLen bits → macLen/8 leading bytes.
 */
async function loadAft(dir: string): Promise<AftCase[]> {
    const prompt = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "prompt.json")).text());
    const expected = JSON.parse(await Bun.file(join(ACVP_DIR, dir, "expectedResults.json")).text());
    const out: AftCase[] = [];
    for (const pg of prompt.testGroups) {
        if (pg.testType !== "AFT") continue;
        const eg = expected.testGroups.find((g: { tgId: number }) => g.tgId === pg.tgId);
        const macById = new Map<number, string>();
        for (const t of eg.tests) macById.set(t.tcId, (t.mac as string).toLowerCase());
        for (const t of pg.tests) {
            const macLenBits: number = t.macLen ?? (macById.get(t.tcId)!.length * 4);
            if (macLenBits % 8 !== 0) continue; // byte-aligned corpus; skip any bit-mac defensively
            out.push({
                tcId: t.tcId,
                key: hexToBytes((t.key as string) ?? ""),
                msg: hexToBytes((t.msg as string) ?? ""),
                macHex: macById.get(t.tcId)!,
                macBytes: macLenBits / 8,
            });
        }
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

describe("hmac manifest wiring", () => {
    test("targets.json `hmac` retargeted to the own C23 core over own SHA-2", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "hmac");
        expect(t, "no hmac target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own bascule: source/shim retargeted off bearssl/bearssl.c.
        expect(t!.source).toBe("own-hmac");
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/hmac.c");
        // The own HMAC core + the consumed own SHA-2 core (task 02), not BearSSL.
        expect(t!.cSources.some(c => c.includes("csrc/hmac/hmac.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/sha2/sha2.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("bearssl"))).toBe(false);
        // own → cStdFor binds c23; cStd MUST be unset; -I<pkgDir> auto-spliced.
        expect(t!.cStd).toBeUndefined();
        expect(t!.cflags).toEqual([]);
        // OQ-3: HMAC/SHA-2 simd128 gain marginal → scalar-only.
        expect(t!.simd).toBe(false);
        // The frozen 4-export ABI.
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
    });

    test("NIST ACVP HMAC corpus exists on disk (256/384/512)", async () => {
        for (const v of VARIANTS) {
            expect(await Bun.file(join(ACVP_DIR, v.dir, "prompt.json")).exists(), `${v.dir} prompt`).toBe(true);
            expect(await Bun.file(join(ACVP_DIR, v.dir, "expectedResults.json")).exists(), `${v.dir} expected`).toBe(true);
        }
    });

    test("shim exports the frozen hmac() ABI over the own core (not BearSSL)", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "hmac.c")).text();
        expect(src).toContain("int hmac(");
        expect(src).toContain('#include "csrc/hmac/hmac.h"');
        expect(src).toContain('#include "_arena.h"');
        // No BearSSL symbol binding (br_hmac*) and no shim-local heap.
        expect(src).not.toContain("br_hmac");
        expect(src).not.toContain("br_hash");
        expect(src).not.toContain("g_heap");
    });

    test("csrc/hmac core reuses the own SHA-2 read-only (frozen contract for 07/08)", async () => {
        const c = await Bun.file(join(PKG_DIR, "csrc/hmac/hmac.c")).text();
        const h = await Bun.file(join(PKG_DIR, "csrc/hmac/hmac.h")).text();
        // Consumes own SHA-2, never BearSSL, never re-implements SHA-2.
        expect(h).toContain('#include "csrc/sha2/sha2.h"');
        expect(c).toContain("sha256_init");
        expect(c).toContain("sha512_init");
        expect(c).not.toContain("br_sha");
        // Incremental ctx + one-shot exposed for pbkdf2/hkdf reuse.
        expect(h).toContain("hmac_init");
        expect(h).toContain("hmac_update");
        expect(h).toContain("hmac_final");
        expect(h).toContain("hmac_oneshot");
        // ipad/opad framing present.
        expect(c).toContain("0x36");
        expect(c).toContain("0x5c");
    });
});

// ─── Build + ACVP KAT (toolchain-gated) ───────────────────────────────────────

describe("hmac build + NIST ACVP HMAC KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, ACVP AFT byte-for-byte, RFC 4231 literals", async () => {
        if (katDeferral("hmac", toolchainPresent, "ACVP HMAC KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build the scalar variant (simd:false). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "hmac"],
            config: cfg,
        });
        expect(code, "wasm-crypto build hmac exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "hmac.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) expect(exports.has(e), `scalar missing export ${e}`).toBe(true);

        const host = new AbiHost();
        const loaded = await loadScalar(host);

        // ── RFC 4231 anchors (test case 1: key=20×0x0b, data="Hi There"). ──
        const enc = new TextEncoder();
        const rfcKey1 = new Uint8Array(20).fill(0x0b);
        const rfcMsg1 = enc.encode("Hi There");
        const rfc1: Record<number, string> = {
            256: "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
            384:
                "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59c" +
                "faea9ea9076ede7f4af152e8b2fa9cb6",
            512:
                "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cde" +
                "daa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
        };
        for (const v of VARIANTS) {
            const got = bytesToHex(mac(host, loaded, v.id, rfcKey1, rfcMsg1, v.digest));
            expect(got, `RFC4231 tc1 HMAC-SHA-${v.id}`).toBe(rfc1[v.id]);
        }

        // RFC 4231 test case 7: key = 131×0xaa (key > block → hashed), long data.
        const rfcKey7 = new Uint8Array(131).fill(0xaa);
        const rfcMsg7 = enc.encode("This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.");
        const rfc7: Record<number, string> = {
            256: "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2",
            384:
                "6617178e941f020d351e2f254e8fd32c602420feb0b8fb9adccebb82461e99c5" +
                "a678cc31e799176d3860e6110c46523e",
            512:
                "e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944" +
                "b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58",
        };
        for (const v of VARIANTS) {
            const got = bytesToHex(mac(host, loaded, v.id, rfcKey7, rfcMsg7, v.digest));
            expect(got, `RFC4231 tc7 HMAC-SHA-${v.id} (key>block)`).toBe(rfc7[v.id]);
        }

        // ── Bad-hashId → WC_EBADPARAM (-1). ──
        expect(macStatus(host, loaded, 224, rfcKey1, rfcMsg1, 28), "bad hashId 224").toBe(-1);
        expect(macStatus(host, loaded, 0, rfcKey1, rfcMsg1, 32), "bad hashId 0").toBe(-1);

        // ── ACVP HMAC AFT byte-for-byte for 256/384/512 (truncate to macLen). ──
        let aftCount = 0;
        let sawKeyGtBlock = false;
        const blockFor: Record<number, number> = { 256: 64, 384: 128, 512: 128 };
        for (const v of VARIANTS) {
            const cases = await loadAft(v.dir);
            expect(cases.length, `${v.dir} AFT cases parsed`).toBeGreaterThan(0);
            for (const c of cases) {
                if (c.key.length > blockFor[v.id]) sawKeyGtBlock = true;
                const full = mac(host, loaded, v.id, c.key, c.msg, v.digest);
                const got = bytesToHex(full.subarray(0, c.macBytes));
                expect(got, `ACVP ${v.dir} AFT tcId=${c.tcId} (macLen=${c.macBytes * 8})`).toBe(c.macHex);
                aftCount++;
            }
        }
        // The ACVP HMAC corpus exercises keys longer than the block size.
        expect(sawKeyGtBlock, "ACVP corpus should include key > block").toBe(true);

        console.warn(
            `[hmac.kat] NIST ACVP HMAC AFT byte-for-byte OK on ${aftCount} cases (256/384/512, ` +
                "truncated to macLen, incl. key > block); RFC 4231 tc1/tc7 literals OK.",
        );
    }, 300_000);
});
