// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SpreadsheetML number formats, checked against what a
 * spreadsheet application shows for the same value and code.
 *
 * @module viewer/render/numfmt.test
 */
import { describe, test, expect } from 'bun:test';
import { createFormats, formatValue, serialToDate, BUILTIN } from './numfmt.js';

describe('formatValue', () => {
    const en = (v, code) => formatValue(v, code, 'en-GB');
    test('General', () => {
        expect(en(3.14159, null)).toBe('3.14159');
        expect(en(1e12, 'General')).toBe('1E+12');
        expect(en(-42, 'General')).toBe('-42');
    });
    test('digits, grouping, decimals', () => {
        expect(en(1234.567, '#,##0.00')).toBe('1,234.57');
        expect(en(12, '000')).toBe('012');
        expect(en(0.5, '#.00')).toBe('.50');
        expect(en(1500000, '#,##0,,"M"')).toBe('2M');
    });
    test('percent and scientific', () => {
        expect(en(0.256, '0%')).toBe('26%');
        expect(en(0.256, '0.0%')).toBe('25.6%');
        expect(en(0.000123, '0.00E+00')).toBe('1.23E-04');
    });
    test('sections: negative and zero', () => {
        expect(en(-1234.5, '#,##0.00;(#,##0.00)')).toBe('(1,234.50)');
        expect(en(0, '0.00;-0.00;"-"')).toBe('-');
        expect(en(-3, '0;[Red]0')).toBe('3');
    });
    test('literals and currency tags', () => {
        expect(en(1234.5, '#,##0.00 [$€-40C]')).toBe('1,234.50 €');
        expect(en(1234.5, '"$"#,##0.00')).toBe('$1,234.50');
        expect(en(7, '0\\ "pcs"')).toBe('7 pcs');
    });
    test('dates and times on the 1900 serial', () => {
        expect(en(45941, 'dd/mm/yyyy')).toBe('11/10/2025');
        expect(en(45941.5, 'yyyy-mm-dd hh:mm')).toBe('2025-10-11 12:00');
        expect(en(45941, 'd mmmm yyyy')).toBe('11 October 2025');
        expect(en(0.5, 'h:mm AM/PM')).toBe('12:00 PM');
        expect(en(1.25, '[h]:mm')).toBe('30:00');
    });
    test('locale separators', () => {
        expect(formatValue(1234.5, '#,##0.00', 'fr-FR')).toMatch(/^1\s234,50$/u);
    });
    test('built-in ids map to codes', () => {
        expect(BUILTIN[4]).toBe('#,##0.00');
        expect(BUILTIN[9]).toBe('0%');
    });
    test('serialToDate folds in the 1900 leap-year bug', () => {
        expect(serialToDate(61).toISOString().slice(0, 10)).toBe('1900-03-01');
        expect(serialToDate(1).toISOString().slice(0, 10)).toBe('1900-01-01');
    });
});

describe('formatter reuse', () => {
    test('one Intl formatter per distinct format, however many cells', () => {
        const Original = Intl.NumberFormat;
        let built = 0;
        Intl.NumberFormat = /** @type {any} */ (function NumberFormat(...a) { built++; return new Original(...a); });
        try {
            const fx = createFormats('fr');
            for (let i = 0; i < 1000; i++) formatValue(i * 1.5, '#,##0.00', fx);
            expect(built).toBe(1);
            expect(formatValue(1234.5, '#,##0.00', fx)).toBe('1 234,50');
        } finally {
            Intl.NumberFormat = Original;
        }
    });
});
