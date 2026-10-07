// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfRunLength } from './runLength.js';
import { pdfErrors } from '../../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const { decode: runLengthDecode, encode: runLengthEncode } = pdfRunLength.factory(errors);

const te = new TextEncoder();

describe('runLengthDecode', () => {
    test('literal run', () => {
        expect(Array.from(runLengthDecode(new Uint8Array([2, 1, 2, 3, 128]))))
            .toEqual([1, 2, 3]);
    });

    test('repeat run', () => {
        // 257 - 252 = 5 → value 9 repeated 5 times
        expect(Array.from(runLengthDecode(new Uint8Array([252, 9, 128]))))
            .toEqual([9, 9, 9, 9, 9]);
    });

    test('mixed', () => {
        // literal [1,2], then repeat 0x55 thrice, then EOD
        const bytes = new Uint8Array([1, 1, 2, 254, 0x55, 128]);
        expect(Array.from(runLengthDecode(bytes)))
            .toEqual([1, 2, 0x55, 0x55, 0x55]);
    });

    test('stops at 128 EOD', () => {
        expect(runLengthDecode(new Uint8Array([128, 1, 2, 3])).length).toBe(0);
    });

    test('truncated literal throws', () => {
        expect(() => runLengthDecode(new Uint8Array([3, 1, 2])))
            .toThrow(ParseError);
    });

    test('truncated repeat throws', () => {
        expect(() => runLengthDecode(new Uint8Array([130])))
            .toThrow(ParseError);
    });

    test('rejects non-Uint8Array', () => {
        expect(() => runLengthDecode('nope')).toThrow(ParseError);
    });
});

describe('runLengthEncode + roundtrip', () => {
    test.each([
        new Uint8Array([]),
        new Uint8Array([1, 2, 3]),
        new Uint8Array([9, 9, 9, 9, 9]),
        new Uint8Array([1, 1, 2, 0x55, 0x55, 0x55, 0x42]),
        new Uint8Array(200).fill(0xAA)
    ])('roundtrips length %#', (src) => {
        const enc = runLengthEncode(src);
        const dec = runLengthDecode(enc);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });
});

describe('pdfRunLength module', () => {
    test('module shape', () => {
        expect(pdfRunLength.name).toBe('pdfRunLength');
        expect(pdfRunLength.dependencies).toEqual(['pdfErrors']);
        expect(pdfRunLength.factory.toString()).toContain('function');
        const m = pdfRunLength.factory(_pdfErrors_TD1);
        expect(typeof m.decode).toBe('function');
        expect(typeof m.encode).toBe('function');
    });
});
