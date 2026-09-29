// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * cmac.kat.test.ts — package-local build + zero-import + ABI + ACVP CMAC-AES KAT
 * for the OWN AES-CMAC framing (csrc/cmac, SP 800-38B) over the vendored
 * constant-time BearSSL `aes_ct64` block (shims/cmac.c, targets.json `cmac`).
 *
 * Toolchain-gated, mirroring shims/aes.kat.test.ts (PRIOR ART — not imported).
 * When a WASI SDK is discoverable (`WASI_SDK_PATH` env → `discoverWasiSdk()`),
 * this builds the scalar variant (the `cmac` target is `simd:false` — the AES
 * block is bitsliced ct64, no simd128) via the frozen `build --pkg`, loads the
 * emitted `cmac.wasm.js` through `AbiHost`, asserts the zero-import invariant +
 * the four ABI exports (`memory`/`alloc`/`free`/`aes_cmac`), then:
 *
 *   - ACVP CMAC-AES (CMAC-AES-1.0, FIPS via SP800-38B): byte-for-byte against the
 *     inline answers in internalProjection.json. The gen groups (direction "gen")
 *     check the full tag truncated to macLen/8 bytes for AES-128/192/256 and the
 *     three message lengths (0, 532, 8192 bytes). The ver groups (direction
 *     "ver") recompute the tag and compare against the vector's `testPassed`
 *     verdict (accept when our tag matches the supplied mac, reject otherwise).
 *   - SP 800-38B / RFC 4493 published example KAT (AES-128, the canonical four
 *     message lengths) as a fixed anchor independent of the ACVP corpus.
 *
 * CT note: the K1/K2 GF(2^128) doubling in csrc/cmac/cmac.c is branch-free (mask
 * arithmetic, not a secret-dependent branch) — a code-level property, asserted by
 * source inspection; in-engine constant-time validation is the separate CT probe
 * (G2), not this KAT.
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + vectors-on-disk, record the build
 *     + KAT as deferred; do NOT claim a pass.
 *   - vectors missing on disk → record "vectors unavailable"; do NOT pass.
 *   - any byte mismatch / wrong verdict / non-zero status → the test FAILS.
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

const ACVP_CMAC_DIR = join(
    REPO_ROOT,
    "references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/CMAC-AES-1.0",
);

// ─── CMAC ABI constants ───────────────────────────────────────────────────────

const ABI_EXPORTS = ["memory", "alloc", "free", "aes_cmac"];
const TAG_BYTES = 16; // the construction produces a full 16-byte tag; caller truncates

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
    if (!hex || hex.length === 0) return new Uint8Array(0);
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

/** Load the `cmac` data module of the built scalar variant from its emitted `.wasm.js`. */
async function loadVariant(host: AbiHost): Promise<LoadedWasm> {
    const mod = (await import(join(OUT_DIR, "cmac.wasm.js"))) as Record<string, WasmDataModule>;
    const dataModule = Object.values(mod).find(m => m && typeof m === "object" && "bytes" in m);
    if (!dataModule) throw new Error("cmac.wasm.js: no wasm data module export found");
    return host.load(dataModule);
}

/** Compute the AES-CMAC tag (first `tagLen` bytes) of `msg` under `key`. */
function cmac(
    host: AbiHost,
    loaded: LoadedWasm,
    key: Uint8Array,
    msg: Uint8Array,
    tagLen: number,
): Uint8Array {
    const keyIn = host.withBytes(loaded, key);
    const msgIn = host.withBytes(loaded, msg.length ? msg : new Uint8Array(1));
    const out = host.withBytes(loaded, new Uint8Array(TAG_BYTES));
    try {
        const rc = host.run(loaded, "aes_cmac", [
            keyIn.ptr, key.length, msgIn.ptr, msg.length, out.ptr, tagLen,
        ]);
        if (rc !== 0) throw new Error(`aes_cmac rc=${rc}`);
        return host.readBytes(loaded, out.ptr, tagLen);
    } finally {
        out.free();
        msgIn.free();
        keyIn.free();
    }
}

// SP 800-38B / RFC 4493 — published AES-128 examples (canonical anchor KAT).
const RFC4493_KEY = hexToBytes("2b7e151628aed2a6abf7158809cf4f3c");
const RFC4493 = [
    { msg: "", tag: "bb1d6929e95937287fa37d129b756746" },
    { msg: "6bc1bee22e409f96e93d7e117393172a", tag: "070a16b46b4d4144f79bdd9dd04a287c" },
    {
        msg:
            "6bc1bee22e409f96e93d7e117393172a" +
            "ae2d8a571e03ac9c9eb76fac45af8e51" +
            "30c81c46a35ce411",
        tag: "dfa66747de9ae63030ca32611497c827",
    },
    {
        msg:
            "6bc1bee22e409f96e93d7e117393172a" +
            "ae2d8a571e03ac9c9eb76fac45af8e51" +
            "30c81c46a35ce411e5fbc1191a0a52ef" +
            "f69f2445df4f9b17ad2b417be66c3710",
        tag: "51f0bebf7e3b9d92fc49741779363cfe",
    },
];

