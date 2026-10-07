// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Cross-format `→ pdf` fidelity harness — office/BATCH_35 task 06.
 *
 * Drives the PUBLIC `oconv.convert` facade member (task 04) over the SAME
 * eight corpus fixtures task 05 uses for the ooxml↔odf pairs, but toward
 * `pdf`, and pins what the tree actually MEASURES:
 *
 *  1. **Ledger + page count** per fixture — `losses` `toEqual`-exact (reader
 *     losses first, writer losses carrying `index`/`kind`), page count exact.
 *  2. **Real image placement** (`poi-with-gif.docx`) — the reader IR carries
 *     `escapes.docx.bytes`; the measured branch is recorded below.
 *  3. **Word-stream return leg** — source words walked out of the reader IR
 *     vs. words decoded back by `toMd` from the emitted PDF, compared as an
 *     in-order subsequence. The measured result is per-fixture and is NOT
 *     uniform (see the leg-3 block for the two root causes).
 *  4. **Byte determinism** — `→ pdf` has no zip container and no clock, so a
 *     two-run byte-identity claim IS legitimate here. The `docx` target is
 *     byte-reproducible too (`@awacloud/ooxml` stamps a fixed 1980-01-01 00:00
 *     zip timestamp); the `odt` target is not (the ODF package writer stamps
 *     the current time).
 *  5. **Embedded font route** on `docx-smoke.docx`, with the four Calibri
 *     faces mined test-locally out of the vendored `facturx-minimum-sample.pdf`
 *     (recipe copied from `fidelity.integration.test.js`; `src/` never reaches
 *     into a PDF for a font).
 *  6. **`opts.pdf` refusal** re-asserted at the pair level.
 *  7. **Owner-acceptance leg for the task 01 `pdfBuilder.addImage` seam** —
 *     the 2026-09-09 ruling that lifted the `office/pdf` write constraint
 *     asked for the effective behaviour *with `oconv`* to be tested. Both
 *     routes (md → pdf with an `assets` manifest, and md → docx → pdf through
 *     the reader-carried `escapes.docx.bytes`) are exercised end to end.
 *
 * **No idempotence claim.** The `pdf → md` return leg is tier 1, text-first
 * (F5): it infers no structure, so a second pass over its output would
 * fabricate structure that the PDF never carried. This file therefore
 * compares WORD STREAMS, never normal forms, and never asserts N1 ≡ N2.
 *
 * **No claim beyond the F9 boundary** the `md → pdf` row already publishes:
 * links render plain, strike is recorded (`inline/strike-dropped`, no rule
 * drawn), `keepTogether` is inert, and a
 * non-WinAnsi code point degrades on the default (Standard 14) route.
 *
 * `references/` is never read here (owner ruling 2026-07-20,
 * `ai/memory/types/office.md`) — every byte consumed is vendored under
 * `tests/_fixtures/corpus/`.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';

const FIXED_AT = '2026-07-20T00:00:00Z';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');
// Resolvable because `@awacloud/oconv`'s own `main.js` `modules` array already
// carries the `@awacloud/pdf` + `@awacloud/fonts` + `@awacloud/ooxml` +
// `@awacloud/odf` closure — no new bare specifier is introduced here.
const pdfApi = runtime.resolve('pdf');
const pdfFilterDispatchApi = runtime.resolve('pdfFilterDispatch');
const fontsApi = runtime.resolve('fonts');
const docxApi = runtime.resolve('docx');
const odtApi = runtime.resolve('odt');
const docxToIrApi = runtime.resolve('oconvDocxToIr');
const odtToIrApi = runtime.resolve('oconvOdtToIr');
const pdfMetricsApi = runtime.resolve('oconvPdfMetrics');

/** @param {string} relPath relative to this file */
function fixtureBytes(relPath) {
    return new Uint8Array(readFileSync(new URL(relPath, import.meta.url)));
}

/** @param {Uint8Array} bytes */
function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

/** Latin-1 view of a PDF's bytes, for content-stream operator probes. */
function latin1(bytes) {
    let out = '';
    for (const b of bytes) out += String.fromCharCode(b);
    return out;
}

/**
 * Strip a leading `---`/…/`---` front-matter fence and return the body —
 * mirrored from `tests/fidelity.integration.test.js`'s own helper.
 *
 * @param {string} markdown
 * @returns {string}
 */
function bodyOf(markdown) {
    const lines = markdown.split('\n');
    if (lines[0] !== '---') return markdown;
    let end = -1;
    for (let i = 1; i < lines.length; i += 1) {
        if (lines[i] === '---') { end = i; break; }
    }
    return end < 0 ? markdown : lines.slice(end + 1).join('\n');
}

