// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfActionGoTo } from './goTo.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfActionGoTo_m = pdfActionGoTo.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeGoTo, typeGoToR, typeGoToE } = _pdfActionGoTo_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeGoTo', () => {
    test('reads /D', () => {
        const r = typeGoTo(obj.dict({
            D: obj.array([obj.ref(1, 0), obj.name('Fit')])
        }));
        expect(r.kind).toBe('GoTo');
        expect(r.dest.type).toBe('array');
    });
    test('rejects non-dict', () => {
        expect(() => typeGoTo(obj.array([]))).toThrow(ParseError);
    });
    test('rejects missing /D', () => {
        expect(() => typeGoTo(obj.dict({}))).toThrow(ParseError);
    });
});

describe('typeGoToR', () => {
    test('reads /F /D /NewWindow', () => {
        const r = typeGoToR(obj.dict({
            F: obj.string(u8('other.pdf')),
            D: obj.name('Ch1'),
            NewWindow: obj.bool(true)
        }));
        expect(r.kind).toBe('GoToR');
        expect(r.newWindow).toBe(true);
    });
    test('rejects missing /F', () => {
        expect(() => typeGoToR(obj.dict({ D: obj.name('x') }))).toThrow(ParseError);
    });
    test('rejects missing /D', () => {
        expect(() => typeGoToR(obj.dict({ F: obj.string(u8('a')) }))).toThrow(ParseError);
    });
    test('rejects non-dict', () => {
        expect(() => typeGoToR(obj.array([]))).toThrow(ParseError);
    });
});

describe('typeGoToE', () => {
    test('reads /D + optionals', () => {
        const r = typeGoToE(obj.dict({
            D: obj.name('x'),
            F: obj.string(u8('a')),
            T: obj.dict({}),
            NewWindow: obj.bool(false)
        }));
        expect(r.kind).toBe('GoToE');
        expect(r.target.type).toBe('dict');
        expect(r.newWindow).toBe(false);
    });
    test('rejects missing /D', () => {
        expect(() => typeGoToE(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects non-dict', () => {
        expect(() => typeGoToE(obj.int(1))).toThrow(ParseError);
    });
});

describe('pdfActionGoTo module', () => {
    test('module shape + worker safety', () => {
        expect(pdfActionGoTo.name).toBe('pdfActionGoTo');
        expect(pdfActionGoTo.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfActionGoTo.factory.toString()).toContain('function');
        const m = pdfActionGoTo.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeGoTo).toBe('function');
        expect(typeof m.typeGoToR).toBe('function');
        expect(typeof m.typeGoToE).toBe('function');
    });
});
