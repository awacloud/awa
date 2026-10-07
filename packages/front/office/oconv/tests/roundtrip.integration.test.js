// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Round-trip stability harness — office/BATCH_26 task 05
 * (`ai/batches/types/office/BATCH_26/05-roundtrip-harness.md`), legs 2-odt
 * and 4 re-derived by office/BATCH_27 task 08
 * (`ai/batches/types/office/BATCH_27/08-roundtrip-repin-tier-docs.md`).
 * Drives the PUBLIC facade (`oconv.fromMd` + `oconv.toMd`, via
 * `src/main.js`) end to end over a first-party markdown corpus
 * (`_fixtures/corpus/md/`) and measures exactly what the loss matrix
 * publishes per cell.
 *
 * **Promise derivation** (recorded per the plan's own instruction): the
 * BATCH_26 plan Design body promises "round-trip tests where round-trip is
 * promised (e.g. docx→md→docx tier-1 stability)"; W0 FINDINGS Axis 3 sets
 * md→docx at tier 2. md→odt was capped at tier 1 + degraded lists by the
 * BATCH_26 measurement of `@awacloud/odf`'s typed write surface
 * (GAP-ODF-3..6); **office/BATCH_27 (BL-722) removed that cap** — the odf
 * typed model now expresses run emphasis, `text:a` links, ordered lists and
 * text-body tables, so `md→odt` is **tier 2** here, exactly like `md→docx`.
 * Hence the seven legs below: (1) md→docx→md tier-2 construct survival,
 * (2) normal-form idempotence (docx ×3 fixtures, odt ×1 fixture),
 * (3) docx→md→docx tier-1/2 stability on two zero-loss read fixtures,
 * (4) md→odt→md **tier-2** stability with an exact (now empty) loss-code
 * ledger, (5) the profile-v1 input leg (front matter never leaks into the
 * target container), (6) the nested-list leg (write preserves depth, the
 * return leg's flatten is the documented, asserted degrade), (7) a
 * reproducibility guard.
 *
 * The `docx` target is byte-reproducible: `@awacloud/ooxml` stamps every zip
 * entry with a fixed 1980-01-01 00:00 timestamp. The `odt` target is not: the
 * ODF package writer stamps the current time, so two identical calls give
 * equal document models but may give different bytes. The `pdf` target is
 * byte-reproducible. Except for the byte-identity tests of the `docx` and
 * `pdf` targets (leg 7 and the pdf leg's reproducibility describe), every
 * comparison below is MODEL-level (markdown body text recovered by
 * re-reading the produced container).
 *
 * **`bodyOf(markdown)`** strips the leading `---`/…/`---` front-matter
 * fence and returns the body only — front matter legitimately differs
 * per leg (name/sha/format/convertedAt), so every comparison below
 * compares BODIES.
 *
 * **The BL-739 flip, re-measured on this tree** (leg 2's odt sub-case).
 * BATCH_26 pinned a falsification here: `md-structural.md`'s bullet list
 * immediately followed by its ordered list was NOT idempotent at N1
 * through the odt target, because GAP-ODF-6 made an odt-written list carry
 * no ordered/bulleted distinction — both lists degraded to
 * indistinguishable generic odt lists, N1 showed two adjacent BULLET
 * lists, and CommonMark's same-marker list-continuation rule merged them
 * into one 4-item list on the second parse (N1 !== N2, stabilising only at
 * N2 === N3). **office/BATCH_27 (BL-739 ruling) FLIPS that pin**:
 * `../src/write/ir-to-odt.js` now writes a real `ordered` flag (+
 * `numFormat:'1'`) and `../src/read/odt-to-ir.js` reads it back, so the two
 * lists stay DISTINCT markers at N1 (`- Bullet item one` vs `1. Ordered
 * item one`), CommonMark has no same-marker pair to merge, and **N1 === N2
 * holds** — full N1 idempotence, asserted below with an odt falsification
 * twin so the equality cannot be vacuous. The N2/N3 scaffolding that pinned
 * the old second-order stability is deleted with this comment as its
 * record.
 *
 * Scope: N1 idempotence through odt is pinned on ALL THREE golden fixtures
 * (`md-structural.md`, `md-nested.md`, `md-degrade.md`). `md-degrade.md`
 * used to be the exception: the odt writer emitted empty paragraphs (a
 * code block's trailing newline became a trailing empty line, and an
 * image-only paragraph became a paragraph with no runs) which collapse on
 * the next CommonMark parse. The writer now emits neither — a code block
 * drops exactly one trailing newline, and a paragraph whose runs are all
 * dropped emits no node — so the equality holds without narrowing the
 * fixture.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';

const FIXED_AT = '2026-07-20T00:00:00Z';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');
const docxApi = runtime.resolve('docx');
const odtApi = runtime.resolve('odt');

/** @param {string} relPath relative to this file */
function fixtureText(relPath) {
    return readFileSync(new URL(relPath, import.meta.url), 'utf8');
}

/** @param {string} relPath relative to this file */
function fixtureBytes(relPath) {
    return new Uint8Array(readFileSync(new URL(relPath, import.meta.url)));
}

/**
 * Strip a leading `---`/…/`---` front-matter fence (this package's own
 * profile-v1 shape, or any other YAML-fenced front matter) and return the
 * body. Test-local helper (plan's prescriptive API) — every comparison in
 * this suite is a BODY comparison, since front matter legitimately
 * differs per leg (name/sha/format/convertedAt).
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

/**
 * Collect the DOS time/date words of every zip entry of `bytes`: the central
 * directory header (`0x02014b50`, time at +12, date at +14) and the local file
 * header it points to (`0x04034b50`, time at +10, date at +12), all
 * little-endian. The walk goes through the central directory (located by the
 * end-of-central-directory record `0x06054b50`) so a signature-shaped byte run
 * inside compressed data can never be mistaken for a header.
 *
 * @param {Uint8Array} bytes
 * @returns {{kind: 'local'|'central', time: number, date: number}[]}
 */
function zipEntryStamps(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) throw new Error('zipEntryStamps: no end-of-central-directory record');
    const count = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    const stamps = [];
    for (let e = 0; e < count; e++) {
        if (view.getUint32(cursor, true) !== 0x02014b50) {
            throw new Error('zipEntryStamps: bad central directory header at ' + cursor);
        }
        stamps.push({
            kind: 'central',
            time: view.getUint16(cursor + 12, true),
            date: view.getUint16(cursor + 14, true)
        });
        const local = view.getUint32(cursor + 42, true);
        if (view.getUint32(local, true) !== 0x04034b50) {
            throw new Error('zipEntryStamps: bad local file header at ' + local);
        }
        stamps.push({
            kind: 'local',
            time: view.getUint16(local + 10, true),
            date: view.getUint16(local + 12, true)
        });
        cursor += 46 + view.getUint16(cursor + 28, true)
            + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    }
    return stamps;
}

const MD_STRUCTURAL = './_fixtures/corpus/md/md-structural.md';
const MD_NESTED = './_fixtures/corpus/md/md-nested.md';
const MD_DEGRADE = './_fixtures/corpus/md/md-degrade.md';

// The committed first-party image assets (BL-980). Provenance:
// `tests/_fixtures/corpus/assets/PROVENANCE.md`.
const ASSET_JPEG = fixtureBytes('./_fixtures/corpus/assets/px.jpg');

describe('roundtrip — leg 1: md->docx->md tier-2 construct survival (md-structural.md)', () => {
    test('ordered marker, link URL, emphasis markers, all 6 table cells, heading lines and inline code survive symmetrically', async () => {
        const src = fixtureText(MD_STRUCTURAL);
        const B = await oconv.fromMd({ markdown: src, target: 'docx' });
        const T = await oconv.toMd({ name: 'structural.docx', bytes: B.bytes, convertedAt: FIXED_AT });
        const C1 = bodyOf(T.markdown);

        // Headings (# / ## / ###).
        expect(C1).toContain('# Title One');
        expect(C1).toContain('## Section Two');
        expect(C1).toContain('### Subsection Three');

        // Ordered-list marker.
        expect(C1).toMatch(/(^|\n)1\.\s+Ordered item one/);

        // Link target URL.
        expect(C1).toContain('https://example.com/awa');

        // Emphasis markers.
        expect(C1).toContain('**bold text**');
        expect(C1).toContain('*italic text*');
        expect(C1).toContain('~~strikethrough text~~');

        // All 6 table cell texts.
        for (const cell of ['Col A', 'Col B', 'Col C', 'a1', 'b1', 'c1']) {
            expect(C1).toContain(cell);
        }

        // Inline code now survives symmetrically (office/BATCH_35): the
        // writer marks the run `font: 'Courier New'`, and the docx→IR
        // reader recognises it on its frozen monospace allowlist — an
        // EMPTY loss ledger, backticks preserved on the return leg.
        expect(B.losses).toEqual([]);
        expect(C1).toContain('`inline code`');
    });
});

describe('roundtrip — leg 2: normal-form idempotence', () => {
    /**
     * @param {string} src markdown source
     * @param {string} target 'docx' | 'odt'
     * @returns {Promise<string>} bodyOf(toMd(fromMd(src, target)))
     */
    async function normalize(src, target) {
        const written = await oconv.fromMd({ markdown: src, target });
        const read = await oconv.toMd({
            name: 'x.' + target, bytes: written.bytes, convertedAt: FIXED_AT
        });
        return bodyOf(read.markdown);
    }

    for (const path of [MD_STRUCTURAL, MD_NESTED, MD_DEGRADE]) {
        test(`${path} x docx — N1 === N2 (stable normal form)`, async () => {
            const src = fixtureText(path);
            const N1 = await normalize(src, 'docx');
            const N2 = await normalize(N1, 'docx');
            expect(N2).toBe(N1);
        });
    }

    // x odt — all three golden fixtures are N1-idempotent. The
    // md-structural.md case is the BL-739 ruling (office/BATCH_27, see the
    // file-header comment): with a real `ordered` flag written
    // (`../src/write/ir-to-odt.js`) and read back
    // (`../src/read/odt-to-ir.js`), the two adjacent lists keep DISTINCT
    // markers at N1 and CommonMark has no same-marker pair to merge.
    // md-nested.md and md-degrade.md hold because the writer emits no
    // empty paragraph (code-block tail, image-only paragraph) — measured,
    // not assumed.
    for (const path of [MD_STRUCTURAL, MD_NESTED, MD_DEGRADE]) {
        test(`${path} x odt — N1 === N2 (stable normal form)`, async () => {
            const src = fixtureText(path);
            const N1 = await normalize(src, 'odt');
            const N2 = await normalize(N1, 'odt');

            if (path === MD_STRUCTURAL) {
                // The root cause of the old falsification is gone at N1:
                // the two adjacent lists carry DIFFERENT markers, so
                // CommonMark's same-marker list-continuation rule has
                // nothing to merge.
                expect(N1).toContain('- Bullet item one');
                expect(N1).toMatch(/(^|\n)1\.\s+Ordered item one/);
                expect(N1).not.toContain('- Ordered item one');
            }

            expect(N2).toBe(N1);
        });
    }

    // Falsification (non-vacuity): mutating the fixture changes N1, so the
    // equality checks above are alive comparisons, not tautologies. The odt
    // twin (BL-739) exists so the freshly-pinned odt equality above cannot
    // be vacuous either.
    test('falsification — mutating one table cell changes N1 (md-structural.md x docx)', async () => {
        const src = fixtureText(MD_STRUCTURAL);
        const mutated = src.replace('| a1 | b1 | c1 |', '| a1-mutated | b1 | c1 |');
        expect(mutated).not.toBe(src);

        const baselineN1 = await normalize(src, 'docx');
        const mutatedN1 = await normalize(mutated, 'docx');
        expect(mutatedN1).not.toBe(baselineN1);
    });

    test('falsification — mutating one table cell changes N1 (md-structural.md x odt)', async () => {
        const src = fixtureText(MD_STRUCTURAL);
        const mutated = src.replace('| a1 | b1 | c1 |', '| a1-mutated | b1 | c1 |');
        expect(mutated).not.toBe(src);

        const baselineN1 = await normalize(src, 'odt');
        const mutatedN1 = await normalize(mutated, 'odt');
        expect(mutatedN1).not.toBe(baselineN1);
    });
});

describe('roundtrip — leg 3: docx->md->docx tier-1/2 stability (zero-loss read fixtures)', () => {
    for (const { name, path } of [
        { name: 'docx-smoke.docx', path: './_fixtures/corpus/docx/docx-smoke.docx' },
        { name: 'poi-table-alignment.docx', path: './_fixtures/corpus/real/poi-table-alignment.docx' }
    ]) {
        test(`${name} — bodyOf(M1) === bodyOf(M2)`, async () => {
            const bytes = fixtureBytes(path);
            const M1 = await oconv.toMd({ name, bytes, convertedAt: FIXED_AT });
            // Both fixtures are the fidelity harness's own documented
            // zero-loss read cases (tests/fidelity.integration.test.js) —
            // re-asserted here as this leg's own precondition, not assumed.
            expect(M1.lossy).toBe(false);

            const B = await oconv.fromMd({ markdown: bodyOf(M1.markdown), target: 'docx' });
            const M2 = await oconv.toMd({ name: 'x.docx', bytes: B.bytes, convertedAt: FIXED_AT });

            expect(bodyOf(M2.markdown)).toBe(bodyOf(M1.markdown));
        });
    }
});

describe('roundtrip — leg 4: md->odt->md tier-2 stability, exact loss ledger (md-structural.md)', () => {
    // Re-derived by office/BATCH_27 task 08 (BL-722). The four odt-target
    // loss codes this leg used to pin (`run/format-unwritable`,
    // `link/target-unwritable`, `list/ordered-unwritable`,
    // `block/table-degraded`) are RETIRED — the odf typed write model now
    // expresses every construct `md-structural.md` contains, so the exact
    // ledger is EMPTY and the return-body assertions flip from absence to
    // presence.
    test('every md-structural.md construct survives md->odt->md with an EMPTY loss ledger (tier 2)', async () => {
        const src = fixtureText(MD_STRUCTURAL);
        const B = await oconv.fromMd({ markdown: src, target: 'odt' });

        // Exhaustive, count-exact ledger — `toEqual`, never relaxed: every
        // construct in this fixture is now writable through the typed odf
        // surface, so NOTHING is lost on the write leg.
        expect(B.losses).toEqual([]);

        const T = await oconv.toMd({ name: 'structural.odt', bytes: B.bytes, convertedAt: FIXED_AT });
        const body = bodyOf(T.markdown);

        // Headings survive.
        expect(body).toContain('# Title One');
        expect(body).toContain('## Section Two');
        expect(body).toContain('### Subsection Three');

        // Emphasis MARKERS survive (tier 2) — not just the text.
        expect(body).toContain('**bold text**');
        expect(body).toContain('*italic text*');
        expect(body).toContain('~~strikethrough text~~');
        expect(body).toContain('`inline code`');

        // Link target survives, as a real markdown link.
        expect(body).toContain('[external link](https://example.com/awa)');

        // Both list kinds survive with their OWN markers.
        expect(body).toContain('- Bullet item one');
        expect(body).toMatch(/(^|\n)1\.\s+Ordered item one/);

        // The table survives as a real GFM table — header row, delimiter
        // row and data row, all 6 cells (the tab-joined tier-1 degrade is
        // gone).
        expect(body).toContain('| Col A | Col B | Col C |');
        expect(body).toContain('| --- | --- | --- |');
        expect(body).toContain('| a1 | b1 | c1 |');
    });
});

describe('roundtrip — leg 5: profile-v1 input leg (front matter never leaks into the target)', () => {
    test('md-degrade.md — frontmatter/stripped is recorded, the front-matter text is nowhere in the produced docx', async () => {
        const src = fixtureText(MD_DEGRADE);
        const B = await oconv.fromMd({ markdown: src, target: 'docx' });

        expect(B.losses.some(l => l.code === 'frontmatter/stripped')).toBe(true);

        const read = docxApi.read(B.bytes);
        const text = docxApi.toText(read.document);
        expect(text).not.toContain('Degrade Fixture');
        expect(text).not.toContain('demonstration');
        expect(text).not.toContain('title:');
        expect(text).not.toContain('kind:');
    });

    test('a live toMd output (real profile-v1 front matter) fed back into fromMd — frontmatter/stripped recorded, provenance text absent from the container', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/docx/docx-smoke.docx');
        const produced = await oconv.toMd({ name: 'docx-smoke.docx', bytes, convertedAt: FIXED_AT });
        // Sanity: this really is profile-v1 front matter, not plain CommonMark.
        expect(produced.markdown.startsWith('---\nprofile: v1\n')).toBe(true);

        const B = await oconv.fromMd({ markdown: produced.markdown, target: 'docx' });
        expect(B.losses.some(l => l.code === 'frontmatter/stripped')).toBe(true);

        const read = docxApi.read(B.bytes);
        const text = docxApi.toText(read.document);
        expect(text).not.toContain('sourceSha256');
        expect(text).not.toContain('converterVersion');
        expect(text).not.toContain('profile: v1');
    });
});

describe('roundtrip — leg 6: nested-list leg (md-nested.md, docx)', () => {
    test('write leg preserves depth (pPr.numPr.ilvl === 1); the return leg flattens with the documented degrade', async () => {
        const src = fixtureText(MD_NESTED);
        const B = await oconv.fromMd({ markdown: src, target: 'docx' });

        const read = docxApi.read(B.bytes);
        const nestedParagraphs = read.document.body.filter(
            p => p.pPr && p.pPr.numPr && p.pPr.numPr.ilvl === 1
        );
        expect(nestedParagraphs.length).toBeGreaterThan(0);

        const T = await oconv.toMd({ name: 'nested.docx', bytes: B.bytes, convertedAt: FIXED_AT });
        expect(T.losses.some(l => l.code === 'list/nesting-flattened')).toBe(true);

        // The read-side degrade is documented, not silent: item text still
        // survives, just flattened to a single level.
        const body = bodyOf(T.markdown);
        expect(body).toContain('Item A');
        expect(body).toContain('Item A.1');
        expect(body).toContain('Item A.2');
        expect(body).toContain('Item B');
    });
});

describe('roundtrip — leg 7: reproducibility guard', () => {
    // The `docx` target is byte-reproducible: `@awacloud/ooxml` stamps every
    // zip entry with a fixed 1980-01-01 00:00 timestamp. The `odt` target is
    // not: the ODF package writer stamps the current time, so two identical
    // calls give equal document models but may give different bytes. The
    // `pdf` target is byte-reproducible. The model-equality tests below stay;
    // the docx byte pin lives in the `md -> docx` reproducibility describe.
    test('two fromMd calls on the same markdown produce model-equal output (bodyOf(toMd(...)) is equal)', async () => {
        const src = fixtureText(MD_STRUCTURAL);
        const B1 = await oconv.fromMd({ markdown: src, target: 'docx' });
        const B2 = await oconv.fromMd({ markdown: src, target: 'docx' });

        const T1 = await oconv.toMd({ name: 'x1.docx', bytes: B1.bytes, convertedAt: FIXED_AT });
        const T2 = await oconv.toMd({ name: 'x2.docx', bytes: B2.bytes, convertedAt: FIXED_AT });

        expect(bodyOf(T2.markdown)).toBe(bodyOf(T1.markdown));
    });

    // BATCH_39 task 04 (claim pinning, FINDINGS § 5.4 C36) — README.md:171-172
    // claims "two identical fromMd calls produce equal document MODELS" with
    // no target restriction; the docx leg above was the only producing test.
    // The odt twin, same recipe.
    test('the odt twin: two fromMd(odt) calls on the same markdown produce model-equal output', async () => {
        const src = fixtureText(MD_STRUCTURAL);
        const B1 = await oconv.fromMd({ markdown: src, target: 'odt' });
        const B2 = await oconv.fromMd({ markdown: src, target: 'odt' });

        const T1 = await oconv.toMd({ name: 'x1.odt', bytes: B1.bytes, convertedAt: FIXED_AT });
        const T2 = await oconv.toMd({ name: 'x2.odt', bytes: B2.bytes, convertedAt: FIXED_AT });

        expect(bodyOf(T2.markdown)).toBe(bodyOf(T1.markdown));
    });
});

// BATCH_39 task 04 (claim pinning, FINDINGS § 5.4 C34/C35) — docs/convert.md
// :160-161 (C34) and README.md:166-167 (C35) both claim "no provenance is
// written into the target container" for every fromMd/convert target.
// MEASURED: the claim HOLDS for docx (no `docProps/core.xml` part exists at
// all — `read().package.parts` is exactly `['/word/document.xml']`), but is
// CONTRADICTED for odt (`meta.xml` carries `meta:generator:
// '@awacloud/odf'` — `_shared/index.js`'s `writeSidecars` falls back to
// `metaMod.empty()`, which is `{ generator: '@awacloud/odf' }`, never
// nothing) and for pdf (`/Producer` and `/Creator` both literally
// `'@awacloud/oconv'` — `ir-to-pdf.js`'s `addMetadata` call). Per this
// task's Out-of-scope rule (D6), a FALSE claim is corrected by a later task
// and is never pinned here — only the TRUE (docx) half is a producing test;
// the odt/pdf measurements above are the evidence backing this row's
// `contradicted` status in the report.
describe('roundtrip — provenance in target containers (C34/C35, docx half only — TRUE)', () => {
    test('fromMd docx: no docProps/core.xml part — no core-properties/generator field at all', async () => {
        const written = await oconv.fromMd({ markdown: fixtureText(MD_STRUCTURAL), target: 'docx' });
        const read = docxApi.read(written.bytes);
        const partNames = Object.keys(read.package.parts || {});
        expect(partNames.length).toBeGreaterThan(0);          // non-vacuity
        expect(partNames.some((p) => p.toLowerCase().includes('docprops'))).toBe(false);
        expect(partNames.some((p) => p.toLowerCase().includes('core'))).toBe(false);
    });

    test('convert odt->docx: the SAME writer, same absence of docProps/core.xml', async () => {
        const odtBytes = odtApi.write({ body: [odtApi.paragraph('Hello from odt.')] });
        const converted = await oconv.convert({ name: 'x.odt', bytes: odtBytes, target: 'docx' });
        const read = docxApi.read(converted.bytes);
        const partNames = Object.keys(read.package.parts || {});
        expect(partNames.length).toBeGreaterThan(0);
        expect(partNames.some((p) => p.toLowerCase().includes('docprops'))).toBe(false);
        expect(partNames.some((p) => p.toLowerCase().includes('core'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Leg 8 — md -> pdf -> md (F9 bounded typesetter, office/BATCH_33 task 11)
// ---------------------------------------------------------------------------

describe('roundtrip — leg 8: md->pdf->md (F9 bounded typesetter)', () => {
    /**
     * @param {string} src markdown source
     * @param {object} [pdfOpts] forwarded as `opts.pdf`
     * @returns {Promise<{body: string, writeLosses: object[], readLosses: object[]}>}
     */
    async function normalizePdf(src, pdfOpts) {
        const written = await oconv.fromMd({
            markdown: src, target: 'pdf', opts: pdfOpts ? { pdf: pdfOpts } : undefined
        });
        const read = await oconv.toMd({
            name: 'x.pdf', bytes: written.bytes, convertedAt: FIXED_AT
        });
        return { body: bodyOf(read.markdown), writeLosses: written.losses, readLosses: read.losses };
    }

    // MEASURED, not the plan's literal wording: `pdf -> md` (F5, frozen)
    // never recovers markdown SYNTAX (no heading marks, no `**`/`*`/`~~`/
    // backtick markers, no `-`/`1.` list markers, no `|` table pipes) — it
    // recovers PLAIN TEXT only. So "the word stream equals the source's" is
    // read here as "the source's PROSE WORDS survive, order preserved",
    // never as a literal byte/token comparison against the markdown SOURCE
    // (which still carries its own syntax characters as tokens). Two more
    // measured text-extraction facts are pinned below: (a) a list marker and
    // its item text decode separated by one space (`1. Ordered`) — the
    // renderer places the marker and the text as two separate positioned
    // runs with no space GLYPH between them, and the tier-1 reader inserts
    // one space because the horizontal gap between the marker's end and the
    // text's start exceeds its word-gap threshold; (b) adjacent table cells
    // on the same row decode the same way (`Col A Col B Col C`). Both read
    // glued (`1.Ordered`, `Col ACol BCol C`) before office/BATCH_43 task 03
    // gave the reader glyph-width end positions.
    // RE-MEASURED at BL-980 (office/BATCH_35 task 02): `md-degrade.md` now
    // draws an `[image: Diagram]` placeholder line that N1 carries as
    // ordinary prose, so this equality was re-derived rather than assumed
    // to survive. It DOES still hold for all three fixtures — the
    // placeholder is stable under a second pass because it re-parses as a
    // plain paragraph, not as an image. Measured, not forced.
    for (const path of [MD_STRUCTURAL, MD_NESTED, MD_DEGRADE]) {
        test(`${path} x pdf, pageNumbers:false — N1 === N2 (stable normal form, MEASURED)`, async () => {
            const src = fixtureText(path);
            const n1 = await normalizePdf(src, { pageNumbers: false });
            const n2 = await normalizePdf(n1.body, { pageNumbers: false });
            expect(n2.body).toBe(n1.body);
        });
    }

    test('md-structural.md x pdf, pageNumbers:false — EXACT decoded body (MEASURED, regression guard)', async () => {
        const src = fixtureText(MD_STRUCTURAL);
        const n1 = await normalizePdf(src, { pageNumbers: false });
        expect(n1.body).toBe(
            'Title One\n\nSection Two\n\nSubsection Three This is the first paragraph of '
            + 'prose introducing the document.\n\nHere is a paragraph with bold text, '
            + 'italic text, strikethrough text and inline code.\n\nA third paragraph '
            + 'closes out the prose section, with an external link included here.\n\n'
            // Re-measured 2026-10-02 (office/BATCH_49/02, BL-1598): the
            // line-leading `1.` is escaped by `@awacloud/md`'s renderer, so
            // this paragraph re-parses as a paragraph, not an ordered list.
            // Re-measured once the Standard 14 font dicts name
            // `/Encoding /WinAnsiEncoding`: the CP1252 bullet marker (0x95)
            // now decodes back to `•` in front of each bullet item.
            + '• Bullet item one • Bullet item two\n\n1\\. Ordered item one 2. Ordered item two'
            + '\n\nCol A Col B Col C\n\na1 b1 c1\n'
        );
    });

    // Falsification (non-vacuity): mutating the fixture changes N1, so the
    // equality checks above are alive comparisons, not tautologies —
    // mirroring leg 2's own falsification twin.
    test('falsification — mutating one table cell changes N1 (md-structural.md x pdf, pageNumbers:false)', async () => {
        const src = fixtureText(MD_STRUCTURAL);
        const mutated = src.replace('| a1 | b1 | c1 |', '| a1-mutated | b1 | c1 |');
        expect(mutated).not.toBe(src);

        const baselineN1 = await normalizePdf(src, { pageNumbers: false });
        const mutatedN1 = await normalizePdf(mutated, { pageNumbers: false });
        expect(mutatedN1.body).not.toBe(baselineN1.body);
    });

    // The documented EXCEPTION, not a relaxed assertion: with the DEFAULT
    // `pageNumbers: true`, the decoded page-number digit is literal body
    // text on read-back (`pdf -> md` has no way to tell a footer number from
    // prose), so feeding N1 back into `fromMd` treats it as one more real
    // paragraph — every round appends exactly one more trailing "1" line.
    // Pinned with the measured reason, per the plan's own instruction, not
    // silently avoided by defaulting every leg to `pageNumbers: false`.
    test('md-structural.md x pdf, DEFAULT pageNumbers — N1 !== N2 (measured non-idempotence: the page number pollutes the decoded body)', async () => {
        const src = fixtureText(MD_STRUCTURAL);
        const n1 = await normalizePdf(src);
        const n2 = await normalizePdf(n1.body);

        expect(n1.body.endsWith('\n\n1\n')).toBe(true);
        expect(n2.body).not.toBe(n1.body);
        expect(n2.body).toBe(`${n1.body}\n1\n`);
    });

    // RE-PINNED at BL-980 (office/BATCH_35 task 02). The relation this leg
    // asserts INVERTED, and the new one is measured, not assumed:
    //
    //   before: the inline image vanished — no loss of any code, and the
    //           decoded body contained neither "image" nor "Diagram".
    //   after : `oconvPdfStack` partitions a text block's inlines and
    //           delegates each image, so ONE `layout/image-dropped` is
    //           recorded (`reason: 'no-bytes'`, index `5.i0`) and the
    //           `[image: Diagram]` placeholder is really on the page —
    //           it decodes back as `\[image: Diagram\]`, the md writer's
    //           own escaping of the brackets.
    describe('image handling (BL-980) — measured, not assumed', () => {
        test('md-degrade.md x pdf — the inline image is RECORDED and its placeholder decodes back', async () => {
            const src = fixtureText(MD_DEGRADE);
            const written = await oconv.fromMd({ markdown: src, target: 'pdf' });

            const image = written.losses.filter((l) => l.code === 'layout/image-dropped');
            expect(image).toHaveLength(1);
            expect(image[0].detail).toEqual({
                index: '5.i0', name: 'diagram.png', alt: 'Diagram',
                reason: 'no-bytes', bytes: 0
            });
            // `image/dropped` is the READER-side code; the pdf write path
            // never emits it. Unchanged.
            expect(written.losses.some((l) => l.code === 'image/dropped')).toBe(false);

            const read = await oconv.toMd({
                name: 'degrade.pdf', bytes: written.bytes, convertedAt: FIXED_AT
            });
            expect(bodyOf(read.markdown)).toContain('image: Diagram');
            // The surrounding prose still survives.
            expect(bodyOf(read.markdown)).toContain('Degrade Constructs');
            expect(bodyOf(read.markdown)).toContain('Completed task');
        });

        test('md-degrade.md x pdf WITH a placeable asset — the image is drawn, no loss, no placeholder text', async () => {
            const src = fixtureText(MD_DEGRADE);
            const written = await oconv.fromMd({
                markdown: src, target: 'pdf', assets: { 'diagram.png': ASSET_JPEG }
            });
            expect(written.losses.some((l) => l.code === 'layout/image-dropped')).toBe(false);

            let latin1 = '';
            for (const b of written.bytes) latin1 += String.fromCharCode(b);
            expect(latin1).toContain('/Im0 Do Q');

            // The raster carries no text, so tier-1 pdf -> md decodes no
            // placeholder for it — the honest consequence of DRAWING the
            // image instead of naming it. Pinned, not smoothed over.
            const read = await oconv.toMd({
                name: 'degrade.pdf', bytes: written.bytes, convertedAt: FIXED_AT
            });
            expect(bodyOf(read.markdown)).not.toContain('image: Diagram');
            expect(bodyOf(read.markdown)).toContain('Degrade Constructs');
        });
    });

    describe('reproducibility — md -> docx is byte-reproducible', () => {
        // `@awacloud/ooxml` stamps every zip entry with the fixed DOS stamp
        // 1980-01-01 00:00 (time 0x0000, date 0x0021). The stamp scan is what
        // makes the byte equality non-vacuous: two calls inside the same
        // 2 s DOS-time granule would match even with a wall-clock stamp.
        test('two fromMd(docx) calls produce BYTE-IDENTICAL output and every zip entry carries the fixed 1980-01-01 00:00 stamp', async () => {
            const src = fixtureText(MD_STRUCTURAL);
            const B1 = await oconv.fromMd({ markdown: src, target: 'docx' });
            const B2 = await oconv.fromMd({ markdown: src, target: 'docx' });
            expect(B1.bytes.length).toBe(B2.bytes.length);
            expect(B1.bytes.every((v, i) => v === B2.bytes[i])).toBe(true);

            const stamps = zipEntryStamps(B1.bytes);
            expect(stamps.filter(s => s.kind === 'local').length).toBeGreaterThan(0);
            expect(stamps.filter(s => s.kind === 'central').length).toBeGreaterThan(0);
            for (const s of stamps) {
                expect(s.time).toBe(0x0000);
                expect(s.date).toBe(0x0021);
            }
        });
    });

    describe('reproducibility — md -> pdf is byte-reproducible', () => {
        // Like the docx target, `md -> pdf` never enters a
        // `Date.now()`/`Math.random()` path (`irToPdf` calls `addMetadata`
        // only, never `setId`) — so two `fromMd(..., 'pdf')` calls are
        // BYTE-identical, not merely model-equal
        // (`src/write/ir-to-pdf.test.js` "determinism"). Re-asserted here at
        // the FACADE, not just the internal writer. The odt target is the
        // only one of the three that is not byte-reproducible.
        test('two fromMd(pdf) calls on the same markdown produce BYTE-IDENTICAL output', async () => {
            const src = fixtureText(MD_STRUCTURAL);
            const B1 = await oconv.fromMd({ markdown: src, target: 'pdf' });
            const B2 = await oconv.fromMd({ markdown: src, target: 'pdf' });
            expect(B1.bytes.length).toBe(B2.bytes.length);
            expect(B1.bytes.every((v, i) => v === B2.bytes[i])).toBe(true);
        });
    });
});

describe('roundtrip — leg 9: accents on the Standard 14 route (md->pdf->md)', () => {
    // The default route draws CP1252 bytes and every Standard 14 font dict
    // names `/Encoding /WinAnsiEncoding`, so accented Latin letters and the
    // em dash survive the round trip as the characters written — not as the
    // StandardEncoding glyphs those bytes would otherwise select (`Café`
    // used to read back `CafØ`), and not as the `?` of the unencodable
    // degrade (every character here is WinAnsi-representable).
    const ACCENTS = '# Rapport\n\nCafé, déjà vu — accents.\n';

    test('fromMd(pdf) records no loss; toMd records no loss and reads the accented line back verbatim', async () => {
        const written = await oconv.fromMd({
            markdown: ACCENTS, target: 'pdf', opts: { pdf: { pageNumbers: false } }
        });
        expect(written.losses).toEqual([]);

        const read = await oconv.toMd({
            name: 'accents.pdf', bytes: written.bytes, convertedAt: FIXED_AT
        });
        expect(read.losses).toEqual([]);
        const body = bodyOf(read.markdown);
        expect(body).toContain('Café, déjà vu — accents.');
        expect(body).not.toContain('CafØ');
        expect(body).not.toContain('?');
    });
});
