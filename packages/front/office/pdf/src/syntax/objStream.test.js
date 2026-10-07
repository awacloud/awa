// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfObjStream } from './objStream.js';
import { pdfParserObj } from './parser-obj.js';
import { pdfTokenizer } from './tokenizer.js';
import { pdfParser } from './parser.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfShared } from '../_shared/index.js';
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const _tokenizer = pdfTokenizer.factory(_errors, pdfShared.factory());
const _parser = pdfParser.factory(_errors, _parserObj, _tokenizer);
const { parseObjectStream } = pdfObjStream.factory(_errors, _parserObj, _tokenizer, _parser);
const te = new TextEncoder();

function buildObjStmPayload(items) {
    // items: [{ num, body: string }]
    // Layout: "<num> <off> ..." then <body1><body2>...
    let bodies = items.map(it => it.body);
    let offsets = [];
    let cum = 0;
    for (const b of bodies) {
        offsets.push(cum);
        cum += te.encode(b).length;
    }
    let header = '';
    for (let i = 0; i < items.length; i++) {
        header += items[i].num + ' ' + offsets[i] + ' ';
    }
    // Replace last trailing space with newline.
    header = header.replace(/ $/, '\n');
    const headerBytes = te.encode(header);
    const totalLen = headerBytes.length + cum;
    const out = new Uint8Array(totalLen);
    out.set(headerBytes, 0);
    let p = headerBytes.length;
    for (const b of bodies) {
        const bb = te.encode(b);
        out.set(bb, p); p += bb.length;
    }
    return { bytes: out, first: headerBytes.length };
}

describe('parseObjectStream', () => {
    test('parses two objects', () => {
        const { bytes, first } = buildObjStmPayload([
            { num: 10, body: '<< /Type /Foo >>' },
            { num: 11, body: '42' }
        ]);
        const dict = obj.dict({
            Type: obj.name('ObjStm'),
            N: obj.int(2),
            First: obj.int(first)
        });
        const list = parseObjectStream(bytes, dict);
        expect(list.length).toBe(2);
        expect(list[0]).toMatchObject({ num: 10, gen: 0 });
        expect(list[0].value.type).toBe('dict');
        expect(list[0].value.entries.Type.value).toBe('Foo');
        expect(list[1]).toMatchObject({ num: 11, gen: 0 });
        expect(list[1].value).toEqual({ type: 'int', value: 42 });
    });

    test('rejects non-Uint8Array', () => {
        expect(() => parseObjectStream('nope', obj.dict({})))
            .toThrow(ParseError);
    });

    test('rejects non-dict dict', () => {
        expect(() => parseObjectStream(new Uint8Array(0), obj.array([])))
            .toThrow(ParseError);
    });

    test('rejects wrong /Type', () => {
        expect(() => parseObjectStream(new Uint8Array(0),
            obj.dict({ Type: obj.name('XRef'), N: obj.int(0), First: obj.int(0) })))
            .toThrow(ParseError);
    });

    test('rejects missing /N or /First', () => {
        expect(() => parseObjectStream(new Uint8Array(0),
            obj.dict({ N: obj.int(0) })))
            .toThrow(ParseError);
    });

    test('rejects bad /N value', () => {
        const dict = obj.dict({
            Type: obj.name('ObjStm'),
            N: obj.int(-1),
            First: obj.int(0)
        });
        expect(() => parseObjectStream(new Uint8Array(0), dict))
            .toThrow(ParseError);
    });

    test('rejects out-of-range /First', () => {
        const dict = obj.dict({
            Type: obj.name('ObjStm'),
            N: obj.int(0),
            First: obj.int(9999)
        });
        expect(() => parseObjectStream(new Uint8Array(10), dict))
            .toThrow(ParseError);
    });
});

describe('pdfObjStream module', () => {
    test('module shape', () => {
        expect(pdfObjStream.name).toBe('pdfObjStream');
        expect(pdfObjStream.dependencies).toEqual(['pdfErrors', 'pdfParserObj', 'pdfTokenizer', 'pdfParser']);
        expect(pdfObjStream.factory.toString()).toContain('function');
        expect(typeof pdfObjStream.factory(_pdfErrors_TD1, {}, {}, {}).parseObjectStream).toBe('function');
    });
});
