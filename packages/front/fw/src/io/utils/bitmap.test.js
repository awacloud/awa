// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { bitmap } from './bitmap.js';

describe('bitmap module', () => {
    test('should have correct module metadata', () => {
        expect(bitmap.name).toBe('bitmap');
        expect(bitmap.version).toBe('1.0.0');
        expect(bitmap.type).toBe('fw.io.utils');
        expect(bitmap.dependencies).toEqual([]);
        expect(typeof bitmap.factory).toBe('function');
    });

    describe('factory', () => {
        let api;

        beforeEach(() => {
            api = bitmap.factory();
        });

        test('should create helper API', () => {
            expect(api).toBeDefined();
            expect(typeof api.bytesToBits).toBe('function');
            expect(typeof api.bitsToBytes).toBe('function');
            expect(typeof api.padBitsToByte).toBe('function');
        });

        test('bytesToBits should be LSB-first per byte', () => {
            const bits = api.bytesToBits(new Uint8Array([3]));
            expect(bits).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
        });

        test('bytesToBits should handle empty input', () => {
            expect(api.bytesToBits(new Uint8Array([]))).toEqual([]);
        });

        test('bytesToBits should append to provided ret', () => {
            const ret = [9];
            api.bytesToBits(new Uint8Array([1]), ret);
            expect(ret).toEqual([9, 1, 0, 0, 0, 0, 0, 0, 0]);
        });

        test('bitsToBytes should invert bytesToBits for full bytes', () => {
            const src = new Uint8Array([0, 1, 2, 3, 255]);
            const bits = api.bytesToBits(src);
            const out = api.bitsToBytes(bits, true);
            expect(out).toEqual(src);
        });

        test('bitsToBytes should handle empty input', () => {
            const out = api.bitsToBytes([]);
            expect(out).toEqual(new Uint8Array(0));
        });

        test('padBitsToByte should extend to a multiple of 8', () => {
            const bits = [1, 0, 1, 1, 0];
            api.padBitsToByte(bits);
            expect(bits.length % 8).toBe(0);
            expect(bits.slice(0, 5)).toEqual([1, 0, 1, 1, 0]);
            expect(bits.slice(5)).toEqual([0, 0, 0]);
        });

        test('padBitsToByte should honour the fill parameter', () => {
            const bits = [1, 0, 1, 1, 0];
            api.padBitsToByte(bits, 1);
            expect(bits.length).toBe(8);
            expect(bits.slice(5)).toEqual([1, 1, 1]);
        });

        test('padBitsToByte should no-op when already a multiple of 8', () => {
            const bits = [1, 0, 1, 1, 0, 0, 0, 0];
            api.padBitsToByte(bits, 1);
            expect(bits.length).toBe(8);
            expect(bits).toEqual([1, 0, 1, 1, 0, 0, 0, 0]);
        });

        test('bitsToBytes should throw when validateLength and not multiple of 8', () => {
            const bits = [1, 0, 1, 1, 0];
            expect(() => api.bitsToBytes(bits, true)).toThrow(
                'bitsToBytes expects a bit array length that is a multiple of 8'
            );
        });

        test('round-trip via padBitsToByte preserves leading bits', () => {
            const src = [1, 0, 1, 1, 0];
            const padded = api.padBitsToByte(src.slice());
            const bytes = api.bitsToBytes(padded, true);
            const back = api.bytesToBits(bytes);
            expect(back.slice(0, 5)).toEqual(src);
        });
    });
});
