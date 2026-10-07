// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { standard14Times } from './times.js';
import { testRuntime } from './_test-runtime.js';
import {
    TIMES_BOLD_WIDTHS as GEN_TIMES_BOLD_WIDTHS,
    TIMES_ITALIC_WIDTHS as GEN_TIMES_ITALIC_WIDTHS,
    TIMES_BOLD_ITALIC_WIDTHS as GEN_TIMES_BOLD_ITALIC_WIDTHS
} from './_widths.generated.js';
import { parseAfm, buildWidthsArray } from '../../tools/gen-standard14-widths.mjs';
const {
    TIMES_ROMAN_WIDTHS, TIMES_BOLD_WIDTHS, TIMES_ITALIC_WIDTHS, TIMES_BOLD_ITALIC_WIDTHS,
    timesRoman, timesBold, timesItalic, timesBoldItalic
} = testRuntime.resolve('standard14Times');

describe('standard14Times', () => {
    test('module metadata', () => { expect(standard14Times.name).toBe('standard14Times'); });

    test('widths (Regular)', () => {
        expect(TIMES_ROMAN_WIDTHS[0x41]).toBe(722);
        expect(TIMES_ROMAN_WIDTHS[0x20]).toBe(250);
    });

    // BL-954 (office/BATCH_33 task 03): Bold/Italic/BoldItalic used to
    // share TIMES_ROMAN_WIDTHS with Regular. Unlike Helvetica's Oblique
    // (which legitimately shares its upright), Times-Italic and
    // Times-BoldItalic each have their OWN AFM metrics.
    test('widths (Bold/Italic/BoldItalic) — per their own vendor/afm/*.afm, distinct from Regular', () => {
        expect(TIMES_BOLD_WIDTHS[0x41]).toBe(722);          // 'A', vendor/afm/Times-Bold.afm
        expect(TIMES_ITALIC_WIDTHS[0x41]).toBe(611);        // 'A', vendor/afm/Times-Italic.afm
        expect(TIMES_BOLD_ITALIC_WIDTHS[0x41]).toBe(667);   // 'A', vendor/afm/Times-BoldItalic.afm
        expect(TIMES_BOLD_WIDTHS[0x20]).toBe(250);          // space, vendor/afm/Times-Bold.afm
        expect(TIMES_ITALIC_WIDTHS[0x20]).toBe(250);        // space, vendor/afm/Times-Italic.afm
        expect(TIMES_BOLD_ITALIC_WIDTHS[0x20]).toBe(250);   // space, vendor/afm/Times-BoldItalic.afm
        for (const table of [TIMES_BOLD_WIDTHS, TIMES_ITALIC_WIDTHS, TIMES_BOLD_ITALIC_WIDTHS]) {
            expect(table).not.toEqual(TIMES_ROMAN_WIDTHS);
        }
    });

    test('every width table slot is a non-negative integer, length 256', () => {
        for (const table of [TIMES_ROMAN_WIDTHS, TIMES_BOLD_WIDTHS, TIMES_ITALIC_WIDTHS, TIMES_BOLD_ITALIC_WIDTHS]) {
            expect(table.length).toBe(256);
            for (const w of table) {
                expect(Number.isInteger(w)).toBe(true);
                expect(w).toBeGreaterThanOrEqual(0);
            }
        }
    });

    test('each variant uses its OWN width table (no more sharing)', () => {
        expect(timesRoman.widths).toBe(TIMES_ROMAN_WIDTHS);
        expect(timesBold.widths).toBe(TIMES_BOLD_WIDTHS);
        expect(timesItalic.widths).toBe(TIMES_ITALIC_WIDTHS);
        expect(timesBoldItalic.widths).toBe(TIMES_BOLD_ITALIC_WIDTHS);
    });

    test('WinAnsi high range (0x80-0xFF) is filled across all four Times cuts', () => {
        // Was 0 in every slot above 0x7E, so accented and CP1252 text
        // measured on the '?' fallback while the viewer used the real
        // advance. Now generated from the vendored AFMs over the full
        // WinAnsi byte map; this is the regression guard.
        const filledHigh = (t) => t.filter((w, b) => b >= 0x80 && w > 0).length;
        for (const t of [TIMES_ROMAN_WIDTHS, TIMES_BOLD_WIDTHS, TIMES_ITALIC_WIDTHS, TIMES_BOLD_ITALIC_WIDTHS]) {
            expect(filledHigh(t)).toBe(123);
        }
        expect(TIMES_ROMAN_WIDTHS[0x97]).toBe(1000);  // emdash
        expect(TIMES_ROMAN_WIDTHS[0xE9]).toBeGreaterThan(0);  // eacute
        expect(TIMES_BOLD_WIDTHS[0xE9]).toBeGreaterThan(0);
        // 0x27/0x60 keep the WinAnsi quotesingle/grave widths — the
        // encodingWinAnsi name defect at those slots is not absorbed.
        expect(TIMES_ROMAN_WIDTHS[0x27]).toBe(180);
        expect(TIMES_ROMAN_WIDTHS[0x60]).toBe(333);
    });

    test('italic flag set on italic variants', () => {
        expect(timesItalic.flags & 0x40).toBe(0x40);
        expect(timesBoldItalic.flags & 0x40).toBe(0x40);
        expect(timesRoman.flags & 0x40).toBe(0);
    });

    test('Bold/Italic/BoldItalic tables match the generated module (_widths.generated.js) — no drift', () => {
        expect(TIMES_BOLD_WIDTHS).toEqual(GEN_TIMES_BOLD_WIDTHS);
        expect(TIMES_ITALIC_WIDTHS).toEqual(GEN_TIMES_ITALIC_WIDTHS);
        expect(TIMES_BOLD_ITALIC_WIDTHS).toEqual(GEN_TIMES_BOLD_ITALIC_WIDTHS);
    });

    // Drift gate: re-parsing the AFMs right now must reproduce the
    // committed tables exactly — same assertion
    // `gen-standard14-widths.mjs --check` makes (verified manually at
    // authoring time to go red on a mutated number; see the batch report).
    test('re-parsing vendor/afm/*.afm reproduces the committed Bold/Italic/BoldItalic tables', () => {
        const read = (name) => parseAfm(readFileSync(new URL(`../../vendor/afm/${name}`, import.meta.url), 'utf8'));
        expect(buildWidthsArray(read('Times-Bold.afm'))).toEqual(Array.from(TIMES_BOLD_WIDTHS));
        expect(buildWidthsArray(read('Times-Italic.afm'))).toEqual(Array.from(TIMES_ITALIC_WIDTHS));
        expect(buildWidthsArray(read('Times-BoldItalic.afm'))).toEqual(Array.from(TIMES_BOLD_ITALIC_WIDTHS));
    });
});
