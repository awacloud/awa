// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { extraShaperIndic } from './shaper-indic.js';
import { testRuntime } from './_test-runtime.js';
const { indicReorder, categorize, splitClusters, DEVA_CATEGORIES, DEVA_RA } = testRuntime.resolve('extraShaperIndic');
const { ContractError } = testRuntime.resolve('fontErrors');

describe('shaper-indic', () => {
    test('module metadata', () => {
        expect(extraShaperIndic.name).toBe('extraShaperIndic');
        expect(extraShaperIndic.dependencies).toEqual(['fontErrors']);
        const api = extraShaperIndic.factory({});
        expect(typeof api.indicReorder).toBe('function');
    });

    test('categorize: consonants & matras', () => {
        expect(categorize(0x0915)).toBe('consonant');   // KA
        expect(categorize(0x0930)).toBe('consonant');   // RA
        expect(categorize(0x093F)).toBe('vowel_mark_pre');  // I matra
        expect(categorize(0x094D)).toBe('virama');
        expect(categorize(0x093C)).toBe('nukta');
        expect(categorize(0x0905)).toBe('vowel');
        expect(categorize(0x0041)).toBe('other');
    });

    test('pre-base matra (I-matra) reorders before base consonant', () => {
        // à¤•à¤¿ = KA (0915) + I-matra (093F)  â†’  should reorder to [093F, 0915]
        const out = indicReorder([0x0915, 0x093F]);
        expect(out).toEqual([0x093F, 0x0915]);
    });

    test('reph: Ra + Halant + Ka  â†’  Ka ... Ra Halant', () => {
        // à¤° (0930) + à¥ (094D) + à¤• (0915)  â†’  à¤• à¤° à¥
        const out = indicReorder([0x0930, 0x094D, 0x0915]);
        expect(out).toEqual([0x0915, 0x0930, 0x094D]);
    });

    test('reph + pre-base matra: à¤°à¤¿à¥à¤•  =  Ra Halant Ka + I-matra', () => {
        // input : 0930 094D 0915 093F
        // base = Ka ; reph = [Ra Halant] migrates to end ;
        // I-matra moves before base.
        // expected : [093F, 0915, 0930, 094D]
        const out = indicReorder([0x0930, 0x094D, 0x0915, 0x093F]);
        expect(out).toEqual([0x093F, 0x0915, 0x0930, 0x094D]);
    });

    test('post-base matra stays after base', () => {
        // à¤•à¤¾ = KA + AA-matra (093E, post)
        const out = indicReorder([0x0915, 0x093E]);
        expect(out).toEqual([0x0915, 0x093E]);
    });

    test('multi-cluster run is concatenated', () => {
        // à¤•à¤¿ + à¤•à¤¾  =  [0915 093F] [0915 093E]
        const out = indicReorder([0x0915, 0x093F, 0x0915, 0x093E]);
        expect(out).toEqual([0x093F, 0x0915, 0x0915, 0x093E]);
    });

    test('splitClusters joins via virama', () => {
        // Ka + Virama + Ka  â†’ single cluster (conjunct)
        const cls = splitClusters([0x0915, 0x094D, 0x0915]);
        expect(cls.length).toBe(1);
    });

    test('splitClusters: two independent clusters', () => {
        const cls = splitClusters([0x0915, 0x093F, 0x0915]);
        expect(cls.length).toBe(2);
    });

    test('string input is accepted', () => {
        const out = indicReorder(['क', 'ि']);
        expect(out).toEqual([0x093F, 0x0915]);
    });

    test('contract errors', () => {
        expect(() => indicReorder('not array')).toThrow(ContractError);
        expect(() => indicReorder([NaN, null])).toThrow(ContractError);
        expect(() => indicReorder([0x0915], 42)).toThrow(ContractError);
    });

    test('DEVA_RA constant', () => {
        expect(DEVA_RA).toBe(0x0930);
        expect(DEVA_CATEGORIES[DEVA_RA]).toBe('consonant');
    });

    test('empty input returns empty', () => {
        expect(indicReorder([])).toEqual([]);
    });

    test('returns a new array (input unchanged)', () => {
        const inp = [0x0915, 0x093F];
        const out = indicReorder(inp);
        expect(out).not.toBe(inp);
        expect(inp).toEqual([0x0915, 0x093F]);
    });
});
