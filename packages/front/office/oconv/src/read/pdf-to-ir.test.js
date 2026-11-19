// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
// Relative import of the sibling @awacloud/pdf manifest — see font-decoder.test.js
// for why the bare specifier is not used here (task 06 adds the package dep).
import { fw_require, pkg_require, modules, extras } from '../../../pdf/src/main.js';
import { oconvIr } from '../ir/ir.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { oconvPdfImagePng } from './pdf/image-png.js';
import { oconvPdfTextExtract } from './pdf/text-extract.js';
import { oconvPdfStruct } from './pdf/struct.js';
import { oconvPdfToIr } from './pdf-to-ir.js';
import { groupParagraphs } from './pdf/paragraph-group.js';

let rt;
let pdf;
let obj;
let cmap;
let pdfToIr;
let extractPage;
let validate;

beforeAll(() => {
    rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(pkg_require);
    rt.registerAll(modules);
    rt.register(oconvIr);
    rt.register(crc32);
    for (const m of extras) if (m.name === 'pdfFontDecoder' || m.name === 'pdfPageText') rt.register(m);
    rt.register(oconvPdfImagePng);
    rt.register(oconvPdfTextExtract);
    rt.register(oconvPdfStruct);
    rt.register(oconvPdfToIr);

    pdf = rt.resolve('pdf');
    obj = rt.resolve('pdfParser').obj;
    cmap = rt.resolve('cmapToUnicode');
    ({ pdfToIr } = rt.resolve('oconvPdfToIr'));
    ({ extractPage } = rt.resolve('oconvPdfTextExtract'));
    ({ validate } = rt.resolve('oconvIr'));
});

const enc = (s) => new TextEncoder().encode(s);
const FIXTURES = new URL('../../tests/_fixtures/corpus/', import.meta.url);

/** ASCII ToUnicode CMap shared by the generated fixtures. */
function asciiToUnicode() {
    const m = new Map();
    for (let c = 0x20; c <= 0x7e; c++) m.set(c, String.fromCharCode(c));
    m.set(0xad, '\u00ad'); // the soft hyphen (T34 c)
    return cmap.buildToUnicode(m);
}

/**
 * Build a minimal untagged single-page PDF whose content shows each given
 * line at its `y` (and optional `x`, default 72) with a ToUnicode'd
 * Helvetica. `extra` lets a test append raw operators (e.g. an image `Do`).
 */
function genUntagged(lines, extra = '') {
    const toUni = asciiToUnicode();
    let content = '';
    for (const ln of lines) {
        const size = ln.size || 12;
        content += `BT /F1 ${size} Tf ${ln.x === undefined ? 72 : ln.x} ${ln.y} Td (${ln.text}) Tj ET\n`;
    }
    content += extra;
    const CATALOG = 1, PAGES = 2, PAGE = 3, CONTENT = 4, FONT = 5, TOUNI = 6, IMG = 7;
    const resEntries = { Font: obj.dict({ F1: obj.ref(FONT, 0) }) };
    if (/\/Im1 Do/.test(extra)) {
        resEntries.XObject = obj.dict({ Im1: obj.ref(IMG, 0) });
    }
    const indirects = [
        { num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) },
        { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) },
        { num: PAGE, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(CONTENT, 0),
            Resources: obj.dict(resEntries)
        }) },
        { num: CONTENT, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
        { num: FONT, gen: 0, value: obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('Helvetica'), ToUnicode: obj.ref(TOUNI, 0)
        }) },
        { num: TOUNI, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(toUni.length) }), enc(toUni)) }
    ];
    if (/\/Im1 Do/.test(extra)) {
        indirects.push({ num: IMG, gen: 0, value: obj.stream(obj.dict({
            Type: obj.name('XObject'), Subtype: obj.name('Image'),
            Width: obj.int(1), Height: obj.int(1)
        }), new Uint8Array([0])) });
    }
    return pdf.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });
}

describe('oconvPdfToIr — descriptor', () => {
    test('is a fw module descriptor with the prescribed dependencies', () => {
        expect(oconvPdfToIr.name).toBe('oconvPdfToIr');
        expect(oconvPdfToIr.dependencies).toEqual(['oconvIr', 'oconvPdfTextExtract', 'oconvPdfStruct']);
        expect(typeof oconvPdfToIr.factory).toBe('function');
    });
});

describe('oconvPdfToIr — untagged fall-back (positioning heuristic)', () => {
    test('groups two vertically-separated blocks into two paragraphs', () => {
        const bytes = genUntagged([
            { y: 720, text: 'First paragraph line.' },
            { y: 660, text: 'Second paragraph after a gap.' }
        ]);
        const doc = pdf.read(bytes);
        const { ir, losses, coverage } = pdfToIr(doc);

        expect(validate(ir).ok).toBe(true);
        expect(coverage.tagged).toBe(false);
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'paragraph']);
        expect(ir.children[0].children[0].text).toBe('First paragraph line.');
        expect(ir.children[1].children[0].text).toBe('Second paragraph after a gap.');
        expect(coverage.total.undecodable).toBe(0);
        expect(losses).toEqual([]);
    });

    test('an image XObject draw is dropped with an image/dropped loss', () => {
        const bytes = genUntagged(
            [{ y: 720, text: 'Text with a picture.' }],
            'q 100 0 0 100 72 500 cm /Im1 Do Q\n'
        );
        const doc = pdf.read(bytes);
        const { ir, losses } = pdfToIr(doc);
        expect(validate(ir).ok).toBe(true);
        expect(losses).toContainEqual({ code: 'image/dropped', detail: 'Im1 (7 0 R, 1x1)' });
        // The image is not represented as an IR node on the tier-1 path.
        expect(ir.children.every((n) => n.kind !== 'image')).toBe(true);
    });
});

/** Build an untagged N-page PDF; `pages[i]` is that page's line list. */
function genUntaggedPages(pages) {
    const toUni = asciiToUnicode();
    const indirects = [];
    const CATALOG = 1, PAGES = 2, FONT = 3, TOUNI = 4;
    indirects.push({ num: FONT, gen: 0, value: obj.dict({
        Type: obj.name('Font'), Subtype: obj.name('Type1'),
        BaseFont: obj.name('Helvetica'), ToUnicode: obj.ref(TOUNI, 0)
    }) });
    indirects.push({ num: TOUNI, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(toUni.length) }), enc(toUni)) });
    let next = 5;
    const kids = [];
    for (const lines of pages) {
        const pageNum = next++;
        const contentNum = next++;
        let content = '';
        for (const ln of lines) content += `BT /F1 ${ln.size || 12} Tf 72 ${ln.y} Td (${ln.text}) Tj ET\n`;
        indirects.push({ num: contentNum, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) });
        indirects.push({ num: pageNum, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(contentNum, 0),
            Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(FONT, 0) }) })
        }) });
        kids.push(obj.ref(pageNum, 0));
    }
    indirects.push({ num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) });
    indirects.push({ num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array(kids), Count: obj.int(pages.length) }) });
    return pdf.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });
}

describe('oconvPdfToIr — page boundaries → IR section breaks (hr)', () => {
    test('a two-page document separates pages with a single hr', () => {
        const bytes = genUntaggedPages([
            [{ y: 720, text: 'Page one body.' }],
            [{ y: 720, text: 'Page two body.' }]
        ]);
        const doc = pdf.read(bytes);
        const { ir, coverage } = pdfToIr(doc);
        expect(validate(ir).ok).toBe(true);
        expect(coverage.pages.length).toBe(2);
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'hr', 'paragraph']);
        expect(ir.children[0].children[0].text).toBe('Page one body.');
        expect(ir.children[2].children[0].text).toBe('Page two body.');
    });
});

describe('oconvPdfToIr — paragraph-group mirror drift', () => {
    test('the factory-internal grouping agrees with ./pdf/paragraph-group.js', () => {
        const layouts = [
            [{ y: 720, text: 'alpha' }, { y: 706, text: 'beta' }],            // close → one para
            [{ y: 720, text: 'one' }, { y: 640, text: 'two' }],               // big gap → two
            [{ y: 700, text: 'a' }, { y: 686, text: 'b' }, { y: 620, text: 'c' }],
            // Same-line pieces (the word-gap rule). Helvetica 12 pt: `one` =
            // 1668/1000 × 12 = 20.016 → ends at 92.016; `two` at 120 is a
            // real gap (space), `ab` ends at 85.344 and `cd` at 86 is not.
            [{ y: 720, x: 72, text: 'one' }, { y: 720, x: 120, text: 'two' }],
            [{ y: 720, x: 72, text: 'ab' }, { y: 720, x: 86, text: 'cd' }],
            // Backwards on the line: no insertion.
            [{ y: 720, x: 200, text: 'right' }, { y: 720, x: 72, text: 'left' }],
            // Around the 0.15 em default (office/BATCH_49/02): `a` = 556/1000
            // × 12 = 6.672 → ends at 78.672; 80.46 is 0.149 em away (no
            // space), 80.49 is 0.1515 em away (space).
            [{ y: 720, x: 72, text: 'a' }, { y: 720, x: 80.46, text: 'b' }],
            [{ y: 720, x: 72, text: 'a' }, { y: 720, x: 80.49, text: 'b' }],
            // An exact duplicate of the previous piece is dropped (BL-1600).
            [{ y: 720, x: 72, text: 'dup' }, { y: 720, x: 72, text: 'dup' }],
            // Overlaps (BL-1600, owner ruling A): `ab` ends at 85.344; `cd`
            // at 82 overlaps 0.279 em (space), at 84 only 0.112 em (glued).
            [{ y: 720, x: 72, text: 'ab' }, { y: 720, x: 82, text: 'cd' }],
            [{ y: 720, x: 72, text: 'ab' }, { y: 720, x: 84, text: 'cd' }],
            // A soft hyphen ending a line (T34 c).
            [{ y: 720, text: 'infor\\255' }, { y: 706, text: 'mation' }]
        ];
        for (const lines of layouts) {
            const doc = pdf.read(genUntagged(lines));
            // Actual pieces the extractor produced for THIS document…
            const { items } = extractPage(doc.pages[0], doc._raw.resolve);
            const expected = groupParagraphs(items.filter((it) => it.kind === 'text'));
            // …vs the paragraphs the reader's mirrored copy produced.
            const { ir } = pdfToIr(doc);
            const actual = ir.children
                .filter((n) => n.kind === 'paragraph')
                .map((n) => n.children.map((r) => r.text).join(''));
            expect(actual).toEqual(expected);
        }
    });
});

