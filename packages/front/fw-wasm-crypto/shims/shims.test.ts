// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * shims.test.ts — static conformance for the wasm-crypto ABI shims + targets.
 *
 * These checks are byte-free: they never compile C or run a wasm module
 * (tasks 03/04 exercise the full compile + KAT pipeline). They guard the
 * *manifest* and *shim wiring*:
 *   - `targets.json` validates against the task-01 schema (`validateTargets`);
 *   - every fw wasm module from fw/BATCH_11 has exactly one target;
 *   - each target's `exports` includes the ABI-mandated `memory`/`alloc`/`free`
 *     plus the algorithm's exported functions;
 *   - each declared `vectors` path is well-formed (rooted under `references/`).
 *     (The actual KAT files are vendored later by task 04; existence on disk is
 *     not asserted here — only that the declared paths are well-formed.)
 */

import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { validateTargets, type Target } from "../../../../tools/wasm-crypto/src/targets.schema.ts";

// ─── Load the committed manifest ──────────────────────────────────────────────

const TARGETS_PATH = join(import.meta.dir, "..", "targets.json");
const raw: unknown = JSON.parse(await Bun.file(TARGETS_PATH).text());

// The 17 fw wasm modules defined by fw/BATCH_11 tasks 02–18, with the exact
// `<algo>Wasm` JS export identifier each wrapper imports.
const FW_WASM_MODULES: ReadonlyArray<{ wasmModule: string; exportName: string }> = [
    { wasmModule: "argon2", exportName: "argon2Wasm" },
    { wasmModule: "ml_kem", exportName: "mlKemWasm" },
    { wasmModule: "ml_dsa", exportName: "mlDsaWasm" },
    { wasmModule: "slh_dsa", exportName: "slhDsaWasm" },
    { wasmModule: "sha3", exportName: "sha3Wasm" },
    { wasmModule: "blake2b", exportName: "blake2bWasm" },
    { wasmModule: "chacha20poly1305", exportName: "chacha20poly1305Wasm" },
    { wasmModule: "cmac", exportName: "cmacWasm" },
    { wasmModule: "sha2", exportName: "sha2Wasm" },
    { wasmModule: "hmac", exportName: "hmacWasm" },
    { wasmModule: "pbkdf2", exportName: "pbkdf2Wasm" },
    { wasmModule: "hkdf", exportName: "hkdfWasm" },
    { wasmModule: "aes", exportName: "aesWasm" },
    { wasmModule: "rsa", exportName: "rsaWasm" },
    { wasmModule: "ecc", exportName: "eccWasm" },
    { wasmModule: "ed25519", exportName: "ed25519Wasm" },
    { wasmModule: "x25519", exportName: "x25519Wasm" },
];

// Algorithm-specific ABI functions each target must export, transcribed from the
// fw/BATCH_11 "Expected WASM ABI" sections (source-of-truth — do not invent).
const ALGO_ABI: Record<string, string[]> = {
    argon2: ["argon2id_hash"],
    ml_kem: ["mlkem_keygen", "mlkem_encaps", "mlkem_decaps"],
    ml_dsa: ["mldsa_keygen", "mldsa_sign", "mldsa_verify"],
    slh_dsa: ["slhdsa_keygen", "slhdsa_sign", "slhdsa_verify"],
    sha3: ["sha3"],
    blake2b: ["blake2b"],
    chacha20poly1305: ["aead_seal", "aead_open"],
    cmac: ["aes_cmac"],
    sha2: ["sha2"],
    hmac: ["hmac"],
    pbkdf2: ["pbkdf2"],
    hkdf: ["hkdf"],
    aes: ["aes_gcm_seal", "aes_gcm_open", "aes_cbc_enc", "aes_cbc_dec", "aes_ctr"],
    rsa: ["rsa_keygen", "rsa_oaep_enc", "rsa_oaep_dec", "rsa_sign", "rsa_verify"],
    ecc: ["ecdsa_keygen", "ecdsa_sign", "ecdsa_verify", "ecdh"],
    ed25519: ["ed25519_keypair", "ed25519_sign", "ed25519_verify"],
    x25519: ["x25519_base", "x25519"],
};

