// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { stats } from './stats.js';

describe('stats module', () => {
    test('should have correct module metadata', () => {
        expect(stats.name).toBe('stats');
        expect(stats.dependencies).toEqual([]);
        expect(typeof stats.factory).toBe('function');
    });

    describe('factory', () => {
        const s = stats.factory();
        const arr = [1, 2, 3, 4, 5];

        test('mean', () => expect(s.mean(arr)).toBe(3));
        test('mean([]) throws', () => expect(() => s.mean([])).toThrow('stats: empty array'));
        test('mean with NaN throws', () => expect(() => s.mean([1, NaN, 3])).toThrow('stats: NaN in input'));

        test('median odd', () => expect(s.median([1, 3, 2])).toBe(2));
        test('median even', () => expect(s.median([1, 2, 3, 4])).toBe(2.5));

        test('mode', () => expect(s.mode([1, 2, 2, 3])).toBe(2));

        test('min / max', () => {
            expect(s.min(arr)).toBe(1);
            expect(s.max(arr)).toBe(5);
        });

        test('sum', () => expect(s.sum(arr)).toBe(15));
        test('product', () => expect(s.product([1, 2, 3, 4])).toBe(24));
        test('range', () => expect(s.range(arr)).toBe(4));

        test('variance population', () => expect(s.variance(arr)).toBe(2));
        test('variance sample', () => expect(s.variance(arr, true)).toBe(2.5));
        test('stddev = sqrt(variance)', () => expect(s.stddev(arr)).toBeCloseTo(Math.sqrt(2)));

        test('quantile 0.5 type 7', () => {
            const a = Array.from({length: 100}, (_, i) => i + 1);
            expect(s.quantile(a, 0.5)).toBeCloseTo(50.5);
        });

        test('quantile 0.25 type 7', () => {
            const a = Array.from({length: 100}, (_, i) => i + 1);
            expect(s.quantile(a, 0.25)).toBeCloseTo(25.75);
        });

        test('quantile extremes', () => {
            expect(s.quantile([1, 2, 3], 0)).toBe(1);
            expect(s.quantile([1, 2, 3], 1)).toBe(3);
        });

        test('percentile', () => expect(s.percentile([1,2,3,4,5], 50)).toBe(3));

        test('iqr', () => {
            const a = [1,2,3,4,5,6,7,8,9,10];
            expect(s.iqr(a)).toBeGreaterThan(0);
        });

        test('mad', () => {
            const a = [1, 2, 3, 4, 5];
            expect(s.mad(a)).toBe(1);
        });

        test('histogram fixed bins', () => {
            const a = [1, 2, 2, 3, 3, 3];
            const { counts } = s.histogram(a, 3);
            expect(counts.length).toBe(3);
            expect(counts.reduce((a, b) => a + b, 0)).toBe(6);
        });

        test('histogram explicit edges', () => {
            const a = [1, 3, 6, 8];
            const { edges, counts } = s.histogram(a, [0, 5, 10]);
            expect(edges).toEqual([0, 5, 10]);
            expect(counts.length).toBe(2);
            expect(counts[0]).toBe(2); // 1,3 in [0,5)
            expect(counts[1]).toBe(2); // 6,8 in [5,10]
        });

        test('zscore of mean ≈ 0', () => {
            expect(Math.abs(s.zscore(s.mean(arr), arr))).toBeLessThan(1e-10);
        });

        test('normalize [0,5,10] → [0, 0.5, 1]', () => {
            const result = s.normalize([0, 5, 10]);
            expect(result).toEqual([0, 0.5, 1]);
        });

        test('standardize: mean post ≈ 0, stddev post ≈ 1', () => {
            const result = s.standardize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            const m = s.mean(result);
            const sd = s.stddev(result);
            expect(Math.abs(m)).toBeLessThan(1e-10);
            expect(Math.abs(sd - 1)).toBeLessThan(1e-10);
        });

        test('geomean', () => expect(s.geomean([1, 4, 16])).toBeCloseTo(4));
        test('harmean', () => expect(s.harmean([1, 2, 4])).toBeCloseTo(12 / 7));
    });
});
