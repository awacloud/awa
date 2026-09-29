// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { ui8 } from './ui8.js';

describe('ui8 module', () => {
    test('should have correct module metadata', () => {
        expect(ui8.name).toBe('ui8');
        expect(ui8.version).toBe('1.0.0');
        expect(ui8.type).toBe('fw.io.utils');
        expect(ui8.dependencies).toEqual([]);
        expect(typeof ui8.factory).toBe('function');
    });

    describe('factory', () => {
        let api;

        beforeEach(() => {
            api = ui8.factory();
        });

        test('should create helper API', () => {
            expect(api).toBeDefined();
            expect(typeof api.equal).toBe('function');
            expect(typeof api.join).toBe('function');
            expect(typeof api.concat).toBe('function');
        });

        test('join should concatenate two arrays', () => {
            const a = new Uint8Array([1, 2]);
            const b = new Uint8Array([3, 4]);
            const out = api.join(a, b);
            expect(out).toBeInstanceOf(Uint8Array);
            expect(out).toEqual(new Uint8Array([1, 2, 3, 4]));
        });

        test('join should handle empty arrays', () => {
            const a = new Uint8Array([]);
            const b = new Uint8Array([1, 2]);
            expect(api.join(a, b)).toEqual(new Uint8Array([1, 2]));
            expect(api.join(b, a)).toEqual(new Uint8Array([1, 2]));
            expect(api.join(a, a)).toEqual(new Uint8Array([]));
        });

        test('concat should concatenate an array of arrays', () => {
            const a = new Uint8Array([1]);
            const b = new Uint8Array([2, 3]);
            const c = new Uint8Array([4]);
            const out = api.concat([a, b, c]);
            expect(out).toBeInstanceOf(Uint8Array);
            expect(out).toEqual(new Uint8Array([1, 2, 3, 4]));
        });

        test('concat should return empty Uint8Array for empty input', () => {
            const out = api.concat([]);
            expect(out).toBeInstanceOf(Uint8Array);
            expect(out.length).toBe(0);
        });

        test('concat should handle single-element array', () => {
            const a = new Uint8Array([7, 8, 9]);
            const out = api.concat([a]);
            expect(out).toEqual(new Uint8Array([7, 8, 9]));
            // distinct allocation
            expect(out).not.toBe(a);
        });

        test('equal should compare byte equality', () => {
            const a = new Uint8Array([1, 2, 3]);
            const b = new Uint8Array([1, 2, 3]);
            const c = new Uint8Array([1, 2, 4]);
            expect(api.equal(a, b)).toBe(true);
            expect(api.equal(a, c)).toBe(false);
        });

        test('equal should return false for different lengths', () => {
            const a = new Uint8Array([1, 2, 3]);
            const b = new Uint8Array([1, 2]);
            expect(api.equal(a, b)).toBe(false);
        });

        test('equal should handle two empty arrays', () => {
            expect(api.equal(new Uint8Array([]), new Uint8Array([]))).toBe(true);
        });

        test('equal should compare subarray views with different byteOffsets', () => {
            const buf = new Uint8Array([0, 1, 2, 3, 4, 5]);
            const view1 = buf.subarray(1, 4); // [1,2,3]
            const view2 = new Uint8Array([1, 2, 3]);
            expect(api.equal(view1, view2)).toBe(true);
            const view3 = buf.subarray(2, 5); // [2,3,4]
            expect(api.equal(view1, view3)).toBe(false);
        });
    });
});
