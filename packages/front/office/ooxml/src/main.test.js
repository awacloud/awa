// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for the package entry — verifies the 4-arrays manifest contract
 * (`fw_require`, `modules`, `extras`, `bundle`). Each array exposes fw
 * factory descriptors `{ name, dependencies, factory }`.
 */
import { describe, test, expect } from 'bun:test';
import { fw_require, modules, extras, bundle } from './main.js';

describe('main module — 4-arrays manifest', () => {
    test('fw_require exposes fw factories', () => {
        expect(Array.isArray(fw_require)).toBe(true);
        const names = fw_require.map(m => m.name);
        for (const n of ['xml', 'bitstream', 'huffman', 'deflate', 'zip', 'crc32']) {
            expect(names).toContain(n);
        }
    });

    test('modules contains core ooxml factories', () => {
        expect(Array.isArray(modules)).toBe(true);
        expect(modules.length).toBeGreaterThan(20);
        const names = modules.map(m => m.name);
        for (const n of [
            'ooxmlErrors', 'ooxmlShared', 'ooxmlMath', 'markupCompatibility',
            'opcContentTypes', 'opcRelationships', 'opcPackage',
            'drawingml', 'drawingmlChart', 'drawingmlShape',
            'docxProperties', 'docxDrawing', 'docxStructure', 'docxStyles',
            'docxNumbering', 'docxSettings', 'docxComments', 'docxFootnotes',
            'docxHeaders', 'docxCustomXml', 'docx',
            'xlsxStyles', 'xlsxTables', 'xlsxConditionalFormatting',
            'xlsxComments', 'xlsxThreadedComments', 'xlsxDrawings', 'xlsx',
            'pptxTheme', 'pptxPicture', 'pptxTable', 'pptxChart',
            'pptxSlide', 'pptx'
        ]) {
            expect(names).toContain(n);
        }
    });

    test('extras contains opt-in extras', () => {
        expect(Array.isArray(extras)).toBe(true);
        const names = extras.map(m => m.name);
        for (const n of [
            'wmlRunFormatting', 'wmlParagraphFormatting', 'wmlTableProperties',
            'wmlNumberingDetails', 'wmlSettings', 'wmlFields',
            'wmlTrackedChanges', 'wmlVmlLegacy', 'wmlMisc',
            'smlPivotTables', 'smlCalculation', 'smlSheetConfig',
            'smlWorkbookConfig', 'smlFormControls', 'smlMisc',
            'pmlAnimations', 'pmlTransitions', 'pmlNotes',
            'pmlLayoutsTyped', 'pmlMisc',
            'dmlChartDataLabels', 'dmlChartTrendlines',
            'dmlChartAxesAdvanced', 'dmlChart3d',
            'dmlChartOtherTypes', 'dmlChartMisc',
            'dmlEffects', 'dmlFillsAdvanced', 'dmlShapesAdvanced',
            'dmlWpPositioning', 'dmlXdrAdvanced', 'dmlMainMisc',
            'mathAdvanced', 'mathMisc',
            'transitional', 'legacyVml'
        ]) {
            expect(names).toContain(n);
        }
    });

    test('bundle contains bundle descriptors', () => {
        expect(Array.isArray(bundle)).toBe(true);
        const names = bundle.map(m => m.name);
        for (const n of [
            'docxLargeBundle', 'docxFullBundle',
            'xlsxLargeBundle', 'xlsxFullBundle',
            'pptxLargeBundle', 'pptxFullBundle'
        ]) {
            expect(names).toContain(n);
        }
    });

    test('every descriptor has name + dependencies + factory', () => {
        for (const arr of [fw_require, modules, extras, bundle]) {
            for (const m of arr) {
                expect(typeof m.name).toBe('string');
                expect(Array.isArray(m.dependencies)).toBe(true);
                expect(typeof m.factory).toBe('function');
            }
        }
    });

    test('no duplicates by name within arrays', () => {
        for (const arr of [fw_require, modules, extras, bundle]) {
            const names = arr.map(m => m.name);
            const dupes = names.filter((n, i) => names.indexOf(n) !== i);
            expect(dupes).toEqual([]);
        }
    });
});
