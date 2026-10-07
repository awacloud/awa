// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfStructTree } from './structTree.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfStructTree_m = pdfStructTree.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeStructTreeRoot } = _pdfStructTree_m;

describe('typeStructTreeRoot', () => {
    test('minimal valid dict', () => {
        const d = obj.dict({ Type: obj.name('StructTreeRoot') });
        const r = typeStructTreeRoot(d);
        expect(r.raw).toBe(d);
        expect(r._extras).toEqual({});
    });

    test('parses K as single ref into kids array', () => {
        const d = obj.dict({
            Type: obj.name('StructTreeRoot'),
            K: obj.ref(5, 0)
        });
        const r = typeStructTreeRoot(d);
        expect(r.kids).toHaveLength(1);
        expect(r.kids[0].type).toBe('ref');
    });

    test('parses K as array of refs', () => {
        const d = obj.dict({
            Type: obj.name('StructTreeRoot'),
            K: obj.array([obj.ref(5, 0), obj.ref(6, 0)])
        });
        const r = typeStructTreeRoot(d);
        expect(r.kids).toHaveLength(2);
    });

    test('captures optional entries', () => {
        const rm = obj.dict({});
        const cm = obj.dict({});
        const ns = obj.array([]);
        const d = obj.dict({
            Type: obj.name('StructTreeRoot'),
            ParentTree: obj.ref(7, 0),
            ParentTreeNextKey: obj.int(42),
            IDTree: obj.ref(8, 0),
            RoleMap: rm,
            ClassMap: cm,
            Namespaces: ns,
            AF: obj.array([]),
            PronunciationLexicon: obj.ref(9, 0)
        });
        const r = typeStructTreeRoot(d);
        expect(r.parentTreeNextKey).toBe(42);
        expect(r.parentTree.type).toBe('ref');
        expect(r.idTree.type).toBe('ref');
        expect(r.roleMap).toBe(rm);
        expect(r.classMap).toBe(cm);
        expect(r.namespaces).toBe(ns);
        expect(r.af.type).toBe('array');
        expect(r.pronunciationLexicon.type).toBe('ref');
    });

    test('preserves unknown entries in _extras', () => {
        const d = obj.dict({
            Type: obj.name('StructTreeRoot'),
            Foo: obj.int(1)
        });
        const r = typeStructTreeRoot(d);
        expect(r._extras.Foo.value).toBe(1);
    });

    test('rejects non-dict', () => {
        expect(() => typeStructTreeRoot(obj.array([]))).toThrow(ParseError);
    });

    test('rejects bad /Type', () => {
        const d = obj.dict({ Type: obj.name('Wrong') });
        expect(() => typeStructTreeRoot(d)).toThrow(ParseError);
    });

    test('rejects bad K kind', () => {
        const d = obj.dict({ Type: obj.name('StructTreeRoot'), K: obj.int(1) });
        expect(() => typeStructTreeRoot(d)).toThrow(ParseError);
    });

    test('rejects malformed K array entry', () => {
        const d = obj.dict({
            Type: obj.name('StructTreeRoot'),
            K: obj.array([obj.int(1)])
        });
        expect(() => typeStructTreeRoot(d)).toThrow(ParseError);
    });
});

describe('pdfStructTree module', () => {
    test('module shape + worker safety', () => {
        expect(pdfStructTree.name).toBe('pdfStructTree');
        expect(pdfStructTree.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfStructTree.factory.toString()).toContain('function');
        const m = pdfStructTree.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeStructTreeRoot).toBe('function');
    });
});
