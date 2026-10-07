// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontFixed } from './fixed.js';
import { testRuntime } from './_test-runtime.js';
const {
    fixedFromInt32, fixedToInt32,
    f2dot14FromInt16, f2dot14ToInt16,
    decodeVersion16Dot16, encodeVersion16Dot16
} = testRuntime.resolve('fontFixed');

describe('fontFixed', () => {
    test('module metadata', () => {
        expect(fontFixed.name).toBe('fontFixed');
        expect(fontFixed.dependencies).toEqual([]);
        expect(typeof fontFixed.factory).toBe('function');
    });

    test('Fixed 16.16 roundtrip', () => {
        expect(fixedFromInt32(0x00010000)).toBe(1);
        expect(fixedFromInt32(0x00018000)).toBe(1.5);
        expect(fixedToInt32(1)).toBe(0x00010000);
        expect(fixedToInt32(-1)).toBe(-0x00010000);
        expect(fixedFromInt32(fixedToInt32(0.75))).toBeCloseTo(0.75, 5);
    });

    test('F2Dot14 roundtrip', () => {
        expect(f2dot14FromInt16(0x4000)).toBe(1);
        expect(f2dot14FromInt16(-0x4000)).toBe(-1);
        expect(f2dot14ToInt16(1)).toBe(0x4000);
        expect(f2dot14ToInt16(-1)).toBe(-0x4000);
        expect(f2dot14ToInt16(2)).toBe(32767);    // clamp
        expect(f2dot14ToInt16(-2)).toBe(-32768);
    });

    test('version 16.16 split', () => {
        const v = encodeVersion16Dot16(1, 0);
        expect(v).toBe(0x00010000);
        expect(decodeVersion16Dot16(v)).toEqual({ major: 1, minor: 0 });
        expect(decodeVersion16Dot16(0x00050000)).toEqual({ major: 5, minor: 0 });
    });
});
