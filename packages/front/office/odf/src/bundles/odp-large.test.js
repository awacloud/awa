// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the odp-large bundle entry-point.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './odp-large.js';

describe('odp-large bundle', () => {
    test('exposes the `odpLargeBundle` factory descriptor', () => {
        expect(bundle.odpLargeBundle).toBeDefined();
        expect(bundle.odpLargeBundle.name).toBe('odpLargeBundle');
        expect(Array.isArray(bundle.odpLargeBundle.dependencies)).toBe(true);
        expect(typeof bundle.odpLargeBundle.factory).toBe('function');
    });

    test('declares core odp + P0 presentation extras as dependencies', () => {
        const deps = bundle.odpLargeBundle.dependencies;
        expect(deps).toContain('odp');
        expect(deps).toContain('presentationTyped');
        expect(deps).toContain('drawShapes');
        expect(deps).toContain('stylePage');
        expect(deps).toContain('stylePropertiesTyped');
        expect(deps).toContain('textFieldsExtended');
        expect(deps).toContain('textListDetailed');
    });

    test('does NOT declare P1/P2/P3 / legacy extras', () => {
        const deps = bundle.odpLargeBundle.dependencies;
        expect(deps).not.toContain('animationsSmil');
        expect(deps).not.toContain('dr3d3d');
        expect(deps).not.toContain('legacyStaroffice');
    });

    test('factory wires extras via odp.use and returns the odp instance', () => {
        const used = [];
        const odpStub = {
            use(...exts) { used.push(...exts); return odpStub; }
        };
        const deps = bundle.odpLargeBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? odpStub : { __ext: n });
        const result = bundle.odpLargeBundle.factory(...stubs);
        expect(result).toBe(odpStub);
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1]).toEqual({ __ext: deps[i] });
        }
    });

    test('does NOT re-export the extras as named members', () => {
        expect(bundle.presentationTyped).toBeUndefined();
        expect(bundle.odp).toBeUndefined();
        expect(bundle.buildOdpLarge).toBeUndefined();
    });
});
