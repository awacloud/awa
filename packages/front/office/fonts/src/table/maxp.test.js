// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableMaxp } from './maxp.js';
import { testRuntime } from './_test-runtime.js';
const { parseMaxp, encodeMaxp, MAXP_V0_5, MAXP_V1_0 } = testRuntime.resolve('tableMaxp');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableMaxp', () => {
    test('module metadata', () => {
        expect(tableMaxp.name).toBe('tableMaxp');
    });

    test('v0.5 roundtrip', () => {
        const m = { version: MAXP_V0_5, numGlyphs: 300 };
        const dec = parseMaxp(encodeMaxp(m));
        expect(dec).toEqual(m);
    });

    test('v1.0 roundtrip', () => {
        const m = {
            version: MAXP_V1_0, numGlyphs: 500,
            maxPoints: 100, maxContours: 20,
            maxCompositePoints: 0, maxCompositeContours: 0,
            maxZones: 2, maxTwilightPoints: 0,
            maxStorage: 0, maxFunctionDefs: 0, maxInstructionDefs: 0,
            maxStackElements: 256, maxSizeOfInstructions: 0,
            maxComponentElements: 0, maxComponentDepth: 0
        };
        const enc = encodeMaxp(m);
        expect(enc.length).toBe(32);
        expect(parseMaxp(enc)).toEqual(m);
    });

    test('rejects short', () => {
        expect(() => parseMaxp(new Uint8Array(4))).toThrow(ParseError);
    });

    test('rejects bad version', () => {
        const u = new Uint8Array(32);
        u[1] = 0x99;
        expect(() => parseMaxp(u)).toThrow(ParseError);
    });
});
