// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFileSpec } from './fileSpec.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfFileSpec_m = pdfFileSpec.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeFileSpec } = _pdfFileSpec_m;

const u8 = (s) => new TextEncoder().encode(s);

describe('typeFileSpec', () => {
    test('minimal with /F', () => {
        const r = typeFileSpec(obj.dict({
            Type: obj.name('Filespec'),
            F: obj.string(u8('readme.txt'))
        }));
        expect(new TextDecoder().decode(r.f)).toBe('readme.txt');
    });
    test('with embedded files dict + AFRelationship', () => {
        const r = typeFileSpec(obj.dict({
            UF: obj.string(u8('a.pdf')),
            EF: obj.dict({ F: obj.ref(1, 0), UF: obj.ref(1, 0) }),
            AFRelationship: obj.name('Data'),
            Desc: obj.string(u8('hello')),
            ID: obj.array([obj.string(u8('aa')), obj.string(u8('bb'))]),
            V: obj.bool(false)
        }));
        expect(r.embedded.F.type).toBe('ref');
        expect(r.afRelationship).toBe('Data');
        expect(r.afRelationshipStandard).toBe(true);
        expect(r.id.length).toBe(2);
        expect(r.volatile).toBe(false);
    });
    test('non-standard AFRelationship', () => {
        const r = typeFileSpec(obj.dict({
            F: obj.string(u8('x')),
            AFRelationship: obj.name('SomethingCustom')
        }));
        expect(r.afRelationshipStandard).toBe(false);
    });
    test('preserves unknown entries', () => {
        const r = typeFileSpec(obj.dict({
            F: obj.string(u8('x')),
            Foo: obj.int(1)
        }));
        expect(r._extras.Foo.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeFileSpec(obj.array([]))).toThrow(ParseError);
    });
    test('rejects bad /Type', () => {
        expect(() => typeFileSpec(obj.dict({
            Type: obj.name('XYZ'), F: obj.string(u8('a'))
        }))).toThrow(ParseError);
    });
    test('rejects bad path types', () => {
        expect(() => typeFileSpec(obj.dict({ F: obj.int(1) }))).toThrow(ParseError);
    });
    test('rejects empty filespec', () => {
        expect(() => typeFileSpec(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad /EF', () => {
        expect(() => typeFileSpec(obj.dict({
            F: obj.string(u8('x')), EF: obj.int(1)
        }))).toThrow(ParseError);
    });
    test('rejects bad /AFRelationship', () => {
        expect(() => typeFileSpec(obj.dict({
            F: obj.string(u8('x')), AFRelationship: obj.int(1)
        }))).toThrow(ParseError);
    });
});

describe('pdfFileSpec module', () => {
    test('module shape + worker safety', () => {
        expect(pdfFileSpec.name).toBe('pdfFileSpec');
        expect(pdfFileSpec.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfFileSpec.factory.toString()).toContain('function');
        const m = pdfFileSpec.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeFileSpec).toBe('function');
    });
});

const codeOfFs = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

describe('typeFileSpec — malformed entries', () => {
    // Every case carries a legal /F so the rejection provably comes from the
    // entry under test and not from the "no path or embedded file" guard.
    const withPath = (extra) => obj.dict({ F: obj.string(u8('a.txt')), ...extra });

    test('/FS must be a name, and a legal /FS is carried through', () => {
        expect(codeOfFs(() => typeFileSpec(withPath({ FS: obj.string(u8('URL')) }))))
            .toBe('pdf/filespec/bad-fs');
        expect(typeFileSpec(withPath({ FS: obj.name('URL') })).fs).toBe('URL');
    });

    test('/ID must be an array, and non-string items are dropped', () => {
        expect(codeOfFs(() => typeFileSpec(withPath({ ID: obj.string(u8('x')) }))))
            .toBe('pdf/filespec/bad-id');
        const r = typeFileSpec(withPath({
            ID: obj.array([obj.string(u8('aa')), obj.int(1), obj.string(u8('bb'))])
        }));
        expect(r.id.length).toBe(2);
    });

    test('/RF must be a dictionary, and its entries are exposed verbatim', () => {
        expect(codeOfFs(() => typeFileSpec(withPath({ RF: obj.array([]) }))))
            .toBe('pdf/filespec/bad-rf');
        const r = typeFileSpec(withPath({ RF: obj.dict({ F: obj.array([]) }) }));
        expect(r.related.F).toBeDefined();
    });

    test('/Desc must be a string', () => {
        expect(codeOfFs(() => typeFileSpec(withPath({ Desc: obj.name('nope') }))))
            .toBe('pdf/filespec/bad-desc');
        expect(typeFileSpec(withPath({ Desc: obj.string(u8('hi')) })).desc)
            .toBeInstanceOf(Uint8Array);
    });
});
