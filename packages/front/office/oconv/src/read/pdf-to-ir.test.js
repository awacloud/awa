// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
// Relative import of the sibling @awacloud/pdf manifest — see font-decoder.test.js
// for why the bare specifier is not used here (task 06 adds the package dep).
import { fw_require, pkg_require, modules } from '../../../pdf/src/main.js';
import { oconvIr } from '../ir/ir.js';
import { oconvPdfFontDecoder } from './pdf/font-decoder.js';
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
    rt.register(oconvPdfFontDecoder);
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
        expect(losses).toContainEqual({ code: 'image/dropped', detail: 'Im1' });
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
        for (const ln of lines) content += `BT /F1 12 Tf 72 ${ln.y} Td (${ln.text}) Tj ET\n`;
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
            [{ y: 720, x: 72, text: 'ab' }, { y: 720, x: 84, text: 'cd' }]
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
            kind: 'heading', level: 1, children: [{ kind: 'run', text: 'Quarterly Report', bold: false, italic: false, strike: false, code: false, link: null }]
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
