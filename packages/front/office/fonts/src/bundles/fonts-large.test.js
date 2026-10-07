// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the fonts-large bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './fonts-large.js';

describe('fonts-large bundle', () => {
    test('exposes the `fontsLargeBundle` factory descriptor', () => {
        expect(bundle.fontsLargeBundle).toBeDefined();
        expect(bundle.fontsLargeBundle.name).toBe('fontsLargeBundle');
        expect(Array.isArray(bundle.fontsLargeBundle.dependencies)).toBe(true);
        expect(typeof bundle.fontsLargeBundle.factory).toBe('function');
    });

    test('declares core fonts + extraMath + extraJstf as dependencies', () => {
        const deps = bundle.fontsLargeBundle.dependencies;
        expect(deps[0]).toBe('fonts');
        expect(deps).toContain('extraMath');
        expect(deps).toContain('extraJstf');
    });

    test('factory wires extras via fonts.use and returns the fonts instance', () => {
        const used = [];
        const fontsStub = {
            use(...exts) { used.push(...exts); return fontsStub; }
        };
        const deps = bundle.fontsLargeBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? fontsStub : { __ext: n });
        const result = bundle.fontsLargeBundle.factory(...stubs);
        expect(result).toBe(fontsStub);
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1]).toEqual({ __ext: deps[i] });
        }
    });

    test('does NOT re-export legacy helpers / module arrays', () => {
        expect(bundle.buildFontsLarge).toBeUndefined();
        expect(bundle.FONTS_LARGE_MODULES).toBeUndefined();
        expect(bundle.fonts).toBeUndefined();
        expect(bundle.default).toBeUndefined();
    });
});
