// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Unit + golden tests for `oconvPdfRenderCode` — the `codeBlock` renderer of
 * the `md → pdf` bounded typesetter: one flow line per SOURCE line,
 * monospace, no wrapping, no syntax colouring.
 */
import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'bun:test';
import { pdfWriterRuntime } from '../_test-runtime.js';
import { oconvPdfRenderCode } from './code.js';

const runtime = pdfWriterRuntime();
const renderCode = runtime.resolve('oconvPdfRenderCode');
const metrics = runtime.resolve('oconvPdfMetrics');
const box = runtime.resolve('oconvPdfBox');
const linebreak = runtime.resolve('oconvPdfLinebreak');
const stack = runtime.resolve('oconvPdfStack');

const measurer = metrics.createMeasurer();
const LAYOUT = box.resolveLayout();

/**
 * Build a renderer child context for one `render(node, ctx)` call. A code
 * block never calls `ctx.flowChildren` (module header, verbatim), so this
 * fixture — unlike the `list`/`image`/`table` ones — needs no binding for
 * it.
 *
 * @param {object} [over]
 * @returns {object}
 */
function makeCtx(over = {}) {
    return {
        measurer, layout: LAYOUT, column: LAYOUT.column,
        sizeFor: LAYOUT.sizeFor, leading: LAYOUT.leading,
        linebreak, losses: [], index: '0', indent: 0, kind: 'codeBlock',
        ...over
    };
}

/**
 * `oconv-ir/v1` `codeBlock` node.
 *
 * @param {string} text
 * @param {string} [info]
 * @returns {object}
 */
function codeNode(text, info = '') {
    return { kind: 'codeBlock', info, text };
}

describe('oconvPdfRenderCode — descriptor', () => {
    test('name and declared dependencies are the frozen D-E shape', () => {
        expect(oconvPdfRenderCode.name).toBe('oconvPdfRenderCode');
        expect(oconvPdfRenderCode.dependencies).toEqual(['oconvPdfLinebreak']);
    });

    test('the resolved instance exposes exactly `render`', () => {
        expect(Object.keys(renderCode).sort()).toEqual(['render']);
        expect(typeof renderCode.render).toBe('function');
    });

    test('the factory is capture-free (fw/no-factory-capture): it runs in a bare scope', () => {
        const rebuilt = new Function(
            'return (function ' + oconvPdfRenderCode.factory.toString() + ')'
        )();
        const inst = rebuilt(runtime.resolve('oconvPdfLinebreak'));
        expect(typeof inst.render).toBe('function');
    });

    test('the STUB loss code `layout/code-unrendered` can no longer be produced', () => {
        const src = readFileSync(new URL('./code.js', import.meta.url), 'utf8');
        expect(src).not.toContain('layout/code-unrendered');
        expect(src).not.toContain('STUB');

        const { losses } = renderCode.render(codeNode('a\nb\n'), makeCtx());
        expect(losses.map((l) => l.code)).not.toContain('layout/code-unrendered');
    });
});

describe('render — one item per source line', () => {
    test('a 3-line fence yields exactly 3 items at code face/size', () => {
        const { items, losses } = renderCode.render(codeNode('one\ntwo\nthree\n'), makeCtx());
        expect(items).toHaveLength(3);
        expect(losses).toEqual([]);
        for (const item of items) {
            expect(item.style).toBe('code');
            expect(item.sizePt).toBe(LAYOUT.codeSize);
        }
        expect(items.map((it) => it.tokens[0].text)).toEqual(['one', 'two', 'three']);
    });

    test('a fence with NO trailing newline still yields one item per line', () => {
        const { items } = renderCode.render(codeNode('alpha\nbeta'), makeCtx());
        expect(items.map((it) => it.tokens[0].text)).toEqual(['alpha', 'beta']);
    });

    test('lines are placed top to bottom, one leading step apart, at the fixed 6 pt top pad', () => {
        const { items } = renderCode.render(codeNode('one\ntwo\nthree\n'), makeCtx());
        const leading = 1.2 * LAYOUT.codeSize;
        for (let n = 0; n < items.length; n += 1) {
            expect(items[n].y).toBeCloseTo(6 + (n + 1) * leading, 6);
        }
    });

    test('`x` is absolute: margin + the child indent, honouring a non-zero base indent', () => {
        const { items } = renderCode.render(codeNode('a\n'), makeCtx({ indent: 18 }));
        expect(items[0].x).toBeCloseTo(LAYOUT.margin + 18, 6);
    });

    test('`index`/`kind` are the block\'s own on every item', () => {
        const { items } = renderCode.render(codeNode('a\nb\n'), makeCtx({ index: '4' }));
        for (const item of items) {
            expect(item.index).toBe('4');
            expect(item.kind).toBe('codeBlock');
        }
    });

    test('`info` is read nowhere — a language tag changes nothing about the output', () => {
        const plain = renderCode.render(codeNode('x = 1\n', ''), makeCtx());
        const tagged = renderCode.render(codeNode('x = 1\n', 'python'), makeCtx());
        expect(tagged.items).toEqual(plain.items);
        expect(tagged.losses).toEqual(plain.losses);
    });

    test('every token carries a finite `width` — no silent zero-width overprint', () => {
        const { items } = renderCode.render(codeNode('one\ntwo\n'), makeCtx());
        for (const item of items) {
            for (const t of item.tokens) expect(Number.isFinite(t.width)).toBe(true);
        }
    });

    test('`height` is BODY height only: 6 pt top pad + N leading steps + 6 pt bottom pad', () => {
        const { height } = renderCode.render(codeNode('one\ntwo\nthree\n'), makeCtx());
        const leading = 1.2 * LAYOUT.codeSize;
        expect(height).toBeCloseTo(6 + 3 * leading + 6, 6);
    });
});

