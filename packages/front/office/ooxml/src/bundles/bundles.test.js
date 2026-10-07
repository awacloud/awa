// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Smoke tests for the per-format coverage bundles. Each bundle is a pure
 * fw factory descriptor : verify presence, shape, and a handful of
 * canonical dependencies.
 */
import { describe, test, expect } from 'bun:test';

import { docxLargeBundle } from './docx-large.js';
import { docxFullBundle }  from './docx-full.js';
import { xlsxLargeBundle } from './xlsx-large.js';
import { xlsxFullBundle }  from './xlsx-full.js';
import { pptxLargeBundle } from './pptx-large.js';
import { pptxFullBundle }  from './pptx-full.js';

function expectDescriptor(b, name) {
    expect(b).toBeDefined();
    expect(b.name).toBe(name);
    expect(Array.isArray(b.dependencies)).toBe(true);
    expect(b.dependencies.length).toBeGreaterThan(0);
    expect(typeof b.factory).toBe('function');
}

describe('bundles — descriptor shape', () => {
    test('docxLargeBundle', () => {
        expectDescriptor(docxLargeBundle, 'docxLargeBundle');
        expect(docxLargeBundle.dependencies).toContain('docx');
        expect(docxLargeBundle.dependencies).toContain('wmlRunFormatting');
    });
    test('docxFullBundle', () => {
        expectDescriptor(docxFullBundle, 'docxFullBundle');
        expect(docxFullBundle.dependencies).toContain('docxLargeBundle');
        expect(docxFullBundle.dependencies).toContain('wmlVmlLegacy');
    });
    test('xlsxLargeBundle', () => {
        expectDescriptor(xlsxLargeBundle, 'xlsxLargeBundle');
        expect(xlsxLargeBundle.dependencies).toContain('xlsx');
        expect(xlsxLargeBundle.dependencies).toContain('smlPivotTables');
    });
    test('xlsxFullBundle', () => {
        expectDescriptor(xlsxFullBundle, 'xlsxFullBundle');
        expect(xlsxFullBundle.dependencies).toContain('xlsxLargeBundle');
        expect(xlsxFullBundle.dependencies).toContain('smlFormControls');
    });
    test('pptxLargeBundle', () => {
        expectDescriptor(pptxLargeBundle, 'pptxLargeBundle');
        expect(pptxLargeBundle.dependencies).toContain('pptx');
        expect(pptxLargeBundle.dependencies).toContain('pmlAnimations');
    });
    test('pptxFullBundle', () => {
        expectDescriptor(pptxFullBundle, 'pptxFullBundle');
        expect(pptxFullBundle.dependencies).toContain('pptxLargeBundle');
        expect(pptxFullBundle.dependencies).toContain('dmlShapesAdvanced');
    });
});
