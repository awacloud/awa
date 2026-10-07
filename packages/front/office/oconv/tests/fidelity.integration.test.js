// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Fidelity harness — task 06 (`ai/batches/types/office/BATCH_11/
 * 06-harness-corpus-docs.md`) deliverable. Composes the frozen facade
 * (`src/oconv.js`, via `src/main.js`) over the golden corpus vendored under
 * `tests/_fixtures/corpus/` and asserts:
 *
 *  1. **docx spike corpus** (`corpus/docx/*.docx`, first-party, byte-copied
 *     from `ai/plans/oconv/spikes/w0-core/corpus/docx/` — GAP-OOXML-4:
 *     regeneration is not byte-identical, so these are copied, never
 *     regenerated) — `losses: []` / `lossy: false` on `docx-smoke.docx` and
 *     `docx-bulk.docx`, the W0-measured result. A regression on either is a
 *     real regression. **`docx-structured.docx` is the one documented
 *     exception**: the committed file carries `w:numPr` (`numId` 1 and 2)
 *     with NO `word/numbering.xml` part at all (`unzip -l` confirmed — the
 *     spike's own corpus-gen never wrote one), so the FROZEN, delivered
 *     reader (task 02) correctly reports `list/numbering-unresolved` twice —
 *     this is GAP-OOXML-4's sibling gap GAP-OOXML-2 (`ai/plans/oconv/
 *     spikes/w0-core/FINDINGS.md`), already documented, firing on this exact
 *     fixture. The W0 spike's own throwaway prototype reader recorded no
 *     loss taxonomy at all (`ai/plans/oconv/spikes/w0-core/prototype/
 *     docx-to-ir.js`'s `orderedNumIds` silently defaults unresolved numIds
 *     to bulleted, unlike the frozen production reader — see the
 *     `docx-structured.docx` test below for the full explanation) — so the
 *     "zero loss" text in this task's own plan reflects that prototype's
 *     silence, not a property the delivered, honest (F3) reader ever had.
 *     Asserting a fabricated `losses: []` here would misreport what the
 *     shipped pipeline actually does; this loss is already the loss matrix's
 *     own documented "ordered-vs-bullet degraded" row (FINDINGS §Axis 3).
 *  2. **odt fixtures** (`corpus/odt/*.odt`, generated once via
 *     `tests/_fixtures/gen-odt-fixtures.js`, `@awacloud/odf`'s public writer,
 *     bytes committed) — tier-2 assertions: semantic heading mapping,
 *     nested-list preservation, and (task 07, BATCH_27) the text-body table
 *     mapping to a real IR `table` — GAP-ODF-1 is RETIRED: task 04 gave
 *     `odt.read()` a `<table:table>` dispatch, so `odt-table.odt` now
 *     converts with zero loss instead of the former `block/dropped`.
 *  3. **Reproducibility** — a fixed `convertedAt` makes two conversions of
 *     the same bytes byte-identical; changing only `convertedAt` changes
 *     exactly that one front-matter line.
 *  4. **Profile shape**, checked across the WHOLE corpus (docx spike + odt
 *     + real-world) — front matter parses via `@awacloud/md`'s reader-only
 *     `mdFrontmatter` extra (F4), `anchors:` count matches the number of
 *     `#`-headings in the body, and `sourceSha256` matches a fresh SHA-256
 *     of the fixture bytes just read (closes the loop end to end).
 *  5. **Real-world corpus** (`corpus/real/*.docx`, owner-authorized vendoring
 *     — `ai/batches/types/office/BATCH_11/_OWNER-CORPUS-SOURCES.md`) —
 *     genuine Apache POI `test-data` documents (Apache-2.0, see
 *     `corpus/PROVENANCE.md`). Each converts without throwing; the exact
 *     measured loss/no-loss result is pinned as a regression guard. No
 *     reader gap was found on these three files — nothing here is a
 *     BACKLOG feed-back item.
 *
 * BATCH_14 W2 (task 06) extends the harness to the five new pairs, each
 * against its own vendored corpus (own `PROVENANCE.md` per directory, the
 * exact loss ledger re-measured there before being pinned here as a
 * regression guard — never a fabricated "should be zero"):
 *
 *  6. **xlsx** (`corpus/xlsx/*.xlsx`, real-world, Apache POI `test-data`,
 *     Apache-2.0) — plain multi-sheet grids convert with zero loss; a
 *     genuine Excel-computed formula cell records `sheet/formula-as-value`.
 *  7. **ods** (`corpus/ods/ods-structured.ods`, first-party, `@awacloud/odf`'s
 *     public writer) — multi-sheet order, `table:table-header-rows` →
 *     `row.header`, one real formula loss, an empty sheet inside a
 *     multi-sheet workbook.
 *  8. **pptx** (`corpus/pptx/*.pptx`, real-world, Apache POI `test-data`,
 *     Apache-2.0) — genuine title+body slides convert with zero loss;
 *     table/picture-only slides record `slides/media-dropped` +
 *     `slides/untitled` together, real-world-confirmed.
 *  9. **odp** (`corpus/odp/*.odp`, first-party, `@awacloud/odf`'s public writer)
 *     — both `includeNotes` paths exercised: `false` records
 *     `slides/notes-omitted`, `true` renders a `blockquote` instead; a
 *     media-dropped + untitled + notes-omitted combination coexisting on
 *     one slide.
 * 10. **pdf** (`corpus/pdf/facturx-minimum-sample.pdf`, real-world FNFE-MPE
 *     Factur-X reference invoice; `corpus/pdf-tagged/tagged-structured.pdf`,
 *     first-party tagged fast-path sample) — F5 bounds (tier 1, text-first,
 *     no layout inference): the tagged sample derives headings/paragraphs
 *     from the struct tree and flattens its `Table` container
 *     (`struct/dropped`); the real invoice decodes its embedded-font text
 *     via ToUnicode and drops its one embedded image (`image/dropped`) —
 *     the measured decode-coverage figure (100.00%, task 05's report) is
 *     published in `docs/loss-matrix.md`, not re-measured through this
 *     facade (the frozen `toMd` result never threads `coverage` through,
 *     see `src/oconv.js`).
 *
 * `references/` is never read here (owner ruling 2026-07-20,
 * `ai/memory/types/office.md`) — every byte this file consumes is vendored
 * under `tests/_fixtures/corpus/`.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';
import { mdFrontmatter } from '@awacloud/md/extra/frontmatter.js';

const FIXED_AT = '2026-07-20T00:00:00Z';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.register(mdFrontmatter);
const oconv = runtime.resolve('oconv');
const frontmatterApi = runtime.resolve('mdFrontmatter');
// Resolvable because `@awacloud/oconv`'s own `main.js` `modules` array already
// carries the whole `@awacloud/pdf` + `@awacloud/fonts` closure (task 11,
// office/BATCH_33) — no new bare specifier is introduced here.
const pdfApi = runtime.resolve('pdf');
const pdfFilterDispatchApi = runtime.resolve('pdfFilterDispatch');
const fontsApi = runtime.resolve('fonts');
// Reading a written `.docx` back for the BL-980 image legs.
const docxApi = runtime.resolve('docx');

/** @param {string} relPath relative to this file */
function fixtureBytes(relPath) {
    return new Uint8Array(readFileSync(new URL(relPath, import.meta.url)));
}

