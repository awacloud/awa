// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfStampAnnot } from './stamp.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeStampAnnot } = pdfStampAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typeStampAnnot', () => {
    test('minimal', () => {
        const d = obj.dict({ Subtype: obj.name('Stamp') });
        const a = typeStampAnnot(d);
        expect(a.subtype).toBe('Stamp');
        expect(a.iconName).toBeNull();
    });

    test('with icon name', () => {
        const d = obj.dict({ Subtype: obj.name('Stamp'), Name: obj.name('Approved') });
        expect(typeStampAnnot(d).iconName).toBe('Approved');
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Stamp'), Foo: obj.int(1) });
        expect(typeStampAnnot(d)._extras.Foo.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeStampAnnot(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        expect(() => typeStampAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfStampAnnot module', () => {
    test('shape', () => {
        expect(pdfStampAnnot.name).toBe('pdfStampAnnot');
        expect(pdfStampAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfStampAnnot.factory.toString()).toContain('function');
        expect(typeof pdfStampAnnot.factory(_pdfErrors_TD1, {}, {}).typeStampAnnot).toBe('function');
    });
});
