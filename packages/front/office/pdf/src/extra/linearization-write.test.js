// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfLinearizationWrite } from './linearization-write.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { RenderError } = _errors;
const _parserObj = pdfParserObj.factory();
const {
    buildLinearizedDict, buildHintStreamStub, validateLinearizedDict,
    LINEARIZED_KEYS
} = pdfLinearizationWrite.factory(_errors, _parserObj);
const validParams = {
    fileLength: 1000,
    hintOffset: 100,
    hintLength: 50,
    firstPageObj: 4,
    firstPageEnd: 500,
    pageCount: 3,
    mainXrefOffset: 950
};

describe('buildLinearizedDict', () => {
    test('emits all required entries', () => {
        const d = buildLinearizedDict(validParams);
        expect(d.type).toBe('dict');
        expect(d.entries.Linearized.value).toBeCloseTo(1.0);
        expect(d.entries.L.value).toBe(1000);
        expect(d.entries.H.items.length).toBe(2);
        expect(d.entries.O.value).toBe(4);
    });
    test('includes /P when given', () => {
        const d = buildLinearizedDict({ ...validParams, firstPage: 0 });
        expect(d.entries.P.value).toBe(0);
    });
    test('rejects missing required param', () => {
        const bad = { ...validParams };
        delete bad.fileLength;
        expect(() => buildLinearizedDict(bad)).toThrow(RenderError);
    });
    test('rejects missing hint params', () => {
        const bad = { ...validParams, hintOffset: null };
        expect(() => buildLinearizedDict(bad)).toThrow(RenderError);
    });
    test('rejects bad input', () => {
        expect(() => buildLinearizedDict(null)).toThrow(RenderError);
    });
});

describe('buildHintStreamStub', () => {
    test('returns a stream with zero-length body', () => {
        const s = buildHintStreamStub();
        expect(s.type).toBe('stream');
        expect(s.raw.length).toBe(0);
        expect(s.dict.entries.Length.value).toBe(0);
    });
});

describe('validateLinearizedDict', () => {
    test('passes on a built dict', () => {
        const r = validateLinearizedDict(buildLinearizedDict(validParams));
        expect(r.pass).toBe(true);
    });
    test('errors on missing entries', () => {
        const r = validateLinearizedDict({ type: 'dict', entries: {} });
        expect(r.errors.length).toBeGreaterThan(0);
    });
    test('rejects non-dict', () => {
        expect(() => validateLinearizedDict({ type: 'int', value: 1 }))
            .toThrow(RenderError);
    });
});

describe('LINEARIZED_KEYS', () => {
    test('frozen', () => {
        expect(Object.isFrozen(LINEARIZED_KEYS)).toBe(true);
        expect(LINEARIZED_KEYS.includes('L')).toBe(true);
    });
});

describe('pdfLinearizationWrite module', () => {
    test('module shape + worker safety', () => {
        expect(pdfLinearizationWrite.name).toBe('pdfLinearizationWrite');
        expect(pdfLinearizationWrite.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfLinearizationWrite.factory.toString()).toContain('function');
        const m = pdfLinearizationWrite.factory(_pdfErrors_TD1, {});
        expect(typeof m.buildLinearizedDict).toBe('function');
        expect(typeof m.buildHintStreamStub).toBe('function');
        expect(typeof m.validateLinearizedDict).toBe('function');
    });
});
