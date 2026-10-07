// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfClassMap } from './classMap.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfClassMap_m = pdfClassMap.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeClassMap, getClassAttributes } = _pdfClassMap_m;

describe('typeClassMap', () => {
    test('empty', () => {
        const r = typeClassMap(obj.dict({}));
        expect(r.classes).toEqual({});
    });

    test('single dict value wrapped as array', () => {
        const attr = obj.dict({ O: obj.name('Layout'), TextAlign: obj.name('Center') });
        const d = obj.dict({ Centered: attr });
        const r = typeClassMap(d);
        expect(r.classes.Centered).toHaveLength(1);
        expect(r.classes.Centered[0]).toBe(attr);
    });

    test('array of attribute dicts', () => {
        const a = obj.dict({ O: obj.name('Layout') });
        const b = obj.dict({ O: obj.name('Table') });
        const d = obj.dict({ Multi: obj.array([a, b]) });
        const r = typeClassMap(d);
        expect(r.classes.Multi).toEqual([a, b]);
    });

    test('rejects non-dict input', () => {
        expect(() => typeClassMap(obj.array([]))).toThrow(ParseError);
    });

    test('rejects non-dict array item', () => {
        const d = obj.dict({ Bad: obj.array([obj.int(1)]) });
        expect(() => typeClassMap(d)).toThrow(ParseError);
    });

    test('rejects unsupported value kind', () => {
        const d = obj.dict({ Bad: obj.int(1) });
        expect(() => typeClassMap(d)).toThrow(ParseError);
    });
});

describe('getClassAttributes', () => {
    test('returns empty when class absent', () => {
        const typed = typeClassMap(obj.dict({}));
        expect(getClassAttributes(typed, 'X')).toEqual([]);
    });

    test('returns full list with no owner filter', () => {
        const a = obj.dict({ O: obj.name('Layout') });
        const b = obj.dict({ O: obj.name('Table') });
        const typed = typeClassMap(obj.dict({ C: obj.array([a, b]) }));
        expect(getClassAttributes(typed, 'C')).toHaveLength(2);
    });

    test('filters by /O owner', () => {
        const a = obj.dict({ O: obj.name('Layout') });
        const b = obj.dict({ O: obj.name('Table') });
        const typed = typeClassMap(obj.dict({ C: obj.array([a, b]) }));
        expect(getClassAttributes(typed, 'C', 'Table')).toEqual([b]);
    });

    test('handles null typed', () => {
        expect(getClassAttributes(null, 'X')).toEqual([]);
    });
});

describe('pdfClassMap module', () => {
    test('module shape + worker safety', () => {
        expect(pdfClassMap.name).toBe('pdfClassMap');
        expect(pdfClassMap.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfClassMap.factory.toString()).toContain('function');
        const m = pdfClassMap.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeClassMap).toBe('function');
        expect(typeof m.getClassAttributes).toBe('function');
    });
});
