// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the pdf-full bundle entry-point. Verifies the pure
 * fw factory descriptor shape, the expected dependency list and the
 * factory's wire-then-return behaviour.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './pdf-full.js';

describe('pdf-full bundle', () => {
    test('exposes the `pdfFullBundle` factory descriptor', () => {
        expect(bundle.pdfFullBundle).toBeDefined();
        expect(bundle.pdfFullBundle.name).toBe('pdfFullBundle');
        expect(Array.isArray(bundle.pdfFullBundle.dependencies)).toBe(true);
        expect(typeof bundle.pdfFullBundle.factory).toBe('function');
    });

    test('declares core pdf + 21 P0/P1 + 6 P2/P3 tail extras as deps', () => {
        const deps = bundle.pdfFullBundle.dependencies;
        expect(deps[0]).toBe('pdf');
        // 21 P0/P1 + 6 tail (= 27) + 1 core = 28
        expect(deps.length).toBe(28);
        // Tail (P2/P3) entries
        expect(deps).toContain('pdfLinearizationWrite');
        expect(deps).toContain('pdf3dRichMedia');
        expect(deps).toContain('pdfJbig2Read');
        expect(deps).toContain('pdfMisc');
        expect(deps).toContain('pdfInfoDictDeprecated');
        expect(deps).toContain('pdfSandbox');
        // Pulls in pdf-large coverage as well
        expect(deps).toContain('pdfContentOpsExtended');
        expect(deps).toContain('pdfXmpExtended');
    });

    test('does NOT declare legacy-* extras', () => {
        const deps = bundle.pdfFullBundle.dependencies;
        expect(deps).not.toContain('pdfLegacyXfaRead');
        expect(deps).not.toContain('pdfLegacyRc4Read');
        expect(deps).not.toContain('pdfLegacyDeprecatedFilters');
        expect(deps).not.toContain('pdfLegacyDeprecatedAnnots');
    });

    test('factory wires extras via pdf.use and returns the pdf api', () => {
        const used = [];
        const pdfStub = {
            use(ext) { used.push(ext); return pdfStub; }
        };
        const deps = bundle.pdfFullBundle.dependencies;
        const stubs = deps.map((n, i) => i === 0 ? pdfStub : { __ext: n });
        const result = bundle.pdfFullBundle.factory(...stubs);
        expect(result).toBe(pdfStub);
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1].name).toBe(deps[i]);
            expect(typeof used[i - 1].register).toBe('function');
        }
    });

    test('does NOT re-export the extras as named members', () => {
        expect(bundle.pdf).toBeUndefined();
        expect(bundle.pdfLinearizationWrite).toBeUndefined();
        expect(bundle.buildPdfFull).toBeUndefined();
        expect(bundle.PDF_FULL_EXTRAS).toBeUndefined();
    });
});