describe('oconvPdfToIr — same-line pieces are word-separated on a real gap (untagged path)', () => {
    const paragraphsOf = (lines) => pdfToIr(pdf.read(genUntagged(lines))).ir.children
        .filter((n) => n.kind === 'paragraph')
        .map((n) => n.children.map((r) => r.text).join(''));

    test('a gap wider than the word-gap threshold becomes one space; a tight one does not', () => {
        expect(paragraphsOf([{ y: 720, x: 72, text: 'one' }, { y: 720, x: 120, text: 'two' }])).toEqual(['one two']);
        expect(paragraphsOf([{ y: 720, x: 72, text: 'ab' }, { y: 720, x: 86, text: 'cd' }])).toEqual(['abcd']);
    });

    test('a line whose pieces go backwards is joined without insertion', () => {
        expect(paragraphsOf([{ y: 720, x: 200, text: 'right' }, { y: 720, x: 72, text: 'left' }])).toEqual(['rightleft']);
    });

    // BL-1600 (office/BATCH_49/02). Red before the fix (measured 2026-10-02):
    // the mirrored line pass read "Shadowed labelShadowed label".
    test('a piece drawn twice at the same place is kept once', () => {
        expect(paragraphsOf([
            { y: 720, x: 72, text: 'Shadowed label' }, { y: 720, x: 72, text: 'Shadowed label' }
        ])).toEqual(['Shadowed label']);
    });

    test('the threshold is the 0.15 em default: 0.149 em glues, 0.1515 em spaces', () => {
        expect(paragraphsOf([{ y: 720, x: 72, text: 'a' }, { y: 720, x: 80.46, text: 'b' }])).toEqual(['ab']);
        expect(paragraphsOf([{ y: 720, x: 72, text: 'a' }, { y: 720, x: 80.49, text: 'b' }])).toEqual(['a b']);
    });

    // BL-1600 overlap half (office/BATCH_49/02, owner ruling A, 2026-10-02).
    // Red before the fix: the 0.279 em overlap read "abcd".
    test('an overlap over 0.15 em becomes one space; a smaller one stays glued', () => {
        expect(paragraphsOf([{ y: 720, x: 72, text: 'ab' }, { y: 720, x: 82, text: 'cd' }])).toEqual(['ab cd']);
        expect(paragraphsOf([{ y: 720, x: 72, text: 'ab' }, { y: 720, x: 84, text: 'cd' }])).toEqual(['abcd']);
    });
});

describe('oconvPdfToIr — tagged fast path (first-party sample)', () => {
    let ir;
    let losses;
    let coverage;

    beforeAll(() => {
        const bytes = new Uint8Array(readFileSync(new URL('pdf-tagged/tagged-structured.pdf', FIXTURES)));
        const doc = pdf.read(bytes);
        ({ ir, losses, coverage } = pdfToIr(doc));
    });

    test('derives headings + paragraphs from the struct tree, not positioning', () => {
        expect(coverage.tagged).toBe(true);
        expect(validate(ir).ok).toBe(true);
        const shape = ir.children.map((n) => (n.kind === 'heading' ? `h${n.level}` : n.kind));
        expect(shape).toEqual(['h1', 'paragraph', 'h2', 'paragraph', 'paragraph', 'paragraph']);
    });

    test('maps the H1/H2 text and body paragraphs', () => {
        expect(ir.children[0]).toEqual({
            kind: 'heading', level: 1, align: null, breakBefore: false, children: [{ kind: 'run', text: 'Quarterly Report', bold: false, italic: false, strike: false, code: false, link: null, size: null, font: null, color: null, underline: false, script: null }]
        });
        expect(ir.children[2].kind).toBe('heading');
        expect(ir.children[2].level).toBe(2);
        expect(ir.children[2].children[0].text).toBe('Details');
        expect(ir.children[1].children[0].text).toBe('This report summarizes the quarter.');
    });

    test('flattens the Table container with a struct/dropped loss, keeping cell text', () => {
        expect(losses).toContainEqual({ code: 'struct/dropped', detail: 'Table' });
        const paraTexts = ir.children.filter((n) => n.kind === 'paragraph').map((n) => n.children[0].text);
        expect(paraTexts).toContain('Cell one');
        expect(paraTexts).toContain('Cell two');
    });

    test('all struct-tree text decodes (coverage recorded)', () => {
        expect(coverage.total.undecodable).toBe(0);
        expect(coverage.total.decoded).toBeGreaterThan(0);
    });
});

describe('oconvPdfToIr — real corpus (facturx-minimum-sample.pdf)', () => {
    // T25 (g): the default inference read 11 headings here, every one false
    // (D43); the labels, values, amounts and contacts now stay paragraphs.
    test('the invoice reads one heading, not its labels, values, amounts or address (T25 g, i)', () => {
        const bytes = new Uint8Array(readFileSync(new URL('pdf/facturx-minimum-sample.pdf', FIXTURES)));
        const { ir } = pdfToIr(pdf.read(bytes), { infer: ['headings', 'tables'] });
        const heads = ir.children.filter((n) => n.kind === 'heading').map((n) => n.children[0].text);
        // T25 (i): re-pinned, the address line is no heading either.
        expect(heads).toEqual(['SELLER TRADE NAME']);
    });

    let ir;
    let coverage;

    beforeAll(() => {
        const bytes = new Uint8Array(readFileSync(new URL('pdf/facturx-minimum-sample.pdf', FIXTURES)));
        const doc = pdf.read(bytes);
        ({ ir, coverage } = pdfToIr(doc));
    });

    test('produces a valid IR document with extracted paragraphs', () => {
        expect(validate(ir).ok).toBe(true);
        expect(ir.children.length).toBeGreaterThan(0);
        expect(ir.children.some((n) => n.kind === 'paragraph')).toBe(true);
    });

    test('measured decode coverage is recorded and materially complete', () => {
        // Re-measured with tasks 01 (public content-stream graph) + 02 (AGL
        // hop) in: the PRE-AGL W0 bound was 0.9%; the ToUnicode CMaps these
        // embedded fonts carry now decode the whole corpus.
        expect(coverage.total.operators).toBeGreaterThan(0);
        expect(coverage.total.decoded).toBeGreaterThan(0);
        expect(coverage.total.undecodable).toBe(0);
        const pct = 100 * coverage.total.decoded / (coverage.total.decoded + coverage.total.undecodable);
        expect(pct).toBe(100);
    });

    // BATCH_39 task 04 (claim pinning, FINDINGS § 5.4 C28) —
    // `docs/loss-matrix.md`'s "4128 / 4128 character codes, 0 undecodable"
    // figure had no test pinning the EXACT count (only the 100% ratio
    // above). RE-MEASURED here, live on this tree: the count IS 4128 — the
    // published figure holds.
    test('the decoded character-code count is EXACTLY 4128, matching the published loss-matrix figure', () => {
        expect(coverage.total.decoded).toBe(4128);
        expect(coverage.total.undecodable).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// office/BATCH_45 task 02 (BL-1610, D66 a) — the form-operator budget
// (`FORM_OPS_MAX`, `xobject/form-budget`) is now configurable via
// `opts.formOpBudget` on both `extractPage` and `pdfToIr`. The rule is
// mirrored (not imported — fw/no-factory-capture) inside each factory; this
// drift table runs the same values through both entry points and asserts
// identical outcomes.
// ---------------------------------------------------------------------------

/** A two-page doc whose second page alone draws a form (no text/font needed). */
function genFormBudgetDoc() {
    const CATALOG = 1, PAGES = 2, PAGE1 = 3, CONTENT1 = 4, PAGE2 = 5, CONTENT2 = 6, FORM = 7;
    const page2Content = '/Fm Do /Fm Do /Fm Do\n';
    const formContent = 'q Q q Q\n';
    const indirects = [
        { num: CATALOG, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0) }) },
        { num: PAGES, gen: 0, value: obj.dict({
            Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE1, 0), obj.ref(PAGE2, 0)]), Count: obj.int(2)
        }) },
        { num: PAGE1, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(CONTENT1, 0), Resources: obj.dict({})
        }) },
        { num: CONTENT1, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(0) }), enc('')) },
        { num: PAGE2, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(CONTENT2, 0),
            Resources: obj.dict({ XObject: obj.dict({ Fm: obj.ref(FORM, 0) }) })
        }) },
        { num: CONTENT2, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(page2Content.length) }), enc(page2Content)) },
        { num: FORM, gen: 0, value: obj.stream(obj.dict({
            Type: obj.name('XObject'), Subtype: obj.name('Form'),
            BBox: obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]),
            Length: obj.int(formContent.length)
        }), enc(formContent)) }
    ];
    return pdf.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });
}

describe('oconvPdfToIr — formOpBudget reaches every page (BL-1610)', () => {
    test('a two-page doc whose second page alone exceeds a small budget records the loss for that page only', () => {
        const doc = pdf.read(genFormBudgetDoc());
        const { losses, coverage } = pdfToIr(doc, { formOpBudget: 5 });
        expect(coverage.pages.length).toBe(2);
        expect(losses).toEqual([{ code: 'xobject/form-budget', detail: 'Fm' }]);
    });

    test('a budget large enough never records the loss on the same fixture', () => {
        const doc = pdf.read(genFormBudgetDoc());
        const { losses } = pdfToIr(doc, { formOpBudget: 1000 });
        expect(losses).toEqual([]);
    });
});

