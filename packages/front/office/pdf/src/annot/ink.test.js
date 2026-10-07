// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfInkAnnot } from './ink.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeInkAnnot } = pdfInkAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typeInkAnnot', () => {
    test('minimal (no /InkList)', () => {
        const d = obj.dict({ Subtype: obj.name('Ink') });
        const a = typeInkAnnot(d);
        expect(a.subtype).toBe('Ink');
        expect(a.inkList).toEqual([]);
    });

    test('multi-stroke /InkList', () => {
        const d = obj.dict({
            Subtype: obj.name('Ink'),
            InkList: obj.array([
                obj.array([obj.real(0), obj.real(0), obj.real(1), obj.real(1)]),
                obj.array([obj.real(2), obj.real(2)])
            ])
        });
        const a = typeInkAnnot(d);
        expect(a.inkList.length).toBe(2);
        expect(a.inkList[0]).toEqual([0, 0, 1, 1]);
        expect(a.inkList[1]).toEqual([2, 2]);
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Ink'), Foo: obj.int(1) });
        expect(typeInkAnnot(d)._extras.Foo.value).toBe(1);
    });

    test('rejects /InkList not array', () => {
        const d = obj.dict({ Subtype: obj.name('Ink'), InkList: obj.int(0) });
        expect(() => typeInkAnnot(d)).toThrow(ParseError);
    });

    test('rejects stroke not array', () => {
        const d = obj.dict({ Subtype: obj.name('Ink'),
            InkList: obj.array([obj.int(0)]) });
        expect(() => typeInkAnnot(d)).toThrow(ParseError);
    });

    test('rejects non-number coord', () => {
        const d = obj.dict({ Subtype: obj.name('Ink'),
            InkList: obj.array([obj.array([obj.name('X')])]) });
        expect(() => typeInkAnnot(d)).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        expect(() => typeInkAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfInkAnnot module', () => {
    test('shape', () => {
        expect(pdfInkAnnot.name).toBe('pdfInkAnnot');
        expect(pdfInkAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfInkAnnot.factory.toString()).toContain('function');
        expect(typeof pdfInkAnnot.factory(_pdfErrors_TD1, {}, {}).typeInkAnnot).toBe('function');
    });
});
