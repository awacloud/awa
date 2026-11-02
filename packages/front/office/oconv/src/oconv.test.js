// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from './main.js';
import { oconv } from './oconv.js';
import * as pdfPkg from '@awacloud/pdf';
// office/BATCH_38 task 05 — the defaultFaces-reaches-the-writer tests mine
// real embedded faces out of the vendored corpus, same recipe as
// `write/pdf/metrics.test.js` / `write/ir-to-pdf.test.js` (copied, not
// imported — `src/` never reaches into a PDF for a font, D-A).
import { pdfWriterRuntime, corpusBytes, CORPUS_PDF } from './write/pdf/_test-runtime.js';

// The committed first-party image assets (BL-980). Provenance:
// `tests/_fixtures/corpus/assets/PROVENANCE.md`.
const ASSET_DIR = fileURLToPath(new URL('../tests/_fixtures/corpus/assets/', import.meta.url));
const PX_PNG = new Uint8Array(readFileSync(`${ASSET_DIR}px.png`));
const PX_JPEG = new Uint8Array(readFileSync(`${ASSET_DIR}px.jpg`));

// One package-composed `ModuleRuntime` for the whole file — `main.js` (this
// package's own composition root) is exactly what a real consumer would
// build.
let oconvApi;
let docxApi;
let odtApi;
let textHeadingApi;
let xlsxApi;
let odsApi;
let pptxApi;
let odpApi;
let xmlApi;
// office/BATCH_33 task 07 — reading back the `pdf` target's own bytes.
let pdfReadApi;
// office/BATCH_45 task 02 (BL-1610) — building a Form-XObject pdf fixture.
let pdfObjApi;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.registerAll(fw_require);
    runtime.registerAll(modules);
    oconvApi = runtime.resolve('oconv');
    docxApi = runtime.resolve('docx');
    odtApi = runtime.resolve('odt');
    // Resolved directly (not through `odt`'s own convenience helpers, which
    // only expose `paragraph`/`fromText`) to build a heading node for the
    // odt fixture below — mirrors odt-to-ir.test.js's precedent of
    // resolving an odf submodule directly for fixture construction only.
    textHeadingApi = runtime.resolve('textHeading');
    // BATCH_14 W2 — the five new input formats.
    xlsxApi = runtime.resolve('xlsx');
    odsApi = runtime.resolve('ods');
    pptxApi = runtime.resolve('pptx');
    odpApi = runtime.resolve('odp');
    xmlApi = runtime.resolve('xml');
    pdfReadApi = runtime.resolve('pdf');
    pdfObjApi = runtime.resolve('pdfParser').obj;
});

const FIXED_AT = '2026-07-20T00:00:00Z';
// Committed first-party pdf fixture (tasks 05/06) — a raw byte-built pdf
// fixture is not worth hand-constructing here a second time; the tagged
// fast path exercises real headings + paragraphs + a struct/dropped loss.
const PDF_FIXTURE_PATH = new URL(
    '../tests/_fixtures/corpus/pdf-tagged/tagged-structured.pdf', import.meta.url
);

function docxFixtureBytes() {
    return docxApi.write({
        body: [
            docxApi.paragraph('Docx Title', { pPr: { pStyle: 'Heading1' } }),
            docxApi.paragraph('Hello from docx.')
        ]
    });
}

function odtFixtureBytes() {
    return odtApi.write({
        body: [
            textHeadingApi.heading('Odt Title', { outlineLevel: 1 }),
            odtApi.paragraph('Hello from odt.')
        ]
    });
}

function xlsxFixtureBytes() {
    return xlsxApi.write({ sheets: [{ name: 'Xlsx Sheet', rows: [['Hello from xlsx.']] }] });
}

function odsFixtureBytes() {
    return odsApi.write({
        spreadsheet: {
            tables: [{
                type: 'table', name: 'Ods Sheet', columns: [],
                rows: [{ type: 'row', cells: [odsApi.cell('Hello from ods.')] }]
            }]
        }
    });
}

function pptxFixtureBytes() {
    return pptxApi.write({
        slides: [{ shapes: [
            { type: 'shape', id: 2, placeholder: { type: 'title' },
              txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'Pptx Title' }] }] } },
            { type: 'shape', id: 3, name: 'Body',
              txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'Hello from pptx.' }] }] } }
        ] }]
    });
}

function odpFixtureBytes() {
    const p = (text) => xmlApi.el('text:p', {}, [xmlApi.text(text)]);
    return odpApi.write({
        slides: [{
            type: 'slide', name: 'Slide1',
            frames: [
                {
                    type: 'frame',
                    _extras: { attrs: { 'presentation:class': 'title' } },
                    child: { kind: 'text-box', children: [p('Odp Title')] }
                },
                { type: 'frame', child: { kind: 'text-box', children: [p('Hello from odp.')] } }
            ],
            notes: { body: [p('Speaker note.')] }
        }]
    });
}

function pdfFixtureBytes() {
    return new Uint8Array(readFileSync(PDF_FIXTURE_PATH));
}

/**
 * A one-page pdf whose page draws a Form XObject (4 operators: `q Q q Q`)
 * three times — built through the published `pdfParser.obj` + `pdf.write`
 * surfaces (BL-1610). Mirrors `read/pdf-to-ir.test.js`'s `genFormBudgetDoc`
 * (not imported — a src test fixture never imports a sibling test file).
 * With `formOpBudget: 5`: draw 1 runs (formOps 0 < 5) -> 4; draw 2 runs
 * (4 < 5) -> 8; draw 3 is skipped (8 >= 5), one `xobject/form-budget` loss.
 * The default budget (1,000,000) never trips on this fixture (12 form
 * operators total).
 */
function pdfFormBudgetFixtureBytes() {
    const obj = pdfObjApi;
    const CATALOG = 1, PAGES = 2, PAGE = 3, CONTENT = 4, FORM = 5;
    const pageContent = '/Fm Do /Fm Do /Fm Do\n';
    const formContent = 'q Q q Q\n';
    const enc = (s) => new TextEncoder().encode(s);
    const indirects = [
        { num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) },
        { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) },
        { num: PAGE, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(CONTENT, 0),
            Resources: obj.dict({ XObject: obj.dict({ Fm: obj.ref(FORM, 0) }) })
        }) },
        { num: CONTENT, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(pageContent.length) }), enc(pageContent)) },
        { num: FORM, gen: 0, value: obj.stream(obj.dict({
            Type: obj.name('XObject'), Subtype: obj.name('Form'),
            BBox: obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]),
            Length: obj.int(formContent.length)
        }), enc(formContent)) }
    ];
    return pdfReadApi.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });
}

// office/BATCH_26 task 04 EXTENDS this frozen surface additively (owner
// ruling 2, `ai/batches/types/office/BATCH_26/_RULINGS_20260824T120000.md`):
// `toMd`'s own behavior/result-shape stays byte-identical (proven by the
// unmodified `oconv.toMd —` describe blocks below), but the descriptor's
// `dependencies` array and the resolved instance's member set both grow by
// design — pinning the OLD (pre-extension) values here would assert a false
// fact about the now-intentionally-extended G1 surface. Re-measured, not
// weakened: both assertions are re-pinned to the new frozen shape.
//
// office/BATCH_33 task 07 extends `dependencies` ONE more entry
// (`oconvIrToPdf`, the `pdf` target). Same discipline, same reasoning: an
// exhaustive `toEqual` is broken by ANY addition by construction, so it is
// RE-MEASURED and stays exhaustive (never relaxed to `toContain`) — and the
// FACADE KEY SET is deliberately left at exactly `['fromMd', 'toMd']`, which
// the added target does not touch.
describe('oconv — descriptor (frozen, extended G1+G-fromMd+G-convert surface)', () => {
    test('name/dependencies are exactly the frozen list — convert adds no dependency, the pair is wiring', () => {
        expect(oconv.name).toBe('oconv');
        expect(oconv.dependencies).toEqual([
            'oconvIr', 'oconvDocxToIr', 'oconvOdtToIr', 'oconvXlsxToIr',
            'oconvOdsToIr', 'oconvPptxToIr', 'oconvOdpToIr', 'oconvPdfToIr',
            'oconvIrToMd',
            'docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp', 'pdf',
            'md', 'mdNode',
            'oconvMdToIr', 'oconvIrToDocx', 'oconvIrToOdt', 'oconvIrToPdf',
            'pdfLegacyRc4Read', 'pdfInfo', 'pdfXmpExtended', 'pdfFilterDispatch', 'opcCoreProperties'
        ]);
    });

    test('the resolved instance exposes exactly `toMd`, `fromMd` and `convert`', () => {
        expect(Object.keys(oconvApi).sort()).toEqual(['convert', 'fromMd', 'toMd']);
        expect(typeof oconvApi.toMd).toBe('function');
        expect(typeof oconvApi.fromMd).toBe('function');
        expect(typeof oconvApi.convert).toBe('function');
    });
});

describe('oconv.toMd — contract errors', () => {
    test('throws when convertedAt is omitted (no Date.now() default)', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.toMd({ name: 'x.docx', bytes })).rejects.toThrow(
            /oconv: convertedAt is required/
        );
    });

    test('throws on an unresolvable format (unknown extension, no explicit format)', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.toMd({
            name: 'x.rtf', bytes, convertedAt: FIXED_AT
        })).rejects.toThrow(/oconv: unsupported format/);
    });

    test('throws on an explicit but unsupported format', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.toMd({
            name: 'x.docx', bytes, format: 'rtf', convertedAt: FIXED_AT
        })).rejects.toThrow(/oconv: unsupported format/);
    });
});

describe('oconv.toMd — docx end to end', () => {
    let result;

    beforeAll(async () => {
        const bytes = docxFixtureBytes();
        result = await oconvApi.toMd({ name: 'report.docx', bytes, convertedAt: FIXED_AT, engine: 'bun' });
    });

    test('produces profile-v1 front matter with the right provenance', () => {
        expect(result.markdown).toStartWith('---\n');
        expect(result.markdown).toContain('profile: v1');
        expect(result.markdown).toContain('ir: oconv-ir/v1');
        expect(result.markdown).toContain('sourceFormat: docx');
        expect(result.markdown).toContain('sourceName: report.docx');
        expect(result.markdown).toContain('convertedAt: ' + FIXED_AT);
        expect(result.markdown).toContain('converter: oconv');
        expect(result.markdown).toContain('engine: bun');
        expect(result.markdown).toMatch(/sourceSha256: [0-9a-f]{64}/);
    });

    test('renders the body via the frozen writer', () => {
        expect(result.markdown).toContain('# Docx Title');
        expect(result.markdown).toContain('Hello from docx.');
    });

    test('returns the frozen result shape', () => {
        expect(Array.isArray(result.anchors)).toBe(true);
        expect(result.anchors).toEqual([{ level: 1, anchor: 'docx-title' }]);
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
        expect(Array.isArray(result.assets)).toBe(true);
        expect(typeof result.ms).toBe('number');
        expect(result.ms).toBeGreaterThanOrEqual(0);
    });

    test('is byte-stable for identical bytes + convertedAt', async () => {
        const bytes = docxFixtureBytes();
        const again = await oconvApi.toMd({ name: 'report.docx', bytes, convertedAt: FIXED_AT, engine: 'bun' });
        expect(again.markdown).toBe(result.markdown);
    });
});

describe('oconv.toMd — odt end to end', () => {
    let result;

    beforeAll(async () => {
        const bytes = odtFixtureBytes();
        result = await oconvApi.toMd({ name: 'report.odt', bytes, convertedAt: FIXED_AT });
    });

    test('produces profile-v1 front matter for odt', () => {
        expect(result.markdown).toContain('sourceFormat: odt');
        expect(result.markdown).toContain('sourceName: report.odt');
        expect(result.markdown).toMatch(/sourceSha256: [0-9a-f]{64}/);
        // `engine` was omitted from the call — never invented in the front matter.
        expect(result.markdown).not.toContain('engine:');
    });

    test('renders the body via the frozen writer', () => {
        expect(result.markdown).toContain('# Odt Title');
        expect(result.markdown).toContain('Hello from odt.');
    });
});