/** @param {string} relPath relative to this file */
function fixtureText(relPath) {
    return readFileSync(new URL(relPath, import.meta.url), 'utf8');
}

// The committed first-party image assets (BL-980). Provenance:
// `tests/_fixtures/corpus/assets/PROVENANCE.md`.
const ASSET_PNG = fixtureBytes('./_fixtures/corpus/assets/px.png');
const ASSET_JPEG = fixtureBytes('./_fixtures/corpus/assets/px.jpg');

/**
 * Strip a leading `---`/…/`---` front-matter fence and return the body —
 * mirrored from `tests/roundtrip.integration.test.js`'s own helper (this
 * file has no front matter to compare against, only the pdf writer's
 * decoded round trip).
 *
 * @param {string} markdown
 * @returns {string}
 */
function bodyOf(markdown) {
    const lines = markdown.split('\n');
    if (lines[0] !== '---') return markdown;
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') { end = i; break; }
    }
    if (end === -1) return markdown;
    return lines.slice(end + 1).join('\n');
}

/** @param {Uint8Array} bytes */
async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const view = new Uint8Array(digest);
    let hex = '';
    for (const b of view) hex += b.toString(16).padStart(2, '0');
    return hex;
}

/** Number of `#`-heading lines in a CommonMark body (front matter stripped). */
function countHeadingLines(body) {
    const m = body.match(/^#{1,6}\s/gm);
    return m ? m.length : 0;
}

const DOCX_SPIKE = [
    'docx-smoke.docx', 'docx-structured.docx', 'docx-bulk.docx'
].map(name => ({ name, path: `./_fixtures/corpus/docx/${name}` }));

const ODT_FIXTURES = [
    'odt-structured.odt', 'odt-table.odt'
].map(name => ({ name, path: `./_fixtures/corpus/odt/${name}` }));

const XLSX_FIXTURES = [
    'poi-simple-multicell.xlsx', 'poi-formula-eval.xlsx'
].map(name => ({ name, path: `./_fixtures/corpus/xlsx/${name}` }));

const ODS_FIXTURES = [
    'ods-structured.ods'
].map(name => ({ name, path: `./_fixtures/corpus/ods/${name}` }));

const PPTX_FIXTURES = [
    'poi-sampleshow.pptx', 'poi-table.pptx', 'poi-pictures.pptx'
].map(name => ({ name, path: `./_fixtures/corpus/pptx/${name}` }));

const ODP_FIXTURES = [
    'odp-structured.odp', 'odp-media.odp'
].map(name => ({ name, path: `./_fixtures/corpus/odp/${name}` }));

const PDF_FIXTURES = [
    { name: 'tagged-structured.pdf', path: './_fixtures/corpus/pdf-tagged/tagged-structured.pdf' },
    { name: 'facturx-minimum-sample.pdf', path: './_fixtures/corpus/pdf/facturx-minimum-sample.pdf' }
];

const REAL_DOCX = [
    'poi-numbering.docx', 'poi-table-alignment.docx', 'poi-with-gif.docx'
].map(name => ({ name, path: `./_fixtures/corpus/real/${name}` }));

describe('fidelity — docx spike corpus (first-party, W0-measured)', () => {
    const ZERO_LOSS = ['docx-smoke.docx', 'docx-bulk.docx'];
    for (const { name, path } of DOCX_SPIKE.filter(f => ZERO_LOSS.includes(f.name))) {
        test(`${name} converts with zero loss`, async () => {
            const bytes = fixtureBytes(path);
            const result = await oconv.toMd({ name, bytes, convertedAt: FIXED_AT });
            expect(result.losses).toEqual([]);
            expect(result.lossy).toBe(false);
        });
    }

    // `docx-structured.docx` is the documented exception — see the
    // file-header comment. The committed fixture has NO `word/numbering.xml`
    // part (`unzip -l` confirmed), so numId 1 and numId 2 are genuinely
    // unresolvable; the frozen reader's `list/numbering-unresolved` is the
    // correct, honest (F3) report, not a regression.
    test('docx-structured.docx converts with the documented unresolved-numbering loss (GAP-OOXML-2, not a regression)', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/docx/docx-structured.docx');
        const result = await oconv.toMd({
            name: 'docx-structured.docx', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'list/numbering-unresolved', detail: 'numId 1' },
            { code: 'list/numbering-unresolved', detail: 'numId 2' }
        ]);
        // Structure otherwise fully preserved: headings, both lists (as GFM
        // bullets — ordering degraded, not dropped), and the 5x3 table.
        expect(result.markdown).toContain('# Conversion matrix');
        expect(result.markdown).toContain('Read with the owning package');
        expect(result.markdown).toContain('| docx | to-md | 2 |');
    });
});

