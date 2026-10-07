// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/tests/_fixtures/gen-pdf-text-spacing-forms.js
//
// ONE-SHOT generator for the FOUR committed first-party pdf fixtures read by
// `tests/pdf-text-spacing-forms.integration.test.js`
// (office/BATCH_43 task 02, BL-1576 glued-word spacing + BL-1577 Form
// XObject text). Run once, by hand, from the repo root:
//
//   bun packages/front/office/oconv/tests/_fixtures/gen-pdf-text-spacing-forms.js
//
// Kept in the repo for PROVENANCE ONLY (mirroring gen-pdf-tagged-fixture.js)
// — the test file reads the COMMITTED bytes under
// `tests/_fixtures/pdf-text-spacing-forms/` and never re-runs this script.
// Do not wire this into `bun test`. The output is deterministic: re-running
// it must reproduce the committed bytes exactly (it prints each sha256).
//
// Built entirely through `@awacloud/pdf`'s PUBLIC write surface: the
// typed-object constructors `pdfParser.obj` + the document writer via the
// `pdf.write({ indirects, root, version })` façade — no PDF bytes are
// hand-crafted and no `@awacloud/pdf` internal is reached (F8).
//
// The four fixtures (five scenarios — the plan caps the set at four files):
//   text-spacing.pdf       — S1 + S2 + S3 + the TJ-kern guard, four
//                            well-separated lines on one page.
//                            S1 uses /F1, a simple font with EXPLICIT
//                            `/Widths` + `/FirstChar`; S2/S3/TJ-kern use /F2,
//                            Standard-14 Helvetica WITHOUT `/Widths`.
//   form-xobject-text.pdf  — F1: page text + a Form XObject (own
//                            `/Resources`, non-identity `/Matrix`) drawn by
//                            `Do`, carrying its own text.
//   form-cycle.pdf         — F2 (cycle): a Form that draws itself.
//   form-deep-chain.pdf    — F2 (depth): a CHAIN_DEPTH-deep, non-cyclic
//                            chain of Forms. Split from the cycle so each
//                            guard's loss is attributable to its own fixture.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../../../pdf/src/main.js';

const rt = new ModuleRuntime();
rt.registerAll(fw_require);
rt.registerAll(pkg_require);
rt.registerAll(modules);

const pdf = rt.resolve('pdf');
const obj = rt.resolve('pdfParser').obj;
const enc = (s) => new TextEncoder().encode(s);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'pdf-text-spacing-forms');
mkdirSync(outDir, { recursive: true });

function write(name, bytes) {
    const outPath = join(outDir, name);
    writeFileSync(outPath, bytes);
    const sha = createHash('sha256').update(bytes).digest('hex');
    console.log(`wrote ${outPath}`);
    console.log(`  bytes: ${bytes.length}`);
    console.log(`  sha256: ${sha}`);
}

const CATALOG = 1, PAGES = 2, PAGE = 3, CONTENT = 4;

function catalogAndPages() {
    return [
        { num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) },
        { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) }
    ];
}

function page(resources) {
    return { num: PAGE, gen: 0, value: obj.dict({
        Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
        MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
        Contents: obj.ref(CONTENT, 0),
        Resources: resources
    }) };
}

function contentStream(text) {
    return { num: CONTENT, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(text.length) }), enc(text)) };
}

/** Standard-14 Helvetica, NO /Widths, NO /FirstChar — valid per spec for a base-14 font. */
function helvetica(num) {
    return { num, gen: 0, value: obj.dict({
        Type: obj.name('Font'), Subtype: obj.name('Type1'),
        BaseFont: obj.name('Helvetica'), Encoding: obj.name('WinAnsiEncoding')
    }) };
}

function writeDoc(name, indirects) {
    write(name, pdf.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' }));
}

// ---------------------------------------------------------------------------
// 1 — text-spacing.pdf (S1, S2, S3, TJ-kern guard)
// ---------------------------------------------------------------------------
{
    const FONT_WIDTHS = 5, FONT_S14 = 6;
    const content =
        // S1 — one word per `Tj`, positioned by `Td` (the ANSSI producer's
        // shape). /F1 has a flat 500/1000 em width, so at 12 pt every glyph
        // advances 6 units: "Il" ends at +12 and the next word starts at
        // +20, "constitue" ends at +54 (next +75), "une" at +18 (next +35),
        // "production" at +60 (next +90) — every inter-word gap is
        // 8..30 units, i.e. 0.67..2.5 em, a real gap, never an overlap.
        'BT\n/F1 12 Tf\n72 700 Td\n(Il) Tj\n20 0 Td\n(constitue) Tj\n' +
        '75 0 Td\n(une) Tj\n35 0 Td\n(production) Tj\n90 0 Td\n(originale) Tj\nET\n' +
        // S2 — glyph-by-glyph "Hello" with small kerning adjustments, none
        // reaching the -200 threshold: must NOT gain an inserted space.
        'BT /F2 12 Tf 72 600 Td [(H) -20 (e) -15 (l) 0 (l) 30 (o)] TJ ET\n' +
        // S3 — "Gamma " already carries its own trailing space glyph, THEN
        // a -250 kern gap: the space must not be doubled.
        'BT /F2 12 Tf 72 500 Td [(Gamma ) -250 (Delta)] TJ ET\n' +
        // TJ-kern guard — no pre-existing space, a -250 kern gap infers
        // exactly one space (existing, already-correct behaviour).
        'BT /F2 12 Tf 72 400 Td [(Alpha) -250 (Beta)] TJ ET\n';
    const FIRST_CHAR = 32, LAST_CHAR = 122;
    const widths = [];
    for (let c = FIRST_CHAR; c <= LAST_CHAR; c++) widths.push(obj.int(500));
    writeDoc('text-spacing.pdf', [
        ...catalogAndPages(),
        page(obj.dict({ Font: obj.dict({ F1: obj.ref(FONT_WIDTHS, 0), F2: obj.ref(FONT_S14, 0) }) })),
        contentStream(content),
        { num: FONT_WIDTHS, gen: 0, value: obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('Helvetica'), Encoding: obj.name('WinAnsiEncoding'),
            FirstChar: obj.int(FIRST_CHAR), LastChar: obj.int(LAST_CHAR),
            Widths: obj.array(widths)
        }) },
        helvetica(FONT_S14)
    ]);
}

