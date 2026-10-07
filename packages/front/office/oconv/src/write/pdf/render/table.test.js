// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Unit tests for `oconvPdfRenderTable.render` — the fixed-layout GFM table
 * renderer of the `md → pdf` bounded typesetter.
 *
 * Two oracles, deliberately:
 *
 * 1. **Geometry / losses**, asserted on the BLOCK-LOCAL items the renderer
 *    returns, through a `flowChildren` that MIRRORS the facade's own
 *    `flowChildrenAt` (`../../ir-to-pdf.js`) — the seam is defined there and
 *    a renderer's unit test may not edit it.
 * 2. **The real seam**, asserted through `oconvIrToPdf.irToPdf` and through
 *    the `oconv.fromMd`/`toMd` round trip, so the mirror above can never be
 *    the only thing that holds: if it drifted from the facade, the emitted
 *    bytes would stop carrying the cell text.
 *
 * @module oconv/write/pdf/render/table.test
 */
/* global Bun */
import { describe, test, expect } from 'bun:test';
import { pdfWriterRuntime, CORPUS_DIR } from '../_test-runtime.js';
import { oconvPdfRenderTable } from './table.js';

const runtime = pdfWriterRuntime();
const renderTable = runtime.resolve('oconvPdfRenderTable');
const stack = runtime.resolve('oconvPdfStack');
const box = runtime.resolve('oconvPdfBox');
const metrics = runtime.resolve('oconvPdfMetrics');
const linebreak = runtime.resolve('oconvPdfLinebreak');
const irToPdf = runtime.resolve('oconvIrToPdf');
const oconv = runtime.resolve('oconv');
const mdToIr = runtime.resolve('oconvMdToIr');

const measurer = metrics.createMeasurer();

/** The renderers the facade dispatches to (D-E) — same map, same shape. */
const RENDERERS = {
    table: renderTable,
    list: runtime.resolve('oconvPdfRenderList'),
    codeBlock: runtime.resolve('oconvPdfRenderCode'),
    image: runtime.resolve('oconvPdfRenderImage')
};

/**
 * MIRROR of `../../ir-to-pdf.js`'s `flowChildrenAt`. Kept verbatim in shape;
 * the facade tests below are what keep it honest.
 */
function flowChildrenAt(parentCtx, blocks, opts) {
    const o = opts || {};
    const delta = Number.isFinite(o.indentDelta) ? o.indentDelta : stack.INDENT_STEP;
    const baseIndent = Number.isFinite(parentCtx.indent) ? parentCtx.indent : 0;
    const parentLb = parentCtx.linebreak;
    const childCtx = {
        ...parentCtx,
        indent: baseIndent + delta,
        indexPrefix: parentCtx.index,
        ruleX: o.ruleX === undefined
            ? (parentCtx.ruleX === undefined ? null : parentCtx.ruleX)
            : o.ruleX,
        linebreak: o.styleOverride
            ? {
                ...parentLb,
                breakInlines: (inlines, m, sizePt, columnPt) =>
                    parentLb.breakInlines(inlines, m, sizePt, columnPt, o.styleOverride)
            }
            : parentLb
    };
    const flowed = stack.flowBlocks({ kind: 'document', children: blocks || [] }, childCtx);
    let height = 0;
    for (const b of flowed) height += b.spaceBefore + b.height + b.spaceAfter;
    return { blocks: flowed, height };
}

/** A document context, as the facade builds it. */
function docCtx(pdfOpts) {
    const layout = box.resolveLayout(pdfOpts);
    const losses = [];
    const ctx = {
        measurer, layout, column: layout.column,
        sizeFor: layout.sizeFor, leading: layout.leading,
        linebreak, losses, index: null, indent: 0
    };
    ctx.render = (node, childCtx) => {
        const renderer = RENDERERS[node.kind];
        return renderer.render(node, {
            ...childCtx,
            flowChildren: (blocks, opts) => flowChildrenAt(childCtx, blocks, opts)
        });
    };
    return ctx;
}