// ---------------------------------------------------------------------------
// The corpus — the SAME eight fixtures task 05 drives through the
// ooxml ↔ odf pairs, here driven toward `pdf`.
// ---------------------------------------------------------------------------

const FIXTURES = [
    { format: 'docx', name: 'docx-smoke.docx', path: './_fixtures/corpus/docx/docx-smoke.docx' },
    { format: 'docx', name: 'docx-structured.docx', path: './_fixtures/corpus/docx/docx-structured.docx' },
    { format: 'docx', name: 'docx-bulk.docx', path: './_fixtures/corpus/docx/docx-bulk.docx' },
    { format: 'docx', name: 'poi-numbering.docx', path: './_fixtures/corpus/real/poi-numbering.docx' },
    { format: 'docx', name: 'poi-table-alignment.docx', path: './_fixtures/corpus/real/poi-table-alignment.docx' },
    { format: 'docx', name: 'poi-with-gif.docx', path: './_fixtures/corpus/real/poi-with-gif.docx' },
    { format: 'odt', name: 'odt-structured.odt', path: './_fixtures/corpus/odt/odt-structured.odt' },
    { format: 'odt', name: 'odt-table.odt', path: './_fixtures/corpus/odt/odt-table.odt' }
];

/**
 * The reader IR for one fixture, resolved through the reader modules
 * directly (`convert` never returns its intermediate IR).
 *
 * @param {'docx'|'odt'} format
 * @param {Uint8Array} bytes
 * @returns {{ir: object, losses: object[]}}
 */
function readIr(format, bytes) {
    return format === 'docx'
        ? docxToIrApi.docxToIr(docxApi.read(bytes))
        : odtToIrApi.odtToIr(odtApi.read(bytes));
}

/** @param {object} fixture @returns {Promise<object>} the `convert` result */
function toPdf(fixture, pdfOpts) {
    return oconv.convert({
        bytes: fixtureBytes(fixture.path),
        name: fixture.name,
        format: fixture.format,
        target: 'pdf',
        opts: { pdf: pdfOpts === undefined ? { pageNumbers: false } : pdfOpts }
    });
}

// ---------------------------------------------------------------------------
// Leg 1 — exact ledgers and exact page counts
// ---------------------------------------------------------------------------