describe('oconv.toMd — an odt cross-reference keeps its text (A45a)', () => {
    test('a paragraph-level text:reference-ref is written in place', async () => {
        const bytes = odtApi.write({ body: [{ type: 'paragraph', runs: [
            { type: 'text', value: 'See ' },
            xmlApi.el('text:reference-ref', { 'text:ref-name': 's43' }, [xmlApi.text('4.3')]),
            { type: 'text', value: ' below.' }
        ] }] });
        const r = await oconvApi.toMd({ name: 'x.odt', bytes, convertedAt: FIXED_AT });
        expect(r.markdown).toContain('See 4.3 below.');
        expect(r.markdown).toContain('inline/flattened');
    });
});

describe('oconv.toMd — an odt heading shows its outline number (A45c)', () => {
    test('the number leads the heading text and its anchor', async () => {
        const level = (lvl, attrs) => xmlApi.el('text:outline-level-style', { 'text:level': String(lvl), ...attrs }, []);
        const bytes = odtApi.write({
            styles: { styles: [xmlApi.el('text:outline-style', { 'style:name': 'Outline' }, [
                level(1, { 'style:num-format': '1' }),
                level(2, { 'style:num-format': '1', 'text:display-levels': '2' })
            ])], automaticStyles: [], masterStyles: [] },
            body: [
                { type: 'heading', outlineLevel: 1, runs: [{ type: 'text', value: 'Introduction' }] },
                { type: 'heading', outlineLevel: 2, runs: [{ type: 'text', value: 'Normative References' }] }
            ]
        });
        const r = await oconvApi.toMd({ name: 'x.odt', bytes, convertedAt: FIXED_AT });
        expect(r.markdown).toContain('# 1 Introduction\n');
        expect(r.markdown).toContain('## 1.1 Normative References\n');
        expect(r.anchors.map((a) => a.anchor)).toEqual(['1-introduction', '1-1-normative-references']);
    });
});

describe('oconv.toMd — sheets (A58)', () => {
    const rows = [['Species', 'Count, 2024'], ['Alcedo "atthis"', '12'], ['Tab\there', '3']];
    const xlsxBytes = () => xlsxApi.write({ sheets: [{ name: 'Atlas', rows }] });
    const odsBytes = () => odsApi.write({ spreadsheet: { tables: [{
        type: 'table', name: 'Atlas', columns: [],
        rows: rows.map((r) => ({ type: 'row', cells: r.map((v) => odsApi.cell(v)) }))
    }] } });

    test("'csv' and 'tsv' write each sheet as a fenced block, from xlsx and from ods", async () => {
        for (const [name, bytes] of [['a.xlsx', xlsxBytes()], ['a.ods', odsBytes()]]) {
            const csv = await oconvApi.toMd({ name, bytes, convertedAt: FIXED_AT, sheets: 'csv' });
            expect(csv.markdown).toContain('# Atlas\n\n```csv\nSpecies,"Count, 2024"\n"Alcedo ""atthis""",12\nTab\there,3\n```\n');
            const tsv = await oconvApi.toMd({ name, bytes, convertedAt: FIXED_AT, sheets: 'tsv' });
            expect(tsv.markdown).toContain('```tsv\nSpecies\tCount, 2024\nAlcedo "atthis"\t12\nTab\\there\t3\n```\n');
            expect(tsv.losses).toContainEqual({ code: 'sheet/tsv-escaped', detail: 'Atlas' });
            const table = await oconvApi.toMd({ name, bytes, convertedAt: FIXED_AT });
            expect(table.markdown).toContain('| Species |');
            expect((await oconvApi.toMd({ name, bytes, convertedAt: FIXED_AT, sheets: 'table' })).markdown).toBe(table.markdown);
        }
    });

    test('a bad value or another format throws', async () => {
        await expect(oconvApi.toMd({ name: 'a.xlsx', bytes: xlsxBytes(), convertedAt: FIXED_AT, sheets: 'json' }))
            .rejects.toThrow('oconv: bad sheets');
        await expect(oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, sheets: 'csv' }))
            .rejects.toThrow('oconv: sheets needs format xlsx or ods');
    });
});

describe('oconv.toMd — odtInclude (A45b)', () => {
    const tocBytes = () => odtApi.write({ body: [{ type: 'unknown', element: xmlApi.el('text:table-of-content', {}, [
        xmlApi.el('text:index-body', {}, [xmlApi.el('text:p', {}, [xmlApi.text('1 Introduction'), xmlApi.el('text:tab', {}, []), xmlApi.text('7')])])
    ]) }] });

    test("['toc'] reaches the odt reader; absent, the table of contents is dropped", async () => {
        const on = await oconvApi.toMd({ name: 'x.odt', bytes: tocBytes(), convertedAt: FIXED_AT, odtInclude: ['toc'] });
        expect(on.markdown).toContain('\n1 Introduction 7\n');
        expect(on.lossy).toBe(false);
        const off = await oconvApi.toMd({ name: 'x.odt', bytes: tocBytes(), convertedAt: FIXED_AT });
        expect(off.markdown).not.toContain('Introduction');
        expect(off.losses).toEqual([{ code: 'block/dropped', detail: 'text:table-of-content' }]);
    });

    test('a bad value or another format throws', async () => {
        await expect(oconvApi.toMd({ name: 'x.odt', bytes: tocBytes(), convertedAt: FIXED_AT, odtInclude: ['index'] }))
            .rejects.toThrow('oconv: bad odt include');
        await expect(oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, odtInclude: ['toc'] }))
            .rejects.toThrow('oconv: odt include needs format odt');
    });
});

describe('oconv.toMd — docxInclude (T59 e)', () => {
    const tocBytes = () => docxApi.write({ body: [
        { type: 'blockSdt', properties: { _extras: [xmlApi.el('w:docPartObj', {}, [xmlApi.el('w:docPartGallery', { 'w:val': 'Table of Contents' })])] },
            children: [docxApi.paragraph('1 Introduction\t7')] }
    ] });

    test("['toc'] reaches the docx reader; absent, the table of contents is dropped", async () => {
        const on = await oconvApi.toMd({ name: 'x.docx', bytes: tocBytes(), convertedAt: FIXED_AT, docxInclude: ['toc'] });
        expect(on.markdown).toContain('\n1 Introduction 7\n');
        expect(on.lossy).toBe(false);
        const off = await oconvApi.toMd({ name: 'x.docx', bytes: tocBytes(), convertedAt: FIXED_AT });
        expect(off.markdown).not.toContain('Introduction');
        expect(off.losses).toEqual([{ code: 'block/dropped', detail: 'toc' }]);
    });

    test('a bad value or another format throws', async () => {
        await expect(oconvApi.toMd({ name: 'x.docx', bytes: tocBytes(), convertedAt: FIXED_AT, docxInclude: ['index'] }))
            .rejects.toThrow('oconv: bad docx include');
        await expect(oconvApi.toMd({ name: 'x.odt', bytes: odtFixtureBytes(), convertedAt: FIXED_AT, docxInclude: ['toc'] }))
            .rejects.toThrow('oconv: docx include needs format docx');
    });
});

describe('oconv.toMd — opts.frontMatter reaches the writer (A46)', () => {
    test("'none' returns the body alone", async () => {
        const r = await oconvApi.toMd({ name: 'report.odt', bytes: odtFixtureBytes(), convertedAt: FIXED_AT, opts: { frontMatter: 'none' } });
        expect(r.markdown.startsWith('# Odt Title')).toBe(true);
    });
});

// BATCH_14 W2 (task 06) — the five new input formats through the SAME
// frozen `toMd` facade (dispatch correctness; per-fixture loss/tier depth
// is the fidelity harness's job, `tests/fidelity.integration.test.js`).
describe('oconv.toMd — xlsx end to end (W2 dispatch)', () => {
    test('routes xlsx.read() through oconvXlsxToIr and produces profile-v1 output', async () => {
        const bytes = xlsxFixtureBytes();
        const result = await oconvApi.toMd({ name: 'report.xlsx', bytes, convertedAt: FIXED_AT });

        expect(result.markdown).toContain('sourceFormat: xlsx');
        expect(result.markdown).toContain('# Xlsx Sheet');
        expect(result.markdown).toContain('Hello from xlsx.');
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
    });
});

describe('oconv.toMd — ods end to end (W2 dispatch)', () => {
    test('routes ods.read() through oconvOdsToIr and produces profile-v1 output', async () => {
        const bytes = odsFixtureBytes();
        const result = await oconvApi.toMd({ name: 'report.ods', bytes, convertedAt: FIXED_AT });

        expect(result.markdown).toContain('sourceFormat: ods');
        expect(result.markdown).toContain('# Ods Sheet');
        expect(result.markdown).toContain('Hello from ods.');
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
    });
});

describe('oconv.toMd — pptx end to end (W2 dispatch)', () => {
    test('routes pptx.read() through oconvPptxToIr and produces profile-v1 output', async () => {
        const bytes = pptxFixtureBytes();
        const result = await oconvApi.toMd({ name: 'report.pptx', bytes, convertedAt: FIXED_AT });

        expect(result.markdown).toContain('sourceFormat: pptx');
        expect(result.markdown).toContain('## Pptx Title');
        expect(result.markdown).toContain('Hello from pptx.');
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
    });
});

describe('oconv.toMd — odp end to end (W2 dispatch + includeNotes)', () => {
    test('routes odp.read() through oconvOdpToIr; includeNotes:false (default) records slides/notes-omitted', async () => {
        const bytes = odpFixtureBytes();
        const result = await oconvApi.toMd({ name: 'report.odp', bytes, convertedAt: FIXED_AT });

        expect(result.markdown).toContain('sourceFormat: odp');
        expect(result.markdown).toContain('## Odp Title');
        expect(result.markdown).toContain('Hello from odp.');
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([{ code: 'slides/notes-omitted', detail: '' }]);
        expect(result.markdown).not.toContain('Speaker note.');
    });

    test('includeNotes:true threads through to the reader — the note is rendered, no loss recorded', async () => {
        const bytes = odpFixtureBytes();
        const result = await oconvApi.toMd({
            name: 'report.odp', bytes, convertedAt: FIXED_AT, includeNotes: true
        });

        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
        expect(result.markdown).toContain('Speaker note.');
    });
});

describe('oconv.toMd — pdf end to end (W2 dispatch)', () => {
    test('routes pdf.read() through oconvPdfToIr (tagged fast path) and does not thread coverage into the frozen result shape', async () => {
        const bytes = pdfFixtureBytes();
        const result = await oconvApi.toMd({ name: 'report.pdf', bytes, convertedAt: FIXED_AT });

        expect(result.markdown).toContain('sourceFormat: pdf');
        expect(result.markdown).toContain('# Quarterly Report');
        expect(result.markdown).toContain('## Details');
        expect(result.lossy).toBe(true);
        expect(result.losses).toEqual([{ code: 'struct/dropped', detail: 'Table' }]);
        // Frozen G1 result shape — no `coverage` key ever leaks through.
        expect(Object.keys(result).sort()).toEqual(
            ['anchors', 'assets', 'losses', 'lossy', 'markdown', 'ms'].sort()
        );
    });

    // includeNotes is pptx/odp-only — a pdf call ignores it silently rather
    // than erroring, since it is not part of pdf's own reader signature.
    test('includeNotes is a harmless no-op for pdf', async () => {
        const bytes = pdfFixtureBytes();
        const withNotes = await oconvApi.toMd({
            name: 'report.pdf', bytes, convertedAt: FIXED_AT, includeNotes: true
        });
        const withoutNotes = await oconvApi.toMd({
            name: 'report.pdf', bytes, convertedAt: FIXED_AT
        });
        expect(withNotes.markdown).toBe(withoutNotes.markdown);
    });
});

