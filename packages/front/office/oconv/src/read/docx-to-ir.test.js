// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { modules as ooxmlModules, fw_require as ooxmlFwRequire } from '@awacloud/ooxml';
import { oconvIr } from '../ir/ir.js';
import { oconvDocxToIr } from './docx-to-ir.js';
import { fw_require as oconvFwRequire, modules as oconvModules } from '../main.js';

// Spike-proven pattern (W0 FINDINGS, `oconv/BATCH_11/02-docx-to-ir.md`): a
// unit test hand-registers the needed descriptors on a local `ModuleRuntime`
// rather than going through a package composition root (task 05's concern).
let docxApi;
let docxNumberingMod;
let docxToIr;
let validate;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.registerAll(ooxmlFwRequire);
    runtime.registerAll(ooxmlModules);
    runtime.register(oconvIr);
    runtime.register(oconvDocxToIr);

    docxApi = runtime.resolve('docx');
    docxNumberingMod = runtime.resolve('docxNumbering');
    ({ docxToIr } = runtime.resolve('oconvDocxToIr'));
    ({ validate } = runtime.resolve('oconvIr'));
});

/** Minimal (not decodable) PNG-signature bytes — enough for docx's sniffer. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const TABLE_ROWS = [
    ['A1', 'B1', 'C1'],
    ['A2', 'B2', 'C2'],
    ['A3', 'B3', 'C3'],
    ['A4', 'B4', 'C4'],
    ['A5', 'B5', 'C5']
];

describe('oconvDocxToIr — descriptor', () => {
    test('is a fw module descriptor with the prescribed dependencies', () => {
        expect(oconvDocxToIr.name).toBe('oconvDocxToIr');
        expect(oconvDocxToIr.dependencies).toEqual(['oconvIr', 'docx']);
        expect(typeof oconvDocxToIr.factory).toBe('function');
    });
});

describe('oconvDocxToIr — composite fixture (tier 2)', () => {
    let ir;
    let losses;

    beforeAll(() => {
        const { numbering, numId: bulletNumId } = docxNumberingMod.bulletList();

        const body = [
            docxApi.paragraph('Report Title', { pPr: { pStyle: 'Heading2' } }),
            {
                type: 'paragraph',
                children: [
                    docxApi.run('bold', { bold: true }),
                    docxApi.run(' italic', { italic: true }),
                    docxApi.run(' strike', { strike: true }),
                    docxApi.run(' plain')
                ]
            },
            {
                type: 'paragraph',
                children: [docxApi.hyperlink('Example', 'https://example.test/', { rId: 'rIdExample' })]
            },
            {
                type: 'paragraph',
                children: [docxApi.imageRun(PNG_BYTES, { name: 'figure.png', description: 'A figure' })]
            },
            docxApi.listParagraph('top bullet', bulletNumId, 0),
            docxApi.listParagraph('nested bullet', bulletNumId, 1),
            docxApi.listParagraph('intended ordered', 2, 0),
            docxApi.tableFromRows(TABLE_ROWS)
        ];

        const bytes = docxApi.write({ body }, { numbering });
        const readResult = docxApi.read(bytes);
        ({ ir, losses } = docxToIr(readResult));
    });

    test('validates against the frozen oconv-ir/v1 schema (round-trip sanity)', () => {
        const res = validate(ir);
        expect(res.errors).toEqual([]);
        expect(res.ok).toBe(true);
    });

    test('maps the heading via the pStyle heuristic', () => {
        expect(ir.children[0]).toEqual({
            kind: 'heading', level: 2,
            children: [{
                kind: 'run', text: 'Report Title',
                bold: false, italic: false, strike: false, code: false, link: null
            }]
        });
    });

    test('maps bold/italic/strike runs; code stays false with no rPr.font', () => {
        expect(ir.children[1]).toEqual({
            kind: 'paragraph',
            children: [
                { kind: 'run', text: 'bold', bold: true, italic: false, strike: false, code: false, link: null },
                { kind: 'run', text: ' italic', bold: false, italic: true, strike: false, code: false, link: null },
                { kind: 'run', text: ' strike', bold: false, italic: false, strike: true, code: false, link: null },
                { kind: 'run', text: ' plain', bold: false, italic: false, strike: false, code: false, link: null }
            ]
        });
    });

    test('resolves the hyperlink target via readResult.hyperlinks[rId]', () => {
        expect(ir.children[2]).toEqual({
            kind: 'paragraph',
            children: [{
                kind: 'run', text: 'Example',
                bold: false, italic: false, strike: false, code: false,
                link: 'https://example.test/'
            }]
        });
    });

    test('maps the image as a reference-only node, bytes carried in escapes.docx', () => {
        const imgParagraph = ir.children[3];
        expect(imgParagraph.kind).toBe('paragraph');
        expect(imgParagraph.children).toHaveLength(1);
        const img = imgParagraph.children[0];
        expect(img.kind).toBe('image');
        expect(img.name).toBe('figure.png');
        expect(img.alt).toBe('A figure');
        expect(img.escapes.docx.contentType).toBe('image/png');
        expect(Array.from(img.escapes.docx.bytes)).toEqual(Array.from(PNG_BYTES));
    });

    test('groups the bullet list (numId resolves) into one ordered:false list', () => {
        const list1 = ir.children[4];
        expect(list1.kind).toBe('list');
        expect(list1.ordered).toBe(false);
        expect(list1.children).toHaveLength(2);
        const texts = list1.children.map(li => li.children[0].children[0].text);
        expect(texts).toEqual(['top bullet', 'nested bullet']);
    });

    test('falls back to ordered:false for the unresolved numId', () => {
        const list2 = ir.children[5];
        expect(list2.kind).toBe('list');
        expect(list2.ordered).toBe(false);
        expect(list2.children).toHaveLength(1);
        expect(list2.children[0].children[0].children[0].text).toBe('intended ordered');
    });

    test('maps the 5x3 table with cell paragraphs, no row ever marked header', () => {
        const table = ir.children[6];
        expect(table.kind).toBe('table');
        expect(table.children).toHaveLength(5);
        for (const row of table.children) {
            expect(row.kind).toBe('row');
            expect(row.header).toBe(false);
            expect(row.children).toHaveLength(3);
        }
        expect(table.children[0].children[0].children[0].children[0].text).toBe('A1');
        expect(table.children[4].children[2].children[0].children[0].text).toBe('C5');
    });

    test('records exactly the two list losses (nesting-flattened once, numbering-unresolved)', () => {
        expect(losses).toEqual([
            { code: 'list/nesting-flattened', detail: 'numId 1 ilvl 1' },
            { code: 'list/numbering-unresolved', detail: 'numId 2' }
        ]);
    });
});

describe('oconvDocxToIr — hyperlink without a resolvable target', () => {
    test('keeps the text and records link/target-missing', () => {
        // The hyperlink is built with no target and no rId, so the written
        // <w:hyperlink> has no r:id — the read-back node carries no rId.
        const body = [{
            type: 'paragraph',
            children: [docxApi.hyperlink('missing link text', undefined)]
        }];
        const bytes = docxApi.write({ body });
        const readResult = docxApi.read(bytes);
        const { ir, losses } = docxToIr(readResult);

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([
            { code: 'link/target-missing', detail: 'missing link text' }
        ]);
        expect(ir.children).toEqual([{
            kind: 'paragraph',
            children: [{
                kind: 'run', text: 'missing link text',
                bold: false, italic: false, strike: false, code: false, link: null
            }]
        }]);
    });
});

// BATCH_39 task 04 (claim pinning, FINDINGS § 5.4 C37) — `image/bytes-
// unavailable` (`src/read/docx-to-ir.js:173`) had no producing test; the
// only mention was a comment at
// `tests/crossformat-ooxml-odf.integration.test.js:245`.
describe('oconvDocxToIr — image with unresolved bytes (C37)', () => {
    test('a drawing whose r:embed relationship never resolves records image/bytes-unavailable', () => {
        // Unlike `docxApi.imageRun`, which always registers an image part +
        // relationship, this drawing node carries no `image` payload at
        // all — `drawing.js`'s `renderPic` then emits a bare `<a:blip/>`
        // with no `r:embed` attribute, so on read `docx.js:322-329` never
        // finds a matching `result.images[embedRef]` entry and `d.image`
        // stays unset — the exact "bytes were not resolved on read" case
        // the module header documents.
        const body = [{
            type: 'paragraph',
            children: [{
                type: 'run',
                children: [{ type: 'drawing', docName: 'figure.png', description: 'Missing image' }]
            }]
        }];
        const bytes = docxApi.write({ body });
        const readResult = docxApi.read(bytes);
        const { ir, losses } = docxToIr(readResult);

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([
            { code: 'image/bytes-unavailable', detail: 'figure.png' }
        ]);
        const img = ir.children[0].children[0];
        expect(img.kind).toBe('image');
        expect(img.name).toBe('figure.png');
        expect(img.alt).toBe('Missing image');
        expect(img.escapes).toBeUndefined();
    });
});

describe('oconvDocxToIr — empty document', () => {
    test('produces a valid empty IR with no losses', () => {
        const bytes = docxApi.write({ body: [] });
        const readResult = docxApi.read(bytes);
        const { ir, losses } = docxToIr(readResult);

        expect(validate(ir).ok).toBe(true);
        expect(ir).toEqual({ kind: 'document', children: [] });
        expect(losses).toEqual([]);
    });
});

describe('oconvDocxToIr — monospace detection (rPr.font allowlist, office/BATCH_35)', () => {
    /** @returns {boolean} the `code` flag of the sole run in a one-run, one-paragraph document written with the given `rPr`. */
    function codeFlagFor(rPr) {
        const bytes = docxApi.write({
            body: [{ type: 'paragraph', children: [docxApi.run('x', rPr)] }]
        });
        const readResult = docxApi.read(bytes);
        const { ir, losses } = docxToIr(readResult);
        expect(losses).toEqual([]);
        return ir.children[0].children[0].code;
    }

    test('an allowlisted font (Consolas) sets code:true', () => {
        expect(codeFlagFor({ font: 'Consolas' })).toBe(true);
    });

    test('an allowlisted font is matched case- and space-insensitively', () => {
        expect(codeFlagFor({ font: ' courier new ' })).toBe(true);
    });

    test('a non-allowlisted font (Calibri) sets code:false', () => {
        expect(codeFlagFor({ font: 'Calibri' })).toBe(false);
    });

    test('a run with no rPr.font at all sets code:false', () => {
        expect(codeFlagFor(undefined)).toBe(false);
    });

    test('bold and code both set independently on the same run', () => {
        const bytes = docxApi.write({
            body: [{
                type: 'paragraph',
                children: [docxApi.run('x', { font: 'Menlo', bold: true })]
            }]
        });
        const { ir } = docxToIr(docxApi.read(bytes));
        expect(ir.children[0].children[0]).toEqual({
            kind: 'run', text: 'x',
            bold: true, italic: false, strike: false, code: true, link: null
        });
    });

    test('every frozen allowlist entry is recognised', () => {
        const names = [
            'consolas', 'courier new', 'courier', 'lucida console',
            'liberation mono', 'dejavu sans mono', 'source code pro',
            'cascadia code', 'cascadia mono', 'menlo', 'monaco', 'fira code',
            'fira mono', 'jetbrains mono', 'roboto mono', 'ubuntu mono',
            'noto sans mono', 'noto mono'
        ];
        for (const font of names) {
            expect(codeFlagFor({ font })).toBe(true);
        }
    });
});

