// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `docx <-> odt` cross-format fidelity harness — office/BATCH_35 task 05
 * (`ai/batches/types/office/BATCH_35/05-pair-ooxml-odf-harness.md`).
 *
 * Drives the PUBLIC facade `oconv.convert` (office/BATCH_35 task 04) plus
 * `oconv.toMd` over the vendored corpus (`tests/_fixtures/corpus/`, 6 docx +
 * 2 odt) and pins, per fixture, EXACTLY what the tree measures:
 *
 *  1. `docx -> odt` loss ledgers (6 fixtures), `toEqual` an exact array,
 *     with the reader / writer SPLIT itself measured (the facade documents
 *     the merge as reader-then-writer `concat`, so the writer-side ledger is
 *     the suffix past the reader's own — never assumed, always re-derived by
 *     running `oconvDocxToIr` / `oconvOdtToIr` directly on the same bytes).
 *     Every produced container is re-parsed with the TARGET package's own
 *     public reader, so "it wrote bytes" is never mistaken for "it wrote a
 *     document".
 *  2. `odt -> docx` loss ledgers (2 fixtures), same shape.
 *  3. Construct survival through the return leg (`toMd` of the converted
 *     container) — the same checks `tests/fidelity.integration.test.js`
 *     makes on the SOURCE.
 *  4. Model-equivalence through the pair, for every fixture whose
 *     WRITER-side ledger is empty: `bodyOf(toMd(convert(X->Y)))` vs
 *     `bodyOf(toMd(X))`. Six of the seven eligible fixtures measure EQUAL
 *     and are pinned `toBe`; `odt-structured.odt` measures DIFFERENT and its
 *     exact difference is pinned with its root cause (see that test).
 *  5. Inline code survives `md -> docx -> odt -> md` (task 03's symmetric
 *     monospace path + BATCH_27's odf `textStyleRegistry`).
 *  6. Two-run MODEL equality per fixture, plus byte identity for the
 *     `odt -> docx` direction (the `docx` target is byte-reproducible).
 *  7. A falsification twin, mirroring `roundtrip.integration.test.js` leg 2.
 *
 * ## What this file deliberately does NOT assert
 *
 * - **No idempotence (`X -> Y -> X`) claim.** W3a's falsification discipline
 *   plus the tier-1 `pdf -> md` return leg make it unmeasurable at tier 2;
 *   the pair legs here compare MARKDOWN normal forms, not containers.
 * - **No byte claim for the `-> odt` direction.** The `docx` target is
 *   byte-reproducible: `@awacloud/ooxml` stamps every zip entry with a fixed
 *   1980-01-01 00:00 timestamp. The `odt` target is not: the ODF package
 *   writer stamps the current time, so two identical calls give equal
 *   document models but may give different bytes — and an assertion of byte
 *   INEQUALITY would be unsound, because the DOS timestamp has 2 s
 *   resolution and two writes inside the same 2 s window legitimately match.
 *   Leg 6 therefore compares MODELS (`bodyOf(toMd(...))`) for every pair and
 *   pins bytes for `odt -> docx` only.
 * - **No new fixture.** Two facts, both recorded in the task report: (a) no
 *   licence-clean real-world `.odt` exists to vendor (corpus
 *   `PROVENANCE.md` §3/§4 — Apache POI `test-data` yielded ZERO odt/odp, and
 *   LibreOffice `contrib/test-files` was rejected in full for want of a
 *   reachable LICENSE/NOTICE); (b) when this harness was written, an `.odt`
 *   carrying an image could not be generated first-party either, because
 *   `@awacloud/odf` had no typed image write path. It has one now, and
 *   `irToOdt` places images through it (leg 1's `poi-with-gif.docx` tests).
 *
 * `references/` is never read here (owner ruling 2026-07-20) — every byte
 * consumed is vendored under `tests/_fixtures/corpus/`.
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
// Resolved directly so the READER half of every merged ledger below is
// measured rather than inferred — and so the `poi-with-gif.docx` tripwire can
// look at the IR the reader actually produced.
const oconvDocxToIrApi = runtime.resolve('oconvDocxToIr');
const oconvOdtToIrApi = runtime.resolve('oconvOdtToIr');

/** @param {string} relPath relative to this file */
function fixtureBytes(relPath) {
    return new Uint8Array(readFileSync(new URL(relPath, import.meta.url)));
}

/** @param {string} relPath relative to this file */
function fixtureText(relPath) {
    return readFileSync(new URL(relPath, import.meta.url), 'utf8');
}

/**
 * Strip a leading `---`/…/`---` front-matter fence and return the body.
 * Test-local copy of `roundtrip.integration.test.js`'s own helper (plan's
 * prescriptive API): every comparison here is a BODY comparison, since front
 * matter legitimately differs per leg (name / sha / format / convertedAt).
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
 * The reader half of a `convert` ledger, measured by running the SAME reader
 * the facade runs (`src/oconv.js` `readToIr`) on the same bytes.
 *
 * @param {'docx'|'odt'} format
 * @param {Uint8Array} bytes
 * @returns {{code: string, detail: *}[]}
 */
function readerLosses(format, bytes) {
    return format === 'docx'
        ? oconvDocxToIrApi.docxToIr(docxApi.read(bytes)).losses
        : oconvOdtToIrApi.odtToIr(odtApi.read(bytes)).losses;
}

// ---------------------------------------------------------------------------
// Corpus + MEASURED ledgers
// ---------------------------------------------------------------------------

/**
 * Every row below is MEASURED on this tree, never inherited from the plan:
 * `merged` is the exact `convert(...).losses` array, `reader` the exact
 * `oconv<Format>ToIr` ledger, and `writer` the measured suffix. The three are
 * cross-checked against each other in leg 1/2, so a future reader change that
 * shifts a code from one half to the other cannot pass silently.
 */
const DOCX_TO_ODT = [
    {
        name: 'docx-smoke.docx',
        path: './_fixtures/corpus/docx/docx-smoke.docx',
        reader: [],
        writer: []
    },
    {
        name: 'docx-structured.docx',
        path: './_fixtures/corpus/docx/docx-structured.docx',
        // GAP-OOXML-2: the committed fixture carries `w:numPr` (numId 1, 2)
        // with NO `word/numbering.xml` part at all — the honest (F3) reader
        // reports both. Nothing from the odt writer.
        reader: [
            { code: 'list/numbering-unresolved', detail: 'numId 1' },
            { code: 'list/numbering-unresolved', detail: 'numId 2' }
        ],
        writer: []
    },
    {
        name: 'docx-bulk.docx',
        path: './_fixtures/corpus/docx/docx-bulk.docx',
        reader: [],
        writer: []
    },
    {
        name: 'poi-numbering.docx',
        path: './_fixtures/corpus/real/poi-numbering.docx',
        reader: [{ code: 'list/nesting-flattened', detail: 'numId 1 ilvl 1' }],
        writer: []
    },
    {
        name: 'poi-table-alignment.docx',
        path: './_fixtures/corpus/real/poi-table-alignment.docx',
        reader: [],
        writer: []
    },
    {
        name: 'poi-with-gif.docx',
        path: './_fixtures/corpus/real/poi-with-gif.docx',
        // The ONLY writer-side loss in this pair's whole corpus. The reader
        // ledger is EMPTY — the bytes reached the IR intact — and the odt
        // writer PLACES the image as a `Pictures/` part at its default box,
        // hence `image/size-defaulted` (see the two tests below).
        reader: [],
        writer: [{ code: 'image/size-defaulted', detail: 'Grafik 1' }]
    }
];

const ODT_TO_DOCX = [
    {
        name: 'odt-structured.odt',
        path: './_fixtures/corpus/odt/odt-structured.odt',
        // All four are READ-side: `@awacloud/odf`'s model carries only a
        // `styleName` on a span, and the fixture (generated without
        // `opts.styles`, so an EMPTY `styles.xml` — BATCH_27 ruling B's
        // resolution has nothing to resolve against) leaves them unresolved.
        reader: [
            { code: 'run/format-unresolved', detail: 'Emphasis' },
            { code: 'list/numbering-unresolved', detail: 'WWNum1' },
            { code: 'list/numbering-unresolved', detail: 'WWNum2' },
            { code: 'list/numbering-unresolved', detail: 'WWNum2Sub' }
        ],
        writer: []
    },
    {
        name: 'odt-table.odt',
        path: './_fixtures/corpus/odt/odt-table.odt',
        reader: [],
        writer: []
    }
];

// ---------------------------------------------------------------------------
// Leg 1 — docx -> odt ledgers
// ---------------------------------------------------------------------------

describe('crossformat docx->odt — exact loss ledgers (6 fixtures)', () => {
    for (const fx of DOCX_TO_ODT) {
        test(`${fx.name} -> odt — EXACT ledger, reader/writer split measured, output re-parses as odt`, async () => {
            const bytes = fixtureBytes(fx.path);
            const out = await oconv.convert({ name: fx.name, bytes, target: 'odt' });

            expect(out.format).toBe('docx');
            expect(out.target).toBe('odt');

            // The exhaustive, count-exact ledger — `toEqual`, never relaxed.
            expect(out.losses).toEqual(fx.reader.concat(fx.writer));
            expect(out.lossy).toBe(fx.reader.length + fx.writer.length > 0);

            // The split is MEASURED, not assumed: the facade documents the
            // merge as reader-then-writer `concat`, so re-running the reader
            // on the same bytes must reproduce the ledger's own prefix.
            expect(readerLosses('docx', bytes)).toEqual(fx.reader);
            expect(out.losses.slice(fx.reader.length)).toEqual(fx.writer);

            // Bytes are a real odt document, not just a zip: `odt.read()`
            // parses it and returns a non-empty `body` (the odf public
            // reader's own shape — `{mimetype, body, package, meta, …}`).
            const parsed = odtApi.read(out.bytes);
            expect(parsed.mimetype).toBe('application/vnd.oasis.opendocument.text');
            expect(Array.isArray(parsed.body)).toBe(true);
            expect(parsed.body.length).toBeGreaterThan(0);
        });
    }

    // The `image/size-defaulted` above is the placement, not a drop: the
    // docx reader carries the GIF program into the IR under
    // `escapes.docx.bytes`, and `src/write/ir-to-odt.js` writes exactly those
    // bytes as the odt's `Pictures/image1.gif` part (`.gif` sniffed from the
    // `GIF8` signature, never derived from the name `Grafik 1`).
    test('poi-with-gif.docx — the IR carries escapes.docx.bytes and the written odt carries them as its Pictures/image1.gif part', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/real/poi-with-gif.docx');
        const { ir, losses } = oconvDocxToIrApi.docxToIr(docxApi.read(bytes));

        // The reader lost NOTHING — in particular no `image/bytes-unavailable`.
        expect(losses).toEqual([]);

        /** @type {object[]} */
        const images = [];
        (function walk(n) {
            if (!n || typeof n !== 'object') return;
            if (n.kind === 'image') images.push(n);
            for (const key of ['children', 'blocks', 'items', 'rows', 'cells']) {
                if (Array.isArray(n[key])) n[key].forEach(walk);
            }
        })(ir);

        expect(images).toHaveLength(1);
        const img = images[0];
        expect(img.name).toBe('Grafik 1');
        expect(img.escapes).toBeDefined();
        expect(img.escapes.docx.contentType).toBe('image/gif');
        expect(img.escapes.docx.bytes).toBeInstanceOf(Uint8Array);
        expect(img.escapes.docx.bytes.length).toBe(6554);
        // GIF87a/GIF89a magic — the bytes are a real image program.
        expect(String.fromCharCode(...img.escapes.docx.bytes.slice(0, 3))).toBe('GIF');

        // The written odt carries exactly those bytes as ONE picture part.
        const out = await oconv.convert({ name: 'poi-with-gif.docx', bytes, target: 'odt' });
        const parts = odtApi.read(out.bytes).package.parts;
        expect(Object.keys(parts).filter((p) => p.startsWith('Pictures/')))
            .toEqual(['Pictures/image1.gif']);
        expect(parts['Pictures/image1.gif']).toEqual(img.escapes.docx.bytes);
    });

    // The return leg still loses the image, on the READ side: the odt reader
    // keeps the written frame untyped, so `toMd` of the converted odt records
    // `image/unresolved` and emits no image reference, while the direct read
    // of the same source does. Pinned so the read-side limit stays visible.
    test('poi-with-gif.docx — the image reference survives docx->md but not docx->odt->md: the odt reader leaves the written frame unresolved', async () => {
        const bytes = fixtureBytes('./_fixtures/corpus/real/poi-with-gif.docx');

        const direct = await oconv.toMd({
            name: 'poi-with-gif.docx', bytes, convertedAt: FIXED_AT
        });
        expect(direct.assets).toHaveLength(1);
        expect(direct.assets[0].kind).toBe('image');
        expect(direct.assets[0].name).toBe('Grafik 1');
        expect(bodyOf(direct.markdown)).toContain('![');

        const out = await oconv.convert({ name: 'poi-with-gif.docx', bytes, target: 'odt' });
        const via = await oconv.toMd({ name: 'x.odt', bytes: out.bytes, convertedAt: FIXED_AT });
        expect(via.assets).toEqual([]);
        expect(via.losses).toEqual([{ code: 'image/unresolved', detail: 'draw:frame' }]);
        expect(bodyOf(via.markdown)).not.toContain('![');
        expect(bodyOf(via.markdown)).not.toContain('Grafik');

        // The surrounding prose is untouched — only the image is lost.
        expect(bodyOf(via.markdown)).toContain('Lorem ipsum dolor sit amet');
    });
});

// ---------------------------------------------------------------------------
// Leg 2 — odt -> docx ledgers
// ---------------------------------------------------------------------------

describe('crossformat odt->docx — exact loss ledgers (2 fixtures)', () => {
    for (const fx of ODT_TO_DOCX) {
        test(`${fx.name} -> docx — EXACT ledger, reader/writer split measured, output re-parses as docx`, async () => {
            const bytes = fixtureBytes(fx.path);
            const out = await oconv.convert({ name: fx.name, bytes, target: 'docx' });

            expect(out.format).toBe('odt');
            expect(out.target).toBe('docx');

            expect(out.losses).toEqual(fx.reader.concat(fx.writer));
            expect(out.lossy).toBe(fx.reader.length + fx.writer.length > 0);

            expect(readerLosses('odt', bytes)).toEqual(fx.reader);
            expect(out.losses.slice(fx.reader.length)).toEqual(fx.writer);

            const parsed = docxApi.read(out.bytes);
            expect(Array.isArray(parsed.document.body)).toBe(true);
            expect(parsed.document.body.length).toBeGreaterThan(0);
        });
    }
});

// ---------------------------------------------------------------------------
// Leg 3 — construct survival through the return leg
// ---------------------------------------------------------------------------

/**
 * `bodyOf(toMd(convert(source -> target)))` — the return leg every construct
 * check below runs against.
 *
 * @param {string} name source fixture name
 * @param {string} relPath fixture path relative to this file
 * @param {'docx'|'odt'} target
 * @returns {Promise<{body: string, anchors: object[], losses: object[]}>}
 */
async function through(name, relPath, target) {
    const bytes = fixtureBytes(relPath);
    const out = await oconv.convert({ name, bytes, target });
    const back = await oconv.toMd({
        name: `x.${target}`, bytes: out.bytes, convertedAt: FIXED_AT
    });
    return { body: bodyOf(back.markdown), anchors: back.anchors, losses: back.losses };
}

describe('crossformat — construct survival on the return leg (toMd of the converted container)', () => {
    test('docx-smoke.docx -> odt — 3 headings (anchors + lines), bold/italic markers, link URL', async () => {
        const r = await through('docx-smoke.docx', './_fixtures/corpus/docx/docx-smoke.docx', 'odt');
        expect(r.anchors).toEqual([
            { level: 1, anchor: 'sovereign-rag-ingestion' },
            { level: 2, anchor: 'why-air-gap-matters' },
            { level: 3, anchor: 'chunking' }
        ]);
        expect(r.body).toContain('# Sovereign RAG ingestion');
        expect(r.body).toContain('## Why air-gap matters');
        expect(r.body).toContain('### Chunking');
        expect(r.body).toContain('**Zero network**');
        expect(r.body).toContain('*auditable output*');
        expect(r.body).toContain('[the profile](https://example.invalid/profile-v1)');
    });

    test('docx-structured.docx -> odt — 4 headings, both list bodies, the 5x3 GFM table', async () => {
        const r = await through('docx-structured.docx', './_fixtures/corpus/docx/docx-structured.docx', 'odt');
        expect(r.anchors.map((a) => a.anchor)).toEqual([
            'conversion-matrix', 'bounded-promises', 'steps', 'matrix'
        ]);
        expect(r.body).toContain('# Conversion matrix');
        expect(r.body).toContain('- Text and structure are preserved');
        expect(r.body).toContain('- Read with the owning package');
        expect(r.body).toContain('| Format | Direction | Tier |');
        expect(r.body).toContain('| --- | --- | --- |');
        expect(r.body).toContain('| docx | to-md | 2 |');
    });

    test('docx-bulk.docx -> odt — 41 headings and the 61x3 table (header + delimiter + 60 data rows)', async () => {
        const r = await through('docx-bulk.docx', './_fixtures/corpus/docx/docx-bulk.docx', 'odt');
        expect(r.anchors).toHaveLength(41);
        expect(r.anchors[0]).toEqual({ level: 1, anchor: 'bulk-document' });

        // 61 logical rows (1 header + 60 data) render as 62 pipe-prefixed
        // lines: GFM inserts the delimiter row between them.
        const pipeLines = r.body.split('\n').filter((l) => l.startsWith('|'));
        expect(pipeLines).toHaveLength(62);
        expect(pipeLines[0]).toBe('| Key | Value | Note |');
        expect(pipeLines[1]).toBe('| --- | --- | --- |');
        expect(pipeLines[pipeLines.length - 1]).toBe('| k59 | v59 | note 59 |');
        // 3 columns.
        expect(pipeLines[0].split('|').filter((c) => c.trim()).length).toBe(3);
    });

    test('poi-numbering.docx -> odt — bullet and ordered markers both survive with their own syntax', async () => {
        const r = await through('poi-numbering.docx', './_fixtures/corpus/real/poi-numbering.docx', 'odt');
        expect(r.body).toContain('- Level 1');
        expect(r.body).toContain('- Level 4');
        expect(r.body).toMatch(/(^|\n)1\.\s+Level1/);
        expect(r.body).toMatch(/(^|\n)1\.\s+One/);
    });

    test('poi-table-alignment.docx -> odt — all 6 tables survive with their cell texts and bold header runs', async () => {
        const r = await through('poi-table-alignment.docx', './_fixtures/corpus/real/poi-table-alignment.docx', 'odt');
        const pipeLines = r.body.split('\n').filter((l) => l.startsWith('|'));
        // 6 tables x (header + delimiter + 2 data rows).
        expect(pipeLines).toHaveLength(24);
        expect(r.body).toContain('| **Loren** | **Ipsum** | **Dolor** |');
        expect(r.body).toContain('| Quisque | faucibus | ex |');
        for (const cell of ['Loren', 'Ipsum', 'Dolor', 'Amet', 'adipiscing']) {
            expect(r.body).toContain(cell);
        }
    });

    test('odt-structured.odt -> docx — 3 headings, link URL, every list item text', async () => {
        const r = await through('odt-structured.odt', './_fixtures/corpus/odt/odt-structured.odt', 'docx');
        expect(r.anchors).toEqual([
            { level: 1, anchor: 'sovereign-rag-ingestion' },
            { level: 2, anchor: 'why-air-gap-matters' },
            { level: 3, anchor: 'chunking' }
        ]);
        expect(r.body).toContain('# Sovereign RAG Ingestion');
        expect(r.body).toContain('## Why Air-Gap Matters');
        expect(r.body).toContain('### Chunking');
        expect(r.body).toContain('[external reference link](https://example.org/rag)');
        for (const item of ['First step', 'Second step', 'Third step',
            'Bullet A', 'Bullet B', 'Nested B.1']) {
            expect(r.body).toContain(item);
        }
    });

    test('odt-table.odt -> docx — the text-body table survives as a real GFM table, prose intact', async () => {
        const r = await through('odt-table.odt', './_fixtures/corpus/odt/odt-table.odt', 'docx');
        expect(r.body).toContain('| Header A | Header B |');
        expect(r.body).toContain('| --- | --- |');
        expect(r.body).toContain('| 1,1 | 1,2 |');
        expect(r.body).toContain('A text-body table follows');
        expect(r.body).toContain('End of document.');
    });
});

// ---------------------------------------------------------------------------
// Leg 4 — model-equivalence through the pair
// ---------------------------------------------------------------------------

describe('crossformat — model-equivalence through the pair (writer-side ledger empty)', () => {
    /**
     * `bodyOf(toMd(X))` — the direct read of the SOURCE, the baseline every
     * comparison below is made against.
     *
     * @param {string} name
     * @param {string} relPath
     * @returns {Promise<string>}
     */
    async function direct(name, relPath) {
        const read = await oconv.toMd({
            name, bytes: fixtureBytes(relPath), convertedAt: FIXED_AT
        });
        return bodyOf(read.markdown);
    }

    // Six of the seven writer-empty fixtures measure EQUAL — pinned `toBe`.
    // (`poi-with-gif.docx` is excluded by the leg's own rule: its writer
    // ledger carries `image/size-defaulted`, and its measured difference —
    // the odt reader leaves the written frame unresolved — is asserted in
    // leg 1 instead.)
    const EQUAL = [
        { name: 'docx-smoke.docx', path: './_fixtures/corpus/docx/docx-smoke.docx', target: 'odt' },
        { name: 'docx-structured.docx', path: './_fixtures/corpus/docx/docx-structured.docx', target: 'odt' },
        { name: 'docx-bulk.docx', path: './_fixtures/corpus/docx/docx-bulk.docx', target: 'odt' },
        { name: 'poi-numbering.docx', path: './_fixtures/corpus/real/poi-numbering.docx', target: 'odt' },
        { name: 'poi-table-alignment.docx', path: './_fixtures/corpus/real/poi-table-alignment.docx', target: 'odt' },
        { name: 'odt-table.odt', path: './_fixtures/corpus/odt/odt-table.odt', target: 'docx' }
    ];

    for (const fx of EQUAL) {
        test(`${fx.name} -> ${fx.target} — bodyOf(toMd(convert(X))) === bodyOf(toMd(X)) (MEASURED equal)`, async () => {
            const r = await through(fx.name, fx.path, /** @type {'docx'|'odt'} */(fx.target));
            expect(r.body).toBe(await direct(fx.name, fx.path));
        });
    }

    // The ONE writer-empty fixture that measures DIFFERENT. Pinned exactly,
    // with its root cause, rather than widened or narrowed to force equality
    // (office memory: assert the true measured relation).
    //
    // ROOT CAUSE — one docx degrade, on the RETURN read, neither on the odt
    // read nor the docx write: `list/nesting-flattened` (GAP-OOXML, the same
    // degrade `roundtrip.integration.test.js` leg 6 pins). The odt source's
    // `Nested B.1` is a depth-1 item, `src/write/ir-to-docx.js` writes it as
    // `pPr.numPr.ilvl = 1`, and `src/read/docx-to-ir.js` flattens every
    // ilvl > 0 back to depth 0 with that loss. So the two-space indent
    // `  - Nested B.1` becomes `- Nested B.1`.
    //
    // The list MERGE this fixture used to exhibit is FIXED: the docx writer
    // now allocates one numbering instance per top-level list, so the
    // fixture's two ADJACENT bullet lists carry distinct `numId`s and stay
    // two lists on re-read — the blank line that separates them survives.
    test('odt-structured.odt -> docx — MEASURED DIFFERENT: the two bullet lists stay distinct; only the nested item flattens (exact difference pinned)', async () => {
        const baseline = await direct('odt-structured.odt', './_fixtures/corpus/odt/odt-structured.odt');
        const r = await through('odt-structured.odt', './_fixtures/corpus/odt/odt-structured.odt', 'docx');

        expect(r.body).not.toBe(baseline);

        // Exact bodies — the difference is the whole tail, nothing else.
        expect(baseline).toBe(
            '# Sovereign RAG Ingestion\n\nPlain paragraph with an \n\n'
            + 'inline emphasised run.\n\n## Why Air-Gap Matters\n\n'
            + '[external reference link](https://example.org/rag)\n\n### Chunking\n\n'
            + '- First step\n- Second step\n- Third step\n\n'
            + '- Bullet A\n- Bullet B\n  - Nested B.1\n'
        );
        expect(r.body).toBe(
            '# Sovereign RAG Ingestion\n\nPlain paragraph with an \n\n'
            + 'inline emphasised run.\n\n## Why Air-Gap Matters\n\n'
            + '[external reference link](https://example.org/rag)\n\n### Chunking\n\n'
            + '- First step\n- Second step\n- Third step\n\n'
            + '- Bullet A\n- Bullet B\n- Nested B.1\n'
        );
        // The ONLY difference from the baseline is the flattened nested item.
        expect(r.body).toBe(baseline.replace('  - Nested B.1', '- Nested B.1'));

        // The flattening is reported, not silent.
        expect(r.losses).toEqual([
            { code: 'list/nesting-flattened', detail: 'numId 2 ilvl 1' }
        ]);
        // The two lists stay distinct on the return leg: the blank line
        // between them survives.
        expect(baseline).toContain('- Third step\n\n- Bullet A');
        expect(r.body).toContain('- Third step\n\n- Bullet A');
    });
});

// ---------------------------------------------------------------------------
// Leg 5 — inline code, symmetric through the pair
// ---------------------------------------------------------------------------

describe('crossformat — inline code survives md -> docx -> odt -> md', () => {
    // Task 03 made the docx side SYMMETRIC (writer emits `Courier New`,
    // reader recognises it on the frozen monospace allowlist, the
    // `run/code-degraded` loss is RETIRED); office/BATCH_27 gave odf its
    // `textStyleRegistry` monospace face. Together they make the whole
    // md -> docx -> odt -> md chain zero-loss for backticked inline code.
    test('md-structural.md — backticks survive the whole chain, every ledger EMPTY', async () => {
        const src = fixtureText('./_fixtures/corpus/md/md-structural.md');

        const written = await oconv.fromMd({ markdown: src, target: 'docx' });
        expect(written.losses).toEqual([]);

        const converted = await oconv.convert({
            bytes: written.bytes, format: 'docx', target: 'odt'
        });
        expect(converted.losses).toEqual([]);
        expect(converted.lossy).toBe(false);

        const back = await oconv.toMd({
            name: 'x.odt', bytes: converted.bytes, convertedAt: FIXED_AT
        });
        expect(back.losses).toEqual([]);

        const body = bodyOf(back.markdown);
        expect(body).toContain('`inline code`');
        // The neighbouring emphasis in the same paragraph is untouched — the
        // monospace run is not swallowing its siblings.
        expect(body).toContain(
            'Here is a paragraph with **bold text**, *italic text*, '
            + '~~strikethrough text~~ and `inline code`.'
        );
    });
});

// ---------------------------------------------------------------------------
// Leg 6 — two-run MODEL equality
// ---------------------------------------------------------------------------

describe('crossformat — two convert runs are MODEL-equal', () => {
    // Byte equality holds for the `-> docx` direction only: the `docx`
    // target is byte-reproducible (`@awacloud/ooxml` stamps every zip entry
    // with a fixed 1980-01-01 00:00 timestamp), pinned by the byte-identity
    // test below. The `odt` target is not: the ODF package writer stamps the
    // current time, so two identical calls give equal document models but may
    // give different bytes — and byte INEQUALITY is not assertable either,
    // since the DOS timestamp has 2 s resolution and two writes inside the
    // same window legitimately match. The document MODEL is what is
    // deterministic for every pair.
    const ALL = [
        ...DOCX_TO_ODT.map((f) => ({ ...f, target: 'odt' })),
        ...ODT_TO_DOCX.map((f) => ({ ...f, target: 'docx' }))
    ];

    for (const fx of ALL) {
        test(`${fx.name} -> ${fx.target} — two runs produce equal bodyOf(toMd(...))`, async () => {
            const bytes = fixtureBytes(fx.path);
            const a = await oconv.convert({ name: fx.name, bytes, target: fx.target });
            const b = await oconv.convert({ name: fx.name, bytes, target: fx.target });

            // The ledgers are deterministic too.
            expect(b.losses).toEqual(a.losses);

            const ma = await oconv.toMd({ name: `a.${fx.target}`, bytes: a.bytes, convertedAt: FIXED_AT });
            const mb = await oconv.toMd({ name: `b.${fx.target}`, bytes: b.bytes, convertedAt: FIXED_AT });
            expect(bodyOf(mb.markdown)).toBe(bodyOf(ma.markdown));
        });
    }
});

describe('crossformat — odt -> docx convert runs are byte-reproducible', () => {
    test('odt -> docx: two convert runs are BYTE-identical', async () => {
        for (const fx of ODT_TO_DOCX) {
            const bytes = fixtureBytes(fx.path);
            const a = await oconv.convert({ name: fx.name, bytes, target: 'docx' });
            const b = await oconv.convert({ name: fx.name, bytes, target: 'docx' });
            expect(b.bytes.length).toBe(a.bytes.length);
            expect(b.bytes.every((v, i) => v === a.bytes[i])).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Leg 7 — falsification twin
// ---------------------------------------------------------------------------

describe('crossformat — falsification twin (non-vacuity of every equality above)', () => {
    // Mirrors `roundtrip.integration.test.js` leg 2's twin: two markdown
    // sources differing in ONE table cell must produce DIFFERENT bodies
    // through the pair, or every `toBe` equality in this file would be a
    // tautology over a comparison that cannot distinguish anything.
    test('two markdown sources differing in one table cell produce different bodies through md -> docx -> odt -> md', async () => {
        const src = fixtureText('./_fixtures/corpus/md/md-structural.md');
        const mutated = src.replace('| a1 | b1 | c1 |', '| a1-mutated | b1 | c1 |');
        expect(mutated).not.toBe(src);

        /**
         * @param {string} markdown
         * @returns {Promise<string>}
         */
        async function pairBody(markdown) {
            const written = await oconv.fromMd({ markdown, target: 'docx' });
            const converted = await oconv.convert({
                bytes: written.bytes, format: 'docx', target: 'odt'
            });
            const back = await oconv.toMd({
                name: 'x.odt', bytes: converted.bytes, convertedAt: FIXED_AT
            });
            return bodyOf(back.markdown);
        }

        const baseline = await pairBody(src);
        const changed = await pairBody(mutated);

        expect(changed).not.toBe(baseline);
        expect(baseline).toContain('| a1 | b1 | c1 |');
        expect(changed).toContain('| a1-mutated | b1 | c1 |');
    });
});
