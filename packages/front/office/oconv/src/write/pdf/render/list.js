// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `list` renderer of the `md → pdf` bounded typesetter
 * — nested bullet/ordered lists: markers by nesting depth, a
 * hanging-indent marker column, and item children re-flowed through the
 * SAME machinery as top-level blocks. Its export signature follows the
 * renderer seam contract.
 *
 * ## Geometry
 *
 * - Each nesting level (a `list` nested inside a `listItem`) advances
 *   `ctx.indent` by `INDENT_STEP` (18 pt) — this is `ctx.flowChildren`'s own
 *   default `indentDelta`, which this module passes explicitly.
 * - The marker column is `MARKER_COLUMN` (14 pt) wide: a marker is measured
 *   and placed RIGHT-ALIGNED so its own right edge sits at
 *   `layout.margin + ctx.indent + MARKER_COLUMN`. Item content is flowed
 *   at `ctx.indent + INDENT_STEP` (via `ctx.flowChildren`'s default), a
 *   few points further right than the marker column — the 14 pt
 *   "hanging indent" figure names the marker's own column width, the
 *   body indent is the SAME 18 pt step every nested list also advances by.
 * - Bullet markers by depth: `•` (U+2022), `–` (U+2013), `·` (U+00B7),
 *   depth 3+ repeating `·`. Ordered markers by depth: `1.`/`2.`/…,
 *   `a.`/`b.`/…, `i.`/`ii.`/… (lower Roman, depth 3+), each list's own
 *   counter starting fresh at 1 — nesting never carries a counter over.
 * - Spacing: `ITEM_SPACING` (0.25 · body size) between consecutive items,
 *   inserted by this module; the 0.6 · body size gap AFTER the whole list
 *   is `stack.js`'s own uniform `spaceAfter` for every delegated kind
 *   (`PARAGRAPH_SPACE_AFTER` in `../stack.js`) — nothing to add here.
 *
 * ## Depth tracking
 *
 * `ctx` carries no `depth` field (the renderer seam contract only threads `index`,
 * `indent`, `kind`) and a nested list reaches this module through the
 * GENERIC `ctx.render` re-entry (`ctx.flowChildren` → `stack.flowBlocks` →
 * `ctx.render`, all synchronous) — there is no parameter seam a nested call
 * could carry a depth number through. This module instead counts its OWN
 * re-entrancy: a factory-local counter increments on every `render()` entry
 * and decrements on every exit (`try/finally`), which is sound BECAUSE the
 * whole call chain is synchronous, single-threaded depth-first recursion —
 * a nested list's `render()` call always runs to completion, and unwinds,
 * before the outer loop moves to the next sibling item. Two unrelated
 * top-level lists (not nested in each other) each see the counter reset to
 * `0` between them.
 *
 * ## Item-local placement (mirrors `stack.js` `stackPages`, kept LOCAL)
 *
 * `ctx.flowChildren(children, opts)` returns FLOW blocks (`stack.js`
 * `FlowBlock[]`), not page items — this module places them itself, in ITS
 * OWN block-local frame (`y` downward-positive from the LIST's own top
 * edge), using the same per-block formula `stackPages` uses to place them
 * in absolute PDF space: a text block's line `n` (1-based) baselines at
 * `runningY + spaceBefore + n · leading(sizePt)`; a delegated child block's
 * own items (already local to ITS top edge) are shifted down by
 * `runningY + spaceBefore`. A cell's / item's OWN trailing block does not
 * contribute its `spaceAfter` (mirrors `render/table.js` `layoutCell`) —
 * the 0.25 · size inter-item gap is this module's own, added once, between
 * items only.
 *
 * ## Item attribution (mirrors `render/table.js`)
 *
 * Every item this module returns — the marker AND every piece of re-flowed
 * item content, however deeply nested — carries `index: ctx.index,
 * kind: 'list'`: the SAME convention `render/table.js` `translate()` uses
 * for a cell's nested content. `ctx.flowChildren`'s `indexPrefix` is fixed
 * to THIS list's OWN `ctx.index` for every item it flows (there is no way
 * to vary it per item through the public seam), so a per-item dotted path
 * would collide across sibling items anyway; forcing the list's own index
 * everywhere is simpler AND is exactly what the stack's accounting
 * invariant needs — at least one item naming this block's `index`
 * (`stack.js` `unaccounted`).
 *
 * ## Renderer seam contract (the interface every renderer implements)
 *
 * ```
 * render(node, childCtx) → { items, losses, height? }
 * ```
 *
 * - `node` is the `oconv-ir/v1` `list` node.
 * - `childCtx` is the stack's child context: the parent `Ctx` (`measurer`,
 *   `layout`, `column`, `sizeFor`, `leading`, `linebreak`, `losses`,
 *   `render`, `flowChildren`) plus `index` (the dotted block path), `indent`
 *   (points, already including the enclosing indent) and `kind`.
 * - `items` come back in BLOCK-LOCAL coordinates: `x` ABSOLUTE, `y` the
 *   distance DOWNWARD from the block's top edge (baseline, or a rule rect's
 *   TOP edge).
 * - `height` is BODY height only (space AFTER the whole list is added by
 *   the stack, not by this module).
 *
 * A renderer NEVER edits `../../ir-to-pdf.js`: `render` and `flowChildren`
 * are defined there once, for all four kinds.
 *
 * Capture-free (`fw/no-factory-capture`), worker-safe.
 *
 * @module oconv/write/pdf/render/list
 */