describe('oconvPdfToIr / oconvPdfTextExtract — formOpBudget validation drift table (BL-1610)', () => {
    // The rule: `undefined` accepts the default; otherwise
    // `Number.isSafeInteger(v) && v >= 1`, else `oconv: bad form op budget`.
    // No upper cap other than the safe-integer range.
    const BAD = [0, -1, 1.5, NaN, Infinity, '1000000', null, true, 2 ** 53];
    const GOOD = [1, 1000000, Number.MAX_SAFE_INTEGER];

    let doc;
    beforeAll(() => {
        doc = pdf.read(genUntagged([{ y: 720, text: 'x' }]));
    });

    test('every bad value throws `oconv: bad form op budget` through both extractPage and pdfToIr', () => {
        for (const v of BAD) {
            expect(() => extractPage(doc.pages[0], doc._raw.resolve, { formOpBudget: v }))
                .toThrow('oconv: bad form op budget');
            expect(() => pdfToIr(doc, { formOpBudget: v })).toThrow('oconv: bad form op budget');
        }
    });

    test('every good value, and undefined, is accepted through both entry points', () => {
        for (const v of [...GOOD, undefined]) {
            expect(() => extractPage(doc.pages[0], doc._raw.resolve, { formOpBudget: v })).not.toThrow();
            expect(() => pdfToIr(doc, { formOpBudget: v })).not.toThrow();
        }
    });

    test('a zero-page read result still refuses a bad value at pdfToIr entry', () => {
        expect(() => pdfToIr({ pages: [], _raw: { resolve: () => {} } }, { formOpBudget: 0 }))
            .toThrow('oconv: bad form op budget');
    });

    test('undefined reproduces the no-opts call, byte-identical ir/losses/coverage', () => {
        const withoutOpts = pdfToIr(doc);
        const withUndefined = pdfToIr(doc, { formOpBudget: undefined });
        expect(withUndefined).toEqual(withoutOpts);
    });
});

// ---------------------------------------------------------------------------
// A13a (office-coverage-2, owner ruling D46 A) — headings from font size on
// the untagged path, opt-in through `opts.infer: ['headings']`; the default
// read unchanged.
// ---------------------------------------------------------------------------

describe('oconvPdfToIr — headings from font size, opt-in (A13a)', () => {
    const LINES = [
        { y: 740, text: 'Main Title', size: 20 },
        { y: 700, text: 'Section One', size: 14 },
        { y: 680, text: 'Body line one.', size: 11 },
        { y: 666, text: 'Body line two.', size: 11 },
        { y: 620, text: 'A second paragraph.', size: 11 }
    ];
    const shape = (ir) => ir.children.map((n) => [n.kind, n.level, n.children[0].text]);

    test('a short line of a larger size becomes a heading, its level the rank of its size', () => {
        const doc = pdf.read(genUntagged(LINES));
        const { ir, losses } = pdfToIr(doc, { infer: ['headings'] });
        expect(validate(ir).ok).toBe(true);
        expect(shape(ir)).toEqual([
            ['heading', 1, 'Main Title'],
            ['heading', 2, 'Section One'],
            ['paragraph', undefined, 'Body line one. Body line two.'],
            ['paragraph', undefined, 'A second paragraph.']
        ]);
        expect(losses).toEqual([]);
    });

    // T30 (a2), D51: re-pinned. The text-first read is `infer: []` since
    // 2.0.0; an absent `infer` is the default, `['headings', 'tables']`.
    test('with an empty list, the document reads text-first; without the option, as the default inference', () => {
        const doc = pdf.read(genUntagged(LINES));
        const today = pdfToIr(doc, { infer: [] });
        expect(today.ir.children.every((n) => n.kind === 'paragraph')).toBe(true);
        expect(pdfToIr(doc, { infer: undefined })).toEqual(pdfToIr(doc, { infer: ['headings', 'tables'] }));
        expect(pdfToIr(doc)).toEqual(pdfToIr(doc, { infer: ['headings', 'tables'] }));
    });

    test('a long line of a larger size stays a paragraph; a run of digits is no heading', () => {
        const long = 'This large line is far too long to be a heading because it reads like body text set in a larger size than the rest of the page, for no good reason at all.';
        expect(long.length).toBeGreaterThan(150);
        const doc = pdf.read(genUntagged([
            { y: 740, text: long, size: 16 },
            { y: 690, text: '2026', size: 16 },
            { y: 650, text: 'Body text.', size: 11 },
            { y: 636, text: 'More body text.', size: 11 }
        ]));
        const { ir } = pdfToIr(doc, { infer: ['headings'] });
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    });

    test('pages keep their hr; levels are ranked over the whole document', () => {
        const doc = pdf.read(genUntaggedPages([
            [{ y: 740, text: 'Part One', size: 18 }, { y: 700, text: 'Some text.', size: 11 }],
            [{ y: 740, text: 'Chapter', size: 14 }, { y: 700, text: 'More text.', size: 11 }]
        ]));
        const { ir } = pdfToIr(doc, { infer: ['headings'] });
        expect(ir.children.map((n) => [n.kind, n.level])).toEqual([
            ['heading', 1], ['paragraph', undefined], ['hr', undefined], ['heading', 2], ['paragraph', undefined]
        ]);
    });
});

describe('oconvPdfToIr — the infer option validation (A13a)', () => {
    const BAD = ['headings', [], ['columns'], ['headings', 'headings'], [1], null, {}];
    let doc;
    beforeAll(() => { doc = pdf.read(genUntagged([{ y: 720, text: 'x' }])); });

    test('every bad value throws `oconv: bad pdf infer`; an empty list and undefined are accepted', () => {
        for (const v of BAD.filter((b) => !(Array.isArray(b) && b.length === 0))) {
            expect(() => pdfToIr(doc, { infer: v })).toThrow('oconv: bad pdf infer');
        }
        expect(() => pdfToIr(doc, { infer: [] })).not.toThrow();
        expect(() => pdfToIr(doc, { infer: ['headings'] })).not.toThrow();
        expect(() => pdfToIr(doc, { infer: ['running', 'tables'] })).not.toThrow();
        expect(() => pdfToIr({ pages: [], _raw: { resolve: () => {} } }, { infer: ['x'] })).toThrow('oconv: bad pdf infer');
    });
});

// A13b (D46 A) — headings by weight: a whole bold line at body size.

/**
 * One untagged page, two fonts: F1 Helvetica, F2 `boldBase`
 * (Helvetica-Bold by default); a piece per entry ({ y, x?, text, size?, bold? }).
 */
function genTwoFonts(pieces, boldBase = 'Helvetica-Bold', extra = '') {
    let content = extra;
    for (const p of pieces) {
        content += `BT /${p.bold ? 'F2' : 'F1'} ${p.size || 11} Tf ${p.x === undefined ? 72 : p.x} ${p.y} Td (${p.text}) Tj ET\n`;
    }
    const font = (base) => obj.dict({ Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name(base) });
    const indirects = [
        { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
        { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
        { num: 3, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(2, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(4, 0), Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(5, 0), F2: obj.ref(6, 0) }) })
        }) },
        { num: 4, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
        { num: 5, gen: 0, value: font('Helvetica') },
        { num: 6, gen: 0, value: font(boldBase) }
    ];
    return pdf.write({ indirects, root: { num: 1, gen: 0 }, version: '1.7' });
}

// T25 (g): lines the inference took for headings that are labels, values,
// contacts, amounts or a table's header row stay paragraphs; numbered and
// colon-titled headings stay headings.
describe('oconvPdfToIr — labels, values and table rows kept out of headings (T25 g)', () => {
    const kinds = (pieces) => {
        const { ir } = pdfToIr(pdf.read(genTwoFonts(pieces)), { infer: ['headings', 'tables'] });
        return ir.children.map((n) => [n.kind, n.children[0] && n.children[0].text]);
    };
    const doc = (line) => [
        { y: 760, text: 'Report Title', size: 20 },
        { y: 720, ...line },
        { y: 690, text: 'Plain text of the section, set at the body size.' },
        { y: 676, text: 'More plain text, so that the body size is this one.' }
    ];
    const isParagraph = (line) => expect(kinds(doc(line))[1]).toEqual(['paragraph', line.text]);
    const isHeading = (line) => expect(kinds(doc(line))[1]).toEqual(['heading', line.text]);

    test('N: more digits than letters after a section number (a value, not a heading)', () => {
        isParagraph({ text: 'F20260023', size: 16 });
        isParagraph({ text: '5,00% sur 100,00', bold: true });
        isHeading({ text: '6.18.66 RSQ', size: 16 });
    });

    test('A: a label ending with a space and a colon; a numbered or colon-titled heading stays', () => {
        isParagraph({ text: 'CLIENT :', bold: true });
        isHeading({ text: '4.4.12 Numero de facture :', bold: true });
        isHeading({ text: 'Chapter 2: Methods', size: 16 });
    });

    test('V: a label, a colon and a numeric value; a title with a subtitle stays', () => {
        isParagraph({ text: 'Date echeance : 02/03/2026', size: 16 });
        isHeading({ text: '2.2.2 Mecanismes : une securite sous conditions', size: 16 });
    });

    // T25 (i): an address (two commas, a 4- or 5-digit number that is no year).
    test('an address line is no heading; a date with its year stays one (T25 i)', () => {
        isParagraph({ text: 'LE FOURNISSEUR 35 rue d ici, 75018 PARIS, FR', size: 16 });
        isHeading({ text: 'QPDF Manual, Version 5, May 24, 2015', size: 16 });
    });

    test('U and M: a contact line, a URL and an amount with a currency', () => {
        isParagraph({ text: 'Contact: buyer@example.com', bold: true });
        isParagraph({ text: 'https://example.org/invoices', size: 16 });
        isParagraph({ text: 'NET A PAYER 104,90 EUR', bold: true });
    });

    test('a bold line of three cells is a table row, not a heading; two cells stay a heading', () => {
        const row = [
            { y: 720, text: 'Name', x: 72, bold: true },
            { y: 720, text: 'Type', x: 200, bold: true },
            { y: 720, text: 'Description', x: 320, bold: true }
        ];
        const read = kinds([{ y: 760, text: 'Report Title', size: 20 }, ...row,
            { y: 690, text: 'Plain text of the section, set at the body size.' },
            { y: 676, text: 'More plain text, so that the body size is this one.' }]);
        expect(read[1][0]).toBe('paragraph');
        const numbered = kinds([{ y: 760, text: 'Report Title', size: 20 },
            { y: 720, text: '1', x: 72, bold: true }, { y: 720, text: 'Introduction', x: 100, bold: true },
            { y: 690, text: 'Plain text of the section, set at the body size.' },
            { y: 676, text: 'More plain text, so that the body size is this one.' }]);
        expect(numbered[1][0]).toBe('heading');
    });
});

