// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableOs2 } from './os2.js';
import { testRuntime } from './_test-runtime.js';
const { parseOs2, encodeOs2 } = testRuntime.resolve('tableOs2');
const { ParseError } = testRuntime.resolve('fontErrors');

function makeSample(version) {
    const s = {
        version,
        xAvgCharWidth: 500, usWeightClass: 400, usWidthClass: 5, fsType: 0,
        ySubscriptXSize: 650, ySubscriptYSize: 600, ySubscriptXOffset: 0, ySubscriptYOffset: 75,
        ySuperscriptXSize: 650, ySuperscriptYSize: 600, ySuperscriptXOffset: 0, ySuperscriptYOffset: 350,
        yStrikeoutSize: 50, yStrikeoutPosition: 250,
        sFamilyClass: 0,
        panose: [2, 0, 5, 3, 6, 0, 0, 2, 0, 4],
        ulUnicodeRange1: 1, ulUnicodeRange2: 0, ulUnicodeRange3: 0, ulUnicodeRange4: 0,
        achVendID: 'GOOG',
        fsSelection: 0x0040, usFirstCharIndex: 0x20, usLastCharIndex: 0xFFFF,
        sTypoAscender: 1900, sTypoDescender: -500, sTypoLineGap: 0,
        usWinAscent: 1950, usWinDescent: 500
    };
    if (version >= 1) { s.ulCodePageRange1 = 1; s.ulCodePageRange2 = 0; }
    if (version >= 2) {
        s.sxHeight = 528; s.sCapHeight = 700;
        s.usDefaultChar = 0; s.usBreakChar = 32; s.usMaxContext = 5;
    }
    if (version >= 5) { s.usLowerOpticalPointSize = 0; s.usUpperOpticalPointSize = 0xFFFF; }
    return s;
}

describe('tableOs2', () => {
    test('module metadata', () => { expect(tableOs2.name).toBe('tableOs2'); });

    for (const v of [0, 1, 2, 4, 5]) {
        test(`v${v} roundtrip`, () => {
            const s = makeSample(v);
            const dec = parseOs2(encodeOs2(s));
            expect(dec).toEqual(s);
        });
    }

    test('rejects short', () => {
        expect(() => parseOs2(new Uint8Array(20))).toThrow(ParseError);
    });
});
