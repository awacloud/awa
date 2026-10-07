// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the pptx-large bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './pptx-large.js';

describe('pptx-large bundle', () => {
    test('exposes the `pptxLargeBundle` factory descriptor', () => {
        expect(bundle.pptxLargeBundle).toBeDefined();
        expect(bundle.pptxLargeBundle.name).toBe('pptxLargeBundle');
        expect(Array.isArray(bundle.pptxLargeBundle.dependencies)).toBe(true);
        expect(typeof bundle.pptxLargeBundle.factory).toBe('function');
    });

    test('declares core pptx + P0/P1 pml extras as dependencies', () => {
        const deps = bundle.pptxLargeBundle.dependencies;
        expect(deps).toContain('pptx');
        expect(deps).toContain('pmlAnimations');
        expect(deps).toContain('pmlTransitions');
        expect(deps).toContain('pmlNotes');
        expect(deps).toContain('pmlLayoutsTyped');
    });

    test('declares shared math + dml extras as dependencies', () => {
        const deps = bundle.pptxLargeBundle.dependencies;
        expect(deps).toContain('mathAdvanced');
        expect(deps).toContain('dmlEffects');
        expect(deps).toContain('dmlFillsAdvanced');
        expect(deps).toContain('dmlChartDataLabels');
    });

    test('does NOT declare P2 / misc / transitional extras', () => {
        const deps = bundle.pptxLargeBundle.dependencies;
        expect(deps).not.toContain('dmlShapesAdvanced');
        expect(deps).not.toContain('transitional');
        expect(deps).not.toContain('legacyVml');
        expect(deps).not.toContain('pmlMisc');
    });

    test('factory wires extras via pptx.use and returns the pptx instance', () => {
        const used = [];
        const pptxStub = {
            use(...exts) { used.push(...exts); return pptxStub; }
        };
        const deps = bundle.pptxLargeBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? pptxStub : { __ext: n });
        const result = bundle.pptxLargeBundle.factory(...stubs);
        expect(result).toBe(pptxStub);
        expect(used.length).toBe(deps.length - 1);
    });
});
