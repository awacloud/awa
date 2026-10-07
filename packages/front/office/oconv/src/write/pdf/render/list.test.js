// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Unit + golden tests for `oconvPdfRenderList` — the `list` renderer of the
 * `md → pdf` bounded typesetter: nested bullet/ordered lists, markers by
 * depth, hanging indent, item children re-flowed through
 * `ctx.flowChildren`.
 */
import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'bun:test';
import { pdfWriterRuntime, corpusBytes } from '../_test-runtime.js';
import { oconvPdfRenderList } from './list.js';

const runtime = pdfWriterRuntime();
const renderList = runtime.resolve('oconvPdfRenderList');
const metrics = runtime.resolve('oconvPdfMetrics');
const box = runtime.resolve('oconvPdfBox');
const linebreak = runtime.resolve('oconvPdfLinebreak');
const stack = runtime.resolve('oconvPdfStack');

const measurer = metrics.createMeasurer();
const LAYOUT = box.resolveLayout();

/** An `oconv-ir/v1` inline run with the frozen full property set. */
function run(text, flags = {}) {
    return {
        kind: 'run', text, bold: false, italic: false, strike: false,
        code: false, link: null, ...flags
    };
}

/**
 * @param {string} text
 * @returns {object} A one-run paragraph.
 */
function para(text) {
    return { kind: 'paragraph', children: [run(text)] };
}

/**
 * @param {object[]} children Block children of the item.
 * @returns {object} `listItem`.
 */
function item(...children) {
    return { kind: 'listItem', children };
}

/**
 * @param {boolean} ordered
 * @param {object[]} items `listItem` nodes.
 * @returns {object} `list`.
 */
function list(ordered, ...items) {
    return { kind: 'list', ordered, children: items };
}

/**
 * A `ctx.flowChildren` binding built the same way the facade's own
 * `flowChildrenAt` builds it (`../../ir-to-pdf.js`) — reproduced here,
 * test-local (same pattern `render/image.test.js` / `render/table.test.js`
 * use), so `render` can be exercised directly without going through the
 * whole facade for every case. `../../ir-to-pdf.js` itself is out of this
 * task's writable perimeter; this helper is a TEST fixture, not a second
 * implementation the renderer depends on. Unlike the `image`/`table`
 * fixtures, this one ALSO wires `ctx.render` so a nested `list` (or
 * `codeBlock`) child dispatches back to the SAME renderer under test —
 * exactly how the real facade's `render()` dispatcher behaves for the D-E
 * delegated kinds.
 *
 * @param {object} ctx The renderer child context this helper attaches to.
 * @returns {(blocks: object[], opts?: object) => {blocks: object[], height: number}}
 */
function makeFlowChildren(ctx) {
    return (blocks, opts) => {
        const o = opts || {};
        const delta = Number.isFinite(o.indentDelta) ? o.indentDelta : stack.INDENT_STEP;
        const childCtx = {
            ...ctx,
            indent: (Number.isFinite(ctx.indent) ? ctx.indent : 0) + delta,
            indexPrefix: ctx.index,
            ruleX: o.ruleX === undefined ? (ctx.ruleX === undefined ? null : ctx.ruleX) : o.ruleX,
            linebreak: o.styleOverride
                ? {
                    ...linebreak,
                    breakInlines: (inlines, m, sizePt, columnPt) =>
                        linebreak.breakInlines(inlines, m, sizePt, columnPt, o.styleOverride)
                }
                : linebreak
        };
        const flowed = stack.flowBlocks({ kind: 'document', children: blocks || [] }, childCtx);
        let height = 0;
        for (const b of flowed) height += b.spaceBefore + b.height + b.spaceAfter;
        return { blocks: flowed, height };
    };
}

/**
 * The D-E dispatcher, scoped to `list`/`codeBlock` so a nested list or code
 * block inside an item re-enters `oconvPdfRenderList`/a plain code stub —
 * exactly what `ir-to-pdf.js` `render()` does, reproduced test-local.
 *
 * @param {object} rootCtx The BASE ctx fields every nested call inherits
 *   (`measurer`, `layout`, etc.).
 * @returns {(node: object, childCtx: object) => object}
 */
