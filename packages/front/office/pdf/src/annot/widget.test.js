// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfWidgetAnnot } from './widget.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeWidgetAnnot } = pdfWidgetAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typeWidgetAnnot', () => {
    test('minimal', () => {
        const d = obj.dict({ Subtype: obj.name('Widget') });
        const a = typeWidgetAnnot(d);
        expect(a.subtype).toBe('Widget');
        expect(a.h).toBeNull();
    });

    test('full entries', () => {
        const d = obj.dict({
            Subtype: obj.name('Widget'),
            H: obj.name('I'),
            MK: obj.dict({ BC: obj.array([]) }),
            A:  obj.dict({ S: obj.name('JavaScript') }),
            AA: obj.dict({ K: obj.ref(2, 0) }),
            Parent: obj.ref(5, 0)
        });
        const a = typeWidgetAnnot(d);
        expect(a.h).toBe('I');
        expect(a.mk.type).toBe('dict');
        expect(a.action.type).toBe('dict');
        expect(a.aa.type).toBe('dict');
        expect(a.parent).toEqual({ num: 5, gen: 0 });
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Widget'), Foo: obj.int(1) });
        expect(typeWidgetAnnot(d)._extras.Foo.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeWidgetAnnot(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        expect(() => typeWidgetAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfWidgetAnnot module', () => {
    test('shape', () => {
        expect(pdfWidgetAnnot.name).toBe('pdfWidgetAnnot');
        expect(pdfWidgetAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfWidgetAnnot.factory.toString()).toContain('function');
        expect(typeof pdfWidgetAnnot.factory(_pdfErrors_TD1, {}, {}).typeWidgetAnnot).toBe('function');
    });
});
