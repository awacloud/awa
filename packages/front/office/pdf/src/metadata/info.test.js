// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfInfo } from './info.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfInfo_m = pdfInfo.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeInfo } = _pdfInfo_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeInfo', () => {
    test('reads all standard entries', () => {
        const r = typeInfo(obj.dict({
            Title: obj.string(u8('T')),
            Author: obj.string(u8('A')),
            Subject: obj.string(u8('S')),
            Keywords: obj.string(u8('K')),
            Creator: obj.string(u8('C')),
            Producer: obj.string(u8('P')),
            CreationDate: obj.string(u8('D:20240101')),
            ModDate: obj.string(u8('D:20240102')),
            Trapped: obj.name('True')
        }));
        expect(r.trapped).toBe('True');
        expect(new TextDecoder().decode(r.title)).toBe('T');
    });
    test('accepts boolean /Trapped tolerantly', () => {
        const r = typeInfo(obj.dict({ Trapped: obj.bool(false) }));
        expect(r.trapped).toBe('False');
    });
    test('preserves unknown entries', () => {
        const r = typeInfo(obj.dict({ Foo: obj.int(1) }));
        expect(r._extras.Foo.value).toBe(1);
    });
    test('rejects non-dict', () => {
        expect(() => typeInfo(obj.array([]))).toThrow(ParseError);
    });
    test('rejects bad string entry', () => {
        expect(() => typeInfo(obj.dict({ Title: obj.int(1) }))).toThrow(ParseError);
    });
    test('rejects bad date entry', () => {
        expect(() => typeInfo(obj.dict({ ModDate: obj.int(1) }))).toThrow(ParseError);
    });
    test('rejects bad /Trapped', () => {
        expect(() => typeInfo(obj.dict({ Trapped: obj.int(1) }))).toThrow(ParseError);
    });
});

describe('pdfInfo module', () => {
    test('module shape + worker safety', () => {
        expect(pdfInfo.name).toBe('pdfInfo');
        expect(pdfInfo.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfInfo.factory.toString()).toContain('function');
        const m = pdfInfo.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeInfo).toBe('function');
    });
});
