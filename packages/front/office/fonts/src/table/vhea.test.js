// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableVhea } from './vhea.js';
import { testRuntime } from './_test-runtime.js';
const { parseVhea, encodeVhea } = testRuntime.resolve('tableVhea');
const { ParseError } = testRuntime.resolve('fontErrors');

const sample = {
    majorVersion: 1, minorVersion: 0,
    ascender: 1024, descender: -1024, lineGap: 0,
    advanceHeightMax: 2048,
    minTopSideBearing: 0, minBottomSideBearing: 0,
    yMaxExtent: 2048,
    caretSlopeRise: 0, caretSlopeRun: 1, caretOffset: 0,
    metricDataFormat: 0, numOfLongVerMetrics: 500
};

describe('tableVhea', () => {
    test('module metadata', () => { expect(tableVhea.name).toBe('tableVhea'); });
    test('roundtrip', () => {
        const enc = encodeVhea(sample);
        expect(enc.length).toBe(36);
        expect(parseVhea(enc)).toEqual(sample);
    });
    test('rejects short', () => { expect(() => parseVhea(new Uint8Array(8))).toThrow(ParseError); });
});
