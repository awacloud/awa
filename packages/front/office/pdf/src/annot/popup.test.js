// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfPopupAnnot } from './popup.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typePopupAnnot } = pdfPopupAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typePopupAnnot', () => {
    test('minimal', () => {
        const d = obj.dict({ Subtype: obj.name('Popup') });
        const a = typePopupAnnot(d);
        expect(a.subtype).toBe('Popup');
        expect(a.parent).toBeNull();
        expect(a.open).toBe(false);
    });

    test('with parent + open', () => {
        const d = obj.dict({
            Subtype: obj.name('Popup'),
            Parent: obj.ref(3, 0),
            Open: obj.bool(true)
        });
        const a = typePopupAnnot(d);
        expect(a.parent).toEqual({ num: 3, gen: 0 });
        expect(a.open).toBe(true);
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Popup'), Foo: obj.int(1) });
        expect(typePopupAnnot(d)._extras.Foo.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typePopupAnnot(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        expect(() => typePopupAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfPopupAnnot module', () => {
    test('shape', () => {
        expect(pdfPopupAnnot.name).toBe('pdfPopupAnnot');
        expect(pdfPopupAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfPopupAnnot.factory.toString()).toContain('function');
        expect(typeof pdfPopupAnnot.factory(_pdfErrors_TD1, {}, {}).typePopupAnnot).toBe('function');
    });
});
