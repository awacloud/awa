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

import { odtLargeBundle } from './odt-large.js';
import { odsLargeBundle } from './ods-large.js';
import { odpLargeBundle } from './odp-large.js';
import { odtFullBundle }  from './odt-full.js';
import { odsFullBundle }  from './ods-full.js';
import { odpFullBundle }  from './odp-full.js';

function expectDescriptor(b, name) {
    expect(b).toBeDefined();
    expect(b.name).toBe(name);
    expect(Array.isArray(b.dependencies)).toBe(true);
    expect(b.dependencies.length).toBeGreaterThan(0);
    expect(typeof b.factory).toBe('function');
}

describe('bundles — descriptor shape', () => {
    test('odtLargeBundle', () => {
        expectDescriptor(odtLargeBundle, 'odtLargeBundle');
        expect(odtLargeBundle.dependencies).toContain('odt');
        expect(odtLargeBundle.dependencies).toContain('textTrackedChanges');
    });
    test('odtFullBundle', () => {
        expectDescriptor(odtFullBundle, 'odtFullBundle');
        expect(odtFullBundle.dependencies).toContain('odtLargeBundle');
        expect(odtFullBundle.dependencies).toContain('textMisc');
    });
    test('odsLargeBundle', () => {
        expectDescriptor(odsLargeBundle, 'odsLargeBundle');
        expect(odsLargeBundle.dependencies).toContain('ods');
        expect(odsLargeBundle.dependencies).toContain('tableAdvanced');
    });
    test('odsFullBundle', () => {
        expectDescriptor(odsFullBundle, 'odsFullBundle');
        expect(odsFullBundle.dependencies).toContain('odsLargeBundle');
        expect(odsFullBundle.dependencies).toContain('databaseSources');
    });
    test('odpLargeBundle', () => {
        expectDescriptor(odpLargeBundle, 'odpLargeBundle');
        expect(odpLargeBundle.dependencies).toContain('odp');
        expect(odpLargeBundle.dependencies).toContain('presentationTyped');
    });
    test('odpFullBundle', () => {
        expectDescriptor(odpFullBundle, 'odpFullBundle');
        expect(odpFullBundle.dependencies).toContain('odpLargeBundle');
        expect(odpFullBundle.dependencies).toContain('animationsSmil');
    });
});
