// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the docx-full bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './docx-full.js';

describe('docx-full bundle', () => {
    test('exposes the `docxFullBundle` factory descriptor', () => {
        expect(bundle.docxFullBundle).toBeDefined();
        expect(bundle.docxFullBundle.name).toBe('docxFullBundle');
        expect(Array.isArray(bundle.docxFullBundle.dependencies)).toBe(true);
        expect(typeof bundle.docxFullBundle.factory).toBe('function');
    });

    test('depends on the docxLargeBundle and every P2 extra', () => {
        const deps = bundle.docxFullBundle.dependencies;
        expect(deps).toContain('docxLargeBundle');
        expect(deps).toContain('wmlVmlLegacy');
        expect(deps).toContain('dmlShapesAdvanced');
        expect(deps).toContain('transitional');
        expect(deps).toContain('legacyVml');
        expect(deps).toContain('wmlMisc');
        expect(deps).toContain('mathMisc');
        expect(deps).toContain('dmlMainMisc');
    });

    test('factory layers extras onto the large bundle and returns it', () => {
        const used = [];
        const largeStub = {
            use(...exts) { used.push(...exts); return largeStub; }
        };
        const deps = bundle.docxFullBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? largeStub : { __ext: n });
        const result = bundle.docxFullBundle.factory(...stubs);
        expect(result).toBe(largeStub);
        expect(used.length).toBe(deps.length - 1);
    });

    test('does NOT re-export extras as named members', () => {
        expect(bundle.wmlVmlLegacy).toBeUndefined();
        expect(bundle.docx).toBeUndefined();
        expect(bundle.transitional).toBeUndefined();
    });
});
