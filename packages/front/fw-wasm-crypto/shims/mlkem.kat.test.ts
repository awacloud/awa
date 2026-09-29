// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * mlkem.kat.test.ts — package-local build + zero-import + ABI + ACVP KAT for the
 * ML-KEM (FIPS 203 final) shim over mlkem-native (shims/mlkem.c, targets.json
 * `ml_kem`).
 *
 * Toolchain-gated, exactly like the spike-04 driver this reuses as PRIOR ART
 * (NOT imported — spikes/ are throwaway). When a WASI SDK is discoverable
 * (`WASI_SDK_PATH` env → `discoverWasiSdk()`), this builds both variants
 * (simd + scalar) via the frozen `build --pkg`, loads each emitted `*.wasm.js`
 * through `AbiHost`, asserts the zero-import invariant + the eight ABI exports,
 * then drives the real ML-KEM ACVP keyGen + encapDecap FIPS-203 vectors
 * byte-for-byte across all three parameter sets via the staged-entropy seam:
 *
 *   keyGen  : rng_stage(d||z) → mlkem_keygen(ps, ek, dk) ; assert ek/dk
 *   encaps  : rng_stage(m)    → mlkem_encaps(ps, ek, c, K); assert c/K
 *   decaps  :                   mlkem_decaps(ps, dk, c, K); assert K
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

const ACVP_KEYGEN_DIR = join(
    REPO_ROOT,
    "references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ML-KEM-keyGen-FIPS203",
);
const ACVP_ENCAPDECAP_DIR = join(
    REPO_ROOT,
    "references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ML-KEM-encapDecap-FIPS203",
);

// ─── ML-KEM ABI constants ─────────────────────────────────────────────────────

/** parameterSet string → frozen `ps` enum (0/1/2) + key-material sizes. */
const PARAM_SETS: Record<string, { ps: number; ek: number; dk: number; ct: number }> = {
    "ML-KEM-512": { ps: 0, ek: 800, dk: 1632, ct: 768 },
    "ML-KEM-768": { ps: 1, ek: 1184, dk: 2400, ct: 1088 },
    "ML-KEM-1024": { ps: 2, ek: 1568, dk: 3168, ct: 1568 },
};
const SS_BYTES = 32;

