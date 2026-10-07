// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the xlsx-large bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './xlsx-large.js';

describe('xlsx-large bundle', () => {
    test('exposes the `xlsxLargeBundle` factory descriptor', () => {
        expect(bundle.xlsxLargeBundle).toBeDefined();
        expect(bundle.xlsxLargeBundle.name).toBe('xlsxLargeBundle');
        expect(Array.isArray(bundle.xlsxLargeBundle.dependencies)).toBe(true);
        expect(typeof bundle.xlsxLargeBundle.factory).toBe('function');
    });

    test('declares core xlsx + P0/P1 sml extras as dependencies', () => {
        const deps = bundle.xlsxLargeBundle.dependencies;
        expect(deps).toContain('xlsx');
        expect(deps).toContain('smlPivotTables');
        expect(deps).toContain('smlCalculation');
        expect(deps).toContain('smlSheetConfig');
        expect(deps).toContain('smlWorkbookConfig');
    });

    test('declares chart + dml shared extras as dependencies', () => {
        const deps = bundle.xlsxLargeBundle.dependencies;
        expect(deps).toContain('dmlChartDataLabels');
        expect(deps).toContain('dmlChartTrendlines');
        expect(deps).toContain('dmlChartAxesAdvanced');
        expect(deps).toContain('dmlChart3d');
        expect(deps).toContain('dmlChartOtherTypes');
        expect(deps).toContain('dmlEffects');
        expect(deps).toContain('dmlFillsAdvanced');
    });

    test('does NOT declare P2 / misc / transitional extras', () => {
        const deps = bundle.xlsxLargeBundle.dependencies;
        expect(deps).not.toContain('smlFormControls');
        expect(deps).not.toContain('dmlXdrAdvanced');
        expect(deps).not.toContain('smlMisc');
        expect(deps).not.toContain('transitional');
    });

    test('factory wires extras via xlsx.use and returns the xlsx instance', () => {
        const used = [];
        const xlsxStub = {
            use(...exts) { used.push(...exts); return xlsxStub; }
        };
        const deps = bundle.xlsxLargeBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? xlsxStub : { __ext: n });
        const result = bundle.xlsxLargeBundle.factory(...stubs);
        expect(result).toBe(xlsxStub);
        expect(used.length).toBe(deps.length - 1);
    });
});
