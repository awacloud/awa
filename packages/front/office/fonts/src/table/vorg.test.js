// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableVorg } from './vorg.js';
import { testRuntime } from './_test-runtime.js';
const { parseVorg, encodeVorg } = testRuntime.resolve('tableVorg');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableVorg', () => {
    test('module metadata', () => { expect(tableVorg.name).toBe('tableVorg'); });

    test('roundtrip with default + 2 overrides', () => {
        const v = {
            majorVersion: 1, minorVersion: 0,
            defaultVertOriginY: 880,
            metrics: [
                { glyphIndex: 10, vertOriginY: 900 },
                { glyphIndex: 20, vertOriginY: 850 }
            ]
        };
        const enc = encodeVorg(v);
        const dec = parseVorg(enc);
        expect(dec.defaultVertOriginY).toBe(880);
        expect(dec.verticalOrigin(10)).toBe(900);
        expect(dec.verticalOrigin(20)).toBe(850);
        expect(dec.verticalOrigin(99)).toBe(880);   // default
    });

    test('rejects bad version', () => {
        const enc = encodeVorg({ majorVersion: 9, defaultVertOriginY: 0, metrics: [] });
        expect(() => parseVorg(enc)).toThrow(ParseError);
    });
});
