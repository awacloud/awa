// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfTextField } from './text.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeTextField } = pdfTextField.factory(errors, parserObj);

describe('typeTextField', () => {
    test('minimal valid text field', () => {
        const d = obj.dict({ FT: obj.name('Tx') });
        const t = typeTextField(d);
        expect(t.ft).toBe('Tx');
        expect(t.flags).toBe(0);
        expect(t.multiline).toBe(false);
        expect(t.v).toBeNull();
        expect(t.maxLen).toBeNull();
        expect(t.raw).toBe(d);
    });

    test('all flag bits decoded', () => {
        const flags = (1 << 12) | (1 << 13) | (1 << 20) | (1 << 22) | (1 << 23) | (1 << 25);
        const d = obj.dict({ FT: obj.name('Tx'), Ff: obj.int(flags) });
        const t = typeTextField(d);
        expect(t.multiline).toBe(true);
        expect(t.password).toBe(true);
        expect(t.fileSelect).toBe(true);
        expect(t.doNotSpellCheck).toBe(true);
        expect(t.doNotScroll).toBe(true);
        expect(t.richText).toBe(true);
    });

    test('reads /V /DV /MaxLen /DA /Q /T', () => {
        const v = new Uint8Array([0x68, 0x69]);
        const dv = new Uint8Array([0x68]);
        const da = new Uint8Array([0x2f, 0x46, 0x31]);
        const tn = new Uint8Array([0x66]);
        const d = obj.dict({
            FT: obj.name('Tx'),
            V: obj.string(v), DV: obj.string(dv), MaxLen: obj.int(20),
            DA: obj.string(da), Q: obj.int(2), T: obj.string(tn)
        });
        const t = typeTextField(d);
        expect(t.v).toBe(v);
        expect(t.dv).toBe(dv);
        expect(t.maxLen).toBe(20);
        expect(t.da).toBe(da);
        expect(t.q).toBe(2);
        expect(t.t).toBe(tn);
    });

    test('Comb requires /MaxLen', () => {
        const d = obj.dict({ FT: obj.name('Tx'), Ff: obj.int(1 << 24) });
        expect(() => typeTextField(d)).toThrow(ParseError);
    });

    test('Comb with /MaxLen is OK', () => {
        const d = obj.dict({ FT: obj.name('Tx'), Ff: obj.int(1 << 24), MaxLen: obj.int(8) });
        const t = typeTextField(d);
        expect(t.comb).toBe(true);
    });

    test('stream /V — raw bytes preserved', () => {
        const raw = new Uint8Array([1, 2, 3]);
        const d = obj.dict({
            FT: obj.name('Tx'),
            V: obj.stream(obj.dict({}), raw)
        });
        expect(typeTextField(d).v).toBe(raw);
    });

    test('preserves unknown entries in _extras', () => {
        const d = obj.dict({ FT: obj.name('Tx'), Mystery: obj.int(1) });
        expect(typeTextField(d)._extras.Mystery.value).toBe(1);
    });

    test('rejects non-dict input', () => {
        expect(() => typeTextField(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong /FT', () => {
        expect(() => typeTextField(obj.dict({ FT: obj.name('Btn') }))).toThrow(ParseError);
    });
});

describe('pdfTextField module', () => {
    test('module shape + worker safety', () => {
        expect(pdfTextField.name).toBe('pdfTextField');
        expect(pdfTextField.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfTextField.factory.toString()).toContain('function');
        const m = pdfTextField.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeTextField).toBe('function');
    });
});
