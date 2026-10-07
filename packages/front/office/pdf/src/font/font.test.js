// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFont } from './font.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeFont, resolveDescendant } = pdfFont.factory(errors, parserObj);

describe('typeFont — basic subtypes', () => {
    test('Type1', () => {
        const d = obj.dict({
            Type: obj.name('Font'),
            Subtype: obj.name('Type1'),
            BaseFont: obj.name('Helvetica')
        });
        const f = typeFont(d);
        expect(f.subtype).toBe('Type1');
        expect(f.baseFont).toBe('Helvetica');
    });

    test('TrueType with widths', () => {
        const d = obj.dict({
            Subtype: obj.name('TrueType'),
            BaseFont: obj.name('Arial'),
            FirstChar: obj.int(32),
            LastChar:  obj.int(126),
            Widths:    obj.array([obj.int(500), obj.int(600)])
        });
        const f = typeFont(d);
        expect(f.firstChar).toBe(32);
        expect(f.lastChar).toBe(126);
        expect(f.widths).toEqual([500, 600]);
    });

    test('Type0 composite', () => {
        const d = obj.dict({
            Subtype:  obj.name('Type0'),
            BaseFont: obj.name('Arial-Bold-Identity-H'),
            Encoding: obj.name('Identity-H'),
            DescendantFonts: obj.array([obj.ref(20, 0)])
        });
        const f = typeFont(d);
        expect(f.subtype).toBe('Type0');
        expect(f.descendantFonts.length).toBe(1);
        expect(f.descendantFonts[0].type).toBe('ref');
    });

    test('Type3', () => {
        const d = obj.dict({ Subtype: obj.name('Type3') });
        expect(typeFont(d).subtype).toBe('Type3');
    });
});

describe('typeFont — standard14 fallback', () => {
    const std14 = {
        isStandard14: (n) => n === 'Helvetica',
        lookupStandard14: (n) => ({ name: n, widths: { 65: 667 } })
    };

    test('attaches standard14 metrics when no descriptor', () => {
        const d = obj.dict({
            Subtype: obj.name('Type1'),
            BaseFont: obj.name('Helvetica')
        });
        const f = typeFont(d, { standard14: std14 });
        expect(f.standard14).toBeDefined();
        expect(f.standard14.name).toBe('Helvetica');
    });

    test('skips standard14 when descriptor present', () => {
        const d = obj.dict({
            Subtype:  obj.name('Type1'),
            BaseFont: obj.name('Helvetica'),
            FontDescriptor: obj.ref(99, 0)
        });
        const f = typeFont(d, { standard14: std14 });
        expect(f.standard14).toBe(null);
    });

    test('skips standard14 for non-standard names', () => {
        const d = obj.dict({
            Subtype:  obj.name('Type1'),
            BaseFont: obj.name('CustomFont')
        });
        const f = typeFont(d, { standard14: std14 });
        expect(f.standard14).toBe(null);
    });
});

describe('typeFont — errors', () => {
    test('rejects non-dict', () => {
        expect(() => typeFont(obj.array([]))).toThrow(ParseError);
    });

    test('rejects bad /Type', () => {
        expect(() => typeFont(obj.dict({
            Type: obj.name('NotFont'),
            Subtype: obj.name('Type1')
        }))).toThrow(ParseError);
    });

    test('rejects missing /Subtype', () => {
        expect(() => typeFont(obj.dict({ Type: obj.name('Font') })))
            .toThrow(ParseError);
    });

    test('rejects unknown /Subtype', () => {
        expect(() => typeFont(obj.dict({ Subtype: obj.name('FooBar') })))
            .toThrow(ParseError);
    });
});

describe('resolveDescendant', () => {
    test('returns typed descendant for Type0', () => {
        const descDict = obj.dict({
            Subtype: obj.name('CIDFontType2'),
            BaseFont: obj.name('Arial')
        });
        const f = typeFont(obj.dict({
            Subtype: obj.name('Type0'),
            DescendantFonts: obj.array([descDict])
        }));
        const d = resolveDescendant(f, () => null);
        expect(d.subtype).toBe('CIDFontType2');
    });

    test('returns null for non-Type0', () => {
        const f = typeFont(obj.dict({ Subtype: obj.name('Type1') }));
        expect(resolveDescendant(f, () => null)).toBe(null);
    });

    test('returns null when descendants missing', () => {
        const f = typeFont(obj.dict({ Subtype: obj.name('Type0') }));
        expect(resolveDescendant(f, () => null)).toBe(null);
    });
});

describe('pdfFont module', () => {
    test('module shape', () => {
        expect(pdfFont.name).toBe('pdfFont');
        expect(pdfFont.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfFont.factory.toString()).toContain('function');
        const m = pdfFont.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeFont).toBe('function');
        expect(typeof m.resolveDescendant).toBe('function');
    });
});