// T25 (h): a table drawn with horizontal rules only, its columns closer than
// the 0.8 em cell gap (oconv's own md -> pdf: 3 pt of padding each side).
describe('oconvPdfToIr — rows between horizontal rules (T25 h)', () => {
    // 11 pt Helvetica: 'Col A' is about 26.3 pt wide, so the columns at
    // 60, 92.3 and 124.6 sit 6 pt (0.55 em) apart.
    const ROWS = [
        { y: 472, text: 'Col A', x: 60 }, { y: 472, text: 'Col B', x: 92.3 }, { y: 472, text: 'Col C', x: 124.6 },
        { y: 451, text: 'a1', x: 60 }, { y: 451, text: 'b1', x: 92.3 }, { y: 451, text: 'c1', x: 124.6 }
    ];
    const rule = (y) => `57 ${y - 0.25} 104 0.5 re f\n`;
    const read = (extra) => pdfToIr(pdf.read(genTwoFonts(ROWS, 'Helvetica-Bold', extra)), { infer: ['tables'] }).ir;
    const cells = (t) => t.children.map((r) => r.children.map((c) => (c.children[0] ? c.children[0].children[0].text : '')));

    test('each row between two rules: the rows read as a table', () => {
        const ir = read(rule(489.7) + rule(468.6) + rule(447.4));
        const table = ir.children.find((n) => n.kind === 'table');
        expect(table).toBeDefined();
        expect(cells(table)).toEqual([['Col A', 'Col B', 'Col C'], ['a1', 'b1', 'c1']]);
    });

    test('no rules, or one rule between the rows (a fraction bar): no table', () => {
        expect(read('').children.some((n) => n.kind === 'table')).toBe(false);
        expect(read(rule(468.6)).children.some((n) => n.kind === 'table')).toBe(false);
    });
});

// T30 (a2), D51: the 2.0.0 inference default sits in pdfToIr itself, so a
// read chain composed without toMd (oview's copy, office-to-md) takes it.
describe('oconvPdfToIr — headings and tables by default (T30 a2)', () => {
    const PAGE = [
        { y: 760, text: 'Report Title', size: 20 },
        { y: 720, text: 'Item', x: 72 }, { y: 720, text: 'Qty', x: 200 }, { y: 720, text: 'Price', x: 320 },
        { y: 706, text: 'Apples', x: 72 }, { y: 706, text: '12', x: 200 }, { y: 706, text: '3.40', x: 320 },
        { y: 692, text: 'Pears', x: 72 }, { y: 692, text: '7', x: 200 }, { y: 692, text: '2.10', x: 320 },
        { y: 660, text: 'Plain text of the section, set at the body size.' },
        { y: 646, text: 'More plain text, so that the body size is this one.' }
    ];
    const kindsOf = (opts) => pdfToIr(pdf.read(genTwoFonts(PAGE)), opts).ir.children.map((n) => n.kind);

    test('with no option, a heading by size and a table from aligned text', () => {
        expect(kindsOf(undefined)).toEqual(['heading', 'table', 'paragraph']);
        expect(kindsOf({})).toEqual(['heading', 'table', 'paragraph']);
    });

    test('infer: [] is the text-first read', () => {
        expect(kindsOf({ infer: [] }).every((k) => k === 'paragraph')).toBe(true);
    });
});

describe('oconvPdfToIr — headings by weight, opt-in (A13b)', () => {
    const shape = (ir) => ir.children.map((n) => [n.kind, n.level, n.children[0].text]);

    test('a whole bold line at body size becomes a heading, below the size-ranked levels', () => {
        const doc = pdf.read(genTwoFonts([
            { y: 740, text: 'Report Title', size: 20 },
            { y: 700, text: 'Introduction', bold: true },
            { y: 686, text: 'Plain text of the section.' },
            { y: 672, text: 'More plain text.' }
        ]));
        expect(shape(pdfToIr(doc, { infer: ['headings'] }).ir)).toEqual([
            ['heading', 1, 'Report Title'],
            ['heading', 2, 'Introduction'],
            ['paragraph', undefined, 'Plain text of the section. More plain text.']
        ]);
    });

    test('a bold word inside a body line, and a long bold line, are no headings; the default reads as today', () => {
        const pieces = [
            { y: 740, text: 'A line with a', x: 72 },
            { y: 740, text: 'bold', x: 140, bold: true },
            { y: 740, text: 'word in it.', x: 170 },
            { y: 700, text: 'This whole line is set in bold, but it runs far longer than any real heading would.', bold: true },
            { y: 660, text: 'Body text.' }
        ];
        const doc = pdf.read(genTwoFonts(pieces));
        expect(pieces[3].text.length).toBeGreaterThan(80);
        const { ir } = pdfToIr(doc, { infer: ['headings'] });
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
        expect(ir.children[0].children[0].text).toBe('A line with a bold word in it.');
        expect(pdfToIr(doc).ir.children.map((n) => n.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    });

    test('a bold line alone, no size heading in the document: level 1', () => {
        const doc = pdf.read(genTwoFonts([
            { y: 740, text: 'Summary', bold: true },
            { y: 720, text: 'Text under it.' },
            { y: 706, text: 'And more text.' }
        ]));
        expect(shape(pdfToIr(doc, { infer: ['headings'] }).ir)).toEqual([
            ['heading', 1, 'Summary'],
            ['paragraph', undefined, 'Text under it. And more text.']
        ]);
    });
});

// A14a (D46 A) — tables from aligned text, `infer: ['tables']`.

describe('oconvPdfToIr — tables from aligned text, opt-in (A14a)', () => {
    // Three columns at x 72, 200, 320 (11 pt): far wider than 0.8 em apart.
    const TABLE = [
        { y: 740, text: 'Prices of the season.' },
        { y: 700, text: 'Item', x: 72 }, { y: 700, text: 'Qty', x: 200 }, { y: 700, text: 'Price', x: 320 },
        { y: 686, text: 'Apples', x: 72 }, { y: 686, text: '12', x: 200 }, { y: 686, text: '3.40', x: 320 },
        { y: 672, text: 'Pears', x: 72 }, { y: 672, text: '7', x: 200 }, { y: 672, text: '2.10', x: 320 },
        { y: 630, text: 'Prices may change.' }
    ];
    const cellText = (c) => c.children.map((b) => b.children.map((r) => r.text).join('')).join(' ');
    const grid = (t) => t.children.map((r) => r.children.map(cellText));

    test('an aligned block becomes a table, the first row a header, where its first line was', () => {
        const doc = pdf.read(genTwoFonts(TABLE));
        const { ir } = pdfToIr(doc, { infer: ['tables'] });
        expect(validate(ir).ok).toBe(true);
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'table', 'paragraph']);
        const t = ir.children[1];
        expect(grid(t)).toEqual([['Item', 'Qty', 'Price'], ['Apples', '12', '3.40'], ['Pears', '7', '2.10']]);
        expect(t.children.map((r) => r.header)).toEqual([true, false, false]);
    });

    test('without the option, and with headings only, the block reads as text', () => {
        const doc = pdf.read(genTwoFonts(TABLE));
        expect(pdfToIr(doc, { infer: [] }).ir.children.every((n) => n.kind === 'paragraph')).toBe(true);
        expect(pdfToIr(doc, { infer: ['headings'] }).ir.children.some((n) => n.kind === 'table')).toBe(false);
    });

    test('a single line with a wide gap is no table; a missing cell stays empty', () => {
        const one = pdf.read(genTwoFonts([
            { y: 740, text: 'Left', x: 72 }, { y: 740, text: 'Right', x: 400 },
            { y: 700, text: 'Body text.' }
        ]));
        expect(pdfToIr(one, { infer: ['tables'] }).ir.children.map((n) => n.kind)).toEqual(['paragraph', 'paragraph']);
        const gap = pdf.read(genTwoFonts([
            { y: 700, text: 'A', x: 72 }, { y: 700, text: 'B', x: 200 }, { y: 700, text: 'C', x: 320 },
            { y: 686, text: 'a1', x: 72 }, { y: 686, text: 'c1', x: 320 },
            { y: 672, text: 'a2', x: 72 }, { y: 672, text: 'b2', x: 200 }, { y: 672, text: 'c2', x: 320 }
        ]));
        const t = pdfToIr(gap, { infer: ['tables'] }).ir.children[0];
        expect(t.kind).toBe('table');
        expect(grid(t)).toEqual([['A', 'B', 'C'], ['a1', '', 'c1'], ['a2', 'b2', 'c2']]);
    });

    test('two columns of body text are no table: a cell over 40 characters', () => {
        const left = 'Text of the left column that runs on and on';
        const right = 'Text of the right column, as long as the left';
        expect([left.length, right.length].every((n) => n > 40)).toBe(true);
        const doc = pdf.read(genTwoFonts([
            { y: 700, text: left, x: 72, size: 8 }, { y: 700, text: right, x: 320, size: 8 },
            { y: 690, text: left, x: 72, size: 8 }, { y: 690, text: right, x: 320, size: 8 }
        ]));
        expect(pdfToIr(doc, { infer: ['tables'] }).ir.children.some((n) => n.kind === 'table')).toBe(false);
    });

    test('tables and headings together; the validation knows both names', () => {
        const doc = pdf.read(genTwoFonts([{ y: 760, text: 'Price List', size: 20 }, ...TABLE]));
        const kinds = pdfToIr(doc, { infer: ['headings', 'tables'] }).ir.children.map((n) => n.kind);
        expect(kinds).toEqual(['heading', 'paragraph', 'table', 'paragraph']);
        expect(() => pdfToIr(doc, { infer: ['tables', 'tables'] })).toThrow('oconv: bad pdf infer');
        expect(() => pdfToIr(doc, { infer: ['tables', 'headings'] })).not.toThrow();
    });
});

// A14b2 (D48 A) — ruled tables, under `infer: ['tables']`.

/** One untagged page: text pieces ({ y, x, text }) at 11 pt, then `paths` (raw path operators). */
function genRuled(pieces, paths) {
    let content = '';
    for (const p of pieces) content += `BT /F1 11 Tf ${p.x} ${p.y} Td (${p.text}) Tj ET\n`;
    content += paths;
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
    return pdf.write({ indirects, root: { num: 1, gen: 0 }, version: '1.7' });
}

