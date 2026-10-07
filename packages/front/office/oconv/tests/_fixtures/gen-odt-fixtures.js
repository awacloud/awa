// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/tests/_fixtures/gen-odt-fixtures.js
//
// ONE-SHOT generator for the two committed `.odt` fixtures under
// `tests/_fixtures/corpus/odt/`. Run once, by hand, from the repo root:
//
//   bun packages/front/office/oconv/tests/_fixtures/gen-odt-fixtures.js
//
// Kept in the repo for PROVENANCE ONLY (per task 06's plan, mirroring the
// docx spike's `corpus-gen.js` precedent) — the fidelity harness
// (`tests/fidelity.integration.test.js`) reads the COMMITTED bytes and never
// re-runs this script. Do not wire this into `bun test`.
//
// Builds via `@awacloud/odf`'s PUBLIC `odt.write(doc, opts)` surface only (the
// same composition pattern `oconvOdtToIr`'s own tests use — see
// `src/read/odt-to-ir.test.js`). Two fixtures:
//
//  - `odt-structured.odt` — headings (semantic `outlineLevel`, not a style
//    heuristic), a plain-plus-emphasised paragraph, a standalone hyperlink
//    paragraph, an "ordered" list and a bullet list with one nested level.
//    Exercises the reader's `heading`/`paragraph`/`list`/hyperlink mapping
//    (W0 FINDINGS §Axis 3 odt→md row).
//  - `odt-table.odt` — a `<table:table>` embedded directly in the text body
//    as a raw XML element (odt's own `text:p`/`text:list` typed helpers have
//    no table constructor for text-body content; `table:table` is only
//    wired for `.ods`). It was built to exercise GAP-ODF-1 (the then-frozen
//    `@awacloud/odf` `textContent` reader had no dispatch for `table:table`
//    in `<office:text>`, a documented `block/dropped` loss). GAP-ODF-1 is
//    RETIRED (office/BATCH_27: task 04 gave `odt.read()` the dispatch, task
//    07 maps it) — the raw table now READS as a real IR `table` with zero
//    loss, and the committed fixture is kept as a regression guard for that
//    dispatch. The opening paragraph's text below still states the old gap:
//    it is frozen fixture CONTENT (changing it would change the committed
//    bytes), not a claim about the reader.
//
// Raw XML element nodes below use the exact shape `@awacloud/fw`'s xml codec
// produces (`{ type: 'element', name, attrs, children }` / `{ type: 'text',
// value }` — see `@awacloud/fw/io/codec/xml.js` `el()`/`text()`), which is the
// documented `_extras`/body raw-passthrough shape every odf orchestrator
// accepts. No odf internals are reached into; `odt.write()` itself performs
// every byte of serialisation.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/odf';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'corpus', 'odt');

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const odt = runtime.resolve('odt');

/** @param {string} text */
function textRun(text) {
    return { type: 'text', value: text };
}

/** @param {number} level @param {string} text */
function heading(level, text) {
    return { type: 'heading', outlineLevel: level, runs: [textRun(text)] };
}

/** @param {Array<object>} runs @param {object} [extras] */
function paragraph(runs, extras) {
    const p = { type: 'paragraph', runs };
    if (extras) p._extras = { children: extras };
    return p;
}

/** A standalone `<text:a>` hyperlink, built as a raw XML element (`_extras`
 * is the documented raw-passthrough seam — see `odt-to-ir.js`'s own
 * `text:a` handling). */
function hyperlinkParagraph(href, text) {
    return paragraph([], [
        {
            type: 'element',
            name: 'text:a',
            attrs: { 'xlink:href': href },
            children: [textRun(text)]
        }
    ]);
}

/** @param {string} styleName @param {string[]} texts */
function flatList(styleName, texts) {
    return {
        type: 'list',
        styleName,
        items: texts.map(t => ({ children: [paragraph([textRun(t)])] }))
    };
}

// --- odt-structured.odt ---------------------------------------------------

const structured = {
    body: [
        heading(1, 'Sovereign RAG Ingestion'),
        paragraph([textRun('Plain paragraph with an ')]),
        paragraph([
            textRun('inline '),
            { type: 'span', value: 'emphasised', styleName: 'Emphasis' },
            textRun(' run.')
        ]),
        heading(2, 'Why Air-Gap Matters'),
        hyperlinkParagraph('https://example.org/rag', 'external reference link'),
        heading(3, 'Chunking'),
        flatList('WWNum1', ['First step', 'Second step', 'Third step']),
        {
            type: 'list',
            styleName: 'WWNum2',
            items: [
                { children: [paragraph([textRun('Bullet A')])] },
                {
                    children: [
                        paragraph([textRun('Bullet B')]),
                        {
                            type: 'list',
                            styleName: 'WWNum2Sub',
                            items: [
                                { children: [paragraph([textRun('Nested B.1')])] }
                            ]
                        }
                    ]
                }
            ]
        }
    ]
};

// --- odt-table.odt ---------------------------------------------------------

/** @param {string} text raw `<table:table-cell>` holding one `<text:p>`. */
function tableCell(text) {
    return {
        type: 'element',
        name: 'table:table-cell',
        attrs: { 'office:value-type': 'string' },
        children: [
            { type: 'element', name: 'text:p', attrs: {}, children: [textRun(text)] }
        ]
    };
}

/** @param {string[]} cells */
function tableRow(cells) {
    return {
        type: 'element',
        name: 'table:table-row',
        attrs: {},
        children: cells.map(tableCell)
    };
}

const rawTable = {
    type: 'element',
    name: 'table:table',
    attrs: { 'table:name': 'Table1' },
    children: [
        {
            type: 'element',
            name: 'table:table-column',
            attrs: { 'table:number-columns-repeated': '2' },
            children: []
        },
        tableRow(['Header A', 'Header B']),
        tableRow(['1,1', '1,2'])
    ]
};

const table = {
    body: [
        paragraph([textRun(
            'A text-body table follows (GAP-ODF-1: no reader dispatch for '
            + 'table:table in office:text — dropped as a documented loss).'
        )]),
        rawTable,
        paragraph([textRun('End of document.')])
    ]
};

// --- write + report ----------------------------------------------------

/** @param {string} name @param {object} doc */
function writeFixture(name, doc) {
    const bytes = odt.write(doc, { meta: { title: name, creator: '@awacloud/oconv fixture generator' } });
    const path = join(OUT_DIR, name);
    writeFileSync(path, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    console.log(`${name}\tbytes=${bytes.byteLength}\tsha256=${sha256}`);
}

writeFixture('odt-structured.odt', structured);
writeFixture('odt-table.odt', table);
