// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfXPrepress } from './pdf-x-prepress.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typePdfXOutputIntent, lintPdfXPage, PDFX_PROFILES } =
    pdfXPrepress.factory(_errors, _parserObj);
const u8 = (s) => new TextEncoder().encode(s);

describe('typePdfXOutputIntent', () => {
    test('detects PDF/X-4', () => {
        const r = typePdfXOutputIntent(obj.dict({
            S: obj.name('GTS_PDFX'),
            OutputConditionIdentifier: obj.string(u8('PDF/X-4'))
        }));
        expect(r.isPdfX).toBe(true);
        expect(r.profile).toBe('X-4');
        expect(r.catalog.flavor).toBe('transparency');
    });
    test('non-pdfx subtype', () => {
        const r = typePdfXOutputIntent(obj.dict({
            S: obj.name('GTS_PDFA1')
        }));
        expect(r.isPdfX).toBe(false);
    });
    test('unknown identifier', () => {
        const r = typePdfXOutputIntent(obj.dict({
            S: obj.name('GTS_PDFX'),
            OutputConditionIdentifier: obj.string(u8('foo'))
        }));
        expect(r.profile).toBe(null);
    });
    test('rejects non-dict', () => {
        expect(() => typePdfXOutputIntent(obj.int(1))).toThrow(ParseError);
    });
});

describe('lintPdfXPage', () => {
    test('passes with TrimBox', () => {
        const r = lintPdfXPage({ entries: {
            TrimBox: obj.array([]), BleedBox: obj.array([])
        } });
        expect(r.pass).toBe(true);
    });
    test('errors when both Trim+Art', () => {
        const r = lintPdfXPage({ entries: {
            TrimBox: obj.array([]), ArtBox: obj.array([])
        } });
        expect(r.pass).toBe(false);
    });
    test('warns on missing BleedBox', () => {
        const r = lintPdfXPage({ entries: { TrimBox: obj.array([]) } });
        expect(r.warnings.length).toBeGreaterThan(0);
    });
    test('rejects bad input', () => {
        expect(() => lintPdfXPage(null)).toThrow(ParseError);
    });
});

describe('PDFX_PROFILES', () => {
    test('frozen and lists X-6', () => {
        expect(Object.isFrozen(PDFX_PROFILES)).toBe(true);
        expect(PDFX_PROFILES['X-6'].flavor).toBe('pdf-2.0');
    });
});

describe('pdfXPrepress module', () => {
    test('module shape + worker safety', () => {
        expect(pdfXPrepress.name).toBe('pdfXPrepress');
        expect(pdfXPrepress.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfXPrepress.factory.toString()).toContain('function');
        const m = pdfXPrepress.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof m.typePdfXOutputIntent).toBe('function');
        expect(typeof m.lintPdfXPage).toBe('function');
        expect(m.PDFX_PROFILES).toEqual(PDFX_PROFILES);
    });
});
