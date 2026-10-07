// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfCollection } from './collection.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfCollection_m = pdfCollection.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeCollection } = _pdfCollection_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeCollection', () => {
    test('empty', () => {
        const r = typeCollection(obj.dict({}));
        expect(r._extras).toEqual({});
    });
    test('reads all entries', () => {
        const r = typeCollection(obj.dict({
            Type: obj.name('Collection'),
            Schema: obj.dict({}),
            D: obj.string(u8('main.pdf')),
            View: obj.name('T'),
            Sort: obj.dict({}),
            Navigator: obj.dict({})
        }));
        expect(r.view).toBe('T');
        expect(r.schema.type).toBe('dict');
    });
    test('Navigator can be ref', () => {
        const r = typeCollection(obj.dict({ Navigator: obj.ref(1, 0) }));
        expect(r.navigator.type).toBe('ref');
    });
    test('preserves unknown', () => {
        const r = typeCollection(obj.dict({ Foo: obj.int(1) }));
        expect(r._extras.Foo.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeCollection(obj.array([]))).toThrow(ParseError);
    });
    test('rejects bad /Type', () => {
        expect(() => typeCollection(obj.dict({ Type: obj.name('Pages') }))).toThrow(ParseError);
    });
    test('rejects bad /View', () => {
        expect(() => typeCollection(obj.dict({ View: obj.name('Z') }))).toThrow(ParseError);
    });
    test('rejects bad /Schema', () => {
        expect(() => typeCollection(obj.dict({ Schema: obj.int(1) }))).toThrow(ParseError);
    });
    test('rejects bad /D', () => {
        expect(() => typeCollection(obj.dict({ D: obj.int(1) }))).toThrow(ParseError);
    });
    test('rejects bad /Navigator', () => {
        expect(() => typeCollection(obj.dict({ Navigator: obj.int(1) }))).toThrow(ParseError);
    });
});

describe('pdfCollection module', () => {
    test('module shape + worker safety', () => {
        expect(pdfCollection.name).toBe('pdfCollection');
        expect(pdfCollection.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfCollection.factory.toString()).toContain('function');
        const m = pdfCollection.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeCollection).toBe('function');
    });
});
