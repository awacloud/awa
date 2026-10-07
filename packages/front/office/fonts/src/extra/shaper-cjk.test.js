// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { extraShaperCjk } from './shaper-cjk.js';
import { testRuntime } from './_test-runtime.js';
const {
    cjkVertical, extractIVS,
    isVariationSelector, isIdeographicVS, isCJKIdeograph,
    hasVerticalForm, shouldRotateVertical,
    VERTICAL_FORMS, VS17, VS256
} = testRuntime.resolve('extraShaperCjk');
const { ContractError } = testRuntime.resolve('fontErrors');

describe('shaper-cjk', () => {
    test('module metadata', () => {
        expect(extraShaperCjk.name).toBe('extraShaperCjk');
        expect(extraShaperCjk.dependencies).toEqual(['fontErrors']);
        const api = extraShaperCjk.factory({});
        expect(typeof api.cjkVertical).toBe('function');
        expect(typeof api.extractIVS).toBe('function');
    });

    test('VERTICAL_FORMS frozen', () => {
        expect(Object.isFrozen(VERTICAL_FORMS)).toBe(true);
    });

    test('cjkVertical: vertical=false returns input unchanged', () => {
        expect(cjkVertical([0x3001, 0x4E2D], false)).toEqual([0x3001, 0x4E2D]);
    });

    test('cjkVertical: substitutes punctuation when vertical=true', () => {
        // IDEOGRAPHIC COMMA â†’ presentation form
        const r = cjkVertical([0x3001], true);
        expect(r).toEqual([0xFE11]);
        expect(r[0]).not.toBe(0x3001);
    });

    test('cjkVertical: leaves ideographs alone (vert lookup will handle)', () => {
        const r = cjkVertical([0x4E2D, 0x6587], true);   // 中文
        expect(r).toEqual([0x4E2D, 0x6587]);
    });

    test('cjkVertical: ASCII brackets get vertical forms', () => {
        const r = cjkVertical([0x0028, 0x0029], true);
        expect(r).toEqual([0xFE35, 0xFE36]);
    });

    test('cjkVertical: accepts string code points', () => {
        const r = cjkVertical(['、'], true);    // U+3001
        expect(r[0]).toBe(0xFE11);
    });

    test('hasVerticalForm', () => {
        expect(hasVerticalForm(0x3001)).toBe(true);
        expect(hasVerticalForm(0x4E2D)).toBe(false);
    });

    test('isVariationSelector / isIdeographicVS', () => {
        expect(isVariationSelector(0xFE00)).toBe(true);
        expect(isVariationSelector(0xFE0F)).toBe(true);
        expect(isVariationSelector(VS17)).toBe(true);
        expect(isVariationSelector(VS256)).toBe(true);
        expect(isVariationSelector(0x4E2D)).toBe(false);

        expect(isIdeographicVS(VS17)).toBe(true);
        expect(isIdeographicVS(0xFE00)).toBe(false);
    });

    test('isCJKIdeograph', () => {
        expect(isCJKIdeograph(0x4E00)).toBe(true);
        expect(isCJKIdeograph(0x9FFF)).toBe(true);
        expect(isCJKIdeograph(0x3400)).toBe(true);
        expect(isCJKIdeograph(0x0041)).toBe(false);
    });

    test('extractIVS: ideograph + IVS pair', () => {
        // è‘› (U+845B) + VS17  â†’ one record
        const out = extractIVS([0x845B, VS17]);
        expect(out).toEqual([{ base: 0x845B, selector: VS17 }]);
    });

    test('extractIVS: bare ideographs', () => {
        const out = extractIVS([0x4E2D, 0x6587]);
        expect(out).toEqual([
            { base: 0x4E2D, selector: null },
            { base: 0x6587, selector: null }
        ]);
    });

    test('extractIVS: ideograph + IVS + ideograph', () => {
        const out = extractIVS([0x845B, VS17, 0x4E2D]);
        expect(out).toEqual([
            { base: 0x845B, selector: VS17 },
            { base: 0x4E2D, selector: null }
        ]);
    });

    test('extractIVS: BMP VS does NOT pair as ideographic IVS', () => {
        // BMP VS (FE00) is a variation selector but not an *ideographic*
        // one â€” the cluster pairing skips it but the selector is
        // discarded (stray).
        const out = extractIVS([0x845B, 0xFE00]);
        expect(out).toEqual([{ base: 0x845B, selector: null }]);
    });

    test('extractIVS: stray VS is dropped', () => {
        const out = extractIVS([VS17, 0x4E2D]);
        expect(out).toEqual([{ base: 0x4E2D, selector: null }]);
    });

    test('extractIVS: string input', () => {
        const out = extractIVS(['中', '文']);
        expect(out.length).toBe(2);
        expect(out[0].base).toBe(0x4E2D);
    });

    test('shouldRotateVertical', () => {
        expect(shouldRotateVertical(0x0041)).toBe(true);   // Latin A
        expect(shouldRotateVertical(0x4E2D)).toBe(false);  // ideograph
        expect(shouldRotateVertical(0x3001)).toBe(false);  // has vform
    });

    test('contract errors', () => {
        expect(() => cjkVertical('nope', true)).toThrow(ContractError);
        expect(() => cjkVertical([0x4E2D], 'yes')).toThrow(ContractError);
        expect(() => cjkVertical([null], true)).toThrow(ContractError);
        expect(() => extractIVS('nope')).toThrow(ContractError);
        expect(() => extractIVS([NaN, null])).toThrow(ContractError);
    });

    test('empty input', () => {
        expect(cjkVertical([], true)).toEqual([]);
        expect(extractIVS([])).toEqual([]);
    });
});
