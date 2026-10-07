// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfPageBoundary } from './pageBoundary.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfPageBoundary_m = pdfPageBoundary.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { effectiveMediaBox, effectiveCropBox, effectiveTrimBox, effectiveBleedBox, effectiveArtBox } = _pdfPageBoundary_m;

describe('page boundary helpers', () => {
    test('uses typed-record fields directly', () => {
        const page = {
            mediaBox: [0, 0, 612, 792],
            cropBox:  [10, 10, 600, 780]
        };
        expect(effectiveMediaBox(page)).toEqual([0, 0, 612, 792]);
        expect(effectiveCropBox(page)).toEqual([10, 10, 600, 780]);
        expect(effectiveTrimBox(page)).toEqual([10, 10, 600, 780]);
        expect(effectiveBleedBox(page)).toEqual([10, 10, 600, 780]);
        expect(effectiveArtBox(page)).toEqual([10, 10, 600, 780]);
    });

    test('falls back through chain', () => {
        const page = { mediaBox: [0, 0, 100, 100] };
        expect(effectiveCropBox(page)).toEqual([0, 0, 100, 100]);
        expect(effectiveTrimBox(page)).toEqual([0, 0, 100, 100]);
    });

    test('reads from raw dict shape', () => {
        const dict = obj.dict({
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            TrimBox:  obj.array([obj.int(5), obj.int(5), obj.real(600.5), obj.int(780)])
        });
        expect(effectiveMediaBox(dict)).toEqual([0, 0, 612, 792]);
        expect(effectiveTrimBox(dict)).toEqual([5, 5, 600.5, 780]);
        expect(effectiveCropBox(dict)).toEqual([0, 0, 612, 792]);
    });

    test('rejects missing MediaBox', () => {
        expect(() => effectiveMediaBox({})).toThrow(ParseError);
    });
    test('rejects bad box length', () => {
        const dict = obj.dict({ MediaBox: obj.array([obj.int(0)]) });
        expect(() => effectiveMediaBox(dict)).toThrow(ParseError);
    });
    test('rejects non-number element', () => {
        const dict = obj.dict({
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.name('x'), obj.int(0)])
        });
        expect(() => effectiveMediaBox(dict)).toThrow(ParseError);
    });
});

describe('pdfPageBoundary module', () => {
    test('module shape + worker safety', () => {
        expect(pdfPageBoundary.name).toBe('pdfPageBoundary');
        expect(pdfPageBoundary.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfPageBoundary.factory.toString()).toContain('function');
        const m = pdfPageBoundary.factory(_pdfErrors_TD1, {});
        expect(typeof m.effectiveMediaBox).toBe('function');
        expect(typeof m.effectiveCropBox).toBe('function');
        expect(typeof m.effectiveTrimBox).toBe('function');
        expect(typeof m.effectiveBleedBox).toBe('function');
        expect(typeof m.effectiveArtBox).toBe('function');
    });
});