describe('oconv.toMd — format detection', () => {
    test('detects docx/odt from a case-insensitive extension', async () => {
        const docxBytes = docxFixtureBytes();
        const odtBytes = odtFixtureBytes();
        const docxResult = await oconvApi.toMd({
            name: 'UPPER.DOCX', bytes: docxBytes, convertedAt: FIXED_AT
        });
        const odtResult = await oconvApi.toMd({
            name: 'UPPER.ODT', bytes: odtBytes, convertedAt: FIXED_AT
        });
        expect(docxResult.markdown).toContain('sourceFormat: docx');
        expect(odtResult.markdown).toContain('sourceFormat: odt');
    });

    test('detects the five W2 formats from a case-insensitive extension', async () => {
        const cases = [
            ['UPPER.XLSX', xlsxFixtureBytes(), 'xlsx'],
            ['UPPER.ODS', odsFixtureBytes(), 'ods'],
            ['UPPER.PPTX', pptxFixtureBytes(), 'pptx'],
            ['UPPER.ODP', odpFixtureBytes(), 'odp'],
            ['UPPER.PDF', pdfFixtureBytes(), 'pdf']
        ];
        for (const [name, bytes, format] of cases) {
            const result = await oconvApi.toMd({ name, bytes, convertedAt: FIXED_AT });
            expect(result.markdown).toContain(`sourceFormat: ${format}`);
        }
    });

    test('an explicit format wins over the extension', async () => {
        const bytes = docxFixtureBytes();
        const result = await oconvApi.toMd({
            name: 'misnamed.bin', bytes, format: 'docx', convertedAt: FIXED_AT
        });
        expect(result.markdown).toContain('sourceFormat: docx');
    });
});

describe('oconv.toMd — formOpBudget (BL-1610)', () => {
    test('a small formOpBudget changes the ledger: records xobject/form-budget where the default call does not', async () => {
        const bytes = pdfFormBudgetFixtureBytes();
        const withDefault = await oconvApi.toMd({ name: 'x.pdf', bytes, convertedAt: FIXED_AT });
        const withSmallBudget = await oconvApi.toMd({
            name: 'x.pdf', bytes, convertedAt: FIXED_AT, formOpBudget: 5
        });
        expect(withDefault.losses).not.toContainEqual(
            expect.objectContaining({ code: 'xobject/form-budget' })
        );
        expect(withSmallBudget.losses).toContainEqual({ code: 'xobject/form-budget', detail: 'Fm' });
    });

    test('throws `oconv: form op budget needs format pdf` for a non-pdf source', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.toMd({
            name: 'x.docx', bytes, convertedAt: FIXED_AT, formOpBudget: 5
        })).rejects.toThrow('oconv: form op budget needs format pdf');
    });

    test('a bad value on a pdf call is refused by the reader (`oconv: bad form op budget`)', async () => {
        const bytes = pdfFixtureBytes();
        await expect(oconvApi.toMd({
            name: 'x.pdf', bytes, convertedAt: FIXED_AT, formOpBudget: 0
        })).rejects.toThrow('oconv: bad form op budget');
    });

    test('a call without the field produces byte-identical markdown to today', async () => {
        const bytes = pdfFixtureBytes();
        const without = await oconvApi.toMd({ name: 'report.pdf', bytes, convertedAt: FIXED_AT });
        const withUndefined = await oconvApi.toMd({
            name: 'report.pdf', bytes, convertedAt: FIXED_AT, formOpBudget: undefined
        });
        expect(withUndefined.markdown).toBe(without.markdown);
    });
});

describe('oconv.toMd — pdfInfer (A13a)', () => {
    /** One untagged page, Standard 14 Helvetica: a 20 pt title over 11 pt body text. */
    function headingFixtureBytes() {
        const obj = pdfObjApi;
        const enc = (s) => new TextEncoder().encode(s);
        const content = 'BT /F1 20 Tf 72 740 Td (Main Title) Tj ET\nBT /F1 11 Tf 72 700 Td (Body text under it.) Tj ET\n';
        const indirects = [
            { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
            { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
            { num: 3, gen: 0, value: obj.dict({
                Type: obj.name('Page'), Parent: obj.ref(2, 0),
                MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(4, 0), Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(5, 0) }) })
            }) },
            { num: 4, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
            { num: 5, gen: 0, value: obj.dict({ Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name('Helvetica') }) }
        ];
        return pdfReadApi.write({ indirects, root: { num: 1, gen: 0 }, version: '1.7' });
    }

    test("pdfInfer: ['headings'] turns the title into a Markdown heading", async () => {
        const bytes = headingFixtureBytes();
        const r = await oconvApi.toMd({ name: 'h.pdf', bytes, convertedAt: FIXED_AT, pdfInfer: ['headings'] });
        expect(r.markdown).toContain('# Main Title');
        const plain = await oconvApi.toMd({ name: 'h.pdf', bytes, convertedAt: FIXED_AT });
        expect(plain.markdown).not.toContain('# Main Title');
    });

    test("pdfInfer: ['tables'] writes an aligned block as a GFM table", async () => {
        const obj = pdfObjApi;
        const enc = (s) => new TextEncoder().encode(s);
        const show = (x, y, t) => `BT /F1 11 Tf ${x} ${y} Td (${t}) Tj ET\n`;
        const content = show(72, 700, 'Item') + show(200, 700, 'Qty') + show(72, 686, 'Apples') + show(200, 686, '12');
        const indirects = [
            { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
            { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
            { num: 3, gen: 0, value: obj.dict({
                Type: obj.name('Page'), Parent: obj.ref(2, 0),
                MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(4, 0), Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(5, 0) }) })
            }) },
            { num: 4, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
            { num: 5, gen: 0, value: obj.dict({ Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name('Helvetica') }) }
        ];
        const bytes = pdfReadApi.write({ indirects, root: { num: 1, gen: 0 }, version: '1.7' });
        const r = await oconvApi.toMd({ name: 't.pdf', bytes, convertedAt: FIXED_AT, pdfInfer: ['tables'] });
        expect(r.markdown).toMatch(/\| Item \| Qty \|/);
        expect(r.markdown).toMatch(/\| Apples \| 12 \|/);
    });

    test('throws `oconv: pdf infer needs format pdf` for a non-pdf source', async () => {
        await expect(oconvApi.toMd({
            name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, pdfInfer: ['headings']
        })).rejects.toThrow('oconv: pdf infer needs format pdf');
    });

    test('a bad value on a pdf call is refused (`oconv: bad pdf infer`)', async () => {
        await expect(oconvApi.toMd({
            name: 'x.pdf', bytes: pdfFixtureBytes(), convertedAt: FIXED_AT, pdfInfer: 'headings'
        })).rejects.toThrow('oconv: bad pdf infer');
    });

    test('a call without the field, or with an empty list, produces byte-identical markdown', async () => {
        const bytes = pdfFixtureBytes();
        const without = await oconvApi.toMd({ name: 'report.pdf', bytes, convertedAt: FIXED_AT });
        for (const pdfInfer of [undefined, []]) {
            const r = await oconvApi.toMd({ name: 'report.pdf', bytes, convertedAt: FIXED_AT, pdfInfer });
            expect(r.markdown).toBe(without.markdown);
        }
    });
});

describe('oconv.toMd — pdfDeclare (A44a)', () => {
    /** One untagged page, Standard 14 Helvetica, one line of text. */
    function untaggedBytes() {
        const obj = pdfObjApi;
        const enc = (s) => new TextEncoder().encode(s);
        const content = 'BT /F1 11 Tf 72 700 Td (Plain untagged text.) Tj ET\n';
        const indirects = [
            { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
            { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
            { num: 3, gen: 0, value: obj.dict({
                Type: obj.name('Page'), Parent: obj.ref(2, 0),
                MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(4, 0), Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(5, 0) }) })
            }) },
            { num: 4, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
            { num: 5, gen: 0, value: obj.dict({ Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name('Helvetica') }) }
        ];
        return pdfReadApi.write({ indirects, root: { num: 1, gen: 0 }, version: '1.7' });
    }

    test("pdfDeclare: ['positional'] makes an untagged read lossy, the code in the front matter", async () => {
        const bytes = untaggedBytes();
        const plain = await oconvApi.toMd({ name: 'u.pdf', bytes, convertedAt: FIXED_AT });
        expect(plain.lossy).toBe(false);
        const r = await oconvApi.toMd({ name: 'u.pdf', bytes, convertedAt: FIXED_AT, pdfDeclare: ['positional'] });
        expect(r.lossy).toBe(true);
        expect(r.markdown).toContain('struct/positional');
        const both = await oconvApi.toMd({ name: 'u.pdf', bytes, convertedAt: FIXED_AT, pdfDeclare: ['positional'], pdfInfer: ['headings'] });
        expect(both.markdown).toContain('paragraphs, headings');
    });

    test('throws `oconv: pdf declare needs format pdf` for a non-pdf source', async () => {
        await expect(oconvApi.toMd({
            name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, pdfDeclare: ['positional']
        })).rejects.toThrow('oconv: pdf declare needs format pdf');
    });

    test('a bad value on a pdf call is refused (`oconv: bad pdf declare`)', async () => {
        await expect(oconvApi.toMd({
            name: 'x.pdf', bytes: pdfFixtureBytes(), convertedAt: FIXED_AT, pdfDeclare: 'positional'
        })).rejects.toThrow('oconv: bad pdf declare');
    });

    test('a call without the field, or with an empty list, produces byte-identical markdown', async () => {
        const bytes = untaggedBytes();
        const without = await oconvApi.toMd({ name: 'u.pdf', bytes, convertedAt: FIXED_AT });
        for (const pdfDeclare of [undefined, []]) {
            const r = await oconvApi.toMd({ name: 'u.pdf', bytes, convertedAt: FIXED_AT, pdfDeclare });
            expect(r.markdown).toBe(without.markdown);
        }
    });
});

// office/BATCH_26 task 04 — `oconv.fromMd` (write direction). `toMd`'s own
// describe blocks above are unmodified — this section only ADDS coverage.
describe('oconv.fromMd — contract errors', () => {
    test('throws when markdown is missing', async () => {
        await expect(oconvApi.fromMd({ name: 'x.docx' })).rejects.toThrow(
            /oconv: markdown is required/
        );
    });

    test('throws when markdown is not a string', async () => {
        await expect(oconvApi.fromMd({ name: 'x.docx', markdown: 42 })).rejects.toThrow(
            /oconv: markdown is required/
        );
    });

    test('throws when neither target nor a resolvable name extension is given', async () => {
        await expect(oconvApi.fromMd({ markdown: '# T' })).rejects.toThrow(
            /oconv: unsupported target/
        );
    });

    test('throws on an unresolvable name extension with no explicit target', async () => {
        await expect(oconvApi.fromMd({ markdown: '# T', name: 'x.rtf' })).rejects.toThrow(
            /oconv: unsupported target/
        );
    });
});

describe('oconv.fromMd — target resolution', () => {
    test('an explicit target wins over a contradicting name extension', async () => {
        const result = await oconvApi.fromMd({
            markdown: '# T\n\nBody.', name: 'x.docx', target: 'odt'
        });
        expect(result.target).toBe('odt');
        // odt.read() on the produced bytes proves the odt writer actually ran.
        expect(odtApi.read(result.bytes).body[0].type).toBe('heading');
    });

    test('name extension resolution is case-insensitive', async () => {
        const result = await oconvApi.fromMd({ markdown: '# T', name: 'out.ODT' });
        expect(result.target).toBe('odt');
    });
});

describe('oconv.fromMd — docx end to end', () => {
    test('a heading + paragraph survive through docx.read', async () => {
        const result = await oconvApi.fromMd({
            markdown: '# Title\n\nHello from markdown.', name: 'out.docx'
        });
        expect(result.target).toBe('docx');
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
        expect(typeof result.ms).toBe('number');
        expect(result.ms).toBeGreaterThanOrEqual(0);

        const read = docxApi.read(result.bytes);
        expect(read.document.body[0].pPr.pStyle).toBe('Heading1');
        expect(read.document.body[0].children[0].children[0].value).toBe('Title');
        expect(read.document.body[1].type).toBe('paragraph');
        expect(read.document.body[1].children[0].children[0].value)
            .toBe('Hello from markdown.');
    });
});

describe('oconv.fromMd — odt end to end', () => {
    test('a heading + paragraph survive through odt.read', async () => {
        const result = await oconvApi.fromMd({
            markdown: '# Title\n\nHello from markdown.', name: 'out.odt'
        });
        expect(result.target).toBe('odt');
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);

        const read = odtApi.read(result.bytes);
        expect(read.body[0].type).toBe('heading');
        expect(read.body[0].outlineLevel).toBe(1);
        expect(read.body[0].runs).toEqual([{ type: 'text', value: 'Title' }]);
        expect(read.body[1].type).toBe('paragraph');
        expect(read.body[1].runs).toEqual([{ type: 'text', value: 'Hello from markdown.' }]);
    });
});