describe('oconvPdfToIr — ruled tables, under tables (A14b2)', () => {
    // A 2 x 2 grid: rules at y 700 / 680 / 660, x 72 / 172 / 272.
    const GRID = '72 700 m 272 700 l S 72 680 m 272 680 l S 72 660 m 272 660 l S '
        + '72 660 m 72 700 l S 172 660 m 172 700 l S 272 660 m 272 700 l S\n';
    const cellText = (c) => c.children.map((b) => b.children.map((r) => r.text).join('')).join(' ');
    const grid = (t) => t.children.map((r) => r.children.map(cellText));

    // A cell over 40 characters: no aligned-text table (A14a's cap), a ruled one.
    const LONG = 'A description longer than forty characters';

    test('a grid of rules with text in its cells is a table, where its first piece was', () => {
        expect(LONG.length).toBeGreaterThan(40);
        const doc = pdf.read(genRuled([
            { y: 740, x: 72, text: 'Before the table.' },
            { y: 686, x: 80, text: 'Name' }, { y: 686, x: 180, text: 'Value' },
            { y: 666, x: 80, text: LONG }, { y: 666, x: 180, text: '42' },
            { y: 620, x: 72, text: 'After the table.' }
        ], GRID));
        const { ir } = pdfToIr(doc, { infer: ['tables'] });
        expect(validate(ir).ok).toBe(true);
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'table', 'paragraph']);
        expect(grid(ir.children[1])).toEqual([['Name', 'Value'], [LONG, '42']]);
        expect(ir.children[1].children.map((r) => r.header)).toEqual([true, false]);
    });

    test('a cell of two lines is joined; without tables asked, the same page is text', () => {
        const doc = pdf.read(genRuled([
            { y: 692, x: 80, text: 'Long' }, { y: 684, x: 80, text: 'label' }, { y: 686, x: 180, text: 'Value' },
            { y: 666, x: 80, text: 'beta' }, { y: 666, x: 180, text: '7' }
        ], GRID));
        const t = pdfToIr(doc, { infer: ['tables'] }).ir.children.find((n) => n.kind === 'table');
        expect(grid(t)).toEqual([['Long label', 'Value'], ['beta', '7']]);
        expect(pdfToIr(doc, { infer: [] }).ir.children.some((n) => n.kind === 'table')).toBe(false);
        expect(pdfToIr(doc, { infer: ['headings'] }).ir.children.some((n) => n.kind === 'table')).toBe(false);
    });

    test('a framed box (one cell) and a one-row grid are no tables', () => {
        const box = pdf.read(genRuled([{ y: 680, x: 80, text: 'A note in a box.' }], '72 660 200 40 re S\n'));
        expect(pdfToIr(box, { infer: ['tables'] }).ir.children.map((n) => n.kind)).toEqual(['paragraph']);
        const oneRow = pdf.read(genRuled([{ y: 686, x: 80, text: 'Only' }, { y: 686, x: 180, text: 'row' }], GRID));
        expect(pdfToIr(oneRow, { infer: ['tables'] }).ir.children.some((n) => n.kind === 'table' && n.children.length > 1)).toBe(false);
    });
});

// A44a (D49 (3) a) — the untagged structure declared, under `declare: ['positional']`.
describe('oconvPdfToIr — the untagged structure declared, opt-in (A44a)', () => {
    const POSITIONAL = 'struct/positional';
    let untagged;
    let withImage;
    beforeAll(() => {
        untagged = pdf.read(genUntagged([{ y: 740, size: 20, text: 'A Title' }, { y: 700, text: 'Body text.' }]));
        withImage = pdf.read(genUntagged([{ y: 720, text: 'Text with a picture.' }], 'q 100 0 0 100 72 500 cm /Im1 Do Q\n'));
    });

    test("one struct/positional loss, after the extraction's, naming what was built", () => {
        const { losses } = pdfToIr(withImage, { declare: ['positional'], infer: [] });
        expect(losses.filter((l) => l.code === POSITIONAL)).toHaveLength(1);
        expect(losses[losses.length - 1]).toEqual({ code: POSITIONAL, detail: 'paragraphs' });
        expect(losses).toContainEqual({ code: 'image/dropped', detail: 'Im1 (7 0 R, 1x1)' });
        const detail = (infer) => pdfToIr(untagged, { declare: ['positional'], infer }).losses
            .find((l) => l.code === POSITIONAL).detail;
        expect(detail(['headings'])).toBe('paragraphs, headings');
        expect(detail(['tables'])).toBe('paragraphs, tables');
        expect(detail(['tables', 'headings'])).toBe('paragraphs, headings, tables');
    });

    test('nothing without the option, on a tagged document, or on an untagged one with no text', () => {
        expect(pdfToIr(untagged).losses).toEqual([]);
        expect(pdfToIr(untagged, { declare: [] }).losses).toEqual([]);
        const tagged = pdf.read(new Uint8Array(readFileSync(new URL('pdf-tagged/tagged-structured.pdf', FIXTURES))));
        expect(pdfToIr(tagged, { declare: ['positional'] }).losses.some((l) => l.code === POSITIONAL)).toBe(false);
        const blank = pdf.read(genUntagged([]));
        expect(pdfToIr(blank, { declare: ['positional'] }).losses).toEqual([]);
    });

    test('every bad value throws `oconv: bad pdf declare`, before the first page', () => {
        for (const v of ['positional', ['glued'], ['positional', 'positional'], [1], null, {}]) {
            expect(() => pdfToIr(untagged, { declare: v })).toThrow('oconv: bad pdf declare');
        }
        expect(() => pdfToIr({ pages: [], _raw: { resolve: () => {} } }, { declare: ['x'] })).toThrow('oconv: bad pdf declare');
    });
});

// A47 — the lines of one marked-content id on the tagged path.
describe('oconvPdfToIr — tagged path: an id\'s pieces joined by the paragraph rule (A47)', () => {
    /** A tagged page: each paragraph `{ pieces: [{ x, y, text }] }` is one `P` of one MCID. */
    function genTagged(paras) {
        const toUni = asciiToUnicode();
        let content = '';
        paras.forEach((para, i) => {
            content += `/P <</MCID ${i}>> BDC`;
            for (const pc of para.pieces) content += ` BT /F1 12 Tf ${pc.x} ${pc.y} Td (${pc.text}) Tj ET`;
            content += ' EMC\n';
        });
        const CATALOG = 1, PAGES = 2, PAGE = 3, CONTENT = 4, FONT = 5, TOUNI = 6, STROOT = 7, ELEM0 = 8;
        const indirects = [
            { num: CATALOG, gen: 0, value: obj.dict({
                Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0),
                MarkInfo: obj.dict({ Marked: obj.bool(true) }), StructTreeRoot: obj.ref(STROOT, 0)
            }) },
            { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) },
            { num: PAGE, gen: 0, value: obj.dict({
                Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
                MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(CONTENT, 0), StructParents: obj.int(0),
                Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(FONT, 0) }) })
            }) },
            { num: CONTENT, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
            { num: FONT, gen: 0, value: obj.dict({
                Type: obj.name('Font'), Subtype: obj.name('Type1'),
                BaseFont: obj.name('Helvetica'), ToUnicode: obj.ref(TOUNI, 0)
            }) },
            { num: TOUNI, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(toUni.length) }), enc(toUni)) },
            { num: STROOT, gen: 0, value: obj.dict({
                Type: obj.name('StructTreeRoot'), K: obj.array(paras.map((_, i) => obj.ref(ELEM0 + i, 0)))
            }) }
        ];
        paras.forEach((_, i) => indirects.push({ num: ELEM0 + i, gen: 0, value: obj.dict({
            Type: obj.name('StructElem'), S: obj.name('P'), P: obj.ref(STROOT, 0), Pg: obj.ref(PAGE, 0), K: obj.int(i)
        }) }));
        return pdf.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });
    }
    const texts = (ir) => ir.children.filter((n) => n.kind === 'paragraph').map((n) => n.children.map((r) => r.text).join(''));

    test('a line wrap inside one id is a space; a same-line gap over 0.15 em too, a kern-sized one not', () => {
        // Helvetica 12 pt: "gap" is 20.016 wide, so from x 110 it ends at 130.016.
        const doc = pdf.read(genTagged([
            { pieces: [{ x: 72, y: 700, text: 'the first line ends with' }, { x: 72, y: 686, text: 'the next line.' }] },
            { pieces: [{ x: 72, y: 600, text: 'Left' }, { x: 110, y: 600, text: 'gap' }, { x: 130.3, y: 600, text: 'ward' }] }
        ]));
        const { ir, coverage } = pdfToIr(doc);
        expect(coverage.tagged).toBe(true);
        expect(validate(ir).ok).toBe(true);
        expect(texts(ir)).toEqual(['the first line ends with the next line.', 'Left gapward']);
    });
});

/**
 * Build a one-page tagged PDF from a struct tree: an element is
 * `{ S, K }`, a leaf of `K` is a string or `{ t, x, y }` — each leaf its own
 * marked-content id, shown at `(x, y)` (by default one line further down,
 * 14 pt apart). `opts.roleMap` maps custom tags (`{ Custom: 'P' }`).
 */
