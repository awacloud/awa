// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFontEncoding } from './encoding.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const { obj } = pdfParserObj.factory();
const { resolveEncoding } = pdfFontEncoding.factory(errors);

function namedLookup(name) {
    // Toy base encoding: A B C D ...
    if (name === 'WinAnsiEncoding') {
        const arr = new Array(256).fill(null);
        for (let i = 0x41; i <= 0x5A; i++) arr[i] = String.fromCharCode(i);
        return arr;
    }
    return null;
}

describe('resolveEncoding', () => {
    test('null → defaults to StandardEncoding (empty if not looked up)', () => {
        const t = resolveEncoding(null, () => null);
        expect(t.length).toBe(256);
        expect(t.every(x => x === null)).toBe(true);
    });

    test('named entry uses lookup', () => {
        const t = resolveEncoding(obj.name('WinAnsiEncoding'), namedLookup);
        expect(t[0x41]).toBe('A');
        expect(t[0x5A]).toBe('Z');
        expect(t[0x60]).toBe(null);
    });

    test('dict with BaseEncoding + Differences', () => {
        const t = resolveEncoding(obj.dict({
            BaseEncoding: obj.name('WinAnsiEncoding'),
            Differences: obj.array([
                obj.int(0x80),
                obj.name('Euro'),
                obj.name('bullet')
            ])
        }), namedLookup);
        expect(t[0x41]).toBe('A');
        expect(t[0x80]).toBe('Euro');
        expect(t[0x81]).toBe('bullet');
    });

    test('Differences without BaseEncoding falls back to Standard', () => {
        const t = resolveEncoding(obj.dict({
            Differences: obj.array([obj.int(1), obj.name('one')])
        }), namedLookup);
        expect(t[1]).toBe('one');
    });

    test('rejects bad BaseEncoding', () => {
        expect(() => resolveEncoding(obj.dict({
            BaseEncoding: obj.int(99)
        }), namedLookup)).toThrow(ParseError);
    });

    test('rejects bad entry type', () => {
        expect(() => resolveEncoding(obj.array([]), namedLookup))
            .toThrow(ParseError);
    });

    test('rejects bad Differences array', () => {
        expect(() => resolveEncoding(obj.dict({
            Differences: obj.int(1)
        }), namedLookup)).toThrow(ParseError);
    });

    test('rejects bad Differences entry', () => {
        expect(() => resolveEncoding(obj.dict({
            Differences: obj.array([obj.bool(true)])
        }), namedLookup)).toThrow(ParseError);
    });
});

describe('pdfFontEncoding module', () => {
    test('module shape', () => {
        expect(pdfFontEncoding.name).toBe('pdfFontEncoding');
        expect(pdfFontEncoding.dependencies).toEqual(['pdfErrors']);
        expect(pdfFontEncoding.factory.toString()).toContain('function');
        const m = pdfFontEncoding.factory(_pdfErrors_TD1);
        expect(typeof m.resolveEncoding).toBe('function');
    });
});