describe('fidelity — odt fixtures (tier 2: headings, tables, lists)', () => {
    test('odt-structured.odt — semantic headings + nested lists, spans/lists unresolved (documented)', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/odt/odt-structured.odt');
        const result = await oconv.toMd({
            name: 'odt-structured.odt', bytes, convertedAt: FIXED_AT
        });

        // Headings are semantic (odt's own `outlineLevel`, never a style
        // heuristic — odt-to-ir.js) and anchors are in document order.
        expect(result.anchors).toEqual([
            { level: 1, anchor: 'sovereign-rag-ingestion' },
            { level: 2, anchor: 'why-air-gap-matters' },
            { level: 3, anchor: 'chunking' }
        ]);

        // Lists ARE present in the body (GFM bullet syntax — odt's public
        // model never resolves ordered-vs-bullet, GAP documented below).
        expect(result.markdown).toContain('First step');
        expect(result.markdown).toContain('Nested B.1');
        expect(result.markdown).toContain('external reference link');

        // Documented, already-known gaps (task 03 report) — not new here:
        // `@awacloud/odf`'s public model never resolves span run formatting nor
        // list ordering, so both fire on every real odt document.
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'run/format-unresolved', detail: 'Emphasis' },
            { code: 'list/numbering-unresolved', detail: 'WWNum1' },
            { code: 'list/numbering-unresolved', detail: 'WWNum2' },
            { code: 'list/numbering-unresolved', detail: 'WWNum2Sub' }
        ]);
    });

    test('odt-table.odt — GAP-ODF-1 RETIRED (task 04): the text-body table '
        + 'now maps to a real IR table, zero loss, GFM rows in the body', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/odt/odt-table.odt');
        const result = await oconv.toMd({
            name: 'odt-table.odt', bytes, convertedAt: FIXED_AT
        });

        expect(result.markdown).toContain('A text-body table follows');
        expect(result.markdown).toContain('End of document.');
        // Measured (task 07): the committed fixture never wraps its rows in
        // `<table:table-header-rows>` (`gen-odt-fixtures.js`'s `tableRow`
        // helper), so `headerRows` is 0 and both odt rows carry
        // `header: false` — `@awacloud/md`'s GFM table writer still emits the
        // first row as the syntactic header (a plain 2-row table needs one to
        // be valid GFM), independent of that flag.
        expect(result.markdown).toContain('| Header A | Header B |');
        expect(result.markdown).toContain('| --- | --- |');
        expect(result.markdown).toContain('| 1,1 | 1,2 |');
        // No degrade at all any more — the former `block/dropped
        // table:table` pin (GAP-ODF-1) is dead: task 04 gave `odt.read()` a
        // `<table:table>` dispatch, and this reader now maps it (task 07).
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
    });
});

