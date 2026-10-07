// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableHmtx } from './hmtx.js';
import { testRuntime } from './_test-runtime.js';
const { parseHmtx, encodeHmtx } = testRuntime.resolve('tableHmtx');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableHmtx', () => {
    test('module metadata', () => { expect(tableHmtx.name).toBe('tableHmtx'); });

    test('roundtrip with full long metrics', () => {
        const metrics = [
            { advanceWidth: 500, lsb: 10 },
            { advanceWidth: 600, lsb: -5 },
            { advanceWidth: 700, lsb: 0 }
        ];
        const { bytes, numberOfHMetrics } = encodeHmtx({ metrics });
        expect(numberOfHMetrics).toBe(3);
        const dec = parseHmtx(bytes, numberOfHMetrics, metrics.length);
        expect(dec.metrics).toEqual(metrics);
    });

    test('trailing equal-advance collapsed', () => {
        const metrics = [
            { advanceWidth: 500, lsb: 10 },
            { advanceWidth: 600, lsb: -5 },
            { advanceWidth: 600, lsb: 0 },
            { advanceWidth: 600, lsb: 7 }
        ];
        const { bytes, numberOfHMetrics } = encodeHmtx({ metrics });
        expect(numberOfHMetrics).toBe(2);
        const dec = parseHmtx(bytes, numberOfHMetrics, metrics.length);
        expect(dec.metrics).toEqual([
            { advanceWidth: 500, lsb: 10 },
            { advanceWidth: 600, lsb: -5 },
            { advanceWidth: 600, lsb: 0 },
            { advanceWidth: 600, lsb: 7 }
        ]);
    });

    test('rejects bad count', () => {
        expect(() => parseHmtx(new Uint8Array(8), 0, 1)).toThrow(ParseError);
        expect(() => parseHmtx(new Uint8Array(8), 5, 2)).toThrow(ParseError);
    });

    test('rejects empty', () => {
        expect(() => encodeHmtx({ metrics: [] })).toThrow(ParseError);
    });

    test('rejects short bytes', () => {
        expect(() => parseHmtx(new Uint8Array(2), 1, 1)).toThrow(ParseError);
    });
});
