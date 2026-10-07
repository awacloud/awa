// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfOptionalContentExtended } from './optional-content-extended.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { evaluateVE, typeOrderTree, typeRBGroups, classifyOcgIntent, VE_OPERATORS } =
    pdfOptionalContentExtended.factory(_errors, _parserObj);
const u8 = (s) => new TextEncoder().encode(s);

describe('evaluateVE', () => {
    test('plain ref', () => {
        const on = new Set(['5 0']);
        expect(evaluateVE(obj.ref(5, 0), on)).toBe(true);
        expect(evaluateVE(obj.ref(6, 0), on)).toBe(false);
    });
    test('And/Or/Not', () => {
        const on = new Set(['5 0']);
        const and = obj.array([obj.name('And'), obj.ref(5, 0), obj.ref(5, 0)]);
        expect(evaluateVE(and, on)).toBe(true);
        const or = obj.array([obj.name('Or'), obj.ref(5, 0), obj.ref(7, 0)]);
        expect(evaluateVE(or, on)).toBe(true);
        const not = obj.array([obj.name('Not'), obj.ref(7, 0)]);
        expect(evaluateVE(not, on)).toBe(true);
    });
    test('rejects bad operator', () => {
        expect(() => evaluateVE(
            obj.array([obj.name('Xor'), obj.ref(1, 0)]), new Set()
        )).toThrow(ParseError);
    });
    test('rejects bad state type', () => {
        expect(() => evaluateVE(obj.ref(1, 0), null)).toThrow(ParseError);
    });
    test('rejects /Not arity', () => {
        expect(() => evaluateVE(
            obj.array([obj.name('Not'), obj.ref(1, 0), obj.ref(2, 0)]), new Set()
        )).toThrow(ParseError);
    });
});

describe('typeOrderTree', () => {
    test('reads heading + group + ref', () => {
        const r = typeOrderTree(obj.array([
            obj.string(u8('Layers')),
            obj.array([obj.ref(2, 0), obj.ref(3, 0)]),
            obj.ref(4, 0)
        ]));
        expect(r[0].kind).toBe('heading');
        expect(r[1].kind).toBe('group');
        expect(r[2].kind).toBe('ocg');
    });
    test('rejects non-array', () => {
        expect(() => typeOrderTree(obj.int(1))).toThrow(ParseError);
    });
});

describe('typeRBGroups', () => {
    test('reads groups of refs', () => {
        const r = typeRBGroups(obj.array([
            obj.array([obj.ref(2, 0), obj.ref(3, 0)])
        ]));
        expect(r[0].length).toBe(2);
    });
    test('rejects bad shape', () => {
        expect(() => typeRBGroups(obj.array([obj.int(1)])))
            .toThrow(ParseError);
    });
    test('rejects non-array root', () => {
        expect(() => typeRBGroups(obj.int(1))).toThrow(ParseError);
    });
});

describe('classifyOcgIntent', () => {
    test('single name View', () => {
        expect(classifyOcgIntent(obj.name('View')).view).toBe(true);
    });
    test('array of names', () => {
        const r = classifyOcgIntent(obj.array([
            obj.name('View'), obj.name('Design')
        ]));
        expect(r.view).toBe(true);
        expect(r.design).toBe(true);
    });
    test('null returns empty', () => {
        expect(classifyOcgIntent(null).names).toEqual([]);
    });
    test('rejects bad type', () => {
        expect(() => classifyOcgIntent(obj.int(1))).toThrow(ParseError);
    });
});

describe('VE_OPERATORS', () => {
    test('frozen', () => {
        expect(Object.isFrozen(VE_OPERATORS)).toBe(true);
    });
});

describe('pdfOptionalContentExtended module', () => {
    test('module shape + worker safety', () => {
        expect(pdfOptionalContentExtended.name).toBe('pdfOptionalContentExtended');
        expect(pdfOptionalContentExtended.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfOptionalContentExtended.factory.toString()).toContain('function');
        const m = pdfOptionalContentExtended.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof m.evaluateVE).toBe('function');
        expect(typeof m.typeOrderTree).toBe('function');
        expect(typeof m.typeRBGroups).toBe('function');
        expect(typeof m.classifyOcgIntent).toBe('function');
    });
});
