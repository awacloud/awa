// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the fonts-full bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './fonts-full.js';

describe('fonts-full bundle', () => {
    test('exposes the `fontsFullBundle` factory descriptor', () => {
        expect(bundle.fontsFullBundle).toBeDefined();
        expect(bundle.fontsFullBundle.name).toBe('fontsFullBundle');
        expect(Array.isArray(bundle.fontsFullBundle.dependencies)).toBe(true);
        expect(typeof bundle.fontsFullBundle.factory).toBe('function');
    });

    test('depends on fontsLargeBundle + heavy extras', () => {
        const deps = bundle.fontsFullBundle.dependencies;
        expect(deps[0]).toBe('fontsLargeBundle');
        expect(deps).toContain('extraTtHinting');
        expect(deps).toContain('extraShaperArabic');
        expect(deps).toContain('extraShaperIndic');
        expect(deps).toContain('extraShaperCjk');
        expect(deps).toContain('extraWoff2Write');
        expect(deps).toContain('extraDsig');
    });

    test('factory wires extras via fonts.use and returns the fonts instance', () => {
        const used = [];
        const fontsStub = {
            use(...exts) { used.push(...exts); return fontsStub; }
        };
        const deps = bundle.fontsFullBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? fontsStub : { __ext: n });
        const result = bundle.fontsFullBundle.factory(...stubs);
        expect(result).toBe(fontsStub);
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1]).toEqual({ __ext: deps[i] });
        }
    });

    test('does NOT re-export legacy helpers / module arrays', () => {
        expect(bundle.buildFontsFull).toBeUndefined();
        expect(bundle.FONTS_FULL_MODULES).toBeUndefined();
        expect(bundle.default).toBeUndefined();
    });
});
