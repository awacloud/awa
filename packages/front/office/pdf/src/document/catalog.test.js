// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfCatalog } from './catalog.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeCatalog } = pdfCatalog.factory(errors, parserObj);

describe('typeCatalog', () => {
    test('minimal valid catalog', () => {
        const dict = obj.dict({
            Type: obj.name('Catalog'),
            Pages: obj.ref(2, 0)
        });
        const c = typeCatalog(dict);
        expect(c.pages).toEqual({ num: 2, gen: 0 });
        expect(c.raw).toBe(dict);
        expect(c._extras).toEqual({});
    });

    test('reads optional typed entries', () => {
        const dict = obj.dict({
            Type: obj.name('Catalog'),
            Pages: obj.ref(2, 0),
            Version: obj.name('2.0'),
            PageLayout: obj.name('TwoPageRight'),
            PageMode: obj.name('UseOutlines'),
            Outlines: obj.ref(5, 0),
            Metadata: obj.ref(6, 0),
            StructTreeRoot: obj.ref(7, 0)
        });
        const c = typeCatalog(dict);
        expect(c.version).toBe('2.0');
        expect(c.pageLayout).toBe('TwoPageRight');
        expect(c.pageMode).toBe('UseOutlines');
        expect(c.outlines).toEqual({ type: 'ref', num: 5, gen: 0 });
        expect(c.metadata.num).toBe(6);
        expect(c.structTreeRoot.num).toBe(7);
    });

    test('preserves unknown entries in _extras', () => {
        const dict = obj.dict({
            Type: obj.name('Catalog'),
            Pages: obj.ref(2, 0),
            CustomFooBar: obj.int(42)
        });
        const c = typeCatalog(dict);
        expect(c._extras.CustomFooBar).toEqual({ type: 'int', value: 42 });
    });

    test('tolerates missing /Type', () => {
        const dict = obj.dict({ Pages: obj.ref(2, 0) });
        expect(typeCatalog(dict).pages.num).toBe(2);
    });

    test('rejects non-dict input', () => {
        expect(() => typeCatalog(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong /Type', () => {
        const dict = obj.dict({
            Type: obj.name('Pages'),
            Pages: obj.ref(2, 0)
        });
        expect(() => typeCatalog(dict)).toThrow(ParseError);
    });

    test('rejects missing /Pages', () => {
        const dict = obj.dict({ Type: obj.name('Catalog') });
        expect(() => typeCatalog(dict)).toThrow(ParseError);
    });
});

describe('pdfCatalog module', () => {
    test('module shape + worker safety', () => {
        expect(pdfCatalog.name).toBe('pdfCatalog');
        expect(pdfCatalog.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfCatalog.factory.toString()).toContain('function');
        const m = pdfCatalog.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeCatalog).toBe('function');
    });
});
