// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the pdf-legacy bundle entry-point. Verifies the pure
 * fw factory descriptor shape, the expected dependency list and the
 * factory's wire-then-return behaviour.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './pdf-legacy.js';

describe('pdf-legacy bundle', () => {
    test('exposes the `pdfLegacyBundle` factory descriptor', () => {
        expect(bundle.pdfLegacyBundle).toBeDefined();
        expect(bundle.pdfLegacyBundle.name).toBe('pdfLegacyBundle');
        expect(Array.isArray(bundle.pdfLegacyBundle.dependencies)).toBe(true);
        expect(typeof bundle.pdfLegacyBundle.factory).toBe('function');
    });

    test('declares core pdf + full + legacy-* extras as deps', () => {
        const deps = bundle.pdfLegacyBundle.dependencies;
        expect(deps[0]).toBe('pdf');
        // 21 P0/P1 + 6 tail + 4 legacy + 1 core = 32
        expect(deps.length).toBe(32);
        // Legacy tail entries
        expect(deps).toContain('pdfLegacyXfaRead');
        expect(deps).toContain('pdfLegacyRc4Read');
        expect(deps).toContain('pdfLegacyDeprecatedFilters');
        expect(deps).toContain('pdfLegacyDeprecatedAnnots');
        // Pulls pdf-full coverage too
        expect(deps).toContain('pdfLinearizationWrite');
        expect(deps).toContain('pdfInfoDictDeprecated');
        expect(deps).toContain('pdfSandbox');
        expect(deps).toContain('pdfContentOpsExtended');
    });

    test('factory wires extras via pdf.use and returns the pdf api', () => {
        const used = [];
        const pdfStub = {
            use(ext) { used.push(ext); return pdfStub; }
        };
        const deps = bundle.pdfLegacyBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? pdfStub : { __ext: n });
        const result = bundle.pdfLegacyBundle.factory(...stubs);
        expect(result).toBe(pdfStub);
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1].name).toBe(deps[i]);
            expect(typeof used[i - 1].register).toBe('function');
        }
    });

    test('does NOT re-export extras / buildPdfLegacy / helper symbols', () => {
        expect(bundle.pdf).toBeUndefined();
        expect(bundle.pdfLegacyXfaRead).toBeUndefined();
        expect(bundle.buildPdfLegacy).toBeUndefined();
        expect(bundle.PDF_LEGACY_EXTRAS).toBeUndefined();
    });
});
