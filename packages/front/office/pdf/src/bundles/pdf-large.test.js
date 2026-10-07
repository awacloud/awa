// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling test for the pdf-large bundle entry-point. Verifies the pure
 * fw factory descriptor shape, the expected dependency list and the
 * factory's wire-then-return behaviour.
 */
import { describe, test, expect } from 'bun:test';
import * as bundle from './pdf-large.js';

describe('pdf-large bundle', () => {
    test('exposes the `pdfLargeBundle` factory descriptor', () => {
        expect(bundle.pdfLargeBundle).toBeDefined();
        expect(bundle.pdfLargeBundle.name).toBe('pdfLargeBundle');
        expect(Array.isArray(bundle.pdfLargeBundle.dependencies)).toBe(true);
        expect(typeof bundle.pdfLargeBundle.factory).toBe('function');
    });

    test('declares core pdf + P0/P1 extras as dependencies', () => {
        const deps = bundle.pdfLargeBundle.dependencies;
        expect(deps[0]).toBe('pdf');
        // 21 extras (P0 + P1) + the core
        expect(deps.length).toBe(22);
        expect(deps).toContain('pdfContentOpsExtended');
        expect(deps).toContain('pdfFontCidTyped');
        expect(deps).toContain('pdfAOutputIntent');
        expect(deps).toContain('pdfUaTagged');
        expect(deps).toContain('pdfSigPades');
        expect(deps).toContain('pdfXmpExtended');
    });

    test('does NOT declare P2 / P3 / legacy extras', () => {
        const deps = bundle.pdfLargeBundle.dependencies;
        expect(deps).not.toContain('pdfLinearizationWrite');
        expect(deps).not.toContain('pdf3dRichMedia');
        expect(deps).not.toContain('pdfJbig2Read');
        expect(deps).not.toContain('pdfMisc');
        expect(deps).not.toContain('pdfInfoDictDeprecated');
        expect(deps).not.toContain('pdfSandbox');
        expect(deps).not.toContain('pdfLegacyXfaRead');
        expect(deps).not.toContain('pdfLegacyRc4Read');
    });

    test('factory wires extras via pdf.use and returns the pdf api', () => {
        const used = [];
        const pdfStub = {
            use(ext) { used.push(ext); return pdfStub; }
        };
        const deps = bundle.pdfLargeBundle.dependencies;
        // First arg is pdf; the rest are extension instances.
        const stubs = deps.map((n, i) => i === 0 ? pdfStub : { __ext: n });
        const result = bundle.pdfLargeBundle.factory(...stubs);
        expect(result).toBe(pdfStub);
        // Every dependency past pdf must have been wrapped into a
        // {name, register} call to pdf.use().
        expect(used.length).toBe(deps.length - 1);
        for (let i = 1; i < deps.length; i++) {
            expect(used[i - 1].name).toBe(deps[i]);
            expect(typeof used[i - 1].register).toBe('function');
            const reg = used[i - 1].register();
            expect(reg[deps[i]]).toEqual({ __ext: deps[i] });
        }
    });

    test('does NOT re-export the extras as named members', () => {
        expect(bundle.pdfContentOpsExtended).toBeUndefined();
        expect(bundle.pdf).toBeUndefined();
        expect(bundle.buildPdfLarge).toBeUndefined();
        expect(bundle.PDF_LARGE_EXTRAS).toBeUndefined();
    });
});