describe('render — tabs and overflow', () => {
    test('a tab expands to 4 spaces before measuring/emitting', () => {
        const { items } = renderCode.render(codeNode('a\tb\n'), makeCtx());
        expect(items[0].tokens[0].text).toBe('a    b');
    });

    test('a line wider than the column is emitted overflowing and records `layout/line-overflow`', () => {
        const wide = 'x'.repeat(400);
        const { items, losses } = renderCode.render(codeNode(`${wide}\n`), makeCtx());
        expect(items).toHaveLength(1);
        expect(items[0].tokens[0].text).toBe(wide);
        expect(losses).toHaveLength(1);
        expect(losses[0].code).toBe('layout/line-overflow');
        expect(losses[0].detail.tokens).toBe(1);
        expect(losses[0].detail.column).toBeCloseTo(LAYOUT.column, 6);
        expect(losses[0].detail.width).toBeGreaterThan(losses[0].detail.column);
        expect(losses[0].detail.text).toBe(wide.slice(0, 40));
    });

    test('overflow is recorded PER LINE — two overlong lines record two losses', () => {
        const wide = 'y'.repeat(400);
        const { losses } = renderCode.render(codeNode(`${wide}\n${wide}\n`), makeCtx());
        expect(losses).toHaveLength(2);
        expect(losses.every((l) => l.code === 'layout/line-overflow')).toBe(true);
    });

    test('a normal-width line records no loss', () => {
        const { losses } = renderCode.render(codeNode('short\n'), makeCtx());
        expect(losses).toEqual([]);
    });
});

describe('render — the empty fence (plan: "nothing + no loss")', () => {
    test('empty text → zero items, zero losses, no `height`', () => {
        const result = renderCode.render(codeNode(''), makeCtx());
        expect(result.items).toEqual([]);
        expect(result.losses).toEqual([]);
        expect(result.height).toBeUndefined();
    });

    test('text that is only the trimmed trailing newline → the same empty result', () => {
        const result = renderCode.render(codeNode('\n'), makeCtx());
        expect(result.items).toEqual([]);
        expect(result.losses).toEqual([]);
    });

    test('a missing `text` field degrades to empty, never throws', () => {
        const result = renderCode.render({ kind: 'codeBlock' }, makeCtx());
        expect(result.items).toEqual([]);
        expect(result.losses).toEqual([]);
    });
});

describe('render — the stack accounting invariant (D-E: a delegated kind is always drawable)', () => {
    test('flowing a non-empty `codeBlock` through `oconvPdfStack.flowBlocks` never leaves it unaccounted', () => {
        const losses = [];
        const ctx = {
            measurer, layout: LAYOUT, column: LAYOUT.column,
            sizeFor: LAYOUT.sizeFor, leading: LAYOUT.leading, linebreak, losses,
            index: null,
            render: (node, childCtx) => renderCode.render(node, childCtx)
        };
        const ir = { kind: 'document', children: [codeNode('one\ntwo\n')] };
        const laid = stack.layoutDocument(ir, ctx);
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
        expect(laid.pages[0].items.length).toBeGreaterThan(0);
    });
});

describe('the delivered facade — `codeBlock` reaches the renderer end to end', () => {
    test('`oconvIrToPdf.irToPdf` on a code block: content bytes present, no `layout/code-unrendered`', () => {
        const irToPdf = runtime.resolve('oconvIrToPdf');
        const ir = { kind: 'document', children: [codeNode('print(1)\n', 'python')] };
        const written = irToPdf.irToPdf(ir);
        expect(written.losses.map((l) => l.code)).not.toContain('layout/code-unrendered');

        let latin1 = '';
        for (const b of written.bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toMatch(/\/FM [\d.]+ Tf [^(]*\(print\\\(1\\\)\)/);
    });
});