describe('crossformat → pdf — leg 1: exact ledger + page count per fixture', () => {
    test('docx-smoke.docx → pdf: 1 page, zero loss', async () => {
        const r = await toPdf(FIXTURES[0]);
        expect(r.format).toBe('docx');
        expect(r.target).toBe('pdf');
        expect(r.losses).toEqual([]);
        expect(r.lossy).toBe(false);
        expect(pdfApi.read(r.bytes).pages.length).toBe(1);
    });

    // Reader losses lead (`list/numbering-unresolved` ×2 — GAP-OOXML-2 on this
    // fixture, which carries `w:numPr` with no `word/numbering.xml`), then the
    // writer's, each carrying `index`/`kind`. The two `layout/line-overflow`
    // entries are the F9 typesetter meeting a 3-column table whose unbreakable
    // header tokens land, by floating-point epsilon, just over the column
    // width — the same shape `fidelity.integration.test.js` already pins for
    // `md-degrade.md`'s "Center" cell.
    test('docx-structured.docx → pdf: 1 page, 2 reader + 2 writer losses', async () => {
        const r = await toPdf(FIXTURES[1]);
        expect(r.losses).toEqual([
            { code: 'list/numbering-unresolved', detail: 'numId 1' },
            { code: 'list/numbering-unresolved', detail: 'numId 2' },
            {
                index: '6.0', kind: 'paragraph', code: 'layout/line-overflow',
                detail: {
                    tokens: 1, width: 34.837, column: 34.83699999999999, text: 'Format'
                }
            },
            {
                index: '6.0', kind: 'paragraph', code: 'layout/line-overflow',
                detail: {
                    tokens: 1, width: 43.395, column: 43.39499999999998, text: 'Direction'
                }
            }
        ]);
        expect(pdfApi.read(r.bytes).pages.length).toBe(1);
    });

    // MEASURED CORRECTION to the plan's hypothesis: the bulk fixture's 61×3
    // table records `layout/block-clipped`, NOT `layout/table-scaled` — the F9
    // stack clips an over-tall block at the page bottom, it never scales one.
    test('docx-bulk.docx → pdf: MULTI-PAGE (24), one overflow + one block-clipped', async () => {
        const r = await toPdf(FIXTURES[2]);
        expect(pdfApi.read(r.bytes).pages.length).toBe(24);
        expect(r.losses).toEqual([
            {
                index: '441.0', kind: 'paragraph', code: 'layout/line-overflow',
                detail: {
                    tokens: 1, width: 18.953, column: 18.952999999999975, text: 'Key'
                }
            },
            {
                code: 'layout/block-clipped', index: '441', kind: 'table',
                clippedLines: 108,
                detail: 'block 441 (table) is taller than one page: 108 unit(s) clipped at the page bottom'
            }
        ]);
        expect(r.losses.map((l) => l.code)).not.toContain('layout/table-scaled');
    });

    test('poi-numbering.docx → pdf: 1 page, one reader nesting-flattened loss', async () => {
        const r = await toPdf(FIXTURES[3]);
        expect(r.losses).toEqual([
            { code: 'list/nesting-flattened', detail: 'numId 1 ilvl 1' }
        ]);
        expect(pdfApi.read(r.bytes).pages.length).toBe(1);
    });

    test('poi-table-alignment.docx → pdf: 1 page, zero loss (alignment is not modelled, so nothing is dropped)', async () => {
        const r = await toPdf(FIXTURES[4]);
        expect(r.losses).toEqual([]);
        expect(pdfApi.read(r.bytes).pages.length).toBe(1);
    });

    test('poi-with-gif.docx → pdf: 1 page, one image-dropped loss', async () => {
        const r = await toPdf(FIXTURES[5]);
        expect(r.losses).toEqual([
            {
                index: '0.i0', kind: 'image', code: 'layout/image-dropped',
                detail: {
                    index: '0.i0',
                    name: 'Grafik 1',
                    alt: 'K:\\_projects\\OfficeEC\\contribute\\GIF-Support\\Sample.gif',
                    reason: 'unsupported-encoding',
                    bytes: 6554
                }
            }
        ]);
        expect(pdfApi.read(r.bytes).pages.length).toBe(1);
    });

    test('odt-structured.odt → pdf: 1 page, 4 reader losses, zero writer loss', async () => {
        const r = await toPdf(FIXTURES[6]);
        expect(r.format).toBe('odt');
        expect(r.losses).toEqual([
            { code: 'run/format-unresolved', detail: 'Emphasis' },
            { code: 'list/numbering-unresolved', detail: 'WWNum1' },
            { code: 'list/numbering-unresolved', detail: 'WWNum2' },
            { code: 'list/numbering-unresolved', detail: 'WWNum2Sub' }
        ]);
        expect(pdfApi.read(r.bytes).pages.length).toBe(1);
    });

    test('odt-table.odt → pdf: 1 page, zero loss', async () => {
        const r = await toPdf(FIXTURES[7]);
        expect(r.losses).toEqual([]);
        expect(pdfApi.read(r.bytes).pages.length).toBe(1);
    });

    // Task 03 retired `run/code-degraded` outright (the docx reader now sets
    // `run.code` from an `rPr.font` monospace allowlist). Nothing in this
    // corpus may resurrect it.
    test('the retired `run/code-degraded` code appears in NO ledger of this corpus', async () => {
        const seen = [];
        for (const fixture of FIXTURES) {
            const r = await toPdf(fixture);
            for (const l of r.losses) seen.push(l.code);
        }
        expect(seen.length).toBeGreaterThan(0);
        expect(seen).not.toContain('run/code-degraded');
    });
});

// ---------------------------------------------------------------------------
// Leg 2 — real image placement through the task 01 seam
// ---------------------------------------------------------------------------

