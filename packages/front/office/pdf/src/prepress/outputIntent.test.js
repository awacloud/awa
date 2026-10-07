// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfOutputIntent } from './outputIntent.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfOutputIntent_m = pdfOutputIntent.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeOutputIntent } = _pdfOutputIntent_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeOutputIntent', () => {
    test('minimal with /S', () => {
        const r = typeOutputIntent(obj.dict({
            Type: obj.name('OutputIntent'),
            S: obj.name('GTS_PDFA1')
        }));
        expect(r.subtype).toBe('GTS_PDFA1');
    });
    test('reads all entries', () => {
        const r = typeOutputIntent(obj.dict({
            S: obj.name('GTS_PDFX'),
            OutputCondition: obj.string(u8('cond')),
            OutputConditionIdentifier: obj.string(u8('id')),
            RegistryName: obj.string(u8('http://x')),
            Info: obj.string(u8('info')),
            DestOutputProfile: obj.ref(5, 0),
            MixingHints: obj.dict({}),
            SpectralData: obj.dict({})
        }));
        expect(r.outputCondition).toBeDefined();
        expect(r.destOutputProfile.type).toBe('ref');
        expect(r.mixingHints.type).toBe('dict');
    });
    test('preserves unknown', () => {
        const r = typeOutputIntent(obj.dict({
            S: obj.name('X'), Foo: obj.int(1)
        }));
        expect(r._extras.Foo.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeOutputIntent(obj.array([]))).toThrow(ParseError);
    });
    test('rejects missing /S', () => {
        expect(() => typeOutputIntent(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad /Type', () => {
        expect(() => typeOutputIntent(obj.dict({
            Type: obj.name('Other'), S: obj.name('X')
        }))).toThrow(ParseError);
    });
    test('rejects bad string entry', () => {
        expect(() => typeOutputIntent(obj.dict({
            S: obj.name('X'), Info: obj.int(1)
        }))).toThrow(ParseError);
    });
    test('rejects bad profile type', () => {
        expect(() => typeOutputIntent(obj.dict({
            S: obj.name('X'), DestOutputProfile: obj.int(1)
        }))).toThrow(ParseError);
    });
    test('rejects bad mixing', () => {
        expect(() => typeOutputIntent(obj.dict({
            S: obj.name('X'), MixingHints: obj.int(1)
        }))).toThrow(ParseError);
    });
});

describe('pdfOutputIntent module', () => {
    test('module shape + worker safety', () => {
        expect(pdfOutputIntent.name).toBe('pdfOutputIntent');
        expect(pdfOutputIntent.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfOutputIntent.factory.toString()).toContain('function');
        const m = pdfOutputIntent.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeOutputIntent).toBe('function');
    });
});