describe('oconv.fromMd — losses merged reader-then-writer (order falsification)', () => {
    // office/BATCH_27/06 retired `link/target-unwritable`: a link is now written
    // as a typed `text:a` run, so it is no longer a writer loss. The subject of
    // this test is the MERGE ORDER, not that particular code — it is re-pinned onto
    // `block/dropped` (`hr`), which remains an odt writer loss, and the link is
    // now asserted to survive with its target intact.
    test('a front-matter block AND an image without bytes produce reader loss THEN writer loss, in that order', async () => {
        const markdown = [
            '---',
            'title: x',
            '---',
            '[click here](http://example.com)',
            '',
            '![a](missing.png)',
            ''
        ].join('\n');

        const result = await oconvApi.fromMd({ markdown, target: 'odt' });

        expect(result.lossy).toBe(true);
        expect(result.losses[0]).toEqual({ code: 'frontmatter/stripped', detail: 'yaml' });
        expect(result.losses.some(l => l.code === 'image/placeholder' && l.detail === 'missing.png')).toBe(true);
        // Reader loss precedes the writer loss — the merge order the plan prescribes.
        const frontmatterIdx = result.losses.findIndex(l => l.code === 'frontmatter/stripped');
        const imageIdx = result.losses.findIndex(l => l.code === 'image/placeholder');
        expect(frontmatterIdx).toBeLessThan(imageIdx);

        // The link is no longer a loss at all (GAP-ODF-4, closed by BATCH_27/02+06).
        expect(result.losses.some(l => l.code === 'link/target-unwritable')).toBe(false);

        // odt.read() proves the link round-trips as a typed link run, target kept.
        const read = odtApi.read(result.bytes);
        const linkRun = read.body.flatMap(n => n.runs || []).find(r => r.type === 'link');
        expect(linkRun).toBeDefined();
        expect(linkRun.href).toBe('http://example.com');
    });
});

// office/BATCH_33 task 07 — the `pdf` target of `fromMd` (write direction).
// Additive again: every `docx`/`odt` assertion above runs unedited.
describe('oconv.fromMd — pdf target', () => {
    test('resolves via an explicit `target` and via a `.pdf` name, case-insensitively', async () => {
        const byTarget = await oconvApi.fromMd({ markdown: '# T\n\nBody.', target: 'pdf' });
        expect(byTarget.target).toBe('pdf');
        const byName = await oconvApi.fromMd({ markdown: '# T\n\nBody.', name: 'out.PDF' });
        expect(byName.target).toBe('pdf');
    });

    test('produces bytes `pdf.read` parses, with the frozen result shape', async () => {
        const result = await oconvApi.fromMd({
            markdown: '# Title\n\nA paragraph of prose.\n',
            name: 'out.pdf'
        });
        expect(Object.keys(result).sort())
            .toEqual(['bytes', 'losses', 'lossy', 'ms', 'target']);
        expect(result.target).toBe('pdf');
        expect(result.lossy).toBe(false);
        expect(result.losses).toEqual([]);
        expect(typeof result.ms).toBe('number');
        expect(result.bytes).toBeInstanceOf(Uint8Array);

        const doc = pdfReadApi.read(result.bytes);
        expect(doc.pages.length).toBe(1);
    });

    test('the round trip through the delivered toMd pdf path recovers the text', async () => {
        const written = await oconvApi.fromMd({
            markdown: 'Alpha beta gamma delta.\n', target: 'pdf'
        });
        const back = await oconvApi.toMd({
            bytes: written.bytes, format: 'pdf', name: 'rt.pdf',
            convertedAt: '2026-09-02T00:00:00Z'
        });
        expect(back.losses).toEqual([]);
        expect(back.markdown).toContain('Alpha beta gamma delta.');
    });

    test('`opts.pdf` is forwarded to the writer', async () => {
        const a = await oconvApi.fromMd({
            markdown: 'One line.', target: 'pdf', opts: { pdf: { pageNumbers: true } }
        });
        const b = await oconvApi.fromMd({
            markdown: 'One line.', target: 'pdf', opts: { pdf: { pageNumbers: false } }
        });
        expect(b.bytes.length).toBeLessThan(a.bytes.length);
    });

    test('`opts.pdf` for a docx/odt target throws instead of being silently ignored', async () => {
        await expect(oconvApi.fromMd({
            markdown: '# T', target: 'docx', opts: { pdf: { margin: 10 } }
        })).rejects.toThrow('oconv: pdf options need target pdf');
        await expect(oconvApi.fromMd({
            markdown: '# T', target: 'odt', opts: { pdf: {} }
        })).rejects.toThrow('oconv: pdf options need target pdf');
    });

    test('an invalid `opts.pdf` key throws the box validator\'s own error (D-C, one validator)', async () => {
        await expect(oconvApi.fromMd({
            markdown: '# T', target: 'pdf', opts: { pdf: { nope: 1 } }
        })).rejects.toThrow('oconv: bad pdf option nope');
    });

    test('the pdf target is byte-reproducible across two calls', async () => {
        const a = await oconvApi.fromMd({ markdown: '# T\n\nBody.', target: 'pdf' });
        const b = await oconvApi.fromMd({ markdown: '# T\n\nBody.', target: 'pdf' });
        expect(a.bytes.length).toBe(b.bytes.length);
        expect(a.bytes.every((v, i) => v === b.bytes[i])).toBe(true);
    });

    // The docx target is byte-reproducible: `@awacloud/ooxml` stamps every zip
    // entry with a fixed 1980-01-01 00:00 timestamp. The odt target is not
    // (the ODF package writer stamps the current time), so no byte claim is
    // made for it here. The wait below crosses a DOS-time granule (2 s), so
    // the equality cannot hold by accident of a shared second.
    test('the docx target is byte-reproducible across two calls', async () => {
        const markdown = '# T\n\nBody with a [link](https://example.test/x).\n\n- one\n- two\n';
        const a = await oconvApi.fromMd({ markdown, target: 'docx' });
        await new Promise(resolve => setTimeout(resolve, 2100));
        const b = await oconvApi.fromMd({ markdown, target: 'docx' });
        expect(a.bytes.length).toBe(b.bytes.length);
        expect(a.bytes.every((v, i) => v === b.bytes[i])).toBe(true);
    });

    test('an unknown extension still throws — the target guard grew by exactly one value', async () => {
        await expect(oconvApi.fromMd({ markdown: '# T', name: 'x.rtf' }))
            .rejects.toThrow('oconv: unsupported target');
        await expect(oconvApi.fromMd({ markdown: '# T', target: 'ps' }))
            .rejects.toThrow('oconv: unsupported target');
    });
});

describe('oconv — converterVersion mirrors package.json (drift guard)', () => {
    test('the hardcoded CONVERTER_VERSION literal matches package.json\'s version', () => {
        const src = readFileSync(fileURLToPath(new URL('./oconv.js', import.meta.url)), 'utf8');
        const m = /CONVERTER_VERSION = '([^']+)'/.exec(src);
        expect(m).not.toBeNull();
        const pkg = JSON.parse(
            readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
        );
        expect(m[1]).toBe(pkg.version);
    });
});

/* ── fromMd: the asset manifest (BL-980) ─────────────────────────────── */

describe('oconv.fromMd — assets validation', () => {
    const MD = '# T\n\n![Alt](diagram.png)\n';

    test('a non-object, an array and a null all throw `oconv: bad assets`', async () => {
        for (const bad of ['x', 42, true, [], [1, 2], null]) {
            await expect(oconvApi.fromMd({ markdown: MD, target: 'docx', assets: bad }))
                .rejects.toThrow('oconv: bad assets');
        }
    });

    test('a value that is not a Uint8Array throws, whichever key carries it', async () => {
        for (const bad of [[1, 2, 3], 'bytes', null, new ArrayBuffer(4), { length: 1 }]) {
            await expect(oconvApi.fromMd({
                markdown: MD, target: 'docx', assets: { 'diagram.png': bad }
            })).rejects.toThrow('oconv: bad assets');
        }
        await expect(oconvApi.fromMd({
            markdown: MD, target: 'docx',
            assets: { 'ok.png': PX_PNG, 'bad.png': [1] }
        })).rejects.toThrow('oconv: bad assets');
    });

    test('validation runs BEFORE the reader — an empty manifest object is fine', async () => {
        const result = await oconvApi.fromMd({ markdown: MD, target: 'docx', assets: {} });
        expect(result.target).toBe('docx');
    });

    test('a key no image references is ignored: no loss, no error', async () => {
        const withKey = await oconvApi.fromMd({
            markdown: '# T\n\nNo images here.\n', target: 'docx',
            assets: { 'unused.png': PX_PNG }
        });
        const without = await oconvApi.fromMd({
            markdown: '# T\n\nNo images here.\n', target: 'docx'
        });
        expect(withKey.losses).toEqual(without.losses);
        expect(withKey.lossy).toBe(false);
    });
});

describe('oconv.fromMd — assets per target', () => {
    const MD = '# T\n\n![Alt](diagram.png)\n';

    test('docx: the image is placed at its intrinsic size with its alt text, no image loss', async () => {
        const result = await oconvApi.fromMd({
            markdown: MD, target: 'docx', assets: { 'diagram.png': PX_PNG }
        });
        const read = docxApi.read(result.bytes);
        expect(Object.keys(read.images).length).toBeGreaterThan(0);
        expect(result.losses.filter((l) => l.code.startsWith('image/'))).toEqual([]);
        // The 1 x 1 px fixture at 96 dpi: 9525 EMU square.
        const drawing = read.document.body[1].children[0].children[0];
        expect(drawing).toMatchObject({ cx: 9525, cy: 9525, description: 'Alt' });

        const back = await oconvApi.toMd({ name: 'd.docx', bytes: result.bytes, convertedAt: '2026-10-12T00:00:00Z' });
        expect(back.markdown).toContain('![Alt](');
    });

    test('odt: the image is placed at its intrinsic size with its alt text, no image loss', async () => {
        const result = await oconvApi.fromMd({
            markdown: MD, target: 'odt', assets: { 'diagram.png': PX_PNG }
        });
        expect(result.target).toBe('odt');
        const read = odtApi.read(result.bytes);
        expect(Object.keys(read.package.parts).filter((p) => p.startsWith('Pictures/')))
            .toEqual(['Pictures/image1.png']);
        expect(read.package.parts['Pictures/image1.png']).toEqual(PX_PNG);
        expect(result.losses.filter((l) => l.code.startsWith('image/'))).toEqual([]);

        const back = await oconvApi.toMd({ name: 'd.odt', bytes: result.bytes, convertedAt: '2026-10-12T00:00:00Z' });
        expect(back.markdown).toContain('![Alt](');
    });

    test('pdf: a JPEG and a PNG both place (no image loss)', async () => {
        const placed = await oconvApi.fromMd({
            markdown: MD, target: 'pdf', assets: { 'diagram.png': PX_JPEG }
        });
        expect(placed.losses.some((l) => l.code === 'layout/image-dropped')).toBe(false);

        const png = await oconvApi.fromMd({
            markdown: MD, target: 'pdf', assets: { 'diagram.png': PX_PNG }
        });
        expect(png.losses.some((l) => l.code === 'layout/image-dropped')).toBe(false);
    });

    test('the markdown destination is the key VERBATIM — no normalisation, no path handling', async () => {
        const md = '# T\n\n![A](sub/dir/My_Diagram.PNG)\n';
        const result = await oconvApi.fromMd({
            markdown: md, target: 'docx', assets: { 'sub/dir/My_Diagram.PNG': PX_PNG }
        });
        expect(result.losses.map((l) => l.code)).not.toContain('image/dropped');
        expect(Object.keys(docxApi.read(result.bytes).images)).toHaveLength(1);

        const missed = await oconvApi.fromMd({
            markdown: md, target: 'docx', assets: { 'My_Diagram.PNG': PX_PNG }
        });
        expect(missed.losses.map((l) => l.code)).toContain('image/placeholder');
        // T32 (b3c): the reference survives md → docx → md
        const back = await oconvApi.toMd({ name: 'x.docx', bytes: missed.bytes, convertedAt: '2026-01-01T00:00:00Z' });
        expect(back.markdown).toContain('![A](sub/dir/My_Diagram.PNG)');
    });

    test('a destination the Markdown reader percent-encodes is keyed as written (angle brackets, non-ASCII)', async () => {
        for (const [dest, key] of [['<my diagram.png>', 'my diagram.png'], ['café.png', 'café.png']]) {
            const md = `# T\n\n![A](${dest})\n`;
            const docx = await oconvApi.fromMd({ markdown: md, target: 'docx', assets: { [key]: PX_PNG } });
            expect(docx.losses.map((l) => l.code)).not.toContain('image/dropped');
            expect(Object.keys(docxApi.read(docx.bytes).images)).toHaveLength(1);
            const odt = await oconvApi.fromMd({ markdown: md, target: 'odt', assets: { [key]: PX_PNG } });
            expect(odt.losses.map((l) => l.code)).not.toContain('image/dropped');
            expect(odtApi.read(odt.bytes).package.parts['Pictures/image1.png']).toEqual(PX_PNG);
            const pdf = await oconvApi.fromMd({ markdown: md, target: 'pdf', assets: { [key]: PX_JPEG } });
            expect(pdf.losses.map((l) => l.code)).not.toContain('layout/image-dropped');
        }
    });

    test('the name the reader gives still wins over its decoded form; an undecodable name matches nothing new', async () => {
        const both = await oconvApi.fromMd({
            markdown: '# T\n\n![A](<my diagram.png>)\n',
            target: 'odt',
            assets: { 'my%20diagram.png': PX_PNG, 'my diagram.png': PX_JPEG }
        });
        expect(odtApi.read(both.bytes).package.parts['Pictures/image1.png']).toEqual(PX_PNG);

        // `%E0%A4%A` reads as `%E0%A4%25A`, whose decoding throws (a cut UTF-8 sequence).
        const broken = await oconvApi.fromMd({
            markdown: '# T\n\n![A](%E0%A4%A.png)\n', target: 'docx', assets: { '%E0%A4%A.png': PX_PNG }
        });
        // no bytes found: a placeholder since T32 (b3c)
        expect(broken.losses.map((l) => l.code)).toContain('image/placeholder');
    });
});

