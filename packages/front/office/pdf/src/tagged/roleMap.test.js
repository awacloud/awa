// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfRoleMap } from './roleMap.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfShared } from '../_shared/index.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
const _pdfRoleMap_m = pdfRoleMap.factory(_pdfErrors_TD1, pdfParser.factory(_pdfErrors_TD1, pdfParserObj.factory(), pdfTokenizer.factory(_pdfErrors_TD1, pdfShared.factory())));
const { typeRoleMap, resolveStandardType, isStandardType, STANDARD_TYPES } = _pdfRoleMap_m;

describe('typeRoleMap', () => {
    test('empty map', () => {
        const r = typeRoleMap(obj.dict({}));
        expect(r.map).toEqual({});
    });

    test('flat aliases', () => {
        const d = obj.dict({
            MyHead: obj.name('H1'),
            Box:    obj.name('Div')
        });
        const r = typeRoleMap(d);
        expect(r.map).toEqual({ MyHead: 'H1', Box: 'Div' });
    });

    test('rejects non-dict', () => {
        expect(() => typeRoleMap(obj.array([]))).toThrow(ParseError);
    });

    test('rejects non-name value', () => {
        const d = obj.dict({ Foo: obj.int(1) });
        expect(() => typeRoleMap(d)).toThrow(ParseError);
    });
});

describe('resolveStandardType', () => {
    test('returns standard immediately when input is standard', () => {
        const r = resolveStandardType('H1', {});
        expect(r.standard).toBe('H1');
        expect(r.chain).toEqual(['H1']);
    });

    test('walks one-hop alias', () => {
        const r = resolveStandardType('MyHead', { MyHead: 'H1' });
        expect(r.standard).toBe('H1');
        expect(r.chain).toEqual(['MyHead', 'H1']);
    });

    test('walks multi-hop alias', () => {
        const r = resolveStandardType('A', { A: 'B', B: 'P' });
        expect(r.standard).toBe('P');
        expect(r.chain).toEqual(['A', 'B', 'P']);
    });

    test('namespace map wins over global', () => {
        const r = resolveStandardType('Foo',
            { Foo: 'P' },
            { Foo: 'H1' });
        expect(r.standard).toBe('H1');
    });

    test('null standard on dangling alias', () => {
        const r = resolveStandardType('Unknown', {});
        expect(r.standard).toBeNull();
    });

    test('cycle detection', () => {
        expect(() => resolveStandardType('A', { A: 'B', B: 'A' }))
            .toThrow(ParseError);
    });

    test('self-loop returns null without throwing', () => {
        const r = resolveStandardType('X', { X: 'X' });
        expect(r.standard).toBeNull();
    });
});

describe('isStandardType', () => {
    test('known types', () => {
        expect(isStandardType('Document')).toBe(true);
        expect(isStandardType('H1')).toBe(true);
        expect(isStandardType('Figure')).toBe(true);
        expect(isStandardType('Title')).toBe(true);
        expect(isStandardType('FENote')).toBe(true);
    });

    test('unknown types', () => {
        expect(isStandardType('Banana')).toBe(false);
    });
});

describe('pdfRoleMap module', () => {
    test('module shape + worker safety', () => {
        expect(pdfRoleMap.name).toBe('pdfRoleMap');
        expect(pdfRoleMap.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfRoleMap.factory.toString()).toContain('function');
        const m = pdfRoleMap.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeRoleMap).toBe('function');
        expect(typeof m.resolveStandardType).toBe('function');
        expect(typeof m.isStandardType).toBe('function');
        expect(m.STANDARD_TYPES instanceof Set).toBe(true);
        expect(m.STANDARD_TYPES.has('P')).toBe(true);
    });
});
