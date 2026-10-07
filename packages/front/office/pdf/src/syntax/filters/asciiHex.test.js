// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAsciiHex } from './asciiHex.js';
import { pdfErrors } from '../../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const { decode: asciiHexDecode, encode: asciiHexEncode } = pdfAsciiHex.factory(errors);

const te = new TextEncoder();
const td = new TextDecoder('latin1');

describe('asciiHexDecode', () => {
    test('basic hex', () => {
        expect(td.decode(asciiHexDecode(te.encode('48656c6c6f>')))).toBe('Hello');
    });

    test('ignores whitespace', () => {
        expect(td.decode(asciiHexDecode(te.encode('48 65\n6c\t6c 6f>')))).toBe('Hello');
    });

    test('odd nibbles implicit trailing 0', () => {
        expect(Array.from(asciiHexDecode(te.encode('F>')))).toEqual([0xF0]);
    });

    test('uppercase and lowercase', () => {
        expect(Array.from(asciiHexDecode(te.encode('aB cD eF>'))))
            .toEqual([0xAB, 0xCD, 0xEF]);
    });

    test('no EOD is OK', () => {
        expect(td.decode(asciiHexDecode(te.encode('48656c6c6f')))).toBe('Hello');
    });

    test('rejects non-hex char', () => {
        expect(() => asciiHexDecode(te.encode('48Z>'))).toThrow(ParseError);
    });

    test('rejects non-Uint8Array', () => {
        expect(() => asciiHexDecode('not bytes')).toThrow(ParseError);
    });
});

describe('asciiHexEncode', () => {
    test('round-trips', () => {
        const src = new Uint8Array([0, 1, 127, 200, 255]);
        const encoded = asciiHexEncode(src);
        expect(td.decode(encoded).endsWith('>')).toBe(true);
        const decoded = asciiHexDecode(encoded);
        expect(Array.from(decoded)).toEqual(Array.from(src));
    });

    test('wraps after 32 bytes', () => {
        const src = new Uint8Array(40).fill(0xAA);
        expect(td.decode(asciiHexEncode(src)).includes('\n')).toBe(true);
    });
});

describe('pdfAsciiHex module', () => {
    test('module shape', () => {
        expect(pdfAsciiHex.name).toBe('pdfAsciiHex');
        expect(pdfAsciiHex.dependencies).toEqual(['pdfErrors']);
        expect(pdfAsciiHex.factory.toString()).toContain('function');
        const m = pdfAsciiHex.factory(_pdfErrors_TD1);
        expect(typeof m.decode).toBe('function');
        expect(typeof m.encode).toBe('function');
    });
});