/* ── convert: docx<->odt, docx/odt->pdf (office/BATCH_35 task 04) ─────── */

/** @param {string} relPath relative to this file (`src/oconv.test.js`) */
function convertFixtureBytes(relPath) {
    return new Uint8Array(readFileSync(fileURLToPath(new URL(relPath, import.meta.url))));
}

/** Latin-1 view of emitted bytes — a PDF header is not UTF-8. */
function latin1(bytes) {
    let out = '';
    for (const b of bytes) out += String.fromCharCode(b);
    return out;
}

describe('oconv.convert — contract errors, in order (bytes -> format -> target -> pair -> pdf opts)', () => {
    test('bytes missing throws first', async () => {
        await expect(oconvApi.convert({ name: 'x.docx', target: 'odt' }))
            .rejects.toThrow(/oconv: bytes is required/);
    });

    test('an unresolvable format throws next', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({ name: 'x.rtf', bytes, target: 'odt' }))
            .rejects.toThrow(/oconv: unsupported format/);
    });

    test('a missing or unresolvable target throws next', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({ name: 'x.docx', bytes }))
            .rejects.toThrow(/oconv: unsupported target/);
        await expect(oconvApi.convert({ name: 'x.docx', bytes, target: 'md' }))
            .rejects.toThrow(/oconv: unsupported target/);
    });

    test('a target valid on its own but not in the allowlisted pair throws next', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({ name: 'x.docx', bytes, target: 'docx' }))
            .rejects.toThrow(/oconv: unsupported pair/);
    });

    test('pdf opts on a non-pdf target throws last', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({
            name: 'x.docx', bytes, target: 'odt', opts: { pdf: { margin: 10 } }
        })).rejects.toThrow(/oconv: pdf options need target pdf/);
    });
});

// BATCH_39 task 04 (claim pinning, FINDINGS § 5.4 C31) — the describe block
// above pins each check firing ALONE; the claim (docs/convert.md:79-81) is
// the full precedence `bytes -> format -> target -> pair -> opts.pdf` (then
// `defaultFaces`, checked LAST per `src/oconv.js:619-633`'s own JSDoc) —
// which needs an input failing TWO adjacent checks at once to pin which one
// actually wins. Every adjacent pair of the order read from `src/oconv.js`.
describe('oconv.convert — error precedence: two adjacent checks failing at once, the earlier wins (C31)', () => {
    test('bytes missing AND format unresolvable: `bytes is required` wins', async () => {
        await expect(oconvApi.convert({ name: 'x.rtf', target: 'odt' }))
            .rejects.toThrow('oconv: bytes is required');
    });

    test('format unresolvable AND target invalid: `unsupported format` wins', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({ name: 'x.rtf', bytes, target: 'md' }))
            .rejects.toThrow('oconv: unsupported format');
    });

    test('target invalid AND the would-be pair also invalid: `unsupported target` wins', async () => {
        // `zip` is not one of `SUPPORTED_TARGETS`, so `docx>zip` could never
        // be an allowlisted pair either — both checks would fire if the
        // target check did not short-circuit first.
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({ format: 'docx', bytes, target: 'zip' }))
            .rejects.toThrow('oconv: unsupported target');
    });

    test('pair invalid (same-format) AND pdf opts supplied for that (non-pdf) target: `unsupported pair` wins', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({
            format: 'docx', bytes, target: 'docx', opts: { pdf: { margin: 5 } }
        })).rejects.toThrow('oconv: unsupported pair');
    });

    test('pdf opts on a non-pdf target AND defaultFaces on the same non-pdf target: `pdf options need target pdf` wins', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({
            name: 'x.docx', bytes, target: 'odt',
            opts: { pdf: { margin: 5 } },
            defaultFaces: { regular: new Uint8Array([1, 2, 3]) }
        })).rejects.toThrow('oconv: pdf options need target pdf');
    });
});

// BATCH_39 task 04 (C32) — `oconv: bad pdf option <key>` and `oconv: bad pdf
// font <style>` were pinned through `fromMd` (the "pdf target" describe
// block above) but NEVER through `convert`, which shares the same
// `oconvIrToPdf.irToPdf(ir, pdfOpts, …)` call and therefore the same
// validator (D-C, one validator).
describe('oconv.convert — pdf option/font validation errors are exact literals (C32)', () => {
    test('an unknown opts.pdf key throws `oconv: bad pdf option <key>` through convert', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({
            name: 'x.docx', bytes, target: 'pdf', opts: { pdf: { bogus: 1 } }
        })).rejects.toThrow('oconv: bad pdf option bogus');
    });

    test('unreadable opts.pdf.fonts bytes throw `oconv: bad pdf font <style>` through convert', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({
            name: 'x.docx', bytes, target: 'pdf',
            opts: { pdf: { fonts: { regular: new Uint8Array([1, 2, 3]) } } }
        })).rejects.toThrow('oconv: bad pdf font regular');
    });
});

// BATCH_39 task 04 (C33) — `readToIr`'s `includeNotes` thread only affects
// the `pptx`/`odp` branches (`src/oconv.js:374-396`), and `SUPPORTED_PAIRS`
// never carries either as a `convert` SOURCE (docx/odt/pdf only), so the
// flag is a no-op for every pair `convert` actually ships — stated here as
// BYTE-equal output (both targets this writer produces are deterministic,
// pinned separately: `fromMd — pdf target` "byte-reproducible" above, and
// the docx target's fixed zip entry timestamp. The odt target stamps the
// current time, so the docx>odt equality below holds only within one clock
// granule of the two calls).
describe('oconv.convert — `includeNotes` is a no-op for every SHIPPED pair (C33)', () => {
    test('docx>odt: byte-identical with and without includeNotes', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/docx/docx-smoke.docx');
        const off = await oconvApi.convert({ name: 'x.docx', bytes, target: 'odt' });
        const on = await oconvApi.convert({ name: 'x.docx', bytes, target: 'odt', includeNotes: true });
        expect(on.bytes.length).toBe(off.bytes.length);
        expect(on.bytes.every((v, i) => v === off.bytes[i])).toBe(true);
    });

    test('odt>docx: byte-identical with and without includeNotes', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/odt/odt-structured.odt');
        const off = await oconvApi.convert({ name: 'x.odt', bytes, target: 'docx' });
        const on = await oconvApi.convert({ name: 'x.odt', bytes, target: 'docx', includeNotes: true });
        expect(on.bytes.length).toBe(off.bytes.length);
        expect(on.bytes.every((v, i) => v === off.bytes[i])).toBe(true);
    });

    test('docx>pdf: byte-identical with and without includeNotes', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/docx/docx-smoke.docx');
        const off = await oconvApi.convert({ name: 'x.docx', bytes, target: 'pdf' });
        const on = await oconvApi.convert({ name: 'x.docx', bytes, target: 'pdf', includeNotes: true });
        expect(on.bytes.length).toBe(off.bytes.length);
        expect(on.bytes.every((v, i) => v === off.bytes[i])).toBe(true);
    });

    test('odt>pdf: byte-identical with and without includeNotes', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/odt/odt-table.odt');
        const off = await oconvApi.convert({ name: 'x.odt', bytes, target: 'pdf' });
        const on = await oconvApi.convert({ name: 'x.odt', bytes, target: 'pdf', includeNotes: true });
        expect(on.bytes.length).toBe(off.bytes.length);
        expect(on.bytes.every((v, i) => v === off.bytes[i])).toBe(true);
    });
});

describe('oconv.convert — no pair outside the allowlist', () => {
    // `format`/`target` set explicitly so the source bytes (real docx bytes,
    // never actually read — every one of these throws before `readToIr`
    // runs) don't need to match the claimed source format.
    test('docx>docx, xlsx>docx and pdf>docx are rejected as `unsupported pair` (format+target both individually valid)', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({ format: 'docx', bytes, target: 'docx' }))
            .rejects.toThrow('oconv: unsupported pair');
        await expect(oconvApi.convert({ format: 'xlsx', bytes, target: 'docx' }))
            .rejects.toThrow('oconv: unsupported pair');
        await expect(oconvApi.convert({ format: 'pdf', bytes, target: 'docx' }))
            .rejects.toThrow('oconv: unsupported pair');
    });

    test('docx>md is rejected earlier, at the target check (`md` is never a valid convert target)', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({ format: 'docx', bytes, target: 'md' }))
            .rejects.toThrow('oconv: unsupported target');
    });
});

describe('oconv.convert — happy paths on vendored fixtures', () => {
    test('docx-smoke.docx -> odt: odt.read parses; toMd of the result contains a heading', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/docx/docx-smoke.docx');
        const result = await oconvApi.convert({ name: 'docx-smoke.docx', bytes, target: 'odt' });

        expect(result.format).toBe('docx');
        expect(result.target).toBe('odt');
        expect(typeof result.ms).toBe('number');
        expect(result.ms).toBeGreaterThanOrEqual(0);

        const read = odtApi.read(result.bytes);
        expect(Array.isArray(read.body)).toBe(true);

        const back = await oconvApi.toMd({ bytes: result.bytes, format: 'odt', convertedAt: FIXED_AT });
        expect(back.markdown).toMatch(/^# /m);
    });

    test('odt-structured.odt -> docx: docx.read parses', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/odt/odt-structured.odt');
        const result = await oconvApi.convert({ name: 'odt-structured.odt', bytes, target: 'docx' });

        expect(result.format).toBe('odt');
        expect(result.target).toBe('docx');

        const read = docxApi.read(result.bytes);
        expect(Array.isArray(read.document.body)).toBe(true);
        expect(read.document.body.length).toBeGreaterThan(0);
    });

    test('docx-smoke.docx -> pdf: pdf.read reports at least one page', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/docx/docx-smoke.docx');
        const result = await oconvApi.convert({ name: 'docx-smoke.docx', bytes, target: 'pdf' });

        expect(result.format).toBe('docx');
        expect(result.target).toBe('pdf');
        const doc = pdfReadApi.read(result.bytes);
        expect(doc.pages.length).toBeGreaterThanOrEqual(1);
    });

    test('odt-table.odt -> pdf: pdf.read reports at least one page', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/odt/odt-table.odt');
        const result = await oconvApi.convert({ name: 'odt-table.odt', bytes, target: 'pdf' });

        expect(result.format).toBe('odt');
        expect(result.target).toBe('pdf');
        const doc = pdfReadApi.read(result.bytes);
        expect(doc.pages.length).toBeGreaterThanOrEqual(1);
    });

    test('opts.pdf.pageSize: "Letter" changes the MediaBox vs the A4 default', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/docx/docx-smoke.docx');
        const a4 = await oconvApi.convert({ name: 'docx-smoke.docx', bytes, target: 'pdf' });
        const letter = await oconvApi.convert({
            name: 'docx-smoke.docx', bytes, target: 'pdf', opts: { pdf: { pageSize: 'Letter' } }
        });

        expect(latin1(a4.bytes)).toContain('/MediaBox [0 0 595.276 841.89]');
        expect(latin1(letter.bytes)).toContain('/MediaBox [0 0 612 792]');
    });

    test('convert odt -> docx is byte-reproducible across two calls', async () => {
        // `@awacloud/ooxml` stamps a fixed 1980-01-01 00:00 timestamp on every
        // zip entry of the docx target; `docx -> odt` carries no such claim.
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/odt/odt-structured.odt');
        const a = await oconvApi.convert({ name: 'x.odt', bytes, target: 'docx' });
        await new Promise(resolve => setTimeout(resolve, 2100));
        const b = await oconvApi.convert({ name: 'x.odt', bytes, target: 'docx' });
        expect(a.bytes.length).toBe(b.bytes.length);
        expect(a.bytes.every((v, i) => v === b.bytes[i])).toBe(true);
    });

    test('opts.pdf on a non-pdf target (odt -> docx, a valid pair) is refused, not silently ignored', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/odt/odt-structured.odt');
        await expect(oconvApi.convert({
            name: 'odt-structured.odt', bytes, target: 'docx', opts: { pdf: {} }
        })).rejects.toThrow('oconv: pdf options need target pdf');
    });

    test('losses merge reader-then-writer: docx-structured.docx -> odt leads with the two numbering-unresolved reader losses', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/docx/docx-structured.docx');
        const result = await oconvApi.convert({ name: 'docx-structured.docx', bytes, target: 'odt' });

        expect(result.lossy).toBe(true);
        expect(result.losses[0]).toEqual({ code: 'list/numbering-unresolved', detail: 'numId 1' });
        expect(result.losses[1]).toEqual({ code: 'list/numbering-unresolved', detail: 'numId 2' });
    });
});

