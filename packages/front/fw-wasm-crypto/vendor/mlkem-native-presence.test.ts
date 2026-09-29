/**
 * Presence checks for the vendored mlkem-native v1.2.0 ref (portable C) subset.
 *
 * Verifies:
 *  1. The public API header declares keygen / encaps / decaps + derandomized
 *     entry points (keypair_derand, enc_derand).
 *  2. The bundled FIPS-202 unit (fips202.c / fips202.h) is present, proving
 *     the tree is genuinely freestanding (no external SHAKE dependency).
 *  3. Core scheme sources (kem.c, indcpa.c, params.h, randombytes.h) are present.
 *  4. Native backends are NOT present (we vendor only the portable ref build).
 *
 * These are byte / manifest checks only — no compile or link step.
 * The compile + ACVP round-trip is task 04 (gated on WASI_SDK_PATH).
 *
 * Run: bun test packages/front/fw-wasm-crypto/vendor/
 */

import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const VENDOR = join(import.meta.dir);
const MLKEM = join(VENDOR, 'mlkem-native');
const SRC = join(MLKEM, 'src');
const FIPS202 = join(SRC, 'fips202');

// ---------------------------------------------------------------------------
// 1. PUBLIC API — mlkem_native.h declares keygen / encaps / decaps
//    and the DERANDOMIZED entry points required for KAT.
// ---------------------------------------------------------------------------

describe('mlkem-native — public API header', () => {
    const hPath = join(MLKEM, 'mlkem_native.h');

    it('mlkem_native.h exists', () => {
        expect(existsSync(hPath)).toBe(true);
    });

    it('declares keypair (keygen)', () => {
        const content = readFileSync(hPath, 'utf8');
        expect(content).toContain('keypair');
    });

    it('declares enc (encaps)', () => {
        const content = readFileSync(hPath, 'utf8');
        expect(content).toContain('crypto_kem_enc');
    });

    it('declares dec (decaps)', () => {
        const content = readFileSync(hPath, 'utf8');
        expect(content).toContain('crypto_kem_dec');
    });

    it('declares keypair_derand (deterministic keygen for KAT)', () => {
        const content = readFileSync(hPath, 'utf8');
        expect(content).toContain('keypair_derand');
    });

    it('declares enc_derand (deterministic encaps for KAT)', () => {
        const content = readFileSync(hPath, 'utf8');
        expect(content).toContain('enc_derand');
    });

    it('supports parameter sets 512 / 768 / 1024 via MLK_CONFIG_PARAMETER_SET', () => {
        const cfg = readFileSync(join(MLKEM, 'mlkem_native_config.h'), 'utf8');
        expect(cfg).toContain('MLK_CONFIG_PARAMETER_SET');
        expect(cfg).toContain('512');
        expect(cfg).toContain('768');
        expect(cfg).toContain('1024');
    });
});

// ---------------------------------------------------------------------------
// 2. BUNDLED FIPS-202 — confirms the tree is freestanding (no external SHAKE)
// ---------------------------------------------------------------------------

describe('mlkem-native — bundled FIPS-202 (freestanding)', () => {
    it('src/fips202/fips202.c exists', () => {
        expect(existsSync(join(FIPS202, 'fips202.c'))).toBe(true);
    });

    it('src/fips202/fips202.h exists', () => {
        expect(existsSync(join(FIPS202, 'fips202.h'))).toBe(true);
    });

    it('src/fips202/keccakf1600.c exists (portable Keccak-f1600)', () => {
        expect(existsSync(join(FIPS202, 'keccakf1600.c'))).toBe(true);
    });

    it('src/fips202/keccakf1600.h exists', () => {
        expect(existsSync(join(FIPS202, 'keccakf1600.h'))).toBe(true);
    });

    it('fips202.h exposes SHAKE128 / SHAKE256 symbols', () => {
        const content = readFileSync(join(FIPS202, 'fips202.h'), 'utf8');
        expect(content).toContain('shake128');
        expect(content).toContain('shake256');
    });
});

// ---------------------------------------------------------------------------
// 3. CORE SCHEME SOURCES
// ---------------------------------------------------------------------------

describe('mlkem-native — core scheme C sources', () => {
    const required = [
        'kem.c', 'kem.h',
        'indcpa.c', 'indcpa.h',
        'poly.c', 'poly.h',
        'poly_k.c', 'poly_k.h',
        'compress.c', 'compress.h',
        'sampling.c', 'sampling.h',
        'verify.c', 'verify.h',
        'params.h',
        'randombytes.h',   // seam — provided by task 01 (csrc/rng)
        'symmetric.h',
        'sys.h',
        'common.h',
        'cbmc.h',          // CBMC compat shim, required for __contract__ annotations
        'zetas.inc',
    ];
    for (const f of required) {
        it(`src/${f} exists`, () => {
            expect(existsSync(join(SRC, f))).toBe(true);
        });
    }
});

// ---------------------------------------------------------------------------
// 4. NATIVE BACKENDS EXCLUDED — confirm the portable ref build only
// ---------------------------------------------------------------------------

describe('mlkem-native — native backends excluded (ref build only)', () => {
    it('src/native/ is NOT present (no AVX2/Neon/aarch64/riscv64/ppc64le)', () => {
        expect(existsSync(join(SRC, 'native'))).toBe(false);
    });

    it('src/fips202/native/ is NOT present (no native Keccak backends)', () => {
        expect(existsSync(join(FIPS202, 'native'))).toBe(false);
    });

    it('mlkem_native_asm.S is NOT present (assembly not needed for wasm32)', () => {
        expect(existsSync(join(MLKEM, 'mlkem_native_asm.S'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 5. SCU (single compilation unit) source present
// ---------------------------------------------------------------------------

describe('mlkem-native — single compilation unit', () => {
    it('mlkem_native.c exists (SCU — includes all portable sources)', () => {
        expect(existsSync(join(MLKEM, 'mlkem_native.c'))).toBe(true);
    });

    it('mlkem_native.c includes fips202.c (bundled FIPS-202)', () => {
        const content = readFileSync(join(MLKEM, 'mlkem_native.c'), 'utf8');
        expect(content).toContain('fips202/fips202.c');
    });

    it('mlkem_native.c includes kem.c', () => {
        const content = readFileSync(join(MLKEM, 'mlkem_native.c'), 'utf8');
        expect(content).toContain('src/kem.c');
    });
});
