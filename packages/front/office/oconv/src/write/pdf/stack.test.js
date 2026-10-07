// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { pdfWriterRuntime, corpusBytes, CORPUS_PDF } from './_test-runtime.js';
import { oconvPdfStack } from './stack.js';
import { oconvPdfMetrics } from './metrics.js';
import { oconvPdfBox } from './box.js';
import { oconvPdfLinebreak } from './linebreak.js';

/* ── runtimes ─────────────────────────────────────────────────────────────
 * A descriptor-only runtime pins the shape (`dependencies: []` — the stack
 * composes ONLY through call-time ctx members); a full runtime supplies the
 * real metrics / box / linebreak / md-to-ir modules.
 * ─────────────────────────────────────────────────────────────────────── */
let bare;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.register(oconvPdfStack);
    bare = rt.resolve('oconvPdfStack');
});

const full = pdfWriterRuntime([oconvPdfMetrics, oconvPdfBox, oconvPdfLinebreak, oconvPdfStack]);
const metrics = full.resolve('oconvPdfMetrics');
const box = full.resolve('oconvPdfBox');
const lb = full.resolve('oconvPdfLinebreak');
const stack = full.resolve('oconvPdfStack');
const { mdToIr } = full.resolve('oconvMdToIr');

const s14 = metrics.createMeasurer();
const LAYOUT = box.resolveLayout();

/* ── TEST-ONLY corpus recipe (same as metrics.test.js / linebreak.test.js) ─
 * Mine the four embedded Calibri faces out of the vendored corpus PDF so the
 * provider-swap test runs on a REAL second font, not a synthetic one. `src/`
 * never mines a PDF for a font (D-A).
 * ─────────────────────────────────────────────────────────────────────── */
const STYLE_BY_PSNAME = {
    'Calibri':            'regular',
    'Calibri-Bold':       'bold',
    'Calibri-Italic':     'italic',
    'Calibri-BoldItalic': 'boldItalic'
};

/**
 * @param {object} rt
 * @param {Uint8Array} pdfBytes
 * @returns {Object<string, Uint8Array>} Style class → font program bytes.
 */
