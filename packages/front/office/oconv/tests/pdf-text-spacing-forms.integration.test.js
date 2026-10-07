// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Red-first fixtures for two measured pdf→md quality defects
 * (office/BATCH_43 task 02): BL-1576 (glued words — separate `Tj`/`Td`
 * pieces on the same line are concatenated with no space) and BL-1577
 * (Form XObject text is dropped, never recursed into).
 *
 * Every test asserts ONLY the TARGET behaviour, through the public
 * `oconv.toMd` facade, so a correct fix turns a red test green without
 * touching a single assertion. Today's (defective) output is quoted in the
 * batch report and in the comments below, never pinned in an `expect()`.
 *
 * Status at authoring (2026-09-23, before tasks 03/04):
 * - S1, S3 (BL-1576) and F1 (BL-1577) FAIL — the defects.
 * - S2, the TJ-kern guard and both F2 legs PASS — S2 and TJ-kern are the
 *   false-positive / no-regression guards; F2 passes because the current
 *   reader never recurses into a form at all (see the F2 block), so it
 *   becomes a live guard only once recursion exists.
 *
 * ## Scenarios (fixtures under `_fixtures/pdf-text-spacing-forms/`,
 * generator `_fixtures/gen-pdf-text-spacing-forms.js`)
 *
 * - **S1** (`text-spacing.pdf`, line 1) — one word per `Tj`, positioned by
 *   `Td` (the ANSSI producer's shape), simple font with explicit `/Widths`.
 * - **S2** (`text-spacing.pdf`, line 2) — one word drawn glyph by glyph
 *   inside one `TJ` array with small kerning adjustments (none reaching
 *   -200): no space may be inserted inside it.
 * - **S3** (`text-spacing.pdf`, line 3) — a `TJ` string that already ends in
 *   a space glyph, followed by a `<= -200` kern gap: never doubled.
 * - **TJ-kern** (`text-spacing.pdf`, line 4) — a `<= -200` kern gap with no
 *   pre-existing space infers exactly one space (existing behaviour kept).
 * - **F1** (`form-xobject-text.pdf`) — a Form XObject (own `/Resources`,
 *   non-identity `/Matrix`) drawn by `Do`, carrying its own text.
 * - **F2** (`form-cycle.pdf`, `form-deep-chain.pdf`) — a Form that draws
 *   itself, and a 100-deep non-cyclic chain of Forms.
 *
 * Every fixture path is resolved from `import.meta.url` so the file passes
 * from the package directory and from the repo root. The opt-in ANSSI leg
 * reuses `getAnssiCorpus` (`pdf/tests/_helpers/anssi-corpus.js`) and keeps
 * its counting function (`measureGlueSignals`) here for tasks 03/04 to
 * reuse for their after-counts.
 *
 * @module oconv/tests/pdf-text-spacing-forms.integration
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';
import { getAnssiCorpus, ANSSI_DOCS } from '../../pdf/tests/_helpers/anssi-corpus.js';

const FIXED_AT = '2026-09-23T00:00:00Z';

/** Per-test bound for the F2 legs: a recursion bug must fail, not hang. */
const F2_TIMEOUT_MS = 10_000;

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');

/** Read one committed fixture, resolved from this file's own URL. */
function fixtureBytes(name) {
    const url = new URL(`_fixtures/pdf-text-spacing-forms/${name}`, import.meta.url);
    return new Uint8Array(readFileSync(fileURLToPath(url)));
}

/** Convert one fixture through the public facade. */
function convert(name) {
    return oconv.toMd({ name, bytes: fixtureBytes(name), convertedAt: FIXED_AT });
}

/** The Markdown's lines, each trimmed — for exact per-line assertions. */
function linesOf(markdown) {
    return markdown.split('\n').map((s) => s.trim());
}

describe('oconv.toMd — same-line text pieces are word-separated (BL-1576)', () => {
    // Before the fix (measured 2026-09-23) the line reads
    // "Ilconstitueuneproductionoriginale": `pdf-to-ir.js` joins same-line
    // pieces with `cur.text += p.text`, no separator.
    test('S1 — one word per Tj/Td yields "Il constitue une production originale", single-spaced', async () => {
        const result = await convert('text-spacing.pdf');
        expect(linesOf(result.markdown)).toContain('Il constitue une production originale');
    });

    test('S2 — a word drawn glyph by glyph with small TJ kerns gains no inserted space', async () => {
        const result = await convert('text-spacing.pdf');
        // An exact line: "Hello", nothing inserted between its glyphs.
        expect(linesOf(result.markdown)).toContain('Hello');
    });

    // Before the fix (measured 2026-09-23) the line reads "Gamma  Delta"
    // (two spaces): `text-extract.js`'s `showArray` appends ' ' for the
    // -250 adjustment even though "Gamma " already ends in a space.
    test('S3 — an existing trailing space followed by a -250 kern gap stays a single space', async () => {
        const result = await convert('text-spacing.pdf');
        expect(linesOf(result.markdown)).toContain('Gamma Delta');
    });

    test('TJ-kern — a -250 kern gap with no pre-existing space infers exactly one space', async () => {
        const result = await convert('text-spacing.pdf');
        expect(linesOf(result.markdown)).toContain('Alpha Beta');
    });
});

describe('oconv.toMd — text inside a Form XObject is extracted (BL-1577)', () => {
    // Before the fix (measured 2026-09-23) the Markdown carries only
    // "Before form" and the ledger records
    // `{ code: 'xobject/form-dropped', detail: 'Fm1' }`: `text-extract.js`'s
    // `drawXObject` never decodes a form's content stream.
    test('F1 — a Form with its own /Resources and a non-identity /Matrix contributes its text, with no form-dropped loss', async () => {
        const result = await convert('form-xobject-text.pdf');
        expect(result.markdown).toContain('Before form');
        expect(result.markdown).toContain('Inside form');
        expect(result.losses.filter((l) => l.code === 'xobject/form-dropped')).toEqual([]);
    });
});

describe('oconv.toMd — self-drawing and over-deep Form XObjects are bounded (BL-1577 F2)', () => {
    // Passing today (measured 2026-09-23): the reader never recurses into a
    // form, so each top-level `Do` records one `xobject/form-dropped` and
    // nothing can loop. Once forms are executed, these legs require the
    // recursion to be guarded: the conversion must still complete, keep the
    // page's own text, and record a named loss from the `xobject/` family.
    // Only the family is pinned — the exact guard code is the fix's choice.
    // `form-deep-chain.pdf` is 100 forms deep, so a depth cap must sit
    // below 100 for its leg to record a loss.

    /**
     * Convert `name`, capturing a throw instead of propagating it, so the
     * "no throw" requirement is its own assertion.
     */
    async function convertCapturing(name) {
        try {
            return { result: await convert(name), threw: null };
        } catch (e) {
            return { result: null, threw: e };
        }
    }

    test('F2 cycle — a Form that draws itself completes without throwing and records an xobject/ loss', async () => {
        const { result, threw } = await convertCapturing('form-cycle.pdf');
        expect(threw).toBeNull();
        expect(result.markdown).toContain('Page text');
        expect(result.losses.some((l) => l.code.startsWith('xobject/'))).toBe(true);
    }, F2_TIMEOUT_MS);

    test('F2 depth — a 100-deep chain of Forms completes without throwing and records an xobject/ loss', async () => {
        const { result, threw } = await convertCapturing('form-deep-chain.pdf');
        expect(threw).toBeNull();
        expect(result.markdown).toContain('Page text');
        expect(result.losses.some((l) => l.code.startsWith('xobject/'))).toBe(true);
    }, F2_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// ANSSI before-measurement (opt-in, `references/ANSSI/`, git-ignored) — the
// baseline tasks 03/04 must beat. The counting function lives here (not
// duplicated) so their after-counts use the very same definition.
// ---------------------------------------------------------------------------

/**
 * Count the three glued-word / form-drop signals over one converted
 * document's Markdown + loss ledger.
 *
 * - `longTokens` — maximal runs of Unicode letters (`\p{L}+`) of length
 *   ≥ 22: glued words make implausibly long "words".
 * - `lowerUpperTransitions` — lowercase letter immediately followed by an
 *   uppercase letter inside such a run (`\p{Ll}\p{Lu}`), summed over the
 *   document: "constitueUne"-style joins.
 * - `formDropped` — `xobject/form-dropped` entries in the loss ledger.
 *
 * @param {{markdown: string, losses: {code: string}[]}} result
 * @returns {{longTokens: number, lowerUpperTransitions: number, formDropped: number}}
 */
function measureGlueSignals(result) {
    const words = result.markdown.match(/\p{L}+/gu) || [];
    const longTokens = words.filter((w) => w.length >= 22).length;
    let lowerUpperTransitions = 0;
    for (const w of words) lowerUpperTransitions += (w.match(/\p{Ll}(?=\p{Lu})/gu) || []).length;
    const formDropped = result.losses.filter((l) => l.code === 'xobject/form-dropped').length;
    return { longTokens, lowerUpperTransitions, formDropped };
}

describe('ANSSI corpus — before-measurement (glued words + form drops), opt-in', () => {
    const corpus = getAnssiCorpus();
    // Per-document presence ("present docs only"): `getAnssiCorpus().docs`
    // is empty unless all three exist, so resolve each path from `dir`.
    const presentDocs = Object.entries(ANSSI_DOCS)
        .map(([id, filename]) => [id, filename, join(corpus.dir, filename)])
        .filter(([, , p]) => existsSync(p));
    // eslint-disable-next-line no-console -- deliberate: "present: n/3" is a required recorded output.
    console.log(`ANSSI corpus present: ${presentDocs.length}/3`);

    test.skipIf(presentDocs.length === 0)('before-fix glue signals over every present ANSSI document', async () => {
        const measured = {};
        for (const [id, filename, path] of presentDocs) {
            const result = await oconv.toMd({ name: filename, bytes: new Uint8Array(readFileSync(path)), convertedAt: FIXED_AT });
            // A measurement over an empty conversion would be meaningless.
            expect(result.markdown.length).toBeGreaterThan(0);
            measured[id] = measureGlueSignals(result);
        }
        // eslint-disable-next-line no-console -- deliberate: the before-counts are this leg's recorded output.
        console.log('ANSSI before-measurement (2026-09-23):', JSON.stringify(measured));
        // Recorded, not forced: the figures are quoted in the batch report
        // (and compared there with the plan's expectation); tasks 03/04
        // assert their own after-counts against them.
        for (const id of Object.keys(measured)) {
            for (const v of Object.values(measured[id])) expect(Number.isInteger(v)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// ANSSI after-measurement (opt-in) — office/BATCH_43 task 03 (BL-1576). The
// before-counts below are task 02's, measured with `measureGlueSignals` at
// the pre-fix commit (67dd9239, `present: 3/3`); the after-counts use the
// same function, so the two columns are comparable. The word-spacing fix
// must LOWER both glue signals, (a) and (b), on every present document.
// ---------------------------------------------------------------------------

/** Task 02's recorded before-counts (a) `longTokens`, (b) `lowerUpperTransitions`. */
const GLUE_BEFORE = {
    zeroTrust: { longTokens: 66, lowerUpperTransitions: 200 },
    mecanismes: { longTokens: 223, lowerUpperTransitions: 979 },
    selectionCrypto: { longTokens: 97, lowerUpperTransitions: 243 }
};

describe('ANSSI corpus — after-measurement (word spacing), opt-in', () => {
    const corpus = getAnssiCorpus();
    const presentDocs = Object.entries(ANSSI_DOCS)
        .map(([id, filename]) => [id, filename, join(corpus.dir, filename)])
        .filter(([, , p]) => existsSync(p));

    test.skipIf(presentDocs.length === 0)('both glue signals fall on every present ANSSI document', async () => {
        const measured = {};
        const samples = {};
        for (const [id, filename, path] of presentDocs) {
            const result = await oconv.toMd({ name: filename, bytes: new Uint8Array(readFileSync(path)), convertedAt: FIXED_AT });
            measured[id] = measureGlueSignals(result);
            // Five body paragraphs for human reading: past the front matter,
            // at least 120 chars, first 200 chars of each.
            const body = result.markdown.split('\n---\n').slice(1).join('\n---\n');
            samples[id] = body.split('\n\n').map((p) => p.trim())
                .filter((p) => p.length >= 120).slice(10, 15).map((p) => p.slice(0, 200));
        }
        // eslint-disable-next-line no-console -- deliberate: the after-counts are this leg's recorded output.
        console.log('ANSSI after-measurement:', JSON.stringify(measured));
        // eslint-disable-next-line no-console -- deliberate: quoted in the batch report for human reading.
        console.log('ANSSI after-samples:', JSON.stringify(samples, null, 1));
        for (const id of Object.keys(measured)) {
            expect(measured[id].longTokens).toBeLessThan(GLUE_BEFORE[id].longTokens);
            expect(measured[id].lowerUpperTransitions).toBeLessThan(GLUE_BEFORE[id].lowerUpperTransitions);
        }
    });
});

// ---------------------------------------------------------------------------
// ANSSI after-measurement (opt-in) — office/BATCH_43 task 04 (BL-1577). Form
// XObjects are now executed, so `xobject/form-dropped` (task 02's
// `formDropped` column, measured at 67dd9239) must fall on every present
// document. The guard codes and the Markdown body length are logged for the
// batch report.
// ---------------------------------------------------------------------------

/** Task 02's recorded before-counts of `xobject/form-dropped`. */
const FORM_DROPPED_BEFORE = { zeroTrust: 15, mecanismes: 55, selectionCrypto: 45 };

describe('ANSSI corpus — after-measurement (Form XObjects), opt-in', () => {
    const corpus = getAnssiCorpus();
    const presentDocs = Object.entries(ANSSI_DOCS)
        .map(([id, filename]) => [id, filename, join(corpus.dir, filename)])
        .filter(([, , p]) => existsSync(p));

    test.skipIf(presentDocs.length === 0)('xobject/form-dropped falls on every present ANSSI document', async () => {
        const measured = {};
        for (const [id, filename, path] of presentDocs) {
            const result = await oconv.toMd({ name: filename, bytes: new Uint8Array(readFileSync(path)), convertedAt: FIXED_AT });
            const guards = {};
            for (const l of result.losses) {
                if (l.code.startsWith('xobject/')) guards[l.code] = (guards[l.code] || 0) + 1;
            }
            const body = result.markdown.split('\n---\n').slice(1).join('\n---\n');
            measured[id] = { ...measureGlueSignals(result), guards, bodyLength: body.length };
        }
        // eslint-disable-next-line no-console -- deliberate: the after-counts are this leg's recorded output.
        console.log('ANSSI form after-measurement:', JSON.stringify(measured));
        for (const id of Object.keys(measured)) {
            expect(measured[id].formDropped).toBeLessThan(FORM_DROPPED_BEFORE[id]);
        }
    });
});