/** Render ONE table node the way the stack would. */
function renderNode(node, over = {}) {
    const ctx = over.ctx || docCtx(over.pdf);
    const childCtx = { ...ctx, index: over.index || '0', indent: over.indent || 0, kind: 'table' };
    return renderTable.render(node, {
        ...childCtx,
        flowChildren: (blocks, opts) => flowChildrenAt(childCtx, blocks, opts)
    });
}

const run = (text, over = {}) => ({
    kind: 'run', text, bold: false, italic: false, strike: false, code: false, link: null, ...over
});
const cell = (text) => ({ kind: 'cell', children: [{ kind: 'paragraph', children: [run(text)] }] });
const row = (texts, header = false) => ({ kind: 'row', header, children: texts.map(cell) });
const table = (rows) => ({ kind: 'table', children: rows });

const rules = (items) => items.filter((it) => it.rule);
const texts = (items) => items.filter((it) => !it.rule);
const textOf = (item) => (item.tokens || []).map((t) => t.text).join('');
const widthOf = (item) => (item.tokens || []).reduce((a, t) => a + t.width, 0);

const THREE_BY_THREE = table([
    row(['Col A', 'Col B', 'Col C'], true),
    row(['a1', 'b1', 'c1']),
    row(['a2', 'b2', 'c2'])
]);

describe('oconvPdfRenderTable — descriptor', () => {
    test('name and declared dependencies are the frozen D-E shape', () => {
        expect(oconvPdfRenderTable.name).toBe('oconvPdfRenderTable');
        expect(oconvPdfRenderTable.dependencies).toEqual(['oconvPdfLinebreak']);
        expect(Object.keys(renderTable)).toEqual(['render']);
        expect(typeof renderTable.render).toBe('function');
    });
});

describe('oconvPdfRenderTable — a 3×3 table with a header row', () => {
    const out = renderNode(THREE_BY_THREE);
    const layout = box.resolveLayout();

    test('nothing is lost and the block reports a BODY height', () => {
        expect(out.losses).toEqual([]);
        expect(out.keepTogether).toBe(true);
        // The body height is the rules + the three row boxes; the stack adds
        // `spaceAfter` itself, so it must NOT be included here.
        const ruleTotal = rules(out.items).reduce((a, it) => a + it.rule.h, 0);
        expect(ruleTotal).toBeCloseTo(0.5 + 0.75 + 0.5 + 0.5, 6);
        const rowBox = layout.leading(11) + 2 * 3;
        expect(out.height).toBeCloseTo(ruleTotal + 3 * rowBox, 6);
    });

    test('rules: one box top plus one under every row, the header one thicker', () => {
        const drawn = rules(out.items);
        expect(drawn).toHaveLength(3 + 1);
        expect(drawn.map((it) => it.rule.h)).toEqual([0.5, 0.75, 0.5, 0.5]);
        // Every rule spans the whole table, and rules are their OWN items:
        // `stack.js` overwrites `abs.y` on a rule-bearing item, so an item
        // carrying a rule AND text would misplace the text.
        for (const it of drawn) {
            expect(it.rule.x).toBeCloseTo(layout.margin, 6);
            expect(it.tokens).toEqual([]);
            expect(it.rule.y).toBe(it.y);
            expect(it.rule.w).toBeCloseTo(drawn[0].rule.w, 6);
        }
        // Strictly increasing tops, non-overlapping.
        const tops = drawn.map((it) => it.rule.y);
        for (let i = 1; i < tops.length; i += 1) expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    });

    test('the header row is bold, the body rows are not', () => {
        const cells = texts(out.items);
        expect(cells.map(textOf)).toEqual([
            'Col A', 'Col B', 'Col C', 'a1', 'b1', 'c1', 'a2', 'b2', 'c2'
        ]);
        expect(cells.slice(0, 3).every((it) => it.style === 'bold')).toBe(true);
        expect(cells.slice(0, 3).every((it) => it.tokens.every((t) => t.style === 'bold'))).toBe(true);
        expect(cells.slice(3).every((it) => it.style === 'regular')).toBe(true);
    });

    test('column widths come from the content and every cell text stays inside its box', () => {
        const cells = texts(out.items);
        // Widths are content-derived: the header cell ('Col A', bold) is the
        // widest content of column 0, so the column is exactly it + padding.
        const colX = [...new Set(cells.map((it) => Math.round(it.x * 1000) / 1000))].sort((a, b) => a - b);
        expect(colX).toHaveLength(3);
        const natural = ['Col A', 'Col B', 'Col C']
            .map((t) => measurer.widthOf(t, 'bold', 11) + 6);
        expect(colX[0]).toBeCloseTo(box.resolveLayout().margin + 3, 6);
        expect(colX[1]).toBeCloseTo(colX[0] + natural[0], 6);
        expect(colX[2]).toBeCloseTo(colX[1] + natural[1], 6);
        // The table is NARROWER than the column: the slack is not spread.
        const tableWidth = rules(out.items)[0].rule.w;
        expect(tableWidth).toBeCloseTo(natural[0] + natural[1] + natural[2], 6);
        expect(tableWidth).toBeLessThan(box.resolveLayout().column);

        // Every text item lies inside its own cell box (3 pt padding).
        for (const it of cells) {
            const j = colX.findIndex((x) => Math.abs(x - it.x) < 1e-3);
            expect(j).toBeGreaterThanOrEqual(0);
            expect(it.x + widthOf(it)).toBeLessThanOrEqual(colX[j] + natural[j] - 3 + 1e-6);
        }
    });

    test('every emitted token carries a FINITE width', () => {
        // A width-less token contributes 0 to the emitter's segment placement
        // (`render/text.js` `segmentsOf`), so two style segments would
        // overprint at the same x with nothing recorded.
        for (const it of texts(out.items)) {
            for (const t of it.tokens) expect(Number.isFinite(t.width)).toBe(true);
        }
    });

    test('through the stack: the block height excludes spaceAfter and nothing is unaccounted', () => {
        const ctx = docCtx();
        const laid = stack.layoutDocument({ kind: 'document', children: [THREE_BY_THREE] }, ctx);
        const block = laid.blocks[0];
        expect(block.kind).toBe('table');
        expect(block.height).toBeCloseTo(out.height, 6);
        expect(block.spaceAfter).toBeCloseTo(0.6 * 11, 6);
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
        expect(laid.pages).toHaveLength(1);
    });
});

