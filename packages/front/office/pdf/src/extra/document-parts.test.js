// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfDocumentParts } from './document-parts.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeDPartRoot, typeDPart, typeDPM, walkDParts } =
    pdfDocumentParts.factory(_errors, _parserObj);
describe('typeDPartRoot', () => {
    test('minimal root', () => {
        const r = typeDPartRoot(obj.dict({
            Type: obj.name('DPartRoot'),
            DPartRootNode: obj.ref(2, 0)
        }));
        expect(r.rootNode.type).toBe('ref');
    });
    test('records recordLevel and nodeNameList', () => {
        const r = typeDPartRoot(obj.dict({
            DPartRootNode: obj.ref(2, 0),
            RecordLevel: obj.int(3),
            NodeNameList: obj.array([obj.name('Chapter'), obj.name('Section')])
        }));
        expect(r.recordLevel).toBe(3);
        expect(r.nodeNameList).toEqual(['Chapter', 'Section']);
    });
    test('preserves _extras', () => {
        const r = typeDPartRoot(obj.dict({
            DPartRootNode: obj.ref(2, 0), Foo: obj.int(1)
        }));
        expect(r._extras.Foo.value).toBe(1);
    });
    test('rejects non-dict', () => {
        expect(() => typeDPartRoot(obj.array([]))).toThrow(ParseError);
    });
    test('rejects missing DPartRootNode', () => {
        expect(() => typeDPartRoot(obj.dict({}))).toThrow(ParseError);
    });
});

describe('typeDPart', () => {
    test('minimal node', () => {
        const r = typeDPart(obj.dict({ Type: obj.name('DPart') }));
        expect(r.dParts).toBe(null);
    });
    test('reads children and DPM', () => {
        const r = typeDPart(obj.dict({
            DParts: obj.array([obj.ref(3, 0), obj.ref(4, 0)]),
            Start:  obj.int(0),
            End:    obj.int(5),
            DPM:    obj.dict({ Author: obj.name('x') })
        }));
        expect(r.dParts.length).toBe(2);
        expect(r.start).toBe(0);
        expect(r.dpm.entries.Author).toBeDefined();
    });
    test('preserves _extras', () => {
        const r = typeDPart(obj.dict({ Foo: obj.int(7) }));
        expect(r._extras.Foo.value).toBe(7);
    });
    test('rejects non-dict', () => {
        expect(() => typeDPart(obj.int(1))).toThrow(ParseError);
    });
    test('rejects bad /Type', () => {
        expect(() => typeDPart(obj.dict({
            Type: obj.name('Other')
        }))).toThrow(ParseError);
    });
});

describe('typeDPM', () => {
    test('rejects non-dict', () => {
        expect(() => typeDPM(obj.array([]))).toThrow(ParseError);
    });
    test('captures entries', () => {
        const r = typeDPM(obj.dict({ K: obj.int(1) }));
        expect(r.entries.K.value).toBe(1);
    });
});

describe('walkDParts', () => {
    test('visits root', () => {
        const seen = [];
        walkDParts({ dParts: null }, n => seen.push(n));
        expect(seen.length).toBe(1);
    });
    test('rejects bad visitor', () => {
        expect(() => walkDParts({}, 'nope')).toThrow(ParseError);
    });
});

describe('pdfDocumentParts module', () => {
    test('module shape + worker safety', () => {
        expect(pdfDocumentParts.name).toBe('pdfDocumentParts');
        expect(pdfDocumentParts.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfDocumentParts.factory.toString()).toContain('function');
        const m = pdfDocumentParts.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeDPartRoot).toBe('function');
        expect(typeof m.typeDPart).toBe('function');
        expect(typeof m.typeDPM).toBe('function');
        expect(typeof m.walkDParts).toBe('function');
    });
});
