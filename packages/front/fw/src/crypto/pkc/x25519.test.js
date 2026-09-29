// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { x25519 } from './x25519.js';
import { hex } from '../../io/codec/hex.js';

const _hex = hex.factory();
const _x = x25519.factory();

const fromHex = (s) => _hex.toBytes(s);
const toHex = (u8) => _hex.fromBytes(u8);

describe('x25519 module (RFC 7748)', () => {

    test('module metadata', () => {
        expect(x25519.name).toBe('x25519');
        expect(x25519.dependencies).toEqual([]);
    });

    // RFC 7748 §5.2 - Test vector 1
    test('§5.2 test vector 1', () => {
        const scalar = fromHex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4');
        const u      = fromHex('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c');
        const expected = 'c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552';
        expect(toHex(_x.scalarMult(scalar, u))).toBe(expected);
    });

    // RFC 7748 §5.2 - Test vector 2
    test('§5.2 test vector 2', () => {
        const scalar = fromHex('4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d');
        const u      = fromHex('e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493');
        const expected = '95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957';
        expect(toHex(_x.scalarMult(scalar, u))).toBe(expected);
    });

    // RFC 7748 §6.1 - Diffie-Hellman example
    test('§6.1 ECDH agreement matches', () => {
        const aPriv = fromHex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
        const bPriv = fromHex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
        const aPub = _x.scalarMultBase(aPriv);
        const bPub = _x.scalarMultBase(bPriv);
        expect(toHex(aPub)).toBe('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
        expect(toHex(bPub)).toBe('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
        const sharedA = _x.scalarMult(aPriv, bPub);
        const sharedB = _x.scalarMult(bPriv, aPub);
        expect(toHex(sharedA)).toBe('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742');
        expect(toHex(sharedA)).toBe(toHex(sharedB));
    });

    test('rejects non-32-byte scalar', () => {
        expect(_x.scalarMult(new Uint8Array(31), new Uint8Array(32))).toBe(false);
    });

    // ========================================================================
    // RFC 7748 §5.2 - Iterative test
    // K_{i+1} = X25519(K_i, U_i), then U_{i+1} := K_i (input becomes prior key).
    // Three checkpoints published by RFC: iter=1, iter=1000, iter=1,000,000.
    // We cover iter=1 and iter=1000 (≤1s on commodity hardware). The 1M-iter
    // checkpoint is documented in x25519.acvp.md as out of scope for default CI
    // (~10 min); enable via the explicit env-flag test below.
    // ========================================================================

    test('§5.2 iterative - after 1 iteration', () => {
        // K = U = base = 0x09...00
        let K = new Uint8Array(32); K[0] = 9;
        let U = new Uint8Array(32); U[0] = 9;
        const next = _x.scalarMult(K, U);
        K = next;
        expect(toHex(K)).toBe('422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079');
    });

    test('§5.2 iterative - after 1000 iterations', () => {
        let K = new Uint8Array(32); K[0] = 9;
        let U = new Uint8Array(32); U[0] = 9;
        for (let i = 0; i < 1000; i++) {
            const next = _x.scalarMult(K, U);
            U = K;
            K = next;
        }
        expect(toHex(K)).toBe('684cf59ba83309552800ef566f2f4d3c1c3887c49360e3875f2eb94d99532c51');
    }, 30_000);

    // 1,000,000-iteration checkpoint, gated by env flag (~10 min wall-clock).
    test.if(!!process.env.CRYPTO_FULL)('§5.2 iterative - after 1,000,000 iterations (CRYPTO_FULL)', () => {
        let K = new Uint8Array(32); K[0] = 9;
        let U = new Uint8Array(32); U[0] = 9;
        for (let i = 0; i < 1_000_000; i++) {
            const next = _x.scalarMult(K, U);
            U = K;
            K = next;
        }
        expect(toHex(K)).toBe('7c3911e0ab2586fd864497297e575e6f3bc601c0883c30df5f4dd2d24f665424');
    }, 60 * 60_000);

    // ========================================================================
    // RFC 7748 §6.1 ECDH - clamping cross-check.
    // Per §5: scalarMult applies the clamp d[0] &= 248; d[31] &= 127; d[31] |= 64.
    // Two scalars that differ only in clamped bits MUST produce identical outputs.
    // ========================================================================

    test('clamping - bit-flips of d[0] low 3 bits and d[31] top 2 bits are absorbed', () => {
        const base = fromHex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
        const ref = toHex(_x.scalarMultBase(base));
        for (const mask of [0x07, 0x40, 0x80, 0xc7]) {
            const variant = new Uint8Array(base);
            variant[0]  ^= (mask & 0x07);     // toggles cleared low 3 bits
            variant[31] ^= (mask & 0xc0);     // toggles bit-7 (must clear) and bit-6 (must set)
            expect(toHex(_x.scalarMultBase(variant))).toBe(ref);
        }
    });

    // ========================================================================
    // Wycheproof-style - small-subgroup / low-order u-coordinates.
    // Per RFC 7748 §6 final paragraph: implementations MAY (but are NOT required
    // to) reject low-order public keys. Our impl follows the SHOULD-NOT-reject
    // convention (just returns the all-zero shared secret, marking the key as
    // contributing no entropy). Callers MUST check for the all-zero output if
    // contributory KEM behaviour is required (cf. RFC 7748 §6.1, §7).
    //
    // Vectors taken from Curve25519 specification (Bernstein) + Wycheproof
    // x25519_test.json (twist & order-2/order-4 points).
    // ========================================================================

    test('low-order point u=0 → 0 (point at infinity image)', () => {
        const scalar = fromHex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4');
        const u = new Uint8Array(32); // u=0
        expect(toHex(_x.scalarMult(scalar, u)))
            .toBe('0000000000000000000000000000000000000000000000000000000000000000');
    });

    test('low-order point u=1 → 0 (order-2 small subgroup)', () => {
        const scalar = fromHex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4');
        const u = new Uint8Array(32); u[0] = 1;
        expect(toHex(_x.scalarMult(scalar, u)))
            .toBe('0000000000000000000000000000000000000000000000000000000000000000');
    });

    test('low-order point u=p-1 (=2^255-20) → 0', () => {
        const scalar = fromHex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4');
        // p = 2^255 - 19, so p-1 = 2^255 - 20 little-endian:
        const u = fromHex('ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f');
        expect(toHex(_x.scalarMult(scalar, u)))
            .toBe('0000000000000000000000000000000000000000000000000000000000000000');
    });

    // ========================================================================
    // RFC 7748 §5 - high bit of u-coordinate MUST be ignored on input.
    // Section 5: "When receiving such an array, implementations of X25519
    // (...) MUST mask the most significant bit in the final byte. This is
    // done to preserve compatibility with point formats that reserve the sign
    // bit for use in other protocols (...)"
    // ========================================================================

    test('§5 high bit of u is ignored on input (matches masked variant)', () => {
        const scalar = fromHex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4');
        const u      = fromHex('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c');
        const uHigh  = new Uint8Array(u);
        uHigh[31] |= 0x80;  // set the MSB that MUST be masked
        expect(toHex(_x.scalarMult(scalar, uHigh)))
            .toBe(toHex(_x.scalarMult(scalar, u)));
    });

    // ========================================================================
    // Round-trip - derived public keys must round-trip via Diffie-Hellman.
    // Stress test: 5 random scalars × symmetric DH equality.
    // ========================================================================

    test('ECDH symmetry on 5 random scalar pairs', () => {
        for (let i = 0; i < 5; i++) {
            const a = new Uint8Array(32); for (let j = 0; j < 32; j++) a[j] = (i * 31 + j * 7 + 1) & 0xff;
            const b = new Uint8Array(32); for (let j = 0; j < 32; j++) b[j] = (i * 17 + j * 11 + 5) & 0xff;
            const A = _x.scalarMultBase(a);
            const B = _x.scalarMultBase(b);
            const sAB = _x.scalarMult(a, B);
            const sBA = _x.scalarMult(b, A);
            expect(toHex(sAB)).toBe(toHex(sBA));
            // Non-zero shared secret (random scalars on base point have full order).
            expect(toHex(sAB)).not.toBe('0000000000000000000000000000000000000000000000000000000000000000');
        }
    });

    test('rejects non-32-byte u', () => {
        expect(_x.scalarMult(new Uint8Array(32), new Uint8Array(31))).toBe(false);
    });

    // ── Iteration G5 - Low-order point detection helper ────────────────────
    describe('isLowOrderPoint helper (iteration G5)', () => {
        const KNOWN_LOPS = [
            '0000000000000000000000000000000000000000000000000000000000000000',
            '0100000000000000000000000000000000000000000000000000000000000000',
            'e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800',
            '5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157',
            'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
            'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
            'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
        ];

        test.each(KNOWN_LOPS)('detects %s as low-order', (h) => {
            expect(_x.isLowOrderPoint(fromHex(h))).toBe(true);
        });

        test('detects high-bit set variant (RFC 7748 §5 mask) as low-order', () => {
            const u = fromHex('edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
            expect(_x.isLowOrderPoint(u)).toBe(true);
        });

        test('rejects RFC 7748 §6.1 valid public key', () => {
            const u = fromHex('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c');
            expect(_x.isLowOrderPoint(u)).toBe(false);
        });

        test('rejects base point u=9', () => {
            const u = new Uint8Array(32); u[0] = 9;
            expect(_x.isLowOrderPoint(u)).toBe(false);
        });

        test('cross-check: scalarMult(scalar, lop) is always zero', () => {
            const scalar = fromHex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
            for (const h of KNOWN_LOPS) {
                const out = _x.scalarMult(scalar, fromHex(h));
                expect(toHex(out)).toBe('0000000000000000000000000000000000000000000000000000000000000000');
            }
        });

        test('rejects malformed length input', () => {
            expect(_x.isLowOrderPoint(new Uint8Array(31))).toBe(false);
            expect(_x.isLowOrderPoint('not a Uint8Array')).toBe(false);
        });
    });
});