describe('oconvPdfRenderTable — scale then clip', () => {
    // 12 columns whose NATURAL widths overflow the text column while their
    // unbreakable tokens still fit — the middle branch of the width table.
    const wide = table([
        row(Array.from({ length: 12 }, (_, i) => `Col ${i + 1} head`), true),
        row(Array.from({ length: 12 }, (_, i) => `val ${i + 1}`))
    ]);

    test('12 columns wider than the text column scale once, and nothing is clipped', () => {
        const out = renderNode(wide);
        const layout = box.resolveLayout();
        expect(out.losses.map((l) => l.code)).toEqual(['layout/table-scaled']);
        const loss = out.losses[0];
        expect(loss.detail.index).toBe('0');
        expect(loss.detail.from).toBeGreaterThan(layout.column);
        expect(loss.detail.to).toBeLessThanOrEqual(layout.column + 1e-6);
        expect(loss.detail.column).toBeCloseTo(layout.column, 6);

        const width = rules(out.items)[0].rule.w;
        expect(width).toBeLessThanOrEqual(layout.column + 1e-6);
        expect(width).toBeCloseTo(loss.detail.to, 6);

        // No token was truncated: every source word survives whole (the
        // scaled columns may WRAP a cell, never cut a word).
        const emitted = texts(out.items).map(textOf).join(' ');
        for (let i = 1; i <= 12; i += 1) {
            for (const word of ['Col', String(i), 'head', 'val']) {
                expect(emitted).toContain(word);
            }
        }
        expect(emitted).not.toContain('hea ');
    });

    test('a 120-character token is clipped at the cell edge and the loss names the cell', () => {
        const long = 'x'.repeat(120);
        const out = renderNode(table([row([long])]));
        expect(out.losses.map((l) => l.code)).toEqual(['layout/table-clipped']);
        const detail = out.losses[0].detail;
        expect(detail.index).toBe('0');
        expect(detail.clippedCells).toBe(1);
        expect(detail.cells).toEqual([{ row: 0, column: 0 }]);
        expect(detail.columns).toHaveLength(1);

        const layout = box.resolveLayout();
        const emitted = texts(out.items);
        expect(emitted).toHaveLength(1);
        const kept = textOf(emitted[0]);
        expect(kept.length).toBeGreaterThan(0);
        expect(kept.length).toBeLessThan(long.length);          // truncated, not reflowed
        expect(kept).toBe('x'.repeat(kept.length));
        // …and truncated exactly at the cell's right edge (3 pt padding).
        const right = layout.margin + detail.columns[0] - 3;
        expect(emitted[0].x + widthOf(emitted[0])).toBeLessThanOrEqual(right + 1e-6);
        const oneMore = measurer.widthOf('x'.repeat(kept.length + 1), 'regular', 11);
        expect(emitted[0].x + oneMore).toBeGreaterThan(right);
    });

    test('a table indented inside a blockquote is bounded by the REMAINING column', () => {
        const layout = box.resolveLayout();
        const out = renderNode(wide, { indent: stack.INDENT_STEP });
        const width = rules(out.items)[0].rule.w;
        expect(rules(out.items)[0].rule.x).toBeCloseTo(layout.margin + stack.INDENT_STEP, 6);
        expect(width).toBeLessThanOrEqual(layout.column - stack.INDENT_STEP + 1e-6);
    });
});

