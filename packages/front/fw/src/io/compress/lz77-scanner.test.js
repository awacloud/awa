// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// lz77.createScanner (T22, BL-1112): successive fills give the token stream of
// one encodeTokens call whatever `max` each fill gets, including a cut that
// falls between a lazy step's literal and its match.

import { describe, test, expect } from 'bun:test';
import { lz77 } from './lz77.js';

const l = lz77.factory();

/** Deterministic text with repeats at many distances (lazy steps happen). */
function corpus(n, seed) {
    const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
        'lambda', 'mu', 'alphabet', 'betamax', 'gammaray', 'deltawing'];
    let x = seed >>> 0 || 1;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
    let s = '';
    while (s.length < n) {
        const r = rnd();
        s += (r & 7) === 0 ? String.fromCharCode(33 + (r >>> 8) % 90) : words[(r >>> 4) % words.length];
        s += (r & 16) ? ' ' : '';
    }
    return new TextEncoder().encode(s.slice(0, n));
}

/** All tokens of a scanner, filled `max` at a time. */
function drain(sc, max) {
    const buf = new Int32Array(2 * max);
    const all = [];
    let guard = 0;
    while (!sc.done) {
        const n = sc.fill(buf, max);
        expect(n).toBeLessThanOrEqual(max);
        for (let k = 0; k < 2 * n; k++) all.push(buf[k]);
        if (n < max) expect(sc.done).toBe(true);
        if (++guard > 1e6) throw new Error('scanner does not end');
    }
    return all;
}

const OPTION_SETS = [
    { minMatch: 4 },
    { minMatch: 3, windowBits: 15, maxMatch: 258, chainDepth: 16, niceLength: 32, chainSkip: true, hashBits: 12 },
    { minMatch: 3, windowBits: 15, maxMatch: 258, lazy: true, chainDepth: 32, niceLength: 32, goodLength: 8, maxLazy: 16, chainSkip: true },
    { minMatch: 3, windowBits: 15, maxMatch: 258, lazy: true, chainDepth: 4096, niceLength: 258, goodLength: 32, maxLazy: 258, chainSkip: true },
    { minMatch: 4, lazy: true, chainDepth: 8 },
];

describe('lz77.createScanner', () => {
    const data = corpus(40000, 0x2545F491);

    test('the lazy option sets do take lazy steps on this corpus (the held-match path is reached)', () => {
        const base = { minMatch: 3, windowBits: 15, chainDepth: 32, niceLength: 32, goodLength: 8, maxLazy: 16 };
        const a = l.encodeTokens(data, { ...base, lazy: false });
        const b = l.encodeTokens(data, { ...base, lazy: true });
        expect(Array.from(b.tokens.subarray(0, 2 * b.count))).not.toEqual(Array.from(a.tokens.subarray(0, 2 * a.count)));
    });

    for (const [i, opts] of OPTION_SETS.entries()) {
        test(`fills of 1..7, 1000 and 16384 tokens equal one encodeTokens (option set ${i})`, () => {
            const { tokens, count } = l.encodeTokens(data, opts);
            const expected = Array.from(tokens.subarray(0, 2 * count));
            for (const max of [1, 2, 3, 4, 5, 6, 7, 1000, 16384]) {
                expect(drain(l.createScanner(data, opts), max)).toEqual(expected);
            }
        });
    }

    test('a primed prefix (start) is matchable and never emitted, across cuts', () => {
        const opts = { minMatch: 3, windowBits: 15, lazy: true, chainDepth: 64, start: 12000 };
        const { tokens, count } = l.encodeTokens(data, opts);
        expect(drain(l.createScanner(data, opts), 3)).toEqual(Array.from(tokens.subarray(0, 2 * count)));
    });

    test('done: false until the last token, then fill writes nothing', () => {
        const d = corpus(500, 7);
        const sc = l.createScanner(d, { minMatch: 4 });
        expect(sc.done).toBe(false);
        const buf = new Int32Array(2 * 1000);
        const n = sc.fill(buf, 1000);
        expect(n).toBeGreaterThan(0);
        expect(sc.done).toBe(true);
        expect(sc.fill(buf, 1000)).toBe(0);
    });

    test('an input shorter than minMatch is all literals; an empty input or start >= length is done at once', () => {
        const buf = new Int32Array(16);
        const sc = l.createScanner(new Uint8Array([9, 8]), { minMatch: 4 });
        expect(sc.fill(buf, 8)).toBe(2);
        expect(Array.from(buf.subarray(0, 4))).toEqual([0, 9, 0, 8]);
        expect(sc.done).toBe(true);
        expect(l.createScanner(new Uint8Array(0)).done).toBe(true);
        expect(l.createScanner(new Uint8Array([1, 2, 3]), { start: 3 }).done).toBe(true);
        expect(l.createScanner(new Uint8Array([1, 2, 3]), { start: 9 }).fill(buf, 8)).toBe(0);
    });

    test('rejects a non-Uint8Array', () => {
        expect(() => l.createScanner('nope')).toThrow('lz77.createScanner: data must be Uint8Array');
    });
});