// ─── Schema ───────────────────────────────────────────────────────────────────

describe("targets.json — schema", () => {
    test("validates against the task-01 schema", () => {
        expect(() => validateTargets(raw)).not.toThrow();
    });

    test("is a non-empty array", () => {
        const targets = validateTargets(raw);
        expect(targets.length).toBeGreaterThan(0);
    });
});

// ─── One target per fw wasm module ────────────────────────────────────────────

describe("targets.json — fw module coverage", () => {
    const targets: Target[] = validateTargets(raw);

    test("covers exactly the 17 fw wasm modules", () => {
        expect(targets).toHaveLength(FW_WASM_MODULES.length);
    });

    for (const { wasmModule, exportName } of FW_WASM_MODULES) {
        test(`has exactly one target for fw module "${wasmModule}"`, () => {
            const matches = targets.filter(t => t.wasmModule === wasmModule);
            expect(matches).toHaveLength(1);
            expect(matches[0]!.exportName).toBe(exportName);
        });
    }

    test("declares no wasm module outside the fw/BATCH_11 set", () => {
        const known = new Set(FW_WASM_MODULES.map(m => m.wasmModule));
        for (const t of targets) {
            expect(known.has(t.wasmModule)).toBe(true);
        }
    });
});

// ─── Required + algorithm exports ─────────────────────────────────────────────

describe("targets.json — exports", () => {
    const targets: Target[] = validateTargets(raw);

    for (const t of targets) {
        test(`"${t.algo}" exports memory/alloc/free`, () => {
            for (const req of ["memory", "alloc", "free"]) {
                expect(t.exports).toContain(req);
            }
        });

        test(`"${t.algo}" exports its BATCH_11 ABI functions`, () => {
            const expected = ALGO_ABI[t.algo];
            expect(expected, `no ABI map for algo "${t.algo}"`).toBeDefined();
            for (const fn of expected!) {
                expect(t.exports).toContain(fn);
            }
        });
    }
});

// ─── Shim wiring + cSources ───────────────────────────────────────────────────

describe("targets.json — build wiring", () => {
    const targets: Target[] = validateTargets(raw);

    for (const t of targets) {
        test(`"${t.algo}" points at a shims/*.c adapter`, () => {
            expect(t.shim).toMatch(/^shims\/[A-Za-z0-9_]+\.c$/);
        });

        test(`"${t.algo}" lists at least one vendored C source`, () => {
            expect(t.cSources.length).toBeGreaterThan(0);
            for (const c of t.cSources) {
                expect(c).toMatch(/\.c$/);
            }
        });
    }

    test("AES + ECC select the constant-time path (no AES-NI in wasm)", () => {
        const aes = targets.find(t => t.algo === "aes")!;
        const ecc = targets.find(t => t.algo === "ecc")!;
        // AES uses BearSSL ct64 sources; ECC uses fiat-crypto field arith path.
        expect(aes.cSources.some(c => c.includes("aes_ct64"))).toBe(true);
        expect(aes.cflags.join(" ")).toContain("WASM_NO_AESNI");
        expect(ecc.source).toBe("fiat-crypto");
        expect(ecc.cflags.join(" ")).toContain("fiat-crypto");
    });
});

// ─── Vector paths (well-formed; existence vendored later by task 04) ──────────

describe("targets.json — vectors", () => {
    const targets: Target[] = validateTargets(raw);

    for (const t of targets) {
        test(`"${t.algo}" declares well-formed vector paths under references/`, () => {
            expect(t.vectors.length).toBeGreaterThan(0);
            for (const v of t.vectors) {
                // Rooted under references/ and POSIX-style (the KAT runner
                // resolves each path cwd-relative via verify.ts's own
                // resolvePath — see tools/wasm-crypto/src/cmd/verify.ts:34).
                // Existence on disk is NOT asserted: the official KAT/ACVP/RFC
                // files are vendored by task 04 — see report.
                expect(v.startsWith("references/")).toBe(true);
                expect(v).not.toContain("\\");
                expect(v).not.toContain("..");
            }
        });
    }
});
