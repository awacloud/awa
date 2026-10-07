// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParentTree } from './parentTree.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfParentTree_m = pdfParentTree.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { lookupParent } = _pdfParentTree_m;

function makeStore(entries) {
    return function resolve(ref) {
        const key = ref.num + ':' + ref.gen;
        const v = entries[key];
        if (!v) throw new Error('missing ' + key);
        return v;
    };
}

describe('lookupParent', () => {
    test('flat /Nums leaf hit', () => {
        const tree = obj.dict({
            Nums: obj.array([obj.int(0), obj.ref(5, 0), obj.int(1), obj.ref(6, 0)])
        });
        const r = lookupParent(tree, 1, () => null);
        expect(r.type).toBe('ref');
        expect(r.num).toBe(6);
    });

    test('flat /Nums leaf miss', () => {
        const tree = obj.dict({
            Nums: obj.array([obj.int(0), obj.ref(5, 0)])
        });
        expect(lookupParent(tree, 99, () => null)).toBeNull();
    });

    test('intermediate /Kids with /Limits', () => {
        const leafA = obj.dict({
            Limits: obj.array([obj.int(0), obj.int(1)]),
            Nums: obj.array([obj.int(0), obj.ref(10, 0), obj.int(1), obj.ref(11, 0)])
        });
        const leafB = obj.dict({
            Limits: obj.array([obj.int(5), obj.int(7)]),
            Nums: obj.array([obj.int(5), obj.ref(12, 0), obj.int(7), obj.ref(13, 0)])
        });
        const root = obj.dict({
            Kids: obj.array([obj.ref(100, 0), obj.ref(101, 0)])
        });
        const resolve = makeStore({ '100:0': leafA, '101:0': leafB });
        const r = lookupParent(root, 7, resolve);
        expect(r.num).toBe(13);
    });

    test('tree passed as ref', () => {
        const root = obj.dict({
            Nums: obj.array([obj.int(2), obj.ref(20, 0)])
        });
        const resolve = makeStore({ '99:0': root });
        const r = lookupParent({ type: 'ref', num: 99, gen: 0 }, 2, resolve);
        expect(r.num).toBe(20);
    });

    test('returns array values too', () => {
        const arr = obj.array([obj.ref(1, 0), obj.ref(2, 0)]);
        const tree = obj.dict({ Nums: obj.array([obj.int(0), arr]) });
        const r = lookupParent(tree, 0, () => null);
        expect(r.type).toBe('array');
        expect(r.items).toHaveLength(2);
    });

    test('rejects non-dict node', () => {
        expect(() => lookupParent(obj.array([]), 0, () => null))
            .toThrow(ParseError);
    });

    test('rejects odd-length /Nums', () => {
        const tree = obj.dict({ Nums: obj.array([obj.int(0)]) });
        expect(() => lookupParent(tree, 0, () => null)).toThrow(ParseError);
    });

    test('rejects bad /Limits', () => {
        const leaf = obj.dict({
            Limits: obj.array([obj.int(0)]),
            Nums: obj.array([])
        });
        const root = obj.dict({ Kids: obj.array([obj.ref(50, 0)]) });
        const resolve = makeStore({ '50:0': leaf });
        expect(() => lookupParent(root, 0, resolve)).toThrow(ParseError);
    });

    test('rejects empty node', () => {
        expect(() => lookupParent(obj.dict({}), 0, () => null))
            .toThrow(ParseError);
    });

    test('rejects non-ref kid', () => {
        const root = obj.dict({ Kids: obj.array([obj.int(1)]) });
        expect(() => lookupParent(root, 0, () => null)).toThrow(ParseError);
    });

    test('depth cap honoured', () => {
        const leaf = obj.dict({ Nums: obj.array([obj.int(0), obj.ref(1, 0)]) });
        const wrap = obj.dict({
            Limits: obj.array([obj.int(0), obj.int(0)]),
            Kids: obj.array([obj.ref(60, 0)])
        });
        const root = obj.dict({
            Kids: obj.array([obj.ref(61, 0)])
        });
        const resolve = makeStore({ '60:0': leaf, '61:0': wrap });
        expect(() => lookupParent(root, 0, resolve, { maxDepth: 1 }))
            .toThrow(ParseError);
    });
});

describe('pdfParentTree module', () => {
    test('module shape + worker safety', () => {
        expect(pdfParentTree.name).toBe('pdfParentTree');
        expect(pdfParentTree.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfParentTree.factory.toString()).toContain('function');
        const m = pdfParentTree.factory(_pdfErrors_TD1, {});
        expect(typeof m.lookupParent).toBe('function');
    });
});
