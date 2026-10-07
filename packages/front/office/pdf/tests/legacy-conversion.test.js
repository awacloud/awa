// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview L0 legacy compatibility — at this maturity the package
 * accepts a `%PDF-1.7` header on **read**. Full PDF 1.7 → 2.0 model
 * conversion (XFA stripping, RC4 decryption, LZW decompression,
 * Sound/Movie → RichMedia, …) arrives with the `pdf-legacy` extra in
 * a later phase ; this file is the placeholder that proves the L0
 * surface tolerates 1.7 headers and does not refuse them outright.
 */

import { describe, test, expect } from 'bun:test';
import { buildDocument, bootstrapPdf } from './_helpers/build.js';

describe('legacy PDF 1.7 read tolerance', () => {
    test('reads a synthetic 1.7-flagged document', () => {
        const b = buildDocument({ version: '1.7', pages: ['hi'] });
        const api = bootstrapPdf();
        const doc = api.read(b);
        expect(doc.version).toBe('1.7');
        expect(doc.pages.length).toBe(1);
    });

    test('reads 1.4 / 1.5 / 1.6 / 1.7 / 2.0 headers', () => {
        const api = bootstrapPdf();
        for (const v of ['1.4', '1.5', '1.6', '1.7', '2.0']) {
            const b = buildDocument({ version: v });
            expect(api.read(b).version).toBe(v);
        }
    });

    test('legacy conversion API is stubbed for L1+', () => {
        // At L0 there is no convertLegacyToV2 yet. We document the
        // contract via this expectation so the test will become a
        // useful guardrail once the extra ships.
        const api = bootstrapPdf();
        expect(typeof api.convertLegacyToV2).toBe('undefined');
    });
});
