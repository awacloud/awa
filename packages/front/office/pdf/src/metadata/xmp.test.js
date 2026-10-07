// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfXmp } from './xmp.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfXmp_m = pdfXmp.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeXmpStream } = _pdfXmp_m;

describe('typeXmpStream', () => {
    test('minimal valid', () => {
        const s = obj.stream(obj.dict({
            Type: obj.name('Metadata'),
            Subtype: obj.name('XML')
        }), new Uint8Array([60, 63, 120]));
        const r = typeXmpStream(s);
        expect(r.type).toBe('Metadata');
        expect(r.bytes.length).toBe(3);
    });
    test('rejects non-stream', () => {
        expect(() => typeXmpStream(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad /Type', () => {
        const s = obj.stream(obj.dict({ Type: obj.name('Wrong'),
            Subtype: obj.name('XML') }), new Uint8Array(0));
        expect(() => typeXmpStream(s)).toThrow(ParseError);
    });
    test('rejects bad /Subtype', () => {
        const s = obj.stream(obj.dict({ Type: obj.name('Metadata'),
            Subtype: obj.name('JSON') }), new Uint8Array(0));
        expect(() => typeXmpStream(s)).toThrow(ParseError);
    });
});

describe('pdfXmp module', () => {
    test('module shape + worker safety', () => {
        expect(pdfXmp.name).toBe('pdfXmp');
        expect(pdfXmp.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfXmp.factory.toString()).toContain('function');
        const m = pdfXmp.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeXmpStream).toBe('function');
    });
});
