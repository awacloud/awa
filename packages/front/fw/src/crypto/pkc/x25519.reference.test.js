// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Differential test: the loop-form reference (`x25519.reference.js`) and the
// fast module (`x25519.js`) give the same bytes on every input drawn here.
// Every random input is drawn ONCE, before the two compared calls, from one
// xorshift32 stream with a literal seed.

import { describe, test, expect, spyOn } from 'bun:test';
import { x25519 } from './x25519.js';
import { createX25519Reference } from './x25519.reference.js';
import { INTERNAL } from '../../core/internal.js';

const fast = x25519.factory();
const ref = createX25519Reference();

let x = 0x35A00016;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
const bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = rnd() & 255; return b; };
const hex = (u) => Buffer.from(u).toString('hex');
const enc = (v) => (v instanceof Uint8Array ? hex(v) : String(v));
const fromHex = (h) => Uint8Array.from(Buffer.from(h, 'hex'));

const SLOW = 300_000;

/** RFC 7748 §5.2 iteration: k, u = X25519(k, u), k, starting from k = u = 9. */
function iterate(api, n) {
    let k = new Uint8Array(32), u = new Uint8Array(32);
    k[0] = 9; u[0] = 9;
    for (let i = 0; i < n; i++) {
        const r = api.scalarMult(k, u);
        u = k;
        k = r;
    }
    return hex(k);
}

describe('x25519 reference: RFC 7748 §5.2', () => {
    test('vector 1 through the reference', () => {
        const out = ref.scalarMult(
            fromHex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4'),
            fromHex('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c'));
        expect(hex(out)).toBe('c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552');
    });

    test('iterated vector, 1 iteration, on both sides', () => {
        const want = '422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079';
        expect(iterate(ref, 1)).toBe(want);
        expect(iterate(fast, 1)).toBe(want);
    });

    test('iterated vector, 1 000 iterations, on both sides', () => {
        const want = '684cf59ba83309552800ef566f2f4d3c1c3887c49360e3875f2eb94d99532c51';
        expect(iterate(ref, 1000)).toBe(want);
        expect(iterate(fast, 1000)).toBe(want);
    }, SLOW);
});

describe('x25519 reference vs fast', () => {
    test('scalarMult: equal on 300 random (scalar, u)', () => {
        const cases = Array.from({ length: 300 }, () => ({ k: bytes(32), u: bytes(32) }));
        const diffs = [];
        for (let i = 0; i < cases.length; i++) {
            const { k, u } = cases[i];
            if (enc(ref.scalarMult(k, u)) !== enc(fast.scalarMult(k, u))) diffs.push(i);
        }
        expect(diffs).toEqual([]);
    }, SLOW);

    test('scalarMultBase: equal on 100 random scalars', () => {
        const scalars = Array.from({ length: 100 }, () => bytes(32));
        const diffs = [];
        for (let i = 0; i < scalars.length; i++) {
            if (enc(ref.scalarMultBase(scalars[i])) !== enc(fast.scalarMultBase(scalars[i]))) diffs.push(i);
        }
        expect(diffs).toEqual([]);
    }, SLOW);

    test('the 7 low-order u of the fast module\'s internal slot and 20 non-canonical u: equal', () => {
        const lowOrder = fast[INTERNAL].lowOrderPoints;
        expect(lowOrder.length).toBe(7);
        const nonCanonical = [];
        for (let i = 0; i < 10; i++) { const u = bytes(32); u[31] |= 0x80; nonCanonical.push(u); }   // top bit set
        for (let k = 0; k < 19; k += 2) {                                                           // p + k, p = 2^255 - 19
            const u = new Uint8Array(32).fill(0xff); u[31] = 0x7f; u[0] = 0xed + k;
            nonCanonical.push(u);
        }
        expect(nonCanonical.length).toBe(20);
        const us = [...lowOrder, ...nonCanonical];
        const scalars = us.map(() => bytes(32));
        const diffs = [];
        for (let i = 0; i < us.length; i++) {
            if (enc(ref.scalarMult(scalars[i], us[i])) !== enc(fast.scalarMult(scalars[i], us[i]))) diffs.push(i);
        }
        expect(diffs).toEqual([]);
    }, SLOW);
});

describe('x25519 reference: error parity', () => {
    test('31-byte scalar, 33-byte u: false on both, same warnings', () => {
        const k31 = bytes(31), k32 = bytes(32), u32 = bytes(32), u33 = bytes(33);
        const calls = [
            (api) => api.scalarMult(k31, u32),
            (api) => api.scalarMult(k32, u33),
            (api) => api.scalarMultBase(k31),
        ];
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            for (const call of calls) {
                warn.mockClear();
                const a = call(ref);
                const refWarns = warn.mock.calls.map((c) => c.join(' '));
                warn.mockClear();
                const b = call(fast);
                const fastWarns = warn.mock.calls.map((c) => c.join(' '));
                expect(a).toBe(false);
                expect(b).toBe(false);
                expect(refWarns.length).toBe(1);
                expect(refWarns).toEqual(fastWarns);
            }
        } finally {
            warn.mockRestore();
        }
    });
});