// Heading levels resolved by built-in style NAME (localized style IDs): a
// French Word installation writes `Titre1` / `Titre` / `Sous-titre` as style
// IDs while `styles.xml` keeps the language-invariant `w:name` values
// `heading 1` / `Title` / `Subtitle`.
const FR_STYLES = {
    styles: [
        { type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true },
        { type: 'paragraph', styleId: 'Titre', name: 'Title' },
        { type: 'paragraph', styleId: 'Sous-titre', name: 'Subtitle' },
        { type: 'paragraph', styleId: 'Titre1', name: 'heading 1' },
        { type: 'paragraph', styleId: 'Titre2', name: 'heading 2' },
        { type: 'paragraph', styleId: 'Titre3', name: 'heading 3' }
    ]
};

/** @returns {{kind: string, level: (number|undefined), text: string}[]} a compact view of the IR's top-level blocks. */
function blockView(ir) {
    return ir.children.map(b => ({
        kind: b.kind,
        level: b.level,
        text: (b.children || []).map(r => r.text || '').join('')
    }));
}

describe('oconvDocxToIr — heading levels by built-in style name', () => {
    /** Mixed body: an English `Heading3` ID, the French IDs, an unknown ID. */
    function mixedBody() {
        return [
            docxApi.paragraph('Rapport annuel', { pPr: { pStyle: 'Titre' } }),
            docxApi.paragraph('Exercice 2026', { pPr: { pStyle: 'Sous-titre' } }),
            docxApi.paragraph('Introduction', { pPr: { pStyle: 'Titre1' } }),
            docxApi.paragraph('English level three', { pPr: { pStyle: 'Heading3' } }),
            docxApi.paragraph('Unknown style', { pPr: { pStyle: 'Titre9' } }),
            docxApi.paragraph('Plain prose.')
        ];
    }

    test('with styles.xml: Title → h1, Titre1 (heading 1) → h1, Heading3 → h3, Subtitle → paragraph + one loss, Titre9 → paragraph, no loss', () => {
        const bytes = docxApi.write({ body: mixedBody() }, { styles: FR_STYLES });
        const { ir, losses } = docxToIr(docxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(blockView(ir)).toEqual([
            { kind: 'heading', level: 1, text: 'Rapport annuel' },
            { kind: 'paragraph', level: undefined, text: 'Exercice 2026' },
            { kind: 'heading', level: 1, text: 'Introduction' },
            { kind: 'heading', level: 3, text: 'English level three' },
            { kind: 'paragraph', level: undefined, text: 'Unknown style' },
            { kind: 'paragraph', level: undefined, text: 'Plain prose.' }
        ]);
        expect(losses).toEqual([
            { code: 'heading/subtitle-degraded', detail: 'Sous-titre' }
        ]);
    });

    test('the SAME body written WITHOUT opts.styles: only the Heading<N> ID rule applies, no loss (documented limit)', () => {
        const bytes = docxApi.write({ body: mixedBody() });
        const readResult = docxApi.read(bytes);
        expect(readResult.styles).toBeUndefined();
        const { ir, losses } = docxToIr(readResult);

        expect(validate(ir).ok).toBe(true);
        expect(blockView(ir)).toEqual([
            { kind: 'paragraph', level: undefined, text: 'Rapport annuel' },
            { kind: 'paragraph', level: undefined, text: 'Exercice 2026' },
            { kind: 'paragraph', level: undefined, text: 'Introduction' },
            { kind: 'heading', level: 3, text: 'English level three' },
            { kind: 'paragraph', level: undefined, text: 'Unknown style' },
            { kind: 'paragraph', level: undefined, text: 'Plain prose.' }
        ]);
        expect(losses).toEqual([]);
    });

    test('an EMPTY Subtitle paragraph emits no block but still records exactly one loss', () => {
        const body = [
            { type: 'paragraph', pPr: { pStyle: 'Sous-titre' }, children: [] },
            docxApi.paragraph('After.')
        ];
        const bytes = docxApi.write({ body }, { styles: FR_STYLES });
        const { ir, losses } = docxToIr(docxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(blockView(ir)).toEqual([
            { kind: 'paragraph', level: undefined, text: 'After.' }
        ]);
        expect(losses).toEqual([
            { code: 'heading/subtitle-degraded', detail: 'Sous-titre' }
        ]);
    });

    test('a resolved heading style still takes precedence over pPr.numPr', () => {
        const body = [{
            type: 'paragraph',
            pPr: { pStyle: 'Titre2', numPr: { numId: 7, ilvl: 0 } },
            children: [docxApi.run('Numbered heading')]
        }];
        const bytes = docxApi.write({ body }, {
            styles: FR_STYLES,
            numbering: {
                abstractNums: [{ abstractNumId: 0, levels: [{ ilvl: 0, numFmt: 'decimal', lvlText: '%1.' }] }],
                nums: [{ numId: 7, abstractNumId: 0 }]
            }
        });
        const { ir, losses } = docxToIr(docxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(blockView(ir)).toEqual([
            { kind: 'heading', level: 2, text: 'Numbered heading' }
        ]);
        expect(losses).toEqual([]);
    });
});

describe('oconvDocxToIr — committed French-styled fixture (docx-fr-styles.docx)', () => {
    const FIXTURE = new URL('../../tests/_fixtures/corpus/docx/docx-fr-styles.docx', import.meta.url);
    let bytes;

    beforeAll(() => {
        bytes = new Uint8Array(readFileSync(FIXTURE));
    });

    test('docxToIr: heading levels [1, 1, 2, 3] in order, Subtitle kept as a paragraph, exactly one loss', () => {
        const { ir, losses } = docxToIr(docxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        const headings = ir.children.filter(b => b.kind === 'heading');
        expect(headings.map(h => h.level)).toEqual([1, 1, 2, 3]);
        expect(blockView(ir)).toEqual([
            { kind: 'heading', level: 1, text: 'Rapport annuel' },
            { kind: 'paragraph', level: undefined, text: 'Exercice 2026' },
            { kind: 'heading', level: 1, text: 'Introduction' },
            { kind: 'paragraph', level: undefined, text: 'Résumé des activités de l\'année.' },
            { kind: 'heading', level: 2, text: 'Contexte' },
            { kind: 'heading', level: 3, text: 'Détails' },
            { kind: 'paragraph', level: undefined, text: 'Fin.' }
        ]);
        expect(losses).toEqual([
            { code: 'heading/subtitle-degraded', detail: 'Sous-titre' }
        ]);
    });

    test('through the oconv.toMd facade: ATX headings, the subtitle as a plain line, the loss in the front matter', async () => {
        const runtime = new ModuleRuntime();
        runtime.registerAll(oconvFwRequire);
        runtime.registerAll(oconvModules);
        const oconv = runtime.resolve('oconv');

        const result = await oconv.toMd({
            name: 'docx-fr-styles.docx', bytes, convertedAt: '2026-01-01T00:00:00Z'
        });
        const md = result.markdown;
        const end = md.indexOf('\n---\n', 4);
        expect(md.startsWith('---\n')).toBe(true);
        expect(end).toBeGreaterThan(0);
        const frontMatter = md.slice(0, end);
        const lines = md.slice(end + 5).split('\n');

        expect(lines).toContain('# Rapport annuel');
        expect(lines).toContain('# Introduction');
        expect(lines).toContain('## Contexte');
        expect(lines).toContain('### Détails');
        expect(lines).toContain('Exercice 2026');
        expect(lines.some(l => /^#+ Exercice 2026$/.test(l))).toBe(false);

        expect(frontMatter).toContain('\nlossy: true');
        expect(frontMatter).toMatch(/\nlosses:\n\s+- \{ code: heading\/subtitle-degraded, detail: Sous-titre \}/);
        expect(result.losses).toEqual([
            { code: 'heading/subtitle-degraded', detail: 'Sous-titre' }
        ]);
    });
});