function genTagged(roots, opts = {}) {
    const toUni = asciiToUnicode();
    const CATALOG = 1, PAGES = 2, PAGE = 3, CONTENT = 4, FONT = 5, TOUNI = 6, STROOT = 7;
    const indirects = [];
    let next = 8;
    let mcid = 0;
    let line = 0;
    let content = '';
    function elem(e, parentNum) {
        const num = next++;
        const kids = [];
        for (const k of e.K) {
            if (typeof k === 'string' || k.t !== undefined) {
                const leaf = typeof k === 'string' ? { t: k } : k;
                const x = leaf.x === undefined ? 72 : leaf.x;
                const y = leaf.y === undefined ? 720 - 14 * line++ : leaf.y;
                content += `/${e.S} <</MCID ${mcid}>> BDC BT /F1 12 Tf ${x} ${y} Td (${leaf.t}) Tj ET EMC\n`;
                kids.push(obj.int(mcid++));
            } else kids.push(obj.ref(elem(k, num), 0));
        }
        indirects.push({ num, gen: 0, value: obj.dict({
            Type: obj.name('StructElem'), S: obj.name(e.S), P: obj.ref(parentNum, 0),
            Pg: obj.ref(PAGE, 0), K: obj.array(kids)
        }) });
        return num;
    }
    const rootKids = roots.map((r) => obj.ref(elem(r, STROOT), 0));
    const stEntries = { Type: obj.name('StructTreeRoot'), K: obj.array(rootKids) };
    if (opts.roleMap) {
        stEntries.RoleMap = obj.dict(Object.fromEntries(Object.entries(opts.roleMap).map(([k, v]) => [k, obj.name(v)])));
    }
    indirects.push(
        { num: CATALOG, gen: 0, value: obj.dict({
            Type: obj.name('Catalog'), Pages: obj.ref(PAGES, 0),
            StructTreeRoot: obj.ref(STROOT, 0), MarkInfo: obj.dict({ Marked: obj.bool(true) })
        }) },
        { num: PAGES, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(PAGE, 0)]), Count: obj.int(1) }) },
        { num: PAGE, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(PAGES, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(CONTENT, 0), Resources: obj.dict({ Font: obj.dict({ F1: obj.ref(FONT, 0) }) }),
            StructParents: obj.int(0)
        }) },
        { num: CONTENT, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
        { num: FONT, gen: 0, value: obj.dict({
            Type: obj.name('Font'), Subtype: obj.name('Type1'),
            BaseFont: obj.name('Helvetica'), ToUnicode: obj.ref(TOUNI, 0)
        }) },
        { num: TOUNI, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(toUni.length) }), enc(toUni)) },
        { num: STROOT, gen: 0, value: obj.dict(stEntries) }
    );
    return pdf.write({ indirects, root: { num: CATALOG, gen: 0 }, version: '1.7' });
}

/** A block's text: a paragraph's or heading's runs; a list or table by its parts. */
function shapeOf(n) {
    const text = (b) => b.children.map((r) => r.text).join('');
    if (n.kind === 'paragraph') return text(n);
    if (n.kind === 'heading') return { h: n.level, text: text(n) };
    if (n.kind === 'list') return { list: n.ordered ? 'ordered' : 'bullet', items: n.children.map((it) => it.children.map(shapeOf)) };
    if (n.kind === 'table') return { table: n.children.map((r) => ({ header: r.header, cells: r.children.map((c) => c.children.map(shapeOf)) })) };
    return n.kind;
}

describe('oconvPdfStruct — the tree in /K order (T34 a)', () => {
    test('a P whose /K mixes ids and a Span keeps that order; the RoleMap maps a custom tag', () => {
        const doc = pdf.read(genTagged([
            { S: 'P', K: ['one', { S: 'Span', K: ['two'] }, 'three'] },
            { S: 'Custom', K: ['four'] }
        ], { roleMap: { Custom: 'P' } }));
        const { tree } = rt.resolve('oconvPdfStruct').readStructure(doc, doc._raw.resolve);
        expect(tree).toEqual([
            { tag: 'P', pageIndex: 0, kids: [
                { mcid: 0, pageIndex: 0 },
                { tag: 'Span', pageIndex: 0, kids: [{ mcid: 1, pageIndex: 0 }] },
                { mcid: 2, pageIndex: 0 }
            ] },
            { tag: 'P', pageIndex: 0, kids: [{ mcid: 3, pageIndex: 0 }] }
        ]);
    });
});

describe('oconvPdfToIr — tagged walk in /K order: inline children, lists, tables (T34 a)', () => {
    const blocks = (roots, opts) => {
        const { ir, losses } = pdfToIr(pdf.read(genTagged(roots, opts)));
        expect(validate(ir).ok).toBe(true);
        return { shape: ir.children.map(shapeOf), losses };
    };

    test('an inline Span joins its paragraph in order; a word split across ids gets no space', () => {
        expect(blocks([{ S: 'P', K: ['Hello', { S: 'Span', K: ['big'] }, 'world'] }]).shape).toEqual(['Hello big world']);
        const split = blocks([{ S: 'P', K: [{ t: 'Hel', x: 72, y: 600 }, { S: 'Link', K: [{ t: 'lo', x: 90, y: 600 }] }] }]);
        expect(split.shape).toEqual(['Hello']);
    });

    test('a lead-in paragraph holding a list: the text first, then an ordered list without its labels', () => {
        const { shape, losses } = blocks([{ S: 'P', K: ['Choose one:', { S: 'L', K: [
            { S: 'LI', K: [{ S: 'Lbl', K: ['1.'] }, { S: 'LBody', K: ['Red'] }] },
            { S: 'LI', K: [{ S: 'Lbl', K: ['2.'] }, { S: 'LBody', K: ['Blue'] }] }
        ] }] }]);
        expect(shape).toEqual(['Choose one:', { list: 'ordered', items: [['Red'], ['Blue']] }]);
        expect(losses.filter((l) => l.code === 'struct/dropped')).toEqual([]);
    });

    test('bullets and markers are dropped, another label kept; nested lists stay in their item', () => {
        const { shape } = blocks([{ S: 'L', K: [
            { S: 'LI', K: [{ S: 'Lbl', K: ['-'] }, { S: 'LBody', K: ['Alpha'] }] },
            { S: 'L', K: [{ S: 'LI', K: [{ S: 'LBody', K: ['Sub'] }] }] },
            { S: 'LI', K: [{ S: 'Lbl', K: ['Note'] }, { S: 'LBody', K: ['Beta', { S: 'L', K: [
                { S: 'LI', K: [{ S: 'Lbl', K: ['a.'] }, { S: 'LBody', K: ['Inner'] }] }
            ] }] }] }
        ] }]);
        expect(shape).toEqual([{ list: 'bullet', items: [
            ['Alpha', { list: 'bullet', items: [['Sub']] }],
            ['Note Beta', { list: 'bullet', items: [['Inner']] }]
        ] }]);
    });

    test('a Table with a caption, a THead and a TBody is a table with its header row', () => {
        const { shape, losses } = blocks([{ S: 'Table', K: [
            { S: 'Caption', K: ['Prices'] },
            { S: 'THead', K: [{ S: 'TR', K: [{ S: 'TH', K: ['Item'] }, { S: 'TH', K: ['Cost'] }] }] },
            { S: 'TBody', K: [{ S: 'TR', K: [{ S: 'TD', K: ['Pen'] }, { S: 'TD', K: ['2'] }] }] }
        ] }]);
        expect(shape).toEqual(['Prices', { table: [
            { header: true, cells: [['Item'], ['Cost']] },
            { header: false, cells: [['Pen'], ['2']] }
        ] }]);
        expect(losses.filter((l) => l.code === 'struct/dropped')).toEqual([]);
    });

    test('rows straight under the Table: an all-TH row is a header; a Table without TR stays flattened', () => {
        expect(blocks([{ S: 'Table', K: [
            { S: 'TR', K: [{ S: 'TH', K: ['A'] }, { S: 'TH', K: ['B'] }] },
            { S: 'TR', K: [{ S: 'TD', K: ['1'] }, { S: 'TH', K: ['2'] }] }
        ] }]).shape).toEqual([{ table: [
            { header: true, cells: [['A'], ['B']] },
            { header: false, cells: [['1'], ['2']] }
        ] }]);
        const loose = blocks([{ S: 'Table', K: [{ S: 'P', K: ['loose'] }] }]);
        expect(loose.shape).toEqual(['loose']);
        expect(loose.losses).toContainEqual({ code: 'struct/dropped', detail: 'Table' });
    });

    test('a RoleMap tag reads as its standard type; a cycle reads as an unknown block', () => {
        expect(blocks([{ S: 'Heading1', K: ['Title'] }, { S: 'A', K: ['body'] }], { roleMap: { Heading1: 'H1', A: 'B', B: 'A' } }).shape)
            .toEqual([{ h: 1, text: 'Title' }, 'body']);
    });
});

describe('oconvPdfTextExtract — a dropped picture is named by its object and size (T34 b)', () => {
    test('one picture under two names, two pictures under one name: the details follow the pictures', () => {
        const pic = (w, h) => obj.stream(obj.dict({
            Type: obj.name('XObject'), Subtype: obj.name('Image'), Width: obj.int(w), Height: obj.int(h),
            ColorSpace: obj.name('DeviceGray'), BitsPerComponent: obj.int(8), Length: obj.int(1)
        }), new Uint8Array([0]));
        const content = '/A Do /B Do /C Do\n';
        const indirects = [
            { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
            { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0), obj.ref(4, 0)]), Count: obj.int(2) }) },
            { num: 3, gen: 0, value: obj.dict({
                Type: obj.name('Page'), Parent: obj.ref(2, 0), MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(5, 0), Resources: obj.dict({ XObject: obj.dict({ A: obj.ref(10, 0), B: obj.ref(10, 0), C: obj.ref(11, 0) }) })
            }) },
            { num: 4, gen: 0, value: obj.dict({
                Type: obj.name('Page'), Parent: obj.ref(2, 0), MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(6, 0), Resources: obj.dict({ XObject: obj.dict({ A: obj.ref(11, 0), D: obj.dict({ Type: obj.name('XObject') }) }) })
            }) },
            { num: 5, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(content.length) }), enc(content)) },
            { num: 6, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(14) }), enc('/A Do /Z Do Q\n')) },
            { num: 10, gen: 0, value: pic(16, 16) },
            { num: 11, gen: 0, value: pic(800, 600) }
        ];
        const doc = pdf.read(pdf.write({ indirects, root: { num: 1, gen: 0 }, version: '1.7' }));
        const { losses } = pdfToIr(doc);
        expect(losses.filter((l) => l.code === 'image/dropped').map((l) => l.detail)).toEqual([
            'A (10 0 R, 16x16)', 'B (10 0 R, 16x16)', 'C (11 0 R, 800x600)', 'A (11 0 R, 800x600)', 'Z'
        ]);
    });
});

