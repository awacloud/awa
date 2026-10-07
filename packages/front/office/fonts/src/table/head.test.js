// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableHead } from './head.js';
import { testRuntime } from './_test-runtime.js';
const { parseHead, encodeHead, HEAD_MAGIC } = testRuntime.resolve('tableHead');
const { ParseError } = testRuntime.resolve('fontErrors');

const sample = {
    majorVersion: 1, minorVersion: 0,
    fontRevision: 1.5,
    checksumAdjustment: 0,
    magicNumber: HEAD_MAGIC,
    flags: 0x000B, unitsPerEm: 1000,
    created: 0, modified: 0,
    xMin: -100, yMin: -200, xMax: 1100, yMax: 900,
    macStyle: 0, lowestRecPPEM: 9,
    fontDirectionHint: 2, indexToLocFormat: 0, glyphDataFormat: 0
};

describe('tableHead', () => {
    test('module metadata', () => {
        expect(tableHead.name).toBe('tableHead');
    });

    test('roundtrip', () => {
        const enc = encodeHead(sample);
        expect(enc.length).toBe(54);
        const dec = parseHead(enc);
        expect(dec).toEqual(sample);
    });

    test('parseHead rejects short input', () => {
        expect(() => parseHead(new Uint8Array(50))).toThrow(ParseError);
    });

    test('parseHead rejects bad magic', () => {
        const b = encodeHead(sample);
        b[12] = 0; b[13] = 0; b[14] = 0; b[15] = 0;
        expect(() => parseHead(b)).toThrow(ParseError);
    });

    test('parseHead rejects out-of-range unitsPerEm', () => {
        const b = encodeHead({ ...sample, unitsPerEm: 8 });
        expect(() => parseHead(b)).toThrow(ParseError);
    });

    test('parseHead rejects bad indexToLocFormat', () => {
        const b = encodeHead(sample);
        b[50] = 0x00; b[51] = 0x02;   // indexToLocFormat=2
        expect(() => parseHead(b)).toThrow(ParseError);
    });
});
