// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFreeTextAnnot } from './freeText.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeFreeTextAnnot } = pdfFreeTextAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typeFreeTextAnnot', () => {
    test('minimal', () => {
        const d = obj.dict({ Subtype: obj.name('FreeText') });
        const a = typeFreeTextAnnot(d);
        expect(a.subtype).toBe('FreeText');
        expect(a.da).toBeNull();
        expect(a.q).toBe(0);
    });

    test('all optional entries', () => {
        const d = obj.dict({
            Subtype: obj.name('FreeText'),
            DA: obj.string(new Uint8Array([0x44])),
            Q: obj.int(1),
            RC: obj.string(new Uint8Array([0x52])),
            DS: obj.string(new Uint8Array([0x53])),
            CL: obj.array([obj.real(0), obj.real(0), obj.real(1), obj.real(1)]),
            IT: obj.name('FreeTextCallout'),
            RD: obj.array([obj.real(1), obj.real(1), obj.real(1), obj.real(1)]),
            LE: obj.name('OpenArrow')
        });
        const a = typeFreeTextAnnot(d);
        expect(a.da).toBeDefined();
        expect(a.q).toBe(1);
        expect(a.it).toBe('FreeTextCallout');
        expect(a.le).toBe('OpenArrow');
        expect(a.cl).toEqual([0, 0, 1, 1]);
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('FreeText'), Foo: obj.int(1) });
        expect(typeFreeTextAnnot(d)._extras.Foo.value).toBe(1);
    });

    test('rejects bad CL', () => {
        const d = obj.dict({ Subtype: obj.name('FreeText'), CL: obj.int(0) });
        expect(() => typeFreeTextAnnot(d)).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        expect(() => typeFreeTextAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfFreeTextAnnot module', () => {
    test('shape', () => {
        expect(pdfFreeTextAnnot.name).toBe('pdfFreeTextAnnot');
        expect(pdfFreeTextAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfFreeTextAnnot.factory.toString()).toContain('function');
        expect(typeof pdfFreeTextAnnot.factory(_pdfErrors_TD1, {}, {}).typeFreeTextAnnot).toBe('function');
    });
});
