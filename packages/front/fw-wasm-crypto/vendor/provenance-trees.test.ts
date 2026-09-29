/**
 * Provenance tree presence + integrity tests.
 *
 * Two layers:
 *
 * 1. FILE-PRESENCE (this task, task 03-vendor-pqclean) — assertions about
 *    vendored files on disk; these PASS immediately after task 03 delivers.
 *
 * 2. PROVENANCE-ENTRY (orchestrator-completed) — assertions that read
 *    vendor/PROVENANCE.json and check for the `pqclean` (and `mlkem-native`)
 *    tree entries.  These are RED until the orchestrator writes PROVENANCE.json
 *    with the merged entries from tasks 02 and 03.  Do NOT weaken them.
 *
 * Run:  bun test packages/front/fw-wasm-crypto/vendor/
 */

import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProvenance } from '../src/provenance.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PKG = join(import.meta.dir, '..');
const VENDOR = join(PKG, 'vendor');
const PQCLEAN = join(VENDOR, 'pqclean');
const PROVENANCE_PATH = join(VENDOR, 'PROVENANCE.json');

// ---------------------------------------------------------------------------
// 1. FILE-PRESENCE — pqclean vendored bytes (task 03)
// ---------------------------------------------------------------------------

describe('pqclean — vendored files present', () => {
    it('common/fips202.c exists', () => {
        expect(existsSync(join(PQCLEAN, 'common', 'fips202.c'))).toBe(true);
    });

    it('common/fips202.h exists', () => {
        expect(existsSync(join(PQCLEAN, 'common', 'fips202.h'))).toBe(true);
    });

    it('common/sha2.c exists', () => {
        expect(existsSync(join(PQCLEAN, 'common', 'sha2.c'))).toBe(true);
    });

    it('common/sha2.h exists', () => {
        expect(existsSync(join(PQCLEAN, 'common', 'sha2.h'))).toBe(true);
    });

    it('common/compat.h exists', () => {
        expect(existsSync(join(PQCLEAN, 'common', 'compat.h'))).toBe(true);
    });

    it('common/randombytes.h exists (declaration seam)', () => {
        expect(existsSync(join(PQCLEAN, 'common', 'randombytes.h'))).toBe(true);
    });

    it('common/randombytes.c is NOT present (definition owned by csrc/rng seam)', () => {
        expect(existsSync(join(PQCLEAN, 'common', 'randombytes.c'))).toBe(false);
    });

    // ML-DSA api.h presence (FIPS-204)
    for (const variant of ['ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87']) {
        it(`${variant}/clean/api.h exists`, () => {
            expect(existsSync(join(PQCLEAN, 'crypto_sign', variant, 'clean', 'api.h'))).toBe(true);
        });
    }

    // NOTE: the round-3 SPHINCS+ sets first vendored here were removed once
    // SLH-DSA was re-sourced from OpenSSL FIPS-205 (vendor/openssl-slh-dsa).
    // This tree no longer vendors any sphincs set.
    it('no sphincs-*-simple set remains under crypto_sign (re-sourced to OpenSSL)', () => {
        expect(existsSync(join(PQCLEAN, 'crypto_sign', 'sphincs-sha2-128f-simple'))).toBe(false);
        expect(existsSync(join(PQCLEAN, 'crypto_sign', 'sphincs-shake-256s-simple'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 2. NAMESPACED SYMBOLS — grep PQCLEAN_*_crypto_sign_signature in api.h files
// ---------------------------------------------------------------------------

describe('pqclean — namespaced PQCLEAN_* symbols present', () => {
    it('ml-dsa-44 api.h declares PQCLEAN_MLDSA44_CLEAN_crypto_sign_signature', () => {
        const content = readFileSync(
            join(PQCLEAN, 'crypto_sign', 'ml-dsa-44', 'clean', 'api.h'),
            'utf8'
        );
        expect(content).toContain('PQCLEAN_MLDSA44_CLEAN_crypto_sign_signature');
    });

    it('ml-dsa-65 api.h declares PQCLEAN_MLDSA65_CLEAN_crypto_sign_signature', () => {
        const content = readFileSync(
            join(PQCLEAN, 'crypto_sign', 'ml-dsa-65', 'clean', 'api.h'),
            'utf8'
        );
        expect(content).toContain('PQCLEAN_MLDSA65_CLEAN_crypto_sign_signature');
    });

    it('ml-dsa-87 api.h declares PQCLEAN_MLDSA87_CLEAN_crypto_sign_signature', () => {
        const content = readFileSync(
            join(PQCLEAN, 'crypto_sign', 'ml-dsa-87', 'clean', 'api.h'),
            'utf8'
        );
        expect(content).toContain('PQCLEAN_MLDSA87_CLEAN_crypto_sign_signature');
    });
});

// ---------------------------------------------------------------------------
// 3. BEARSSL — vendored bytes (task 02)
// ---------------------------------------------------------------------------

const BEARSSL = join(VENDOR, 'bearssl');

describe('bearssl — vendored files present', () => {
    it('src/symcipher/aes_ct64.c exists', () => {
        expect(existsSync(join(BEARSSL, 'src', 'symcipher', 'aes_ct64.c'))).toBe(true);
    });

    it('src/rsa/rsa_i31_priv.c exists', () => {
        expect(existsSync(join(BEARSSL, 'src', 'rsa', 'rsa_i31_priv.c'))).toBe(true);
    });

    it('src/ec/ec_prime_i31.c exists', () => {
        expect(existsSync(join(BEARSSL, 'src', 'ec', 'ec_prime_i31.c'))).toBe(true);
    });

    it('inc/bearssl.h exists', () => {
        expect(existsSync(join(BEARSSL, 'inc', 'bearssl.h'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 4. LIBSODIUM — vendored files present (task 01)
// ---------------------------------------------------------------------------

const LIBSODIUM = join(VENDOR, 'libsodium');

describe('libsodium — vendored files present', () => {
    it('crypto_sign/ed25519/ref10/sign.c exists', () => {
        expect(
            existsSync(join(LIBSODIUM, 'crypto_sign', 'ed25519', 'ref10', 'sign.c'))
        ).toBe(true);
    });

    it('crypto_core/ed25519/ref10/ed25519_ref10.c exists', () => {
        expect(
            existsSync(join(LIBSODIUM, 'crypto_core', 'ed25519', 'ref10', 'ed25519_ref10.c'))
        ).toBe(true);
    });

    it('crypto_scalarmult/curve25519/ref10/x25519_ref10.c exists', () => {
        expect(
            existsSync(join(LIBSODIUM, 'crypto_scalarmult', 'curve25519', 'ref10', 'x25519_ref10.c'))
        ).toBe(true);
    });

    it('crypto_core/ed25519/ref10/private/ed25519_ref10_fe_25_5.h exists', () => {
        expect(
            existsSync(
                join(LIBSODIUM, 'crypto_core', 'ed25519', 'ref10', 'private', 'ed25519_ref10_fe_25_5.h')
            )
        ).toBe(true);
    });

    it('crypto_scalarmult/curve25519/scalarmult_curve25519.c is ABSENT (dispatcher not vendored)', () => {
        expect(
            existsSync(join(LIBSODIUM, 'crypto_scalarmult', 'curve25519', 'scalarmult_curve25519.c'))
        ).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 5. PROVENANCE-ENTRY — requires PROVENANCE.json written by the orchestrator
//    These assertions are RED until the orchestrator merges tasks 02+03 entries.
//    Do NOT weaken or skip them; they are the verification gate for W3.
// ---------------------------------------------------------------------------

describe('PROVENANCE.json — validateProvenance (orchestrator-completed)', () => {
    it('PROVENANCE.json parses and validateProvenance does not throw', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        expect(() => validateProvenance(raw)).not.toThrow();
    });

    it('version is 1', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        expect(raw.version).toBe(1);
    });

    it('trees[] has a "pqclean" entry', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string }>).find((t) => t.id === 'pqclean');
        expect(entry).toBeDefined();
    });

    it('pqclean entry sha256 matches /^[0-9a-f]{64}$/', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; sha256: string }>).find(
            (t) => t.id === 'pqclean'
        );
        expect(entry).toBeDefined();
        expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('pqclean entry ref equals the pinned commit', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; ref: string }>).find(
            (t) => t.id === 'pqclean'
        );
        expect(entry).toBeDefined();
        expect(entry!.ref).toBe('202a8f96315f9ed219387a50f7e40d04af037ea8');
    });

    // mlkem-native entry (task 02, folded in by the orchestrator)

    it('trees[] has an "mlkem-native" entry', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string }>).find((t) => t.id === 'mlkem-native');
        expect(entry).toBeDefined();
    });

    it('mlkem-native entry sha256 matches /^[0-9a-f]{64}$/', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; sha256: string }>).find(
            (t) => t.id === 'mlkem-native'
        );
        expect(entry).toBeDefined();
        expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('mlkem-native entry url ends v1.2.0.tar.gz', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; url: string }>).find(
            (t) => t.id === 'mlkem-native'
        );
        expect(entry).toBeDefined();
        expect(entry!.url).toMatch(/v1\.2\.0\.tar\.gz$/);
    });

    it('mlkem-native entry ref is v1.2.0', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; ref: string }>).find(
            (t) => t.id === 'mlkem-native'
        );
        expect(entry).toBeDefined();
        expect(entry!.ref).toBe('v1.2.0');
    });

    // bearssl entry (task 02)

    it('trees[] has a "bearssl" entry', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string }>).find((t) => t.id === 'bearssl');
        expect(entry).toBeDefined();
    });

    it('bearssl entry sha256 matches /^[0-9a-f]{64}$/', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; sha256: string }>).find(
            (t) => t.id === 'bearssl'
        );
        expect(entry).toBeDefined();
        expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('bearssl entry ref is v0.6', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; ref: string }>).find(
            (t) => t.id === 'bearssl'
        );
        expect(entry).toBeDefined();
        expect(entry!.ref).toBe('v0.6');
    });

    // fiat-crypto entry (task 02)

    it('trees[] has a "fiat-crypto" entry', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string }>).find((t) => t.id === 'fiat-crypto');
        expect(entry).toBeDefined();
    });

    it('fiat-crypto entry sha256 matches /^[0-9a-f]{64}$/', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; sha256: string }>).find(
            (t) => t.id === 'fiat-crypto'
        );
        expect(entry).toBeDefined();
        expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('fiat-crypto entry ref is v0.1.6', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; ref: string }>).find(
            (t) => t.id === 'fiat-crypto'
        );
        expect(entry).toBeDefined();
        expect(entry!.ref).toBe('v0.1.6');
    });

    // libsodium entry (task 01)

    it('trees[] has a "libsodium" entry', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string }>).find((t) => t.id === 'libsodium');
        expect(entry).toBeDefined();
    });

    it('libsodium entry sha256 matches /^[0-9a-f]{64}$/', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; sha256: string }>).find(
            (t) => t.id === 'libsodium'
        );
        expect(entry).toBeDefined();
        expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('libsodium entry ref is 1.0.22-RELEASE', () => {
        const raw = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
        const entry = (raw.trees as Array<{ id: string; ref: string }>).find(
            (t) => t.id === 'libsodium'
        );
        expect(entry).toBeDefined();
        expect(entry!.ref).toBe('1.0.22-RELEASE');
    });
});
