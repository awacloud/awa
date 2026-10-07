// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableAvar } from './avar.js';
import { testRuntime } from './_test-runtime.js';
const { parseAvar, applyAvarSegment } = testRuntime.resolve('tableAvar');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableAvar', () => {
    test('module metadata', () => { expect(tableAvar.name).toBe('tableAvar'); });

    test('parses single-axis segment map', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);
        w.writeUint16(0).writeUint16(1);
        // 3 positions: (-1,-1), (0, 0), (1, 1)
        w.writeUint16(3);
        w.writeF2Dot14(-1).writeF2Dot14(-1);
        w.writeF2Dot14(0).writeF2Dot14(0);
        w.writeF2Dot14(1).writeF2Dot14(1);
        const a = parseAvar(w.finalize());
        expect(a.segmentMaps.length).toBe(1);
        expect(a.segmentMaps[0].length).toBe(3);
        // Identity map â†’ applyAvarSegment is identity
        expect(applyAvarSegment(a.segmentMaps[0], 0.5)).toBeCloseTo(0.5, 4);
    });

    test('non-linear segment remaps the midpoint', () => {
        const map = [
            { fromCoord: 0, toCoord: 0 },
            { fromCoord: 1, toCoord: 0.25 }   // weight 700 maps to 25 % of weight range
        ];
        expect(applyAvarSegment(map, 0.5)).toBeCloseTo(0.125, 3);
    });

    test('empty map is identity', () => {
        expect(applyAvarSegment([], 0.42)).toBe(0.42);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(0).writeUint16(0).writeUint16(0);
        expect(() => parseAvar(w.finalize())).toThrow(ParseError);
    });
});