function makeRender(rootCtx) {
    return (node, childCtx) => {
        const rendererCtx = { ...rootCtx, ...childCtx, flowChildren: makeFlowChildren(childCtx) };
        rendererCtx.render = makeRender(rootCtx);
        if (node && node.kind === 'list') return renderList.render(node, rendererCtx);
        // Any other delegated kind reachable from these fixtures (none, in
        // practice) degrades to the same "unrendered" shape the task-07
        // stub used — this test file only exercises nested LISTS.
        return { items: [], losses: [{ code: 'layout/unhandled-block', detail: { index: childCtx.index } }] };
    };
}

/**
 * Build a renderer child context for one `render(node, ctx)` call.
 *
 * @param {object} [over]
 * @returns {object}
 */
function makeCtx(over = {}) {
    const base = {
        measurer, layout: LAYOUT, column: LAYOUT.column,
        sizeFor: LAYOUT.sizeFor, leading: LAYOUT.leading,
        linebreak, losses: [], index: '0', indent: 0, kind: 'list',
        ...over
    };
    base.flowChildren = makeFlowChildren(base);
    base.render = makeRender(base);
    return base;
}

describe('oconvPdfRenderList — descriptor', () => {
    test('name and declared dependencies are the frozen D-E shape', () => {
        expect(oconvPdfRenderList.name).toBe('oconvPdfRenderList');
        expect(oconvPdfRenderList.dependencies).toEqual(['oconvPdfLinebreak']);
    });

    test('the resolved instance exposes exactly `render`', () => {
        expect(Object.keys(renderList).sort()).toEqual(['render']);
        expect(typeof renderList.render).toBe('function');
    });

    test('the factory is capture-free (fw/no-factory-capture): it runs in a bare scope', () => {
        const rebuilt = new Function(
            'return (function ' + oconvPdfRenderList.factory.toString() + ')'
        )();
        const inst = rebuilt(runtime.resolve('oconvPdfLinebreak'));
        expect(typeof inst.render).toBe('function');
    });

    test('the STUB loss code `layout/list-unrendered` can no longer be produced', () => {
        const src = readFileSync(new URL('./list.js', import.meta.url), 'utf8');
        expect(src).not.toContain('layout/list-unrendered');
        expect(src).not.toContain('STUB');

        const { losses } = renderList.render(list(false, item(para('a'))), makeCtx());
        expect(losses.map((l) => l.code)).not.toContain('layout/list-unrendered');
    });
});

describe('render — bullet markers by depth', () => {
    test('a flat bullet list marks every item with `•`, right-aligned at indent + 14', () => {
        const { items } = renderList.render(list(false, item(para('A')), item(para('B'))), makeCtx());
        const markers = items.filter((it) => it.text !== undefined);
        expect(markers).toHaveLength(2);
        for (const m of markers) {
            expect(m.text).toBe('•');
            const w = measurer.widthOf('•', 'regular', LAYOUT.baseSize);
            expect(m.x).toBeCloseTo(LAYOUT.margin + 14 - w, 6);
        }
    });

    test('a 3-level nested bullet list uses `•`, `–`, `·` by depth', () => {
        const ir = list(false,
            item(
                para('L1'),
                list(false,
                    item(
                        para('L2'),
                        list(false, item(para('L3')))
                    )
                )
            )
        );
        const { items } = renderList.render(ir, makeCtx());
        const markers = items.filter((it) => it.text !== undefined).map((it) => it.text);
        expect(markers).toEqual(['•', '–', '·']);
    });

    test('depth 4 repeats the depth-3 bullet `·`', () => {
        const ir = list(false, item(
            list(false, item(
                list(false, item(
                    list(false, item(para('deep')))
                ))
            ))
        ));
        const { items } = renderList.render(ir, makeCtx());
        const markers = items.filter((it) => it.text !== undefined).map((it) => it.text);
        expect(markers[markers.length - 1]).toBe('·');
    });
});

