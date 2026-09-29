// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { brotliDict } from './brotli_dict.js';

describe('brotliDict module', () => {

    test('has correct module metadata', () => {
        expect(brotliDict.name).toBe('brotliDict');
        expect(brotliDict.version).toBe('0.1.0');
        expect(brotliDict.type).toBe('fw.io.compress');
        expect(brotliDict.dependencies).toEqual([]);
        expect(typeof brotliDict.factory).toBe('function');
    });

    describe('factory', () => {
        const d = brotliDict.factory();

        test('returns expected API', () => {
            expect(d.NDBITS).toBeInstanceOf(Uint8Array);
            expect(d.NDBITS.length).toBe(25);
            expect(typeof d.NWORDS).toBe('function');
            expect(typeof d.DOFFSET).toBe('function');
            expect(typeof d.DICTSIZE).toBe('number');
            expect(Array.isArray(d.transforms)).toBe(true);
            expect(d.transforms.length).toBe(121);
            expect(typeof d.applyTransform).toBe('function');
            expect(typeof d.setWords).toBe('function');
            expect(typeof d.hasWords).toBe('function');
            expect(typeof d.lookupWord).toBe('function');
            expect(d.hasWords()).toBe(false);
        });

        describe('NDBITS / NWORDS / DOFFSET / DICTSIZE', () => {
            test('NDBITS matches RFC 7932 §8 table', () => {
                expect(Array.from(d.NDBITS)).toEqual([
                    0, 0, 0, 0, 10, 10, 11, 11, 10, 10,
                    10, 10, 10, 9, 9, 8, 7, 7, 8, 7,
                    7, 6, 6, 5, 5,
                ]);
            });

            test('NWORDS is 0 for length < 4', () => {
                for (let l = 0; l < 4; ++l) expect(d.NWORDS(l)).toBe(0);
            });

            test('NWORDS(length) = 1 << NDBITS[length] for length >= 4', () => {
                for (let l = 4; l <= 24; ++l) {
                    expect(d.NWORDS(l)).toBe(1 << d.NDBITS[l]);
                }
            });

            test('DICTSIZE matches RFC value (122784)', () => {
                expect(d.DICTSIZE).toBe(122784);
            });

            test('DOFFSET(0)=0, DOFFSET(4)=0, DOFFSET(length+1) follows the recurrence', () => {
                expect(d.DOFFSET(0)).toBe(0);
                expect(d.DOFFSET(4)).toBe(0);
                for (let l = 4; l <= 24; ++l) {
                    expect(d.DOFFSET(l + 1)).toBe(d.DOFFSET(l) + l * d.NWORDS(l));
                }
            });
        });

        describe('transforms', () => {
            test('transform 0 = Identity, empty prefix/suffix', () => {
                const t = d.transforms[0];
                expect(t.kind).toBe(0);
                expect(t.prefix.length).toBe(0);
                expect(t.suffix.length).toBe(0);
            });

            test('transform 1 = Identity with " " suffix', () => {
                const t = d.transforms[1];
                expect(t.kind).toBe(0);
                expect(Array.from(t.suffix)).toEqual([0x20]);
            });

            test('transform 4 = FermentFirst with " " suffix', () => {
                const t = d.transforms[4];
                expect(t.kind).toBe(1);
                expect(Array.from(t.suffix)).toEqual([0x20]);
            });

            test('transform 11 = OmitFirst2', () => {
                const t = d.transforms[11];
                expect(t.kind).toBe(4);  // 2 + 2 = 4
                expect(t.param).toBe(2);
            });

            test('transform 12 = OmitLast1', () => {
                const t = d.transforms[12];
                expect(t.kind).toBe(12); // 11 + 1
                expect(t.param).toBe(1);
            });

            test('transform 102 has NBSP prefix (U+00A0 = 0xC2 0xA0)', () => {
                const t = d.transforms[102];
                expect(Array.from(t.prefix)).toEqual([0xC2, 0xA0]);
            });

            test('all 121 transforms defined', () => {
                for (let i = 0; i < 121; ++i) {
                    expect(d.transforms[i]).toBeDefined();
                    expect(d.transforms[i].prefix).toBeInstanceOf(Uint8Array);
                    expect(d.transforms[i].suffix).toBeInstanceOf(Uint8Array);
                }
            });
        });

        describe('applyTransform', () => {
            const bytes = s => new TextEncoder().encode(s);
            const text  = b => new TextDecoder().decode(b);

            test('Identity (id=0) returns the word unchanged', () => {
                expect(text(d.applyTransform(0, bytes('hello')))).toBe('hello');
            });

            test('id=1: "" + Identity + " " → "hello "', () => {
                expect(text(d.applyTransform(1, bytes('hello')))).toBe('hello ');
            });

            test('id=4: FermentFirst on "hello" → "Hello "', () => {
                expect(text(d.applyTransform(4, bytes('hello')))).toBe('Hello ');
            });

            test('id=9: FermentFirst on "hello" → "Hello"', () => {
                expect(text(d.applyTransform(9, bytes('hello')))).toBe('Hello');
            });

            test('id=44: FermentAll on "Hello" → "HELLO" (XOR 32 only on a–z)', () => {
                // RFC 7932 §8: Ferment XORs 32 only when byte is in [97, 122] (lowercase a–z).
                // Other bytes (including uppercase A–Z = 65–90) are left unchanged.
                expect(text(d.applyTransform(44, bytes('Hello')))).toBe('HELLO');
            });

            test('id=3: OmitFirst1 on "hello" → "ello"', () => {
                expect(text(d.applyTransform(3, bytes('hello')))).toBe('ello');
            });

            test('id=23: OmitLast3 on "abcdef" → "abc"', () => {
                expect(text(d.applyTransform(23, bytes('abcdef')))).toBe('abc');
            });

            test('OmitFirstK on shorter word → empty body but prefix/suffix preserved', () => {
                // id=11 = OmitFirst2 with empty prefix/suffix
                expect(d.applyTransform(11, bytes('a')).length).toBe(0);
            });

            test('id=41: " the " + Identity → " the hello"', () => {
                expect(text(d.applyTransform(41, bytes('hello')))).toBe(' the hello');
            });

            test('throws on unknown transform id', () => {
                expect(() => d.applyTransform(999, bytes('x'))).toThrow();
            });
        });

        describe('setWords / hasWords / lookupWord', () => {
            test('hasWords starts false, lookupWord throws EDICT_UNLOADED', () => {
                const fresh = brotliDict.factory();
                expect(fresh.hasWords()).toBe(false);
                try { fresh.lookupWord(4, 0); }
                catch (e) { expect(e.code).toBe('EDICT_UNLOADED'); return; }
                throw new Error('expected throw');
            });

            test('setWords rejects non-Uint8Array', () => {
                const fresh = brotliDict.factory();
                expect(() => fresh.setWords('not-a-buffer')).toThrow();
                expect(() => fresh.setWords(new ArrayBuffer(d.DICTSIZE))).toThrow();
            });

            test('setWords rejects wrong size', () => {
                const fresh = brotliDict.factory();
                expect(() => fresh.setWords(new Uint8Array(100))).toThrow();
            });

            test('setWords accepts correct size and hasWords becomes true', () => {
                const fresh = brotliDict.factory();
                const blob = new Uint8Array(fresh.DICTSIZE);
                fresh.setWords(blob);
                expect(fresh.hasWords()).toBe(true);
            });

            test('lookupWord returns a slice once words is loaded', () => {
                const fresh = brotliDict.factory();
                const blob = new Uint8Array(fresh.DICTSIZE);
                // Mark every byte uniquely so we can detect the right offset.
                for (let i = 0; i < blob.length; ++i) blob[i] = i & 0xFF;
                fresh.setWords(blob);

                // For length 4: DOFFSET(4) = 0, NWORDS(4) = 1024.
                const w0 = fresh.lookupWord(4, 0);
                expect(w0.length).toBe(4);
                expect(Array.from(w0)).toEqual([0, 1, 2, 3]);

                const w1 = fresh.lookupWord(4, 1);
                expect(Array.from(w1)).toEqual([4, 5, 6, 7]);
            });

            test('lookupWord rejects invalid length', () => {
                const fresh = brotliDict.factory();
                fresh.setWords(new Uint8Array(fresh.DICTSIZE));
                expect(() => fresh.lookupWord(3, 0)).toThrow();
                expect(() => fresh.lookupWord(25, 0)).toThrow();
            });

            test('lookupWord rejects out-of-range index', () => {
                const fresh = brotliDict.factory();
                fresh.setWords(new Uint8Array(fresh.DICTSIZE));
                expect(() => fresh.lookupWord(4, -1)).toThrow();
                expect(() => fresh.lookupWord(4, fresh.NWORDS(4))).toThrow();
            });
        });
    });
});
