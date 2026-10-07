// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfMarkedContent } from './markedContent.js';
import { pdfParentTree } from './parentTree.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _errMC = _pdfErrors_TD1;
const _parserMC = pdfParser.factory(_errMC, pdfParserObj.factory(), pdfTokenizer.factory(_errMC, pdfShared.factory()));
const _parentTreeMC = pdfParentTree.factory(_errMC, _parserMC);
const { extractMcids, resolveMcidToStruct } = pdfMarkedContent.factory(_errMC, _parserMC, _parentTreeMC);

function op(name, args) { return { op: name, args: args || [] }; }

describe('extractMcids', () => {
    test('simple BMC...EMC', () => {
        const ops = [
            op('BMC', [obj.name('Span')]),
            op('Tj', [obj.string(new Uint8Array([0x68]))]),
            op('EMC')
        ];
        const r = extractMcids(ops);
        expect(r).toHaveLength(1);
        expect(r[0].tag).toBe('Span');
        expect(r[0].start).toBe(0);
        expect(r[0].end).toBe(2);
        expect(r[0].mcid).toBeNull();
        expect(r[0].properties).toBeNull();
    });

    test('BDC with inline dict captures MCID', () => {
        const props = obj.dict({ MCID: obj.int(7) });
        const ops = [
            op('BDC', [obj.name('P'), props]),
            op('Tj', [obj.string(new Uint8Array([0x68]))]),
            op('EMC')
        ];
        const r = extractMcids(ops);
        expect(r[0].mcid).toBe(7);
        expect(r[0].properties).toBe(props);
    });

    test('BDC with name reference (unresolved)', () => {
        const ops = [
            op('BDC', [obj.name('Span'), obj.name('MC1')]),
            op('EMC')
        ];
        const r = extractMcids(ops);
        expect(r[0].mcid).toBeNull();
        expect(r[0].properties.type).toBe('name');
    });

    test('nested sequences in encounter order', () => {
        const ops = [
            op('BMC', [obj.name('Outer')]),
            op('BDC', [obj.name('Inner'), obj.dict({ MCID: obj.int(1) })]),
            op('EMC'),
            op('EMC')
        ];
        const r = extractMcids(ops);
        expect(r).toHaveLength(2);
        expect(r[0].tag).toBe('Outer');
        expect(r[1].tag).toBe('Inner');
        expect(r[0].start).toBe(0);
        expect(r[0].end).toBe(3);
        expect(r[1].start).toBe(1);
        expect(r[1].end).toBe(2);
    });

    test('rejects non-array input', () => {
        expect(() => extractMcids(null)).toThrow(ParseError);
    });

    test('rejects unmatched EMC', () => {
        expect(() => extractMcids([op('EMC')])).toThrow(ParseError);
    });

    test('rejects unterminated BMC', () => {
        expect(() => extractMcids([op('BMC', [obj.name('X')])])).toThrow(ParseError);
    });

    test('rejects bad tag', () => {
        expect(() => extractMcids([op('BMC', [obj.int(1)]), op('EMC')]))
            .toThrow(ParseError);
    });
});

describe('resolveMcidToStruct', () => {
    test('looks up StructElem ref by MCID through ParentTree', () => {
        const arr = obj.array([obj.ref(50, 0), obj.ref(51, 0), obj.ref(52, 0)]);
        const tree = obj.dict({
            Nums: obj.array([obj.int(3), arr])
        });
        const page = obj.dict({ StructParents: obj.int(3) });
        const r = resolveMcidToStruct(page, 1, tree, () => null);
        expect(r.num).toBe(51);
    });

    test('returns null when /StructParents absent', () => {
        const page = obj.dict({});
        const tree = obj.dict({ Nums: obj.array([]) });
        expect(resolveMcidToStruct(page, 0, tree, () => null)).toBeNull();
    });

    test('returns null when MCID out of bounds', () => {
        const arr = obj.array([obj.ref(1, 0)]);
        const tree = obj.dict({ Nums: obj.array([obj.int(0), arr]) });
        const page = obj.dict({ StructParents: obj.int(0) });
        expect(resolveMcidToStruct(page, 99, tree, () => null)).toBeNull();
    });

    test('returns null when key not found in tree', () => {
        const tree = obj.dict({ Nums: obj.array([obj.int(5), obj.array([])]) });
        const page = obj.dict({ StructParents: obj.int(99) });
        expect(resolveMcidToStruct(page, 0, tree, () => null)).toBeNull();
    });

    test('resolves array through indirection', () => {
        const arr = obj.array([obj.ref(70, 0)]);
        const tree = obj.dict({ Nums: obj.array([obj.int(0), obj.ref(80, 0)]) });
        const page = obj.dict({ StructParents: obj.int(0) });
        const resolve = (ref) => {
            if (ref.num === 80) return arr;
            return null;
        };
        const r = resolveMcidToStruct(page, 0, tree, resolve);
        expect(r.num).toBe(70);
    });

    test('rejects entry that is not array (page mapping)', () => {
        const tree = obj.dict({
            Nums: obj.array([obj.int(0), obj.ref(99, 0)])
        });
        const page = obj.dict({ StructParents: obj.int(0) });
        const resolve = () => obj.dict({});
        expect(() => resolveMcidToStruct(page, 0, tree, resolve))
            .toThrow(ParseError);
    });

    test('rejects non-dict page', () => {
        expect(() => resolveMcidToStruct(obj.array([]), 0, obj.dict({}), () => null))
            .toThrow(ParseError);
    });
});

describe('pdfMarkedContent module', () => {
    test('module shape + worker safety', () => {
        expect(pdfMarkedContent.name).toBe('pdfMarkedContent');
        expect(pdfMarkedContent.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfParentTree']);
        expect(pdfMarkedContent.factory.toString()).toContain('function');
        const m = pdfMarkedContent.factory(_pdfErrors_TD1, {}, {});
        expect(typeof m.extractMcids).toBe('function');
        expect(typeof m.resolveMcidToStruct).toBe('function');
    });
});