describe('render — ordered markers by depth, resetting per list', () => {
    test('depth 1: `1.`, `2.`, `3.`', () => {
        const ir = list(true, item(para('a')), item(para('b')), item(para('c')));
        const { items } = renderList.render(ir, makeCtx());
        const markers = items.filter((it) => it.text !== undefined).map((it) => it.text);
        expect(markers).toEqual(['1.', '2.', '3.']);
    });

    test('depth 2: lower-alpha `a.`, `b.`', () => {
        const ir = list(true, item(
            para('outer'),
            list(true, item(para('x')), item(para('y')))
        ));
        const { items } = renderList.render(ir, makeCtx());
        const markers = items.filter((it) => it.text !== undefined).map((it) => it.text);
        expect(markers).toEqual(['1.', 'a.', 'b.']);
    });

    test('depth 3+: lower-roman `i.`, `ii.`, `iii.` (the depth-1 and depth-2 wrapper items each contribute their OWN marker too: `1.`, `a.`)', () => {
        const ir = list(true, item(
            list(true, item(
                list(true, item(para('x')), item(para('y')), item(para('z')))
            ))
        ));
        const { items } = renderList.render(ir, makeCtx());
        const markers = items.filter((it) => it.text !== undefined).map((it) => it.text);
        expect(markers).toEqual(['1.', 'a.', 'i.', 'ii.', 'iii.']);
    });

    test('each list resets its own counter — two SIBLING ordered lists inside one item both start fresh (the depth-2 lists use lower-alpha)', () => {
        const ir = list(true, item(
            list(true, item(para('x')), item(para('y'))),
            list(true, item(para('p')))
        ));
        const { items } = renderList.render(ir, makeCtx());
        const markers = items.filter((it) => it.text !== undefined).map((it) => it.text);
        expect(markers).toEqual(['1.', 'a.', 'b.', 'a.']);
    });
});

describe('render — hanging indent and item body placement', () => {
    test('item body text is flowed at indent + 18 (the SAME step a nested list also advances by)', () => {
        const { items } = renderList.render(list(false, item(para('Body text'))), makeCtx());
        const textItem = items.find((it) => it.tokens !== undefined);
        expect(textItem.x).toBeCloseTo(LAYOUT.margin + 18, 6);
    });

    test('the marker baselines with the item\'s first line', () => {
        const { items } = renderList.render(list(false, item(para('Body text'))), makeCtx());
        const marker = items.find((it) => it.text !== undefined);
        const textItem = items.find((it) => it.tokens !== undefined);
        expect(marker.y).toBeCloseTo(textItem.y, 6);
    });

    test('a non-zero base indent shifts both marker and body absolutely', () => {
        const { items } = renderList.render(list(false, item(para('x'))), makeCtx({ indent: 36 }));
        const marker = items.find((it) => it.text !== undefined);
        const textItem = items.find((it) => it.tokens !== undefined);
        const w = measurer.widthOf('•', 'regular', LAYOUT.baseSize);
        expect(marker.x).toBeCloseTo(LAYOUT.margin + 36 + 14 - w, 6);
        expect(textItem.x).toBeCloseTo(LAYOUT.margin + 36 + 18, 6);
    });

    test('an item containing a paragraph + a nested list + a nested code block all render', () => {
        const ir = list(false, item(
            para('Intro paragraph.'),
            list(true, item(para('Nested one')), item(para('Nested two'))),
            { kind: 'codeBlock', info: '', text: 'x = 1\n' }
        ));
        const ctx = makeCtx();
        const { items } = renderList.render(ir, ctx);
        // The paragraph text and the nested ordered markers land in THIS
        // call's own returned `items`; a delegated grandchild's loss (the
        // code block — this fixture's `makeRender` only wires `list`,
        // matching the "3-level bullet + ordered markers" scope this file
        // targets) is recorded on `ctx.losses`, the SHARED sink `flowBlocks`
        // appends to — NOT on this call's own returned `losses`, which only
        // ever carries losses THIS render() call produces directly (D-E:
        // `render/table.js`/`render/image.js` follow the same split).
        // `codeBlock` inside a list item is exercised end to end below,
        // through the delivered facade, where the real code renderer is
        // wired.
        expect(items.some((it) => it.tokens && it.tokens.map((t) => t.text).join('') === 'Intro paragraph.')).toBe(true);
        // Depth 2 (nested inside a bullet item) is lower-alpha, not decimal.
        expect(items.filter((it) => it.text === 'a.' || it.text === 'b.')).toHaveLength(2);
        expect(ctx.losses.map((l) => l.code)).toContain('layout/unhandled-block');
    });
});

