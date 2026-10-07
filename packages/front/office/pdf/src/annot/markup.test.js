// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfMarkupAnnot } from './markup.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeMarkupAnnot } = pdfMarkupAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

const QP = obj.array([
    obj.real(0), obj.real(0), obj.real(1), obj.real(0),
    obj.real(1), obj.real(1), obj.real(0), obj.real(1)
]);

describe('typeMarkupAnnot', () => {
    test('minimal Highlight', () => {
        const d = obj.dict({ Subtype: obj.name('Highlight') });
        const a = typeMarkupAnnot(d, 'Highlight');
        expect(a.subtype).toBe('Highlight');
        expect(a.quadPoints).toBeNull();
    });

    test('Highlight with QuadPoints', () => {
        const d = obj.dict({ Subtype: obj.name('Highlight'), QuadPoints: QP });
        const a = typeMarkupAnnot(d, 'Highlight');
        expect(a.quadPoints.length).toBe(8);
    });

    test('Underline/Squiggly/StrikeOut dispatch', () => {
        for (const k of ['Underline', 'Squiggly', 'StrikeOut']) {
            const d = obj.dict({ Subtype: obj.name(k), QuadPoints: QP });
            const a = typeMarkupAnnot(d, k);
            expect(a.subtype).toBe(k);
        }
    });

    test('Caret with /RD and /Sy', () => {
        const d = obj.dict({
            Subtype: obj.name('Caret'),
            RD: obj.array([obj.real(1), obj.real(1), obj.real(1), obj.real(1)]),
            Sy: obj.name('P')
        });
        const a = typeMarkupAnnot(d, 'Caret');
        expect(a.rd).toEqual([1, 1, 1, 1]);
        expect(a.sy).toBe('P');
    });

    test('rejects bad QuadPoints', () => {
        const d = obj.dict({ Subtype: obj.name('Highlight'),
            QuadPoints: obj.int(0) });
        expect(() => typeMarkupAnnot(d, 'Highlight')).toThrow(ParseError);
    });

    test('rejects QuadPoints length not multiple of 8', () => {
        const d = obj.dict({ Subtype: obj.name('Highlight'),
            QuadPoints: obj.array([obj.real(0), obj.real(0), obj.real(1)]) });
        expect(() => typeMarkupAnnot(d, 'Highlight')).toThrow(ParseError);
    });

    test('rejects mismatched subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Underline') });
        expect(() => typeMarkupAnnot(d, 'Highlight')).toThrow(ParseError);
    });

    test('rejects unsupported expected', () => {
        const d = obj.dict({ Subtype: obj.name('Highlight') });
        expect(() => typeMarkupAnnot(d, 'Nope')).toThrow(ParseError);
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Highlight'), Foo: obj.int(2) });
        expect(typeMarkupAnnot(d, 'Highlight')._extras.Foo.value).toBe(2);
    });
});

describe('pdfMarkupAnnot module', () => {
    test('shape', () => {
        expect(pdfMarkupAnnot.name).toBe('pdfMarkupAnnot');
        expect(pdfMarkupAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfMarkupAnnot.factory.toString()).toContain('function');
        expect(typeof pdfMarkupAnnot.factory(_pdfErrors_TD1, {}, {}).typeMarkupAnnot).toBe('function');
    });
});
