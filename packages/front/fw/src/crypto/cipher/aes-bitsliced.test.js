// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The bitsliced constant-time core behind `aes.fn`: its S-box and inverse
// S-box equal the FIPS-197 tables on every input in every lane, its key
// expansion equals the table-driven one, and the cipher equals the T-table
// path on random keys and blocks of every size. The FIPS-197 and ACVP vectors
// live in aes.test.js.

import { describe, test, expect } from 'bun:test';
import { aes } from './aes.js';
import { INTERNAL } from '../../core/internal.js';

const A = aes.factory();
const I = A[INTERNAL];

/** Deterministic words. */
function rng(seed) {
    let x = seed >>> 0 || 1;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x | 0; };
}

describe('aes bitsliced core', () => {
    test('the test hatch exists', () => {
        expect(typeof I.bsSub).toBe('function');
        expect(typeof I.bsInvSub).toBe('function');
        expect(typeof I.expandKey).toBe('function');
    });

    test('S-box: all 256 inputs, each in all 16 lanes, equal the table', () => {
        const bad = [];
        for (let rot = 0; rot < 16; rot++) {
            for (let base = 0; base < 256; base += 16) {
                const bytes = new Uint8Array(16);
                for (let l = 0; l < 16; l++) bytes[(l + rot) & 15] = base + l;
                const out = I.bsSub(bytes);
                const inv = I.bsInvSub(out);
                for (let l = 0; l < 16; l++) {
                    const lane = (l + rot) & 15, v = base + l;
                    if (out[lane] !== I.sbox[v]) bad.push(['sub', v, lane]);
                    if (inv[lane] !== v) bad.push(['inv', v, lane]);
                }
            }
        }
        expect(bad).toEqual([]);
    });

    test('the constant-time key expansion equals the table-driven one (128 / 192 / 256)', () => {
        const next = rng(7);
        for (const n of [4, 6, 8]) {
            for (let k = 0; k < 64; k++) {
                const key = Array.from({ length: n }, next);
                expect(I.expandKey(key)).toEqual(I.expandKeyTable(key));
            }
        }
    });

    test('encrypt and decrypt equal the T-table path on random keys and blocks', () => {
        const next = rng(99);
        for (const n of [4, 6, 8]) {
            for (let k = 0; k < 32; k++) {
                const key = Array.from({ length: n }, next);
                const ct = A.fn(key), tt = A.ttable.fn(key);
                for (let b = 0; b < 8; b++) {
                    const block = [next(), next(), next(), next()];
                    const e = ct.encrypt(block);
                    expect(e).toEqual(tt.encrypt(block));
                    expect(ct.decrypt(e)).toEqual(block);
                }
            }
        }
    });

    test('the default path reads no S-box table during encryption', () => {
        // a structural guard: the bitsliced block function never indexes `sbox`
        const src = I.bsEncrypt.toString() + I.bsSub.toString() + I.expandKey.toString();
        expect(src).not.toMatch(/sbox\s*\[/);
    });
});