/* ── fromMd / convert: posted defaultFaces (office/BATCH_38 task 05, BL-1267) ──
 *
 * The `oconvDefaultFaces` descriptor closes over its bytes inside `factory()`
 * and is main-thread-only (BL-1267 hard constraint) — this facade never
 * resolves it. A posted `defaultFaces` map is the ONLY way the pdf target
 * reaches a default-face tier from this level.
 */

describe('oconv.fromMd — defaultFaces validation, exact check order (BL-1267)', () => {
    const MD = '# T\n\nSample plain sentence.\n';

    test('defaultFaces on a non-pdf target throws `oconv: default faces need target pdf`', async () => {
        await expect(oconvApi.fromMd({
            markdown: MD, target: 'docx', defaultFaces: { regular: PX_PNG }
        })).rejects.toThrow('oconv: default faces need target pdf');
        await expect(oconvApi.fromMd({
            markdown: MD, target: 'odt', defaultFaces: { regular: PX_PNG }
        })).rejects.toThrow('oconv: default faces need target pdf');
    });

    test('the target check fires BEFORE the shape check: a docx target with an also-bad map throws the target error', async () => {
        await expect(oconvApi.fromMd({
            markdown: MD, target: 'docx', defaultFaces: 'not even an object'
        })).rejects.toThrow('oconv: default faces need target pdf');
    });

    test('a non-object, an array and a null all throw `oconv: bad default faces` on the pdf target', async () => {
        for (const bad of ['x', 42, true, [], [1, 2], null]) {
            await expect(oconvApi.fromMd({
                markdown: MD, target: 'pdf', defaultFaces: bad
            })).rejects.toThrow('oconv: bad default faces');
        }
    });

    test('a non-Uint8Array member value throws `oconv: bad default faces`', async () => {
        await expect(oconvApi.fromMd({
            markdown: MD, target: 'pdf', defaultFaces: { regular: [1, 2, 3] }
        })).rejects.toThrow('oconv: bad default faces');
    });

    test('defaultFaces absent, and `defaultFaces: undefined`, both reproduce the pre-existing pdf result byte-for-byte', async () => {
        const without = await oconvApi.fromMd({ markdown: MD, target: 'pdf' });
        const withUndefined = await oconvApi.fromMd({
            markdown: MD, target: 'pdf', defaultFaces: undefined
        });
        expect(withUndefined.bytes.length).toBe(without.bytes.length);
        expect(withUndefined.bytes.every((v, i) => v === without.bytes[i])).toBe(true);
        expect(withUndefined.losses).toEqual(without.losses);
    });
});

describe('oconv.convert — defaultFaces validation, exact check order (BL-1267)', () => {
    test('opts.pdf still throws before defaultFaces is even inspected (checked LAST)', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({
            name: 'x.docx', bytes, target: 'odt', opts: { pdf: { margin: 10 } }
        })).rejects.toThrow('oconv: pdf options need target pdf');
    });

    test('defaultFaces on a non-pdf target throws `oconv: default faces need target pdf`', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({
            name: 'x.docx', bytes, target: 'odt', defaultFaces: { regular: PX_PNG }
        })).rejects.toThrow('oconv: default faces need target pdf');
    });

    test('the target check fires BEFORE the shape check: an odt target with an also-bad map throws the target error', async () => {
        const bytes = docxFixtureBytes();
        await expect(oconvApi.convert({
            name: 'x.docx', bytes, target: 'odt', defaultFaces: 'not even an object'
        })).rejects.toThrow('oconv: default faces need target pdf');
    });

    test('a non-object, an array and a null all throw `oconv: bad default faces` on the pdf target', async () => {
        const bytes = docxFixtureBytes();
        for (const bad of ['x', 42, true, [], [1, 2], null]) {
            await expect(oconvApi.convert({
                name: 'x.docx', bytes, target: 'pdf', defaultFaces: bad
            })).rejects.toThrow('oconv: bad default faces');
        }
    });

    test('defaultFaces absent, and `defaultFaces: undefined`, both reproduce the pre-existing pdf result byte-for-byte', async () => {
        const bytes = convertFixtureBytes('../tests/_fixtures/corpus/docx/docx-smoke.docx');
        const without = await oconvApi.convert({ name: 'docx-smoke.docx', bytes, target: 'pdf' });
        const withUndefined = await oconvApi.convert({
            name: 'docx-smoke.docx', bytes, target: 'pdf', defaultFaces: undefined
        });
        expect(withUndefined.bytes.length).toBe(without.bytes.length);
        expect(withUndefined.bytes.every((v, i) => v === without.bytes[i])).toBe(true);
        expect(withUndefined.losses).toEqual(without.losses);
    });
});

describe('oconv — defaultFaces reaches the pdf writer, on both fromMd and convert (BL-1267)', () => {
    /** PostScript name -> style class, for the faces the corpus PDF carries. */
    const STYLE_BY_PSNAME = {
        'Calibri':            'regular',
        'Calibri-Bold':       'bold',
        'Calibri-Italic':     'italic',
        'Calibri-BoldItalic': 'boldItalic'
    };

    /**
     * TEST-ONLY corpus recipe, copied verbatim (not imported) from
     * `write/pdf/metrics.test.js` / `write/ir-to-pdf.test.js`: mine the four
     * embedded Latin faces out of the vendored golden-corpus PDF. `src/`
     * never reaches into a PDF for a font — the embedded/default routes run
     * on caller-supplied bytes only (D-A).
     */
    function embeddedFontBytesFromPdf(rt, pdfBytes) {
        const api = rt.resolve('pdf');
        const dispatch = rt.resolve('pdfFilterDispatch');
        const fontsMod = rt.resolve('fonts');
        const doc = api.read(pdfBytes);
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
                const program = dispatch.decode(deref(descriptor.entries.FontFile2), resolveRef);
                const style = STYLE_BY_PSNAME[fontsMod.read(program).names.postScriptName];
                if (style && !out[style]) out[style] = program;
            }
        }
        return out;
    }

    /** Latin-1 view of emitted bytes — a PDF header is not UTF-8. */
    function latin1(bytes) {
        let out = '';
        for (const b of bytes) out += String.fromCharCode(b);
        return out;
    }

    /** @type {Object<string, Uint8Array>} */
    let corpusFaces;

    beforeAll(async () => {
        const rt = pdfWriterRuntime();
        corpusFaces = embeddedFontBytesFromPdf(rt, await corpusBytes(CORPUS_PDF));
    });

    test('the corpus really carries a `regular` Calibri face', () => {
        expect(corpusFaces.regular).toBeInstanceOf(Uint8Array);
    });

    test('fromMd: a style class covered ONLY by the posted map is embedded, not drawn from Standard 14', async () => {
        // "Sample plain sentence" avoids the letters the corpus-mined Calibri
        // SUBSET has no glyph for (g h k b z v x q — office/BATCH_38 task 04
        // memory), so this stays a clean positive proof of embedding rather
        // than also exercising the unrelated text/unencodable degrade.
        const result = await oconvApi.fromMd({
            markdown: '# T\n\nSample plain sentence.\n',
            target: 'pdf',
            defaultFaces: { regular: corpusFaces.regular }
        });
        expect(result.target).toBe('pdf');
        const bytes = latin1(result.bytes);
        // `subsetForPdf` prefixes the PostScript name with a 6-char hash tag
        // (`<PREFIX>+Calibri`, `@awacloud/fonts` `subsetForPdf.js`) — match
        // the suffix rather than the bare name.
        expect(bytes).toMatch(/\/BaseFont \/[A-Z]{6}\+Calibri/);
        expect(bytes).toContain('/FontFile2');

        const doc = pdfReadApi.read(result.bytes);
        expect(doc.pages.length).toBeGreaterThanOrEqual(1);
    });

    test('convert: a style class covered ONLY by the posted map is embedded, not drawn from Standard 14', async () => {
        const bytes = docxApi.write({
            body: [docxApi.paragraph('Sample plain sentence.')]
        });
        const result = await oconvApi.convert({
            name: 'plain.docx', bytes, target: 'pdf',
            defaultFaces: { regular: corpusFaces.regular }
        });
        expect(result.target).toBe('pdf');
        const written = latin1(result.bytes);
        expect(written).toMatch(/\/BaseFont \/[A-Z]{6}\+Calibri/);
        expect(written).toContain('/FontFile2');
    });
});

// The BL-1267 static pin (no `.serialize(`/`registerDeep(` in `src/worker.js`)
// lives in `tests/worker.integration.test.js`, alongside the worker-envelope
// forwarding tests it is guarding.

