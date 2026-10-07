// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableHhea } from './hhea.js';
import { testRuntime } from './_test-runtime.js';
const { parseHhea, encodeHhea } = testRuntime.resolve('tableHhea');
const { ParseError } = testRuntime.resolve('fontErrors');

const sample = {
    majorVersion: 1, minorVersion: 0,
    ascender: 1900, descender: -500, lineGap: 0,
    advanceWidthMax: 2300,
    minLeftSideBearing: -500, minRightSideBearing: -700,
    xMaxExtent: 2800,
    caretSlopeRise: 1, caretSlopeRun: 0, caretOffset: 0,
    metricDataFormat: 0, numberOfHMetrics: 500
};

describe('tableHhea', () => {
    test('module metadata', () => { expect(tableHhea.name).toBe('tableHhea'); });
    test('roundtrip', () => {
        const enc = encodeHhea(sample);
        expect(enc.length).toBe(36);
        expect(parseHhea(enc)).toEqual(sample);
    });
    test('rejects short', () => {
        expect(() => parseHhea(new Uint8Array(20))).toThrow(ParseError);
    });
});
