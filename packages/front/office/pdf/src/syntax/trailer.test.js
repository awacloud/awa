// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfTrailer } from './trailer.js';
import { pdfParserObj } from './parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeTrailer } = pdfTrailer.factory(_errors, _parserObj);
const te = new TextEncoder();

describe('typeTrailer', () => {
    test('typed shape from minimal trailer', () => {
        const dict = obj.dict({
            Size: obj.int(7),
            Root: obj.ref(1, 0)
        });
        const t = typeTrailer(dict);
        expect(t.size).toBe(7);
        expect(t.root).toEqual({ num: 1, gen: 0 });
        expect(t.raw).toBe(dict);
        expect(t.info).toBeUndefined();
    });

    test('captures Info / Prev / Encrypt / ID', () => {
        const dict = obj.dict({
            Size: obj.int(7),
            Root: obj.ref(1, 0),
            Info: obj.ref(2, 0),
            Prev: obj.int(1234),
            Encrypt: obj.ref(3, 0),
            ID: obj.array([
                obj.string(te.encode('AAAA')),
                obj.string(te.encode('BBBB'))
            ])
        });
        const t = typeTrailer(dict);
        expect(t.info).toEqual({ num: 2, gen: 0 });
        expect(t.prev).toBe(1234);
        expect(t.encrypt).toEqual({ num: 3, gen: 0 });
        expect(t.id.length).toBe(2);
        expect(new TextDecoder().decode(t.id[0])).toBe('AAAA');
    });

    test('Encrypt as inline dict is preserved as-is', () => {
        const inline = obj.dict({ Filter: obj.name('Standard') });
        const dict = obj.dict({
            Size: obj.int(1),
            Root: obj.ref(1, 0),
            Encrypt: inline
        });
        expect(typeTrailer(dict).encrypt).toBe(inline);
    });

    test('rejects non-dict input', () => {
        expect(() => typeTrailer(obj.array([]))).toThrow(ParseError);
    });

    test('rejects missing Size', () => {
        expect(() => typeTrailer(obj.dict({ Root: obj.ref(1, 0) })))
            .toThrow(ParseError);
    });

    test('rejects missing Root', () => {
        expect(() => typeTrailer(obj.dict({ Size: obj.int(1) })))
            .toThrow(ParseError);
    });

    test('rejects Root not being a ref', () => {
        expect(() => typeTrailer(obj.dict({
            Size: obj.int(1), Root: obj.int(2)
        }))).toThrow(ParseError);
    });
});

describe('pdfTrailer module', () => {
    test('module shape', () => {
        expect(pdfTrailer.name).toBe('pdfTrailer');
        expect(pdfTrailer.dependencies).toEqual(['pdfErrors', 'pdfParserObj']);
        expect(pdfTrailer.factory.toString()).toContain('function');
        const m = pdfTrailer.factory(_pdfErrors_TD1, { isType: (v, k) => !!(v && v.type === k) });
        expect(typeof m.typeTrailer).toBe('function');
    });
});
