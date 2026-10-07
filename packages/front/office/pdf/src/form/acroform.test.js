// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAcroForm } from './acroform.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeAcroForm } = pdfAcroForm.factory(errors, parserObj);

describe('typeAcroForm', () => {
    test('minimal valid form', () => {
        const dict = obj.dict({
            Fields: obj.array([obj.ref(10, 0), obj.ref(11, 0)])
        });
        const f = typeAcroForm(dict);
        expect(f.fields).toEqual([{ num: 10, gen: 0 }, { num: 11, gen: 0 }]);
        expect(f.needAppearances).toBe(false);
        expect(f.sigFlags).toBe(0);
        expect(f.q).toBe(0);
        expect(f.dr).toBeNull();
        expect(f.da).toBeNull();
        expect(f.raw).toBe(dict);
        expect(f._extras).toEqual({});
    });

    test('all optional entries', () => {
        const da = new Uint8Array([0x2f, 0x48, 0x65, 0x6c, 0x76]);
        const dict = obj.dict({
            Fields: obj.array([obj.ref(10, 0)]),
            NeedAppearances: obj.bool(true),
            SigFlags: obj.int(3),
            CO: obj.array([obj.ref(20, 0)]),
            DR: obj.dict({ Font: obj.dict({}) }),
            DA: obj.string(da),
            Q: obj.int(1)
        });
        const f = typeAcroForm(dict);
        expect(f.needAppearances).toBe(true);
        expect(f.sigFlags).toBe(3);
        expect(f.co).toEqual([{ num: 20, gen: 0 }]);
        expect(f.dr.type).toBe('dict');
        expect(f.da).toBe(da);
        expect(f.q).toBe(1);
    });

    test('preserves unknown entries in _extras', () => {
        const dict = obj.dict({
            Fields: obj.array([]),
            CustomFoo: obj.int(42)
        });
        const f = typeAcroForm(dict);
        expect(f._extras.CustomFoo.value).toBe(42);
    });

    test('preserves XFA in _extras', () => {
        const xfa = obj.array([]);
        const dict = obj.dict({ Fields: obj.array([]), XFA: xfa });
        const f = typeAcroForm(dict);
        expect(f._extras.XFA).toBe(xfa);
    });

    test('tolerates absent /Fields', () => {
        const dict = obj.dict({ NeedAppearances: obj.bool(true) });
        const f = typeAcroForm(dict);
        expect(f.fields).toEqual([]);
    });

    test('rejects non-dict input', () => {
        expect(() => typeAcroForm(obj.array([]))).toThrow(ParseError);
    });

    test('rejects /Fields that is not an array', () => {
        const dict = obj.dict({ Fields: obj.int(0) });
        expect(() => typeAcroForm(dict)).toThrow(ParseError);
    });

    test('rejects non-ref entry in /Fields', () => {
        const dict = obj.dict({ Fields: obj.array([obj.int(1)]) });
        expect(() => typeAcroForm(dict)).toThrow(ParseError);
    });
});

describe('pdfAcroForm module', () => {
    test('module shape + worker safety', () => {
        expect(pdfAcroForm.name).toBe('pdfAcroForm');
        expect(pdfAcroForm.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfAcroForm.factory.toString()).toContain('function');
        const m = pdfAcroForm.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeAcroForm).toBe('function');
    });
});
