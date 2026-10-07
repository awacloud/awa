// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfWellTagged } from './well-tagged-pdf.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { lintWellTagged, checkArtifactPlacement, WTPDF_RULES } =
    pdfWellTagged.factory(_errors, _parserObj);
describe('lintWellTagged', () => {
    test('passes on well-formed tree', () => {
        const r = lintWellTagged({ s: 'Document', k: [
            { s: 'H1', k: [] },
            { s: 'P',  k: [] }
        ] });
        expect(r.pass).toBe(true);
    });
    test('errors on empty Table', () => {
        const r = lintWellTagged({ s: 'Table', k: [] });
        expect(r.errors[0].rule).toBe('wtpdf/table/empty');
    });
    test('errors on TR without cells', () => {
        const r = lintWellTagged({ s: 'Table', k: [
            { s: 'TR', k: [] }
        ] });
        expect(r.errors[0].rule).toBe('wtpdf/table/row');
    });
    test('errors on empty L', () => {
        const r = lintWellTagged({ s: 'L', k: [] });
        expect(r.errors[0].rule).toBe('wtpdf/list/empty');
    });
    test('warns on heading jump', () => {
        const r = lintWellTagged({ s: 'Document', k: [
            { s: 'H1', k: [] },
            { s: 'H3', k: [] }
        ] });
        expect(r.warnings.some(w => w.rule === 'wtpdf/heading/jump')).toBe(true);
    });
    test('warns on bare Span', () => {
        const r = lintWellTagged({ s: 'Span', k: [] });
        expect(r.warnings[0].rule).toBe('wtpdf/span/empty');
    });
    test('rejects bad input', () => {
        expect(() => lintWellTagged(null)).toThrow(ParseError);
    });
});

describe('checkArtifactPlacement', () => {
    test('errors on untagged decoration', () => {
        const r = checkArtifactPlacement([{ mcid: 1, tagged: false, role: 'P' }]);
        expect(r.pass).toBe(false);
    });
    test('passes on artifact role', () => {
        const r = checkArtifactPlacement([{ mcid: 1, tagged: false, role: 'Artifact' }]);
        expect(r.pass).toBe(true);
    });
    test('rejects bad input', () => {
        expect(() => checkArtifactPlacement('x')).toThrow(ParseError);
    });
});

describe('WTPDF_RULES', () => {
    test('frozen', () => {
        expect(Object.isFrozen(WTPDF_RULES)).toBe(true);
    });
});

describe('pdfWellTagged module', () => {
    test('module shape + worker safety', () => {
        expect(pdfWellTagged.name).toBe('pdfWellTagged');
        expect(pdfWellTagged.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfWellTagged.factory.toString()).toContain('function');
        const m = pdfWellTagged.factory(_pdfErrors_TD1, {});
        expect(typeof m.lintWellTagged).toBe('function');
        expect(typeof m.checkArtifactPlacement).toBe('function');
    });
});
