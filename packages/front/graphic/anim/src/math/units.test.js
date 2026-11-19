// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { unitsModule } from './units.js';

describe('graphic.units descriptor', () => {
    test('descriptor shape is correct', () => {
        expect(unitsModule.name).toBe('graphic.units');
        expect(unitsModule.type).toBe('lib.graphic.math');
        expect(unitsModule.version).toBe('0.1.0');
        expect(unitsModule.dependencies).toEqual([]);
        expect(unitsModule.deps).toEqual([]);
        expect(typeof unitsModule.factory).toBe('function');
    });

    test('dependencies.length === 0', () => {
        expect(unitsModule.dependencies.length).toBe(0);
    });
});

describe('units (resolved via factory())', () => {
    const units = unitsModule.factory();

    describe('split', () => {
        test('"50px" → { value: 50, unit: "px" }', () => {
            expect(units.split('50px')).toEqual({ value: 50, unit: 'px' });
        });

        test('"2rem" → { value: 2, unit: "rem" }', () => {
            expect(units.split('2rem')).toEqual({ value: 2, unit: 'rem' });
        });

        test('"0" → { value: 0, unit: "" }', () => {
            expect(units.split('0')).toEqual({ value: 0, unit: '' });
        });

        test('".5em" → { value: 0.5, unit: "em" }', () => {
            expect(units.split('.5em')).toEqual({ value: 0.5, unit: 'em' });
        });

        test('"1e3px" (scientific notation) → { value: 1000, unit: "px" }', () => {
            expect(units.split('1e3px')).toEqual({ value: 1000, unit: 'px' });
        });

        test('bare number → { value, unit: "" }', () => {
            expect(units.split(42)).toEqual({ value: 42, unit: '' });
        });

        test('"100%" → { value: 100, unit: "%" }', () => {
            expect(units.split('100%')).toEqual({ value: 100, unit: '%' });
        });

        test('throws on unparseable string "abc"', () => {
            expect(() => units.split('abc')).toThrow();
        });

        test('throws on empty string ""', () => {
            expect(() => units.split('')).toThrow();
        });
    });

    describe('format', () => {
        test('format(50, "px") → "50px"', () => {
            expect(units.format(50, 'px')).toBe('50px');
        });

        test('format(0, "") → "0"', () => {
            expect(units.format(0, '')).toBe('0');
        });

        test('rounds to 1e-6 precision', () => {
            // 1/3 rounded to 6 decimal places is 0.333333
            const result = units.format(1 / 3, 'rem');
            expect(result).toBe('0.333333rem');
        });

        test('format(0.1 + 0.2, "px") strips floating-point noise', () => {
            // 0.1 + 0.2 = 0.30000000000000004 in JS; rounded to 1e-6 → 0.3
            const result = units.format(0.1 + 0.2, 'px');
            expect(result).toBe('0.3px');
        });

        test('format with empty unit returns bare number string', () => {
            expect(units.format(100, '')).toBe('100');
        });
    });

    describe('round-trip', () => {
        test('split → format preserves value', () => {
            const { value, unit } = units.split('75.5vh');
            expect(units.format(value, unit)).toBe('75.5vh');
        });
    });
});
