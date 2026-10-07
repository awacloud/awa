// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfContentStream } from './stream.js';
import { pdfContentOps } from './ops.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfShared } from '../_shared/index.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfParser } from '../syntax/parser.js';

const errMod    = _pdfErrors_TD1;
const { ParseError } = errMod;
const sharedMod    = pdfShared.factory();
const tokenizerMod = pdfTokenizer.factory(errMod, sharedMod);
const parserObjMod = pdfParserObj.factory();
const parserMod    = pdfParser.factory(errMod, sharedMod, parserObjMod, tokenizerMod);
const opsMod       = pdfContentOps.factory();
const parserBundle = {
    tokenize:    tokenizerMod.tokenize,
    parseObject: parserMod.parseObject
};
const { parseContentStream } = pdfContentStream.factory(errMod, parserBundle, opsMod);

const te = new TextEncoder();

describe('parseContentStream — basic', () => {
    test('empty input', () => {
        expect(parseContentStream(new Uint8Array(0))).toEqual([]);
    });

    test('single moveto + lineto + stroke', () => {
        const ops = parseContentStream(te.encode('100 100 m 200 200 l S'));
        expect(ops.length).toBe(3);
        expect(ops[0].op).toBe('m');
        expect(ops[0].args.map(a => a.value)).toEqual([100, 100]);
        expect(ops[1].op).toBe('l');
        expect(ops[2].op).toBe('S');
        expect(ops[2].args).toEqual([]);
    });

    test('graphics state save / restore', () => {
        const ops = parseContentStream(te.encode('q 1 0 0 1 50 50 cm Q'));
        expect(ops.map(o => o.op)).toEqual(['q', 'cm', 'Q']);
        expect(ops[1].args.length).toBe(6);
    });

    test('text show', () => {
        const ops = parseContentStream(te.encode('BT /F1 12 Tf (Hello) Tj ET'));
        expect(ops.map(o => o.op)).toEqual(['BT', 'Tf', 'Tj', 'ET']);
        expect(ops[1].args[0].value).toBe('F1');
        expect(ops[1].args[1].value).toBe(12);
        expect(ops[2].args[0].type).toBe('string');
    });

    test('TJ with array', () => {
        const ops = parseContentStream(te.encode('BT [(Hi) -250 (there)] TJ ET'));
        const tj = ops.find(o => o.op === 'TJ');
        expect(tj.args[0].type).toBe('array');
        expect(tj.args[0].items.length).toBe(3);
    });

    test('color operators', () => {
        const ops = parseContentStream(te.encode('0.5 g 1 0 0 rg /CS1 cs'));
        expect(ops.map(o => o.op)).toEqual(['g', 'rg', 'cs']);
        expect(ops[0].args[0].value).toBe(0.5);
        expect(ops[1].args.map(a => a.value)).toEqual([1, 0, 0]);
        expect(ops[2].args[0].value).toBe('CS1');
    });

    test('marked content', () => {
        const ops = parseContentStream(te.encode('/Span BMC (text) Tj EMC'));
        expect(ops.map(o => o.op)).toEqual(['BMC', 'Tj', 'EMC']);
    });

    test('rectangle + fill', () => {
        const ops = parseContentStream(te.encode('0 0 100 100 re f'));
        expect(ops[0].op).toBe('re');
        expect(ops[1].op).toBe('f');
    });
});

describe('parseContentStream — errors', () => {
    test('rejects unknown operator', () => {
        expect(() => parseContentStream(te.encode('XYZ'))).toThrow(ParseError);
    });

    test('rejects non-Uint8Array', () => {
        expect(() => parseContentStream('hi')).toThrow(ParseError);
    });

    test('trailing operands captured', () => {
        const ops = parseContentStream(te.encode('100 200'));
        expect(ops[0].op).toBe('__trailing__');
        expect(ops[0].args.length).toBe(2);
    });
});

describe('parseContentStream — inline images', () => {
    test('basic BI / ID / EI', () => {
        const src = 'BI /W 2 /H 2 /CS /G /BPC 8 ID \x00\x80\xFF\x40\nEI';
        // Use a raw Uint8Array since the content includes non-UTF8 bytes.
        const bytes = new Uint8Array(src.length);
        for (let i = 0; i < src.length; i++) bytes[i] = src.charCodeAt(i);
        const ops = parseContentStream(bytes);
        expect(ops.length).toBe(1);
        expect(ops[0].op).toBe('BI');
        expect(ops[0].args[0].entries.W.value).toBe(2);
        expect(ops[0].data).toBeInstanceOf(Uint8Array);
        expect(ops[0].data.length).toBe(4);
    });

    test('rejects inline image without EI', () => {
        const bytes = te.encode('BI /W 2 ID raw_data_without_marker_X');
        expect(() => parseContentStream(bytes)).toThrow(ParseError);
    });
});

describe('pdfContentStream module', () => {
    test('module shape', () => {
        expect(pdfContentStream.name).toBe('pdfContentStream');
        expect(pdfContentStream.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfContentOps']);
        expect(pdfContentStream.factory.toString()).toContain('function');
        const m = pdfContentStream.factory(_pdfErrors_TD1, {}, {});
        expect(typeof m.parseContentStream).toBe('function');
    });
});