describe('crossformat → pdf — leg 2: reader-carried image bytes (poi-with-gif.docx)', () => {
    /** The first `image` node of an IR document, in document order. */
    function firstImage(node) {
        if (!node || typeof node !== 'object') return null;
        if (Array.isArray(node)) {
            for (const child of node) {
                const found = firstImage(child);
                if (found) return found;
            }
            return null;
        }
        if (node.kind === 'image') return node;
        for (const key of Object.keys(node)) {
            if (key === 'escapes') continue;
            const found = firstImage(node[key]);
            if (found) return found;
        }
        return null;
    }

    test('the reader IR carries `escapes.docx.bytes`, and the carried bytes are a GIF', () => {
        const { ir, losses } = readIr('docx', fixtureBytes(FIXTURES[5].path));
        expect(losses).toEqual([]);
        const image = firstImage(ir);
        expect(image).not.toBe(null);
        expect(image.name).toBe('Grafik 1');
        const escaped = image.escapes.docx;
        expect(escaped.bytes).toBeInstanceOf(Uint8Array);
        expect(escaped.bytes.length).toBe(6554);
        expect(escaped.contentType).toBe('image/gif');
        // "GIF89a" — this is the branch that fires. The fixture's name only
        // suggested GIF; the header bytes prove it.
        expect([...escaped.bytes.slice(0, 6)]).toEqual([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    });

    // MEASURED BRANCH: the carried bytes are GIF, not JPEG — so the ledger
    // carries `layout/image-dropped` with `reason: 'unsupported-encoding'`,
    // and the emitted page has NO `/XObject` resource at all. The `format`
    // key is ABSENT because the writer's header reader only names PNG and
    // JPEG (`write/pdf/render/image.js` `readImageHeader`) — it never reads
    // the `escapes.docx.contentType` the reader already resolved.
    test('the GIF branch fires: no /XObject on the page, no `Do` operator, `format` key ABSENT', async () => {
        const r = await toPdf(FIXTURES[5]);
        const dropped = r.losses.find((l) => l.code === 'layout/image-dropped');
        expect(dropped.detail.reason).toBe('unsupported-encoding');
        expect(dropped.detail.bytes).toBe(6554);
        expect(Object.prototype.hasOwnProperty.call(dropped.detail, 'format')).toBe(false);

        const doc = pdfApi.read(r.bytes);
        const deref = (o) => ((o && o.type === 'ref') ? doc._raw.resolve(o) : o);
        const resources = deref(doc.pages[0].resources);
        expect(Object.keys(resources.entries)).toEqual(['Font']);
        expect(latin1(r.bytes)).not.toContain(' Do Q');
    });
});

// ---------------------------------------------------------------------------
// Leg 3 — word-stream return leg (source IR → pdf → toMd)
// ---------------------------------------------------------------------------

/** IR node kinds that open and close a text block. */
const BLOCK_KINDS = new Set([
    'document', 'heading', 'paragraph', 'table', 'row', 'cell',
    'list', 'listItem', 'codeBlock', 'blockquote', 'hr', 'image'
]);

/**
 * Source words: walk the reader IR in document order concatenating `run.text`
 * (and a `codeBlock`'s own `text`), inserting a break at every block boundary,
 * then split on whitespace. When the ledger carries `text/unencodable`, every
 * code point the default route cannot encode is first mapped to `?` — the
 * degrade `write/pdf/render/text.js` applies (no fixture in this corpus
 * triggers it; the mapping is pinned inert below).
 *
 * @param {object} ir
 * @param {boolean} mapUnencodable
 * @returns {string[]}
 */
function sourceWords(ir, mapUnencodable) {
    let buf = '';
    (function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node.kind === 'run' && typeof node.text === 'string') { buf += node.text; return; }
        const isBlock = BLOCK_KINDS.has(node.kind);
        if (isBlock) buf += '\n';
        if (node.kind === 'codeBlock' && typeof node.text === 'string') buf += node.text;
        for (const key of Object.keys(node)) {
            if (key === 'escapes') continue;
            walk(node[key]);
        }
        if (isBlock) buf += '\n';
    })(ir);
    if (mapUnencodable) {
        buf = [...buf]
            .map((ch) => (pdfMetricsApi.winAnsiByte(ch.codePointAt(0)) === null ? '?' : ch))
            .join('');
    }
    return buf.split(/\s+/).filter(Boolean);
}

/** Decoded words: `toMd` the emitted PDF, drop `---` lines, split on whitespace. */
function decodedWords(markdown) {
    return bodyOf(markdown)
        .split('\n')
        .filter((line) => line.trim() !== '---')
        .join(' ')
        .split(/\s+/)
        .filter(Boolean);
}

/** Length of the longest in-order prefix of `src` consumed while scanning `dec`. */
function matchedPrefix(src, dec) {
    let i = 0;
    for (const word of dec) if (i < src.length && src[i] === word) i += 1;
    return i;
}

/**
 * MEASURED per-fixture return-leg record. The plan's hypothesis was that the
 * source word sequence is always an in-order SUBSEQUENCE of the decoded one
 * (list markers and table layout only ADDING tokens). It was FALSE for five
 * of the eight fixtures, for two distinct measured root causes; both are
 * fixed, so it holds on seven of eight today. The eighth, `docx-bulk.docx`,
 * is the one fixture whose ledger records `layout/block-clipped`: its decoded
 * stream is consumed in order to the last word (`matched === dec`), and the
 * source words it lacks (8725 − 8617 = 108) match the 108 units that record
 * names as clipped at the page bottom.
 *
 *  (a) **Segment concatenation — FIXED.** The F9 writer places each table
 *      cell — and each list marker — as its own `BT … Tm (…) Tj ET` at its
 *      own `x`. The tier-1 `pdf → md` decode used to join same-line
 *      show-text segments with NO separator (`(Loren)(Ipsum)(Dolor)` →
 *      `LorenIpsumDolor`, `(1.)(Level1)` → `1.Level1`). It now records each
 *      piece's end position from the glyph widths and inserts one space on
 *      a real horizontal gap, so those tokens come back separated
 *      (re-measured 2026-09-23: docx-structured 37 → 47 decoded words,
 *      poi-table-alignment 18 → 54, poi-numbering 20 → 32 — the list
 *      markers are now their own tokens, ADDED, so the subsequence holds).
 *  (b) **Missing `/Encoding` — FIXED.** The Standard 14 font dict used to
 *      be `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>` with no
 *      `/Encoding` key, while the writer encodes text as CP1252 via
 *      `oconvPdfMetrics.winAnsiByte`, so every byte ≥ 0x80 decoded against
 *      the font's built-in StandardEncoding and vanished — an em dash
 *      (U+2014 → 0x97) came back as nothing, a bullet marker (0x95) too.
 *      The writer now declares `/Encoding /WinAnsiEncoding` on every
 *      Standard 14 font dict, so those bytes decode back to the characters
 *      drawn. Re-measured: the em dash and every bullet marker are now
 *      tokens of their own — ADDED, so the subsequence holds
 *      (docx-structured 47 → 53 decoded words, poi-numbering 32 → 36,
 *      odt-structured 29 → 35), docx-bulk now decodes in order end to end
 *      (matched 9 → 8617), and odt-table becomes exact (26 → 27 decoded,
 *      matched 12 → 27). Pinned explicitly below.
 *
 * `matched` is the longest in-order prefix of the source stream the decoded
 * stream consumes; `subsequence` is `matched === src.length`.
 */
