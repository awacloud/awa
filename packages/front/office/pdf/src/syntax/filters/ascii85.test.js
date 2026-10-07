// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAscii85 } from './ascii85.js';
import { pdfErrors } from '../../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const { decode: ascii85Decode, encode: ascii85Encode } = pdfAscii85.factory(errors);

const te = new TextEncoder();

describe('ascii85 roundtrip', () => {
    test('aligned length', () => {
        const src = te.encode('test data 12345678');
        const enc = ascii85Encode(src);
        const dec = ascii85Decode(enc);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });

    test.each([0, 1, 2, 3, 4, 5, 7, 8, 11, 16, 32, 100])('length %i', (n) => {
        const src = new Uint8Array(n);
        for (let i = 0; i < n; i++) src[i] = (i * 7 + 3) & 0xFF;
        const enc = ascii85Encode(src);
        const dec = ascii85Decode(enc);
        expect(Array.from(dec)).toEqual(Array.from(src));
    });

    test('all zero block uses z shorthand', () => {
        const enc = ascii85Encode(new Uint8Array(4));
        expect(String.fromCharCode(enc[0])).toBe('z');
    });
});

describe('ascii85Decode error surface', () => {
    test('rejects out-of-range char', () => {
        expect(() => ascii85Decode(te.encode('!!!!"~>'))).not.toThrow();
        expect(() => ascii85Decode(te.encode('vvvvv~>'))).toThrow(ParseError);
    });

    test('z mid-group throws', () => {
        expect(() => ascii85Decode(te.encode('!!z~>'))).toThrow(ParseError);
    });

    test('rejects non-Uint8Array', () => {
        expect(() => ascii85Decode('nope')).toThrow(ParseError);
    });
});

describe('pdfAscii85 module', () => {
    test('module shape', () => {
        expect(pdfAscii85.name).toBe('pdfAscii85');
        expect(pdfAscii85.dependencies).toEqual(['pdfErrors']);
        expect(pdfAscii85.factory.toString()).toContain('function');
        const m = pdfAscii85.factory(_pdfErrors_TD1);
        expect(typeof m.decode).toBe('function');
        expect(typeof m.encode).toBe('function');
    });
});