describe('render — spacing', () => {
    test('0.25·size separates two items; nothing is added after the LAST item (the stack adds 0.6·size)', () => {
        const ctx = makeCtx();
        const { items, height } = renderList.render(list(false, item(para('A')), item(para('B'))), ctx);
        const markerA = items.filter((it) => it.text === '•')[0];
        const markerB = items.filter((it) => it.text === '•')[1];
        const leading = LAYOUT.leading(LAYOUT.baseSize);
        // Item B's marker baselines one leading step (item A's single line)
        // plus the 0.25·size gap below item A's marker.
        expect(markerB.y - markerA.y).toBeCloseTo(leading + 0.25 * LAYOUT.baseSize, 6);
        // `height` is BODY height only: it does not fold in a trailing
        // 0.6·size — that gap is `stack.js`'s own `spaceAfter`, added once
        // at the block level, not by this renderer.
        expect(height).toBeCloseTo(markerB.y, 6);
    });
});

describe('render — token width and item attribution', () => {
    test('every token carries a finite `width`; the marker item is a plain `text`, not `tokens`', () => {
        const { items } = renderList.render(list(false, item(para('hello world'))), makeCtx());
        for (const it of items) {
            if (it.tokens) for (const t of it.tokens) expect(Number.isFinite(t.width)).toBe(true);
        }
        const marker = items.find((it) => it.text !== undefined);
        expect(marker.tokens).toBeUndefined();
    });

    test('every item — marker AND body, however nested — carries `index: ctx.index, kind: \'list\'`', () => {
        const ir = list(false, item(
            para('a'),
            list(false, item(para('nested')))
        ));
        const { items } = renderList.render(ir, makeCtx({ index: '7' }));
        for (const it of items) {
            expect(it.index).toBe('7');
            expect(it.kind).toBe('list');
        }
    });
});