const RETURN_LEG = {
    'docx-smoke.docx': { src: 29, dec: 29, matched: 29, subsequence: true, exact: true },
    'docx-structured.docx': { src: 47, dec: 53, matched: 47, subsequence: true, exact: false },
    'docx-bulk.docx': { src: 8725, dec: 8617, matched: 8617, subsequence: false, exact: false },
    'poi-numbering.docx': { src: 20, dec: 36, matched: 20, subsequence: true, exact: false },
    'poi-table-alignment.docx': { src: 54, dec: 54, matched: 54, subsequence: true, exact: true },
    'poi-with-gif.docx': { src: 100, dec: 102, matched: 100, subsequence: true, exact: false },
    'odt-structured.odt': { src: 29, dec: 35, matched: 29, subsequence: true, exact: false },
    'odt-table.odt': { src: 27, dec: 27, matched: 27, subsequence: true, exact: true }
};

describe('crossformat → pdf — leg 3: word-stream return leg (MEASURED, not assumed)', () => {
    for (const fixture of FIXTURES) {
        const expected = RETURN_LEG[fixture.name];
        test(`${fixture.name}: src=${expected.src} dec=${expected.dec} matched=${expected.matched} subsequence=${expected.subsequence}`, async () => {
            const bytes = fixtureBytes(fixture.path);
            const { ir } = readIr(fixture.format, bytes);
            const r = await toPdf(fixture);
            const hasUnencodable = r.losses.some((l) => l.code === 'text/unencodable');
            // Pinned inert: no fixture in this corpus reaches the degrade, so
            // the `?` mapping never runs. It stays implemented so that a
            // future corpus addition that DOES reach it is compared honestly.
            expect(hasUnencodable).toBe(false);

            const src = sourceWords(ir, hasUnencodable);
            const md = await oconv.toMd({ name: 'x.pdf', bytes: r.bytes, convertedAt: FIXED_AT });
            const dec = decodedWords(md.markdown);

            expect(src.length).toBe(expected.src);
            expect(dec.length).toBe(expected.dec);
            expect(matchedPrefix(src, dec)).toBe(expected.matched);
            expect(matchedPrefix(src, dec) === src.length).toBe(expected.subsequence);
            expect(src.length === dec.length && src.every((w, i) => w === dec[i]))
                .toBe(expected.exact);
        });
    }

    // FALSIFICATION — the subsequence check is not vacuous: mutate one word of
    // the source stream on a fixture where the relation holds EXACTLY,
    // and the check must fail.
    test('falsification: mutating one source word breaks the subsequence check on docx-smoke.docx', async () => {
        const bytes = fixtureBytes(FIXTURES[0].path);
        const { ir } = readIr('docx', bytes);
        const r = await toPdf(FIXTURES[0]);
        const md = await oconv.toMd({ name: 'x.pdf', bytes: r.bytes, convertedAt: FIXED_AT });
        const dec = decodedWords(md.markdown);

        const src = sourceWords(ir, false);
        expect(matchedPrefix(src, dec)).toBe(src.length);

        const mutated = src.slice();
        mutated[Math.floor(mutated.length / 2)] = 'ZZZ-not-in-the-document';
        expect(matchedPrefix(mutated, dec)).toBeLessThan(mutated.length);
    });

    // Root cause (a), pinned directly on its fix: a list marker and its item
    // body are two separately placed segments, and the decode now separates
    // them by one space (the gap between the marker's end and the body's
    // start exceeds the word-gap threshold); the same for table cells.
    test('root cause (a), fixed: list markers and table cells come back SEPARATED from the next segment', async () => {
        const numbering = await toPdf(FIXTURES[3]);
        const numberingMd = bodyOf((await oconv.toMd({
            name: 'x.pdf', bytes: numbering.bytes, convertedAt: FIXED_AT
        })).markdown);
        // Re-measured 2026-10-02 (office/BATCH_49/02, BL-1598): the paragraph
        // starts a line with `1.`, which `@awacloud/md`'s renderer now
        // escapes (`1\.`) so the Markdown re-parses as a paragraph, not an
        // ordered list; the mid-line `2.` / `3.` are not line starts.
        expect(numberingMd).toContain('1\\. Level1 2. Level2 3. Level3');
        expect(numberingMd).not.toContain('1.Level1');
        // The writer places them apart — two `Tj` at two different `x`.
        expect(latin1(numbering.bytes)).toContain('1 0 0 1 61.519 697.747 Tm (1.) Tj');
        expect(latin1(numbering.bytes)).toContain('1 0 0 1 74.693 697.747 Tm (Level1) Tj');

        const table = await toPdf(FIXTURES[4]);
        const tableMd = bodyOf((await oconv.toMd({
            name: 'x.pdf', bytes: table.bytes, convertedAt: FIXED_AT
        })).markdown);
        expect(tableMd).toContain('Loren Ipsum Dolor');
        expect(tableMd).not.toContain('LorenIpsumDolor');
    });

    // Root cause (b), pinned directly on its fix: the Standard 14 font dict
    // names `/Encoding /WinAnsiEncoding`, so a CP1252 high byte decodes back
    // to the character the writer drew.
    test('root cause (b), fixed: `/Encoding /WinAnsiEncoding` on the Standard 14 font dict — an em dash decodes back', async () => {
        const r = await toPdf(FIXTURES[2]);
        const raw = latin1(r.bytes);
        // The writer emitted the CP1252 em-dash byte (0x97 = winAnsiByte(U+2014)).
        expect(pdfMetricsApi.winAnsiByte(0x2014)).toBe(0x97);
        expect(raw).toContain('of section 1 \u0097 filler');
        // …and declares the encoding of the font that renders it.
        expect(raw).toContain('/Encoding /WinAnsiEncoding');
        expect(raw).toContain('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        expect(raw).not.toContain('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
        // …so the return leg reads the character back.
        const md = await oconv.toMd({ name: 'x.pdf', bytes: r.bytes, convertedAt: FIXED_AT });
        expect(bodyOf(md.markdown)).toContain('of section 1 \u2014 filler');
        expect(bodyOf(md.markdown)).not.toContain('of section 1  filler');
    });
});

// ---------------------------------------------------------------------------
// Leg 4 — byte determinism
// ---------------------------------------------------------------------------

describe('crossformat → pdf — leg 4: two runs are byte-identical', () => {
    // The pdf writer has no zip container and stamps no clock of its own, so
    // two-run byte identity holds. The `→ docx` direction is byte-reproducible
    // as well (fixed zip entry timestamp); only the `→ odt` direction is not
    // (the ODF package writer stamps the current time).
    for (const fixture of FIXTURES) {
        test(`${fixture.name} → pdf is deterministic (sha256)`, async () => {
            const first = await toPdf(fixture);
            const second = await toPdf(fixture);
            expect(sha256(second.bytes)).toBe(sha256(first.bytes));
            expect(second.losses).toEqual(first.losses);
        });
    }
});

// ---------------------------------------------------------------------------
// Leg 5 — embedded font route
// ---------------------------------------------------------------------------

/**
 * PostScript name → style class, for the four Latin faces the vendored
 * `facturx-minimum-sample.pdf` carries — the SAME test-local mining recipe
 * `fidelity.integration.test.js` uses, copied rather than imported (`src/`
 * never reaches into a PDF for a font).
 */
const PDF_STYLE_BY_PSNAME = {
    'Calibri': 'regular',
    'Calibri-Bold': 'bold',
    'Calibri-Italic': 'italic',
    'Calibri-BoldItalic': 'boldItalic'
};

/** Mine the four embedded Latin FontFile2 programs out of a PDF's /Font resources. */
function embeddedFontBytesFromPdf(pdfBytes) {
    const doc = pdfApi.read(pdfBytes);
    const resolveRef = doc._raw.resolve;
    const deref = (o) => ((o && o.type === 'ref') ? resolveRef(o) : o);
    const out = {};
    for (const page of doc.pages) {
        const res = deref(page.resources);
        if (!res || !res.entries || !res.entries.Font) continue;
        const fontRes = deref(res.entries.Font);
        for (const key of Object.keys(fontRes.entries)) {
            const fontDict = deref(fontRes.entries[key]);
            let descriptor = fontDict.entries.FontDescriptor
                ? deref(fontDict.entries.FontDescriptor) : null;
            if (!descriptor && fontDict.entries.DescendantFonts) {
                const df = deref(deref(fontDict.entries.DescendantFonts).items[0]);
                descriptor = df.entries.FontDescriptor ? deref(df.entries.FontDescriptor) : null;
            }
            if (!descriptor || !descriptor.entries.FontFile2) continue;
            const program = pdfFilterDispatchApi.decode(deref(descriptor.entries.FontFile2), resolveRef);
            const style = PDF_STYLE_BY_PSNAME[fontsApi.read(program).names.postScriptName];
            if (style && !out[style]) out[style] = program;
        }
    }
    return out;
}

describe('crossformat → pdf — leg 5: embedded font route (docx-smoke.docx)', () => {
    test('same page count as the default route; one font-fallback for the unsupplied `code` class', async () => {
        const corpusFonts = embeddedFontBytesFromPdf(
            fixtureBytes('./_fixtures/corpus/pdf/facturx-minimum-sample.pdf')
        );
        expect(Object.keys(corpusFonts).sort())
            .toEqual(['bold', 'boldItalic', 'italic', 'regular']);

        const std = await toPdf(FIXTURES[0]);
        const embedded = await toPdf(FIXTURES[0], { pageNumbers: false, fonts: corpusFonts });

        expect(pdfApi.read(embedded.bytes).pages.length)
            .toBe(pdfApi.read(std.bytes).pages.length);
        // MEASURED: the four supplied classes place; the `code` (mono) class
        // has no supplied bytes and falls back to the Standard 14 Courier.
        // RE-PINNED by office/BATCH_38 task 04 (BL-1257 re-measurement, not a
        // weakening): the corpus-mined Calibri faces are SUBSETS lacking
        // glyphs for several Latin letters; those occurrences used to draw
        // `.notdef` silently and are now ONE `text/unencodable` record.
        expect(embedded.losses).toEqual([
            { code: 'layout/font-fallback', detail: { style: 'code', baseFont: 'Courier' } },
            { code: 'text/unencodable', detail: { count: 16, sample: 'vGhWZwkb' } }
        ]);
    });

    test('the embedded route is byte-deterministic too', async () => {
        const corpusFonts = embeddedFontBytesFromPdf(
            fixtureBytes('./_fixtures/corpus/pdf/facturx-minimum-sample.pdf')
        );
        const first = await toPdf(FIXTURES[0], { pageNumbers: false, fonts: corpusFonts });
        const second = await toPdf(FIXTURES[0], { pageNumbers: false, fonts: corpusFonts });
        expect(sha256(second.bytes)).toBe(sha256(first.bytes));
    });
});

// ---------------------------------------------------------------------------
// Leg 6 — `opts.pdf` refusal at the pair level
// ---------------------------------------------------------------------------

describe('crossformat → pdf — leg 6: `opts.pdf` is refused for a non-pdf target', () => {
    test('convert(docx → odt) with opts.pdf throws `oconv: pdf options need target pdf`', async () => {
        await expect(oconv.convert({
            bytes: fixtureBytes(FIXTURES[0].path),
            name: 'docx-smoke.docx',
            target: 'odt',
            opts: { pdf: { pageNumbers: false } }
        })).rejects.toThrow('oconv: pdf options need target pdf');
    });

    test('the same call without opts.pdf succeeds (the refusal is about the options, not the pair)', async () => {
        const r = await oconv.convert({
            bytes: fixtureBytes(FIXTURES[0].path),
            name: 'docx-smoke.docx',
            target: 'odt'
        });
        expect(r.target).toBe('odt');
        expect(r.bytes).toBeInstanceOf(Uint8Array);
    });
});

// ---------------------------------------------------------------------------
// Leg 7 — OWNER ACCEPTANCE for the task 01 `pdfBuilder.addImage` seam
// ---------------------------------------------------------------------------

/**
 * The 2026-09-09 ruling that lifted the `office/pdf` write constraint asked
 * for the effective behaviour of the new image-XObject seam *with `oconv`* to
 * be tested end to end. Both routes into the seam are exercised:
 *
 *   A. `fromMd(markdown, 'pdf', { assets })` — the caller-supplied manifest.
 *   B. `fromMd(markdown, 'docx', { assets })` → `convert(docx → pdf)` — the
 *      reader-carried `escapes.docx.bytes` path.
 *
 * Both PLACE the JPEG; both are byte-deterministic; the convert leg records
 * ZERO losses.
 */
const ACCEPTANCE_MD = [
    '# Seam acceptance',
    '',
    'A paragraph before the image.',
    '',
    '![Pixel](pixel.jpg)',
    '',
    'A paragraph after the image.',
    ''
].join('\n');

/** The committed first-party JPEG asset (BL-980, `corpus/assets/PROVENANCE.md`). */
const ASSET_JPEG = fixtureBytes('./_fixtures/corpus/assets/px.jpg');

/** The single image XObject of a one-page PDF, as `{name, dict, raw}`. */
function soleImageXObject(pdfBytes) {
    const doc = pdfApi.read(pdfBytes);
    const deref = (o) => ((o && o.type === 'ref') ? doc._raw.resolve(o) : o);
    const resources = deref(doc.pages[0].resources);
    const xobjects = deref(resources.entries.XObject);
    const names = Object.keys(xobjects.entries);
    expect(names).toHaveLength(1);
    const stream = deref(xobjects.entries[names[0]]);
    const dict = {};
    for (const [k, v] of Object.entries(stream.dict.entries)) dict[k] = v.value;
    return { name: names[0], dict, raw: stream.raw };
}

describe('crossformat → pdf — leg 7: OWNER ACCEPTANCE of the pdfBuilder.addImage seam', () => {
    test('route A — fromMd(pdf) + assets: the JPEG places with parsed geometry, `Do` is emitted, zero loss', async () => {
        const written = await oconv.fromMd({
            markdown: ACCEPTANCE_MD, target: 'pdf', assets: { 'pixel.jpg': ASSET_JPEG }
        });
        expect(written.losses).toEqual([]);
        expect(written.lossy).toBe(false);

        const image = soleImageXObject(written.bytes);
        expect(image.name).toBe('Im0');
        expect(image.dict).toEqual({
            Type: 'XObject', Subtype: 'Image',
            Width: 1, Height: 1,
            ColorSpace: 'DeviceGray', BitsPerComponent: 8,
            Filter: 'DCTDecode', Length: ASSET_JPEG.length
        });
        expect([...image.raw]).toEqual([...ASSET_JPEG]);
        expect(latin1(written.bytes)).toContain('q 1 0 0 1 56.693 701.037 cm /Im0 Do Q');
    });

    test('route A is byte-identical on a second run', async () => {
        const first = await oconv.fromMd({
            markdown: ACCEPTANCE_MD, target: 'pdf', assets: { 'pixel.jpg': ASSET_JPEG }
        });
        const second = await oconv.fromMd({
            markdown: ACCEPTANCE_MD, target: 'pdf', assets: { 'pixel.jpg': ASSET_JPEG }
        });
        expect(sha256(second.bytes)).toBe(sha256(first.bytes));
    });

    test('route B — fromMd(docx) then convert(docx → pdf): the reader-carried bytes place identically, zero loss', async () => {
        const asDocx = await oconv.fromMd({
            markdown: ACCEPTANCE_MD, target: 'docx', assets: { 'pixel.jpg': ASSET_JPEG }
        });
        expect(asDocx.losses).toEqual([
            { code: 'image/size-defaulted', detail: 'pixel.jpg' }
        ]);
        const readBack = docxApi.read(asDocx.bytes);
        expect(Object.keys(readBack.images)).toEqual(['rImg1']);
        expect([...readBack.images.rImg1.data]).toEqual([...ASSET_JPEG]);

        const asPdf = await oconv.convert({ bytes: asDocx.bytes, format: 'docx', target: 'pdf' });
        expect(asPdf.losses).toEqual([]);

        const image = soleImageXObject(asPdf.bytes);
        expect(image.name).toBe('Im0');
        expect(image.dict).toEqual({
            Type: 'XObject', Subtype: 'Image',
            Width: 1, Height: 1,
            ColorSpace: 'DeviceGray', BitsPerComponent: 8,
            Filter: 'DCTDecode', Length: ASSET_JPEG.length
        });
        expect([...image.raw]).toEqual([...ASSET_JPEG]);
        expect(latin1(asPdf.bytes)).toContain('q 1 0 0 1 56.693 701.037 cm /Im0 Do Q');

        const again = await oconv.convert({ bytes: asDocx.bytes, format: 'docx', target: 'pdf' });
        expect(sha256(again.bytes)).toBe(sha256(asPdf.bytes));
    });
});

// ---------------------------------------------------------------------------
// `references/` is never read here
// ---------------------------------------------------------------------------

describe('crossformat → pdf — references/ is never read', () => {
    test('every fixture path literal in this file resolves under tests/_fixtures/', () => {
        const src = readFileSync(
            new URL('./crossformat-to-pdf.integration.test.js', import.meta.url),
            'utf8'
        );
        const literals = [...src.matchAll(/(['"`])(\.\/[^'"`]*)\1/g)].map((mm) => mm[2]);
        expect(literals.length).toBeGreaterThan(8);
        for (const literal of literals) {
            const resolved = new URL(literal, import.meta.url).pathname;
            expect(resolved).not.toContain('/references/');
        }
    });
});