describe('fidelity — xlsx fixtures (real-world, tier 2)', () => {
    test('poi-simple-multicell.xlsx — converts with zero loss (plain numeric grids, 3 sheets, no styles/formulas/charts/merges)', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/xlsx/poi-simple-multicell.xlsx');
        const result = await oconv.toMd({
            name: 'poi-simple-multicell.xlsx', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
        expect(result.markdown).toContain('# Sheet1');
        expect(result.markdown).toContain('# Sheet2');
        expect(result.markdown).toContain('# Sheet3');
    });

    test('poi-formula-eval.xlsx — records sheet/formula-as-value for the real Excel-computed D1 SUM formula', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/xlsx/poi-formula-eval.xlsx');
        const result = await oconv.toMd({
            name: 'poi-formula-eval.xlsx', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'sheet/formula-as-value', detail: 'Sheet1!D1' }
        ]);
        // The cached value (6.75), not the formula text, is what survives.
        expect(result.markdown).toContain('6.75');
    });
});

describe('fidelity — ods fixture (first-party, tier 2)', () => {
    test('ods-structured.ods — multi-sheet order, table:table-header-rows -> row.header, one real formula loss, an empty trailing sheet', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/ods/ods-structured.ods');
        const result = await oconv.toMd({
            name: 'ods-structured.ods', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(true);
        // Exactly one loss (PROVENANCE.md, spot-verified at generation time):
        // no styled cell, no merge, no table:shapes on this fixture.
        expect(result.losses).toEqual([
            { code: 'sheet/formula-as-value', detail: 'Data!R3C2' }
        ]);
        expect(result.markdown).toContain('# Data');
        // `Empty` (zero rows) still emits its own heading, no table node.
        expect(result.markdown).toContain('# Empty');
    });
});

describe('fidelity — pptx fixtures (real-world, tier 1)', () => {
    test('poi-sampleshow.pptx — converts with zero loss (genuine title+body slides, non-ASCII prose)', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/pptx/poi-sampleshow.pptx');
        const result = await oconv.toMd({
            name: 'poi-sampleshow.pptx', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
    });

    test('poi-table.pptx — a table-only, untitled slide records media-dropped(table) + untitled', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/pptx/poi-table.pptx');
        const result = await oconv.toMd({
            name: 'poi-table.pptx', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'slides/media-dropped', detail: 'table' },
            { code: 'slides/untitled', detail: '' }
        ]);
    });

    test('poi-pictures.pptx — 3 picture-only, untitled slides record 3x media-dropped(picture) interleaved with 3x untitled, in slide order', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/pptx/poi-pictures.pptx');
        const result = await oconv.toMd({
            name: 'poi-pictures.pptx', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'slides/media-dropped', detail: 'picture' },
            { code: 'slides/untitled', detail: '' },
            { code: 'slides/media-dropped', detail: 'picture' },
            { code: 'slides/untitled', detail: '' },
            { code: 'slides/media-dropped', detail: 'picture' },
            { code: 'slides/untitled', detail: '' }
        ]);
    });
});

describe('fidelity — odp fixtures (first-party, tier 1, both includeNotes paths)', () => {
    test('odp-structured.odp — includeNotes:false (default) records slides/notes-omitted once (slide 1 only, slide 2 has no notes)', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/odp/odp-structured.odp');
        const result = await oconv.toMd({
            name: 'odp-structured.odp', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'slides/notes-omitted', detail: '' }
        ]);
    });

    test('odp-structured.odp — includeNotes:true converts with zero loss, notes rendered as a trailing blockquote', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/odp/odp-structured.odp');
        const result = await oconv.toMd({
            name: 'odp-structured.odp', bytes, convertedAt: FIXED_AT, includeNotes: true
        });
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
        expect(result.markdown).toContain('Remember to mention the offline chunker demo.');
    });

    test('odp-media.odp — media-dropped(image) + untitled + notes-omitted coexist on one slide', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/odp/odp-media.odp');
        const result = await oconv.toMd({
            name: 'odp-media.odp', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'slides/media-dropped', detail: 'image' },
            { code: 'slides/untitled', detail: '' },
            { code: 'slides/notes-omitted', detail: '' }
        ]);
    });

    test('odp-media.odp — includeNotes:true drops the notes-omitted loss, keeps media-dropped + untitled', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/odp/odp-media.odp');
        const result = await oconv.toMd({
            name: 'odp-media.odp', bytes, convertedAt: FIXED_AT, includeNotes: true
        });
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'slides/media-dropped', detail: 'image' },
            { code: 'slides/untitled', detail: '' }
        ]);
        expect(result.markdown).toContain('Speaker note that includeNotes:false must omit.');
    });
});

