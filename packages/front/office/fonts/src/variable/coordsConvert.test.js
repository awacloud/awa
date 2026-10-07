// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { varCoordsConvert } from './coordsConvert.js';
import { testRuntime } from './_test-runtime.js';
const { normaliseAxisValue, normaliseAxesCoords } = testRuntime.resolve('varCoordsConvert');

describe('varCoordsConvert', () => {
    test('module metadata', () => { expect(varCoordsConvert.name).toBe('varCoordsConvert'); });

    const wght = { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 };

    test('default → 0', () => {
        expect(normaliseAxisValue(400, wght)).toBe(0);
    });

    test('above default normalises positively', () => {
        expect(normaliseAxisValue(700, wght)).toBeCloseTo((700 - 400) / (900 - 400), 4);
    });

    test('below default normalises negatively', () => {
        expect(normaliseAxisValue(200, wght)).toBeCloseTo((200 - 400) / (400 - 100), 4);
    });

    test('clamps to ±1', () => {
        expect(normaliseAxisValue(99999, wght)).toBe(1);
        expect(normaliseAxisValue(-99999, wght)).toBe(-1);
    });

    test('normaliseAxesCoords respects fvar order', () => {
        const wdth = { tag: 'wdth', minValue: 75, defaultValue: 100, maxValue: 125 };
        const coords = normaliseAxesCoords({ wght: 700, wdth: 110 }, [wght, wdth]);
        expect(coords.length).toBe(2);
        expect(coords[0]).toBeGreaterThan(0);
        expect(coords[1]).toBeGreaterThan(0);
    });

    test('missing axis falls back to default', () => {
        const coords = normaliseAxesCoords({}, [wght]);
        expect(coords[0]).toBe(0);
    });
});