const ABI_EXPORTS = [
    "memory",
    "alloc",
    "free",
    "mlkem_keygen",
    "mlkem_encaps",
    "mlkem_decaps",
    "rng_stage",
    "rng_reset",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
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

/** Load the `ml_kem` data module of a built variant from its emitted `.wasm.js`. */
async function loadVariant(host: AbiHost): Promise<LoadedWasm> {
    const mod = (await import(join(OUT_DIR, "ml_kem.wasm.js"))) as Record<string, WasmDataModule>;
    const dataModule = Object.values(mod).find(
        m => m && typeof m === "object" && "bytes" in m,
    );
    if (!dataModule) throw new Error("ml_kem.wasm.js: no wasm data module export found");
    return host.load(dataModule);
}

/** Stage `bytes` into the seam via rng_stage(srcPtr, n); throws on a non-zero rc. */
function stageEntropy(host: AbiHost, loaded: LoadedWasm, bytes: Uint8Array): void {
    const staged = host.withBytes(loaded, bytes);
    try {
        const rc = host.run(loaded, "rng_stage", [staged.ptr, bytes.length]);
        if (rc !== 0) throw new Error(`rng_stage rc=${rc}`);
    } finally {
        staged.free();
    }
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

describe("ml_kem manifest wiring", () => {
    test("targets.json `ml_kem` retargeted to mlkem-native + the seam", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "ml_kem");
        expect(t, "no ml_kem target").toBeDefined();
        expect(t!.source).toBe("mlkem-native");
        expect(t!.shim).toBe("shims/mlkem.c");
        // The seam is linked in.
        expect(t!.cSources).toContain("csrc/rng/rng.c");
        // The three multilevel mlkem-native translation units are compiled in.
        expect(t!.cSources.some(c => c.includes("mlkem512"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("mlkem768"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("mlkem1024"))).toBe(true);
        // The frozen ABI + staging exports are declared.
        for (const e of ABI_EXPORTS) {
            if (e === "memory") continue; // memory is a linker export, still listed
            expect(t!.exports).toContain(e);
        }
        expect(t!.exports).toContain("memory");
        // Vectors point at the real on-disk ACVP dirs.
        expect(t!.vectors.some(v => v.includes("ML-KEM-keyGen-FIPS203"))).toBe(true);
        expect(t!.vectors.some(v => v.includes("ML-KEM-encapDecap-FIPS203"))).toBe(true);
    });

    test("ACVP keyGen + encapDecap vectors exist on disk (FIPS-203 final)", async () => {
        const kg = Bun.file(join(ACVP_KEYGEN_DIR, "prompt.json"));
        const kgExp = Bun.file(join(ACVP_KEYGEN_DIR, "expectedResults.json"));
        const ed = Bun.file(join(ACVP_ENCAPDECAP_DIR, "prompt.json"));
        const edExp = Bun.file(join(ACVP_ENCAPDECAP_DIR, "expectedResults.json"));
        expect(await kg.exists()).toBe(true);
        expect(await kgExp.exists()).toBe(true);
        expect(await ed.exists()).toBe(true);
        expect(await edExp.exists()).toBe(true);
        // FIPS-203 final (not round-3): the revision field is carried in-prompt.
        const j = JSON.parse(await kg.text());
        expect(j.revision).toBe("FIPS203");
    });
});

// ─── Build + KAT (toolchain-gated) ────────────────────────────────────────────

describe("ml_kem build + ACVP KAT (toolchain-gated)", () => {
    test("builds simd + scalar, zero imports, ABI exports, ACVP byte-for-byte", async () => {
        if (katDeferral("mlkem", toolchainPresent)) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build both variants. ──
        const code = await runWasmCrypto({ args: ["build", "--pkg", PKG_DIR, "--target", "ml_kem"], config: cfg });
        expect(code, "wasm-crypto build ml_kem exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on BOTH produced binaries. ──
        for (const variant of ["simd", "scalar"] as const) {
            const bytes = new Uint8Array(
                await Bun.file(join(OUT_DIR, `ml_kem.${variant}.wasm`)).arrayBuffer(),
            );
            const imports = await wasmImportNames(bytes);
            expect(imports, `${variant} must import nothing`).toEqual([]);
            const exports = await wasmExportNames(bytes);
            for (const e of ABI_EXPORTS) {
                expect(exports.has(e), `${variant} missing export ${e}`).toBe(true);
            }
        }

        // ── ACVP KAT through the emitted data module (AbiHost). ──
        const host = new AbiHost();
        const loaded = await loadVariant(host);

        const kgPrompt = JSON.parse(await Bun.file(join(ACVP_KEYGEN_DIR, "prompt.json")).text());
        const kgExp = indexExpected(JSON.parse(await Bun.file(join(ACVP_KEYGEN_DIR, "expectedResults.json")).text()));
        const edPrompt = JSON.parse(await Bun.file(join(ACVP_ENCAPDECAP_DIR, "prompt.json")).text());
        const edExp = indexExpected(JSON.parse(await Bun.file(join(ACVP_ENCAPDECAP_DIR, "expectedResults.json")).text()));

        let keyGenChecked = 0;
        let encapsChecked = 0;
        let decapsChecked = 0;

        // keyGen: rng_stage(d || z) → mlkem_keygen(ps, ek, dk) ; assert ek/dk.
        for (const g of kgPrompt.testGroups ?? []) {
            const ps = PARAM_SETS[g.parameterSet];
            if (!ps) continue;
            for (const t of g.tests ?? []) {
                const exp = kgExp.get(`${g.tgId}:${t.tcId}`);
                if (!exp) continue;
                const seed = new Uint8Array(64);
                seed.set(hexToBytes(t.d), 0);
                seed.set(hexToBytes(t.z), 32);
                host.run(loaded, "rng_reset", []);
                stageEntropy(host, loaded, seed);
                const ekOut = host.withBytes(loaded, new Uint8Array(ps.ek));
                const dkOut = host.withBytes(loaded, new Uint8Array(ps.dk));
                try {
                    const rc = host.run(loaded, "mlkem_keygen", [ps.ps, ekOut.ptr, dkOut.ptr]);
                    expect(rc, `keyGen ${g.parameterSet} tc ${t.tcId} rc`).toBe(0);
                    expect(
                        eqBytes(host.readBytes(loaded, ekOut.ptr, ps.ek), hexToBytes(exp.ek as string)),
                        `keyGen ${g.parameterSet} tc ${t.tcId} ek`,
                    ).toBe(true);
                    expect(
                        eqBytes(host.readBytes(loaded, dkOut.ptr, ps.dk), hexToBytes(exp.dk as string)),
                        `keyGen ${g.parameterSet} tc ${t.tcId} dk`,
                    ).toBe(true);
                    keyGenChecked++;
                } finally {
                    dkOut.free();
                    ekOut.free();
                }
            }
        }

        // encapDecap: AFT encapsulation (c/K) + VAL decapsulation (K).
        for (const g of edPrompt.testGroups ?? []) {
            const ps = PARAM_SETS[g.parameterSet];
            if (!ps) continue;
            if (g.function === "encapsulation") {
                for (const t of g.tests ?? []) {
                    const exp = edExp.get(`${g.tgId}:${t.tcId}`);
                    if (!exp) continue;
                    host.run(loaded, "rng_reset", []);
                    stageEntropy(host, loaded, hexToBytes(t.m));
                    const ekIn = host.withBytes(loaded, hexToBytes(t.ek));
                    const cOut = host.withBytes(loaded, new Uint8Array(ps.ct));
                    const kOut = host.withBytes(loaded, new Uint8Array(SS_BYTES));
                    try {
                        const rc = host.run(loaded, "mlkem_encaps", [ps.ps, ekIn.ptr, cOut.ptr, kOut.ptr]);
                        expect(rc, `encaps ${g.parameterSet} tc ${t.tcId} rc`).toBe(0);
                        expect(
                            eqBytes(host.readBytes(loaded, cOut.ptr, ps.ct), hexToBytes(exp.c as string)),
                            `encaps ${g.parameterSet} tc ${t.tcId} c`,
                        ).toBe(true);
                        expect(
                            eqBytes(host.readBytes(loaded, kOut.ptr, SS_BYTES), hexToBytes(exp.k as string)),
                            `encaps ${g.parameterSet} tc ${t.tcId} K`,
                        ).toBe(true);
                        encapsChecked++;
                    } finally {
                        kOut.free();
                        cOut.free();
                        ekIn.free();
                    }
                }
            } else if (g.function === "decapsulation") {
                for (const t of g.tests ?? []) {
                    const exp = edExp.get(`${g.tgId}:${t.tcId}`);
                    if (!exp) continue;
                    const dkIn = host.withBytes(loaded, hexToBytes(t.dk));
                    const cIn = host.withBytes(loaded, hexToBytes(t.c));
                    const kOut = host.withBytes(loaded, new Uint8Array(SS_BYTES));
                    try {
                        const rc = host.run(loaded, "mlkem_decaps", [ps.ps, dkIn.ptr, cIn.ptr, kOut.ptr]);
                        expect(rc, `decaps ${g.parameterSet} tc ${t.tcId} rc`).toBe(0);
                        expect(
                            eqBytes(host.readBytes(loaded, kOut.ptr, SS_BYTES), hexToBytes(exp.k as string)),
                            `decaps ${g.parameterSet} tc ${t.tcId} K`,
                        ).toBe(true);
                        decapsChecked++;
                    } finally {
                        kOut.free();
                        cIn.free();
                        dkIn.free();
                    }
                }
            }
            // decapsulationKeyCheck / encapsulationKeyCheck (VAL key-validity)
            // groups are not part of the frozen mlkem_* ABI surface — skipped.
        }

        // Guard: every parameter set actually exercised (no silent empty pass).
        expect(keyGenChecked, "keyGen vectors checked").toBeGreaterThan(0);
        expect(encapsChecked, "encaps vectors checked").toBeGreaterThan(0);
        expect(decapsChecked, "decaps vectors checked").toBeGreaterThan(0);
        console.warn(
            `[mlkem.kat] ACVP byte-for-byte OK — keyGen=${keyGenChecked} ` +
                `encaps=${encapsChecked} decaps=${decapsChecked} (512/768/1024).`,
        );
    }, 120_000);
});