describe('oconvPdfToIr — line-end hyphens (T34 c)', () => {
    const texts = (lines, opts) => pdfToIr(pdf.read(genUntagged(lines)), opts).ir.children
        .filter((n) => n.kind === 'paragraph' || n.kind === 'heading').map((n) => n.children.map((r) => r.text).join(''));

    test('a soft hyphen joins by default; a hyphen only under lineHyphens', () => {
        expect(texts([{ y: 720, text: 'infor\\255' }, { y: 706, text: 'mation' }])).toEqual(['information']);
        const hard = [{ y: 720, text: 'infor-' }, { y: 706, text: 'mation' }];
        expect(texts(hard)).toEqual(['infor- mation']);
        expect(texts(hard, { lineHyphens: 'drop' })).toEqual(['information']);
        expect(texts(hard, { lineHyphens: 'keep' })).toEqual(['infor-mation']);
    });

    test('the inferred headings and the tagged path take it too', () => {
        const heading = [{ y: 720, text: 'Big-', size: 20 }, { y: 698, text: 'title', size: 20 }, { y: 650, text: 'Body text here.' }];
        expect(texts(heading, { infer: ['headings'], lineHyphens: 'drop' })[0]).toBe('Bigtitle');
        const tagged = pdfToIr(pdf.read(genTagged([{ S: 'P', K: ['infor-', 'mation'] }])), { lineHyphens: 'keep' });
        expect(tagged.ir.children[0].children[0].text).toBe('infor-mation');
    });

    test('a bad value is refused', () => {
        for (const lineHyphens of ['join', true, null, ['drop']]) {
            expect(() => pdfToIr(pdf.read(genUntagged([{ y: 720, text: 'x' }])), { lineHyphens })).toThrow('oconv: bad pdf line hyphens');
        }
    });
});

describe('oconvPdfToIr — running headers and footers, opt-in (T34 e)', () => {
    const page = (n, extra = []) => [
        { y: 770, text: 'Report 2026' },
        { y: 400, text: `Body of page ${n}.` },
        { y: 20, text: `Page ${n} of 4` },
        ...extra
    ];
    const texts = (pages, opts) => {
        const { ir, losses } = pdfToIr(pdf.read(genUntaggedPages(pages)), opts);
        return {
            texts: ir.children.filter((n) => n.kind === 'paragraph').map((n) => n.children[0].text),
            running: losses.filter((l) => l.code === 'text/running-dropped').map((l) => l.detail)
        };
    };

    test("under 'running' the header and the numbered footer leave every page, one loss per line", () => {
        const pages = [1, 2, 3, 4].map((n) => page(n));
        expect(texts(pages, { infer: ['running'] })).toEqual({
            texts: ['Body of page 1.', 'Body of page 2.', 'Body of page 3.', 'Body of page 4.'],
            running: ['Report #', 'Page # of #']
        });
        const without = texts(pages);
        expect(without.texts).toContain('Report 2026');
        expect(without.running).toEqual([]);
    });

    test('a line repeated mid-page, a header on 2 of 4 pages, a 2-page document stay; a 1.5 pt drift is still dropped', () => {
        const mid = [1, 2, 3, 4].map((n) => [{ y: 500, text: 'Same line' }, { y: 400, text: `Body ${n}` }]);
        expect(texts(mid, { infer: ['running'] }).running).toEqual([]);
        const half = [1, 2, 3, 4].map((n) => (n <= 2 ? page(n) : [{ y: 400, text: `Body ${n}` }]));
        expect(texts(half, { infer: ['running'] }).running).toEqual([]);
        expect(texts([page(1), page(2)], { infer: ['running'] }).running).toEqual([]);
        const drift = [1, 2, 3, 4].map((n) => [{ y: 770 + (n % 2) * 1.5, text: 'Header' }, { y: 400, text: `Body ${n}` }]);
        expect(texts(drift, { infer: ['running'] })).toEqual({ texts: ['Body 1', 'Body 2', 'Body 3', 'Body 4'], running: ['Header'] });
    });
});

// T25 (a) — the opt-in inference raised further: URW's bold, captions,
// one heading size per line, tables of contents.

describe('oconvPdfToIr — the opt-in inference raised further (T25 a)', () => {
    const shape = (ir) => ir.children.map((n) => [n.kind, n.level, n.kind === 'table' ? undefined : n.children[0].text]);

    test("a whole line in URW's bold (`-Medi`) is a bold heading; the default reads as today", () => {
        const doc = pdf.read(genTwoFonts([
            { y: 740, text: '3 Training Details', bold: true },
            { y: 720, text: 'Plain text of the section.' },
            { y: 706, text: 'More plain text.' }
        ], 'NimbusRomNo9L-Medi'));
        expect(shape(pdfToIr(doc, { infer: ['headings'] }).ir)).toEqual([
            ['heading', 1, '3 Training Details'],
            ['paragraph', undefined, 'Plain text of the section. More plain text.']
        ]);
        expect(pdfToIr(doc, { infer: [] }).ir.children.every((n) => n.kind === 'paragraph')).toBe(true);
    });

    test('a caption set in bold or larger stays a paragraph; a heading that only starts like one stays a heading', () => {
        const doc = pdf.read(genTwoFonts([
            { y: 760, text: 'Results', size: 16 },
            { y: 730, text: 'Figure 3.3. Biomass use in the industry', bold: true },
            { y: 710, text: 'Some text.' },
            { y: 680, text: 'TABLE 2: Members per region', size: 16 },
            { y: 650, text: 'More text.' },
            { y: 620, text: 'Figures of the year', bold: true },
            { y: 600, text: 'Last text.' },
            { y: 570, text: 'Fig.4 Map of the site', bold: true },
            { y: 550, text: 'Closing text.' }
        ]));
        expect(shape(pdfToIr(doc, { infer: ['headings'] }).ir)).toEqual([
            ['heading', 1, 'Results'],
            ['paragraph', undefined, 'Figure 3.3. Biomass use in the industry'],
            ['paragraph', undefined, 'Some text.'],
            ['paragraph', undefined, 'TABLE 2: Members per region'],
            ['paragraph', undefined, 'More text.'],
            ['heading', 2, 'Figures of the year'],
            ['paragraph', undefined, 'Last text.'],
            ['paragraph', undefined, 'Fig.4 Map of the site'],
            ['paragraph', undefined, 'Closing text.']
        ]);
    });

    test('a title set at two heading sizes on one line (small caps) is one heading of the larger size', () => {
        // Helvetica `T` at 16 pt is 9.776 pt wide: `HE` starts where it ends.
        const doc = pdf.read(genTwoFonts([
            { y: 740, text: 'T', size: 16, x: 72 },
            { y: 740, text: 'HE CIRCLE', size: 13, x: 81.776 },
            { y: 700, text: 'Body text.' },
            { y: 660, text: 'Other', size: 13 },
            { y: 640, text: 'More body text.' }
        ]));
        expect(shape(pdfToIr(doc, { infer: ['headings'] }).ir)).toEqual([
            ['heading', 1, 'THE CIRCLE'],
            ['paragraph', undefined, 'Body text.'],
            ['heading', 2, 'Other'],
            ['paragraph', undefined, 'More body text.']
        ]);
    });

    test('a body-sized piece on a heading line still ends the heading', () => {
        const doc = pdf.read(genTwoFonts([
            { y: 740, text: 'B', size: 16, x: 72 },
            { y: 740, text: 'ig start of the text.', size: 11, x: 82.672 },
            { y: 700, text: 'Body text.' }
        ]));
        expect(shape(pdfToIr(doc, { infer: ['headings'] }).ir)).toEqual([
            ['heading', 1, 'B'],
            ['paragraph', undefined, 'ig start of the text.'],
            ['paragraph', undefined, 'Body text.']
        ]);
    });

    const toc = (rows) => rows.flatMap(([entry, page], k) => [
        { y: 700 - 14 * k, text: entry, x: 72 }, { y: 700 - 14 * k, text: page, x: 500 }
    ]);
    const kinds = (rows) => pdfToIr(pdf.read(genTwoFonts(toc(rows))), { infer: ['tables'] }).ir.children.map((n) => n.kind);

    test('a table of contents (entries, then page numbers that do not decrease) is no table', () => {
        const rows = [['Executive Summary', '4'], ['Legal Framework', '6'], ['Election Administration', '11'], ['Annexes', '11']];
        const { ir } = pdfToIr(pdf.read(genTwoFonts(toc(rows))), { infer: ['tables'] });
        expect(ir.children.map((n) => [n.kind, n.children[0].text])).toEqual([
            ['paragraph', 'Executive Summary 4 Legal Framework 6 Election Administration 11 Annexes 11']
        ]);
        expect(kinds([['Preface', 'v'], ['Acknowledgments', 'vii'], ['Foreword', 'ix']])).toEqual(['paragraph']);
    });

    test('page numbers that decrease, first cells without a letter, two rows only, or a third column: still a table', () => {
        expect(kinds([['kaolinite', '150'], ['illite', '30'], ['humus', '200']])).toEqual(['table']);
        expect(kinds([['1', '4'], ['2', '9'], ['3', '15']])).toEqual(['table']);
        expect(kinds([['Introduction', '4'], ['Methods', '9']])).toEqual(['table']);
        const three = [['Item', '1', '4'], ['Other', '2', '9'], ['Last', '3', '15']].flatMap(([a, b, c], k) => [
            { y: 700 - 14 * k, text: a, x: 72 }, { y: 700 - 14 * k, text: b, x: 300 }, { y: 700 - 14 * k, text: c, x: 500 }
        ]);
        expect(pdfToIr(pdf.read(genTwoFonts(three)), { infer: ['tables'] }).ir.children.map((n) => n.kind)).toEqual(['table']);
    });
});

// T25 (b) — a table row drawn as one TJ, read as a table under 'tables'.

