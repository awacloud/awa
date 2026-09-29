// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { argon2 } from './argon2.js';
import { blake2b } from './blake2b.js';
import { hex } from '../../io/codec/hex.js';

const _hex = hex.factory();
const _blake2b = blake2b.factory();
const A = argon2.factory(_blake2b);

describe('argon2 module (RFC 9106 - Argon2id)', () => {

    test('module metadata', () => {
        expect(argon2.name).toBe('argon2');
        expect(argon2.dependencies).toEqual(['blake2b']);
    });

    // ========================================================================
    // RFC 9106 §5.3 - Argon2id reference test vector
    // (Argon2d §5.1 and Argon2i §5.2 not implemented - see argon2.acvp.md)
    // ========================================================================

    test('§5.3 Argon2id reference (t=3, m=32, p=4, password=0x01×32, salt=0x02×16, secret=0x03×8, ad=0x04×12)', () => {
        const tag = A.hash({
            password: new Uint8Array(32).fill(0x01),
            salt:     new Uint8Array(16).fill(0x02),
            secret:   new Uint8Array(8).fill(0x03),
            ad:       new Uint8Array(12).fill(0x04),
            time: 3, memory: 32, parallelism: 4, tagLen: 32
        });
        expect(_hex.fromBytes(tag)).toBe(
            '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659'
        );
    }, 10_000);

    // ========================================================================
    // Determinism + smoke (small params for speed)
    // ========================================================================

    const SMALL = {
        password: new TextEncoder().encode('correct horse battery staple'),
        salt:     new TextEncoder().encode('saltsaltsaltsalt'),  // 16 bytes
        time: 1, memory: 8, parallelism: 1, tagLen: 32
    };

    test('determinism: same inputs → same tag', () => {
        const a = A.hash({ ...SMALL });
        const b = A.hash({ ...SMALL });
        expect(_hex.fromBytes(a)).toBe(_hex.fromBytes(b));
    });

    test('salt binding: salt change → different tag', () => {
        const a = A.hash({ ...SMALL });
        const b = A.hash({ ...SMALL, salt: new TextEncoder().encode('SALTsaltsaltsalt') });
        expect(_hex.fromBytes(a)).not.toBe(_hex.fromBytes(b));
    });

    test('password binding: password change → different tag', () => {
        const a = A.hash({ ...SMALL });
        const b = A.hash({ ...SMALL, password: new TextEncoder().encode('Correct horse battery staple') });
        expect(_hex.fromBytes(a)).not.toBe(_hex.fromBytes(b));
    });

    test('secret binding: K (keyed mode) change → different tag', () => {
        const a = A.hash({ ...SMALL, secret: new Uint8Array(16).fill(0xab) });
        const b = A.hash({ ...SMALL, secret: new Uint8Array(16).fill(0xcd) });
        expect(_hex.fromBytes(a)).not.toBe(_hex.fromBytes(b));
        // No-secret vs empty-secret are equivalent (RFC 9106 §3.1: K is optional)
        const noSecret    = A.hash({ ...SMALL });
        const emptySecret = A.hash({ ...SMALL, secret: new Uint8Array(0) });
        expect(_hex.fromBytes(noSecret)).toBe(_hex.fromBytes(emptySecret));
    });

    test('associated data binding: X (ad) change → different tag', () => {
        const a = A.hash({ ...SMALL, ad: new TextEncoder().encode('context-A') });
        const b = A.hash({ ...SMALL, ad: new TextEncoder().encode('context-B') });
        expect(_hex.fromBytes(a)).not.toBe(_hex.fromBytes(b));
    });

    // ========================================================================
    // Cost parameter binding (t, m, p)
    // ========================================================================

    test('time binding: t=1 ≠ t=2 ≠ t=3', () => {
        const a = A.hash({ ...SMALL, time: 1 });
        const b = A.hash({ ...SMALL, time: 2 });
        const c = A.hash({ ...SMALL, time: 3 });
        expect(_hex.fromBytes(a)).not.toBe(_hex.fromBytes(b));
        expect(_hex.fromBytes(b)).not.toBe(_hex.fromBytes(c));
        expect(_hex.fromBytes(a)).not.toBe(_hex.fromBytes(c));
    });

    test('memory binding: m=8 ≠ m=16 ≠ m=32', () => {
        const a = A.hash({ ...SMALL, memory: 8 });
        const b = A.hash({ ...SMALL, memory: 16 });
        const c = A.hash({ ...SMALL, memory: 32 });
        expect(_hex.fromBytes(a)).not.toBe(_hex.fromBytes(b));
        expect(_hex.fromBytes(b)).not.toBe(_hex.fromBytes(c));
    });

    test('parallelism binding: p=1 ≠ p=2 (each lane affects final XOR fold)', () => {
        const a = A.hash({ ...SMALL, parallelism: 1, memory: 16 });
        const b = A.hash({ ...SMALL, parallelism: 2, memory: 16 });
        expect(_hex.fromBytes(a)).not.toBe(_hex.fromBytes(b));
    });

    // ========================================================================
    // Output length (τ) variations
    // ========================================================================

    test('tagLen variations: 32/64/128 octets, all deterministic and length-correct', () => {
        for (const tagLen of [32, 64, 128]) {
            const t = A.hash({ ...SMALL, tagLen });
            expect(t.length).toBe(tagLen);
            const t2 = A.hash({ ...SMALL, tagLen });
            expect(_hex.fromBytes(t)).toBe(_hex.fromBytes(t2));
        }
    });

    test('tagLen 32 ≠ truncate(tagLen 64)', () => {
        // tagLen is bound into H0 (RFC 9106 §3.2) so τ is parametric, not truncatable.
        const t32 = A.hash({ ...SMALL, tagLen: 32 });
        const t64 = A.hash({ ...SMALL, tagLen: 64 });
        const t64Hex = _hex.fromBytes(t64);
        expect(_hex.fromBytes(t32)).not.toBe(t64Hex.slice(0, 64));
    });

    // ========================================================================
    // _Hp (variable-length BLAKE2b extension, RFC 9106 §3.3)
    // ========================================================================

    test('_Hp produces requested length (≤64 single-call path)', () => {
        const out32 = A._internal.Hp(new Uint8Array([1, 2, 3]), 32);
        expect(out32.length).toBe(32);
        const out64 = A._internal.Hp(new Uint8Array([1, 2, 3]), 64);
        expect(out64.length).toBe(64);
    });

    test('_Hp produces requested length (>64 multi-block path: outLen=100, 200, 1024)', () => {
        for (const outLen of [100, 200, 1024]) {
            const out = A._internal.Hp(new Uint8Array([1, 2, 3]), outLen);
            expect(out.length).toBe(outLen);
            // Determinism
            const out2 = A._internal.Hp(new Uint8Array([1, 2, 3]), outLen);
            expect(_hex.fromBytes(out)).toBe(_hex.fromBytes(out2));
        }
    });

    // ========================================================================
    // Validation - bad parameter shapes
    // ========================================================================

    test('rejects salt < 8 bytes', () => {
        expect(A.hash({
            password: new Uint8Array(8), salt: new Uint8Array(7),
            time: 1, memory: 8, parallelism: 1, tagLen: 32
        })).toBe(false);
    });

    test('rejects t < 1', () => {
        expect(A.hash({ ...SMALL, time: 0 })).toBe(false);
    });

    test('rejects p < 1', () => {
        expect(A.hash({ ...SMALL, parallelism: 0 })).toBe(false);
    });

    test('rejects tagLen < 4', () => {
        expect(A.hash({ ...SMALL, tagLen: 3 })).toBe(false);
    });

    test('rejects missing password', () => {
        expect(A.hash({ ...SMALL, password: undefined })).toBe(false);
    });

    test('rejects missing salt', () => {
        expect(A.hash({ ...SMALL, salt: undefined })).toBe(false);
    });

    // ========================================================================
    // Memory clamp: m < 8*p must be clamped to 8*p (RFC 9106 §3.2)
    // ========================================================================

    test('memory clamped to 8*p when below floor', () => {
        // m=4, p=2 → effective memory = 16. Verify no crash + deterministic.
        const a = A.hash({ ...SMALL, memory: 4, parallelism: 2 });
        const b = A.hash({ ...SMALL, memory: 16, parallelism: 2 });
        expect(a.length).toBe(32);
        expect(_hex.fromBytes(a)).toBe(_hex.fromBytes(b));
    });

    // ── Iteration G4 - Argon2d / Argon2i explicit reject ────────────────────
    describe('Argon2d / Argon2i explicit reject (iteration G4)', () => {
        test('hashD returns false + warns UNSAFE (cache-timing)', () => {
            const calls = [];
            const orig = console.warn; console.warn = (m) => calls.push(m);
            try { expect(A.hashD()).toBe(false); }
            finally { console.warn = orig; }
            expect(calls[0]).toContain('UNSAFE');
            expect(calls[0]).toContain('Argon2d');
            expect(calls[0]).toContain('cache-timing');
            expect(calls[0]).toContain('Argon2id');
        });

        test('hashI returns false + warns DEPRECATED (Alwen-Blocki)', () => {
            const calls = [];
            const orig = console.warn; console.warn = (m) => calls.push(m);
            try { expect(A.hashI()).toBe(false); }
            finally { console.warn = orig; }
            expect(calls[0]).toContain('DEPRECATED');
            expect(calls[0]).toContain('Argon2i');
            expect(calls[0]).toContain('Argon2id');
        });
    });
});