describe('oconvPdfRenderTable — row heights and F9 refusals', () => {
    test('a multi-line cell grows its row', () => {
        // A cell only wraps once its column is scaled below the cell's
        // natural width — two prose columns overflow the text column, so the
        // scaled widths force the wrap this case is about.
        const prose = 'The quick brown fox jumps over the lazy dog and then keeps on running.';
        const short = renderNode(table([row(['k', 'v'])]));
        const tall = renderNode(table([row([prose, prose])]));
        expect(tall.losses.map((l) => l.code)).toEqual(['layout/table-scaled']);
        expect(tall.height).toBeGreaterThan(short.height);

        const leading = box.resolveLayout().leading(11);
        const byColumn = new Map();
        for (const it of texts(tall.items)) {
            const key = Math.round(it.x * 100);
            byColumn.set(key, [...(byColumn.get(key) || []), it]);
        }
        expect(byColumn.size).toBe(2);
        let maxLines = 0;
        for (const lines of byColumn.values()) {
            expect(lines.length).toBeGreaterThan(1);
            maxLines = Math.max(maxLines, lines.length);
            // Successive lines of the same cell are one leading apart.
            for (let i = 1; i < lines.length; i += 1) {
                expect(lines[i].y - lines[i - 1].y).toBeCloseTo(leading, 6);
            }
        }
        // The row box is the tallest cell plus the padding, rules on top.
        const ruleTotal = rules(tall.items).reduce((a, it) => a + it.rule.h, 0);
        expect(tall.height).toBeCloseTo(ruleTotal + maxLines * leading + 6, 6);
    });

    test('a table taller than a page is NOT split: one page, then clipped with a recorded loss', () => {
        const many = table([
            row(['Key', 'Value'], true),
            ...Array.from({ length: 90 }, (_, i) => row([`k${i}`, `v${i}`]))
        ]);
        const ctx = docCtx();
        const laid = stack.layoutDocument({
            kind: 'document',
            children: [{ kind: 'paragraph', children: [run('before')] }, many]
        }, ctx);

        const clipped = laid.losses.filter((l) => l.code === 'layout/block-clipped');
        expect(clipped).toHaveLength(1);
        expect(clipped[0].kind).toBe('table');
        expect(clipped[0].index).toBe('1');
        expect(clipped[0].clippedLines).toBeGreaterThan(0);

        // The whole table sits on ONE page — no row was split off.
        const pagesWithTable = laid.pages
            .filter((p) => p.items.some((it) => it.kind === 'table'))
            .map((p) => p.number);
        expect(pagesWithTable).toHaveLength(1);
        // …and that page is a NEW one (the paragraph kept page 1).
        expect(pagesWithTable[0]).toBe(2);
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
    });

    test('a table with no row records `layout/table-empty` rather than dropping silently', () => {
        const out = renderNode({ kind: 'table', children: [] });
        expect(out.items).toEqual([]);
        expect(out.losses.map((l) => l.code)).toEqual(['layout/table-empty']);
        expect(out.losses[0].detail.index).toBe('0');
        expect(out.height).toBe(0);

        // Non-vacuity: the stack's accounting invariant is what makes this
        // loss mandatory — a delegated kind returning zero items AND zero
        // losses is exactly the silent drop it exists to catch.
        const ctx = docCtx();
        const laid = stack.layoutDocument(
            { kind: 'document', children: [{ kind: 'table', children: [] }] }, ctx);
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
    });

    test('the task-07 stub code can no longer be produced', () => {
        const ctx = docCtx();
        const laid = stack.layoutDocument({
            kind: 'document',
            children: [THREE_BY_THREE, { kind: 'table', children: [] }]
        }, ctx);
        expect(laid.losses.map((l) => l.code)).not.toContain('layout/table-unrendered');
    });
});