describe('render — the stack accounting invariant (D-E: a delegated kind is always drawable)', () => {
    test('flowing a `list` through `oconvPdfStack.flowBlocks` never leaves it unaccounted', () => {
        const losses = [];
        const rootCtx = {
            measurer, layout: LAYOUT, column: LAYOUT.column,
            sizeFor: LAYOUT.sizeFor, leading: LAYOUT.leading, linebreak, losses,
            index: null
        };
        rootCtx.render = makeRender(rootCtx);
        const ir = { kind: 'document', children: [list(false, item(para('one')), item(para('two')))] };
        const laid = stack.layoutDocument(ir, rootCtx);
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
        expect(laid.pages[0].items.length).toBeGreaterThan(0);
    });

    test('a NESTED list, two levels deep, never leaves either level unaccounted', () => {
        const losses = [];
        const rootCtx = {
            measurer, layout: LAYOUT, column: LAYOUT.column,
            sizeFor: LAYOUT.sizeFor, leading: LAYOUT.leading, linebreak, losses,
            index: null
        };
        rootCtx.render = makeRender(rootCtx);
        const ir = {
            kind: 'document',
            children: [list(false, item(para('outer'), list(false, item(para('inner')))))]
        };
        const laid = stack.layoutDocument(ir, rootCtx);
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
    });

    test('a list with no drawable item records `layout/list-empty` rather than dropping silently', () => {
        const out = renderList.render(list(false), makeCtx());
        expect(out.items).toEqual([]);
        expect(out.losses.map((l) => l.code)).toEqual(['layout/list-empty']);
        expect(out.losses[0].detail.index).toBe('0');
        // MEASURED, not assumed: unlike `render/table.js`'s own empty branch
        // (which returns an explicit `height: 0`), this one returns NO
        // `height` key at all — `Object.keys(out)` is exactly
        // `['items', 'losses']`. Pinned as it IS; making the two renderers'
        // empty shapes agree would be a behaviour change, out of scope here.
        expect(Object.keys(out)).toEqual(['items', 'losses']);
        expect(out.height).toBeUndefined();

        // Non-vacuity: the stack's accounting invariant is what makes this
        // loss mandatory — a delegated kind returning zero items AND zero
        // losses is exactly the silent drop it exists to catch.
        const losses = [];
        const rootCtx = {
            measurer, layout: LAYOUT, column: LAYOUT.column,
            sizeFor: LAYOUT.sizeFor, leading: LAYOUT.leading, linebreak, losses,
            index: null
        };
        rootCtx.render = makeRender(rootCtx);
        const laid = stack.layoutDocument({ kind: 'document', children: [list(false)] }, rootCtx);
        expect(laid.losses.map((l) => l.code)).toEqual(['layout/list-empty']);
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
    });

    test('MEASURED — an all-blank list does NOT reach the empty branch: whitespace-only items still draw their markers', () => {
        // Probed before this leg was written (the plan made it conditional
        // on the measurement): items whose paragraph carries only
        // whitespace, a paragraph with no run at all, or a `listItem` with
        // no child ALL produce one marker item each and zero losses — the
        // zero-drawable-items branch is reachable ONLY through a `list`
        // node with no `listItem` child. Pinned so a future change that
        // starts dropping blank items cannot slip through silently.
        const blank = item({ kind: 'paragraph', children: [run('   ')] });
        const blankOut = renderList.render(list(false, blank, blank), makeCtx());
        expect(blankOut.items).toHaveLength(2);
        expect(blankOut.losses).toEqual([]);
        expect(blankOut.height).toBeGreaterThan(0);

        for (const li of [item(), item({ kind: 'paragraph', children: [] })]) {
            const out = renderList.render(list(false, li), makeCtx());
            expect(out.items).toHaveLength(1);
            expect(out.losses).toEqual([]);
        }
    });
});

