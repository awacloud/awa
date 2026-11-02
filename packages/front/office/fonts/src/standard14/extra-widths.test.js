// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The Latin Standard 14 records' `extraWidths`: the widths, by glyph name,
 * of the glyphs MacRomanEncoding and StandardEncoding name that the WinAnsi
 * table cannot hold — checked against the vendored AFMs.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testRuntime } from './_test-runtime.js';
import { encodingWinAnsi } from '../encodings/winAnsi.js';
import { encodingMacRoman } from '../encodings/macRoman.js';
import { encodingStandard } from '../encodings/standard.js';
import { parseAfm, main as genMain } from '../../tools/gen-standard14-widths.mjs';
import * as generated from './_widths.generated.js';

const { lookupStandard14 } = testRuntime.resolve('standard14Lookup');
const AFM_DIR = join(import.meta.dir, '..', '..', 'vendor', 'afm');
const afm = (name) => parseAfm(readFileSync(join(AFM_DIR, `${name}.afm`), 'utf8'));

/** The glyphs MacRoman and Standard name, WinAnsi lacks, every vendored AFM holds. */
const WIN = new Set(encodingWinAnsi.factory().WIN_ANSI);
const NAMED = [...new Set([...encodingMacRoman.factory().MAC_ROMAN, ...encodingStandard.factory().STANDARD])]
    .filter((n) => n && n !== '.notdef' && !WIN.has(n));
const HELVETICA = afm('Helvetica');
const EXTRA = NAMED.filter((n) => HELVETICA.has(n)).sort();

const FACES = {
    'Helvetica': 'Helvetica', 'Helvetica-Oblique': 'Helvetica',
    'Helvetica-Bold': 'Helvetica-Bold', 'Helvetica-BoldOblique': 'Helvetica-Bold',
    'Times-Roman': 'Times-Roman', 'Times-Bold': 'Times-Bold',
    'Times-Italic': 'Times-Italic', 'Times-BoldItalic': 'Times-BoldItalic'
};

describe('Standard 14 extraWidths', () => {
    test('the glyph list: 21 names, the AFM-less ones left out', () => {
        expect(EXTRA.length).toBe(21);
        expect(EXTRA).toContain('fi');
        expect(EXTRA).toContain('Lslash');
        expect(EXTRA).not.toContain('apple');
        expect(EXTRA).not.toContain('pi');
    });

    test('each AFM face: its record holds the AFM width of every listed glyph', () => {
        for (const [face, file] of Object.entries(FACES)) {
            const rec = lookupStandard14(face);
            const widths = afm(file);
            expect(Object.isFrozen(rec.extraWidths)).toBe(true);
            expect(Object.keys(rec.extraWidths).sort()).toEqual(EXTRA);
            for (const n of EXTRA) expect(rec.extraWidths[n]).toBe(widths.get(n));
        }
    });

    test('spot values', () => {
        expect(lookupStandard14('Helvetica').extraWidths.fi).toBe(500);
        expect(lookupStandard14('Helvetica').extraWidths.Lslash).toBe(556);
        expect(lookupStandard14('Times-Bold').extraWidths.fi).toBe(556);
    });

    test('Courier: 600 for every listed glyph', () => {
        for (const face of ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']) {
            const rec = lookupStandard14(face);
            expect(Object.keys(rec.extraWidths).sort()).toEqual(EXTRA);
            expect(Object.values(rec.extraWidths).every((w) => w === 600)).toBe(true);
        }
    });

    test('Symbol and ZapfDingbats carry none', () => {
        expect(lookupStandard14('Symbol').extraWidths).toBeUndefined();
        expect(lookupStandard14('ZapfDingbats').extraWidths).toBeUndefined();
    });

    test('the generated module exports the six AFM tables', () => {
        for (const name of ['HELVETICA', 'HELVETICA_BOLD', 'TIMES_ROMAN', 'TIMES_BOLD', 'TIMES_ITALIC', 'TIMES_BOLD_ITALIC']) {
            expect(Object.keys(generated[`${name}_EXTRA_WIDTHS`]).sort()).toEqual(EXTRA);
        }
    });

    test('the generator finds no drift', async () => {
        const r = await genMain({ checkMode: true });
        expect(r.diffs).toEqual([]);
    });
});
