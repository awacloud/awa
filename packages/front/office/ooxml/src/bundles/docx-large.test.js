// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the docx-large bundle entry-point. Verifies the
 * pure fw factory descriptor shape and the expected dependency list.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './docx-large.js';

describe('docx-large bundle', () => {
    test('exposes the `docxLargeBundle` factory descriptor', () => {
        expect(bundle.docxLargeBundle).toBeDefined();
        expect(bundle.docxLargeBundle.name).toBe('docxLargeBundle');
        expect(Array.isArray(bundle.docxLargeBundle.dependencies)).toBe(true);
        expect(typeof bundle.docxLargeBundle.factory).toBe('function');
    });

    test('declares core docx + P0/P1 wml extras as dependencies', () => {
        const deps = bundle.docxLargeBundle.dependencies;
        expect(deps).toContain('docx');
        expect(deps).toContain('wmlRunFormatting');
        expect(deps).toContain('wmlParagraphFormatting');
        expect(deps).toContain('wmlTableProperties');
        expect(deps).toContain('wmlNumberingDetails');
        expect(deps).toContain('wmlSettings');
        expect(deps).toContain('wmlFields');
        expect(deps).toContain('wmlTrackedChanges');
    });

    test('declares shared dml + math extras as dependencies', () => {
        const deps = bundle.docxLargeBundle.dependencies;
        expect(deps).toContain('mathAdvanced');
        expect(deps).toContain('dmlWpPositioning');
        expect(deps).toContain('dmlEffects');
        expect(deps).toContain('dmlFillsAdvanced');
    });

    test('does NOT declare P2 / misc / transitional / legacy extras', () => {
        const deps = bundle.docxLargeBundle.dependencies;
        expect(deps).not.toContain('wmlVmlLegacy');
        expect(deps).not.toContain('transitional');
        expect(deps).not.toContain('legacyVml');
        expect(deps).not.toContain('wmlMisc');
        expect(deps).not.toContain('dmlShapesAdvanced');
    });

    test('factory wires extras via docx.use and returns the docx instance', () => {
        const used = [];
        const docxStub = {
            use(...exts) { used.push(...exts); return docxStub; }
        };
        const deps = bundle.docxLargeBundle.dependencies;
        // First arg is docx; the rest are extension instances.
        const stubs = deps.map((n, i) => i === 0 ? docxStub : { __ext: n });
        const result = bundle.docxLargeBundle.factory(...stubs);
        expect(result).toBe(docxStub);
        // Every dependency past docx must have been passed to use().
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1]).toEqual({ __ext: deps[i] });
        }
    });

    test('does NOT re-export the extras as named members', () => {
        expect(bundle.wmlRunFormatting).toBeUndefined();
        expect(bundle.docx).toBeUndefined();
    });
});
