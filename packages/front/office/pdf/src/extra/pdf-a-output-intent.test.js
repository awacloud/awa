// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAOutputIntent } from './pdf-a-output-intent.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { detectPdfAProfile, validatePdfABasics, PDFA_PROFILES } =
    pdfAOutputIntent.factory(_errors, _parserObj);
const u8 = (s) => new TextEncoder().encode(s);

describe('detectPdfAProfile', () => {
    test('flags GTS_PDFA1', () => {
        const r = detectPdfAProfile(obj.dict({
            S: obj.name('GTS_PDFA1'),
            OutputConditionIdentifier: obj.string(u8('PDF/A-2b'))
        }));
        expect(r.isPdfA).toBe(true);
        expect(r.profile).toBe('2b');
        expect(r.part).toBe(2);
        expect(r.level).toBe('b');
    });
    test('non-pdfa subtype', () => {
        const r = detectPdfAProfile(obj.dict({
            S: obj.name('GTS_PDFX')
        }));
        expect(r.isPdfA).toBe(false);
        expect(r.profile).toBe(null);
    });
    test('unknown identifier', () => {
        const r = detectPdfAProfile(obj.dict({
            S: obj.name('GTS_PDFA1'),
            OutputConditionIdentifier: obj.string(u8('foo'))
        }));
        expect(r.profile).toBe(null);
    });
    test('rejects non-dict', () => {
        expect(() => detectPdfAProfile(obj.int(1))).toThrow(ParseError);
    });
});

describe('validatePdfABasics', () => {
    test('passes with metadata', () => {
        const r = validatePdfABasics({
            catalog: { entries: {
                Metadata: obj.ref(2, 0),
                OutputIntents: obj.array([])
            } }
        });
        expect(r.pass).toBe(true);
    });
    test('errors when metadata missing', () => {
        const r = validatePdfABasics({ catalog: { entries: {} } });
        expect(r.pass).toBe(false);
        expect(r.errors).toContain('catalog requires /Metadata XMP stream');
    });
    test('errors on encryption', () => {
        const r = validatePdfABasics({
            catalog: { entries: { Metadata: obj.ref(1, 0) } },
            encrypted: true
        });
        expect(r.errors).toContain('PDF/A forbids encryption');
    });
    test('rejects bad input', () => {
        expect(() => validatePdfABasics(null)).toThrow(ParseError);
    });
});

describe('PDFA_PROFILES', () => {
    test('frozen and includes 4e', () => {
        expect(Object.isFrozen(PDFA_PROFILES)).toBe(true);
        expect(PDFA_PROFILES['4e'].part).toBe(4);
    });
});

describe('pdfAOutputIntent module', () => {
    test('module shape + worker safety', () => {
        expect(pdfAOutputIntent.name).toBe('pdfAOutputIntent');
        expect(pdfAOutputIntent.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfAOutputIntent.factory.toString()).toContain('function');
        const m = pdfAOutputIntent.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof m.detectPdfAProfile).toBe('function');
        expect(typeof m.validatePdfABasics).toBe('function');
    });
});
