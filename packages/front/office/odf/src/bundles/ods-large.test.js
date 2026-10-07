// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the ods-large bundle entry-point.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './ods-large.js';

describe('ods-large bundle', () => {
    test('exposes the `odsLargeBundle` factory descriptor', () => {
        expect(bundle.odsLargeBundle).toBeDefined();
        expect(bundle.odsLargeBundle.name).toBe('odsLargeBundle');
        expect(Array.isArray(bundle.odsLargeBundle.dependencies)).toBe(true);
        expect(typeof bundle.odsLargeBundle.factory).toBe('function');
    });

    test('declares core ods + P0 spreadsheet extras as dependencies', () => {
        const deps = bundle.odsLargeBundle.dependencies;
        expect(deps).toContain('ods');
        expect(deps).toContain('tableAdvanced');
        expect(deps).toContain('stylePage');
        expect(deps).toContain('stylePropertiesTyped');
        expect(deps).toContain('drawShapes');
        expect(deps).toContain('textFieldsExtended');
        expect(deps).toContain('textListDetailed');
    });

    test('does NOT declare P2/P3 / legacy extras', () => {
        const deps = bundle.odsLargeBundle.dependencies;
        expect(deps).not.toContain('databaseSources');
        expect(deps).not.toContain('dsigSignatures');
        expect(deps).not.toContain('legacyStaroffice');
    });

    test('factory wires extras via ods.use and returns the ods instance', () => {
        const used = [];
        const odsStub = {
            use(...exts) { used.push(...exts); return odsStub; }
        };
        const deps = bundle.odsLargeBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? odsStub : { __ext: n });
        const result = bundle.odsLargeBundle.factory(...stubs);
        expect(result).toBe(odsStub);
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1]).toEqual({ __ext: deps[i] });
        }
    });

    test('does NOT re-export the extras as named members', () => {
        expect(bundle.tableAdvanced).toBeUndefined();
        expect(bundle.ods).toBeUndefined();
        expect(bundle.buildOdsLarge).toBeUndefined();
    });
});
