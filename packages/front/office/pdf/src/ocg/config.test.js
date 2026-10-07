// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfOCConfig } from './config.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfOCConfig_m = pdfOCConfig.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeOCConfig, typeUsageApp } = _pdfOCConfig_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeOCConfig', () => {
    test('empty dict is valid', () => {
        const c = typeOCConfig(obj.dict({}));
        expect(c._extras).toEqual({});
        expect(c.raw.type).toBe('dict');
    });

    test('reads all common entries', () => {
        const c = typeOCConfig(obj.dict({
            Name: obj.string(u8('default')),
            Creator: obj.string(u8('me')),
            BaseState: obj.name('OFF'),
            ON: obj.array([obj.ref(1, 0)]),
            OFF: obj.array([obj.ref(2, 0)]),
            Locked: obj.array([obj.ref(3, 0)]),
            Intent: obj.name('View'),
            Order: obj.array([obj.ref(1, 0)]),
            ListMode: obj.name('AllPages'),
            RBGroups: obj.array([obj.array([obj.ref(1, 0), obj.ref(2, 0)])]),
            AS: obj.array([obj.dict({
                Event: obj.name('Print'),
                OCGs: obj.array([obj.ref(1, 0)]),
                Category: obj.array([obj.name('Print')])
            })])
        }));
        expect(c.baseState).toBe('OFF');
        expect(c.on.length).toBe(1);
        expect(c.off.length).toBe(1);
        expect(c.locked.length).toBe(1);
        expect(c.intent).toEqual(['View']);
        expect(c.listMode).toBe('AllPages');
        expect(c.rbGroups[0].length).toBe(2);
        expect(c.as[0].event).toBe('Print');
        expect(c.as[0].ocgs.length).toBe(1);
        expect(c.as[0].category).toEqual(['Print']);
    });

    test('Intent as array', () => {
        const c = typeOCConfig(obj.dict({
            Intent: obj.array([obj.name('View'), obj.name('Design')])
        }));
        expect(c.intent).toEqual(['View', 'Design']);
    });

    test('preserves unknown entries', () => {
        const c = typeOCConfig(obj.dict({ Foo: obj.int(7) }));
        expect(c._extras.Foo.value).toBe(7);
    });

    test('rejects non-dict', () => {
        expect(() => typeOCConfig(obj.array([]))).toThrow(ParseError);
    });
    test('rejects bad BaseState', () => {
        expect(() => typeOCConfig(obj.dict({ BaseState: obj.name('Maybe') }))).toThrow(ParseError);
    });
    test('rejects bad ON type', () => {
        expect(() => typeOCConfig(obj.dict({ ON: obj.int(1) }))).toThrow(ParseError);
    });
    test('rejects bad Intent type', () => {
        expect(() => typeOCConfig(obj.dict({ Intent: obj.int(1) }))).toThrow(ParseError);
    });
    test('rejects bad AS', () => {
        expect(() => typeOCConfig(obj.dict({ AS: obj.int(1) }))).toThrow(ParseError);
    });
    test('rejects bad Name', () => {
        expect(() => typeOCConfig(obj.dict({ Name: obj.int(1) }))).toThrow(ParseError);
    });
    test('typeUsageApp rejects non-dict', () => {
        expect(() => typeUsageApp(obj.array([]))).toThrow(ParseError);
    });
});

describe('pdfOCConfig module', () => {
    test('module shape + worker safety', () => {
        expect(pdfOCConfig.name).toBe('pdfOCConfig');
        expect(pdfOCConfig.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfOCConfig.factory.toString()).toContain('function');
        const m = pdfOCConfig.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeOCConfig).toBe('function');
        expect(typeof m.typeUsageApp).toBe('function');
    });
});

const codeOfOcg = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

describe('typeOCConfig — entry typing', () => {
    test('/Creator must be a string', () => {
        expect(codeOfOcg(() => typeOCConfig(obj.dict({ Creator: obj.name('Acme') }))))
            .toBe('pdf/ocg/config/bad-creator');
        expect(typeOCConfig(obj.dict({ Creator: obj.string(u8('Acme')) })).creator)
            .toBeInstanceOf(Uint8Array);
    });

    test('/Order must be an array, exposed verbatim', () => {
        expect(codeOfOcg(() => typeOCConfig(obj.dict({ Order: obj.dict({}) }))))
            .toBe('pdf/ocg/config/bad-order');
        const r = typeOCConfig(obj.dict({ Order: obj.array([obj.ref(1, 0), obj.array([])]) }));
        expect(r.order.length).toBe(2);
    });

    test('/ListMode must be a name', () => {
        expect(codeOfOcg(() => typeOCConfig(obj.dict({ ListMode: obj.string(u8('AllPages')) }))))
            .toBe('pdf/ocg/config/bad-list-mode');
        expect(typeOCConfig(obj.dict({ ListMode: obj.name('VisiblePages') })).listMode)
            .toBe('VisiblePages');
    });

    test('/RBGroups must be an array', () => {
        expect(codeOfOcg(() => typeOCConfig(obj.dict({ RBGroups: obj.name('x') }))))
            .toBe('pdf/ocg/config/bad-rb');
        expect(typeOCConfig(obj.dict({ RBGroups: obj.array([obj.array([obj.ref(2, 0)])]) }))
            .rbGroups.length).toBe(1);
    });
});
