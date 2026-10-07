// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/tests/_fixtures/gen-odp-fixtures.js
//
// ONE-SHOT generator for the two committed `.odp` fixtures under
// `tests/_fixtures/corpus/odp/`. Run once, by hand, from the repo root:
//
//   bun packages/front/office/oconv/tests/_fixtures/gen-odp-fixtures.js
//
// Kept in the repo for PROVENANCE ONLY, mirroring `gen-odt-fixtures.js`'s
// own precedent (BATCH_11, task 06's plan) — a later fidelity harness
// reads the COMMITTED bytes and never re-runs this script. Do not wire
// this into `bun test`.
//
// Builds via `@awacloud/odf`'s PUBLIC `odp.write(doc, opts)` surface only (the
// same composition pattern `oconvOdpToIr`'s own tests use — see
// `src/read/odp-to-ir.test.js`). Two fixtures:
//
//  - `odp-structured.odp` — 2 slides, each with a `presentation:class=
//    "title"` frame + a plain body text-box frame; the first slide also
//    carries speaker notes. Exercises the reader's title/body/notes
//    mapping (W2 FINDINGS §Axis 3 pptx/odp→md row, tier 1).
//  - `odp-media.odp` — 1 slide with NO title frame, one body paragraph, an
//    embedded `<draw:image>` frame, and speaker notes. Real-world
//    confirmation of `slides/untitled` + `slides/media-dropped` (detail
//    `image`) + `slides/notes-omitted` (`includeNotes:false`) all firing
//    together on one slide.
//
// Raw XML element nodes below use the exact shape `@awacloud/fw`'s xml codec
// produces (`{ type: 'element', name, attrs, children }` / `{ type: 'text',
// value }` — see `@awacloud/fw/io/codec/xml.js` `el()`/`text()`), which is the
// documented raw-passthrough shape `drawFrame.parseFrame()`/`slide.js`
// already round-trip through `_extras`/`notes.body`. No odf internals are
// reached into; `odp.write()` itself performs every byte of serialisation.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/odf';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'corpus', 'odp');

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const odp = runtime.resolve('odp');
const xml = runtime.resolve('xml');

/** @param {string} text raw `<text:p>` carrying one text run. */
function p(text) { return xml.el('text:p', {}, [xml.text(text)]); }

/** @param {string} text a `presentation:class="title"` text-box frame. */
function titleFrame(text) {
    return {
        type: 'frame',
        _extras: { attrs: { 'presentation:class': 'title' } },
        child: { kind: 'text-box', children: [p(text)] }
    };
}

/** @param {string[]} lines a plain (non-title) text-box frame, one `<text:p>` per line. */
function bodyFrame(...lines) {
    return { type: 'frame', child: { kind: 'text-box', children: lines.map(p) } };
}

/** @param {string} href an embedded-image frame — a real dropped-media node. */
function imageFrame(href) {
    return { type: 'frame', child: { kind: 'image', href } };
}

// --- odp-structured.odp -----------------------------------------------

const structured = {
    slides: [
        {
            type: 'slide', name: 'Slide1',
            frames: [
                titleFrame('Sovereign RAG Ingestion'),
                bodyFrame('Air-gapped by design', 'No egress, ever')
            ],
            notes: { body: [p('Remember to mention the offline chunker demo.')] }
        },
        {
            type: 'slide', name: 'Slide2',
            frames: [
                titleFrame('Why Air-Gap Matters'),
                bodyFrame('Data never leaves the perimeter.')
            ]
        }
    ]
};

// --- odp-media.odp -------------------------------------------------------

const media = {
    slides: [
        {
            type: 'slide', name: 'Slide1',
            frames: [
                bodyFrame('An untitled slide with an embedded picture.'),
                imageFrame('Pictures/100000000000012C.png')
            ],
            notes: { body: [p('Speaker note that includeNotes:false must omit.')] }
        }
    ]
};

// --- write + report ----------------------------------------------------

/** @param {string} name @param {object} doc */
function writeFixture(name, doc) {
    const bytes = odp.write(doc, { meta: { title: name, creator: '@awacloud/oconv fixture generator' } });
    const path = join(OUT_DIR, name);
    writeFileSync(path, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    console.log(`${name}\tbytes=${bytes.byteLength}\tsha256=${sha256}`);
}

writeFixture('odp-structured.odp', structured);
writeFixture('odp-media.odp', media);
