// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfButtonField } from './button.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeButtonField } = pdfButtonField.factory(errors, parserObj);

describe('typeButtonField', () => {
    test('minimal checkbox', () => {
        const d = obj.dict({ FT: obj.name('Btn') });
        const b = typeButtonField(d);
        expect(b.kind).toBe('checkbox');
        expect(b.flags).toBe(0);
        expect(b.v).toBeNull();
        expect(b.raw).toBe(d);
        expect(b._extras).toEqual({});
    });

    test('pushbutton detection (bit 17)', () => {
        const d = obj.dict({ FT: obj.name('Btn'), Ff: obj.int(1 << 16) });
        expect(typeButtonField(d).kind).toBe('pushbutton');
    });

    test('radio detection (bit 16)', () => {
        const d = obj.dict({ FT: obj.name('Btn'), Ff: obj.int(1 << 15) });
        expect(typeButtonField(d).kind).toBe('radio');
    });

    test('NoToggleToOff and RadiosInUnison flags', () => {
        const flags = (1 << 15) | (1 << 14) | (1 << 25);
        const d = obj.dict({ FT: obj.name('Btn'), Ff: obj.int(flags) });
        const b = typeButtonField(d);
        expect(b.noToggleToOff).toBe(true);
        expect(b.radiosInUnison).toBe(true);
    });

    test('reads /V /DV /Opt /T', () => {
        const t = new Uint8Array([0x66, 0x6f]);
        const d = obj.dict({
            FT: obj.name('Btn'),
            V: obj.name('Yes'),
            DV: obj.name('Off'),
            Opt: obj.array([obj.string(new Uint8Array([0x61])), obj.name('B')]),
            T: obj.string(t)
        });
        const b = typeButtonField(d);
        expect(b.v).toBe('Yes');
        expect(b.dv).toBe('Off');
        expect(b.opt.length).toBe(2);
        expect(b.t).toBe(t);
    });

    test('preserves unknown entries in _extras', () => {
        const d = obj.dict({ FT: obj.name('Btn'), Mystery: obj.int(7) });
        expect(typeButtonField(d)._extras.Mystery.value).toBe(7);
    });

    test('rejects non-dict input', () => {
        expect(() => typeButtonField(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong /FT', () => {
        const d = obj.dict({ FT: obj.name('Tx') });
        expect(() => typeButtonField(d)).toThrow(ParseError);
    });

    test('rejects malformed /Opt', () => {
        const d = obj.dict({ FT: obj.name('Btn'), Opt: obj.int(0) });
        expect(() => typeButtonField(d)).toThrow(ParseError);
    });

    test('rejects /Opt entry that is not a string/name', () => {
        const d = obj.dict({ FT: obj.name('Btn'), Opt: obj.array([obj.int(0)]) });
        expect(() => typeButtonField(d)).toThrow(ParseError);
    });
});

describe('pdfButtonField module', () => {
    test('module shape + worker safety', () => {
        expect(pdfButtonField.name).toBe('pdfButtonField');
        expect(pdfButtonField.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfButtonField.factory.toString()).toContain('function');
        const m = pdfButtonField.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeButtonField).toBe('function');
    });
});
