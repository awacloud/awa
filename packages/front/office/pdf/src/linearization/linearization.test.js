// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfLinearization } from './linearization.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfLinearization_m = pdfLinearization.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeLinearizationDict } = _pdfLinearization_m;

function mkLin(extra) {
    const base = {
        Linearized: obj.real(1.0),
        L: obj.int(12345),
        H: obj.array([obj.int(100), obj.int(50)]),
        O: obj.int(4),
        E: obj.int(200),
        N: obj.int(10),
        T: obj.int(8000)
    };
    return obj.dict(Object.assign(base, extra || {}));
}

describe('typeLinearizationDict', () => {
    test('reads required entries', () => {
        const r = typeLinearizationDict(mkLin());
        expect(r.version).toBe(1);
        expect(r.length).toBe(12345);
        expect(r.firstPageObject).toBe(4);
        expect(r.hintOffsets).toEqual([100, 50]);
    });
    test('reads optional /P', () => {
        const r = typeLinearizationDict(mkLin({ P: obj.int(3) }));
        expect(r.firstPageNumber).toBe(3);
    });
    test('preserves unknown entries', () => {
        const r = typeLinearizationDict(mkLin({ Foo: obj.int(1) }));
        expect(r._extras.Foo.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeLinearizationDict(obj.array([]))).toThrow(ParseError);
    });
    test('rejects missing /Linearized', () => {
        expect(() => typeLinearizationDict(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects missing /L', () => {
        expect(() => typeLinearizationDict(obj.dict({
            Linearized: obj.real(1), H: obj.array([obj.int(1), obj.int(2)]),
            O: obj.int(1), E: obj.int(1), N: obj.int(1), T: obj.int(1)
        }))).toThrow(ParseError);
    });
    test('rejects missing /H array', () => {
        const d = mkLin();
        d.entries.H = obj.int(1);
        expect(() => typeLinearizationDict(d)).toThrow(ParseError);
    });
    test('rejects too-short /H', () => {
        const d = mkLin();
        d.entries.H = obj.array([obj.int(1)]);
        expect(() => typeLinearizationDict(d)).toThrow(ParseError);
    });
});

describe('pdfLinearization module', () => {
    test('module shape + worker safety', () => {
        expect(pdfLinearization.name).toBe('pdfLinearization');
        expect(pdfLinearization.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfLinearization.factory.toString()).toContain('function');
        const m = pdfLinearization.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeLinearizationDict).toBe('function');
    });
});
