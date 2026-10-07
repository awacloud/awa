// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the pptx-full bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './pptx-full.js';

describe('pptx-full bundle', () => {
    test('exposes the `pptxFullBundle` factory descriptor', () => {
        expect(bundle.pptxFullBundle).toBeDefined();
        expect(bundle.pptxFullBundle.name).toBe('pptxFullBundle');
        expect(Array.isArray(bundle.pptxFullBundle.dependencies)).toBe(true);
        expect(typeof bundle.pptxFullBundle.factory).toBe('function');
    });

    test('depends on the pptxLargeBundle and every P2 extra', () => {
        const deps = bundle.pptxFullBundle.dependencies;
        expect(deps).toContain('pptxLargeBundle');
        expect(deps).toContain('dmlShapesAdvanced');
        expect(deps).toContain('transitional');
        expect(deps).toContain('legacyVml');
        expect(deps).toContain('pmlMisc');
        expect(deps).toContain('dmlChartMisc');
        expect(deps).toContain('dmlMainMisc');
        expect(deps).toContain('mathMisc');
    });

    test('factory layers extras onto the large bundle and returns it', () => {
        const used = [];
        const largeStub = {
            use(...exts) { used.push(...exts); return largeStub; }
        };
        const deps = bundle.pptxFullBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? largeStub : { __ext: n });
        const result = bundle.pptxFullBundle.factory(...stubs);
        expect(result).toBe(largeStub);
        expect(used.length).toBe(deps.length - 1);
    });
});
