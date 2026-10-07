// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import {
    fw_require, pkg_require, modules, extras, bundle
} from './main.js';

describe('@awacloud/pdf main manifest', () => {
    test('exports the 5 contract arrays', () => {
        expect(Array.isArray(fw_require)).toBe(true);
        expect(Array.isArray(pkg_require)).toBe(true);
        expect(Array.isArray(modules)).toBe(true);
        expect(Array.isArray(extras)).toBe(true);
        expect(Array.isArray(bundle)).toBe(true);
    });

    test('every entry is a factory descriptor', () => {
        for (const m of [...fw_require, ...pkg_require, ...modules, ...extras, ...bundle]) {
            expect(typeof m.name).toBe('string');
            expect(Array.isArray(m.dependencies)).toBe(true);
            expect(typeof m.factory).toBe('function');
        }
    });

    test('modules array is dependency-ordered (deps appear before consumers)', () => {
        const seen = new Set();
        const fwNames  = new Set(fw_require.map(m => m.name));
        const pkgNames = new Set(pkg_require.map(m => m.name));
        for (const m of modules) {
            for (const d of m.dependencies) {
                // dep must already be declared, or be an fw factory, or be
                // a cross-package dep (from `@awacloud/fonts` via pkg_require).
                const ok = seen.has(d) || fwNames.has(d) || pkgNames.has(d);
                expect(ok).toBe(true);
            }
            seen.add(m.name);
        }
    });

    test('every factory.toString() contains the word "function"', () => {
        for (const m of [...modules, ...extras]) {
            expect(m.factory.toString()).toContain('function');
        }
    });

    test('bundle entries end with "Bundle" and reference pdf as core', () => {
        for (const b of bundle) {
            expect(b.name.endsWith('Bundle')).toBe(true);
            expect(b.dependencies[0]).toBe('pdf');
        }
    });
});
