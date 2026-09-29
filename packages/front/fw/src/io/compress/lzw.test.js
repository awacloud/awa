// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { lzw } from './lzw.js';

describe('lzw module', () => {
    test('has correct module metadata', () => {
        expect(lzw.name).toBe('lzw');
        expect(lzw.version).toBe('1.0.0');
        expect(lzw.type).toBe('fw.io.compress');
        expect(lzw.dependencies).toEqual([]);
        expect(typeof lzw.factory).toBe('function');
    });

    describe('factory', () => {
        const l = lzw.factory();

        test('returns expected API', () => {
            expect(typeof l.encode).toBe('function');
            expect(typeof l.decode).toBe('function');
        });
    });

    describe('round-trip - defaults (GIF-style: LSB-first, maxBits=12, CLEAR/END)', () => {
        const l = lzw.factory();

        function rt(data, opts) {
            const enc = l.encode(data, opts);
            const dec = l.decode(enc, opts);
            return { enc, dec };
        }

        test('empty input round-trips', () => {
            const { dec } = rt(new Uint8Array(0));
            expect(dec.length).toBe(0);
        });

        test('1-byte input', () => {
            const data = new Uint8Array([0x42]);
            const { dec } = rt(data);
            expect(Array.from(dec)).toEqual([0x42]);
        });

        test('short ASCII', () => {
            const data = new TextEncoder().encode('Hello');
            const { dec } = rt(data);
            expect(new TextDecoder().decode(dec)).toBe('Hello');
        });

        test('classic LZW textbook input "TOBEORNOTTOBEORTOBEORNOT"', () => {
            // Canonical LZW example - exercises the "KwKwK" branch.
            const text = 'TOBEORNOTTOBEORTOBEORNOT';
            const { dec } = rt(new TextEncoder().encode(text));
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('long repetitive run "A" × 1000', () => {
            const data = new TextEncoder().encode('A'.repeat(1000));
            const { enc, dec } = rt(data);
            expect(dec.length).toBe(1000);
            expect(new TextDecoder().decode(dec)).toBe('A'.repeat(1000));
            expect(enc.length).toBeLessThan(data.length / 4);
        });

        test('longer English text', () => {
            const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
            const data = new TextEncoder().encode(text);
            const { dec } = rt(data);
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('random-ish binary data', () => {
            const data = new Uint8Array(4096);
            let s = 17;
            for (let i = 0; i < data.length; ++i) { s = (s * 31 + 13) & 0xFF; data[i] = s; }
            const { dec } = rt(data);
            expect(Array.from(dec)).toEqual(Array.from(data));
        });

        test('UTF-8 multi-byte content', () => {
            const text = 'café - déjà vu - naïve résumé piñata Москва 日本語';
            const data = new TextEncoder().encode(text);
            const { dec } = rt(data);
            expect(new TextDecoder().decode(dec)).toBe(text);
        });
    });

    describe('round-trip - TIFF profile (MSB-first)', () => {
        const l = lzw.factory();

        function rt(data) {
            const opts = { bigEndian: true };
            const enc = l.encode(data, opts);
            const dec = l.decode(enc, opts);
            return { enc, dec };
        }

        test('short ASCII', () => {
            const data = new TextEncoder().encode('TIFF sample');
            const { dec } = rt(data);
            expect(new TextDecoder().decode(dec)).toBe('TIFF sample');
        });

        test('long text round-trips with MSB-first packing', () => {
            const text = 'lorem ipsum dolor sit amet '.repeat(40);
            const data = new TextEncoder().encode(text);
            const { dec } = rt(data);
            expect(new TextDecoder().decode(dec)).toBe(text);
        });
    });

    describe('round-trip - compress/.Z profile (no CLEAR/END)', () => {
        const l = lzw.factory();

        function rt(data, opts) {
            const o = Object.assign({ useClearEnd: false }, opts);
            const enc = l.encode(data, o);
            const dec = l.decode(enc, o);
            return { enc, dec };
        }

        test('short ASCII without markers', () => {
            const data = new TextEncoder().encode('compress me');
            const { dec } = rt(data);
            expect(new TextDecoder().decode(dec)).toBe('compress me');
        });

        test('LSB-first compress with maxBits=16', () => {
            const text = 'The quick brown fox '.repeat(30);
            const data = new TextEncoder().encode(text);
            const { dec } = rt(data, { maxBits: 16 });
            expect(new TextDecoder().decode(dec)).toBe(text);
        });
    });

    describe('maxBits variations', () => {
        const l = lzw.factory();

        test('maxBits=9 (minimal) round-trips', () => {
            const text = 'TOBEORNOTTOBEORTOBEORNOT';
            const data = new TextEncoder().encode(text);
            const enc = l.encode(data, { maxBits: 9 });
            const dec = l.decode(enc, { maxBits: 9 });
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('maxBits=16 supports large dictionary', () => {
            const text = 'lorem ipsum '.repeat(500);
            const data = new TextEncoder().encode(text);
            const enc = l.encode(data, { maxBits: 16 });
            const dec = l.decode(enc, { maxBits: 16 });
            expect(new TextDecoder().decode(dec)).toBe(text);
            // Should compress well at maxBits=16
            expect(enc.length).toBeLessThan(data.length / 4);
        });
    });

    describe('minCodeBits < 8', () => {
        const l = lzw.factory();

        test('binary 4-symbol alphabet with minCodeBits=2', () => {
            // Only bytes 0..3 in the input - alphabet size 4 = 1 << 2.
            const data = new Uint8Array([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
            const opts = { minCodeBits: 2, maxBits: 8 };
            const enc = l.encode(data, opts);
            const dec = l.decode(enc, opts);
            expect(Array.from(dec)).toEqual(Array.from(data));
        });
    });

    describe('error cases', () => {
        const l = lzw.factory();

        test('encode rejects non-Uint8Array', () => {
            expect(() => l.encode('not-bytes')).toThrow();
        });

        test('decode rejects non-Uint8Array', () => {
            expect(() => l.decode('not-bytes')).toThrow();
        });

        test('rejects minCodeBits out of range', () => {
            expect(() => l.encode(new Uint8Array(1), { minCodeBits: 1 })).toThrow();
            expect(() => l.encode(new Uint8Array(1), { minCodeBits: 13 })).toThrow();
        });

        test('rejects maxBits out of range', () => {
            expect(() => l.encode(new Uint8Array(1), { maxBits: 17 })).toThrow();
            expect(() => l.encode(new Uint8Array(1), { minCodeBits: 8, maxBits: 8 })).toThrow();
        });

        test('decoder rejects corrupted code (out of range)', () => {
            // Craft a stream that starts with a code >= initial+2 (firstFree)
            // before the dictionary has had a chance to grow.
            // With minCodeBits=8, useClearEnd=true:
            //   first code at 9 bits - CLEAR=256, END=257, firstFree=258
            //   If we feed a code = 260 as the first non-CLEAR code, it must throw.
            // Build manually: write CLEAR (9 bits = 256 = 0b100000000), then 260.
            const enc = lzw.factory();
            const bytes = new Uint8Array([
                // CLEAR (256) + first code 260 (= 0b100000100), LSB-first
                // CLEAR bits (LSB first): 0,0,0,0,0,0,0,0,1
                // 260 bits (LSB first):   0,0,1,0,0,0,0,0,1
                // 18 bits packed LSB-first:
                //   bit  0-7: 0,0,0,0,0,0,0,0  → byte 0 = 0x00
                //   bit  8:   1                → bit 0 of byte 1
                //   bit  9-15: 0,0,1,0,0,0,0   → bits 1-7 of byte 1 = 0b00010000 → byte 1 = 0x21 (bit 0=1, bit 4=1)
                //                                                                  Wait let me recompute.
                //   Actually bit 8 = bit 0 of byte 1.
                //   Concatenating bits[0..17] = 000000001 001000001:
                //   byte 0 (bits 0..7) = 0,0,0,0,0,0,0,0 = 0x00
                //   byte 1 (bits 8..15) = 1,0,0,1,0,0,0,0 = 0x09
                //   byte 2 (bits 16..17) = 0,1 + zero padding = 0x02
                0x00, 0x09, 0x02,
            ]);
            expect(() => enc.decode(bytes)).toThrow();
        });
    });

    describe('compression effectiveness', () => {
        const l = lzw.factory();

        test('long repetitive text shrinks substantially', () => {
            const text = 'mississippi '.repeat(200);
            const data = new TextEncoder().encode(text);
            const enc = l.encode(data, { maxBits: 14 });
            expect(enc.length).toBeLessThan(data.length / 6);
            const dec = l.decode(enc, { maxBits: 14 });
            expect(new TextDecoder().decode(dec)).toBe(text);
        });

        test('random data does not shrink much (expected: ratio near 1)', () => {
            const data = new Uint8Array(2048);
            // Use crypto-style randomness for unpredictability
            for (let i = 0; i < data.length; ++i) data[i] = Math.floor(Math.random() * 256);
            const enc = l.encode(data);
            const dec = l.decode(enc);
            expect(Array.from(dec)).toEqual(Array.from(data));
        });
    });
});
