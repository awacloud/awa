// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the ods-full bundle entry-point.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './ods-full.js';

describe('ods-full bundle', () => {
    test('exposes the `odsFullBundle` factory descriptor', () => {
        expect(bundle.odsFullBundle).toBeDefined();
        expect(bundle.odsFullBundle.name).toBe('odsFullBundle');
        expect(Array.isArray(bundle.odsFullBundle.dependencies)).toBe(true);
        expect(typeof bundle.odsFullBundle.factory).toBe('function');
    });

    test('depends on odsLargeBundle + remaining spreadsheet-relevant extras', () => {
        const deps = bundle.odsFullBundle.dependencies;
        expect(deps).toContain('odsLargeBundle');
        expect(deps).toContain('databaseSources');
        expect(deps).toContain('tableMisc');
        expect(deps).toContain('dsigSignatures');
        expect(deps).toContain('legacyStaroffice');
    });

    test('factory wires extras via odsLargeBundle.use and returns it', () => {
        const used = [];
        const odsStub = {
            use(...exts) { used.push(...exts); return odsStub; }
        };
        const deps = bundle.odsFullBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? odsStub : { __ext: n });
        const result = bundle.odsFullBundle.factory(...stubs);
        expect(result).toBe(odsStub);
        expect(used.length).toBe(deps.length - 1);
    });

    test('does NOT re-export the helpers as named members', () => {
        expect(bundle.buildOdsFull).toBeUndefined();
        expect(bundle.databaseSources).toBeUndefined();
    });
});
