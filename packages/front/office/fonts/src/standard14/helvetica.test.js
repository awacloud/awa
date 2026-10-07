// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { standard14Helvetica } from './helvetica.js';
import { testRuntime } from './_test-runtime.js';
import { HELVETICA_BOLD_WIDTHS as GEN_HELVETICA_BOLD_WIDTHS } from './_widths.generated.js';
import { parseAfm, buildWidthsArray, main as genMain } from '../../tools/gen-standard14-widths.mjs';
const {
    HELVETICA_WIDTHS, HELVETICA_BOLD_WIDTHS,
    helveticaRegular, helveticaBold, helveticaOblique, helveticaBoldOblique
} = testRuntime.resolve('standard14Helvetica');

describe('standard14Helvetica', () => {
    test('module metadata', () => { expect(standard14Helvetica.name).toBe('standard14Helvetica'); });

    test('widths table (Regular)', () => {
        expect(HELVETICA_WIDTHS.length).toBe(256);
        expect(HELVETICA_WIDTHS[0x41]).toBe(667);  // 'A'
        expect(HELVETICA_WIDTHS[0x20]).toBe(278);  // space, per Helvetica.afm `C 32 ; WX 278 ; N space ;`
        expect(HELVETICA_WIDTHS[0x69]).toBe(222);  // 'i'
    });

    // BL-954 (office/BATCH_33 task 03): Helvetica-Bold used to share
    // HELVETICA_WIDTHS with Regular, so bold text measured like regular
    // (real Helvetica-Bold 'A' = 722 vs Helvetica 'A' = 667, per
    // vendor/afm/Helvetica-Bold.afm `C 65 ; WX 722 ; N A ;`).
    test('widths table (Bold) — per vendor/afm/Helvetica-Bold.afm, distinct from Regular', () => {
        expect(HELVETICA_BOLD_WIDTHS.length).toBe(256);
        expect(HELVETICA_BOLD_WIDTHS[0x41]).toBe(722);  // 'A' — differs from HELVETICA_WIDTHS[0x41] (667)
        expect(HELVETICA_BOLD_WIDTHS[0x20]).toBe(278);  // space, per Helvetica-Bold.afm `C 32 ; WX 278 ; N space ;`
        expect(HELVETICA_BOLD_WIDTHS).not.toEqual(HELVETICA_WIDTHS);
    });

    test('every width table slot is a non-negative integer', () => {
        for (const table of [HELVETICA_WIDTHS, HELVETICA_BOLD_WIDTHS]) {
            for (const w of table) {
                expect(Number.isInteger(w)).toBe(true);
                expect(w).toBeGreaterThanOrEqual(0);
            }
        }
    });

    test('Regular vs Oblique italicAngle', () => {
        expect(helveticaRegular.italicAngle).toBe(0);
        expect(helveticaOblique.italicAngle).toBe(-12);
    });

    test('Bold has wider stemV', () => {
        expect(helveticaBold.stemV).toBeGreaterThan(helveticaRegular.stemV);
    });

    test('Bold + BoldOblique use HELVETICA_BOLD_WIDTHS; Regular + Oblique use HELVETICA_WIDTHS (Oblique legitimately shares its upright)', () => {
        expect(helveticaBold.familyName).toBe('Helvetica');
        expect(helveticaBold.widths).toBe(HELVETICA_BOLD_WIDTHS);
        expect(helveticaBoldOblique.widths).toBe(HELVETICA_BOLD_WIDTHS);
        expect(helveticaRegular.widths).toBe(HELVETICA_WIDTHS);
        expect(helveticaOblique.widths).toBe(HELVETICA_WIDTHS);
    });

    test('HELVETICA_BOLD_WIDTHS matches the generated module (_widths.generated.js) — no drift', () => {
        expect(HELVETICA_BOLD_WIDTHS).toEqual(GEN_HELVETICA_BOLD_WIDTHS);
    });

    // Drift gate: re-parsing vendor/afm/Helvetica-Bold.afm right now must
    // reproduce the committed HELVETICA_BOLD_WIDTHS exactly — same
    // assertion `gen-standard14-widths.mjs --check` makes. A single
    // mutated number in either the AFM-derived table or the committed
    // module would fail this (verified manually at authoring time; see
    // the batch report).
    test('re-parsing vendor/afm/Helvetica-Bold.afm reproduces the committed HELVETICA_BOLD_WIDTHS', () => {
        const afmPath = new URL('../../vendor/afm/Helvetica-Bold.afm', import.meta.url);
        const glyphWidths = parseAfm(readFileSync(afmPath, 'utf8'));
        expect(glyphWidths.size).toBeGreaterThanOrEqual(314);
        expect(buildWidthsArray(glyphWidths)).toEqual(Array.from(HELVETICA_BOLD_WIDTHS));
    });

    // Exercises gen-standard14-widths.mjs's own `--check` drift gate
    // read-only path (cross-check + committed-module + embedded-block
    // diffing) against the real committed files — no filesystem writes,
    // no `process` reference (main() takes an explicit `checkMode` and
    // returns `{ ok, diffs }` for exactly this reason).
    test('WinAnsi high range (0x80-0xFF) is filled — accented and typographic text no longer measures on the fallback width', () => {
        // Before the generator covered the full WinAnsi byte map these slots
        // were all 0, so every accented letter silently measured on the '?'
        // fallback while a viewer laid it out on the real advance.
        expect(HELVETICA_WIDTHS[0xE9]).toBe(556);   // eacute
        expect(HELVETICA_WIDTHS[0xE0]).toBe(556);   // agrave
        expect(HELVETICA_WIDTHS[0xFF]).toBe(500);   // ydieresis
        expect(HELVETICA_WIDTHS[0x95]).toBe(350);   // bullet
        expect(HELVETICA_WIDTHS[0x97]).toBe(1000);  // emdash
        expect(HELVETICA_WIDTHS[0x80]).toBe(556);   // Euro
        expect(HELVETICA_BOLD_WIDTHS[0xE9]).toBe(556);
        expect(HELVETICA_BOLD_WIDTHS[0x97]).toBe(1000);
        // Exactly 123 high slots carry a width; .notdef/control slots stay 0.
        const filledHigh = (t) => t.filter((w, b) => b >= 0x80 && w > 0).length;
        expect(filledHigh(HELVETICA_WIDTHS)).toBe(123);
        expect(filledHigh(HELVETICA_BOLD_WIDTHS)).toBe(123);
    });

    test('0x27/0x60 keep the WinAnsi quotesingle/grave widths', () => {
        // WinAnsiEncoding (ISO 32000-2 Annex D) has `quotesingle`/`grave` at
        // 0x27/0x60; `encodingWinAnsi` agrees since BL-1597 (office/BATCH_49).
        // The generator still keeps STANDARD_ASCII_ENTRIES as the ASCII
        // ground truth, and these widths stay 191/333, never the 222 of
        // `quoteright`/`quoteleft`.
        expect(HELVETICA_WIDTHS[0x27]).toBe(191);   // quotesingle, not quoteright (222)
        expect(HELVETICA_WIDTHS[0x60]).toBe(333);   // grave, not quoteleft (222)
    });

    test('re-parsing vendor/afm/Helvetica.afm reproduces the committed HELVETICA_WIDTHS over the FULL byte map', () => {
        const afm = parseAfm(readFileSync(join(import.meta.dir, '../../vendor/afm/Helvetica.afm'), 'utf8'));
        expect(buildWidthsArray(afm)).toEqual(Array.from(HELVETICA_WIDTHS));
    });

    test('gen-standard14-widths.mjs main({ checkMode: true }) reports no drift', async () => {
        const result = await genMain({ checkMode: true });
        expect(result.diffs).toEqual([]);
        expect(result.ok).toBe(true);
    });
});