// ---------------------------------------------------------------------------
// 2 — form-xobject-text.pdf (F1)
// ---------------------------------------------------------------------------
{
    const FONT = 5, FORM = 6;
    const pageContent = 'BT /F1 12 Tf 72 750 Td (Before form) Tj ET\n/Fm1 Do\n';
    const formContent = 'BT /F1 12 Tf 0 0 Td (Inside form) Tj ET\n';
    writeDoc('form-xobject-text.pdf', [
        ...catalogAndPages(),
        page(obj.dict({
            Font: obj.dict({ F1: obj.ref(FONT, 0) }),
            XObject: obj.dict({ Fm1: obj.ref(FORM, 0) })
        })),
        contentStream(pageContent),
        helvetica(FONT),
        { num: FORM, gen: 0, value: obj.stream(obj.dict({
            Type: obj.name('XObject'), Subtype: obj.name('Form'),
            BBox: obj.array([obj.int(0), obj.int(0), obj.int(200), obj.int(50)]),
            // Non-identity /Matrix (a 30-unit vertical translation) — the
            // form's text lands at (0, 30) in page space once the matrix is
            // concatenated onto the CTM.
            Matrix: obj.array([obj.real(1), obj.real(0), obj.real(0), obj.real(1), obj.real(0), obj.real(30)]),
            // The form's OWN /Resources (not inherited from the page).
            Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(FONT, 0) }) }),
            Length: obj.int(formContent.length)
        }), enc(formContent)) }
    ]);
}

// ---------------------------------------------------------------------------
// 3 — form-cycle.pdf (F2, cycle)
// ---------------------------------------------------------------------------
{
    const FONT = 5, FCYCLE = 6;
    const pageContent = 'BT /F1 12 Tf 72 750 Td (Page text) Tj ET\n/Fc Do\n';
    const formContent = '/Fc Do\n';
    writeDoc('form-cycle.pdf', [
        ...catalogAndPages(),
        page(obj.dict({
            Font: obj.dict({ F1: obj.ref(FONT, 0) }),
            XObject: obj.dict({ Fc: obj.ref(FCYCLE, 0) })
        })),
        contentStream(pageContent),
        helvetica(FONT),
        // A Form whose OWN /Resources/XObject names itself and whose content
        // stream draws itself — a true object-graph cycle.
        { num: FCYCLE, gen: 0, value: obj.stream(obj.dict({
            Type: obj.name('XObject'), Subtype: obj.name('Form'),
            BBox: obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]),
            Resources: obj.dict({ XObject: obj.dict({ Fc: obj.ref(FCYCLE, 0) }) }),
            Length: obj.int(formContent.length)
        }), enc(formContent)) }
    ]);
}

// ---------------------------------------------------------------------------
// 4 — form-deep-chain.pdf (F2, depth)
// ---------------------------------------------------------------------------
{
    const FONT = 5;
    // Beyond any sane recursion cap: a reader's depth guard must trip on
    // this chain, so its cap must be (well) below CHAIN_DEPTH.
    const CHAIN_DEPTH = 100;
    const CHAIN_BASE = 100; // object numbers CHAIN_BASE .. CHAIN_BASE + CHAIN_DEPTH - 1
    const pageContent = 'BT /F1 12 Tf 72 750 Td (Page text) Tj ET\n/Fn Do\n';
    const indirects = [
        ...catalogAndPages(),
        page(obj.dict({
            Font: obj.dict({ F1: obj.ref(FONT, 0) }),
            XObject: obj.dict({ Fn: obj.ref(CHAIN_BASE, 0) })
        })),
        contentStream(pageContent),
        helvetica(FONT)
    ];
    // Link i draws link i+1 through its own /Resources (every link names
    // its successor /Fn — a distinct object, so no cycle); the last link
    // draws nothing.
    for (let i = 0; i < CHAIN_DEPTH; i++) {
        const isLast = i === CHAIN_DEPTH - 1;
        const formContent = isLast ? '' : '/Fn Do\n';
        indirects.push({ num: CHAIN_BASE + i, gen: 0, value: obj.stream(obj.dict({
            Type: obj.name('XObject'), Subtype: obj.name('Form'),
            BBox: obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]),
            Resources: obj.dict({ XObject: isLast ? obj.dict({}) : obj.dict({ Fn: obj.ref(CHAIN_BASE + i + 1, 0) }) }),
            Length: obj.int(formContent.length)
        }), enc(formContent)) });
    }
    writeDoc('form-deep-chain.pdf', indirects);
}