describe('oconvPdfRenderTable — through the real facade seam', () => {
    /** Latin-1 view of the emitted bytes — a WinAnsi literal is not UTF-8. */
    function latin1(bytes) {
        let out = '';
        for (const b of bytes) out += String.fromCharCode(b);
        return out;
    }

    test('irToPdf draws the cell text and the rules — the mirror above matches the facade', () => {
        const written = irToPdf.irToPdf({ kind: 'document', children: [THREE_BY_THREE] });
        expect(written.pages).toBe(1);
        expect(written.losses.map((l) => l.code)).not.toContain('layout/table-unrendered');
        expect(written.losses.filter((l) => String(l.code).startsWith('layout/table-'))).toEqual([]);
        const stream = latin1(written.bytes);
        for (const text of ['Col A', 'Col B', 'Col C', 'a1', 'b1', 'c1', 'a2', 'b2', 'c2']) {
            expect(stream).toContain(`(${text}) Tj`);
        }
        expect(stream).toContain(' re f');
        // The header is drawn with the BOLD resource, the body with regular.
        expect(stream).toMatch(/\/FB [\d.]+ Tf[^]*?\(Col A\) Tj/);
        expect(stream).toMatch(/\/FR [\d.]+ Tf[^]*?\(a1\) Tj/);
    });

    test('a table taller than a page reports `layout/block-clipped{kind:table}` through the facade', () => {
        const many = { kind: 'document', children: [table([
            row(['Key', 'Value'], true),
            ...Array.from({ length: 90 }, (_, i) => row([`k${i}`, `v${i}`]))
        ])] };
        const written = irToPdf.irToPdf(many);
        const clipped = written.losses.filter((l) => l.code === 'layout/block-clipped');
        expect(clipped).toHaveLength(1);
        expect(clipped[0].kind).toBe('table');
        expect(written.pages).toBe(1);
    });

    test('the golden `md-structural.md` survives fromMd(pdf) → toMd with its cell stream in order', async () => {
        const markdown = await Bun.file(`${CORPUS_DIR}/md/md-structural.md`).text();
        const parsed = mdToIr.mdToIr(markdown);
        const tables = parsed.ir.children.filter((b) => b.kind === 'table');
        expect(tables).toHaveLength(1);

        const written = await oconv.fromMd({ markdown, target: 'pdf' });
        expect(written.losses.map((l) => l.code)).not.toContain('layout/table-unrendered');
        expect(written.losses.filter((l) => String(l.code).startsWith('layout/table-'))).toEqual([]);

        const back = await oconv.toMd({
            name: 'structural.pdf', bytes: written.bytes, convertedAt: '2026-09-02T00:00:00.000Z'
        });
        const flat = back.markdown.replace(/\s+/g, ' ');
        // MEASURED: the pdf reader yields a table's cells as plain text in
        // placement order (no pipe syntax — the writer emits no structure
        // tags for tables), so the oracle is the cell stream, in order.
        const cells = ['Col A', 'Col B', 'Col C', 'a1', 'b1', 'c1'];
        let cursor = -1;
        for (const c of cells) {
            const at = flat.indexOf(c, cursor + 1);
            expect(at).toBeGreaterThan(cursor);
            cursor = at;
        }
    });
});