describe('fidelity — pdf fixtures (F5 bounds: tier 1, text-first, no layout inference)', () => {
    test('tagged-structured.pdf — tagged fast path: headings + paragraphs from the struct tree, Table container flattened', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/pdf-tagged/tagged-structured.pdf');
        const result = await oconv.toMd({
            name: 'tagged-structured.pdf', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'struct/dropped', detail: 'Table' }
        ]);
        expect(result.markdown).toContain('# Quarterly Report');
        expect(result.markdown).toContain('This report summarizes the quarter.');
        expect(result.markdown).toContain('## Details');
        expect(result.markdown).toContain('Revenue grew across all regions.');
        expect(result.markdown).toContain('Cell one');
        expect(result.markdown).toContain('Cell two');
    });

    test('facturx-minimum-sample.pdf — real invoice corpus: ToUnicode text decode, one image/dropped loss (embedded logo raster)', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/pdf/facturx-minimum-sample.pdf');
        const result = await oconv.toMd({
            name: 'facturx-minimum-sample.pdf', bytes, convertedAt: FIXED_AT
        });
        // Measured decode coverage on this exact fixture is 100.00%
        // (4128/4128 codes, 0 undecodable — task 05's report, published in
        // docs/loss-matrix.md). The one loss below is the embedded raster
        // image tier 1 always drops, not an undecodable-text loss.
        expect(result.lossy).toBe(true);
        expect(result.losses.length).toBe(1);
        expect(result.losses[0].code).toBe('image/dropped');
        expect(result.markdown.length).toBeGreaterThan(0);
    });

    // Narrower counterpart of the "profile shape (whole corpus)" describe
    // below. That block used to EXCLUDE this fixture from its generic
    // heading-count invariant (the real invoice's extracted text starts 5
    // lines with a literal `#`, which the Markdown writer did not escape);
    // since BL-1598 (office/BATCH_49/02, 2026-10-02) `@awacloud/md`'s
    // renderer escapes them (`\#`), so the fixture is back in the whole-
    // corpus loop. Front matter and sourceSha256 are real, checkable
    // invariants that still hold on this fixture.
    test('facturx-minimum-sample.pdf — front matter parses and sourceSha256 matches the fixture bytes', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/pdf/facturx-minimum-sample.pdf');
        const result = await oconv.toMd({
            name: 'facturx-minimum-sample.pdf', bytes, convertedAt: FIXED_AT
        });

        const { frontmatter } = frontmatterApi.stripFrontmatter(result.markdown);
        expect(frontmatter).not.toBeNull();
        expect(frontmatter.lang).toBe('yaml');

        const shaMatch = frontmatter.content.match(/sourceSha256:\s*([0-9a-f]{64})/);
        expect(shaMatch).not.toBeNull();
        expect(shaMatch[1]).toBe(await sha256Hex(bytes));

        // The untagged pdf path correctly infers zero headings (F5) — the
        // anchor-count half of the invariant, kept isolated here.
        expect(result.anchors).toEqual([]);
    });
});

describe('fidelity — reproducibility', () => {
    test('fixed convertedAt -> byte-identical markdown across two conversions', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/docx/docx-smoke.docx');
        const first = await oconv.toMd({
            name: 'docx-smoke.docx', bytes, convertedAt: FIXED_AT
        });
        const second = await oconv.toMd({
            name: 'docx-smoke.docx', bytes, convertedAt: FIXED_AT
        });
        expect(second.markdown).toBe(first.markdown);
    });

    test('changing only convertedAt changes exactly that one front-matter line', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/docx/docx-smoke.docx');
        const a = await oconv.toMd({
            name: 'docx-smoke.docx', bytes, convertedAt: FIXED_AT
        });
        const b = await oconv.toMd({
            name: 'docx-smoke.docx', bytes, convertedAt: '2026-07-21T00:00:00Z'
        });

        const linesA = a.markdown.split('\n');
        const linesB = b.markdown.split('\n');
        expect(linesB.length).toBe(linesA.length);

        const diffIndexes = [];
        for (let i = 0; i < linesA.length; i++) {
            if (linesA[i] !== linesB[i]) diffIndexes.push(i);
        }
        expect(diffIndexes).toEqual([linesA.findIndex(l => l.startsWith('convertedAt:'))]);
        expect(linesA[diffIndexes[0]]).toBe(`convertedAt: ${FIXED_AT}`);
        expect(linesB[diffIndexes[0]]).toBe('convertedAt: 2026-07-21T00:00:00Z');
    });
});

