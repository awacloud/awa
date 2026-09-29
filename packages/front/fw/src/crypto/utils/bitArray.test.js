// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { bitArray } from './bitArray.js';

describe('bitArray module', () => {

    test('has correct module metadata', () => {
        expect(bitArray.name).toBe('bitArray');
        expect(bitArray.dependencies).toEqual([]);
        expect(typeof bitArray.factory).toBe('function');
    });

    describe('factory', () => {
        const ba = bitArray.factory();

        test('returns an object with all expected methods', () => {
            expect(typeof ba.ba_to_ui8).toBe('function');
            expect(typeof ba.ui8_to_ba).toBe('function');
            expect(typeof ba.bitSlice).toBe('function');
            expect(typeof ba.extract).toBe('function');
            expect(typeof ba.concat).toBe('function');
            expect(typeof ba.bitLength).toBe('function');
            expect(typeof ba.clamp).toBe('function');
            expect(typeof ba.partial).toBe('function');
            expect(typeof ba.getPartial).toBe('function');
            expect(typeof ba.equal).toBe('function');
            expect(typeof ba.byteswapM).toBe('function');
        });

        // ── bitLength ────────────────────────────────────────────────────────────

        describe('bitLength', () => {
            test('empty array returns 0', () => {
                expect(ba.bitLength([])).toBe(0);
            });

            test('single full 32-bit word returns 32', () => {
                expect(ba.bitLength([0xFFFFFFFF])).toBe(32);
            });

            test('two full words return 64', () => {
                expect(ba.bitLength([0xFFFFFFFF, 0xFFFFFFFF])).toBe(64);
            });

            test('partial word encodes its bit count', () => {
                const partial = ba.partial(8, 0xAB);
                expect(ba.bitLength([partial])).toBe(8);
            });
        });

        // ── partial / getPartial ─────────────────────────────────────────────────

        describe('partial / getPartial', () => {
            test('partial(32, x) returns x unchanged', () => {
                expect(ba.partial(32, 0x12345678)).toBe(0x12345678);
            });

            test('getPartial on full word returns 32', () => {
                expect(ba.getPartial(0x00000000)).toBe(32);
                expect(ba.getPartial(0xFFFFFFFF)).toBe(32);
            });

            test('partial(16, x) encodes 16 bits; getPartial recovers 16', () => {
                const p = ba.partial(16, 0xABCD);
                expect(ba.getPartial(p)).toBe(16);
            });

            test('partial(1, 1) encodes 1 bit', () => {
                const p = ba.partial(1, 1);
                expect(ba.getPartial(p)).toBe(1);
            });
        });

        // ── ui8_to_ba / ba_to_ui8 roundtrip ─────────────────────────────────────

        describe('ba_to_ui8 and ui8_to_ba', () => {
            test('ba_to_ui8 returns a Uint8Array', () => {
                expect(ba.ba_to_ui8(ba.ui8_to_ba(new Uint8Array([1, 2, 3])))).toBeInstanceOf(Uint8Array);
            });

            test('empty array roundtrips', () => {
                const ui8 = new Uint8Array([]);
                expect(ba.ba_to_ui8(ba.ui8_to_ba(ui8))).toEqual(ui8);
            });

            test('single byte roundtrips', () => {
                const ui8 = new Uint8Array([0xAB]);
                expect(ba.ba_to_ui8(ba.ui8_to_ba(ui8))).toEqual(ui8);
            });

            test('4 bytes (one full word) roundtrip', () => {
                const ui8 = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
                expect(ba.ba_to_ui8(ba.ui8_to_ba(ui8))).toEqual(ui8);
            });

            test('5 bytes (partial last word) roundtrip', () => {
                const ui8 = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
                expect(ba.ba_to_ui8(ba.ui8_to_ba(ui8))).toEqual(ui8);
            });

            test('8 bytes (two full words) roundtrip', () => {
                const ui8 = new Uint8Array([0xFF, 0xEE, 0xDD, 0xCC, 0xBB, 0xAA, 0x99, 0x88]);
                expect(ba.ba_to_ui8(ba.ui8_to_ba(ui8))).toEqual(ui8);
            });

            test('all-zero bytes roundtrip', () => {
                const ui8 = new Uint8Array(12);
                expect(ba.ba_to_ui8(ba.ui8_to_ba(ui8))).toEqual(ui8);
            });

            test('all-0xFF bytes roundtrip', () => {
                const ui8 = new Uint8Array(12).fill(0xFF);
                expect(ba.ba_to_ui8(ba.ui8_to_ba(ui8))).toEqual(ui8);
            });
        });

        // ── concat ───────────────────────────────────────────────────────────────

        describe('concat', () => {
            test('concat of two empty arrays is empty', () => {
                expect(ba.concat([], [])).toEqual([]);
            });

            test('concat of empty and non-empty returns non-empty', () => {
                const arr = ba.ui8_to_ba(new Uint8Array([0xAB]));
                expect(ba.bitLength(ba.concat([], arr))).toBe(8);
            });

            test('concat of non-empty and empty returns original length', () => {
                const arr = ba.ui8_to_ba(new Uint8Array([0xAB]));
                expect(ba.bitLength(ba.concat(arr, []))).toBe(8);
            });

            test('concatenates two 1-byte arrays to a 2-byte array', () => {
                const a = ba.ui8_to_ba(new Uint8Array([0x12]));
                const b = ba.ui8_to_ba(new Uint8Array([0x34]));
                const combined = ba.concat(a, b);
                expect(ba.bitLength(combined)).toBe(16);
                const result = ba.ba_to_ui8(combined);
                expect(result[0]).toBe(0x12);
                expect(result[1]).toBe(0x34);
            });

            test('concat then ba_to_ui8 recovers original bytes', () => {
                const bytes1 = new Uint8Array([0x12, 0x34]);
                const bytes2 = new Uint8Array([0x56, 0x78]);
                const combined = ba.concat(ba.ui8_to_ba(bytes1), ba.ui8_to_ba(bytes2));
                expect(ba.ba_to_ui8(combined)).toEqual(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
            });

            test('concatenates two full-word arrays', () => {
                const a = ba.ui8_to_ba(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
                const b = ba.ui8_to_ba(new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]));
                const result = ba.ba_to_ui8(ba.concat(a, b));
                expect(result).toEqual(new Uint8Array([0x11, 0x22, 0x33, 0x44, 0xAA, 0xBB, 0xCC, 0xDD]));
            });
        });

        // ── bitSlice ─────────────────────────────────────────────────────────────

        describe('bitSlice', () => {
            test('slices the first byte from a 2-byte array', () => {
                const arr = ba.ui8_to_ba(new Uint8Array([0xAB, 0xCD]));
                const sliced = ba.bitSlice(arr, 0, 8);
                expect(ba.bitLength(sliced)).toBe(8);
                expect(ba.ba_to_ui8(sliced)[0]).toBe(0xAB);
            });

            test('slices the second byte from a 2-byte array', () => {
                const arr = ba.ui8_to_ba(new Uint8Array([0xAB, 0xCD]));
                const sliced = ba.bitSlice(arr, 8, 16);
                expect(ba.ba_to_ui8(sliced)[0]).toBe(0xCD);
            });

            test('slice to end when bend is undefined', () => {
                const arr = ba.ui8_to_ba(new Uint8Array([0xAA, 0xBB, 0xCC]));
                const sliced = ba.bitSlice(arr, 8);
                expect(ba.bitLength(sliced)).toBe(16);
                const result = ba.ba_to_ui8(sliced);
                expect(result[0]).toBe(0xBB);
                expect(result[1]).toBe(0xCC);
            });

            test('slicing full array returns equivalent content', () => {
                const original = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
                const arr = ba.ui8_to_ba(original);
                const sliced = ba.bitSlice(arr, 0, 32);
                expect(ba.ba_to_ui8(sliced)).toEqual(original);
            });
        });

        // ── clamp ────────────────────────────────────────────────────────────────

        describe('clamp', () => {
            test('clamp to 8 bits from 16-bit array preserves first byte', () => {
                const arr = ba.ui8_to_ba(new Uint8Array([0xFF, 0x00]));
                const clamped = ba.clamp(arr, 8);
                expect(ba.bitLength(clamped)).toBe(8);
                expect(ba.ba_to_ui8(clamped)[0]).toBe(0xFF);
            });

            test('is a no-op when requested length exceeds word capacity', () => {
                // 4 bytes = 32 bits = 1 full word; requesting 40 bits > 32-bit capacity
                const arr = ba.ui8_to_ba(new Uint8Array([0xAB, 0xCD, 0xEF, 0x01]));
                const original = arr.slice();
                const clamped = ba.clamp(arr, 40);
                expect(clamped).toEqual(original);
            });

            test('clamp to 0 bits returns empty-ish array', () => {
                const arr = ba.ui8_to_ba(new Uint8Array([0xFF]));
                const clamped = ba.clamp(arr, 0);
                expect(ba.bitLength(clamped)).toBe(0);
            });
        });

        // ── equal ────────────────────────────────────────────────────────────────

        describe('equal', () => {
            test('two empty arrays are equal', () => {
                expect(ba.equal([], [])).toBe(true);
            });

            test('identical arrays are equal', () => {
                const a = ba.ui8_to_ba(new Uint8Array([1, 2, 3, 4]));
                const b = ba.ui8_to_ba(new Uint8Array([1, 2, 3, 4]));
                expect(ba.equal(a, b)).toBe(true);
            });

            test('arrays with differing last byte are not equal', () => {
                const a = ba.ui8_to_ba(new Uint8Array([1, 2, 3, 4]));
                const b = ba.ui8_to_ba(new Uint8Array([1, 2, 3, 5]));
                expect(ba.equal(a, b)).toBe(false);
            });

            test('arrays of different lengths are not equal', () => {
                const a = ba.ui8_to_ba(new Uint8Array([1, 2]));
                const b = ba.ui8_to_ba(new Uint8Array([1, 2, 3]));
                expect(ba.equal(a, b)).toBe(false);
            });

            test('equal is constant-time: comparing against itself returns true', () => {
                const arr = ba.ui8_to_ba(new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]));
                expect(ba.equal(arr, arr)).toBe(true);
            });
        });

        // ── extract ──────────────────────────────────────────────────────────────

        describe('extract', () => {
            test('extracts the top 8 bits of a 32-bit word', () => {
                const arr = [0xAB000000 | 0]; // 0xAB in the top byte
                expect(ba.extract(arr, 0, 8)).toBe(0xAB);
            });

            test('extracts bits from the middle of a word', () => {
                // 0xFF00FF00: bits 8..15 = 0x00
                const arr = [0xFF00FF00 | 0];
                expect(ba.extract(arr, 8, 8)).toBe(0x00);
            });

            test('extracts 4-bit nibble', () => {
                // Top nibble of 0xA0000000 = 0xA
                const arr = [0xA0000000 | 0];
                expect(ba.extract(arr, 0, 4)).toBe(0xA);
            });

            test('extracts across word boundary', () => {
                // Two words: 0x000000AB 0xCD000000
                // Bits 24..39 span the boundary: AB CD
                const a = ba.ui8_to_ba(new Uint8Array([0x00, 0x00, 0x00, 0xAB, 0xCD]));
                const extracted = ba.extract(a, 24, 16);
                expect(extracted).toBe(0xABCD);
            });
        });

        // ── byteswapM ────────────────────────────────────────────────────────────

        describe('byteswapM', () => {
            test('swaps bytes within a single 32-bit word in-place', () => {
                const arr = [0x12345678];
                ba.byteswapM(arr);
                expect(arr[0]).toBe(0x78563412);
            });

            test('handles multiple words', () => {
                const arr = [0x12345678, 0xABCDEF01 | 0];
                ba.byteswapM(arr);
                expect(arr[0]).toBe(0x78563412);
                expect(arr[1]).toBe(0x01EFCDAB);
            });

            test('double swap restores original value', () => {
                const original = 0x12345678;
                const arr = [original];
                ba.byteswapM(arr);
                ba.byteswapM(arr);
                expect(arr[0]).toBe(original);
            });

            test('returns the same array reference', () => {
                const arr = [0x12345678];
                const ret = ba.byteswapM(arr);
                expect(ret).toBe(arr);
            });
        });

        // ── factory isolation ────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('multiple factory calls return independent instances', () => {
                const ba1 = bitArray.factory();
                const ba2 = bitArray.factory();
                expect(ba1).not.toBe(ba2);
            });
        });
    });
});
