// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the odt-full bundle entry-point.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './odt-full.js';

describe('odt-full bundle', () => {
    test('exposes the `odtFullBundle` factory descriptor', () => {
        expect(bundle.odtFullBundle).toBeDefined();
        expect(bundle.odtFullBundle.name).toBe('odtFullBundle');
        expect(Array.isArray(bundle.odtFullBundle.dependencies)).toBe(true);
        expect(typeof bundle.odtFullBundle.factory).toBe('function');
    });

    test('depends on odtLargeBundle + every remaining text-relevant extra', () => {
        const deps = bundle.odtFullBundle.dependencies;
        expect(deps).toContain('odtLargeBundle');
        expect(deps).toContain('textMisc');
        expect(deps).toContain('styleMisc');
        expect(deps).toContain('drawMisc');
        expect(deps).toContain('dsigSignatures');
        expect(deps).toContain('legacyStaroffice');
    });

    test('factory wires extras via odtLargeBundle.use and returns it', () => {
        const used = [];
        const odtStub = {
            use(...exts) { used.push(...exts); return odtStub; }
        };
        const deps = bundle.odtFullBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? odtStub : { __ext: n });
        const result = bundle.odtFullBundle.factory(...stubs);
        expect(result).toBe(odtStub);
        expect(used.length).toBe(deps.length - 1);
    });

    test('does NOT re-export the helpers as named members', () => {
        expect(bundle.buildOdtFull).toBeUndefined();
        expect(bundle.textMisc).toBeUndefined();
    });
});
