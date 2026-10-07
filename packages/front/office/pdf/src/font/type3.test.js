// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfType3 } from './type3.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeType3 } = pdfType3.factory(errors, parserObj);

describe('typeType3', () => {
    test('basic dict', () => {
        const d = obj.dict({
            Subtype: obj.name('Type3'),
            FontBBox: obj.array([obj.int(0), obj.int(0), obj.int(1000), obj.int(1000)]),
            FontMatrix: obj.array([
                obj.real(0.001), obj.int(0), obj.int(0),
                obj.real(0.001), obj.int(0), obj.int(0)
            ]),
            CharProcs: obj.dict({ glyphA: obj.ref(10, 0) }),
            Encoding: obj.dict({}),
            FirstChar: obj.int(65),
            LastChar:  obj.int(66),
            Widths: obj.array([obj.int(500), obj.int(600)])
        });
        const t = typeType3(d);
        expect(t.subtype).toBe('Type3');
        expect(t.bbox).toEqual([0, 0, 1000, 1000]);
        expect(t.matrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
        expect(t.charProcs.glyphA.num).toBe(10);
        expect(t.firstChar).toBe(65);
        expect(t.widths).toEqual([500, 600]);
    });

    test('FontMatrix defaults when missing', () => {
        const d = obj.dict({ Subtype: obj.name('Type3') });
        expect(typeType3(d).matrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
    });

    test('rejects non-dict', () => {
        expect(() => typeType3(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        expect(() => typeType3(obj.dict({ Subtype: obj.name('Type1') })))
            .toThrow(ParseError);
    });

    test('FontMatrix with bad shape uses default', () => {
        const d = obj.dict({
            Subtype: obj.name('Type3'),
            FontMatrix: obj.array([obj.int(1)])
        });
        expect(typeType3(d).matrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
    });
});

describe('pdfType3 module', () => {
    test('module shape', () => {
        expect(pdfType3.name).toBe('pdfType3');
        expect(pdfType3.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfType3.factory.toString()).toContain('function');
        const m = pdfType3.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeType3).toBe('function');
    });
});