interface CmacGroup {
    direction: "gen" | "ver";
    keyLen: number;
    msgLen: number;
    macLen: number;
    tests: Array<{
        tcId: number;
        key: string;
        message: string;
        mac: string;
        testPassed?: boolean;
    }>;
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

describe("cmac manifest wiring", () => {
    test("targets.json `cmac` retargeted to own framing over BearSSL ct64", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "cmac");
        expect(t, "no cmac target").toBeDefined();
        // Own SP 800-38B framing; AES block stays vendored ct64.
        expect(t!.sourceKind).toBe("own");
        expect(t!.shim).toBe("shims/cmac.c");
        expect(t!.cSources.some(c => c.includes("csrc/cmac/cmac.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("aes_ct64.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("aes_ct64_enc.c"))).toBe(true);
        // Block cipher is NOT own-rolled: it must reuse the vendored ct64 core,
        // and the shim must NOT pull the vendored BearSSL br_cmac TU (the framing
        // is now own — csrc/cmac, not vendor/bearssl/src/mac/cmac.c).
        expect(t!.cSources.some(c => c.includes("vendor/bearssl/src/mac/cmac.c"))).toBe(false);
        expect(t!.cStd).toBe("c99"); // vendored BearSSL TUs are c99 (own csrc/shim get c23 via cStdFor)
        expect(t!.simd).toBe(false);
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
        // Vectors point at the real on-disk ACVP CMAC-AES dir.
        expect(t!.vectors.some(v => v.includes("CMAC-AES-1.0"))).toBe(true);
    });

    test("ACVP CMAC-AES vectors exist on disk", async () => {
        const prompt = Bun.file(join(ACVP_CMAC_DIR, "prompt.json"));
        const internal = Bun.file(join(ACVP_CMAC_DIR, "internalProjection.json"));
        expect(await prompt.exists()).toBe(true);
        expect(await internal.exists()).toBe(true);
        const j = JSON.parse(await prompt.text());
        expect(j.algorithm).toBe("CMAC-AES");
    });
});

// ─── Build + KAT (toolchain-gated) ────────────────────────────────────────────

describe("cmac build + ACVP KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, ACVP CMAC-AES + RFC 4493 KAT", async () => {
        if (katDeferral("cmac", toolchainPresent)) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build (simd:false → scalar only). ──
        const code = await runWasmCrypto({ args: ["build", "--pkg", PKG_DIR, "--target", "cmac"], config: cfg });
        expect(code, "wasm-crypto build cmac exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced scalar binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "cmac.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) {
            expect(exports.has(e), `scalar missing export ${e}`).toBe(true);
        }

        // ── KAT through the emitted data module (AbiHost). ──
        const host = new AbiHost();
        const loaded = await loadVariant(host);

        // ===== SP 800-38B / RFC 4493 published anchor (AES-128) =====
        for (const v of RFC4493) {
            const got = cmac(host, loaded, RFC4493_KEY, hexToBytes(v.msg), 16);
            expect(bytesToHex(got), `RFC4493 msglen=${v.msg.length / 2}`).toBe(v.tag);
        }

        // ===== ACVP CMAC-AES byte-for-byte (gen) + verdict (ver) =====
        // internalProjection.json carries the prompts AND the expected macs /
        // testPassed verdicts inline, for both directions and all key/mac sizes.
        const internal = JSON.parse(await Bun.file(join(ACVP_CMAC_DIR, "internalProjection.json")).text()) as {
            testGroups: CmacGroup[];
        };

        let genChecked = 0;
        let verAcceptChecked = 0;
        let verRejectChecked = 0;
        const keyLensSeen = new Set<number>();
        const macLensSeen = new Set<number>();

        for (const g of internal.testGroups) {
            // macLen is in BITS; the frozen ABI truncates at byte granularity.
            // All ACVP CMAC-AES macLens (64/88/128) are byte-aligned.
            expect(g.macLen % 8, `macLen ${g.macLen} byte-aligned`).toBe(0);
            const tagLenBytes = g.macLen / 8;
            keyLensSeen.add(g.keyLen);
            macLensSeen.add(g.macLen);

            for (const t of g.tests) {
                const key = hexToBytes(t.key);
                expect(key.length * 8, `key length tc ${t.tcId}`).toBe(g.keyLen);
                const msg = hexToBytes(t.message);
                const got = cmac(host, loaded, key, msg, tagLenBytes);

                if (g.direction === "gen") {
                    expect(
                        bytesToHex(got),
                        `CMAC gen key${g.keyLen}/mac${g.macLen}/msg${g.msgLen} tc ${t.tcId}`,
                    ).toBe(t.mac.toLowerCase());
                    genChecked++;
                } else {
                    // ver: accept iff our recomputed tag equals the supplied mac.
                    const matches = bytesToHex(got) === t.mac.toLowerCase();
                    expect(
                        matches,
                        `CMAC ver key${g.keyLen}/mac${g.macLen} tc ${t.tcId} verdict (expected testPassed=${t.testPassed})`,
                    ).toBe(t.testPassed === true);
                    if (t.testPassed === true) verAcceptChecked++;
                    else verRejectChecked++;
                }
            }
        }

        // Coverage assertions: all three key sizes + all three mac lengths,
        // gen + both ver verdicts actually exercised.
        expect([...keyLensSeen].sort((a, b) => a - b), "key sizes covered").toEqual([128, 192, 256]);
        expect([...macLensSeen].sort((a, b) => a - b), "mac lengths covered").toEqual([64, 88, 128]);
        expect(genChecked, "CMAC gen vectors checked").toBeGreaterThan(0);
        expect(verAcceptChecked, "CMAC ver-accept vectors checked").toBeGreaterThan(0);
        expect(verRejectChecked, "CMAC ver-reject vectors checked").toBeGreaterThan(0);

        console.warn(
            `[cmac.kat] ACVP byte-for-byte OK — gen=${genChecked} ` +
                `ver-accept=${verAcceptChecked} ver-reject=${verRejectChecked}; ` +
                "RFC 4493 AES-128 anchor OK.",
        );
    }, 120_000);
});
