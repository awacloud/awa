// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';

const bs = bitstream.factory();

describe('huffman module', () => {

    test('has correct module metadata', () => {
        expect(huffman.name).toBe('huffman');
        expect(huffman.version).toBe('1.0.0');
        expect(huffman.type).toBe('fw.io.compress');
        expect(huffman.dependencies).toEqual(['bitstream']);
        expect(typeof huffman.factory).toBe('function');
    });

    describe('factory', () => {
        const hf = huffman.factory(bs);

        test('returns expected API', () => {
            expect(typeof hf.buildMap).toBe('function');
            expect(typeof hf.buildTree).toBe('function');
        });

        describe('buildTree', () => {
            test('returns empty tree for all-zero frequencies', () => {
                const { t, l } = hf.buildTree(new Uint16Array(8), 15);
                expect(l).toBe(0);
                expect(t.length).toBe(0);
            });

            test('returns 1-bit code for single symbol', () => {
                const f = new Uint16Array(8);
                f[3] = 10;
                const { t, l } = hf.buildTree(f, 15);
                expect(l).toBe(1);
                expect(t[3]).toBe(1);
            });

            test('produces shorter code for higher-frequency symbol', () => {
                const f = new Uint16Array(4);
                f[0] = 100; f[1] = 1; f[2] = 1; f[3] = 1;
                const { t } = hf.buildTree(f, 15);
                expect(t[0]).toBeLessThanOrEqual(t[1]);
                expect(t[0]).toBeLessThanOrEqual(t[2]);
                expect(t[0]).toBeLessThanOrEqual(t[3]);
            });

            test('respects max-bits cap', () => {
                const f = new Uint16Array(20);
                for (let i = 0; i < 20; ++i) f[i] = i + 1;
                const { t, l } = hf.buildTree(f, 5);
                expect(l).toBeLessThanOrEqual(5);
                for (let i = 0; i < t.length; ++i) {
                    expect(t[i]).toBeLessThanOrEqual(5);
                }
            });

            test('lengths satisfy Kraft inequality (canonical, ≤ 1)', () => {
                const f = new Uint16Array([3, 7, 2, 5, 11, 1]);
                const { t } = hf.buildTree(f, 15);
                let s = 0;
                for (let i = 0; i < t.length; ++i) if (t[i]) s += Math.pow(2, -t[i]);
                expect(s).toBeLessThanOrEqual(1 + 1e-9);
            });
        });

        describe('buildMap', () => {
            test('encoder mode: produces one code per nonzero length', () => {
                const lengths = new Uint8Array([3, 3, 3, 3, 3, 2, 4, 4]);
                const codes = hf.buildMap(lengths, 4, 0);
                expect(codes.length).toBe(lengths.length);
                expect(codes[5]).toBeDefined();
            });

            test('decoder mode: table size = 1 << maxBits', () => {
                const lengths = new Uint8Array([2, 1, 3, 3]);
                const table = hf.buildMap(lengths, 3, 1);
                expect(table.length).toBe(8);
            });

            test('decoder table entries pack (symbol << 4) | codeLen', () => {
                const lengths = new Uint8Array([1, 1]);
                const table = hf.buildMap(lengths, 1, 1);
                for (let i = 0; i < table.length; ++i) {
                    const sym = table[i] >> 4;
                    const len = table[i] & 0x0F;
                    expect(len).toBe(1);
                    expect(sym === 0 || sym === 1).toBe(true);
                }
            });
        });

        describe('round-trip buildTree → buildMap', () => {
            test('reproduces a usable code from frequencies', () => {
                const f = new Uint16Array([5, 9, 12, 13, 16, 45]);
                const { t, l } = hf.buildTree(f, 15);
                const enc = hf.buildMap(t, l, 0);
                const dec = hf.buildMap(t, l, 1);
                expect(enc.length).toBeGreaterThan(0);
                expect(dec.length).toBe(1 << l);
                for (let s = 0; s < t.length; ++s) {
                    if (!t[s]) continue;
                    const code = enc[s];
                    const entry = dec[code];
                    expect(entry & 0x0F).toBe(t[s]);
                    expect(entry >> 4).toBe(s);
                }
            });
        });

        describe('RFC 1951 §3.2.2 canonical assignment', () => {
            // RFC example: lengths (3,3,3,3,3,2,4,4) for A..H give
            // A 010, B 011, C 100, D 101, E 110, F 00, G 1110, H 1111.
            const lengths = [3, 3, 3, 3, 3, 2, 4, 4];

            test('encode map holds each code mirrored over its own length', () => {
                expect(Array.from(hf.buildMap(lengths, 4, 0))).toEqual([2, 6, 1, 5, 3, 0, 7, 15]);
            });

            test('encode map written LSB-first puts the code MSB-first on the wire', () => {
                const codes = hf.buildMap(lengths, 4, 0);
                const buf = new Uint8Array(4);
                bs.writeBits(buf, 0, codes[6]);   // G = 1110
                expect([0, 1, 2, 3].map(i => bs.readBits(buf, i, 1))).toEqual([1, 1, 1, 0]);
            });

            test('decode table at maxBits = 4', () => {
                expect(Array.from(hf.buildMap(lengths, 4, 1))).toEqual(
                    [82, 35, 3, 67, 82, 51, 19, 100, 82, 35, 3, 67, 82, 51, 19, 116]);
            });

            test('unused symbols get 0 in the encode map', () => {
                const codes = hf.buildMap([2, 0, 1, 0, 2], 2, 0);
                expect(codes[1]).toBe(0);
                expect(codes[3]).toBe(0);
            });

            test('number[] and Uint8Array code lengths give the same tables', () => {
                const u8 = new Uint8Array(lengths);
                expect(Array.from(hf.buildMap(u8, 4, 0))).toEqual(Array.from(hf.buildMap(lengths, 4, 0)));
                expect(Array.from(hf.buildMap(u8, 4, 1))).toEqual(Array.from(hf.buildMap(lengths, 4, 1)));
            });
        });

        describe('RFC 1951 §3.2.6 fixed literal/length code', () => {
            const lengths = new Uint8Array(288);
            lengths.fill(8, 0, 144);
            lengths.fill(9, 144, 256);
            lengths.fill(7, 256, 280);
            lengths.fill(8, 280, 288);

            test('the decode table is complete (no zero slot)', () => {
                const dec = hf.buildMap(lengths, 9, 1);
                expect(dec.length).toBe(512);
                expect(dec.indexOf(0)).toBe(-1);
            });

            test('every symbol decodes back through its encode-map code', () => {
                const enc = hf.buildMap(lengths, 9, 0);
                const dec = hf.buildMap(lengths, 9, 1);
                let failures = 0;
                for (let s = 0; s < 288; ++s) {
                    const entry = dec[enc[s]];
                    if (entry >> 4 !== s || (entry & 15) !== lengths[s]) ++failures;
                }
                expect(failures).toBe(0);
            });

            test('first codes of each range match the RFC table', () => {
                const enc = hf.buildMap(lengths, 9, 0);
                // Mirror back over the code length to read each code MSB-first.
                expect(bs.rev[enc[0]] >> (15 - 8)).toBe(0b00110000);
                expect(bs.rev[enc[144]] >> (15 - 9)).toBe(0b110010000);
                expect(enc[256]).toBe(0);
                expect(bs.rev[enc[280]] >> (15 - 8)).toBe(0b11000000);
            });
        });

        describe('buildTree properties', () => {
            /** Deterministic xorshift32 stream. */
            function xorshift32(seed) {
                let x = seed >>> 0;
                return () => {
                    x ^= x << 13; x >>>= 0;
                    x ^= x >>> 17;
                    x ^= x << 5; x >>>= 0;
                    return x;
                };
            }

            /** Kraft sum scaled by 2^15, exact in integers. */
            function kraft15(t) {
                let sum = 0;
                for (let i = 0; i < t.length; ++i) if (t[i]) sum += 1 << (15 - t[i]);
                return sum;
            }

            function cost(freqs, t) {
                let c = 0;
                for (let i = 0; i < t.length; ++i) c += freqs[i] * t[i];
                return c;
            }

            /** Unlimited Huffman lengths - independent, naive reference. */
            function referenceHuffman(freqs) {
                let nodes = [];
                for (let s = 0; s < freqs.length; ++s) {
                    if (freqs[s] > 0) nodes.push({ w: freqs[s], syms: [s] });
                }
                const len = new Array(freqs.length).fill(0);
                while (nodes.length > 1) {
                    nodes.sort((a, b) => a.w - b.w);
                    const [a, b] = nodes;
                    for (const s of a.syms) ++len[s];
                    for (const s of b.syms) ++len[s];
                    nodes = [{ w: a.w + b.w, syms: a.syms.concat(b.syms) }, ...nodes.slice(2)];
                }
                return len;
            }

            function randomFreqs(rnd) {
                const n = 2 + (rnd() % 299);
                const f = new Array(n);
                for (let i = 0; i < n; ++i) f[i] = (rnd() % 4 === 0) ? 0 : 1 + (rnd() % 5000);
                // Guarantee at least two used symbols.
                let used = f.filter(v => v > 0).length;
                for (let i = 0; used < 2; ++i) {
                    if (!f[i]) { f[i] = 1; ++used; }
                }
                return f;
            }

            /** Returns null when `{ t, l }` satisfies the contract shape, else the first violation. */
            function shapeViolation(f, t, l, maxBits) {
                let top = -1;
                for (let i = 0; i < f.length; ++i) if (f[i] > 0) top = i;
                if (!(t instanceof Uint8Array)) return 't is not a Uint8Array';
                if (t.length !== top + 1) return 't.length !== maxSymbol + 1';
                let longest = 0;
                for (let i = 0; i < t.length; ++i) {
                    if ((f[i] > 0) !== (t[i] > 0)) return 'used/unused mismatch at ' + i;
                    if (t[i] > maxBits) return 'length over maxBits at ' + i;
                    if (t[i] > longest) longest = t[i];
                }
                if (l !== longest) return 'l !== max(t)';
                // Monotonicity: in ascending frequency order, lengths never grow.
                const order = [...t.keys()].filter(i => f[i] > 0).sort((a, b) => f[a] - f[b]);
                for (let k = 1; k < order.length; ++k) {
                    const lo = order[k - 1];
                    const hi = order[k];
                    if (f[hi] > f[lo] && t[hi] > t[lo]) return 'monotonicity broken at ' + hi;
                }
                return null;
            }

            test('100 random vectors (2..300 symbols, zeros included): complete, monotone, bounded', () => {
                const rnd = xorshift32(0x1951);
                for (let v = 0; v < 100; ++v) {
                    const f = randomFreqs(rnd);
                    const { t, l } = hf.buildTree(f, 15);
                    expect(shapeViolation(f, t, l, 15)).toBeNull();
                    expect(kraft15(t)).toBe(1 << 15);
                }
            });

            test('matches the unlimited Huffman cost whenever that code fits in 15 bits', () => {
                const rnd = xorshift32(0x7932);
                let compared = 0;
                for (let v = 0; v < 100; ++v) {
                    const f = randomFreqs(rnd);
                    const ref = referenceHuffman(f);
                    if (Math.max(...ref) > 15) continue;
                    ++compared;
                    expect(cost(f, hf.buildTree(f, 15).t)).toBe(cost(f, ref));
                }
                expect(compared).toBeGreaterThan(90);
            });

            test('maxBits = 7 on 100 symbols: the limit binds, lengths stay within it', () => {
                const rnd = xorshift32(7);
                let bound = 0;
                for (let v = 0; v < 100; ++v) {
                    const f = new Array(100);
                    for (let i = 0; i < 100; ++i) f[i] = 1 + (rnd() % (1 << (rnd() % 20)));
                    if (Math.max(...referenceHuffman(f)) > 7) ++bound;
                    const { t, l } = hf.buildTree(f, 7);
                    expect(shapeViolation(f, t, l, 7)).toBeNull();
                    expect(kraft15(t)).toBeLessThanOrEqual(1 << 15);
                }
                expect(bound).toBeGreaterThan(50);
            });

            test('Fibonacci frequencies over 40 symbols stay within 15 bits', () => {
                const f = [1, 1];
                while (f.length < 40) f.push(f[f.length - 1] + f[f.length - 2]);
                expect(Math.max(...referenceHuffman(f))).toBeGreaterThan(15);
                const { t, l } = hf.buildTree(f, 15);
                expect(shapeViolation(f, t, l, 15)).toBeNull();
                expect(kraft15(t)).toBe(1 << 15);
            });

            test('large frequencies have no ceiling (BL-1110)', () => {
                const flat = new Uint32Array(300).fill(1000);
                const a = hf.buildTree(flat, 15);
                expect(shapeViolation(flat, a.t, a.l, 15)).toBeNull();
                expect(kraft15(a.t)).toBe(1 << 15);

                const skewed = new Uint32Array(256).fill(3);
                skewed[17] = 1 << 20;
                const b = hf.buildTree(skewed, 15);
                expect(shapeViolation(skewed, b.t, b.l, 15)).toBeNull();
                expect(kraft15(b.t)).toBe(1 << 15);
                expect(b.t[17]).toBe(1);

                // Summed frequencies of 2^32 - 1.
                const huge = [2 ** 31, 2 ** 30, 2 ** 30 - 2, 1];
                expect(Array.from(hf.buildTree(huge, 15).t)).toEqual([1, 2, 3, 3]);
            });

            test('optimality witness: [5, 9, 12, 13, 16, 45] costs 224', () => {
                const f = [5, 9, 12, 13, 16, 45];
                const { t, l } = hf.buildTree(f, 15);
                expect(Array.from(t)).toEqual([4, 4, 3, 3, 3, 1]);
                expect(l).toBe(4);
                expect(cost(f, t)).toBe(224);
            });

            test('single used symbol: t.length === s + 1, t[s] === 1, l === 1', () => {
                const { t, l } = hf.buildTree([0, 0, 0, 0, 0, 9], 15);
                expect(Array.from(t)).toEqual([0, 0, 0, 0, 0, 1]);
                expect(l).toBe(1);
            });

            test('deterministic, and Uint16Array / Uint32Array / number[] agree', () => {
                const rnd = xorshift32(42);
                const f = new Array(120);
                for (let i = 0; i < 120; ++i) f[i] = rnd() % 700;
                const first = hf.buildTree(f, 15);
                const again = hf.buildTree(f, 15);
                expect(Array.from(again.t)).toEqual(Array.from(first.t));
                expect(again.l).toBe(first.l);
                for (const typed of [new Uint16Array(f), new Uint32Array(f)]) {
                    const r = hf.buildTree(typed, 15);
                    expect(Array.from(r.t)).toEqual(Array.from(first.t));
                    expect(r.l).toBe(first.l);
                }
            });

            // --- Two-queue fast path vs the general (package-merge) path ---
            //
            // `buildTree` returns the plain two-queue Huffman code whenever its
            // deepest code fits in `maxBits`, and runs package-merge otherwise.
            // Both must yield the SAME lengths (not merely the same cost), so
            // the fast path never changes a codec's output. The reference below
            // is package-merge written out with explicit coin counts - slow,
            // independent of the module's flag-based unpacking, and fed the same
            // tie rules: leaves ordered by (frequency, symbol), and on equal
            // weight a leaf coin goes before a package.

            /** Package-merge with explicit per-leaf coin counts (small alphabets only). */
            function referencePackageMerge(freqs, maxBits) {
                const syms = [];
                for (let s = 0; s < freqs.length; ++s) if (freqs[s] > 0) syms.push(s);
                syms.sort((a, b) => freqs[a] - freqs[b] || a - b);
                const n = syms.length;
                const t = new Array(syms.length ? Math.max(...syms) + 1 : 0).fill(0);
                if (n === 1) { t[syms[0]] = 1; return t; }
                const coins = syms.map((s, i) => {
                    const count = new Array(n).fill(0);
                    count[i] = 1;
                    return { w: freqs[s], count };
                });
                let list = coins;
                for (let level = 1; level < maxBits; ++level) {
                    const packages = [];
                    for (let k = 0; k + 1 < list.length; k += 2) {
                        packages.push({
                            w: list[k].w + list[k + 1].w,
                            count: list[k].count.map((c, i) => c + list[k + 1].count[i]),
                        });
                    }
                    const next = [];
                    let a = 0;
                    let b = 0;
                    while (a < coins.length || b < packages.length) {
                        const takeCoin = b >= packages.length || (a < coins.length && coins[a].w <= packages[b].w);
                        next.push(takeCoin ? coins[a++] : packages[b++]);
                    }
                    list = next;
                }
                for (let k = 0; k < 2 * n - 2; ++k) {
                    for (let i = 0; i < n; ++i) t[syms[i]] += list[k].count[i];
                }
                return t;
            }

            test('reference package-merge reproduces the RFC-independent witnesses', () => {
                expect(referencePackageMerge([5, 9, 12, 13, 16, 45], 15)).toEqual([4, 4, 3, 3, 3, 1]);
                // maxBits = 2 forces a flat code on 4 skewed symbols.
                expect(referencePackageMerge([1, 2, 4, 100], 2)).toEqual([2, 2, 2, 2]);
            });

            test('exhaustive 2..5 symbols, frequencies 1..5: fast path and package-merge agree at, above and below the Huffman depth', () => {
                let fast = 0;
                let general = 0;
                for (let n = 2; n <= 5; ++n) {
                    const f = new Array(n).fill(1);
                    const total = 5 ** n;
                    for (let code = 0; code < total; ++code) {
                        for (let i = 0, c = code; i < n; ++i, c = Math.floor(c / 5)) f[i] = 1 + (c % 5);
                        const depth = Math.max(...referenceHuffman(f));
                        const floor = Math.ceil(Math.log2(n));
                        for (let limit = Math.max(floor, depth - 1); limit <= depth + 1; ++limit) {
                            if (limit >= depth) ++fast; else ++general;
                            const { t, l } = hf.buildTree(f, limit);
                            const ref = referencePackageMerge(f, limit);
                            expect(Array.from(t)).toEqual(ref);
                            expect(l).toBe(Math.max(...ref));
                        }
                    }
                }
                expect(fast).toBeGreaterThan(7000);
                expect(general).toBeGreaterThan(500);
            });

            test('seeded random vectors (2..40 symbols, tie-heavy and wide frequencies): identical lengths on both paths', () => {
                const rnd = xorshift32(0x0B5E);
                let fast = 0;
                let general = 0;
                for (let v = 0; v < 400; ++v) {
                    const n = 2 + (rnd() % 39);
                    const range = [2, 3, 8, 5000][v % 4];
                    const f = new Array(n);
                    for (let i = 0; i < n; ++i) f[i] = (rnd() % 5 === 0) ? 0 : 1 + (rnd() % range);
                    if (f.filter(x => x > 0).length < 2) { f[0] = 1; f[1] = 1; }
                    const limit = v % 3 === 0 ? 5 + (rnd() % 3) : 15;
                    const used = f.filter(x => x > 0).length;
                    if ((1 << limit) < used) continue;
                    if (Math.max(...referenceHuffman(f)) <= limit) ++fast; else ++general;
                    expect(Array.from(hf.buildTree(f, limit).t)).toEqual(referencePackageMerge(f, limit));
                }
                expect(fast).toBeGreaterThan(250);
                expect(general).toBeGreaterThan(20);
            });
        });
    });
});