describe('oconv.toMd — pdfPassword and pdfRecoverXref', () => {
    let encWriter;
    let locked;
    beforeAll(() => {
        const runtime = new ModuleRuntime();
        runtime.registerAll(fw_require);
        runtime.registerAll(modules);
        encWriter = runtime.resolve('pdfEncryptedWriter');
        locked = encryptedBytes();
    });

    /** The indirects of one untagged page, Standard 14 Helvetica, one line of text. */
    function pageIndirects() {
        const obj = pdfObjApi;
        const enc = (s) => new TextEncoder().encode(s);
        const content = 'BT /F1 12 Tf 72 720 Td (Locked page text) Tj ET\n';
        return [
            { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
            { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
            { num: 3, gen: 0, value: obj.dict({
                Type: obj.name('Page'), Parent: obj.ref(2, 0),
                MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(4, 0), Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(5, 0) }) })
            }) },
            { num: 4, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
            { num: 5, gen: 0, value: obj.dict({ Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name('Helvetica') }) }
        ];
    }

    /**
     * The page above, AES-128 encrypted (V4 AESV2), user password `user`,
     * owner password `owner`. Not R6: its key hardening takes seconds under
     * `--coverage`, and the forwarding under test is the same.
     */
    function encryptedBytes() {
        let n = 7;
        const randomBytes = (len) => {
            const out = new Uint8Array(len);
            for (let i = 0; i < len; i++) { n = (Math.imul(n, 1103515245) + 12345) >>> 0; out[i] = n >>> 24; }
            return out;
        };
        return encWriter.writeEncryptedDocument({
            indirects: pageIndirects(), root: { num: 1, gen: 0 },
            encrypt: { version: 4, revision: 4, method: 'AESV2', ownerPassword: 'owner', userPassword: 'user', permissions: -4, randomBytes }
        }).bytes;
    }

    /** The page above with a `startxref` offset that points past the file. */
    function brokenXrefBytes() {
        const bytes = pdfReadApi.write({ indirects: pageIndirects(), root: { num: 1, gen: 0 }, version: '1.7' });
        const text = new TextDecoder('latin1').decode(bytes);
        const broken = text.replace(/startxref\s+(\d+)/, (m, d) => m.replace(d, String(Number(d) + 100000)));
        expect(broken).not.toBe(text);
        return Uint8Array.from(broken, (c) => c.charCodeAt(0));
    }

    test('an encrypted pdf converts with its user or owner password', async () => {
        const bytes = locked;
        for (const pdfPassword of ['user', 'owner', new TextEncoder().encode('user')]) {
            const r = await oconvApi.toMd({ name: 'locked.pdf', bytes, convertedAt: FIXED_AT, pdfPassword });
            expect(r.markdown).toContain('Locked page text');
        }
    });

    test('without the password the read still throws, and a wrong one is refused', async () => {
        const bytes = locked;
        await expect(oconvApi.toMd({ name: 'locked.pdf', bytes, convertedAt: FIXED_AT }))
            .rejects.toMatchObject({ code: 'pdf/document/encrypted' });
        await expect(oconvApi.toMd({ name: 'locked.pdf', bytes, convertedAt: FIXED_AT, pdfPassword: 'nope' }))
            .rejects.toMatchObject({ code: 'pdf/document/bad-password' });
        await expect(oconvApi.toMd({ name: 'locked.pdf', bytes, convertedAt: FIXED_AT, pdfPassword: 42 }))
            .rejects.toMatchObject({ code: 'pdf/document/bad-password-option' });
    });

    test('a pdf whose startxref points nowhere converts with pdfRecoverXref: true', async () => {
        const bytes = brokenXrefBytes();
        await expect(oconvApi.toMd({ name: 'broken.pdf', bytes, convertedAt: FIXED_AT })).rejects.toThrow();
        const r = await oconvApi.toMd({ name: 'broken.pdf', bytes, convertedAt: FIXED_AT, pdfRecoverXref: true });
        expect(r.markdown).toContain('Locked page text');
    });

    test('pdfRecoverXref must be a boolean', async () => {
        for (const pdfRecoverXref of ['yes', 1, null]) {
            await expect(oconvApi.toMd({ name: 'x.pdf', bytes: pdfFixtureBytes(), convertedAt: FIXED_AT, pdfRecoverXref }))
                .rejects.toThrow('oconv: bad pdf recover xref');
        }
    });

    test('either option on a non-pdf source is refused', async () => {
        await expect(oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, pdfPassword: 'user' }))
            .rejects.toThrow('oconv: pdf password needs format pdf');
        await expect(oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, pdfRecoverXref: true }))
            .rejects.toThrow('oconv: pdf recover xref needs format pdf');
    });

    test('without either option, or with pdfRecoverXref: false, the markdown is unchanged', async () => {
        const bytes = pdfFixtureBytes();
        const without = await oconvApi.toMd({ name: 'report.pdf', bytes, convertedAt: FIXED_AT });
        const off = await oconvApi.toMd({ name: 'report.pdf', bytes, convertedAt: FIXED_AT, pdfRecoverXref: false });
        expect(off.markdown).toBe(without.markdown);
    });
});

describe('oconv.toMd — pdfPassword opens RC4 (V1 / V2) files (T45, D8)', () => {
    // pdf's own primitives, from a runtime of the pdf package alone: PDF 2.0
    // forbids RC4 on write, so the fixtures are assembled here as pdf's
    // `document.decrypt-rc4.test.js` assembles them.
    const pdfRt = new ModuleRuntime();
    pdfRt.registerAll([...pdfPkg.fw_require, ...pdfPkg.modules, ...pdfPkg.extras]);
    const rc4x = pdfRt.resolve('pdfLegacyRc4Read');
    const ID = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

    /** /O by ISO 32000-1 § 7.6.3.4 Algorithm 3. */
    function computeO(owner, user, revision, n) {
        let h = rc4x.md5(rc4x.padPassword(owner));
        if (revision >= 3) for (let i = 0; i < 50; i++) h = rc4x.md5(h.subarray(0, n));
        const key = h.subarray(0, n);
        let o = rc4x.rc4(key, rc4x.padPassword(user));
        if (revision >= 3) for (let i = 1; i <= 19; i++) o = rc4x.rc4(key.map((b) => b ^ i), o);
        return o;
    }

    /** One untagged Helvetica page, RC4-encrypted (R2: 40-bit V1, R3: 128-bit V2). */
    function rc4File({ revision, user, owner = 'owner' }) {
        const V = revision === 2 ? 1 : 2;
        const bits = revision === 2 ? 40 : 128;
        const O = computeO(owner, user, revision, bits / 8);
        const params = { O, P: -44, idFirst: ID, revision, keyLength: bits };
        const fileKey = rc4x.computeFileKey(user, params);
        const U = rc4x.computeU(fileKey, ID, revision);
        const content = rc4x.decryptStream(fileKey, 4, 0, new TextEncoder().encode('BT /F1 12 Tf 72 720 Td (RC4 page text) Tj ET'));
        const objs = {
            1: '<< /Type /Catalog /Pages 2 0 R >>',
            2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            3: '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> >>',
            5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            6: `<< /Filter /Standard /V ${V} /R ${revision}${V === 2 ? ` /Length ${bits}` : ''} /P -44 /O <${hex(O)}> /U <${hex(U)}> >>`
        };
        const parts = [];
        const offsets = [];
        let at = 0;
        const push = (u8) => { parts.push(u8); at += u8.length; };
        const text = (s) => push(Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff));
        text('%PDF-1.4\n');
        for (let n = 1; n <= 6; n++) {
            offsets[n] = at;
            if (n === 4) {
                text(`4 0 obj\n<< /Length ${content.length} >>\nstream\n`);
                push(content);
                text('\nendstream\nendobj\n');
            } else text(`${n} 0 obj\n${objs[n]}\nendobj\n`);
        }
        const xrefAt = at;
        let x = 'xref\n0 7\n0000000000 65535 f \n';
        for (let n = 1; n <= 6; n++) x += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
        text(x + `trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [<${hex(ID)}> <${hex(ID)}>] >>\nstartxref\n${xrefAt}\n%%EOF\n`);
        const out = new Uint8Array(at);
        let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
    }

    for (const revision of [2, 3]) {
        test(`R${revision}: the empty user password and the owner password open it`, async () => {
            const bytes = rc4File({ revision, user: '' });
            for (const pdfPassword of ['', 'owner']) {
                const r = await oconvApi.toMd({ name: 'rc4.pdf', bytes, convertedAt: FIXED_AT, pdfPassword });
                expect(r.markdown).toContain('RC4 page text');
            }
        });
    }

    test('without a password it still refuses; a wrong password is refused', async () => {
        const bytes = rc4File({ revision: 3, user: 'user' });
        await expect(oconvApi.toMd({ name: 'rc4.pdf', bytes, convertedAt: FIXED_AT }))
            .rejects.toMatchObject({ code: 'pdf/document/encrypted' });
        await expect(oconvApi.toMd({ name: 'rc4.pdf', bytes, convertedAt: FIXED_AT, pdfPassword: 'nope' }))
            .rejects.toMatchObject({ code: 'pdf/document/bad-password' });
    });
});

describe('oconv.toMd — archiveLimits (T47, D10)', () => {
    test('the limits reach the OOXML and the ODF readers', async () => {
        await expect(oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, archiveLimits: { maxParts: 2 } }))
            .rejects.toMatchObject({ code: 'opc/zip-bomb', context: { limit: 'maxParts', max: 2 } });
        await expect(oconvApi.toMd({ name: 'x.odt', bytes: odtFixtureBytes(), convertedAt: FIXED_AT, archiveLimits: { maxParts: 2 } }))
            .rejects.toMatchObject({ code: 'odf/parse-error/zip-bomb', context: { limit: 'maxParts', max: 2 } });
        await expect(oconvApi.toMd({ name: 'x.pptx', bytes: pptxFixtureBytes(), convertedAt: FIXED_AT, archiveLimits: { maxUncompressed: 10 } }))
            .rejects.toMatchObject({ code: 'opc/zip-bomb', context: { limit: 'maxUncompressed' } });
    });

    test('generous limits, or none, convert as before', async () => {
        const bytes = xlsxFixtureBytes();
        const without = await oconvApi.toMd({ name: 'x.xlsx', bytes, convertedAt: FIXED_AT });
        const wide = await oconvApi.toMd({ name: 'x.xlsx', bytes, convertedAt: FIXED_AT, archiveLimits: { maxParts: 0, maxRatio: 1e6, maxDepth: 5000 } });
        expect(wide.markdown).toBe(without.markdown);
        const ods = await oconvApi.toMd({ name: 'x.ods', bytes: odsFixtureBytes(), convertedAt: FIXED_AT, archiveLimits: { maxParts: 100 } });
        expect(ods.markdown).toBe((await oconvApi.toMd({ name: 'x.ods', bytes: odsFixtureBytes(), convertedAt: FIXED_AT })).markdown);
    });

    test('a bad value or key is refused, and a pdf source too', async () => {
        for (const archiveLimits of [null, [], 5, { maxParts: -1 }, { maxParts: 1.5 }, { maxParts: '9' }, { other: 1 }]) {
            await expect(oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, archiveLimits }))
                .rejects.toThrow('oconv: bad archive limits');
        }
        await expect(oconvApi.toMd({ name: 'x.pdf', bytes: pdfFixtureBytes(), convertedAt: FIXED_AT, archiveLimits: { maxParts: 10 } }))
            .rejects.toThrow('oconv: archive limits need an office source');
    });
});

describe('oconv.toMd — sheetCellBudget (T46, D9)', () => {
    const rows = [['a', 'b'], ['c']];
    const xlsxBytes = () => xlsxApi.write({ sheets: [{ name: 'Grid', rows }] });
    const odsBytes = () => odsApi.write({ spreadsheet: { tables: [{
        type: 'table', name: 'Grid', columns: [],
        rows: rows.map((r) => ({ type: 'row', cells: r.map((v) => odsApi.cell(v)) }))
    }] } });

    test('past the budget each value is a line with its address, from xlsx and from ods', async () => {
        for (const [name, bytes] of [['a.xlsx', xlsxBytes()], ['a.ods', odsBytes()]]) {
            const r = await oconvApi.toMd({ name, bytes, convertedAt: FIXED_AT, sheetCellBudget: 3 });
            expect(r.markdown).toContain('# Grid\n\nA1: a\n\nB1: b\n\nA2: c\n');
            expect(r.losses).toContainEqual({ code: 'sheet/sparse-form', detail: 'Grid: 4 padded cells, 3 kept' });
            const within = await oconvApi.toMd({ name, bytes, convertedAt: FIXED_AT, sheetCellBudget: 4 });
            expect(within.markdown).toBe((await oconvApi.toMd({ name, bytes, convertedAt: FIXED_AT })).markdown);
        }
    });

    test('a bad value or another format throws', async () => {
        await expect(oconvApi.toMd({ name: 'a.xlsx', bytes: xlsxBytes(), convertedAt: FIXED_AT, sheetCellBudget: 0 }))
            .rejects.toThrow('oconv: bad cell budget');
        await expect(oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, sheetCellBudget: 10 }))
            .rejects.toThrow('oconv: sheet cell budget needs format xlsx or ods');
    });
});