/**
 * List renderer module descriptor.
 *
 * Public API (`runtime.resolve('oconvPdfRenderList')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `render(node, ctx)` | `{items: object[], losses: object[], height?: number}` |
 *
 * @type {{name: string, dependencies: string[],
 *         factory: (linebreak: object) => object}}
 */
import { oconvPdfLinebreak } from '../linebreak.js';

export const oconvPdfRenderList = {
    name: 'oconvPdfRenderList',
    dependencies: ['oconvPdfLinebreak'],
    deps: [oconvPdfLinebreak],

    factory(linebreak) {
        // Declared so the resolved linebreaker is available here
        // without touching `main.js` or the facade's dependency list —
        // this module composes with `ctx.flowChildren` instead (already
        // closed over the resolved linebreaker on the facade side), so
        // nothing here reads `linebreak` directly. Same `void` idiom the
        // sibling stub used (and `oconv.js` before it).
        void linebreak;

        /** Points of indent a nested list advances by (matches `stack.js`
         * `INDENT_STEP`, mirrored here per `fw/no-factory-capture`). */
        const INDENT_STEP = 18;

        /** Width, in points, of the marker column (14 pt hanging
         * indent). A marker is measured and placed so its own RIGHT edge
         * lands here. */
        const MARKER_COLUMN = 14;

        /** Points of space between two consecutive items, as a ratio of the
         * item body size (0.25·size between items). */
        const ITEM_SPACING_RATIO = 0.25;

        /** Bullet glyphs by nesting depth (1-based); depth 3+ repeats the
         * last one. `•` U+2022, `–` U+2013, `·` U+00B7 — all three are
         * WinAnsi-representable (`oconvPdfMetrics.winAnsiByte`). */
        const BULLETS = ['•', '–', '·'];

        /**
         * 1-based `n` → lowercase alphabetic marker body: `a`, `b`, …, `z`,
         * `aa`, `ab`, … (never empty).
         *
         * @param {number} n
         * @returns {string}
         */
        function toAlpha(n) {
            let s = '';
            let x = n;
            while (x > 0) {
                const rem = (x - 1) % 26;
                s = String.fromCharCode(97 + rem) + s;
                x = Math.floor((x - 1) / 26);
            }
            return s === '' ? 'a' : s;
        }

        /**
         * 1-based `n` → lowercase Roman numeral (never empty).
         *
         * @param {number} n
         * @returns {string}
         */
        function toRoman(n) {
            const table = [
                [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
                [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
                [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
            ];
            let x = Math.max(1, Math.trunc(n));
            let out = '';
            for (const [v, sym] of table) {
                while (x >= v) { out += sym; x -= v; }
            }
            return out === '' ? 'i' : out;
        }

        /**
         * Marker text for one item.
         *
         * @param {boolean} ordered
         * @param {number} depth 1-based list nesting depth.
         * @param {number} n 1-based item position within ITS OWN list.
         * @returns {string}
         */
        function markerFor(ordered, depth, n) {
            if (!ordered) return BULLETS[Math.min(depth - 1, BULLETS.length - 1)];
            if (depth <= 1) return `${n}.`;
            if (depth === 2) return `${toAlpha(n)}.`;
            return `${toRoman(n)}.`;
        }

        /**
         * Move one item a NESTED renderer produced into this list's own
         * block-local frame — `x` is already ABSOLUTE (renderer seam), only `y` needs
         * shifting down by the child block's own top offset. Mirrors
         * `render/table.js` `translate()`.
         *
         * @param {object} it
         * @param {number} dy Child block's own top, LOCAL to this list.
         * @param {object} ctx
         * @returns {object}
         */
        function translate(it, dy, ctx) {
            const moved = { ...it, index: ctx.index, kind: 'list' };
            if (it.rule) {
                moved.rule = { ...it.rule, y: it.rule.y + dy };
                moved.x = moved.rule.x;
                moved.y = moved.rule.y;
            } else {
                moved.y = it.y + dy;
            }
            return moved;
        }

        /**
         * Place one flowed `Line` as an item baselined at `baseline`.
         *
         * @param {object[]} items Sink.
         * @param {object} block The `FlowBlock` the line came from.
         * @param {object} line `oconvPdfLinebreak` `Line`.
         * @param {number} baseline LOCAL y (downward from the list's top).
         * @param {number} layoutMargin
         * @param {object} ctx
         */
        function pushLineItem(items, block, line, baseline, layoutMargin, ctx) {
            const tokens = line.tokens || [];
            const words = tokens.filter((t) => t.kind === 'word');
            const first = words.length > 0 ? words[0].link : null;
            const item = {
                x: layoutMargin + block.indent,
                y: baseline,
                style: tokens.length > 0 ? tokens[0].style : 'regular',
                sizePt: block.sizePt,
                tokens,
                index: ctx.index,
                kind: 'list'
            };
            if (first && words.every((t) => t.link === first)) item.link = first;
            items.push(item);
        }

        /**
         * Place one item's already-flowed children into `items`, starting at
         * LOCAL `top`. Mirrors `stack.js` `stackPages`'s per-block placement
         * loop and `render/table.js` `layoutCell`'s "no trailing spaceAfter"
         * convention, kept entirely in this list's own local frame.
         *
         * @param {object[]} items Sink (this module's own return array).
         * @param {object[]} flowedBlocks `ctx.flowChildren(...).blocks`.
         * @param {object} layout
         * @param {number} top LOCAL y the item's content starts at.
         * @param {object} ctx
         * @returns {{bottom: number, firstBaseline: number|null}}
         *   `firstBaseline` is LOCAL to `top` (i.e. an offset, not an
         *   absolute LOCAL y), `null` when the item flowed no block at all.
         */
        function placeItemBody(items, flowedBlocks, layout, top, ctx) {
            let cursor = top;
            let firstBaseline = null;
            flowedBlocks.forEach((block, bi) => {
                cursor += block.spaceBefore;
                const blockTop = cursor;
                if (block.lines) {
                    const leadingPt = layout.leading(block.sizePt);
                    block.lines.forEach((line) => {
                        cursor += leadingPt;
                        if (firstBaseline === null) firstBaseline = cursor - top;
                        pushLineItem(items, block, line, cursor, layout.margin, ctx);
                    });
                } else {
                    for (const it of block.items || []) items.push(translate(it, blockTop, ctx));
                    if (firstBaseline === null) firstBaseline = blockTop - top;
                }
                cursor = blockTop + block.height;
                if (bi < flowedBlocks.length - 1) cursor += block.spaceAfter;
            });
            return { bottom: cursor, firstBaseline };
        }

        /** Re-entrancy counter — see the module header "Depth tracking". */
        let depth = 0;

        /**
         * Render one `list` block: one marker + re-flowed body per item,
         * stacked with a fixed inter-item gap.
         *
         * @param {object} node `oconv-ir/v1` `list` node.
         * @param {object} ctx Stack child context (see the module header).
         * @returns {{items: object[], losses: object[], height?: number}}
         */
        function render(node, ctx) {
            depth += 1;
            try {
                const layout = ctx.layout;
                const sizePt = layout.sizeFor('paragraph');
                const defaultBaseline = layout.leading(sizePt);
                const ordered = !!(node && node.ordered);
                const listItems = ((node && node.children) || []).filter(
                    (c) => c && c.kind === 'listItem'
                );
                const colRight = layout.margin + (Number.isFinite(ctx.indent) ? ctx.indent : 0) + MARKER_COLUMN;

                const items = [];
                let runningY = 0;

                listItems.forEach((li, i) => {
                    const itemTop = runningY;
                    const marker = markerFor(ordered, depth, i + 1);
                    const markerWidth = ctx.measurer.widthOf(marker, 'regular', sizePt);

                    const flowed = ctx.flowChildren(li.children || [], {
                        indentDelta: INDENT_STEP, ruleX: null
                    }) || { blocks: [] };
                    // Placed into a SEPARATE sink first (never `items`
                    // directly): the marker must land in `items` BEFORE its
                    // own item's body — including any nested list's OWN
                    // marker+body, pushed by a recursive `render()` call
                    // inside `placeItemBody` — so document reading order
                    // (marker, then body, depth-first) is preserved. `y`
                    // still needs the placement result, so this can only be
                    // pushed AFTER `placeItemBody` runs.
                    const bodyItems = [];
                    const placed = placeItemBody(bodyItems, flowed.blocks || [], layout, itemTop, ctx);
                    const baselineOffset = placed.firstBaseline === null ? defaultBaseline : placed.firstBaseline;

                    items.push({
                        x: colRight - markerWidth,
                        y: itemTop + baselineOffset,
                        style: 'regular',
                        sizePt,
                        text: marker,
                        index: ctx.index,
                        kind: 'list'
                    });
                    for (const it of bodyItems) items.push(it);

                    runningY = Math.max(placed.bottom, itemTop + baselineOffset);
                    if (i < listItems.length - 1) runningY += ITEM_SPACING_RATIO * sizePt;
                });

                if (items.length === 0) {
                    return {
                        items: [],
                        losses: [{
                            code: 'layout/list-empty',
                            detail: { index: ctx && ctx.index }
                        }]
                    };
                }

                return { items, losses: [], height: runningY };
            } finally {
                depth -= 1;
            }
        }

        return { render };
    }
};