describe('the delivered facade — `list` reaches the renderer end to end', () => {
    test('`oconvIrToPdf.irToPdf` on a nested list: no `layout/list-unrendered`, marker bytes present', () => {
        const irToPdf = runtime.resolve('oconvIrToPdf');
        const ir = { kind: 'document', children: [
            list(true, item(para('First')), item(para('Second')))
        ] };
        const written = irToPdf.irToPdf(ir);
        expect(written.losses.map((l) => l.code)).not.toContain('layout/list-unrendered');

        let latin1 = '';
        for (const b of written.bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toContain('(1.)');
        expect(latin1).toContain('(2.)');
        expect(latin1).toMatch(/\(First\)/);
        expect(latin1).toMatch(/\(Second\)/);
    });

    test('an item containing a paragraph + a nested list + a nested code block, end to end', () => {
        const irToPdf = runtime.resolve('oconvIrToPdf');
        const ir = { kind: 'document', children: [
            list(false, item(
                para('Intro.'),
                list(true, item(para('Sub one')), item(para('Sub two'))),
                { kind: 'codeBlock', info: '', text: 'ok()\n' }
            ))
        ] };
        const written = irToPdf.irToPdf(ir);
        expect(written.losses.map((l) => l.code)).not.toContain('layout/list-unrendered');
        expect(written.losses.map((l) => l.code)).not.toContain('layout/code-unrendered');
        expect(written.losses.map((l) => l.code)).not.toContain('layout/unhandled-block');

        let latin1 = '';
        for (const b of written.bytes) latin1 += String.fromCharCode(b);
        expect(latin1).toMatch(/\(Intro\.\)/);
        // Depth 2 (nested inside a bullet item) is lower-alpha, not decimal.
        expect(latin1).toContain('(a.)');
        expect(latin1).toContain('(b.)');
        expect(latin1).toMatch(/\(Sub one\)/);
        expect(latin1).toMatch(/\(Sub two\)/);
        expect(latin1).toMatch(/\(ok\\\(\\\)\)/);
    });
});

describe('the md-nested.md golden fixture — fromMd → toMd oracle (D-G)', () => {
    test('MEASURED — word stream survives the round trip; list markers decode as prose, not list syntax', async () => {
        const decoder = new TextDecoder();
        const markdown = decoder.decode(await corpusBytes('md/md-nested.md'));
        const oconvApi = runtime.resolve('oconv');

        const written = await oconvApi.fromMd({ markdown, name: 'md-nested.md', target: 'pdf' });
        expect(written.losses.map((l) => l.code)).not.toContain('layout/list-unrendered');
        expect(written.bytes.length).toBeGreaterThan(0);

        const decoded = await oconvApi.toMd({
            bytes: written.bytes, format: 'pdf', name: 'oracle.pdf', convertedAt: '2026-09-02T00:00:00Z'
        });
        // MEASURED (not assumed): the fixture's 4 bullet markers (`- Item A`,
        // `- Item A.1`, `- Item A.2`, `- Item B`) render as `•`/`–`, emitted
        // as CP1252 bytes (`oconvPdfMetrics.winAnsiByte`, the write-side
        // table). Every Standard 14 font dict names
        // `/Encoding /WinAnsiEncoding`, so the read-side decoder maps those
        // bytes back to the same code points: no `text/undecodable` loss.
        // The ordered-list markers (`1.`/`a.`/`b.`) are plain ASCII.
        expect(decoded.losses).toEqual([]);

        // MEASURED (not assumed): the pdf → md reader does NOT reconstruct
        // `- ` / `1. ` list syntax — a laid-out list decodes as PROSE, one
        // line per item, no leading marker syntax anywhere in the body.
        function stripFrontmatter(md) {
            if (!md.startsWith('---')) return md;
            const end = md.indexOf('\n---\n', 3);
            return end === -1 ? md : md.slice(end + 5);
        }
        const body = stripFrontmatter(decoded.markdown);
        // No BULLET syntax is recovered (the decoded `–` marker is U+2013,
        // not the ASCII `-` list syntax). An ordered marker text can start a
        // line (`1. Step One`) because the reader separates the marker from
        // its body by one space (a real horizontal gap between two positioned
        // runs) — the IR is still a paragraph, no list structure is
        // reconstructed. Since BL-1598 (office/BATCH_49/02, 2026-10-02)
        // `@awacloud/md`'s renderer escapes that line-leading marker
        // (`1\. Step One`), so the Markdown re-parses as a paragraph too.
        expect(/^[-*]\s/m.test(body)).toBe(false);

        // The bullet ITEMS' own text survives untouched, and each bullet
        // glyph now decodes in front of it (MEASURED: `•` at depth 1, `–`
        // at depth 2, separated from the item text by one space).
        expect(body).toContain('Item A');
        expect(body).toContain('Item A.1');
        expect(body).toContain('Item A.2');
        expect(body).toContain('Item B');
        expect(body).toContain('• Item A');
        expect(body).toContain('– Item A.1');
        expect(body).toContain('– Item A.2');
        expect(body).toContain('• Item B');

        // The ordered markers ALSO decode as prose, but MEASURED differently
        // from the bullets: `1.`/`a.`/`b.`/`2.` are plain ASCII (no
        // `text/undecodable`). The two adjacent `LaidOutItem`s (marker, body)
        // carry no explicit space glyph between them, but the reader now
        // separates each marker from the FIRST word of its line by one space,
        // inferred from the horizontal gap between the marker's end and the
        // body's start (it used to glue them: `1.Step One`). Every ordered
        // item's own text survives, in order, after its marker.
        // Re-measured 2026-10-02 (office/BATCH_49/02, BL-1598): `1.` starts
        // its line, so the body carries it escaped, `1\. Step One`; the
        // mid-line `a.`, `b.`, `2.` below are not line starts, unescaped.
        expect(body).toMatch(/1\\\. Step One(?!\.)/);
        expect(body).toMatch(/a\. Step One\.a/);
        expect(body).toMatch(/b\. Step One\.b/);
        expect(body).toMatch(/2\. Step Two/);
    });
});
