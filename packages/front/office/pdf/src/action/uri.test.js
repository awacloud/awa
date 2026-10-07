// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfActionUri } from './uri.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfActionUri_m = pdfActionUri.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeUri } = _pdfActionUri_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeUri', () => {
    test('minimal', () => {
        const r = typeUri(obj.dict({ URI: obj.string(u8('https://example.com')) }));
        expect(r.kind).toBe('URI');
        expect(new TextDecoder().decode(r.uri)).toBe('https://example.com');
    });
    test('reads IsMap', () => {
        const r = typeUri(obj.dict({
            URI: obj.string(u8('x')),
            IsMap: obj.bool(true)
        }));
        expect(r.isMap).toBe(true);
    });
    test('rejects non-dict', () => {
        expect(() => typeUri(obj.array([]))).toThrow(ParseError);
    });
    test('rejects missing /URI', () => {
        expect(() => typeUri(obj.dict({}))).toThrow(ParseError);
    });
});

describe('pdfActionUri module', () => {
    test('module shape + worker safety', () => {
        expect(pdfActionUri.name).toBe('pdfActionUri');
        expect(pdfActionUri.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfActionUri.factory.toString()).toContain('function');
        const m = pdfActionUri.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeUri).toBe('function');
    });
});