describe('fidelity — profile shape (whole corpus)', () => {
    // `facturx-minimum-sample.pdf` was EXCLUDED here until office/BATCH_49/02
    // (2026-10-02): its extracted body starts 5 lines with a literal `#`
    // (order-line labels like "# Ligne FACT" — a genuine `#` character, not
    // a heading marker) that the Markdown writer emitted unescaped, so the
    // body counted 5 `#`-lines against 0 headings (the untagged pdf path
    // never infers headings, F5). `@awacloud/md`'s renderer now escapes a
    // line-leading block marker in a paragraph (`\# Ligne FACT`, BL-1598) —
    // re-measured: 0 `#`-lines, 0 anchors — so the whole corpus is in.
    const ALL = [
        ...DOCX_SPIKE, ...ODT_FIXTURES, ...REAL_DOCX,
        ...XLSX_FIXTURES, ...ODS_FIXTURES, ...PPTX_FIXTURES, ...ODP_FIXTURES,
        ...PDF_FIXTURES
    ];

    for (const { name, path } of ALL) {
        test(`${name} — front matter parses, anchors count matches headings, sourceSha256 matches bytes`, async () => {
            const bytes = fixtureBytes(path);
            const result = await oconv.toMd({ name, bytes, convertedAt: FIXED_AT });

            const { rest, frontmatter } = frontmatterApi.stripFrontmatter(result.markdown);
            expect(frontmatter).not.toBeNull();
            expect(frontmatter.lang).toBe('yaml');

            const shaMatch = frontmatter.content.match(/sourceSha256:\s*([0-9a-f]{64})/);
            expect(shaMatch).not.toBeNull();
            expect(shaMatch[1]).toBe(await sha256Hex(bytes));

            expect(countHeadingLines(rest)).toBe(result.anchors.length);
        });
    }
});

