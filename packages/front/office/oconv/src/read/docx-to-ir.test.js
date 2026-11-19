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
let opcApi;
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
    opcApi = runtime.resolve('opcPackage');
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
        expect(oconvDocxToIr.dependencies).toEqual(['oconvIr', 'docx', 'docxStructure']);
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

        // `docx.write` refuses a numId its `nums` do not declare
        // (`docx/numbering-unknown-num`), so num 2 is declared for the
        // write and dropped from the read result: the reader then meets a
        // source whose numbering part lacks num 2, as some real files do.
        const writeNumbering = { ...numbering,
            nums: [...numbering.nums, { numId: 2, abstractNumId: numbering.nums[0].abstractNumId }] };
        const bytes = docxApi.write({ body }, { numbering: writeNumbering });
        const readResult = docxApi.read(bytes);
        readResult.numbering.nums = readResult.numbering.nums.filter((n) => n.numId !== 2);
        ({ ir, losses } = docxToIr(readResult));
    });

    test('validates against the oconv-ir/v2 schema (round-trip sanity)', () => {
        const res = validate(ir);
        expect(res.errors).toEqual([]);
        expect(res.ok).toBe(true);
    });

    test('maps the heading via the pStyle heuristic', () => {
        expect(ir.children[0]).toEqual({
            kind: 'heading', level: 2, align: null, breakBefore: false,
            children: [{
                kind: 'run', text: 'Report Title',
                bold: false, italic: false, strike: false, code: false, link: null, size: null, font: null, color: null, underline: false, script: null
            }]
        });
    });

    test('maps bold/italic/strike runs; code stays false with no rPr.font', () => {
        expect(ir.children[1]).toEqual({
            kind: 'paragraph', align: null, breakBefore: false,
            children: [
                { kind: 'run', text: 'bold', bold: true, italic: false, strike: false, code: false, link: null, size: null, font: null, color: null, underline: false, script: null },
                { kind: 'run', text: ' italic', bold: false, italic: true, strike: false, code: false, link: null, size: null, font: null, color: null, underline: false, script: null },
                { kind: 'run', text: ' strike', bold: false, italic: false, strike: true, code: false, link: null, size: null, font: null, color: null, underline: false, script: null },
                { kind: 'run', text: ' plain', bold: false, italic: false, strike: false, code: false, link: null, size: null, font: null, color: null, underline: false, script: null }
            ]
        });
    });

    test('resolves the hyperlink target via readResult.hyperlinks[rId]', () => {
        expect(ir.children[2]).toEqual({
            kind: 'paragraph', align: null, breakBefore: false,
            children: [{
                kind: 'run', text: 'Example',
                bold: false, italic: false, strike: false, code: false,
                link: 'https://example.test/', size: null, font: null, color: null, underline: false, script: null
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

    test('groups the bullet list (numId resolves) into one ordered:false list, the ilvl 1 item nested', () => {
        const list1 = ir.children[4];
        expect(list1.kind).toBe('list');
        expect(list1.ordered).toBe(false);
        expect(list1.children).toHaveLength(1);
        const [top] = list1.children;
        expect(top.children[0].children[0].text).toBe('top bullet');
        const nested = top.children[1];
        expect(nested.kind).toBe('list');
        expect(nested.children.map(li => li.children[0].children[0].text)).toEqual(['nested bullet']);
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

    test('records exactly the one list loss (numbering-unresolved); nesting is kept, not flattened', () => {
        expect(losses).toEqual([
            { code: 'list/numbering-unresolved', detail: 'numId 2' }
        ]);
    });
});

// T68 (D52 A): a smart tag is typed by ooxml; its runs read in place.
describe('oconvDocxToIr — a smart tag reads in place (T68)', () => {
    test("the smart tag's text is written where it stands", () => {
        const run = (text) => ({ type: 'run', children: [{ type: 'text', value: text }] });
        const body = [{
            type: 'paragraph',
            children: [run('Visit '), { type: 'smartTag', attrs: { 'w:element': 'place' }, children: [run('Paris')] }, run(' today')]
        }];
        const bytes = docxApi.write({ body });
        const { ir } = docxToIr(docxApi.read(bytes));
        const text = ir.children[0].children.map((r) => r.text).join('');
        expect(text).toBe('Visit Paris today');
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
            kind: 'paragraph', align: null, breakBefore: false,
            children: [{
                kind: 'run', text: 'missing link text',
                bold: false, italic: false, strike: false, code: false, link: null, size: null, font: null, color: null, underline: false, script: null
            }]
        }]);
    });
});

describe('oconvDocxToIr — repeated drawing names', () => {
    test('a later image of a name takes the first free " (k)", so distinct pictures never share a name', () => {
        const A = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
        const B = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 2]);
        const drawing = (docName, data) => ({ type: 'drawing', docName, description: '',
            ...(data ? { image: { data, contentType: 'image/png' } } : {}) });
        const { ir, losses } = docxToIr({ document: { body: [{ type: 'paragraph', children: [{ type: 'run', children: [
            drawing('Picture', A), drawing('Picture', B), drawing('Picture'),
            drawing('Picture (2)', A), drawing('Other', A), drawing(undefined, B), drawing(undefined, B)
        ] }] }] } });

        expect(validate(ir).ok).toBe(true);
        const images = ir.children[0].children;
        expect(images.map((i) => i.name)).toEqual([
            'Picture', 'Picture (2)', 'Picture (3)', 'Picture (2) (2)', 'Other', 'image', 'image (2)'
        ]);
        expect(images.map((i) => i.escapes && i.escapes.docx.bytes)).toEqual([A, B, undefined, A, A, B, B]);
        expect(losses).toEqual([{ code: 'image/bytes-unavailable', detail: 'Picture (3)' }]);
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

describe('oconvDocxToIr — block math as Word writes it', () => {
    test('a paragraph holding only m:oMathPara records block/dropped instead of vanishing', () => {
        const pkg = opcApi.read(docxApi.write({ body: [docxApi.paragraph('MATH'), docxApi.paragraph('After')] }));
        const math = '<m:oMathPara><m:oMath><m:r><m:t>x=1</m:t></m:r></m:oMath></m:oMathPara>';
        const xmlText = new TextDecoder().decode(pkg.parts['/word/document.xml'])
            .replace(/<w:r><w:t xml:space="preserve">MATH<\/w:t><\/w:r>/, math);
        expect(xmlText).toContain(`<w:p>${math}</w:p>`);
        pkg.parts['/word/document.xml'] = new TextEncoder().encode(xmlText);
        const { ir, losses } = docxToIr(docxApi.read(opcApi.write(pkg)));

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([{ code: 'block/dropped', detail: 'oMathPara' }]);
        expect(ir.children.map(n => n.kind)).toEqual(['paragraph']);
    });
});

describe('oconvDocxToIr — empty document', () => {
    test('produces a valid empty IR with no losses', () => {
        const bytes = docxApi.write({ body: [] });
        const readResult = docxApi.read(bytes);
        const { ir, losses } = docxToIr(readResult);

        expect(validate(ir).ok).toBe(true);
        expect(ir).toEqual({ kind: 'document', page: null, header: null, footer: null, children: [] });
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
            bold: true, italic: false, strike: false, code: true, link: null, size: null, font: null, color: null, underline: false, script: null
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

// Code blocks, quotes and rules by paragraph style: pandoc writes `SourceCode`
// ("Source Code") and `BlockText` ("Block Text"); Word's built-in quote
// styles are named `Quote` / `Intense Quote` and localized by ID (French
// `Citation`, `Citationintense`).
const BLOCK_STYLES = {
    styles: [
        { type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true },
        { type: 'paragraph', styleId: 'Code', name: 'Source Code' },
        { type: 'paragraph', styleId: 'Citation', name: 'Quote' },
        { type: 'paragraph', styleId: 'Citationintense', name: 'Intense Quote' },
        { type: 'paragraph', styleId: 'Filet', name: 'Horizontal Rule' }
    ]
};

describe('oconvDocxToIr — code blocks, quotes and rules by paragraph style', () => {
    /** A paragraph of one run holding `children` (text / break / tab nodes). */
    const styled = (pStyle, children) => ({
        type: 'paragraph', pPr: { pStyle }, children: [{ type: 'run', children }]
    });
    const text = value => ({ type: 'text', value });

    test('a Source Code paragraph → codeBlock; breaks → newlines, tabs → tabs', () => {
        const body = [
            styled('Code', [text('if (a) {'), { type: 'break' }, { type: 'tab' },
                text('b();'), { type: 'break' }, { type: 'break' }, text('}')]),
            docxApi.paragraph('After.')
        ];
        const bytes = docxApi.write({ body }, { styles: BLOCK_STYLES });
        const { ir, losses } = docxToIr(docxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children[0]).toEqual(
            { kind: 'codeBlock', info: '', text: 'if (a) {\n\tb();\n\n}' });
        expect(ir.children[1].kind).toBe('paragraph');
    });

    test('the SourceCode ID is recognised without a styles part (pandoc / this writer)', () => {
        const bytes = docxApi.write({ body: [styled('SourceCode', [text('x = 1')])] });
        const readResult = docxApi.read(bytes);
        expect(readResult.styles).toBeUndefined();

        expect(docxToIr(readResult).ir.children)
            .toEqual([{ kind: 'codeBlock', info: '', text: 'x = 1' }]);
    });

    test('two code paragraphs stay two code blocks (no merge)', () => {
        const body = [styled('Code', [text('one')]), styled('Code', [text('two')])];
        const bytes = docxApi.write({ body }, { styles: BLOCK_STYLES });

        expect(docxToIr(docxApi.read(bytes)).ir.children.map(b => b.text))
            .toEqual(['one', 'two']);
    });

    test('consecutive quote paragraphs (Quote, Intense Quote, BlockText) → ONE blockquote', () => {
        const body = [
            docxApi.paragraph('Q1', { pPr: { pStyle: 'Citation' } }),
            docxApi.paragraph('Q2', { pPr: { pStyle: 'Citationintense' }, rPr: { bold: true } }),
            docxApi.paragraph('Q3', { pPr: { pStyle: 'BlockText' } }),
            docxApi.paragraph('Between.'),
            docxApi.paragraph('Q4', { pPr: { pStyle: 'Citation' } })
        ];
        const bytes = docxApi.write({ body }, { styles: BLOCK_STYLES });
        const { ir, losses } = docxToIr(docxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children.map(b => b.kind)).toEqual(['blockquote', 'paragraph', 'blockquote']);
        const first = ir.children[0];
        expect(first.children.map(p => p.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
        expect(first.children.map(p => p.children[0].text)).toEqual(['Q1', 'Q2', 'Q3']);
        expect(first.children[1].children[0].bold).toBe(true);
    });

    test('an empty quote paragraph is skipped and does not split the quote', () => {
        const body = [
            docxApi.paragraph('Q1', { pPr: { pStyle: 'Citation' } }),
            { type: 'paragraph', pPr: { pStyle: 'Citation' }, children: [] },
            docxApi.paragraph('Q2', { pPr: { pStyle: 'Citation' } })
        ];
        const bytes = docxApi.write({ body }, { styles: BLOCK_STYLES });
        const { ir } = docxToIr(docxApi.read(bytes));

        expect(ir.children).toHaveLength(1);
        expect(ir.children[0].children.map(p => p.children[0].text)).toEqual(['Q1', 'Q2']);
    });

    test('an EMPTY Horizontal Rule paragraph → hr; one with text stays a paragraph', () => {
        const body = [
            { type: 'paragraph', pPr: { pStyle: 'Filet' }, children: [] },
            { type: 'paragraph', pPr: { pStyle: 'HorizontalRule' }, children: [] },
            docxApi.paragraph('Not a rule', { pPr: { pStyle: 'Filet' } })
        ];
        const bytes = docxApi.write({ body }, { styles: BLOCK_STYLES });
        const { ir, losses } = docxToIr(docxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children.map(b => b.kind)).toEqual(['hr', 'hr', 'paragraph']);
    });

    test('an unrelated empty paragraph is still skipped (spacer rule unchanged)', () => {
        const body = [{ type: 'paragraph', children: [] }, docxApi.paragraph('Only.')];
        const bytes = docxApi.write({ body }, { styles: BLOCK_STYLES });

        expect(blockView(docxToIr(docxApi.read(bytes)).ir))
            .toEqual([{ kind: 'paragraph', level: undefined, text: 'Only.' }]);
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

describe('oconvDocxToIr — tracked changes, the accepted view (T31)', () => {
    test('inserted and moved-to text is read, deleted and moved-from text is not; a link inside an insertion keeps its target', async () => {
        const text = (value) => ({ type: 'run', children: [{ type: 'text', value }] });
        const body = [{
            type: 'paragraph',
            children: [
                text('Keep'),
                { type: 'moveFrom', id: '1', author: 'Ann', children: [text(' MOVEDFROM')] },
                { type: 'ins', id: '2', author: 'Ann', children: [docxApi.hyperlink(' new link', 'https://example.test/ins', { rId: 'rIdIns' })] },
                { type: 'del', id: '3', author: 'Ann', children: [{ type: 'run', children: [{ type: 'delText', value: ' DELETED' }] }] },
                { type: 'moveTo', id: '4', author: 'Ann', children: [text(' moved')] }
            ]
        }];
        const { ir } = docxToIr(docxApi.read(docxApi.write({ body })));
        const runs = ir.children[0].children;
        expect(runs.map((r) => r.text).join('')).toBe('Keep new link moved');
        expect(runs.find((r) => r.text === ' new link').link).toBe('https://example.test/ins');
    });
});

describe('oconvDocxToIr — revisions inside a hyperlink (T31 c6)', () => {
    test('an insertion inside a link is read with its target, a deletion inside it is not', async () => {
        const link = docxApi.hyperlink('see ', 'https://example.test/toc', { rId: 'rIdToc' });
        link.children.push(
            { type: 'del', id: '1', author: 'Ann', children: [{ type: 'run', children: [{ type: 'delText', value: 'DELETED' }] }] },
            { type: 'ins', id: '2', author: 'Ann', children: [{ type: 'run', children: [{ type: 'text', value: 'page 3' }] }] }
        );
        const { ir, losses } = docxToIr(docxApi.read(docxApi.write({ body: [{ type: 'paragraph', children: [link] }] })));
        const runs = ir.children[0].children;
        expect(runs.map((r) => r.text).join('')).toBe('see page 3');
        expect(runs.every((r) => r.link === 'https://example.test/toc')).toBe(true);
        expect(losses).toEqual([]);
    });
});

describe('oconvDocxToIr — revision range markers (T31 c3)', () => {
    test('a body-level range marker is markup: no loss, and it does not split a list', () => {
        const { numbering, numId } = docxNumberingMod.bulletList();
        const marker = { type: 'rangeMarker', name: 'moveFromRangeEnd', attrs: { 'w:id': '2' } };
        const body = [
            docxApi.paragraph('before'),
            marker,
            docxApi.listParagraph('one', numId, 0),
            marker,
            docxApi.listParagraph('two', numId, 0)
        ];
        const { ir, losses } = docxToIr(docxApi.read(docxApi.write({ body }, { numbering })));
        expect(losses).toEqual([]);
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'list']);
        expect(ir.children[1].children).toHaveLength(2);
    });
});

describe('oconvDocxToIr — a leading ballot box reads as a GFM task marker (T28)', () => {
    const NUMBERING = {
        abstractNums: [{ abstractNumId: 0, levels: [{ ilvl: 0, numFmt: 'bullet', lvlText: '•' }] }],
        nums: [{ numId: 1, abstractNumId: 0 }]
    };
    /** A docx of one bullet item per entry; each entry lists its runs' texts. */
    function itemsOf(...items) {
        const body = items.map((texts) => ({
            type: 'paragraph',
            pPr: { numPr: { numId: 1, ilvl: 0 } },
            children: texts.map((t) => docxApi.run(t))
        }));
        const { ir, losses } = docxToIr(docxApi.read(docxApi.write({ body }, { numbering: NUMBERING })));
        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        return ir.children[0].children.map((li) => ({
            task: li.escapes?.md?.task,
            text: li.children[0].children.map((r) => r.text).join('')
        }));
    }

    test('☒ then a space in the first run, or ☐ and a space as a run of its own: checked / unchecked, the glyph stripped', () => {
        expect(itemsOf(['☒ done'], ['☐ ', 'todo'])).toEqual([
            { task: 'checked', text: 'done' },
            { task: 'unchecked', text: 'todo' }
        ]);
    });

    test('no space after the glyph, the glyph after text, or ☑: plain text', () => {
        expect(itemsOf(['☐x'], ['a ☒ b'], ['☑ ticked'])).toEqual([
            { task: undefined, text: '☐x' },
            { task: undefined, text: 'a ☒ b' },
            { task: undefined, text: '☑ ticked' }
        ]);
    });

    test('a paragraph outside a list keeps the glyph', () => {
        const { ir } = docxToIr(docxApi.read(docxApi.write({ body: [{ type: 'paragraph', children: [docxApi.run('☐ not a task')] }] })));
        expect(ir.children[0]).toMatchObject({ kind: 'paragraph' });
        expect(ir.children[0].children[0].text).toBe('☐ not a task');
    });
});

describe('oconvDocxToIr — a table without a row', () => {
    test('is skipped without a loss, as an empty paragraph is', () => {
        const { ir, losses } = docxToIr({ document: { body: [
            { type: 'paragraph', children: [{ type: 'run', children: [{ type: 'text', value: 'before' }] }] },
            { type: 'table', rows: [] },
            { type: 'paragraph', children: [{ type: 'run', children: [{ type: 'text', value: 'after' }] }] }
        ] } });

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'paragraph']);
    });
});

describe('oconvDocxToIr — a cell inside a content control', () => {
    test('a cell wrapped in a row-level w:sdt reads its text in place', () => {
        const bytes = docxApi.write({ body: [{ type: 'table', rows: [{ type: 'row', cells: [
            { type: 'cell', children: [docxApi.paragraph('Title')], sdt: [{ group: 0, properties: { alias: 'Title' } }] },
            { type: 'cell', children: [docxApi.paragraph('Body')] }
        ] }] }] });
        const read = docxApi.read(bytes);
        // Non-vacuity: the cell really sits in a w:sdt of the written row.
        expect(read.document.body[0].rows[0].cells[0].sdt[0].properties.alias).toBe('Title');
        const { ir, losses } = docxToIr(read);

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        const cells = ir.children[0].children[0].children;
        expect(cells.map((c) => c.children[0].children[0].text)).toEqual(['Title', 'Body']);
    });
});

describe('oconvDocxToIr — nested lists by level', () => {
    const N = oconvIr.factory().node;
    const item = (text, ilvl, numId = 1) => ({ type: 'paragraph', pPr: { numPr: { numId, ilvl } },
        children: [{ type: 'run', children: [{ type: 'text', value: text }] }] });
    const numbering = { abstractNums: [{ abstractNumId: 7, levels: [
        { ilvl: 0, numFmt: 'decimal' }, { ilvl: 1, numFmt: 'bullet' }, { ilvl: 2, numFmt: 'lowerLetter' }
    ] }], nums: [{ numId: 1, abstractNumId: 7 }] };
    const li = (text, ...nested) => N('listItem', {}, [N('paragraph', {}, [N('run', { text })]), ...nested]);
    const list = (ordered, items) => N('list', { ordered }, items);
    const read = (body) => docxToIr({ numbering, document: { body } });

    test('items at ilvl 0, 1, 1, 2, 0 form the nested tree, each level ordered by its own numFmt', () => {
        const { ir, losses } = read([item('a', 0), item('b', 1), item('c', 1), item('d', 2), item('e', 0)]);
        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([list(true, [
            li('a', list(false, [li('b'), li('c', list(true, [li('d')]))])),
            li('e')
        ])]);
    });

    test('a skipped level adds an item holding only the nested list', () => {
        const { ir, losses } = read([item('a', 0), item('b', 2)]);
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([list(true, [
            li('a', list(false, [N('listItem', {}, [list(true, [li('b')])])]))
        ])]);
    });

    test('a deeper paragraph of another numId nests; another numId at the first level starts a new list', () => {
        const two = { abstractNums: [...numbering.abstractNums, { abstractNumId: 8, levels: [
            { ilvl: 0, numFmt: 'bullet' }, { ilvl: 1, numFmt: 'bullet' }
        ] }], nums: [...numbering.nums, { numId: 2, abstractNumId: 8 }] };
        const { ir, losses } = docxToIr({ numbering: two, document: { body: [
            item('a', 0), item('b', 1, 2), item('c', 1, 2), item('d', 0), item('e', 0, 2)
        ] } });
        expect(losses).toEqual([]);
        expect(ir.children).toEqual([
            list(true, [li('a', list(false, [li('b'), li('c')])), li('d')]),
            list(false, [li('e')])
        ]);
    });

    test('a group that starts at ilvl 1 takes that level as its root', () => {
        const { ir } = read([item('x', 1), item('y', 2), item('z', 1)]);
        expect(ir.children).toEqual([list(false, [li('x', list(true, [li('y')])), li('z')])]);
    });
});

describe('oconvDocxToIr — block-level bookmarks and range markup (T51 f)', () => {
    test('a body-level bookmark, comment range end or permission end is markup: no loss, one list', () => {
        const { numbering, numId } = docxNumberingMod.bulletList();
        const body = [
            docxApi.paragraph('before'),
            { type: 'bookmarkStart', id: '1', name: 'b' },
            docxApi.listParagraph('one', numId, 0),
            { type: 'bookmarkEnd', id: '1' },
            { type: 'commentRangeEnd', id: '2' },
            { type: 'rangeMarker', name: 'permEnd', attrs: { 'w:id': '3' } },
            docxApi.listParagraph('two', numId, 0),
            { type: 'commentRangeStart', id: '4' }
        ];
        const read = docxApi.read(docxApi.write({ body }, { numbering }));
        // Non-vacuous: the markers reach the reader.
        expect(read.document.body.filter((n) => n.type !== 'paragraph')).toHaveLength(5);
        const { ir, losses } = docxToIr(read);
        expect(losses).toEqual([]);
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'list']);
        expect(ir.children[1].children).toHaveLength(2);
    });
});

// T50: a block-level content control is read in place; a table of
// contents keeps the odt reader's default (dropped, detail `toc`).
describe('oconvDocxToIr — a body-level content control', () => {
    const el = (name, attrs = {}, children = []) => ({ type: 'element', name, attrs, children });
    const control = (children, properties) => ({ type: 'blockSdt', ...(properties ? { properties } : {}), children });
    const gallery = (val) => ({ _extras: [el('w:docPartObj', {}, [el('w:docPartGallery', { 'w:val': val })])] });
    const texts = (blocks) => blocks.map((b) => b.kind === 'table' ? 'table' : b.children.map((r) => r.text).join(''));
    const roundTrip = (body, opts) => docxApi.read(docxApi.write({ body }, opts));

    test('its paragraphs, tables and nested controls read in place, no loss', () => {
        const read = roundTrip([
            docxApi.paragraph('before'),
            control([docxApi.paragraph('inside'), { type: 'table', rows: [{ type: 'row', cells: [{ type: 'cell', children: [docxApi.paragraph('cell')] }] }] },
                control([docxApi.paragraph('nested')], { alias: 'Inner' })], { alias: 'Outer' }),
            docxApi.paragraph('after')
        ]);
        // Non-vacuity: the read model holds the controls.
        expect(read.document.body[1].type).toBe('blockSdt');
        const { ir, losses } = docxToIr(read);
        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([]);
        expect(texts(ir.children)).toEqual(['before', 'inside', 'table', 'nested', 'after']);
    });

    test('a control between two items of one list keeps one list', () => {
        const { numbering, numId } = docxNumberingMod.bulletList();
        const item = (t) => docxApi.paragraph(t, { pPr: { numPr: { numId, ilvl: 0 } } });
        const read = roundTrip([item('one'), control([item('two')]), item('three')], { numbering });
        const { ir, losses } = docxToIr(read);
        expect(losses).toEqual([]);
        expect(ir.children).toHaveLength(1);
        expect(ir.children[0].kind).toBe('list');
        expect(ir.children[0].children.map((i) => i.children[0].children[0].text)).toEqual(['one', 'two', 'three']);
    });

    test('a control in a cell reads in place', () => {
        const read = roundTrip([{ type: 'table', rows: [{ type: 'row', cells: [
            { type: 'cell', children: [control([docxApi.paragraph('in cell')])] }
        ] }] }]);
        expect(read.document.body[0].rows[0].cells[0].children[0].type).toBe('blockSdt');
        const { ir, losses } = docxToIr(read);
        expect(losses).toEqual([]);
        expect(ir.children[0].children[0].children[0].children[0].children[0].text).toBe('in cell');
    });

    test('a table of contents control is dropped with the toc detail, nested too', () => {
        const read = roundTrip([
            control([docxApi.paragraph('Contents'), docxApi.paragraph('Intro\t1')], gallery('Table of Contents')),
            control([control([docxApi.paragraph('Chapter\t2')], gallery('Table of Contents')), docxApi.paragraph('kept')]),
            docxApi.paragraph('body')
        ]);
        const { ir, losses } = docxToIr(read);
        expect(losses).toEqual([{ code: 'block/dropped', detail: 'toc' }, { code: 'block/dropped', detail: 'toc' }]);
        expect(texts(ir.children)).toEqual(['kept', 'body']);
    });

    // T59 (e): the opt-in include: ['toc'], as the odt reader's.
    test('under include toc, a table of contents control reads as its entries, nested too', () => {
        const read = roundTrip([
            control([docxApi.paragraph('Contents'), docxApi.paragraph('Intro\t1'), docxApi.paragraph('  ')], gallery('Table of Contents')),
            control([control([docxApi.paragraph('Chapter   two\t2')], gallery('Table of Contents')), docxApi.paragraph('kept')]),
            docxApi.paragraph('body')
        ]);
        const { ir, losses } = docxToIr(read, { include: ['toc'] });
        expect(losses).toEqual([]);
        expect(texts(ir.children)).toEqual(['Contents', 'Intro 1', 'Chapter two 2', 'kept', 'body']);
        expect(docxToIr(read, { include: [] }).losses).toHaveLength(2);
        for (const bad of [['x'], ['toc', 'toc'], 'toc']) expect(() => docxToIr(read, { include: bad })).toThrow('oconv: bad docx include');
    });

    test('a cover page and a repeating section read in place', () => {
        const read = roundTrip([
            control([docxApi.paragraph('Cover title')], gallery('Cover Pages')),
            control([control([docxApi.paragraph('item 1')], { kind: 'repeatingSectionItem' }),
                control([docxApi.paragraph('item 2')], { kind: 'repeatingSectionItem' })], { kind: 'repeatingSection' })
        ]);
        const { ir, losses } = docxToIr(read);
        expect(losses).toEqual([]);
        expect(texts(ir.children)).toEqual(['Cover title', 'item 1', 'item 2']);
    });
});

// T27 (a), D36 B: the page of the body's sectPr, under the opt-in include
// ['layout'] (oconv-ir/v2's document.page, lengths in points).
describe('oconvDocxToIr — the page under include layout (T27 a)', () => {
    const para = (text, pPr) => ({ type: 'paragraph', ...(pPr ? { pPr } : {}), children: [{ type: 'run', children: [{ type: 'text', value: text }] }] });
    const sectBreak = { _extras: [{ type: 'element', name: 'w:sectPr', attrs: {}, children: [] }] };
    const read = (sectPr, body = [para('x')]) => docxApi.read(docxApi.write({ body, ...(sectPr ? { sectPr } : {}) }));
    const A4 = { pageSize: { w: 11906, h: 16838 }, pageMargin: { top: 1417, right: 1417, bottom: 1134, left: 1417, header: 708, footer: 708, gutter: 0 } };

    test('the size and the margins in points, portrait from the size', () => {
        const { ir, losses } = docxToIr(read(A4), { include: ['layout'] });
        expect(ir.page).toEqual({ width: 595.3, height: 841.9, orientation: 'portrait', margins: { top: 70.85, right: 70.85, bottom: 56.7, left: 70.85 } });
        expect(losses).toEqual([]);
        expect(validate(ir).ok).toBe(true);
    });

    test('orientation: orient when given, else landscape when wider than high', () => {
        const wide = { pageSize: { w: 16838, h: 11906 } };
        expect(docxToIr(read(wide), { include: ['layout'] }).ir.page).toMatchObject({ width: 841.9, height: 595.3, orientation: 'landscape', margins: null });
        const stated = { pageSize: { w: 16838, h: 11906, orient: 'portrait' } };
        expect(docxToIr(read(stated), { include: ['layout'] }).ir.page.orientation).toBe('portrait');
        const tall = { pageSize: { w: 11906, h: 16838, orient: 'landscape' } };
        expect(docxToIr(read(tall), { include: ['layout'] }).ir.page.orientation).toBe('landscape');
    });

    test('no sectPr, or a pgSz without w or h: no page', () => {
        expect(docxToIr(read(null), { include: ['layout'] }).ir.page).toBe(null);
        expect(docxToIr(read({ pageSize: { w: 11906 } }), { include: ['layout'] }).ir.page).toBe(null);
        expect(docxToIr(read({ pageMargin: A4.pageMargin }), { include: ['layout'] }).ir.page).toBe(null);
    });

    test('a negative top or bottom margin is kept as its absolute value, recorded', () => {
        const { ir, losses } = docxToIr(read({ pageSize: A4.pageSize, pageMargin: { ...A4.pageMargin, top: -1440, bottom: -720 } }), { include: ['layout'] });
        expect(ir.page.margins).toEqual({ top: 72, right: 70.85, bottom: 36, left: 70.85 });
        expect(losses).toEqual([{ code: 'layout/margin-negative', detail: 'top' }, { code: 'layout/margin-negative', detail: 'bottom' }]);
    });

    test('a gutter is dropped, recorded', () => {
        const { ir, losses } = docxToIr(read({ pageSize: A4.pageSize, pageMargin: { ...A4.pageMargin, gutter: 567 } }), { include: ['layout'] });
        expect(ir.page.margins.left).toBe(70.85);
        expect(losses).toEqual([{ code: 'layout/gutter-dropped', detail: '28.35pt' }]);
    });

    test('more than one section: the last section\'s page, recorded with the count', () => {
        const body = [para('one', sectBreak), para('two', sectBreak), para('three')];
        const { ir, losses } = docxToIr(read(A4, body), { include: ['layout'] });
        expect(ir.page.width).toBe(595.3);
        expect(losses).toEqual([{ code: 'layout/sections-merged', detail: '3 sections' }]);
        expect(ir.children.map((n) => n.children[0].text)).toEqual(['one', 'two', 'three']);
    });

    test('without the opt-in: no page and nothing recorded, whatever the sections', () => {
        const body = [para('one', sectBreak), para('two')];
        const { ir, losses } = docxToIr(read({ pageSize: A4.pageSize, pageMargin: { ...A4.pageMargin, gutter: 567, top: -1 } }, body));
        expect(ir.page).toBe(null);
        expect(losses).toEqual([]);
        expect(docxToIr(read(A4), { include: [] }).ir.page).toBe(null);
    });

    test('layout is a known include name; an unknown one still throws', () => {
        expect(() => docxToIr(read(A4), { include: ['layout', 'toc'] })).not.toThrow();
        expect(() => docxToIr(read(A4), { include: ['styles'] })).toThrow('oconv: bad docx include');
    });
});

// T27 (b), D36 B: the effective alignment and the page breaks, under the
// opt-in include ['layout'] (oconv-ir/v2's align and breakBefore).
describe('oconvDocxToIr — alignment and page breaks under include layout (T27 b)', () => {
    const t = (value) => ({ type: 'text', value });
    const run = (...children) => ({ type: 'run', children });
    const PAGE = { type: 'break', kind: 'page' };
    const p = (children, pPr) => ({ type: 'paragraph', ...(pPr ? { pPr } : {}), children });
    const pbb = { type: 'element', name: 'w:pageBreakBefore', attrs: {}, children: [] };
    const styles = {
        docDefaults: { pPr: { align: 'both' } },
        styles: [
            { type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true },
            { type: 'paragraph', styleId: 'Centred', name: 'Centred', basedOn: 'Normal', pPr: { align: 'center' } },
            { type: 'paragraph', styleId: 'Child', name: 'Child', basedOn: 'Centred' },
            { type: 'paragraph', styleId: 'Heading1', name: 'heading 1', basedOn: 'Normal', pPr: { align: 'right' } },
            { type: 'paragraph', styleId: 'Chapter', name: 'Chapter', basedOn: 'Normal', pPr: { _extras: [pbb] } }
        ]
    };
    const read = (body, st = styles) => docxApi.read(docxApi.write({ body }, { styles: st }));
    const blocks = (body, st) => docxToIr(read(body, st), { include: ['layout'] });
    const textOf = (n) => n.children.map((r) => r.text).join('');

    test('the effective alignment: direct, else up the basedOn chain, else docDefaults', () => {
        const { ir, losses } = blocks([
            p([run(t('direct'))], { align: 'left' }),
            p([run(t('styled'))], { pStyle: 'Child' }),
            p([run(t('defaults'))]),
            p([run(t('Title'))], { pStyle: 'Heading1' }),
            p([run(t('ended'))], { align: 'end' })
        ]);
        expect(ir.children.map((n) => [n.kind, textOf(n), n.align, n.breakBefore])).toEqual([
            ['paragraph', 'direct', 'start', false], ['paragraph', 'styled', 'center', false],
            ['paragraph', 'defaults', 'justify', false], ['heading', 'Title', 'end', false], ['paragraph', 'ended', 'end', false]
        ]);
        expect(losses).toEqual([]);
        expect(validate(ir).ok).toBe(true);
    });

    test('nothing stated anywhere: null; distribute and a kashida value give justify, recorded; an unknown value null, recorded', () => {
        const bare = { styles: [{ type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true }] };
        const { ir, losses } = blocks([
            p([run(t('none'))]), p([run(t('dist'))], { align: 'distribute' }),
            p([run(t('kash'))], { align: 'mediumKashida' }), p([run(t('tab'))], { align: 'numTab' })
        ], bare);
        expect(ir.children.map((n) => n.align)).toEqual([null, 'justify', 'justify', null]);
        expect(losses).toEqual([
            { code: 'layout/align-approximated', detail: 'distribute' },
            { code: 'layout/align-approximated', detail: 'mediumKashida' },
            { code: 'layout/align-approximated', detail: 'numTab' }
        ]);
    });

    test('a break alone or at an end goes on the next paragraph; one at a start on its own; pageBreakBefore direct or styled', () => {
        const { ir, losses } = blocks([
            p([run(t('one'))]),
            p([run(PAGE)]),
            p([run(t('two')), run(PAGE)]),
            p([run(t('three'))]),
            p([run(PAGE, t('four'))]),
            p([run(t('five'))], { _extras: [pbb] }),
            p([run(t('six'))], { pStyle: 'Chapter' })
        ]);
        const kept = ir.children.filter((n) => textOf(n).trim());
        expect(kept.map((n) => [textOf(n), n.breakBefore])).toEqual([
            ['one', false], ['two ', true], ['three', true], [' four', true], ['five', true], ['six', true]
        ]);
        expect(losses).toEqual([]);
    });

    test('several breaks before one block are one, recorded; a break inside a paragraph keeps its space, recorded', () => {
        const { ir, losses } = blocks([p([run(PAGE)]), p([run(PAGE)]), p([run(t('a'), PAGE, t('b'))], { _extras: [pbb] })]);
        const last = ir.children[ir.children.length - 1];
        expect([textOf(last), last.breakBefore]).toEqual(['a b', true]);
        expect(losses).toEqual([{ code: 'layout/break-inside', detail: 'a b' }, { code: 'layout/breaks-merged', detail: '3 breaks' }]);
    });

    test('a break that reaches a table, a code block, a quote or the end is dropped, recorded', () => {
        const cell = (text) => ({ children: [p([run(t(text))])] });
        const st = { styles: [...styles.styles,
            { type: 'paragraph', styleId: 'SourceCode', name: 'Source Code' }, { type: 'paragraph', styleId: 'Quote', name: 'Quote' }] };
        const { ir, losses } = blocks([
            p([run(PAGE)]), { type: 'table', rows: [{ cells: [cell('in a cell')] }] },
            p([run(PAGE)]), p([run(t('x = 1'))], { pStyle: 'SourceCode' }),
            p([run(PAGE)]), p([run(t('quoted'))], { pStyle: 'Quote' }),
            p([run(t('last')), run(PAGE)])
        ], st);
        expect(losses).toEqual([
            { code: 'layout/break-dropped', detail: 'table' }, { code: 'layout/break-dropped', detail: 'codeBlock' },
            { code: 'layout/break-dropped', detail: 'blockquote' }, { code: 'layout/break-dropped', detail: 'end' }
        ]);
        const table = ir.children.find((n) => n.kind === 'table');
        expect(table.children[0].children[0].children[0].breakBefore).toBe(false);
    });

    test('table cells and quotes keep their alignment', () => {
        const st = { styles: [...styles.styles, { type: 'paragraph', styleId: 'Quote', name: 'Quote' }] };
        const { ir } = blocks([
            { type: 'table', rows: [{ cells: [{ children: [p([run(t('c'))], { align: 'center' })] }] }] },
            p([run(t('q'))], { pStyle: 'Quote', align: 'right' })
        ], st);
        expect(ir.children[0].children[0].children[0].children[0].align).toBe('center');
        expect(ir.children[1].children[0].align).toBe('end');
    });

    test('without the opt-in: align null, breakBefore false, nothing recorded; the run text is the same', () => {
        const body = [p([run(PAGE)]), p([run(t('a'), PAGE, t('b'))], { align: 'distribute' })];
        const off = docxToIr(read(body));
        const on = docxToIr(read(body), { include: ['layout'] });
        expect(off.ir.children.every((n) => n.align === null && n.breakBefore === false)).toBe(true);
        expect(off.losses).toEqual([]);
        expect(on.ir.children.map(textOf)).toEqual(off.ir.children.map(textOf));
    });
});

// T27 (c), D36 B: each run's effective size, font, colour, underline and
// script, under the opt-in include ['layout'].
describe('oconvDocxToIr — run properties under include layout (T27 c)', () => {
    const run = (value, rPr) => ({ type: 'run', ...(rPr ? { rPr } : {}), children: [{ type: 'text', value }] });
    const p = (runs, pPr) => ({ type: 'paragraph', ...(pPr ? { pPr } : {}), children: runs });
    const THEME = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme name="x">'
        + '<a:majorFont><a:latin typeface="Cambria"/><a:ea typeface=""/></a:majorFont>'
        + '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/></a:minorFont></a:fontScheme></a:themeElements></a:theme>';
    const styles = {
        docDefaults: { rPr: { size: 22, fonts: { asciiTheme: 'minorHAnsi', hAnsiTheme: 'minorHAnsi' } } },
        styles: [
            { type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true },
            { type: 'paragraph', styleId: 'Heading1', name: 'heading 1', basedOn: 'Normal', rPr: { size: 32, color: '2F5496', fonts: { asciiTheme: 'majorHAnsi' } } },
            { type: 'character', styleId: 'Emph', name: 'Emph', rPr: { color: 'C00000' } },
            { type: 'character', styleId: 'Link', name: 'Link', basedOn: 'Emph', rPr: { underline: 'single' } }
        ]
    };
    const read = (body, opts = {}) => ({
        document: { body },
        styles: opts.styles || styles,
        package: { parts: opts.noTheme ? {} : { '/word/theme/theme1.xml': new TextEncoder().encode(THEME) } }
    });
    const runsOf = (ir) => ir.children.flatMap((b) => b.children).map((r) => [r.text, r.size, r.font, r.color, r.underline, r.script]);

    test('each value from its first source: direct, the character style chain, the paragraph style chain, docDefaults', () => {
        const { ir, losses } = docxToIr(read([
            p([run('plain'), run('direct', { size: 18, font: 'Arial', fonts: { ascii: 'Arial' }, color: 'FF0000', underline: 'single', vertAlign: 'superscript' })]),
            p([run('styled', { rStyle: 'Link' })]),
            p([run('Title')], { pStyle: 'Heading1' })
        ]), { include: ['layout'] });
        expect(runsOf(ir)).toEqual([
            ['plain', 11, 'Calibri', null, false, null],
            ['direct', 9, 'Arial', '#ff0000', true, 'super'],
            ['styled', 11, 'Calibri', '#c00000', true, null],
            ['Title', 16, 'Cambria', '#2f5496', false, null]
        ]);
        expect(losses).toEqual([]);
        expect(validate(ir).ok).toBe(true);
    });

    test('a theme font wins over the same level\'s name; auto, baseline and none give nothing', () => {
        const { ir } = docxToIr(read([p([
            run('a', { font: 'Arial', fonts: { ascii: 'Arial', asciiTheme: 'majorHAnsi' } }),
            run('b', { color: 'auto', vertAlign: 'baseline', underline: 'none' }),
            run('c', { vertAlign: 'subscript' })
        ])]), { include: ['layout'] });
        expect(runsOf(ir)).toEqual([
            ['a', 11, 'Cambria', null, false, null], ['b', 11, 'Calibri', null, false, null], ['c', 11, 'Calibri', null, false, 'sub']
        ]);
    });

    test('a theme font with no theme part is null, recorded once per slot; another underline kind recorded once per kind', () => {
        const { ir, losses } = docxToIr(read([p([
            run('a'), run('b'), run('c', { underline: 'double' }), run('d', { underline: 'double' }), run('e', { underline: 'wave' })
        ])], { noTheme: true }), { include: ['layout'] });
        expect(ir.children[0].children.map((r) => [r.font, r.underline])).toEqual([[null, false], [null, false], [null, true], [null, true], [null, true]]);
        expect(losses).toEqual([
            { code: 'layout/font-theme-unresolved', detail: 'minorHAnsi' },
            { code: 'layout/underline-approximated', detail: 'double' },
            { code: 'layout/underline-approximated', detail: 'wave' }
        ]);
    });

    test('nothing stated anywhere: every value null', () => {
        const bare = { styles: [{ type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true }] };
        const { ir, losses } = docxToIr(read([p([run('x')])], { styles: bare }), { include: ['layout'] });
        expect(runsOf(ir)).toEqual([['x', null, null, null, false, null]]);
        expect(losses).toEqual([]);
    });

    test('runs in a hyperlink, a list item and a table cell get their values too', () => {
        const { ir } = docxToIr({ ...read([
            p([{ type: 'hyperlink', rId: 'r1', children: [run('link', { rStyle: 'Link' })] }]),
            { type: 'table', rows: [{ cells: [{ children: [p([run('cell', { size: 20 })])] }] }] }
        ]), hyperlinks: { r1: { target: 'https://example.test/' } } }, { include: ['layout'] });
        const link = ir.children[0].children[0];
        expect([link.text, link.link, link.color, link.underline]).toEqual(['link', 'https://example.test/', '#c00000', true]);
        expect(ir.children[1].children[0].children[0].children[0].children[0].size).toBe(10);
    });

    test('without the opt-in: every run as today', () => {
        const { ir, losses } = docxToIr(read([p([run('direct', { size: 18, color: 'FF0000', underline: 'double', vertAlign: 'superscript' })])]));
        expect(runsOf(ir)).toEqual([['direct', null, null, null, false, null]]);
        expect(losses).toEqual([]);
    });
});