describe('oconvPdfToIr — table rows drawn as one TJ each (T25 b)', () => {
    /** One untagged Helvetica page from raw content. */
    function genContent(content) {
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
        return pdf.write({ indirects, root: { num: 1, gen: 0 }, version: '1.7' });
    }
    // Three rows, each one TJ: its cells 6 em apart (digits are all
    // 0.556 em wide in Helvetica, so the columns line up).
    const ROWS = [['Code', 'Unit', 'Rate'], ['1001', '2002', '3003'], ['1004', '2005', '3006']];
    const content = 'BT /F1 11 Tf 72 740 Td (Rates of the year.) Tj ET\n'
        + ROWS.map((r, k) => `BT /F1 11 Tf 72 ${700 - 14 * k} Td [(${r[0]}) -6000 (${r[1]}) -6000 (${r[2]})] TJ ET\n`).join('')
        + 'BT /F1 11 Tf 72 630 Td (Rates may change.) Tj ET\n';
    const cellText = (c) => c.children.map((b) => b.children.map((r) => r.text).join('')).join(' ');

    test("under 'tables' the rows are a table; without it, the text reads as today", () => {
        const doc = pdf.read(genContent(content));
        const { ir } = pdfToIr(doc, { infer: ['tables'] });
        expect(validate(ir).ok).toBe(true);
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'table', 'paragraph']);
        expect(ir.children[1].children.map((r) => r.children.map(cellText))).toEqual(ROWS);
        const today = pdfToIr(doc, { infer: [] }).ir.children; // T30 (a2), D51: the text-first read is `infer: []` since 2.0.0.
        expect(today.map((n) => n.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
        expect(today[1].children[0].text).toBe('Code Unit Rate 1001 2002 3003 1004 2005 3006');
    });

    test("the pages are cut only for an untagged document under 'tables'", () => {
        const seen = [];
        const real = rt.resolve('oconvPdfTextExtract');
        const spy = { ...real, extractPage: (page, resolve, opts) => { seen.push(!!(opts && opts.cellKerns)); return real.extractPage(page, resolve, opts); } };
        const { pdfToIr: spied } = oconvPdfToIr.factory(rt.resolve('oconvIr'), spy, rt.resolve('oconvPdfStruct'));
        const untagged = pdf.read(genContent(content));
        const tagged = pdf.read(genTagged([{ S: 'P', K: ['Code Unit Rate'] }]));
        spied(untagged, { infer: ['tables'] });
        spied(untagged, { infer: ['headings'] });
        spied(untagged, { infer: [] }); // T30 (a2), D51: the text-first read is `infer: []` since 2.0.0.
        spied(tagged, { infer: ['tables'] });
        expect(seen).toEqual([true, false, false, false]);
    });
});

// T25 (c) — rows on several baselines, and one long column, under 'tables'.

describe('oconvPdfToIr — rows on several baselines, one long column (T25 c)', () => {
    const cellText = (c) => c.children.map((b) => b.children.map((r) => r.text).join('')).join(' ');
    const grid = (t) => t.children.map((r) => r.children.map(cellText));
    const kinds = (doc, opts) => pdfToIr(doc, opts).ir.children.map((n) => n.kind);
    // 11 pt: a centred cell's two lines sit 6 pt (0.55 em) above and below
    // the row's other cells, drawn cell by cell, as 180 and 178 draw them.
    const centredRow = (y, a, b1, b2, c) => [
        { y, text: a, x: 72 }, { y: y + 6, text: b1, x: 160 }, { y: y - 6, text: b2, x: 160 }, { y, text: c, x: 260 }
    ];
    const HEADER = [{ y: 700, text: 'Version', x: 72 }, { y: 700, text: 'Date', x: 160 }, { y: 700, text: 'Change', x: 260 }];
    const CENTRED = [
        { y: 740, text: 'Version history.' },
        ...HEADER,
        ...centredRow(670, '1.0', 'April 30,', '2022', 'Original'),
        ...centredRow(634, '1.1', 'June 3,', '2022', 'Edits'),
        { y: 590, text: 'Body text after.' }
    ];

    test('rows centring a one-line cell against a two-line cell are one table', () => {
        const { ir } = pdfToIr(pdf.read(genTwoFonts(CENTRED)), { infer: ['tables'] });
        expect(validate(ir).ok).toBe(true);
        expect(ir.children.map((n) => n.kind)).toEqual(['paragraph', 'table', 'paragraph']);
        expect(grid(ir.children[1])).toEqual([['Version', 'Date', 'Change'], ['1.0', 'April 30, 2022', 'Original'], ['1.1', 'June 3, 2022', 'Edits']]);
    });

    test('a three-column table whose last column holds long cells is a table', () => {
        const long = 'meetings, consultations, listening sessions and email lists';
        expect(long.length > 40 && long.length <= 120).toBe(true);
        const doc = pdf.read(genTwoFonts([
            { y: 700, text: 'Channel', x: 72, size: 8 }, { y: 700, text: 'Medium', x: 150, size: 8 }, { y: 700, text: 'Examples', x: 230, size: 8 },
            { y: 688, text: 'Direct', x: 72, size: 8 }, { y: 688, text: 'Physical', x: 150, size: 8 }, { y: 688, text: long, x: 230, size: 8 },
            { y: 676, text: 'Events', x: 72, size: 8 }, { y: 676, text: 'Digital', x: 150, size: 8 }, { y: 676, text: long, x: 230, size: 8 }
        ]));
        const t = pdfToIr(doc, { infer: ['tables'] }).ir.children[0];
        expect(t.kind).toBe('table');
        expect(grid(t)).toEqual([['Channel', 'Medium', 'Examples'], ['Direct', 'Physical', long], ['Events', 'Digital', long]]);
    });

    test('equation lines with smaller subscripts at a sub-line offset stay text', () => {
        // Each line: P with a subscript, a comma, Q with a subscript; the
        // subscripts 6 pt lower in 7 pt, drawn between the main pieces.
        const line = (y) => [
            { y, text: 'P', x: 72 }, { y: y - 6, text: 'LL', x: 80, size: 7 }, { y, text: ',', x: 150 },
            { y, text: 'Q', x: 200 }, { y: y - 6, text: 'HH', x: 208, size: 7 }
        ];
        const doc = pdf.read(genTwoFonts([...line(700), ...line(676), ...line(652)]));
        expect(kinds(doc, { infer: ['tables'] }).includes('table')).toBe(false);
    });

    test('a header and one centred row (two rows) stay text', () => {
        const doc = pdf.read(genTwoFonts([...HEADER, ...centredRow(670, '1.0', 'April 30,', '2022', 'Original')]));
        expect(kinds(doc, { infer: ['tables'] }).includes('table')).toBe(false);
    });

    test('a three-column candidate whose first column is long stays text', () => {
        const title = 'Introduction to researching wicked problems';
        expect(title.length > 40).toBe(true);
        const doc = pdf.read(genTwoFonts([
            { y: 700, text: title, x: 72, size: 8 }, { y: 700, text: 'Part', x: 300, size: 8 }, { y: 700, text: '3', x: 400, size: 8 },
            { y: 688, text: title, x: 72, size: 8 }, { y: 688, text: 'Part', x: 300, size: 8 }, { y: 688, text: '13', x: 400, size: 8 },
            { y: 676, text: title, x: 72, size: 8 }, { y: 676, text: 'Part', x: 300, size: 8 }, { y: 676, text: '25', x: 400, size: 8 }
        ]));
        expect(kinds(doc, { infer: ['tables'] }).includes('table')).toBe(false);
    });

    test("without 'tables', the centred rows read as text", () => {
        const doc = pdf.read(genTwoFonts(CENTRED));
        expect(kinds(doc, { infer: [] }).every((k) => k === 'paragraph')).toBe(true);
        expect(kinds(doc, { infer: ['headings'] }).includes('table')).toBe(false);
    });
});

// T25 (d) — ruled tables drawn in segments, and a grid coarser than its text.

describe('oconvPdfToIr — ruled tables drawn in segments (T25 d)', () => {
    const cellText = (c) => c.children.map((b) => b.children.map((r) => r.text).join('')).join(' ');
    const grid = (t) => t.children.map((r) => r.children.map(cellText));
    const LONG = 'A description longer than forty characters';
    const XS = [72, 172, 272];
    const YS = [700, 680, 660, 640];
    // Whole horizontals; each vertical cut at every row border, as 146 draws
    // it: a long segment from the row's lower rule to 5 units under its
    // upper rule, then a short one across the upper rule.
    const hRules = YS.map((y) => `72 ${y} m 272 ${y} l S`).join(' ');
    const vSegments = XS.flatMap((x) => YS.slice(1).map((lo, k) => {
        const hi = YS[k];
        return `${x} ${lo + 0.2} m ${x} ${hi - 5} l S ${x} ${hi - 5} m ${x} ${hi + 0.3} l S`;
    })).join(' ');
    const SEGMENTED = [
        { y: 686, x: 80, text: 'Name' }, { y: 686, x: 180, text: 'Value' },
        { y: 666, x: 80, text: LONG }, { y: 666, x: 180, text: '42' },
        { y: 646, x: 80, text: 'beta' }, { y: 646, x: 180, text: '7' }
    ];

    test('a ruled table whose verticals are drawn in one segment per row is one table', () => {
        expect(LONG.length).toBeGreaterThan(40);
        const { ir } = pdfToIr(pdf.read(genRuled(SEGMENTED, `${hRules} ${vSegments}\n`)), { infer: ['tables'] });
        expect(validate(ir).ok).toBe(true);
        const tables = ir.children.filter((n) => n.kind === 'table');
        expect(tables.length).toBe(1);
        expect(grid(tables[0])).toEqual([['Name', 'Value'], [LONG, '42'], ['beta', '7']]);
    });

    test('a grid with a rule under its header only reads its body rows by line', () => {
        // Rules at 700, 680 (under the header) and 620; whole verticals.
        const paths = '72 700 m 272 700 l S 72 680 m 272 680 l S 72 620 m 272 620 l S '
            + XS.map((x) => `${x} 620 m ${x} 700 l S`).join(' ') + '\n';
        const doc = pdf.read(genRuled([
            { y: 686, x: 80, text: 'Name' }, { y: 686, x: 180, text: 'Value' },
            { y: 666, x: 80, text: 'alpha' }, { y: 666, x: 180, text: '1' },
            { y: 652, x: 80, text: 'beta' }, { y: 652, x: 180, text: '2' },
            { y: 638, x: 80, text: 'gamma' }, { y: 638, x: 180, text: '3' }
        ], paths));
        const tables = pdfToIr(doc, { infer: ['tables'] }).ir.children.filter((n) => n.kind === 'table');
        expect(tables.length).toBe(1);
        expect(grid(tables[0])).toEqual([['Name', 'Value'], ['alpha', '1'], ['beta', '2'], ['gamma', '3']]);
    });

    test("without 'tables', the segmented table reads as text", () => {
        const doc = pdf.read(genRuled(SEGMENTED, `${hRules} ${vSegments}\n`));
        expect(pdfToIr(doc, { infer: [] }).ir.children.some((n) => n.kind === 'table')).toBe(false);
        expect(pdfToIr(doc, { infer: ['headings'] }).ir.children.some((n) => n.kind === 'table')).toBe(false);
    });
});