describe('fidelity — real-world corpus (owner-authorized vendoring, Apache POI test-data)', () => {
    test('poi-numbering.docx — converts; real-world list nesting is flattened (documented, not new)', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/real/poi-numbering.docx');
        const result = await oconv.toMd({
            name: 'poi-numbering.docx', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([
            { code: 'list/nesting-flattened', detail: 'numId 1 ilvl 1' }
        ]);
    });

    test('poi-table-alignment.docx — converts with zero loss', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/real/poi-table-alignment.docx');
        const result = await oconv.toMd({
            name: 'poi-table-alignment.docx', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
    });

    test('poi-with-gif.docx — converts with zero loss, embedded image kept as an asset reference', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/real/poi-with-gif.docx');
        const result = await oconv.toMd({
            name: 'poi-with-gif.docx', bytes, convertedAt: FIXED_AT
        });
        expect(result.lossy).toBe(false);
        expect(result.assets.length).toBe(1);
        expect(result.assets[0].kind).toBe('image');
        // The reader's own `escapes.docx.bytes` reaches the manifest by reference.
        expect(result.assets[0].bytes).toBeInstanceOf(Uint8Array);
        expect(result.assets[0].bytes.length).toBe(6554);
        expect(result.assets[0].name).toBe('Grafik 1');
    });
});

// ---------------------------------------------------------------------------
// md -> pdf (F9 bounded typesetter, office/BATCH_33 task 11)
// ---------------------------------------------------------------------------

/**
 * PostScript name -> style class, for the four Latin faces the vendored
 * `facturx-minimum-sample.pdf` corpus carries — the SAME mining recipe
 * `src/write/ir-to-pdf.test.js` uses, copied here rather than imported
 * (test-only fixture recipe; `src/` never reaches into a PDF for a font,
 * see that file's own header comment).
 */
const PDF_STYLE_BY_PSNAME = {
    'Calibri':            'regular',
    'Calibri-Bold':       'bold',
    'Calibri-Italic':     'italic',
    'Calibri-BoldItalic': 'boldItalic'
};

/** Mine the four embedded Latin FontFile2 programs out of a PDF's own /Font resources. */
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
            let descriptor = fontDict.entries.FontDescriptor ? deref(fontDict.entries.FontDescriptor) : null;
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

const MD_PDF_FIXTURES = [
    './_fixtures/corpus/md/md-structural.md',
    './_fixtures/corpus/md/md-nested.md',
    './_fixtures/corpus/md/md-degrade.md'
];

describe('fidelity — md -> pdf (F9 bounded typesetter, office/BATCH_33)', () => {
    // Prerequisite re-check (plan-prescribed): tasks 08/09/10 delivered, so
    // none of the four task-07 stub codes can fire from `src/` any more.
    const RETIRED_STUB_CODES = [
        'layout/list-unrendered', 'layout/code-unrendered',
        'layout/table-unrendered', 'layout/image-unrendered'
    ];

    // MEASURED: the fixture's one struck run (`~~strikethrough text~~`) is
    // drawn plain — the bounded typesetter draws no strikethrough rule — and
    // that drop is on the ledger as one `inline/strike-dropped` record
    // carrying the block's `{index, kind}`.
    test('md-structural.md — fromMd(pdf): 1 page, one recorded inline drop (MEASURED)', async () => {
        const src = fixtureText('./_fixtures/corpus/md/md-structural.md');
        const written = await oconv.fromMd({ markdown: src, target: 'pdf' });
        expect(written.lossy).toBe(true);
        expect(written.losses).toEqual([
            {
                index: '4', kind: 'paragraph', code: 'inline/strike-dropped',
                detail: { runs: 1, text: 'strikethrough text' }
            }
        ]);
        expect(pdfApi.read(written.bytes).pages.length).toBe(1);
    });

    test('md-nested.md — fromMd(pdf): 1 page, zero write-side loss (MEASURED)', async () => {
        const src = fixtureText('./_fixtures/corpus/md/md-nested.md');
        const written = await oconv.fromMd({ markdown: src, target: 'pdf' });
        expect(written.lossy).toBe(false);
        expect(written.losses).toEqual([]);
        expect(pdfApi.read(written.bytes).pages.length).toBe(1);
    });

    // RE-MEASURED at BL-980 (office/BATCH_35 task 02). Before it, this
    // fixture's image (`![Diagram](diagram.png)`) was CommonMark-INLINE
    // inside its own paragraph, and `oconvPdfLinebreak.tokenize` silently
    // skipped every non-`run` inline — so NO code fired for it at all and
    // this ledger asserted that absence. `oconvPdfStack` now partitions a
    // text block's inlines and DELEGATES each image, so the drop is on the
    // ledger with its reason. Before / after, exactly:
    //
    //   before: no image entry; `some(code === 'layout/image-dropped')` false
    //   after : one entry at index `5.i0`, `reason: 'no-bytes'`, `bytes: 0`
    //
    // The other structural loss (`layout/line-overflow` on the 3-column
    // table's "Center" header cell) is unchanged and real: with a 481.89 pt
    // column split three ways minus cell padding, the unbreakable "Center"
    // token's measured width lands (by floating-point epsilon) just over
    // the cell's column width.
    test('md-degrade.md — fromMd(pdf): 1 page, EXACT measured loss ledger (the inline image is now RECORDED, reason no-bytes)', async () => {
        const src = fixtureText('./_fixtures/corpus/md/md-degrade.md');
        const written = await oconv.fromMd({ markdown: src, target: 'pdf' });
        expect(written.lossy).toBe(true);
        expect(written.losses).toEqual([
            { code: 'frontmatter/stripped', detail: 'yaml' },
            { code: 'inline/linebreak-degraded', detail: 'hard break' },
            { code: 'list/task-marker-dropped', detail: '[x]' },
            { code: 'list/task-marker-dropped', detail: '[ ]' },
            { code: 'table/align-dropped', detail: 'left,center,right' },
            {
                index: '5.i0', kind: 'image', code: 'layout/image-dropped',
                detail: {
                    index: '5.i0', name: 'diagram.png', alt: 'Diagram',
                    reason: 'no-bytes', bytes: 0
                }
            },
            {
                index: '7.0', kind: 'paragraph', code: 'layout/line-overflow',
                detail: { tokens: 1, width: 34.837, column: 34.83699999999999, text: 'Center' }
            }
        ]);
        expect(pdfApi.read(written.bytes).pages.length).toBe(1);
    });

    // The other half of the same flip: supply the bytes and the loss goes
    // away for a placeable encoding, or changes reason for one this wave
    // refuses. Both legs measured, neither inherited.
    test('md-degrade.md + assets — fromMd(pdf): a JPEG PLACES (no image loss); the PNG refuses with format named', async () => {
        const src = fixtureText('./_fixtures/corpus/md/md-degrade.md');

        const placed = await oconv.fromMd({
            markdown: src, target: 'pdf', assets: { 'diagram.png': ASSET_JPEG }
        });
        expect(placed.losses.some((l) => l.code === 'layout/image-dropped')).toBe(false);
        let latin1 = '';
        for (const b of placed.bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toContain('/Im0 Do Q');

        const refused = await oconv.fromMd({
            markdown: src, target: 'pdf', assets: { 'diagram.png': ASSET_PNG }
        });
        expect(refused.losses.find((l) => l.code === 'layout/image-dropped').detail).toEqual({
            index: '5.i0', name: 'diagram.png', alt: 'Diagram',
            reason: 'unsupported-encoding', bytes: ASSET_PNG.length, format: 'png'
        });
    });

    test('md-degrade.md + assets — fromMd(docx): the image is PLACED, image/size-defaulted replaces image/dropped', async () => {
        const src = fixtureText('./_fixtures/corpus/md/md-degrade.md');

        const bare = await oconv.fromMd({ markdown: src, target: 'docx' });
        expect(bare.losses.map((l) => l.code)).toContain('image/dropped');
        expect(Object.keys(docxApi.read(bare.bytes).images)).toHaveLength(0);

        const withAssets = await oconv.fromMd({
            markdown: src, target: 'docx', assets: { 'diagram.png': ASSET_PNG }
        });
        expect(withAssets.losses.map((l) => l.code)).toContain('image/size-defaulted');
        expect(withAssets.losses.map((l) => l.code)).not.toContain('image/dropped');
        const read = docxApi.read(withAssets.bytes);
        expect(Object.keys(read.images)).toHaveLength(1);
        expect([...read.images[Object.keys(read.images)[0]].data]).toEqual([...ASSET_PNG]);
    });

    test('the four retired *-unrendered stub codes are absent from every md -> pdf ledger measured above', async () => {
        const seen = [];
        for (const path of MD_PDF_FIXTURES) {
            const src = fixtureText(path);
            const written = await oconv.fromMd({ markdown: src, target: 'pdf' });
            for (const l of written.losses) seen.push(l.code);
        }
        expect(seen.length).toBeGreaterThan(0);
        for (const code of RETIRED_STUB_CODES) expect(seen).not.toContain(code);
    });

    describe('embedded font route (D-A, corpus Calibri faces, test-only mining)', () => {
        test('md-structural.md — embedded route: same page count as Standard 14, one font-fallback loss for the unsupplied `mono` class, the struck run\'s inline drop, plus one text/unencodable record for the corpus faces\' missing glyphs', async () => {
            const corpusFonts = embeddedFontBytesFromPdf(
                fixtureBytes('./_fixtures/corpus/pdf/facturx-minimum-sample.pdf')
            );
            expect(Object.keys(corpusFonts).sort())
                .toEqual(['bold', 'boldItalic', 'italic', 'regular']);

            const src = fixtureText('./_fixtures/corpus/md/md-structural.md');
            const std = await oconv.fromMd({ markdown: src, target: 'pdf' });
            const embedded = await oconv.fromMd({
                markdown: src, target: 'pdf', opts: { pdf: { fonts: corpusFonts } }
            });

            expect(pdfApi.read(embedded.bytes).pages.length)
                .toBe(pdfApi.read(std.bytes).pages.length);
            // RE-PINNED by office/BATCH_38 task 04 (BL-1257 re-measurement,
            // not a weakening): the corpus-mined Calibri faces are SUBSETS
            // lacking glyphs for several characters of this fixture; those
            // occurrences used to draw `.notdef` silently and are now ONE
            // `text/unencodable` record. The struck run is recorded on this
            // route exactly as on the Standard 14 one (the record comes from
            // the linebreaker, which is route-agnostic).
            expect(embedded.losses).toEqual([
                { code: 'layout/font-fallback', detail: { style: 'code', baseFont: 'Courier' } },
                {
                    index: '4', kind: 'paragraph', code: 'inline/strike-dropped',
                    detail: { runs: 1, text: 'strikethrough text' }
                },
                { code: 'text/unencodable', detail: { count: 23, sample: 'bhHkx•' } }
            ]);
        });
    });
});

describe('fidelity — references/ is never read', () => {
    test('no fixture-path construct in this file resolves under references/', () => {
        // Real guard on this file's own source (same pattern as
        // `src/ir/ir.test.js`'s F2 self-check), not on the constant arrays
        // a few lines up: every fixture path this file builds is a
        // quoted/template literal starting with `./` — the `path:` fields
        // of DOCX_SPIKE / ODT_FIXTURES / REAL_DOCX and the literal
        // `fixtureBytes('./...')` call sites. Collecting every such literal
        // straight from disk and asserting none resolves under
        // `references/` fails the moment a future edit routes a fixture
        // read there, unlike the previous version of this test, which only
        // re-inspected values already visible in this same file.
        const src = readFileSync(
            fileURLToPath(new URL('./fidelity.integration.test.js', import.meta.url)),
            'utf8'
        );
        const pathLiterals = [...src.matchAll(/(['"`])(\.\/[^'"`]*)\1/g)].map((m) => m[2]);
        expect(pathLiterals.length).toBeGreaterThan(0);
        for (const p of pathLiterals) expect(p).not.toContain('references/');
    });
});
