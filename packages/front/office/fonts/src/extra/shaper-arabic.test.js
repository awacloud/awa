// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { extraShaperArabic } from './shaper-arabic.js';
import { testRuntime } from './_test-runtime.js';
const { arabicShape, arabicShapeString, joiningType, JOINING_TYPES } = testRuntime.resolve('extraShaperArabic');
const { ContractError } = testRuntime.resolve('fontErrors');

describe('shaper-arabic', () => {
    test('module metadata', () => {
        expect(extraShaperArabic.name).toBe('extraShaperArabic');
        expect(extraShaperArabic.dependencies).toEqual(['fontErrors']);
        const api = extraShaperArabic.factory({});
        expect(typeof api.arabicShape).toBe('function');
        expect(api.JOINING_TYPES).toBeDefined();
    });

    test('joiningType: known + unknown', () => {
        expect(joiningType(0x0644)).toBe('D');   // LAM
        expect(joiningType(0x0627)).toBe('R');   // ALEF
        expect(joiningType(0x0640)).toBe('C');   // tatweel
        expect(joiningType(0x064E)).toBe('T');   // fatha
        expect(joiningType(0x0041)).toBe('U');   // ASCII A
    });

    test('JOINING_TYPES is frozen', () => {
        expect(Object.isFrozen(JOINING_TYPES)).toBe(true);
    });

    test('single isolated letter', () => {
        expect(arabicShape([0x0644])).toEqual(['isol']);
    });

    test('"علي" -> init, medi, fina', () => {
        // ع (AIN, D), ل (LAM, D), ي (YEH, D)
        expect(arabicShape(['ع', 'ل', 'ي'])).toEqual(['init', 'medi', 'fina']);
    });

    test('ALEF breaks medi (R type)', () => {
        // Ø¨ Ø§ Ø¨ â†’ BEH, ALEF, BEH
        // BEH(D) next=ALEF(R) â†’ init ; ALEF prev=BEH(D), next=BEH(D) but ALEF is R
        //   so on its left it does NOT join â†’ 'fina' ;
        // Final BEH prev=ALEF(R) but BEH's right joins, ALEF's left does NOT join
        //   â†’ 'isol'
        expect(arabicShape(['ب', 'ا', 'ب'])).toEqual(['init', 'fina', 'isol']);
    });

    test('transparent mark inherits no form & is skipped for neighbours', () => {
        // Ù„ + fatha + ÙŠ  â€” fatha is transparent; LAM should still see YEH
        const r = arabicShape([0x0644, 0x064E, 0x064A]);
        expect(r[0]).toBe('init');
        expect(r[1]).toBe('isol');
        expect(r[2]).toBe('fina');
    });

    test('tatweel (C) propagates joining', () => {
        // Ù„ + tatweel + ÙŠ  â†’ all three are joining
        const r = arabicShape([0x0644, 0x0640, 0x064A]);
        expect(r).toEqual(['init', 'medi', 'fina']);
    });

    test('ZWNJ breaks the join', () => {
        const r = arabicShape([0x0644, 0x200C, 0x064A]);
        expect(r[0]).toBe('isol');
        expect(r[2]).toBe('isol');
    });

    test('string convenience function', () => {
        expect(arabicShapeString('علي')).toEqual(['init', 'medi', 'fina']);
    });

    test('numeric code points & string chars are interchangeable', () => {
        const a = arabicShape([0x0639, 0x0644, 0x064A]);
        const b = arabicShape(['ع', 'ل', 'ي']);
        expect(a).toEqual(b);
    });

    test('contract errors', () => {
        expect(() => arabicShape('not array')).toThrow(ContractError);
        expect(() => arabicShape([null])).toThrow(ContractError);
        expect(() => arabicShapeString(123)).toThrow(ContractError);
    });

    test('empty input', () => {
        expect(arabicShape([])).toEqual([]);
    });
});
