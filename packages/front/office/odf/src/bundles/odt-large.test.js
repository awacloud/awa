// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the odt-large bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './odt-large.js';

describe('odt-large bundle', () => {
    test('exposes the `odtLargeBundle` factory descriptor', () => {
        expect(bundle.odtLargeBundle).toBeDefined();
        expect(bundle.odtLargeBundle.name).toBe('odtLargeBundle');
        expect(Array.isArray(bundle.odtLargeBundle.dependencies)).toBe(true);
        expect(typeof bundle.odtLargeBundle.factory).toBe('function');
    });

    test('declares core odt + P0 text/style/table/draw extras as dependencies', () => {
        const deps = bundle.odtLargeBundle.dependencies;
        expect(deps).toContain('odt');
        expect(deps).toContain('textTrackedChanges');
        expect(deps).toContain('textFieldsExtended');
        expect(deps).toContain('textListDetailed');
        expect(deps).toContain('tableAdvanced');
        expect(deps).toContain('stylePage');
        expect(deps).toContain('stylePropertiesTyped');
        expect(deps).toContain('drawShapes');
    });

    test('does NOT declare P1/P2/P3 misc / legacy extras', () => {
        const deps = bundle.odtLargeBundle.dependencies;
        expect(deps).not.toContain('textMisc');
        expect(deps).not.toContain('dsigSignatures');
        expect(deps).not.toContain('legacyStaroffice');
        expect(deps).not.toContain('dr3d3d');
    });

    test('factory wires extras via odt.use and returns the odt instance', () => {
        const used = [];
        const odtStub = {
            use(...exts) { used.push(...exts); return odtStub; }
        };
        const deps = bundle.odtLargeBundle.dependencies;
        // First arg is odt; the rest are extension instances.
        const stubs = deps.map((n, i) => i === 0 ? odtStub : { __ext: n });
        const result = bundle.odtLargeBundle.factory(...stubs);
        expect(result).toBe(odtStub);
        // Every dependency past odt must have been passed to use().
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1]).toEqual({ __ext: deps[i] });
        }
    });

    test('does NOT re-export the extras as named members', () => {
        expect(bundle.textTrackedChanges).toBeUndefined();
        expect(bundle.odt).toBeUndefined();
        expect(bundle.buildOdtLarge).toBeUndefined();
    });
});
