// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfPage } from './page.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typePage } = pdfPage.factory(errors, parserObj);

function box(a, b, c, d) {
    return obj.array([obj.int(a), obj.int(b), obj.int(c), obj.int(d)]);
}

describe('typePage', () => {
    test('basic page', () => {
        const dict = obj.dict({
            Type: obj.name('Page'),
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 612, 792),
            Contents: obj.ref(7, 0)
        });
        const p = typePage(dict);
        expect(p.parent).toEqual({ num: 2, gen: 0 });
        expect(p.mediaBox).toEqual([0, 0, 612, 792]);
        expect(p.contents).toEqual([{ num: 7, gen: 0 }]);
        expect(p.rotate).toBe(0);
        expect(p.annots).toEqual([]);
    });

    test('Contents as array of refs', () => {
        const dict = obj.dict({
            Type: obj.name('Page'),
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 100, 100),
            Contents: obj.array([obj.ref(7, 0), obj.ref(8, 0)])
        });
        expect(typePage(dict).contents).toEqual([
            { num: 7, gen: 0 }, { num: 8, gen: 0 }
        ]);
    });

    test('Contents absent → []', () => {
        const dict = obj.dict({
            Type: obj.name('Page'),
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 1, 1)
        });
        expect(typePage(dict).contents).toEqual([]);
    });

    test('rotate normalization', () => {
        const dict = obj.dict({
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 1, 1),
            Rotate: obj.int(720)
        });
        expect(typePage(dict).rotate).toBe(0);

        const dict2 = obj.dict({
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 1, 1),
            Rotate: obj.int(-90)
        });
        expect(typePage(dict2).rotate).toBe(270);

        const dict3 = obj.dict({
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 1, 1),
            Rotate: obj.int(45) // not multiple of 90 — normalize to 0
        });
        expect(typePage(dict3).rotate).toBe(0);
    });

    test('CropBox / BleedBox / TrimBox / ArtBox', () => {
        const dict = obj.dict({
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 1000, 1000),
            CropBox: box(10, 10, 990, 990),
            BleedBox: box(5, 5, 995, 995),
            TrimBox: box(20, 20, 980, 980),
            ArtBox:  box(30, 30, 970, 970),
        });
        const p = typePage(dict);
        expect(p.cropBox).toEqual([10, 10, 990, 990]);
        expect(p.bleedBox).toEqual([5, 5, 995, 995]);
        expect(p.trimBox).toEqual([20, 20, 980, 980]);
        expect(p.artBox).toEqual([30, 30, 970, 970]);
    });

    test('UserUnit + Tabs + Group + Metadata', () => {
        const groupDict = obj.dict({ S: obj.name('Transparency') });
        const dict = obj.dict({
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 1, 1),
            UserUnit: obj.real(2.5),
            Tabs: obj.name('S'),
            Group: groupDict,
            Metadata: obj.ref(99, 0)
        });
        const p = typePage(dict);
        expect(p.userUnit).toBe(2.5);
        expect(p.tabs).toBe('S');
        expect(p.group).toBe(groupDict);
        expect(p.metadata).toEqual({ type: 'ref', num: 99, gen: 0 });
    });

    test('Annots refs vs array', () => {
        const dict = obj.dict({
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 1, 1),
            Annots: obj.array([obj.ref(10, 0), obj.ref(11, 0)])
        });
        expect(typePage(dict).annots.length).toBe(2);
    });

    test('preserves unknown entries', () => {
        const dict = obj.dict({
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 1, 1),
            CustomKey: obj.int(7)
        });
        expect(typePage(dict)._extras.CustomKey).toEqual({ type: 'int', value: 7 });
    });

    test('rejects bad /Type', () => {
        const dict = obj.dict({
            Type: obj.name('Pages'),
            Parent: obj.ref(2, 0),
            MediaBox: box(0, 0, 1, 1)
        });
        expect(() => typePage(dict)).toThrow(ParseError);
    });

    test('rejects non-dict input', () => {
        expect(() => typePage(obj.array([]))).toThrow(ParseError);
    });
});

describe('pdfPage module', () => {
    test('module shape', () => {
        expect(pdfPage.name).toBe('pdfPage');
        expect(pdfPage.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfPage.factory.toString()).toContain('function');
        expect(typeof pdfPage.factory(_pdfErrors_TD1, {}).typePage).toBe('function');
    });
});
