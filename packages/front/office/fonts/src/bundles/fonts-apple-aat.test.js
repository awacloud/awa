// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the fonts-apple-aat bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './fonts-apple-aat.js';

describe('fonts-apple-aat bundle', () => {
    test('exposes the `fontsAppleAatBundle` factory descriptor', () => {
        expect(bundle.fontsAppleAatBundle).toBeDefined();
        expect(bundle.fontsAppleAatBundle.name).toBe('fontsAppleAatBundle');
        expect(Array.isArray(bundle.fontsAppleAatBundle.dependencies)).toBe(true);
        expect(typeof bundle.fontsAppleAatBundle.factory).toBe('function');
    });

    test('depends on fontsFullBundle + six AAT factories', () => {
        const deps = bundle.fontsAppleAatBundle.dependencies;
        expect(deps[0]).toBe('fontsFullBundle');
        expect(deps).toContain('aatMorx');
        expect(deps).toContain('aatKerx');
        expect(deps).toContain('aatAnkr');
        expect(deps).toContain('aatProp');
        expect(deps).toContain('aatLcar');
        expect(deps).toContain('aatFeat');
    });

    test('factory wires AAT modules via fonts.use and returns the fonts instance', () => {
        const used = [];
        const fontsStub = {
            use(...exts) { used.push(...exts); return fontsStub; }
        };
        const deps = bundle.fontsAppleAatBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? fontsStub : { __ext: n });
        const result = bundle.fontsAppleAatBundle.factory(...stubs);
        expect(result).toBe(fontsStub);
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1]).toEqual({ __ext: deps[i] });
        }
    });

    test('does NOT re-export legacy helpers / module arrays', () => {
        expect(bundle.buildFontsAppleAat).toBeUndefined();
        expect(bundle.FONTS_APPLE_AAT_MODULES).toBeUndefined();
        expect(bundle.default).toBeUndefined();
    });
});
