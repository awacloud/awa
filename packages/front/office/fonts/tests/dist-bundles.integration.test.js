// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test for the generated `dist/build/index.js` fw-mode
 * barrel produced by `tools/generate-bundles.mjs`.
 *
 * `@awacloud/fonts` had no `src/bundles/prebuilt/**` tree and no
 * `prebuilds.test.js` to relocate (ls-confirmed at task start), so unlike
 * `@awacloud/md`'s pilot this file does not exercise the individual per-root
 * `dist/build/<root>.js` / `dist/standalone/<root>.js` descriptors directly:
 * those 8 generated files each inline the full transitive closure of local
 * + fw factories as literal source text (the largest, `fonts-full` /
 * `fonts-apple-aat`, inline the TT hinting bytecode VM, complex shapers and
 * AAT tables), so importing them from a test would pull tens of thousands of
 * generated lines into the coverage denominator for a `@awacloud/fonts`-sized
 * package — unlike `@awacloud/md`'s 2-root pilot, this measurably regresses the
 * package's aggregate coverage. The barrel only re-exports `src/main.js`
 * (already covered elsewhere), so it carries none of that risk.
 *
 * @module fonts/tests/dist-bundles.integration.test
 */

import { describe, test, expect } from 'bun:test';

import { fontsLargeBundle }    from '../src/bundles/fonts-large.js';
import { fontsFullBundle }     from '../src/bundles/fonts-full.js';
import { fontsAppleAatBundle } from '../src/bundles/fonts-apple-aat.js';

describe('dist/build/index.js barrel', () => {
    test('re-exports the four arrays and every named descriptor', async () => {
        const barrel = await import('../dist/build/index.js');

        // The four registration arrays.
        expect(Array.isArray(barrel.modules)).toBe(true);
        expect(Array.isArray(barrel.fw_require)).toBe(true);
        expect(Array.isArray(barrel.extras)).toBe(true);
        expect(Array.isArray(barrel.bundle)).toBe(true);

        // A representative sample of named module descriptors, each carrying
        // the canonical `{ name, dependencies, factory }` shape.
        for (const name of ['fonts', 'fontSfnt', 'tableGlyf', 'embedSubsetForPdf']) {
            const desc = barrel[name];
            expect(typeof desc).toBe('object');
            expect(typeof desc.name).toBe('string');
            expect(Array.isArray(desc.dependencies)).toBe(true);
            expect(typeof desc.factory).toBe('function');
        }

        // Bundle descriptors re-exported through the barrel are the same
        // reference as the hand-written source.
        expect(barrel.fontsLargeBundle).toBe(fontsLargeBundle);
        expect(barrel.fontsFullBundle).toBe(fontsFullBundle);
        expect(barrel.fontsAppleAatBundle).toBe(fontsAppleAatBundle);
    });
});
