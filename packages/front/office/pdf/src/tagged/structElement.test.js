// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfStructElement } from './structElement.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfStructElement_m = pdfStructElement.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeStructElement } = _pdfStructElement_m;

describe('typeStructElement', () => {
    test('minimal valid (S only)', () => {
        const d = obj.dict({ S: obj.name('P') });
        const r = typeStructElement(d);
        expect(r.s).toBe('P');
    });

    test('all optional scalar entries', () => {
        const d = obj.dict({
            Type: obj.name('StructElem'),
            S: obj.name('H1'),
            P: obj.ref(2, 0),
            Pg: obj.ref(3, 0),
            ID: obj.string(new Uint8Array([0x69, 0x64])),
            R: obj.int(1),
            T: obj.string(new Uint8Array([0x74])),
            Lang: obj.string(new Uint8Array([0x65, 0x6e])),
            Alt: obj.string(new Uint8Array([0x61])),
            E: obj.string(new Uint8Array([0x65])),
            ActualText: obj.string(new Uint8Array([0x78])),
            NS: obj.ref(4, 0),
            PhoneticAlphabet: obj.name('ipa'),
            Phoneme: obj.string(new Uint8Array([0x70])),
            C: obj.name('cls1')
        });
        const r = typeStructElement(d);
        expect(r.s).toBe('H1');
        expect(r.p.num).toBe(2);
        expect(r.pg.num).toBe(3);
        expect(r.r).toBe(1);
        expect(r.ns.num).toBe(4);
        expect(r.phoneticAlphabet).toBe('ipa');
        expect(r.c.type).toBe('name');
    });

    test('K as ref → kind elem', () => {
        const d = obj.dict({ S: obj.name('P'), K: obj.ref(5, 0) });
        const r = typeStructElement(d);
        expect(r.k).toEqual([{ kind: 'elem', ref: { type: 'ref', num: 5, gen: 0 } }]);
    });

    test('K as int → kind mcid', () => {
        const d = obj.dict({ S: obj.name('P'), K: obj.int(7) });
        const r = typeStructElement(d);
        expect(r.k[0]).toEqual({ kind: 'mcid', mcid: 7 });
    });

    test('K as mixed array', () => {
        const mcr = obj.dict({
            Type: obj.name('MCR'),
            Pg: obj.ref(10, 0),
            MCID: obj.int(3)
        });
        const objr = obj.dict({
            Type: obj.name('OBJR'),
            Obj: obj.ref(11, 0)
        });
        const d = obj.dict({
            S: obj.name('Sect'),
            K: obj.array([obj.ref(5, 0), obj.int(2), mcr, objr])
        });
        const r = typeStructElement(d);
        expect(r.k).toHaveLength(4);
        expect(r.k[0].kind).toBe('elem');
        expect(r.k[1].kind).toBe('mcid');
        expect(r.k[2].kind).toBe('mcr');
        expect(r.k[2].mcid).toBe(3);
        expect(r.k[3].kind).toBe('objr');
    });

    test('unlabelled dict with MCID treated as mcr', () => {
        const d = obj.dict({
            S: obj.name('P'),
            K: obj.dict({ MCID: obj.int(9) })
        });
        const r = typeStructElement(d);
        expect(r.k[0]).toEqual({ kind: 'mcr', mcid: 9, raw: expect.any(Object) });
    });

    test('preserves unknown entries in _extras', () => {
        const d = obj.dict({ S: obj.name('P'), Custom: obj.int(1) });
        const r = typeStructElement(d);
        expect(r._extras.Custom.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeStructElement(obj.array([]))).toThrow(ParseError);
    });

    test('rejects missing /S', () => {
        expect(() => typeStructElement(obj.dict({}))).toThrow(ParseError);
    });

    test('rejects bad /Type', () => {
        const d = obj.dict({ Type: obj.name('Other'), S: obj.name('P') });
        expect(() => typeStructElement(d)).toThrow(ParseError);
    });

    test('rejects malformed kid', () => {
        const d = obj.dict({ S: obj.name('P'), K: obj.array([obj.name('bad')]) });
        expect(() => typeStructElement(d)).toThrow(ParseError);
    });
});

describe('pdfStructElement module', () => {
    test('module shape + worker safety', () => {
        expect(pdfStructElement.name).toBe('pdfStructElement');
        expect(pdfStructElement.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfStructElement.factory.toString()).toContain('function');
        const m = pdfStructElement.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeStructElement).toBe('function');
    });
});
