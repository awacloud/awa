// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParserObj } from './parser-obj.js';
const { obj, getEntry, isType } = pdfParserObj.factory();

const te = new TextEncoder();

describe('obj constructors', () => {
    test('null / bool / int / real / name', () => {
        expect(obj.nul()).toEqual({ type: 'null' });
        expect(obj.bool(1)).toEqual({ type: 'bool', value: true });
        expect(obj.bool(0)).toEqual({ type: 'bool', value: false });
        expect(obj.int(3.9)).toEqual({ type: 'int', value: 3 });
        expect(obj.real('2.5')).toEqual({ type: 'real', value: 2.5 });
        expect(obj.name('X')).toEqual({ type: 'name', value: 'X' });
    });

    test('string defaults to lit syntax', () => {
        const s = obj.string(te.encode('hi'));
        expect(s.syntax).toBe('lit');
        expect(s.value).toBeInstanceOf(Uint8Array);
    });

    test('string respects explicit hex syntax', () => {
        expect(obj.string(te.encode('hi'), 'hex').syntax).toBe('hex');
        expect(obj.string(te.encode('hi'), 'unknown').syntax).toBe('lit');
    });

    test('array / dict default to empty containers', () => {
        expect(obj.array()).toEqual({ type: 'array', items: [] });
        expect(obj.dict()).toEqual({ type: 'dict', entries: {} });
    });

    test('ref normalizes ints', () => {
        expect(obj.ref(2.7, 0.5)).toEqual({ type: 'ref', num: 2, gen: 0 });
        expect(obj.ref(1)).toEqual({ type: 'ref', num: 1, gen: 0 });
    });

    test('stream attaches dict + raw', () => {
        const d = obj.dict({ Length: obj.int(2) });
        const raw = te.encode('ab');
        const s = obj.stream(d, raw);
        expect(s.dict).toBe(d);
        expect(s.raw).toBe(raw);
    });
});

describe('getEntry', () => {
    test('returns value or undefined', () => {
        const d = obj.dict({ A: obj.int(1) });
        expect(getEntry(d, 'A').value).toBe(1);
        expect(getEntry(d, 'Z')).toBeUndefined();
        expect(getEntry(null, 'A')).toBeUndefined();
        expect(getEntry(obj.array([]), 'A')).toBeUndefined();
    });
});

describe('isType', () => {
    test('discriminates by .type', () => {
        expect(isType(obj.dict({}), 'dict')).toBe(true);
        expect(isType(obj.dict({}), 'array')).toBe(false);
        expect(isType(null, 'dict')).toBe(false);
        expect(isType({}, 'dict')).toBe(false);
    });
});
