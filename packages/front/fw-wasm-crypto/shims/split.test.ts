// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * split.test.ts — static conformance for the W3 Tier-B shim split.
 *
 * Byte-free (no compile): reads the shim .c source text and asserts:
 *   - aes.c defines exactly the 5 AES exports and references br_aes_ct64 / br_ghash;
 *   - rsa.c defines exactly the 5 RSA exports and references br_rsa_i31;
 *   - each of the two files #include "_arena.h" exactly once.
 *
 * NOTE: bearssl.c and hashes.c removed in tools/BATCH_24 (W5) as orphaned shims.
 */

import { describe, test, expect } from "bun:test";
import { join } from "node:path";

const SHIMS_DIR = join(import.meta.dir);

const aesC    = await Bun.file(join(SHIMS_DIR, "aes.c")).text();
const rsaC    = await Bun.file(join(SHIMS_DIR, "rsa.c")).text();

// ─── aes.c ────────────────────────────────────────────────────────────────────

describe("aes.c — AES exports", () => {
    const AES_EXPORTS = ["aes_ctr", "aes_cbc_enc", "aes_cbc_dec", "aes_gcm_seal", "aes_gcm_open"] as const;

    for (const fn of AES_EXPORTS) {
        test(`defines ${fn}`, () => {
            // Match a C function definition: "int <fn>(" possibly preceded by newline
            expect(aesC).toMatch(new RegExp(`\\bint ${fn}\\s*\\(`));
        });
    }

    test("references br_aes_ct64 (constant-time path)", () => {
        expect(aesC).toContain("br_aes_ct64");
    });

    test("references br_ghash (GCM GHASH)", () => {
        expect(aesC).toContain("br_ghash");
    });

    test("does NOT define rsa exports", () => {
        expect(aesC).not.toContain("rsa_keygen");
        expect(aesC).not.toContain("rsa_sign");
    });
});

// ─── rsa.c ────────────────────────────────────────────────────────────────────

describe("rsa.c — RSA exports", () => {
    const RSA_EXPORTS = ["rsa_keygen", "rsa_oaep_enc", "rsa_oaep_dec", "rsa_sign", "rsa_verify"] as const;

    for (const fn of RSA_EXPORTS) {
        test(`defines ${fn}`, () => {
            expect(rsaC).toMatch(new RegExp(`\\bint ${fn}\\s*\\(`));
        });
    }

    test("references br_rsa_i31 (i31 big-integer engine)", () => {
        expect(rsaC).toContain("br_rsa_i31");
    });

    test("does NOT contain the extern br_pbkdf2 decl (PBKDF2-only)", () => {
        expect(rsaC).not.toContain("extern void br_pbkdf2");
    });

    test("does NOT define aes exports", () => {
        expect(rsaC).not.toContain("aes_gcm_seal");
        expect(rsaC).not.toContain("aes_cbc_enc");
    });
});

// ─── #include "_arena.h" — exactly once per file ─────────────────────────────

describe("arena include — each shim includes _arena.h exactly once", () => {
    const countIncludes = (src: string): number => {
        return (src.match(/#include\s+"_arena\.h"/g) ?? []).length;
    };

    test("aes.c includes _arena.h exactly once", () => {
        expect(countIncludes(aesC)).toBe(1);
    });

    test("rsa.c includes _arena.h exactly once", () => {
        expect(countIncludes(rsaC)).toBe(1);
    });
});
