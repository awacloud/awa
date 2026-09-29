// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { fixedPoint } from './fixed-point.js';

describe('fixedPoint module', () => {

    // ── 1. Metadata ──────────────────────────────────────────────────────────

    test('should have correct module metadata', () => {
        expect(fixedPoint.name).toBe('fixedPoint');
        expect(fixedPoint.dependencies).toEqual([]);
        expect(typeof fixedPoint.factory).toBe('function');
    });

    // ── 2. Factory API shape ─────────────────────────────────────────────────

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const fp = fixedPoint.factory();
            expect(typeof fp.fixed16ToFloat).toBe('function');
            expect(typeof fp.floatToFixed16).toBe('function');
            expect(typeof fp.ufixed16ToFloat).toBe('function');
            expect(typeof fp.floatToUfixed16).toBe('function');
            expect(typeof fp.f2dot14ToFloat).toBe('function');
            expect(typeof fp.floatToF2dot14).toBe('function');
            expect(typeof fp.funitToPx).toBe('function');
            expect(typeof fp.fixedToFloat).toBe('function');
            expect(typeof fp.floatToFixed).toBe('function');
        });
    });

    // ── Shared instance ──────────────────────────────────────────────────────

    let fp;
    beforeEach(() => { fp = fixedPoint.factory(); });

    // ── 3. Fixed16.16 (signed) ───────────────────────────────────────────────

    describe('fixed16ToFloat', () => {
        test('1.5 → 0x00018000', () => {
            expect(fp.fixed16ToFloat(0x00018000)).toBe(1.5);
        });

        test('1.0 → 0x00010000', () => {
            expect(fp.fixed16ToFloat(0x00010000)).toBe(1.0);
        });

        test('sign handling: 0xFFFF0000 → -1.0', () => {
            // Test case 4 from plan
            expect(fp.fixed16ToFloat(0xFFFF0000)).toBe(-1.0);
        });

        test('0 → 0.0', () => {
            expect(fp.fixed16ToFloat(0)).toBe(0.0);
        });

        test('0.5 → 0x00008000', () => {
            expect(fp.fixed16ToFloat(0x00008000)).toBe(0.5);
        });
    });

    describe('floatToFixed16', () => {
        test('1.5 → 0x00018000', () => {
            expect(fp.floatToFixed16(1.5)).toBe(0x00018000);
        });

        test('1.0 → 0x00010000', () => {
            expect(fp.floatToFixed16(1.0)).toBe(0x00010000);
        });

        test('-1.0 → 0xFFFF0000', () => {
            expect(fp.floatToFixed16(-1.0)).toBe(0xFFFF0000);
        });

        test('0.5 → 0x00008000', () => {
            expect(fp.floatToFixed16(0.5)).toBe(0x00008000);
        });

        // Test case 5 - precision
        test('0.1 round-trips coherently', () => {
            const raw = fp.floatToFixed16(0.1);
            expect(typeof raw).toBe('number');
            // Should be close to 0.1 within fixed-point precision (~1.5e-5)
            expect(Math.abs(fp.fixed16ToFloat(raw) - 0.1)).toBeLessThan(1e-4);
        });

        // Test case 6 - range clamping
        test('100000 → clamps to max (no throw by default)', () => {
            const raw = fp.floatToFixed16(100000);
            expect(raw).toBe(0x7FFFFFFF); // max signed int32 unsigned
        });

        test('100000 strict → throws', () => {
            expect(() => fp.floatToFixed16(100000, { strict: true })).toThrow(RangeError);
        });

        // Test case 10 - NaN / Infinity
        test('NaN → 0 by default', () => {
            expect(fp.floatToFixed16(NaN)).toBe(0);
        });

        test('NaN strict → throws', () => {
            expect(() => fp.floatToFixed16(NaN, { strict: true })).toThrow(RangeError);
        });

        test('Infinity → clamps to max by default', () => {
            const raw = fp.floatToFixed16(Infinity);
            expect(raw).toBe(0x7FFFFFFF);
        });
    });

    // ── 4. Fixed16.16 round-trip ─────────────────────────────────────────────

    describe('round-trip Fixed16.16', () => {
        test('floatToFixed16(fixed16ToFloat(0x12345678)) === 0x12345678', () => {
            // Test case 2 from plan
            const raw = 0x12345678;
            expect(fp.floatToFixed16(fp.fixed16ToFloat(raw))).toBe(raw);
        });

        test('round-trip for 0x00000000', () => {
            expect(fp.floatToFixed16(fp.fixed16ToFloat(0x00000000))).toBe(0x00000000);
        });

        test('round-trip for 0x00010000 (1.0)', () => {
            expect(fp.floatToFixed16(fp.fixed16ToFloat(0x00010000))).toBe(0x00010000);
        });

        test('round-trip for 0xFFFF0000 (-1.0)', () => {
            expect(fp.floatToFixed16(fp.fixed16ToFloat(0xFFFF0000))).toBe(0xFFFF0000);
        });
    });

    // ── 5. UFix16.16 (unsigned) ──────────────────────────────────────────────

    describe('ufixed16ToFloat / floatToUfixed16', () => {
        test('1.0 → 0x00010000', () => {
            expect(fp.ufixed16ToFloat(0x00010000)).toBe(1.0);
            expect(fp.floatToUfixed16(1.0)).toBe(0x00010000);
        });

        test('0.5 round-trip', () => {
            expect(fp.ufixed16ToFloat(fp.floatToUfixed16(0.5))).toBeCloseTo(0.5, 4);
        });
    });

    // ── 6. F2Dot14 ───────────────────────────────────────────────────────────

    describe('f2dot14ToFloat', () => {
        test('0x4000 → 1.0', () => {
            expect(fp.f2dot14ToFloat(0x4000)).toBe(1.0);
        });

        test('0x7FFF → 1.99993896484375', () => {
            expect(fp.f2dot14ToFloat(0x7FFF)).toBe(1.99993896484375);
        });

        test('0xC000 → -1.0', () => {
            expect(fp.f2dot14ToFloat(0xC000)).toBe(-1.0);
        });

        test('0x8000 → -2.0', () => {
            expect(fp.f2dot14ToFloat(0x8000)).toBe(-2.0);
        });

        test('0x0000 → 0.0', () => {
            expect(fp.f2dot14ToFloat(0x0000)).toBe(0.0);
        });

        test('0x2000 → 0.5', () => {
            expect(fp.f2dot14ToFloat(0x2000)).toBe(0.5);
        });
    });

    describe('floatToF2dot14', () => {
        test('1.0 → 0x4000', () => {
            expect(fp.floatToF2dot14(1.0)).toBe(0x4000);
        });

        test('-1.0 → 0xC000', () => {
            expect(fp.floatToF2dot14(-1.0)).toBe(0xC000);
        });

        test('0.5 → 0x2000', () => {
            expect(fp.floatToF2dot14(0.5)).toBe(0x2000);
        });

        test('-0.5 → 0xE000', () => {
            // -0.5 * 16384 = -8192 = 0xFFFFE000, masked to 0xE000
            expect(fp.floatToF2dot14(-0.5)).toBe(0xE000);
        });

        test('0.0 → 0x0000', () => {
            expect(fp.floatToF2dot14(0.0)).toBe(0x0000);
        });

        // Test case 7 - boundary
        test('2.0 → 0x7FFF (max representable)', () => {
            expect(fp.floatToF2dot14(2.0)).toBe(0x7FFF);
        });

        test('-2.0 → 0x8000', () => {
            expect(fp.floatToF2dot14(-2.0)).toBe(0x8000);
        });
    });

    // ── 7. F2Dot14 round-trip ────────────────────────────────────────────────

    describe('round-trip F2Dot14', () => {
        const cases = [0, 0.5, -0.5, 1.0, -1.0, -2.0, 1.99993896484375];

        for (const v of cases) {
            test(`round-trip ${v}`, () => {
                const raw = fp.floatToF2dot14(v);
                expect(fp.f2dot14ToFloat(raw)).toBeCloseTo(v, 5);
            });
        }
    });

    // ── 8. funitToPx ─────────────────────────────────────────────────────────

    describe('funitToPx', () => {
        test('funitToPx(1000, 12, 500) → 6', () => {
            // Test case from plan API examples
            expect(fp.funitToPx(1000, 12, 500)).toBe(6);
        });

        test('funitToPx(2048, 16, 1024) → 8.0', () => {
            // Test case 8 from plan
            expect(fp.funitToPx(2048, 16, 1024)).toBe(8.0);
        });

        test('funitToPx(1000, 16, 0) → 0', () => {
            expect(fp.funitToPx(1000, 16, 0)).toBe(0);
        });
    });

    // ── 9. Generic helper fixedToFloat / floatToFixed ────────────────────────

    describe('fixedToFloat', () => {
        // Test case 9 from plan: Fixed8.8 unsigned
        test('fixedToFloat(0x180, 8, 8, false) → 1.5', () => {
            expect(fp.fixedToFloat(0x180, 8, 8, false)).toBe(1.5);
        });

        test('fixedToFloat(0x0100, 8, 8, false) → 1.0', () => {
            expect(fp.fixedToFloat(0x0100, 8, 8, false)).toBe(1.0);
        });

        test('fixedToFloat signed negative', () => {
            // 0xFF00 in Fixed8.8 signed = -1.0
            expect(fp.fixedToFloat(0xFF00, 8, 8, true)).toBe(-1.0);
        });

        test('fixedToFloat defaults to signed=true', () => {
            expect(fp.fixedToFloat(0xFF00, 8, 8)).toBe(-1.0);
        });
    });

    describe('floatToFixed', () => {
        test('1.5 in Fixed8.8 unsigned → 0x180', () => {
            expect(fp.floatToFixed(1.5, 8, 8, false)).toBe(0x180);
        });

        test('-1.0 in Fixed8.8 signed → 0xFF00', () => {
            expect(fp.floatToFixed(-1.0, 8, 8, true)).toBe(0xFF00);
        });

        test('NaN → 0 by default', () => {
            expect(fp.floatToFixed(NaN, 8, 8, true)).toBe(0);
        });

        test('NaN strict → throws', () => {
            expect(() => fp.floatToFixed(NaN, 8, 8, true, { strict: true })).toThrow(RangeError);
        });

        test('out-of-range clamps by default', () => {
            // 1000.0 in Fixed8.8 signed - max is ~127.996
            const raw = fp.floatToFixed(1000.0, 8, 8, true);
            expect(raw).toBe(0x7FFF); // max for 16-bit signed
        });

        test('out-of-range strict → throws', () => {
            expect(() => fp.floatToFixed(1000.0, 8, 8, true, { strict: true })).toThrow(RangeError);
        });
    });
});
