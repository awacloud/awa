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
            'oconvMdToIr', 'oconvIrToDocx', 'oconvIrToOdt', 'oconvIrToPdf'
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
    test('a front-matter block AND an odt-unwritable block produce reader loss THEN writer loss, in that order', async () => {
        const markdown = [
            '---',
            'title: x',
            '---',
            '[click here](http://example.com)',
            '',
            '***',
            ''
        ].join('\n');

        const result = await oconvApi.fromMd({ markdown, target: 'odt' });

        expect(result.lossy).toBe(true);
        expect(result.losses[0]).toEqual({ code: 'frontmatter/stripped', detail: 'yaml' });
        expect(result.losses.some(l => l.code === 'block/dropped' && l.detail === 'hr')).toBe(true);
        // Reader loss precedes the writer loss — the merge order the plan prescribes.
        const frontmatterIdx = result.losses.findIndex(l => l.code === 'frontmatter/stripped');
        const hrIdx = result.losses.findIndex(l => l.code === 'block/dropped');
        expect(frontmatterIdx).toBeLessThan(hrIdx);

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

    test('docx: the image is placed, ledger carries image/size-defaulted and NO image/dropped', async () => {
        const result = await oconvApi.fromMd({
            markdown: MD, target: 'docx', assets: { 'diagram.png': PX_PNG }
        });
        const read = docxApi.read(result.bytes);
        expect(Object.keys(read.images).length).toBeGreaterThan(0);
        expect(result.losses.map((l) => l.code)).toContain('image/size-defaulted');
        expect(result.losses.map((l) => l.code)).not.toContain('image/dropped');
    });

    test('odt: the image is placed, ledger carries image/size-defaulted and NO image/dropped', async () => {
        const result = await oconvApi.fromMd({
            markdown: MD, target: 'odt', assets: { 'diagram.png': PX_PNG }
        });
        expect(result.target).toBe('odt');
        const read = odtApi.read(result.bytes);
        expect(Object.keys(read.package.parts).filter((p) => p.startsWith('Pictures/')))
            .toEqual(['Pictures/image1.png']);
        expect(read.package.parts['Pictures/image1.png']).toEqual(PX_PNG);
        expect(result.losses.map((l) => l.code)).toContain('image/size-defaulted');
        expect(result.losses.map((l) => l.code)).not.toContain('image/dropped');
    });

    test('pdf: a JPEG places (no image loss), the PNG records the honest refusal', async () => {
        const placed = await oconvApi.fromMd({
            markdown: MD, target: 'pdf', assets: { 'diagram.png': PX_JPEG }
        });
        expect(placed.losses.some((l) => l.code === 'layout/image-dropped')).toBe(false);

        const refused = await oconvApi.fromMd({
            markdown: MD, target: 'pdf', assets: { 'diagram.png': PX_PNG }
        });
        const loss = refused.losses.find((l) => l.code === 'layout/image-dropped');
        expect(loss.detail).toMatchObject({
            name: 'diagram.png', alt: 'Alt',
            reason: 'unsupported-encoding', format: 'png'
        });
    });

    test('the markdown destination is the key VERBATIM — no normalisation, no path handling', async () => {
        const md = '# T\n\n![A](sub/dir/My_Diagram.PNG)\n';
        const result = await oconvApi.fromMd({
            markdown: md, target: 'docx', assets: { 'sub/dir/My_Diagram.PNG': PX_PNG }
        });
        expect(result.losses.map((l) => l.code)).toContain('image/size-defaulted');

        const missed = await oconvApi.fromMd({
            markdown: md, target: 'docx', assets: { 'My_Diagram.PNG': PX_PNG }
        });
        expect(missed.losses.map((l) => l.code)).toContain('image/dropped');
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
