// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the odp-full bundle entry-point.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './odp-full.js';

describe('odp-full bundle', () => {
    test('exposes the `odpFullBundle` factory descriptor', () => {
        expect(bundle.odpFullBundle).toBeDefined();
        expect(bundle.odpFullBundle.name).toBe('odpFullBundle');
        expect(Array.isArray(bundle.odpFullBundle.dependencies)).toBe(true);
        expect(typeof bundle.odpFullBundle.factory).toBe('function');
    });

    test('depends on odpLargeBundle + remaining presentation-relevant extras', () => {
        const deps = bundle.odpFullBundle.dependencies;
        expect(deps).toContain('odpLargeBundle');
        expect(deps).toContain('animationsSmil');
        expect(deps).toContain('drawMisc');
        expect(deps).toContain('dsigSignatures');
        expect(deps).toContain('legacyStaroffice');
    });

    test('factory wires extras via odpLargeBundle.use and returns it', () => {
        const used = [];
        const odpStub = {
            use(...exts) { used.push(...exts); return odpStub; }
        };
        const deps = bundle.odpFullBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? odpStub : { __ext: n });
        const result = bundle.odpFullBundle.factory(...stubs);
        expect(result).toBe(odpStub);
        expect(used.length).toBe(deps.length - 1);
    });

    test('does NOT re-export the helpers as named members', () => {
        expect(bundle.buildOdpFull).toBeUndefined();
        expect(bundle.animationsSmil).toBeUndefined();
    });
});
