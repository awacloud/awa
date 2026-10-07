// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fw_require, modules, extras, bundle } from './main.js';

describe('@awacloud/fonts main', () => {
    test('exports fw_require array of fw factories', () => {
        expect(Array.isArray(fw_require)).toBe(true);
        expect(fw_require.length).toBeGreaterThan(0);
        for (const m of fw_require) {
            expect(typeof m.name).toBe('string');
            expect(Array.isArray(m.dependencies)).toBe(true);
            expect(typeof m.factory).toBe('function');
        }
    });

    test('exports modules array', () => {
        expect(Array.isArray(modules)).toBe(true);
        expect(modules.length).toBeGreaterThan(0);
        for (const m of modules) {
            expect(typeof m.name).toBe('string');
            expect(Array.isArray(m.dependencies)).toBe(true);
            expect(typeof m.factory).toBe('function');
        }
    });

    test('module names are unique', () => {
        const names = modules.map(m => m.name);
        expect(new Set(names).size).toBe(names.length);
    });

    test('modules contains the fonts orchestrator factory', () => {
        const fonts = modules.find(m => m.name === 'fonts');
        expect(fonts).toBeDefined();
        expect(typeof fonts.factory).toBe('function');
    });

    test('exports extras array of factory descriptors', () => {
        expect(Array.isArray(extras)).toBe(true);
        expect(extras.length).toBeGreaterThan(0);
        for (const m of extras) {
            expect(typeof m.name).toBe('string');
            expect(Array.isArray(m.dependencies)).toBe(true);
            expect(typeof m.factory).toBe('function');
        }
    });

    test('exports bundle array of bundle descriptors', () => {
        expect(Array.isArray(bundle)).toBe(true);
        expect(bundle.length).toBeGreaterThan(0);
        for (const b of bundle) {
            expect(typeof b.name).toBe('string');
            expect(b.name.endsWith('Bundle')).toBe(true);
            expect(Array.isArray(b.dependencies)).toBe(true);
            expect(typeof b.factory).toBe('function');
        }
    });
});
