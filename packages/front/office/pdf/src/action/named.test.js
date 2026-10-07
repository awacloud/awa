// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfActionNamed } from './named.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfActionNamed_m = pdfActionNamed.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeNamed } = _pdfActionNamed_m;

describe('typeNamed', () => {
    test('reads standard name', () => {
        const r = typeNamed(obj.dict({ N: obj.name('NextPage') }));
        expect(r.kind).toBe('Named');
        expect(r.name).toBe('NextPage');
        expect(r.standard).toBe(true);
    });
    test('accepts vendor-defined name', () => {
        const r = typeNamed(obj.dict({ N: obj.name('AcmeZoomBest') }));
        expect(r.standard).toBe(false);
    });
    test('rejects non-dict', () => {
        expect(() => typeNamed(obj.array([]))).toThrow(ParseError);
    });
    test('rejects missing /N', () => {
        expect(() => typeNamed(obj.dict({}))).toThrow(ParseError);
    });
});

describe('pdfActionNamed module', () => {
    test('module shape + worker safety', () => {
        expect(pdfActionNamed.name).toBe('pdfActionNamed');
        expect(pdfActionNamed.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfActionNamed.factory.toString()).toContain('function');
        const m = pdfActionNamed.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeNamed).toBe('function');
    });
});