function embeddedFontBytesFromPdf(rt, pdfBytes) {
    const pdf = rt.resolve('pdf');
    const dispatch = rt.resolve('pdfFilterDispatch');
    const fontsMod = rt.resolve('fonts');

    const doc = pdf.read(pdfBytes);
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

/* ── corpus + synthetic documents ────────────────────────────────────────
 * The three golden markdown fixtures go through the DELIVERED `mdToIr`
 * reader; the two synthetic generators are ported from the spike's
 * `corpus.js` (plan § Tests to cover) so the numbers stay comparable.
 * ─────────────────────────────────────────────────────────────────────── */
const GOLDEN_MD = ['md/md-structural.md', 'md/md-nested.md', 'md/md-degrade.md'];

/** Golden fixtures as IR documents, filled in `beforeAll`. */
let golden = [];
/** Style class → corpus font program bytes. */
let corpusFonts;
/** Measurer over the four corpus Calibri faces (+ S14 Courier for `code`). */
let calibri;

beforeAll(async () => {
    const decoder = new TextDecoder();
    golden = [];
    for (const rel of GOLDEN_MD) {
        const text = decoder.decode(await corpusBytes(rel));
        golden.push({ name: rel, ir: mdToIr(text).ir });
    }
    corpusFonts = embeddedFontBytesFromPdf(full, await corpusBytes(CORPUS_PDF));
    calibri = metrics.createMeasurer({ fonts: { ...corpusFonts } });
});

const LOREM = [
    'The bounded typesetter promises a single column and one page size for the whole document.',
    'Greedy line breaking on spaces keeps the algorithm predictable and the output deterministic.',
    'A hard page break happens whenever the next block does not fit in the remaining vertical space.',
    'Nothing here hyphenates, justifies, controls widows and orphans, or wraps text around a float.',
    'Every dropped or clipped fragment is recorded as an explicit loss rather than vanishing quietly.'
];

/** One IR run node with every flag the tokenizer reads. */
function run(text, flags) {
    return { kind: 'run', text, bold: false, italic: false, strike: false, code: false, link: null, ...flags };
}

/**
 * The spike's synthetic document (ported verbatim from `corpus.js`).
 *
 * @param {{edges?: boolean, paragraphs?: number}} [opts]
 * @returns {object} `oconv-ir/v1` document.
 */
function syntheticDocument(opts = {}) {
    const edges = opts.edges !== false;
    const paragraphs = opts.paragraphs === undefined ? 12 : opts.paragraphs;
    const children = [
        { kind: 'heading', level: 1, children: [run('Bounded Typesetter Spike')] },
        {
            kind: 'paragraph',
            children: [
                run('This paragraph mixes '), run('bold text', { bold: true }),
                run(', '), run('italic text', { italic: true }),
                run(', '), run('bold italic', { bold: true, italic: true }),
                run(' and '), run('monospaced code', { code: true }),
                run(' inside one flow so every face is measured with its own metrics.')
            ]
        }
    ];
    for (let i = 0; i < paragraphs; i += 1) {
        const line = LOREM[i % LOREM.length];
        children.push({ kind: 'paragraph', children: [run(`Paragraph ${i + 1}. ${line} ${line}`)] });
        if (i % 4 === 3) {
            children.push({ kind: 'heading', level: 2, children: [run(`Section ${1 + (i >> 2)}`)] });
        }
    }
    if (edges) {
        children.push({ kind: 'paragraph', children: [] });
        children.push({ kind: 'paragraph', children: [run('Solo')] });
        children.push({ kind: 'paragraph', children: [run('     ')] });
        children.push({ kind: 'paragraph', children: [run(`Unbreakable${'x'.repeat(160)}`)] });
    }
    return { kind: 'document', children };
}

/**
 * A document with ONE paragraph taller than a whole A4 page (1 400 words).
 *
 * @returns {object} `oconv-ir/v1` document.
 */
function oversizedBlockDocument() {
    const words = [];
    for (let i = 0; i < 1400; i += 1) words.push(`word${i}`);
    return {
        kind: 'document',
        children: [
            { kind: 'heading', level: 1, children: [run('Oversized')] },
            { kind: 'paragraph', children: [run(words.join(' '))] }
        ]
    };
}

/* ── ctx builders ─────────────────────────────────────────────────────── */

/**
 * The D-E renderer STUB task 07 replaces: no items, one
 * `layout/<kind>-stub` loss.
 *
 * @param {object} node
 * @param {object} childCtx
 * @returns {{items: object[], losses: object[]}}
 */
function stubRender(node, childCtx) {
    return { items: [], losses: [{ code: `layout/${node.kind}-stub`, detail: { index: childCtx.index } }] };
}

/**
 * @param {object} [opts]
 * @returns {object} A ctx for `flowBlocks` / `layoutDocument`.
 */
function makeCtx(opts = {}) {
    return {
        measurer: opts.measurer || s14,
        layout: opts.layout || LAYOUT,
        linebreak: lb,
        losses: [],
        render: opts.render || stubRender
    };
}

// =========================================================================
// Descriptor
// =========================================================================

describe('oconvPdfStack — descriptor', () => {
    test('is a pure, dependency-free module descriptor', () => {
        expect(oconvPdfStack.name).toBe('oconvPdfStack');
        expect(oconvPdfStack.dependencies).toEqual([]);
        expect(typeof oconvPdfStack.factory).toBe('function');
    });

    test('publishes the flow / stack / oracle API', () => {
        expect(Object.keys(bare).sort()).toEqual([
            'DELEGATED_KINDS', 'INDENT_STEP', 'flowBlocks', 'laidOutText',
            'layoutDocument', 'stackPages', 'unaccounted'
        ]);
        expect(bare.INDENT_STEP).toBe(18);
        expect(bare.DELEGATED_KINDS).toEqual(['list', 'codeBlock', 'table', 'image']);
    });

    test('a missing ctx member is named, not silently degraded', () => {
        const doc = { kind: 'document', children: [{ kind: 'paragraph', children: [run('x')] }] };
        expect(() => stack.flowBlocks(doc, { losses: [], linebreak: lb }))
            .toThrow('oconv: pdf stack needs ctx.layout');
        expect(() => stack.flowBlocks(doc, { losses: [], layout: LAYOUT }))
            .toThrow('oconv: pdf stack needs ctx.linebreak');
        expect(() => stack.flowBlocks(doc, { layout: LAYOUT, linebreak: lb }))
            .toThrow('oconv: pdf stack needs ctx.losses');
        const listDoc = { kind: 'document', children: [{ kind: 'list', ordered: false, children: [] }] };
        expect(() => stack.flowBlocks(listDoc, { layout: LAYOUT, linebreak: lb, losses: [], measurer: s14 }))
            .toThrow('oconv: pdf stack needs ctx.render');
    });
});

// =========================================================================
// flowBlocks — production fidelity for the four kinds this module OWNS
// =========================================================================

describe('flowBlocks — heading', () => {
    test('size from layout.sizeFor, spaceBefore 1.0·size, spaceAfter 0.5·size, keepTogether', () => {
        const doc = {
            kind: 'document',
            children: [
                { kind: 'heading', level: 1, children: [run('Title')] },
                { kind: 'heading', level: 3, children: [run('Sub')] }
            ]
        };
        const blocks = stack.flowBlocks(doc, makeCtx());
        expect(blocks).toHaveLength(2);
        const [h1, h3] = blocks;
        expect(h1.kind).toBe('heading');
        expect(h1.sizePt).toBe(LAYOUT.sizeFor('heading', 1));
        expect(h1.spaceBefore).toBeCloseTo(1.0 * h1.sizePt, 9);
        expect(h1.spaceAfter).toBeCloseTo(0.5 * h1.sizePt, 9);
        expect(h1.keepTogether).toBe(true);
        expect(h3.sizePt).toBe(LAYOUT.sizeFor('heading', 3));
        expect(h3.sizePt).toBeLessThan(h1.sizePt);
        expect(h1.height).toBeCloseTo(h1.lines.length * LAYOUT.leading(h1.sizePt), 9);
    });

    test('keepTogether moves a bottom-of-page heading WITH the next line', () => {
        // 22 paragraphs fill page 1; a heading placed so that it fits but its
        // successor's first line does not must move to page 2 with it.
        const children = [];
        for (let i = 0; i < 21; i += 1) {
            children.push({ kind: 'paragraph', children: [run(`Filler ${i + 1}. ${LOREM[i % LOREM.length]}`)] });
        }
        children.push({ kind: 'heading', level: 6, children: [run('Tail Heading')] });
        children.push({ kind: 'paragraph', children: [run('The paragraph that must follow its heading.')] });
        const ctx = makeCtx();
        const { pages, blocks } = stack.layoutDocument({ kind: 'document', children }, ctx);
        const headingIndex = String(blocks.findIndex((b) => b.kind === 'heading'));
        const pageOf = (idx) => pages.findIndex((p) => p.items.some((it) => it.index === idx)) + 1;
        expect(pages.length).toBeGreaterThan(1);
        expect(pageOf(headingIndex)).toBe(pageOf(String(Number(headingIndex) + 1)));
    });
});

describe('flowBlocks — paragraph', () => {
    test('body size, no space before, spaceAfter 0.6·size', () => {
        const doc = { kind: 'document', children: [{ kind: 'paragraph', children: [run('Hello world')] }] };
        const [p] = stack.flowBlocks(doc, makeCtx());
        expect(p.kind).toBe('paragraph');
        expect(p.sizePt).toBe(LAYOUT.baseSize);
        expect(p.spaceBefore).toBe(0);
        expect(p.spaceAfter).toBeCloseTo(0.6 * LAYOUT.baseSize, 9);
        expect(p.indent).toBe(0);
        expect(p.rule).toBeUndefined();
        expect(p.lines).toHaveLength(1);
    });

    test('index is the IR block index in document order, dotted for nested blocks', () => {
        const doc = {
            kind: 'document',
            children: [
                { kind: 'paragraph', children: [run('zero')] },
                { kind: 'paragraph', children: [run('one')] },
                {
                    kind: 'blockquote',
                    children: [
                        { kind: 'paragraph', children: [run('two dot zero')] },
                        { kind: 'paragraph', children: [run('two dot one')] }
                    ]
                }
            ]
        };
        const blocks = stack.flowBlocks(doc, makeCtx());
        expect(blocks.map((b) => b.index)).toEqual(['0', '1', '2.0', '2.1']);
    });
});

describe('flowBlocks — blockquote', () => {
    test('children flow at indent + 18 pt with a 1 pt left rule, styles untouched', () => {
        const doc = {
            kind: 'document',
            children: [{
                kind: 'blockquote',
                children: [
                    { kind: 'paragraph', children: [run('plain '), run('emphasis', { italic: true })] },
                    { kind: 'paragraph', children: [run('second quoted paragraph')] }
                ]
            }]
        };
        const blocks = stack.flowBlocks(doc, makeCtx());
        expect(blocks).toHaveLength(2);
        for (const b of blocks) {
            expect(b.kind).toBe('paragraph');
            expect(b.indent).toBe(stack.INDENT_STEP);
            expect(b.rule).toEqual({ x: LAYOUT.margin, width: 1 });
        }
        // No italic override: the runs keep their OWN styles.
        const styles = blocks[0].lines[0].tokens.filter((t) => t.kind === 'word').map((t) => t.style);
        expect(styles).toEqual(['plain', 'emphasis'].map((w) => (w === 'emphasis' ? 'italic' : 'regular')));
    });

    test('a nested blockquote indents twice and re-bases its rule', () => {
        const doc = {
            kind: 'document',
            children: [{
                kind: 'blockquote',
                children: [{
                    kind: 'blockquote',
                    children: [{ kind: 'paragraph', children: [run('deep')] }]
                }]
            }]
        };
        const [b] = stack.flowBlocks(doc, makeCtx());
        expect(b.index).toBe('0.0.0');
        expect(b.indent).toBe(2 * stack.INDENT_STEP);
        expect(b.rule.x).toBe(LAYOUT.margin + stack.INDENT_STEP);
    });

    test('the quote bar is emitted as a rule rect beside its text', () => {
        const doc = {
            kind: 'document',
            children: [{ kind: 'blockquote', children: [{ kind: 'paragraph', children: [run('quoted')] }] }]
        };
        const ctx = makeCtx();
        const { pages } = stack.layoutDocument(doc, ctx);
        const items = pages[0].items;
        const bar = items.find((it) => it.rule);
        const text = items.find((it) => it.tokens && it.tokens.length > 0);
        expect(bar.rule.w).toBe(1);
        expect(bar.rule.x).toBe(LAYOUT.margin);
        expect(bar.rule.h).toBeCloseTo(LAYOUT.leading(LAYOUT.baseSize), 9);
        expect(text.x).toBe(LAYOUT.margin + stack.INDENT_STEP);
        // The bar is placed BEFORE the text it accompanies (drawn beneath).
        expect(items.indexOf(bar)).toBeLessThan(items.indexOf(text));
    });

    test('the bar spans the gap between two quoted blocks on the same page', () => {
        const doc = {
            kind: 'document',
            children: [{
                kind: 'blockquote',
                children: [
                    { kind: 'paragraph', children: [run('first')] },
                    { kind: 'paragraph', children: [run('second')] }
                ]
            }]
        };
        const { pages } = stack.layoutDocument(doc, makeCtx());
        const bars = pages[0].items.filter((it) => it.rule);
        expect(bars).toHaveLength(2);
        const leading = LAYOUT.leading(LAYOUT.baseSize);
        const gap = 0.6 * LAYOUT.baseSize;
        expect(bars[0].rule.h).toBeCloseTo(leading + gap, 9);   // extended over the gap
        expect(bars[1].rule.h).toBeCloseTo(leading, 9);          // last one: body only
        // Continuous: the first bar's bottom is the second bar's top.
        expect(bars[0].rule.y).toBeCloseTo(bars[1].rule.y + bars[1].rule.h, 9);
    });
});

describe('flowBlocks — hr', () => {
    test('a fixed 0.5 pt rule across the column with 12 pt of space either side', () => {
        const doc = { kind: 'document', children: [{ kind: 'hr' }] };
        const [b] = stack.flowBlocks(doc, makeCtx());
        expect(b.kind).toBe('hr');
        expect(b.height).toBe(0.5);
        expect(b.spaceBefore).toBe(12);
        expect(b.spaceAfter).toBe(12);
        expect(b.rule).toEqual({ x: LAYOUT.margin, width: LAYOUT.column });

        const { pages } = stack.layoutDocument(doc, makeCtx());
        const [item] = pages[0].items;
        expect(item.rule.w).toBe(LAYOUT.column);
        expect(item.rule.h).toBe(0.5);
        expect(item.y).toBeCloseTo(LAYOUT.pageHeight - LAYOUT.margin - 12 - 0.5, 9);
    });
});

describe('flowBlocks — unhandled IR kind', () => {
    test('records layout/unhandled-block naming the index, never silent', () => {
        const ctx = makeCtx();
        const doc = { kind: 'document', children: [{ kind: 'footnote', children: [] }] };
        const blocks = stack.flowBlocks(doc, ctx);
        expect(blocks).toEqual([]);
        expect(ctx.losses).toHaveLength(1);
        expect(ctx.losses[0].code).toBe('layout/unhandled-block');
        expect(ctx.losses[0].index).toBe('0');
    });
});

// =========================================================================
// Delegation seam (D-E) — list / codeBlock / table / image
// =========================================================================

describe('delegation to ctx.render (D-E)', () => {
    test('the four delegated kinds go to ctx.render, the four owned kinds do not', () => {
        const seen = [];
        const ctx = makeCtx({
            render: (node, childCtx) => {
                seen.push([node.kind, childCtx.index, childCtx.indent]);
                return stubRender(node, childCtx);
            }
        });
        const doc = {
            kind: 'document',
            children: [
                { kind: 'heading', level: 1, children: [run('H')] },
                { kind: 'paragraph', children: [run('P')] },
                { kind: 'hr' },
                { kind: 'list', ordered: false, children: [] },
                { kind: 'codeBlock', info: '', text: 'x' },
                { kind: 'table', children: [] },
                { kind: 'image', name: 'a.png', alt: 'A' }
            ]
        };
        stack.flowBlocks(doc, ctx);
        expect(seen).toEqual([
            ['list', '3', 0], ['codeBlock', '4', 0], ['table', '5', 0], ['image', '6', 0]
        ]);
    });

    test('renderer losses are forwarded, stamped with the block index and kind', () => {
        const ctx = makeCtx();
        const doc = {
            kind: 'document',
            children: [
                { kind: 'paragraph', children: [run('before')] },
                { kind: 'table', children: [] }
            ]
        };
        stack.flowBlocks(doc, ctx);
        expect(ctx.losses).toEqual([
            { index: '1', kind: 'table', code: 'layout/table-stub', detail: { index: '1' } }
        ]);
    });

    test('a delegated block inside a blockquote is indented and carries the bar', () => {
        const ctx = makeCtx();
        const doc = {
            kind: 'document',
            children: [{
                kind: 'blockquote',
                children: [{ kind: 'codeBlock', info: '', text: 'code' }]
            }]
        };
        const [b] = stack.flowBlocks(doc, ctx);
        expect(b.indent).toBe(stack.INDENT_STEP);
        expect(b.rule).toEqual({ x: LAYOUT.margin, width: 1 });
        expect(b.sizePt).toBe(LAYOUT.codeSize);
    });

    test('block-local renderer items are translated into PDF space', () => {
        // The seam contract: renderer `y` is the distance DOWN from the
        // block top (to a baseline, or to a rule rect's TOP edge).
        const render = () => ({
            height: 40,
            items: [
                { x: 100, y: 12, style: 'code', sizePt: 9.5, tokens: [{ kind: 'word', text: 'row', style: 'code', width: 10, link: null }] },
                { x: 100, y: 20, style: 'regular', sizePt: 9.5, tokens: [], rule: { x: 100, y: 20, w: 50, h: 4 } }
            ]
        });
        const doc = { kind: 'document', children: [{ kind: 'table', children: [] }] };
        const { pages } = stack.layoutDocument(doc, makeCtx({ render }));
        const top = LAYOUT.pageHeight - LAYOUT.margin;
        const [text, rect] = pages[0].items;
        expect(text.y).toBeCloseTo(top - 12, 9);
        expect(text.index).toBe('0');
        expect(text.kind).toBe('table');
        expect(rect.rule.y).toBeCloseTo(top - 20 - 4, 9);      // bottom edge
        expect(rect.y).toBe(rect.rule.y);
    });

    // BATCH_39 task 04 (claim pinning, FINDINGS § 5.4 C25 / BL-1012, open) —
    // `delegate()` (`stack.js:382-402`) builds its `block` literal from
    // `rendered.items`/`rendered.height`/`rendered.losses` only; it never
    // reads `rendered.keepTogether`, so a renderer that returns one has no
    // way to make its delegated block participate in the heading
    // "keepTogether" rule (`FlowBlock.keepTogether`'s own JSDoc: "Set on
    // headings only"). Pinned as CURRENT behaviour (the defect is BL-1012,
    // already open — not fixed here).
    test('a delegated renderer returning `keepTogether: true` has it dropped — the flag never reaches the flow block (BL-1012)', () => {
        const render = () => ({ items: [{ x: 0, y: 10, style: 'regular', sizePt: 11, tokens: [] }], keepTogether: true });
        const doc = { kind: 'document', children: [{ kind: 'table', children: [] }] };
        const [b] = stack.flowBlocks(doc, makeCtx({ render }));
        expect(b.kind).toBe('table');
        expect(b.keepTogether).toBeUndefined();
        expect('keepTogether' in b).toBe(false);
    });

    test('a renderer that reports no height has it derived from its items', () => {
        const render = () => ({
            items: [{ x: 56, y: 30, style: 'regular', sizePt: 12, tokens: [] }],
            losses: []
        });
        const doc = { kind: 'document', children: [{ kind: 'image', name: 'a.png', alt: 'A' }] };
        const [b] = stack.flowBlocks(doc, makeCtx({ render }));
        expect(b.height).toBeCloseTo(30 + 0.25 * 12, 9);
    });
});

// =========================================================================
// F9 — the hard page-break rule
// =========================================================================

describe('F9 — hard page break', () => {
    test('no item is drawn outside [margin, pageHeight - margin] (40-paragraph doc)', () => {
        const ctx = makeCtx();
        const { pages } = stack.layoutDocument(syntheticDocument({ paragraphs: 40 }), ctx);
        expect(pages.length).toBeGreaterThan(1);
        let items = 0;
        for (const p of pages) {
            for (const it of p.items) {
                items += 1;
                expect(it.y).toBeGreaterThanOrEqual(LAYOUT.margin - 0.001);
                expect(it.y).toBeLessThanOrEqual(LAYOUT.pageHeight - LAYOUT.margin + 0.001);
            }
        }
        expect(items).toBeGreaterThan(40);          // non-vacuity
    });

    test('pages are numbered from 1 and no trailing empty page survives', () => {
        const { pages } = stack.layoutDocument(syntheticDocument({ paragraphs: 40 }), makeCtx());
        expect(pages.map((p) => p.number)).toEqual(pages.map((_, i) => i + 1));
        expect(pages[pages.length - 1].items.length).toBeGreaterThan(0);
    });

    test('a block is never split across pages — every item of a block shares one page', () => {
        const ctx = makeCtx();
        const { pages, blocks } = stack.layoutDocument(syntheticDocument({ paragraphs: 40 }), ctx);
        const clipped = new Set(ctx.losses.filter((l) => l.code === 'layout/block-clipped').map((l) => l.index));
        const pageByIndex = new Map();
        for (const p of pages) {
            for (const it of p.items) {
                if (clipped.has(it.index)) continue;
                if (pageByIndex.has(it.index)) expect(pageByIndex.get(it.index)).toBe(p.number);
                else pageByIndex.set(it.index, p.number);
            }
        }
        expect(pageByIndex.size).toBeGreaterThan(blocks.length / 2);
    });
});

describe('F9 — an oversized block is CLIPPED with a recorded loss', () => {
    test('the 1 400-word paragraph clips and the loss names the clipped lines', () => {
        const ctx = makeCtx();
        const { pages } = stack.layoutDocument(oversizedBlockDocument(), ctx);
        const clipped = ctx.losses.filter((l) => l.code === 'layout/block-clipped');
        expect(clipped).toHaveLength(1);
        expect(clipped[0].index).toBe('1');
        expect(clipped[0].kind).toBe('paragraph');
        expect(clipped[0].clippedLines).toBeGreaterThan(0);
        expect(String(clipped[0].detail)).toContain('taller than one page');

        // The clipped block still placed what fitted, all inside the page.
        const placed = pages.flatMap((p) => p.items).filter((it) => it.index === '1');
        expect(placed.length).toBeGreaterThan(0);
        for (const it of placed) expect(it.y).toBeGreaterThanOrEqual(LAYOUT.margin - 0.001);

        // Placed + clipped accounts for every broken line of the block.
        const blocks = stack.flowBlocks(oversizedBlockDocument(), makeCtx());
        const victim = blocks.find((b) => b.index === '1');
        expect(placed.length + clipped[0].clippedLines).toBe(victim.lines.length);
    });
});

// =========================================================================
// The accounting invariant (leg C.2, contractual)
// =========================================================================

describe('accounting invariant — unaccounted() === []', () => {
    test('holds over the golden corpus and both synthetic documents', () => {
        let drawableTotal = 0;
        const docs = [...golden.map((g) => g.ir), syntheticDocument(), syntheticDocument({ paragraphs: 200 }), oversizedBlockDocument()];
        for (const ir of docs) {
            const ctx = makeCtx();
            const { pages, blocks, losses } = stack.layoutDocument(ir, ctx);
            expect(stack.unaccounted(blocks, pages, losses)).toEqual([]);
            drawableTotal += blocks.length;
        }
        expect(drawableTotal).toBeGreaterThan(40);        // non-vacuity floor
    });

    test('negative control — deleting one block\'s items reddens the check', () => {
        const ctx = makeCtx();
        const { pages, blocks, losses } = stack.layoutDocument(syntheticDocument(), ctx);
        expect(stack.unaccounted(blocks, pages, losses)).toEqual([]);
        const victim = pages[0].items[0].index;
        for (const p of pages) p.items = p.items.filter((it) => it.index !== victim);
        const red = stack.unaccounted(blocks, pages, losses);
        expect(red.length).toBe(1);
        expect(red[0].startsWith(`${victim}:`)).toBe(true);
    });

    test('a loss naming the block through detail.index accounts for it too', () => {
        // The exact shape D-E's renderer stubs use (`detail: { index }`).
        const blocks = [{ index: '0', kind: 'table', items: [], height: 0, spaceBefore: 0, spaceAfter: 0, indent: 0, sizePt: 11 }];
        expect(stack.unaccounted(blocks, [{ number: 1, items: [] }], [])).toEqual(['0:table']);
        expect(stack.unaccounted(blocks, [{ number: 1, items: [] }],
            [{ code: 'layout/table-unrendered', detail: { index: '0' } }])).toEqual([]);
    });

    test('a block with nothing to draw is not required to be placed', () => {
        const doc = {
            kind: 'document',
            children: [
                { kind: 'paragraph', children: [] },
                { kind: 'paragraph', children: [run('   ')] },
                { kind: 'paragraph', children: [run('real')] }
            ]
        };
        const ctx = makeCtx();
        const { pages, blocks, losses } = stack.layoutDocument(doc, ctx);
        expect(blocks).toHaveLength(3);
        expect(stack.unaccounted(blocks, pages, losses)).toEqual([]);
        expect(pages[0].items).toHaveLength(1);
        // …and it consumed no vertical space.
        expect(pages[0].items[0].y).toBeCloseTo(LAYOUT.pageHeight - LAYOUT.margin - LAYOUT.leading(LAYOUT.baseSize), 9);
    });
});

// =========================================================================
// Determinism (the gate the whole pipeline's reproducibility rests on)
// =========================================================================

describe('determinism', () => {
    test('two runs produce byte-identical JSON on every document', () => {
        const docs = [...golden.map((g) => g.ir), syntheticDocument(), syntheticDocument({ paragraphs: 200 }), oversizedBlockDocument()];
        for (const ir of docs) {
            const a = JSON.stringify(stack.layoutDocument(ir, makeCtx()));
            const b = JSON.stringify(stack.layoutDocument(ir, makeCtx()));
            expect(a).toBe(b);
            expect(a.length).toBeGreaterThan(100);       // non-vacuity
        }
    });

    test('the module reads no clock and no randomness', () => {
        const src = oconvPdfStack.factory.toString();
        expect(src).not.toContain('Date');
        expect(src).not.toContain('Math.random');
    });
});

// =========================================================================
// Provider swap — the layout follows the measurer, not a hard-coded metric
// =========================================================================

describe('provider swap', () => {
    test('the corpus Calibri faces need no more lines than Helvetica', () => {
        const doc = syntheticDocument({ paragraphs: 40 });
        const withS14 = stack.layoutDocument(doc, makeCtx({ measurer: s14 }));
        const withCalibri = stack.layoutDocument(doc, makeCtx({ measurer: calibri }));
        const count = (r) => r.pages.reduce((n, p) => n + p.items.filter((it) => it.tokens && it.tokens.length > 0).length, 0);
        expect(count(withCalibri)).toBeGreaterThan(0);
        expect(count(withCalibri)).toBeLessThanOrEqual(count(withS14));
        expect(JSON.stringify(withCalibri.pages)).not.toBe(JSON.stringify(withS14.pages));
    });
});

// =========================================================================
// Page counts — PINNED AS MEASURED (2026-09-02, this delivered code)
// =========================================================================

describe('page counts (measured, not inherited from the spike)', () => {
    /**
     * Measured with the DELIVERED production-fidelity flow and the D-E
     * renderer STUBS in place (list/codeBlock/table/image contribute no
     * items yet — tasks 08/09/10 will raise these numbers). Re-measure and
     * report a divergence rather than forcing it.
     */
    const EXPECTED = {
        'md/md-structural.md': 1,
        'md/md-nested.md': 1,
        'md/md-degrade.md': 1,
        'synthetic-12': 2,
        'synthetic-200': 19
    };

    test('pinned page counts per document', () => {
        const rows = {};
        for (const g of golden) rows[g.name] = stack.layoutDocument(g.ir, makeCtx()).pages.length;
        rows['synthetic-12'] = stack.layoutDocument(syntheticDocument(), makeCtx()).pages.length;
        rows['synthetic-200'] = stack.layoutDocument(syntheticDocument({ paragraphs: 200 }), makeCtx()).pages.length;
        expect(rows).toEqual(EXPECTED);
    });
});

// =========================================================================
// laidOutText — the leg-D oracle helper
// =========================================================================

describe('laidOutText', () => {
    test('returns every item\'s text in placement order, one per line', () => {
        const doc = {
            kind: 'document',
            children: [
                { kind: 'heading', level: 1, children: [run('Title Here')] },
                { kind: 'paragraph', children: [run('One two three')] }
            ]
        };
        const { pages } = stack.layoutDocument(doc, makeCtx());
        expect(stack.laidOutText(pages)).toBe('Title Here\nOne two three');
    });

    test('the word stream survives a multi-page layout unchanged', () => {
        const doc = syntheticDocument({ paragraphs: 40, edges: false });
        const { pages } = stack.layoutDocument(doc, makeCtx());
        const laid = stack.laidOutText(pages).split(/\s+/).filter(Boolean);
        // The source stream is built PER BLOCK (adjacent runs concatenate
        // with no separator: `run('italic')` + `run(', ')` is one word
        // `italic,`, exactly as the tokenizer sees it).
        const source = [];
        const walk = (nodes) => {
            for (const n of nodes) {
                if (n.kind === 'run' || !n.children) continue;
                const text = n.children.filter((c) => c.kind === 'run').map((c) => c.text).join('');
                if (text.trim() !== '') source.push(...text.split(/\s+/).filter(Boolean));
                walk(n.children);
            }
        };
        walk(doc.children);
        expect(laid).toEqual(source);
    });
});

// =========================================================================
// Inline images (BL-980): a text block's `image` children are DELEGATED
// =========================================================================

describe('oconvPdfStack — inline images are lifted out of text blocks', () => {
    /** An IR `image` inline/block node. */
    const img = (name) => ({ kind: 'image', name, alt: '' });

    test('paragraph [run, image, run] → ONE text block with BOTH runs + one delegated image at `<p>.i0`', () => {
        const doc = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('before '), img('a.png'), run(' after')] }
        ] };
        const ctx = makeCtx();
        const blocks = stack.flowBlocks(doc, ctx);

        expect(blocks.map((b) => [b.index, b.kind]))
            .toEqual([['0', 'paragraph'], ['0.i0', 'image']]);
        // The runs flowed together — the image did not split the line.
        // MEASURED: the linebreaker collapses the adjacent whitespace the
        // lifted-out image leaves between the two runs, so the joined text
        // is `before after` with ONE space, not two.
        expect(lb.lineText(blocks[0].lines[0])).toBe('before after');
        expect(ctx.losses).toEqual([
            { index: '0.i0', kind: 'image', code: 'layout/image-stub', detail: { index: '0.i0' } }
        ]);
    });

    test('a heading with an inline image delegates it too, after the heading block', () => {
        const doc = { kind: 'document', children: [
            { kind: 'heading', level: 2, children: [run('Title'), img('h.png')] }
        ] };
        const blocks = stack.flowBlocks(doc, makeCtx());
        expect(blocks.map((b) => [b.index, b.kind]))
            .toEqual([['0', 'heading'], ['0.i0', 'image']]);
        expect(blocks[0].keepTogether).toBe(true);
        expect(lb.lineText(blocks[0].lines[0])).toBe('Title');
    });

    test('several inline images keep source order at `.i0`, `.i1`, …', () => {
        const doc = { kind: 'document', children: [
            { kind: 'paragraph', children: [img('a.png'), run('x'), img('b.png'), img('c.png')] }
        ] };
        const blocks = stack.flowBlocks(doc, makeCtx());
        expect(blocks.map((b) => b.index)).toEqual(['0', '0.i0', '0.i1', '0.i2']);
    });

    // MEASURED, not special-cased: an all-image paragraph flows an EMPTY
    // text block, exactly as an empty paragraph already did — `isDrawable`
    // is false for it, so it consumes no vertical space and the accounting
    // invariant does not require it to be placed or named.
    test('an all-image paragraph flows an empty text block, like today\'s empty paragraph', () => {
        const withImage = stack.flowBlocks(
            { kind: 'document', children: [{ kind: 'paragraph', children: [img('only.png')] }] },
            makeCtx()
        );
        const empty = stack.flowBlocks(
            { kind: 'document', children: [{ kind: 'paragraph', children: [] }] },
            makeCtx()
        );
        expect(withImage[0].lines).toEqual(empty[0].lines);
        expect(withImage[0].height).toBe(empty[0].height);
        expect(withImage.map((b) => b.index)).toEqual(['0', '0.i0']);

        const laid = stack.stackPages(withImage, LAYOUT);
        expect(stack.unaccounted(withImage, laid.pages, [
            { index: '0.i0', code: 'layout/image-stub' }
        ])).toEqual([]);
    });

    test('an inline image inside a blockquote inherits the quote indent and rule', () => {
        const doc = { kind: 'document', children: [
            { kind: 'blockquote', children: [
                { kind: 'paragraph', children: [run('quoted'), img('q.png')] }
            ] }
        ] };
        const blocks = stack.flowBlocks(doc, makeCtx());
        expect(blocks.map((b) => b.index)).toEqual(['0.0', '0.0.i0']);
        expect(blocks[1].indent).toBe(blocks[0].indent);
        expect(blocks[1].rule).toEqual(blocks[0].rule);
    });

    test('an `image` at BLOCK position keeps its plain numeric index — no `.i` suffix', () => {
        const blocks = stack.flowBlocks(
            { kind: 'document', children: [{ kind: 'paragraph', children: [run('p')] }, img('b.png')] },
            makeCtx()
        );
        expect(blocks.map((b) => [b.index, b.kind]))
            .toEqual([['0', 'paragraph'], ['1', 'image']]);
    });

    test('a text block with NO image children is byte-identical to the pre-BL-980 flow', () => {
        const doc = { kind: 'document', children: [
            { kind: 'heading', level: 1, children: [run('H')] },
            { kind: 'paragraph', children: [run('p one'), run(' and two')] },
            { kind: 'hr' },
            { kind: 'list', ordered: false, children: [] }
        ] };
        const blocks = stack.flowBlocks(doc, makeCtx());
        expect(blocks.map((b) => [b.index, b.kind]))
            .toEqual([['0', 'heading'], ['1', 'paragraph'], ['2', 'hr'], ['3', 'list']]);
        expect(lb.lineText(blocks[1].lines[0])).toBe('p one and two');
    });

    test('a delegated inline image still throws `needs ctx.render` when no dispatcher is wired', () => {
        const doc = { kind: 'document', children: [
            { kind: 'paragraph', children: [run('x'), img('a.png')] }
        ] };
        expect(() => stack.flowBlocks(doc, { layout: LAYOUT, linebreak: lb, losses: [], measurer: s14 }))
            .toThrow('oconv: pdf stack needs ctx.render');
    });
});