describe('oconv.toMd — outputBudget (T48, D11)', () => {
    // 50 rows of 4 cells sharing one 1,000-character string: 200,000 bytes of text.
    const big = 'x'.repeat(1000);
    const wideBytes = () => xlsxApi.write({ sheets: [{ name: 'Big', rows: Array.from({ length: 50 }, () => [big, big, big, big]) }] });

    test("'throw' (also when overflow is absent) refuses before any markdown is built", async () => {
        for (const outputBudget of [{ bytes: 16384 }, { bytes: 16384, overflow: 'throw' }]) {
            await expect(oconvApi.toMd({ name: 'big.xlsx', bytes: wideBytes(), convertedAt: FIXED_AT, outputBudget }))
                .rejects.toThrow('oconv: output too large');
        }
    });

    test("'truncate' keeps the leading rows that fit and records the loss", async () => {
        const r = await oconvApi.toMd({ name: 'big.xlsx', bytes: wideBytes(), convertedAt: FIXED_AT, outputBudget: { bytes: 16384, overflow: 'truncate' } });
        const rows = r.markdown.split('\n').filter((l) => l.startsWith('| x'));
        expect(rows.length).toBe(4);
        expect(r.markdown).toContain('# Big');
        expect(r.losses).toContainEqual({ code: 'doc/truncated', detail: 'kept 16003 bytes of text; 0 blocks and 46 table rows dropped' });
        expect(r.markdown.length).toBeLessThan(16384 + 4096);
    });

    test('a block that does not fit ends the document', async () => {
        const bytes = docxApi.write({ body: [docxApi.paragraph('a'.repeat(100)), docxApi.paragraph('b'.repeat(100)), docxApi.paragraph('c')] });
        const r = await oconvApi.toMd({ name: 'x.docx', bytes, convertedAt: FIXED_AT, outputBudget: { bytes: 150, overflow: 'truncate' } });
        expect(r.markdown).toContain('a'.repeat(100));
        expect(r.markdown).not.toContain('bbb');
        expect(r.markdown).not.toContain('\nc\n');
        expect(r.losses).toContainEqual({ code: 'doc/truncated', detail: 'kept 100 bytes of text; 2 blocks and 0 table rows dropped' });
    });

    test('the size counts UTF-8 bytes', async () => {
        const bytes = docxApi.write({ body: [docxApi.paragraph('é'.repeat(60))] });
        await expect(oconvApi.toMd({ name: 'x.docx', bytes, convertedAt: FIXED_AT, outputBudget: { bytes: 100 } }))
            .rejects.toThrow('oconv: output too large');
        const fits = await oconvApi.toMd({ name: 'x.docx', bytes, convertedAt: FIXED_AT, outputBudget: { bytes: 120 } });
        expect(fits.markdown).toContain('é'.repeat(60));
    });

    test('within the budget the markdown is unchanged, in both modes', async () => {
        const bytes = docxFixtureBytes();
        const without = await oconvApi.toMd({ name: 'x.docx', bytes, convertedAt: FIXED_AT });
        for (const overflow of ['throw', 'truncate']) {
            const r = await oconvApi.toMd({ name: 'x.docx', bytes, convertedAt: FIXED_AT, outputBudget: { bytes: 1 << 20, overflow } });
            expect(r.markdown).toBe(without.markdown);
        }
    });

    test('a bad budget is refused', async () => {
        for (const outputBudget of [null, 5, [], {}, { bytes: 0 }, { bytes: 1.5 }, { bytes: '9' }, { bytes: 10, overflow: 'cut' }, { bytes: 10, other: 1 }]) {
            await expect(oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, outputBudget }))
                .rejects.toThrow('oconv: bad output budget');
        }
    });
});

describe('oconv.toMd — pdfLineHyphens (T34 c)', () => {
    test('it reaches the pdf reader; another format or value is refused', async () => {
        const bytes = pdfFixtureBytes();
        const without = await oconvApi.toMd({ name: 'x.pdf', bytes, convertedAt: FIXED_AT });
        for (const pdfLineHyphens of ['drop', 'keep']) {
            const r = await oconvApi.toMd({ name: 'x.pdf', bytes, convertedAt: FIXED_AT, pdfLineHyphens });
            expect(typeof r.markdown).toBe('string');
        }
        expect(without.markdown.length).toBeGreaterThan(0);
        await expect(oconvApi.toMd({ name: 'x.pdf', bytes, convertedAt: FIXED_AT, pdfLineHyphens: 'join' }))
            .rejects.toThrow('oconv: bad pdf line hyphens');
        await expect(oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT, pdfLineHyphens: 'drop' }))
            .rejects.toThrow('oconv: pdf line hyphens needs format pdf');
    });
});

describe('oconv.toMd — the pdf document title (T34 d)', () => {
    const XMP = (title) => '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">'
        + `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>`;

    /** One text page; `info` an Info /Title (bytes), `xmp` a /Metadata packet. */
    function titled({ info, xmp } = {}) {
        const o = pdfObjApi;
        const content = 'BT /F1 12 Tf 72 720 Td (Body text) Tj ET\n';
        const catalog = { Type: o.name('Catalog'), Pages: o.ref(2, 0) };
        if (xmp) catalog.Metadata = o.ref(6, 0);
        const indirects = [
            { num: 1, gen: 0, value: o.dict(catalog) },
            { num: 2, gen: 0, value: o.dict({ Type: o.name('Pages'), Kids: o.array([o.ref(3, 0)]), Count: o.int(1) }) },
            { num: 3, gen: 0, value: o.dict({
                Type: o.name('Page'), Parent: o.ref(2, 0), MediaBox: o.array([o.int(0), o.int(0), o.int(612), o.int(792)]),
                Contents: o.ref(4, 0), Resources: o.dict({ Font: o.dict({ F1: o.ref(5, 0) }) })
            }) },
            { num: 4, gen: 0, value: o.stream(o.dict({ Length: o.int(content.length) }), new TextEncoder().encode(content)) },
            { num: 5, gen: 0, value: o.dict({ Type: o.name('Font'), Subtype: o.name('Type1'), BaseFont: o.name('Helvetica') }) }
        ];
        if (xmp) {
            const bytes = new TextEncoder().encode(xmp);
            indirects.push({ num: 6, gen: 0, value: o.stream(o.dict({ Type: o.name('Metadata'), Subtype: o.name('XML'), Length: o.int(bytes.length) }), bytes) });
        }
        const opts = { indirects, root: { num: 1, gen: 0 }, version: '1.7' };
        if (info) {
            indirects.push({ num: 7, gen: 0, value: o.dict({ Title: o.string(info) }) });
            opts.info = { num: 7, gen: 0 };
        }
        return pdfReadApi.write(opts);
    }
    const front = async (bytes) => (await oconvApi.toMd({ name: 't.pdf', bytes, convertedAt: FIXED_AT })).markdown.split('\n---\n')[0];

    test('the Info /Title, decoded, after sourceName', async () => {
        const f = await front(titled({ info: Uint8Array.from([0x52, 0xe9, 0x73, 0x75, 0x6d, 0xe9, 0x80, 0x32]) }));
        expect(f).toContain('sourceName: t.pdf\ntitle: "Résumé• 2"'.replace('• 2', '•2'));
    });

    test('the XMP dc:title wins over the Info /Title', async () => {
        const f = await front(titled({ info: new TextEncoder().encode('Old'), xmp: XMP('New title') }));
        expect(f).toContain('title: "New title"');
        expect(f).not.toContain('Old');
    });

    test('no title: no key; a docx has none until T49', async () => {
        expect(await front(titled())).not.toContain('\ntitle:');
        const d = (await oconvApi.toMd({ name: 'x.docx', bytes: docxFixtureBytes(), convertedAt: FIXED_AT })).markdown;
        expect(d.split('\n---\n')[0]).not.toContain('\ntitle:');
    });
});

describe('oconv.toMd — the title of an office document (T49)', () => {
    const corpus = (rel) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../tests/_fixtures/corpus/${rel}`, import.meta.url))));
    const front = async (name, bytes) => (await oconvApi.toMd({ name, bytes, convertedAt: FIXED_AT })).markdown.split('\n---\n')[0];

    test('a docx core title, the pptx and odt fixtures', async () => {
        const rt = new ModuleRuntime();
        rt.registerAll(fw_require);
        rt.registerAll(modules);
        const opc = rt.resolve('opcPackage');
        const pkg = opc.read(docxFixtureBytes());
        const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties'
            + ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
            + ' xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title> Board minutes </dc:title></cp:coreProperties>';
        opc.setPart(pkg, '/docProps/core.xml', new TextEncoder().encode(core), 'application/vnd.openxmlformats-package.core-properties+xml');
        const rels = (pkg.rels['/'] || []).filter((r) => !/core-properties$/.test(r.Type));
        rels.push({ Id: 'rIdCore', Type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', Target: 'docProps/core.xml' });
        opc.setRels(pkg, '/', rels);
        expect(await front('x.docx', opc.write(pkg))).toContain('sourceName: x.docx\ntitle: "Board minutes"\n');
        expect(await front('s.pptx', corpus('pptx/poi-sampleshow.pptx'))).toContain('\ntitle: "SlideShow Sample"\n');
        expect(await front('o.odt', corpus('odt/odt-structured.odt'))).toContain('\ntitle: odt-structured.odt\n');
    });

    test('an empty title, or none, writes no key', async () => {
        expect(await front('f.xlsx', corpus('xlsx/poi-formula-eval.xlsx'))).not.toContain('\ntitle:');
        expect(await front('m.xlsx', corpus('xlsx/poi-simple-multicell.xlsx'))).not.toContain('\ntitle:');
    });
});

describe('oconv.convert — docx -> odt keeps the images it has no bytes for, and repeated names', () => {
    const bodyOf = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');

    test('md -> odt: an image with no bytes is an empty frame (image/placeholder) that reads back as written', async () => {
        const markdown = '# T\n\n![A chart](missing.png)\n';
        const written = await oconvApi.fromMd({ markdown, target: 'odt' });
        expect(written.losses).toContainEqual({ code: 'image/placeholder', detail: 'missing.png' });
        expect(written.losses.map((l) => l.code)).not.toContain('image/dropped');
        const back = await oconvApi.toMd({ name: 'x.odt', bytes: written.bytes, convertedAt: 'x' });
        expect(bodyOf(back.markdown)).toBe('# T\n\n![A chart](missing.png)\n');
    });

    test('docx -> odt -> md: a shape and two pictures of one name keep the body of the direct reading', async () => {
        const B = new Uint8Array([...PX_PNG, 0]);
        const source = docxApi.write({ body: [{ type: 'paragraph', children: [
            docxApi.shapeRun('rect', { name: 'Shape 1', description: 'A box' }),
            docxApi.imageRun(PX_PNG, { name: 'Picture', description: 'one' }),
            docxApi.imageRun(B, { name: 'Picture', description: 'two' })
        ] }] });
        const direct = await oconvApi.toMd({ name: 'x.docx', bytes: source, convertedAt: 'x' });
        expect(direct.assets.map((a) => a.name)).toEqual(['Shape 1', 'Picture', 'Picture (2)']);
        expect(direct.assets[2].bytes).toEqual(B);

        const odt = await oconvApi.convert({ name: 'x.docx', bytes: source, target: 'odt' });
        expect(odt.losses).toEqual([
            { code: 'image/bytes-unavailable', detail: 'Shape 1' },
            { code: 'image/placeholder', detail: 'Shape 1' }
        ]);
        const back = await oconvApi.toMd({ name: 'x.odt', bytes: odt.bytes, convertedAt: 'x' });
        expect(bodyOf(back.markdown)).toBe(bodyOf(direct.markdown));
    });
});

describe('oconv.convert — odt -> docx keeps nested lists and headings in list items', () => {
    const bodyOf = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');

    test('a three-level list (ordered, bullet, ordered) and a heading in a list item keep the body', async () => {
        const para = (text) => ({ type: 'paragraph', runs: [{ type: 'text', value: text }] });
        const source = odtApi.write({ body: [
            { type: 'list', ordered: true, items: [
                { children: [para('one'), { type: 'list', ordered: false, items: [
                    { children: [para('two'), { type: 'list', ordered: true, items: [{ children: [para('three')] }] }] }
                ] }] },
                { children: [{ type: 'heading', outlineLevel: 2, runs: [{ type: 'text', value: 'Numbered' }] }] }
            ] },
            para('end')
        ] });
        const direct = await oconvApi.toMd({ name: 'x.odt', bytes: source, convertedAt: 'x' });
        expect(bodyOf(direct.markdown)).toContain('   - two\n');
        expect(bodyOf(direct.markdown)).toContain('## Numbered');
        const docx = await oconvApi.convert({ name: 'x.odt', bytes: source, target: 'docx' });
        const back = await oconvApi.toMd({ name: 'x.docx', bytes: docx.bytes, convertedAt: 'x' });
        expect(bodyOf(back.markdown)).toBe(bodyOf(direct.markdown));
        expect(back.losses.map((l) => l.code)).not.toContain('list/nesting-flattened');
    });
});
