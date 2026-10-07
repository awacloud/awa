// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfUaTagged } from './pdf-ua-tagged.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { validatePdfUa, validateUaStructElement, UA_STRUCTURE } =
    pdfUaTagged.factory(_errors, _parserObj);
const u8 = (s) => new TextEncoder().encode(s);

describe('validatePdfUa', () => {
    test('passes when all required entries present', () => {
        const r = validatePdfUa({
            catalog: { entries: {
                StructTreeRoot: obj.ref(2, 0),
                Lang: obj.string(u8('en-US')),
                MarkInfo: obj.dict({ Marked: obj.bool(true) }),
                ViewerPreferences: obj.dict({ DisplayDocTitle: obj.bool(true) })
            } },
            p: -1 // all bits set
        });
        expect(r.pass).toBe(true);
    });
    test('errors when MarkInfo missing', () => {
        const r = validatePdfUa({
            catalog: { entries: {
                StructTreeRoot: obj.ref(2, 0),
                Lang: obj.string(u8('en'))
            } }
        });
        expect(r.errors).toContain('catalog requires /MarkInfo dictionary');
    });
    test('errors on missing accessible bit', () => {
        const r = validatePdfUa({
            catalog: { entries: {
                StructTreeRoot: obj.ref(2, 0),
                Lang: obj.string(u8('en')),
                MarkInfo: obj.dict({ Marked: obj.bool(true) })
            } },
            p: 0
        });
        expect(r.errors.some(e => e.includes('accessible'))).toBe(true);
    });
    test('warns on missing ViewerPreferences', () => {
        const r = validatePdfUa({
            catalog: { entries: {
                StructTreeRoot: obj.ref(2, 0),
                Lang: obj.string(u8('en')),
                MarkInfo: obj.dict({ Marked: obj.bool(true) })
            } }
        });
        expect(r.warnings.length).toBeGreaterThan(0);
    });
    test('rejects bad input', () => {
        expect(() => validatePdfUa(null)).toThrow(ParseError);
    });
});

describe('validateUaStructElement', () => {
    test('Figure without Alt fails', () => {
        const r = validateUaStructElement({ s: 'Figure' });
        expect(r.pass).toBe(false);
    });
    test('Figure with Alt passes', () => {
        const r = validateUaStructElement({ s: 'Figure', alt: 'desc' });
        expect(r.pass).toBe(true);
    });
    test('warns on Span', () => {
        const r = validateUaStructElement({ s: 'Span' });
        expect(r.warnings.length).toBeGreaterThan(0);
    });
    test('rejects bad input', () => {
        expect(() => validateUaStructElement(null)).toThrow(ParseError);
    });
});

describe('UA_STRUCTURE', () => {
    test('frozen', () => {
        expect(Object.isFrozen(UA_STRUCTURE)).toBe(true);
    });
});

describe('pdfUaTagged module', () => {
    test('module shape + worker safety', () => {
        expect(pdfUaTagged.name).toBe('pdfUaTagged');
        expect(pdfUaTagged.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfUaTagged.factory.toString()).toContain('function');
        const m = pdfUaTagged.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof m.validatePdfUa).toBe('function');
        expect(typeof m.validateUaStructElement).toBe('function');
    });
});
