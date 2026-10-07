// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for the package entry — verifies the dev-only contract
 * (`fw_require`, `modules`, `extras`, `bundle` arrays).
 */
import { describe, test, expect } from 'bun:test';
import * as main from './main.js';
import { modules, fw_require, extras, bundle } from './main.js';

describe('main module', () => {
    test('exports the four contract arrays', () => {
        expect(Array.isArray(main.fw_require)).toBe(true);
        expect(Array.isArray(main.modules)).toBe(true);
        expect(Array.isArray(main.extras)).toBe(true);
        expect(Array.isArray(main.bundle)).toBe(true);
    });

    test('fw_require contains the 6 canonical fw modules', () => {
        const names = fw_require.map(m => m.name);
        expect(names).toEqual(
            expect.arrayContaining(['xml', 'bitstream', 'huffman', 'deflate', 'zip', 'crc32'])
        );
    });

    test('does not re-export raw error classes', () => {
        expect(main.OdfError).toBeUndefined();
        expect(main.ParseError).toBeUndefined();
        expect(main.RenderError).toBeUndefined();
        expect(main.ContractError).toBeUndefined();
    });

    describe('modules array', () => {
        test('is non-empty and contains expected modules', () => {
            expect(Array.isArray(modules)).toBe(true);
            const names = modules.map(m => m.name);
            expect(names).toContain('pkgPackage');
            expect(names).toContain('odt');
            expect(names).toContain('odfErrors');
        });

        test('every entry has name + factory', () => {
            for (const m of modules) {
                expect(typeof m.name).toBe('string');
                expect(typeof m.factory).toBe('function');
            }
        });

        test('dependencies declared before dependents', () => {
            const seen = new Set();
            for (const m of modules) {
                for (const dep of m.dependencies || []) {
                    // fw externals are not in `modules` — skip them.
                    if (['zip', 'deflate', 'crc32', 'xml', 'bitstream', 'huffman'].includes(dep)) continue;
                    expect(seen.has(dep)).toBe(true);
                }
                seen.add(m.name);
            }
        });
    });

    describe('bundle array', () => {
        test('contains the 6 declarative bundles', () => {
            const names = bundle.map(b => b.name);
            expect(names).toEqual([
                'odtLargeBundle', 'odtFullBundle',
                'odsLargeBundle', 'odsFullBundle',
                'odpLargeBundle', 'odpFullBundle'
            ]);
        });
    });

    describe('extras array', () => {
        test('every entry has name + factory', () => {
            for (const e of extras) {
                expect(typeof e.name).toBe('string');
                expect(typeof e.factory).toBe('function');
            }
        });
    });

    describe('worker-safety', () => {
        test('every factory.toString() contains "function"', () => {
            for (const m of modules) {
                expect(m.factory.toString()).toContain('function');
            }
        });
    });
});
