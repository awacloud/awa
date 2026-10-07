// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableVmtx } from './vmtx.js';
import { testRuntime } from './_test-runtime.js';
const { parseVmtx, encodeVmtx } = testRuntime.resolve('tableVmtx');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableVmtx', () => {
    test('module metadata', () => { expect(tableVmtx.name).toBe('tableVmtx'); });

    test('roundtrip 3 long records', () => {
        const m = [
            { advanceHeight: 1000, tsb: 50 },
            { advanceHeight: 1100, tsb: 30 },
            { advanceHeight: 900,  tsb: 10 }
        ];
        const { bytes, numOfLongVerMetrics } = encodeVmtx({ metrics: m });
        expect(numOfLongVerMetrics).toBe(3);
        const r = parseVmtx(bytes, numOfLongVerMetrics, m.length);
        expect(r.metrics).toEqual(m);
    });

    test('collapses trailing equal advanceHeight', () => {
        const m = [
            { advanceHeight: 1000, tsb: 50 },
            { advanceHeight: 1100, tsb: 30 },
            { advanceHeight: 1100, tsb: 20 },
            { advanceHeight: 1100, tsb: 10 }
        ];
        const { bytes, numOfLongVerMetrics } = encodeVmtx({ metrics: m });
        expect(numOfLongVerMetrics).toBe(2);
        const r = parseVmtx(bytes, numOfLongVerMetrics, m.length);
        expect(r.metrics).toEqual(m);
    });

    test('rejects bad count', () => {
        expect(() => parseVmtx(new Uint8Array(4), 0, 1)).toThrow(ParseError);
    });
});
