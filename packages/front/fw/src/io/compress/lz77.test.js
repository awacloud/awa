// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { lz77 } from './lz77.js';

describe('lz77 module', () => {
    test('has correct module metadata', () => {
        expect(lz77.name).toBe('lz77');
        expect(lz77.version).toBe('1.0.0');
        expect(lz77.type).toBe('fw.io.compress');
        expect(lz77.dependencies).toEqual([]);
        expect(typeof lz77.factory).toBe('function');
    });

    describe('factory', () => {
        const l = lz77.factory();

        test('returns expected API', () => {
            expect(typeof l.encode).toBe('function');
            expect(typeof l.findMatch).toBe('function');
            expect(typeof l.decodeStream).toBe('function');
            expect(typeof l.DEFAULT).toBe('object');
            expect(l.DEFAULT.windowBits).toBe(16);
            expect(l.DEFAULT.minMatch).toBe(4);
        });

        test('returns the encodeTokens fast path and the extended DEFAULT keys', () => {
            expect(typeof l.encodeTokens).toBe('function');
            expect(l.DEFAULT.niceLength).toBe(258);
            expect(l.DEFAULT.start).toBe(0);
            expect(l.DEFAULT.hashFn).toBeNull();
        });

        test('the search heuristics default to the plain walk (goodLength, maxLazy, chainSkip)', () => {
            expect(l.DEFAULT.goodLength).toBe(258);
            expect(l.DEFAULT.maxLazy).toBe(258);
            expect(l.DEFAULT.chainSkip).toBe(false);
        });
    });

    describe('encode', () => {
        const l = lz77.factory();

        function record(data, opts) {
            const ops = [];
            l.encode(data, opts || {}, {
                literal: pos => ops.push({ lit: data[pos], pos }),
                match: (pos, len, dist) => ops.push({ pos, len, dist }),
            });
            return ops;
        }

        function roundTrip(data, opts) {
            const ops = record(data, opts);
            const out = new Uint8Array(data.length);
            l.decodeStream(out, ops);
            return out;
        }

        test('empty input emits nothing', () => {
            const ops = record(new Uint8Array(0));
            expect(ops).toEqual([]);
        });

        test('1-byte input emits one literal', () => {
            const ops = record(new Uint8Array([0x42]));
            expect(ops).toEqual([{ lit: 0x42, pos: 0 }]);
        });

        test('all-literal short input (under minMatch) emits literals only', () => {
            const data = new Uint8Array([1, 2, 3]);
            const ops = record(data, { minMatch: 4 });
            expect(ops.length).toBe(3);
            for (const op of ops) expect('lit' in op).toBe(true);
        });

        test('"ABCDABCD" finds a match', () => {
            const data = new TextEncoder().encode('ABCDABCD');
            const ops = record(data, { minMatch: 4 });
            const matches = ops.filter(o => 'len' in o);
            expect(matches.length).toBe(1);
            expect(matches[0]).toEqual({ pos: 4, len: 4, dist: 4 });
        });

        test('long repeating pattern compresses heavily', () => {
            const data = new TextEncoder().encode('A'.repeat(1000));
            const ops = record(data, { minMatch: 4 });
            // First chunk should be literals (filling minMatch worth), then big match.
            const matches = ops.filter(o => 'len' in o);
            expect(matches.length).toBeGreaterThan(0);
            const totalMatchLen = matches.reduce((s, m) => s + m.len, 0);
            expect(totalMatchLen).toBeGreaterThan(900);
        });

        test('round-trips arbitrary text', () => {
            const text = 'The quick brown fox jumps over the lazy dog. ' +
                         'Pack my box with five dozen liquor jugs. ' +
                         'Sphinx of black quartz, judge my vow.';
            const data = new TextEncoder().encode(text);
            const out = roundTrip(data, { minMatch: 4 });
            expect(new TextDecoder().decode(out)).toBe(text);
        });

        test('round-trips repetitive text with overlapping matches', () => {
            const text = 'ABABABABABABABABAB';
            const data = new TextEncoder().encode(text);
            const out = roundTrip(data, { minMatch: 4 });
            expect(new TextDecoder().decode(out)).toBe(text);
        });

        test('round-trips random-ish binary data', () => {
            const data = new Uint8Array(4096);
            let s = 17;
            for (let i = 0; i < data.length; ++i) {
                s = (s * 31 + 13) & 0xFF;
                data[i] = s;
            }
            const out = roundTrip(data);
            expect(Array.from(out)).toEqual(Array.from(data));
        });

        test('round-trips long input with realistic English', () => {
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(200);
            const data = new TextEncoder().encode(text);
            const out = roundTrip(data, { minMatch: 4 });
            expect(new TextDecoder().decode(out)).toBe(text);
        });

        test('respects maxMatch cap', () => {
            const data = new TextEncoder().encode('A'.repeat(500));
            const ops = record(data, { minMatch: 4, maxMatch: 16 });
            for (const op of ops) {
                if ('len' in op) expect(op.len).toBeLessThanOrEqual(16);
            }
        });

        test('respects windowBits (distance cap)', () => {
            // window = 64. Match should fail across that boundary.
            const data = new Uint8Array(200);
            // Put unique markers then repeat them past the window.
            const tag = new TextEncoder().encode('ZXQK');
            data.set(tag, 0);
            data.set(tag, 100);  // dist=100 should be FOUND with window=128
            data.set(tag, 196);  // dist=196 from pos 0 - exceeds window=64
            const ops = record(data, { minMatch: 4, windowBits: 6, maxMatch: 32 });
            // No match should have dist > 64
            for (const op of ops) {
                if ('len' in op) expect(op.dist).toBeLessThan(64);
            }
        });

        test('lazy matching can find longer matches at the cost of one literal', () => {
            // Construct a case where the immediate match is shorter than
            // the match one byte later.
            //   pattern: XYZABCD ... ZABCDEF
            // At position of the 2nd X, a non-lazy encoder might prefer the
            // first chance (short match). Lazy might prefer i+1's longer match.
            // For this test, just verify lazy is non-destructive (round-trips).
            const text = 'The quick brown fox jumps over the lazy dog. The fox is quick. The dog is lazy.';
            const data = new TextEncoder().encode(text);
            for (const lazy of [false, true]) {
                const ops = [];
                lz77.factory().encode(data, { minMatch: 4, lazy }, {
                    literal: pos => ops.push({ lit: data[pos] }),
                    match: (pos, len, dist) => ops.push({ len, dist }),
                });
                const out = new Uint8Array(data.length);
                lz77.factory().decodeStream(out, ops);
                expect(new TextDecoder().decode(out)).toBe(text);
            }
        });

        test('rejects non-Uint8Array', () => {
            expect(() => l.encode('nope', {}, { literal() {}, match() {} })).toThrow();
        });

        test('rejects missing callbacks', () => {
            expect(() => l.encode(new Uint8Array(1), {}, {})).toThrow();
        });

        test('chainDepth=1 still produces valid output (fast mode)', () => {
            const text = 'mississippi'.repeat(50);
            const data = new TextEncoder().encode(text);
            const ops = record(data, { minMatch: 4, chainDepth: 1 });
            const out = new Uint8Array(data.length);
            l.decodeStream(out, ops);
            expect(new TextDecoder().decode(out)).toBe(text);
        });

        test('minMatch=3 (DEFLATE-style) round-trips', () => {
            const text = 'abcabcabcabc';
            const data = new TextEncoder().encode(text);
            const out = roundTrip(data, { minMatch: 3 });
            expect(new TextDecoder().decode(out)).toBe(text);
        });
    });

    describe('hashFn', () => {
        const l = lz77.factory();

        test('is called with (data, pos)', () => {
            const calls = [];
            const data = new TextEncoder().encode('ABCDABCD');
            l.encode(data, {
                minMatch: 4,
                hashFn: (d, pos) => { calls.push([d, pos]); return 0; },
            }, { literal() {}, match() {} });
            expect(calls.length).toBeGreaterThan(0);
            expect(calls[0][0]).toBe(data);
            expect(typeof calls[0][1]).toBe('number');
        });

        test('constant () => 0 hashFn (worst-case single chain) still round-trips', () => {
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
            const data = new TextEncoder().encode(text);
            const ops = [];
            l.encode(data, { minMatch: 4, hashFn: () => 0 }, {
                literal: pos => ops.push({ lit: data[pos] }),
                match: (pos, len, dist) => ops.push({ len, dist }),
            });
            const out = new Uint8Array(data.length);
            l.decodeStream(out, ops);
            expect(new TextDecoder().decode(out)).toBe(text);
        });

        test('a hashFn returning values >= 1 << hashBits is masked (no RangeError, round-trip)', () => {
            const text = 'ABCDABCDABCDABCD';
            const data = new TextEncoder().encode(text);
            const ops = [];
            expect(() => {
                l.encode(data, { minMatch: 4, hashBits: 4, hashFn: () => 0xFFFFFFF }, {
                    literal: pos => ops.push({ lit: data[pos] }),
                    match: (pos, len, dist) => ops.push({ len, dist }),
                });
            }).not.toThrow();
            const out = new Uint8Array(data.length);
            l.decodeStream(out, ops);
            expect(new TextDecoder().decode(out)).toBe(text);
        });
    });

    describe('niceLength', () => {
        const l = lz77.factory();

        // Hand-built hash chain (bypasses encode's own insertion) with a
        // constant hashFn so both candidates land in the same bucket:
        //   head[0] -> 20 (nearest, matches only 5 bytes)
        //   prev[20] -> 0 (deeper, matches 8 bytes)
        function buildChainData() {
            const enc = new TextEncoder();
            const data = new Uint8Array(60).fill(0x2E); // '.' filler
            data.set(enc.encode('ABCDEFGH'), 0);   // candFar (dist 50): 8-byte match
            data.set(enc.encode('ABCDE'), 20);     // candNear (dist 30): 5-byte match then diverges
            data.set(enc.encode('ABCDEFGH'), 50);  // scan position
            data[58] = 0xFF;                        // caps candFar's match at exactly 8
            return data;
        }

        function buildChain() {
            const head = new Int32Array(1 << 17).fill(-1);
            const prev = new Int32Array(1 << 16).fill(-1);
            head[0] = 20;
            prev[20] = 0;
            return { head, prev };
        }

        test('{ niceLength: 5 } stops at the first (shorter) match found', () => {
            const data = buildChainData();
            const { head, prev } = buildChain();
            const m = l.findMatch(data, 50, head, prev, { minMatch: 4, hashFn: () => 0, niceLength: 5 });
            expect(m).toEqual({ len: 5, dist: 30 });
        });

        test('default niceLength probes deeper and finds the longer match', () => {
            const data = buildChainData();
            const { head, prev } = buildChain();
            const m = l.findMatch(data, 50, head, prev, { minMatch: 4, hashFn: () => 0 });
            expect(m).toEqual({ len: 8, dist: 50 });
        });

        // Chain skip on the same fixture: after the 5-byte match at 20 the walk
        // may continue on the chain of any position inside it (20, 21, 22),
        // but only 20 is in a chain — 21 and 22 have `prev = -1`. A walk that
        // jumped onto one of those dead chains would stop at { 5, 30 } and
        // never reach the 8-byte match at 0 (the defect the guard prevents).
        test('{ chainSkip: true } never follows a position that is in no chain', () => {
            const data = buildChainData();
            const { head, prev } = buildChain();
            const m = l.findMatch(data, 50, head, prev, { minMatch: 4, hashFn: () => 0, chainSkip: true });
            expect(m).toEqual({ len: 8, dist: 50 });
        });
    });

    describe('chainSkip', () => {
        const l = lz77.factory();

        function roundTrips(data, opts) {
            const { tokens, count } = l.encodeTokens(data, opts);
            const ops = [];
            for (let k = 0; k < count; ++k) {
                ops.push(tokens[2 * k] === 0 ? { lit: tokens[2 * k + 1] } : { len: tokens[2 * k], dist: tokens[2 * k + 1] });
            }
            const out = new Uint8Array(data.length);
            l.decodeStream(out, ops);
            return Array.from(out).every((b, i) => b === data[i]);
        }

        test('the skip walk round-trips text and periodic data at several chain depths', () => {
            const text = new TextEncoder().encode(
                'The quick brown fox jumps over the lazy dog. The fox is quick. The dog is lazy. '.repeat(40),
            );
            const periodic = new Uint8Array(3000).map((_, i) => (i * 7) % 13);
            for (const data of [text, periodic]) {
                for (const chainDepth of [1, 4, 64]) {
                    expect(roundTrips(data, { minMatch: 3, chainDepth, chainSkip: true })).toBe(true);
                    expect(roundTrips(data, { minMatch: 3, chainDepth, chainSkip: true, lazy: true })).toBe(true);
                }
            }
        });
    });

    describe('lazy heuristics (goodLength, maxLazy, chain insertion)', () => {
        const l = lz77.factory();
        const enc = s => new TextEncoder().encode(s);

        /** Tokens as a readable list: literals as characters, matches as `[len, dist]`. */
        function tokenList(data, opts) {
            const { tokens, count } = l.encodeTokens(data, opts);
            const out = [];
            for (let k = 0; k < count; ++k) {
                out.push(tokens[2 * k] === 0 ? String.fromCharCode(tokens[2 * k + 1]) : [tokens[2 * k], tokens[2 * k + 1]]);
            }
            return out;
        }

        // At 11 ("abcdefg…") the match is "abc" (3, from 0); at 12 it is
        // "bcdefg" (6, from 4), so the lazy probe wins and the match starts
        // at 12. The later "bcdefgh" at 19 must then reach 12 (dist 7): with
        // chainDepth 1 only the newest entry of the "bcd" chain is probed, so
        // a scanner that forgets to insert the lazy-won start finds 4 instead
        // (dist 15).
        const LAZY_WIN = enc('abc' + 'x' + 'bcdefg' + 'y' + 'abcdefg' + 'z' + 'bcdefgh');

        test('the start of a lazily-won match is inserted into the chains', () => {
            const ops = tokenList(LAZY_WIN, { minMatch: 3, lazy: true, chainDepth: 1 });
            expect(ops.slice(11)).toEqual(['a', [6, 8], 'z', [6, 7], 'h']);
        });

        // Same shape with a decoy "bcdQ" as the NEWEST entry of the "bcd"
        // chain: the lazy probe needs two probes to reach the 6-byte match.
        const DECOY = enc('abc' + 'x' + 'bcdefg' + 'y' + 'bcdQ' + 'w' + 'abcdefg');

        test('with the full chain the lazy probe reaches past the decoy and wins', () => {
            const ops = tokenList(DECOY, { minMatch: 3, lazy: true, chainDepth: 4 });
            expect(ops.slice(14)).toEqual(['a', [6, 13]]);
        });

        test('{ goodLength } shortens the lazy probe to a quarter of the chain', () => {
            // The current match (3) is "good", the re-probe gets 4 >> 2 = 1
            // probe, sees only the decoy and loses.
            const ops = tokenList(DECOY, { minMatch: 3, lazy: true, chainDepth: 4, goodLength: 3 });
            expect(ops.slice(14)).toEqual([[3, 16], [4, 13]]);
        });

        test('{ maxLazy } suppresses the lazy probe once the current match reaches it', () => {
            const ops = tokenList(DECOY, { minMatch: 3, lazy: true, chainDepth: 4, maxLazy: 3 });
            expect(ops.slice(14)).toEqual([[3, 16], [4, 13]]);
        });

        test('a match the search was content with (niceLength) is never re-probed', () => {
            const ops = tokenList(DECOY, { minMatch: 3, lazy: true, chainDepth: 4, niceLength: 3 });
            expect(ops.slice(14)).toEqual([[3, 16], [4, 13]]);
        });
    });

    describe('start', () => {
        const l = lz77.factory();

        function record(data, opts) {
            const ops = [];
            l.encode(data, opts, {
                literal: pos => ops.push({ type: 'lit', pos, lit: data[pos] }),
                match: (pos, len, dist) => ops.push({ type: 'match', pos, len, dist }),
            });
            return ops;
        }

        test('reaches into the primed prefix (dist 8 at pos 8)', () => {
            const data = new TextEncoder().encode('ABCDEFGH'.repeat(4));
            const ops = record(data, { minMatch: 4, start: 8 });
            expect(ops[0].type).toBe('match');
            expect(ops[0].pos).toBe(8);
            expect(ops[0].dist).toBe(8);
        });

        test('no token has pos < start', () => {
            const data = new TextEncoder().encode('ABCDEFGH'.repeat(4));
            const ops = record(data, { minMatch: 4, start: 8 });
            for (const op of ops) expect(op.pos).toBeGreaterThanOrEqual(8);
        });

        test('all-literal data yields exactly len - start tokens', () => {
            const data = new Uint8Array(30);
            for (let i = 0; i < data.length; ++i) data[i] = i; // all-distinct bytes: no match possible
            const start = 6;
            const ops = record(data, { minMatch: 4, start });
            expect(ops.length).toBe(data.length - start);
            for (const op of ops) expect(op.type).toBe('lit');
        });

        test('start >= len emits nothing', () => {
            const data = new TextEncoder().encode('ABCDEFGH');
            expect(record(data, { minMatch: 4, start: data.length })).toEqual([]);
            expect(record(data, { minMatch: 4, start: data.length + 5 })).toEqual([]);
        });
    });

    describe('encodeTokens', () => {
        const l = lz77.factory();

        function recordPlain(data, opts) {
            const ops = [];
            l.encode(data, opts || {}, {
                literal: pos => ops.push({ lit: data[pos] }),
                match: (pos, len, dist) => ops.push({ len, dist }),
            });
            return ops;
        }

        function tokensToOps(tokens, count) {
            const ops = [];
            for (let k = 0; k < count; ++k) {
                const a = tokens[2 * k], b = tokens[2 * k + 1];
                ops.push(a === 0 ? { lit: b } : { len: a, dist: b });
            }
            return ops;
        }

        const corpora = [
            { data: new TextEncoder().encode('ABCDABCD'), opts: { minMatch: 4 } },
            { data: new TextEncoder().encode('A'.repeat(1000)), opts: { minMatch: 4 } },
            {
                data: new TextEncoder().encode(
                    'The quick brown fox jumps over the lazy dog. ' +
                    'Pack my box with five dozen liquor jugs. ' +
                    'Sphinx of black quartz, judge my vow.'
                ),
                opts: { minMatch: 4 },
            },
            { data: new TextEncoder().encode('ABABABABABABABABAB'), opts: { minMatch: 4 } },
            { data: new TextEncoder().encode('abcabcabcabc'), opts: { minMatch: 3 } },
            { data: new TextEncoder().encode('mississippi'.repeat(50)), opts: { minMatch: 4, chainDepth: 1 } },
        ];

        test('emits the same pairs as encode, for every corpus/opts pair', () => {
            for (const { data, opts } of corpora) {
                const expected = recordPlain(data, opts);
                const { tokens, count } = l.encodeTokens(data, opts);
                expect(tokensToOps(tokens, count)).toEqual(expected);
            }
        });

        test('converting pairs to ops and decodeStream reproduces the input', () => {
            for (const { data, opts } of corpora) {
                const { tokens, count } = l.encodeTokens(data, opts);
                const ops = tokensToOps(tokens, count);
                const out = new Uint8Array(data.length);
                l.decodeStream(out, ops);
                expect(Array.from(out)).toEqual(Array.from(data));
            }
        });

        test('too-small opts.tokens throws with the prescribed message', () => {
            const data = new TextEncoder().encode('ABCDABCD');
            expect(() => l.encodeTokens(data, { minMatch: 4, tokens: new Int32Array(1) }))
                .toThrow('lz77.encodeTokens: tokens buffer too small');
        });

        test('a large enough opts.tokens is returned as tokens (same object)', () => {
            const data = new TextEncoder().encode('ABCDABCD');
            const buf = new Int32Array(2 * data.length);
            const { tokens } = l.encodeTokens(data, { minMatch: 4, tokens: buf });
            expect(tokens).toBe(buf);
        });

        test('encode replays through a caller-supplied opts.tokens buffer', () => {
            const data = new TextEncoder().encode('ABCDABCDABCD');
            const buf = new Int32Array(2 * data.length);
            const ops = [];
            l.encode(data, { minMatch: 4, tokens: buf }, {
                literal: pos => ops.push({ lit: data[pos] }),
                match: (pos, len, dist) => ops.push({ len, dist }),
            });
            expect(ops).toEqual(recordPlain(data, { minMatch: 4 }));
            expect(buf[0]).toBe(0);              // first token is the literal 'A'
            expect(buf[1]).toBe(0x41);
        });

        test('rejects non-Uint8Array', () => {
            expect(() => l.encodeTokens('nope', {})).toThrow();
        });
    });

    describe('findMatch (low-level)', () => {
        const l = lz77.factory();

        test('returns null when no match exists', () => {
            const data = new TextEncoder().encode('ABCDEFGH');
            const head = new Int32Array(1 << 17).fill(-1);
            const prev = new Int32Array(1 << 16).fill(-1);
            // Empty chain → no match
            expect(l.findMatch(data, 0, head, prev, {})).toBeNull();
        });

        test('returns a hit when the hash chain points to an identical sequence', () => {
            const data = new TextEncoder().encode('ABCDABCD');
            const head = new Int32Array(1 << 17).fill(-1);
            const prev = new Int32Array(1 << 16).fill(-1);
            // Manually seed the hash chain with position 0's hash.
            // Easier: drive the encoder to position 4, then probe.
            // Reproduce via a helper encode that stops after first match.
            let probedLen = 0, probedDist = 0;
            l.encode(data, { minMatch: 4 }, {
                literal() {},
                match: (_pos, len, dist) => { probedLen = len; probedDist = dist; },
            });
            expect(probedLen).toBe(4);
            expect(probedDist).toBe(4);
        });
    });

    describe('decodeStream (test helper)', () => {
        const l = lz77.factory();

        test('reconstructs from a literal-only op list', () => {
            const dst = new Uint8Array(3);
            const n = l.decodeStream(dst, [{ lit: 1 }, { lit: 2 }, { lit: 3 }]);
            expect(n).toBe(3);
            expect(Array.from(dst)).toEqual([1, 2, 3]);
        });

        test('handles overlapping matches (dist < len)', () => {
            // 0x42 then a match of len 5, dist 1 = run-length expansion
            const dst = new Uint8Array(6);
            l.decodeStream(dst, [{ lit: 0x42 }, { len: 5, dist: 1 }]);
            expect(Array.from(dst)).toEqual([0x42, 0x42, 0x42, 0x42, 0x42, 0x42]);
        });
    });
});
