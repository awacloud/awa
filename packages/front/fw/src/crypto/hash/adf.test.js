// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { adf } from './adf.js';
import { sha256 } from './sha256.js';
import { aes } from '../cipher/aes.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hex } from '../../io/codec/hex.js';

const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _aes = aes.factory();
const _adf = adf.factory(_sha256, _aes);
const _hex = hex.factory();

// Helper: bitArray (array of 32-bit signed ints) → hex string via Uint8Array
const baToHex = (ba) => {
    const bytes = new Uint8Array(ba.length * 4);
    for (let i = 0; i < ba.length; i++) {
        const w = ba[i] | 0;
        bytes[i * 4]     = (w >>> 24) & 0xff;
        bytes[i * 4 + 1] = (w >>> 16) & 0xff;
        bytes[i * 4 + 2] = (w >>> 8)  & 0xff;
        bytes[i * 4 + 3] = w & 0xff;
    }
    return _hex.fromBytes(bytes);
};

describe('adf module (AES-Derivation Function - KeePass v1 / KDBX 3.x)', () => {

    test('module metadata', () => {
        expect(adf.name).toBe('adf');
        expect(adf.dependencies).toEqual(['sha256', 'aes']);
    });

    const master    = _sha256.hash('master-seed');     // 256-bit bitArray
    const transform = _sha256.hash('transform-seed');  // 256-bit AES key
    const composite = _sha256.hash('credentials');     // hashed credentials

    // ========================================================================
    // Determinism
    // ========================================================================

    test('fn is deterministic for the same inputs', () => {
        const a = _adf.fn(master, transform, 8, composite);
        const b = _adf.fn(master, transform, 8, composite);
        expect(_ba.equal(a, b)).toBe(true);
    });

    test('partial is deterministic', () => {
        const a = _adf.partial(master, transform, 8, composite);
        const b = _adf.partial(master, transform, 8, composite);
        expect(_ba.equal(a, b)).toBe(true);
    });

    // ========================================================================
    // Input bindings - every input must affect the output
    // ========================================================================

    test('master binding: different master → different output', () => {
        const a = _adf.fn(master, transform, 4, composite);
        const m2 = _sha256.hash('master-seed-2');
        const b = _adf.fn(m2, transform, 4, composite);
        expect(_ba.equal(a, b)).toBe(false);
    });

    test('transform binding: different transform → different output', () => {
        const a = _adf.fn(master, transform, 4, composite);
        const t2 = _sha256.hash('transform-seed-2');
        const b = _adf.fn(master, t2, 4, composite);
        expect(_ba.equal(a, b)).toBe(false);
    });

    test('composite binding: different composite → different output', () => {
        const a = _adf.fn(master, transform, 4, composite);
        const c2 = _sha256.hash('other-credentials');
        const b = _adf.fn(master, transform, 4, c2);
        expect(_ba.equal(a, b)).toBe(false);
    });

    test('rounds binding: different rounds → different output', () => {
        const a = _adf.fn(master, transform, 4, composite);
        const b = _adf.fn(master, transform, 5, composite);
        expect(_ba.equal(a, b)).toBe(false);
    });

    // ========================================================================
    // Round-count semantics
    // ========================================================================

    test('rounds=0 path: composite is hashed once, no AES iteration applied', () => {
        // With rounds=0, the AES loop is skipped; transformed[0..1] = SHA256(composite)[0..32].
        // Output = SHA256(master ‖ SHA256(SHA256(composite)[0..32])).
        const out = _adf.fn(master, transform, 0, composite);
        // Recompute manually
        const ck = _sha256.hash(composite);
        const expected = _sha256.hash(master.concat(_sha256.hash(ck)));
        expect(_ba.equal(out, expected)).toBe(true);
    });

    test('rounds=1 vs rounds=2 differ (AES applied incrementally)', () => {
        const a = _adf.fn(master, transform, 1, composite);
        const b = _adf.fn(master, transform, 2, composite);
        expect(_ba.equal(a, b)).toBe(false);
    });

    test('partial vs fn: fn(args) === SHA256(partial(args))', () => {
        const p = _adf.partial(master, transform, 7, composite);
        const f = _adf.fn(master, transform, 7, composite);
        expect(_ba.equal(_sha256.hash(p), f)).toBe(true);
    });

    // ========================================================================
    // Output shape
    // ========================================================================

    test('fn output is 256 bits (8 × 32-bit words)', () => {
        const out = _adf.fn(master, transform, 4, composite);
        expect(out.length).toBe(8);
    });

    test('partial output = master ‖ SHA256(transformed) - 16 words for 256-bit master', () => {
        const p = _adf.partial(master, transform, 4, composite);
        // master is 8 words (256 bits) ; SHA256 output is 8 words (256 bits) ; total 16.
        expect(p.length).toBe(16);
        // First half is exactly the master (verbatim prefix).
        expect(_ba.equal(p.slice(0, 8), master)).toBe(true);
    });

    test('partial output adapts to master length (128-bit master → 12-word output)', () => {
        const m128 = master.slice(0, 4);  // 128-bit master
        const p = _adf.partial(m128, transform, 2, composite);
        expect(p.length).toBe(12);  // 4 (master) + 8 (sha256)
        expect(_ba.equal(p.slice(0, 4), m128)).toBe(true);
    });

    // ========================================================================
    // AES key independence: transform is the AES key - independent of master/composite
    // (changing transform alone must affect the inner AES result, even if composite
    //  and master are held constant.)
    // ========================================================================

    test('transform-only change propagates through AES core (partial output differs)', () => {
        const p1 = _adf.partial(master, transform, 4, composite);
        const t2 = _sha256.hash('transform-seed-2');
        const p2 = _adf.partial(master, t2, 4, composite);
        // Master prefix unchanged
        expect(_ba.equal(p1.slice(0, 8), p2.slice(0, 8))).toBe(true);
        // Tail (SHA256 of transformed) differs
        expect(_ba.equal(p1.slice(8), p2.slice(8))).toBe(false);
    });

    test('master-only change does NOT affect the AES-transformed inner state', () => {
        const m2 = _sha256.hash('master-seed-2');
        const p1 = _adf.partial(master, transform, 4, composite);
        const p2 = _adf.partial(m2,     transform, 4, composite);
        // Tail (SHA256 of transformed) is identical (same transform + composite).
        expect(_ba.equal(p1.slice(8), p2.slice(8))).toBe(true);
        // Master prefix differs.
        expect(_ba.equal(p1.slice(0, 8), p2.slice(0, 8))).toBe(false);
    });

    // ========================================================================
    // Regression KAT - freeze a deterministic output to catch silent algo drift.
    // (Computed once from this implementation; treat as canary, not external KAT.)
    // ========================================================================

    test('regression KAT: fn(SHA256("m"), SHA256("t"), 100, SHA256("c"))', () => {
        const m = _sha256.hash('m');
        const t = _sha256.hash('t');
        const c = _sha256.hash('c');
        const out = _adf.fn(m, t, 100, c);
        // Snapshot computed from current implementation. If this changes, the
        // ADF output has drifted - investigate vs. KeePass-v1 KDBX 3.x semantics.
        expect(baToHex(out)).toBe(
            'e51ad967dbffc81448f45bd442f2bdc6b856dcf205d1fb4b6f5a815c035be660'
        );
    });

    test('regression KAT: partial(SHA256("m"), SHA256("t"), 50, SHA256("c"))', () => {
        const m = _sha256.hash('m');
        const t = _sha256.hash('t');
        const c = _sha256.hash('c');
        const out = _adf.partial(m, t, 50, c);
        // 16 words = 64 bytes hex.
        expect(baToHex(out)).toBe(
            '62c66a7a5dd70c3146618063c344e531e6d4b59e379808443ce962b3abd63c5a0553451596601835f10744dc11a68ed9186363652b366d9fa708613db62c9d37'
        );
    });

    test('regression KAT: rounds=10000 smoke (perf canary for typical KeePass usage)', () => {
        const m = _sha256.hash('m');
        const t = _sha256.hash('t');
        const c = _sha256.hash('c');
        const out = _adf.fn(m, t, 10_000, c);
        expect(out.length).toBe(8);
        // Snapshot ; recomputed if the algorithm changes.
        expect(baToHex(out)).toBe(
            '8f10656500c6908291c43a0894045e3258cf1bf9e844790e3d3564fe9336abaa'
        );
    }, 10_000);
});
