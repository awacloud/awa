// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { varInstance } from './instance.js';
const { ContractError } = testRuntime.resolve('fontErrors');
import { testRuntime } from './_test-runtime.js';
const { axisScalar, tupleScalar, applyGvarDeltas } = testRuntime.resolve('varInstance');

describe('varInstance', () => {
    test('module metadata', () => { expect(varInstance.name).toBe('varInstance'); });

    test('axisScalar at peak returns 1', () => {
        expect(axisScalar(0.5, 0.5)).toBe(1);
    });

    test('axisScalar at peak=0 always returns 1', () => {
        expect(axisScalar(0, 0.3)).toBe(1);
    });

    test('axisScalar triangle ramp positive', () => {
        // peak=1, coord=0.5 â†’ 0.5
        expect(axisScalar(1, 0.5)).toBeCloseTo(0.5, 4);
        // outside [0..peak] â†’ 0
        expect(axisScalar(1, -0.5)).toBe(0);
        expect(axisScalar(1, 0)).toBe(0);
    });

    test('axisScalar with intermediate range', () => {
        // intermStart=-1, peak=0.5, intermEnd=1 ; at coord=0 -> linear ramp 0 â†’ 0.5
        expect(axisScalar(0.5, 0, -1, 1)).toBeCloseTo(0.6666666, 4);
        // at coord beyond intermEnd â†’ 0
        expect(axisScalar(0.5, 1.5, -1, 1)).toBe(0);
    });

    test('tupleScalar multiplies per-axis', () => {
        const peak = [1, 1];
        const coord = [0.5, 0.5];
        expect(tupleScalar(peak, coord)).toBeCloseTo(0.25, 4);
    });

    test('tupleScalar short-circuits on 0', () => {
        const peak = [1, 1];
        const coord = [0.5, -0.5];   // second axis out of range
        expect(tupleScalar(peak, coord)).toBe(0);
    });

    test('tupleScalar rejects mismatched lengths', () => {
        expect(() => tupleScalar([1, 1], [0.5])).toThrow(ContractError);
    });

    test('applyGvarDeltas updates points in place', () => {
        const glyph = { points: [{ x: 0, y: 0, onCurve: true }, { x: 100, y: 0, onCurve: true }] };
        applyGvarDeltas(glyph, { pointNumbers: [], deltaX: [10, -5], deltaY: [3, 4] }, 0.5);
        expect(glyph.points[0]).toEqual({ x: 5, y: 1.5, onCurve: true });
        expect(glyph.points[1]).toEqual({ x: 97.5, y: 2, onCurve: true });
    });

    test('applyGvarDeltas with point indices', () => {
        const glyph = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 }] };
        applyGvarDeltas(glyph, { pointNumbers: [2], deltaX: [20], deltaY: [10] }, 1);
        expect(glyph.points[2]).toEqual({ x: 70, y: 60 });
        expect(glyph.points[0]).toEqual({ x: 0, y: 0 });
    });

    test('applyGvarDeltas with scalar=0 is no-op', () => {
        const glyph = { points: [{ x: 1, y: 2 }] };
        applyGvarDeltas(glyph, { pointNumbers: [], deltaX: [100], deltaY: [100] }, 0);
        expect(glyph.points[0]).toEqual({ x: 1, y: 2 });
    });
});
