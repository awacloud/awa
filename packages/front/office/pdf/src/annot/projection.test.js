// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfProjectionAnnot } from './projection.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeProjectionAnnot } = pdfProjectionAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typeProjectionAnnot', () => {
    test('minimal', () => {
        const d = obj.dict({ Subtype: obj.name('Projection') });
        const a = typeProjectionAnnot(d);
        expect(a.subtype).toBe('Projection');
        expect(a.v).toBeNull();
        expect(a.b).toBeNull();
    });

    test('with V and B', () => {
        const d = obj.dict({
            Subtype: obj.name('Projection'),
            V: obj.name('DefaultView'),
            B: obj.dict({ BG: obj.array([]) })
        });
        const a = typeProjectionAnnot(d);
        expect(a.v.type).toBe('name');
        expect(a.b.type).toBe('dict');
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Projection'), Foo: obj.int(1) });
        expect(typeProjectionAnnot(d)._extras.Foo.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeProjectionAnnot(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        expect(() => typeProjectionAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfProjectionAnnot module', () => {
    test('shape', () => {
        expect(pdfProjectionAnnot.name).toBe('pdfProjectionAnnot');
        expect(pdfProjectionAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfProjectionAnnot.factory.toString()).toContain('function');
        expect(typeof pdfProjectionAnnot.factory(_pdfErrors_TD1, {}, {}).typeProjectionAnnot).toBe('function');
    });
});
