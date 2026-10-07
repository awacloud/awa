// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the xlsx-full bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './xlsx-full.js';

describe('xlsx-full bundle', () => {
    test('exposes the `xlsxFullBundle` factory descriptor', () => {
        expect(bundle.xlsxFullBundle).toBeDefined();
        expect(bundle.xlsxFullBundle.name).toBe('xlsxFullBundle');
        expect(Array.isArray(bundle.xlsxFullBundle.dependencies)).toBe(true);
        expect(typeof bundle.xlsxFullBundle.factory).toBe('function');
    });

    test('depends on the xlsxLargeBundle and every P2 extra', () => {
        const deps = bundle.xlsxFullBundle.dependencies;
        expect(deps).toContain('xlsxLargeBundle');
        expect(deps).toContain('smlFormControls');
        expect(deps).toContain('dmlShapesAdvanced');
        expect(deps).toContain('dmlXdrAdvanced');
        expect(deps).toContain('transitional');
        expect(deps).toContain('legacyVml');
        expect(deps).toContain('smlMisc');
        expect(deps).toContain('dmlChartMisc');
        expect(deps).toContain('dmlMainMisc');
    });

    test('factory layers extras onto the large bundle and returns it', () => {
        const used = [];
        const largeStub = {
            use(...exts) { used.push(...exts); return largeStub; }
        };
        const deps = bundle.xlsxFullBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? largeStub : { __ext: n });
        const result = bundle.xlsxFullBundle.factory(...stubs);
        expect(result).toBe(largeStub);
        expect(used.length).toBe(deps.length - 1);
    });
});
