// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfEmbeddedFile } from './embeddedFile.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfEmbeddedFile_m = pdfEmbeddedFile.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeEmbeddedFile } = _pdfEmbeddedFile_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeEmbeddedFile', () => {
    test('minimal', () => {
        const s = obj.stream(obj.dict({ Type: obj.name('EmbeddedFile') }),
                             new Uint8Array([1, 2, 3]));
        const r = typeEmbeddedFile(s);
        expect(r.bytes.length).toBe(3);
    });
    test('reads /Subtype + /Params', () => {
        const s = obj.stream(obj.dict({
            Type: obj.name('EmbeddedFile'),
            Subtype: obj.name('text/plain'),
            Params: obj.dict({
                Size: obj.int(42),
                CreationDate: obj.string(u8('D:20240101')),
                CheckSum: obj.string(new Uint8Array(16))
            })
        }), new Uint8Array(0));
        const r = typeEmbeddedFile(s);
        expect(r.subtype).toBe('text/plain');
        expect(r.params.size).toBe(42);
        expect(r.params.checkSum.length).toBe(16);
    });
    test('preserves unknown entries', () => {
        const s = obj.stream(obj.dict({ Foo: obj.int(1) }), new Uint8Array(0));
        const r = typeEmbeddedFile(s);
        expect(r._extras.Foo.value).toBe(1);
    });
    test('rejects non-stream', () => {
        expect(() => typeEmbeddedFile(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad /Type', () => {
        const s = obj.stream(obj.dict({ Type: obj.name('Wrong') }),
                             new Uint8Array(0));
        expect(() => typeEmbeddedFile(s)).toThrow(ParseError);
    });
    test('rejects bad /Subtype', () => {
        const s = obj.stream(obj.dict({ Subtype: obj.int(1) }), new Uint8Array(0));
        expect(() => typeEmbeddedFile(s)).toThrow(ParseError);
    });
    test('rejects bad /Params', () => {
        const s = obj.stream(obj.dict({ Params: obj.int(1) }), new Uint8Array(0));
        expect(() => typeEmbeddedFile(s)).toThrow(ParseError);
    });
});

describe('pdfEmbeddedFile module', () => {
    test('module shape + worker safety', () => {
        expect(pdfEmbeddedFile.name).toBe('pdfEmbeddedFile');
        expect(pdfEmbeddedFile.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfEmbeddedFile.factory.toString()).toContain('function');
        const m = pdfEmbeddedFile.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeEmbeddedFile).toBe('function');
    });
});
