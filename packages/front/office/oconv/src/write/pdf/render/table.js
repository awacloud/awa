// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `table` renderer of the `md → pdf` bounded typesetter
 * — a FIXED-LAYOUT GFM table: content-derived column widths, a
 * bold header row, horizontal rules only, and a scale-then-clip policy whose
 * every degradation is RECORDED. Its export signature follows the renderer
 * seam contract.
 *
 * The typesetter's published limits are law, promises AND refusals. The refusals this module keeps:
 *
 * - **A table never splits across a page.** It is ONE flow block. When it does
 *   not fit the remaining space `stack.js` moves the whole block to a new
 *   page; when it is taller than a whole page the stack clips it at the page
 *   bottom and records `layout/block-clipped` with `kind:'table'`. This module
 *   only reports `height` — it never breaks a row off.
 * - **No reflow of an over-wide table.** Wider than the column means SCALED
 *   (`layout/table-scaled`) or, when even the unbreakable tokens no longer
 *   fit, CLIPPED at the cell's right edge (`layout/table-clipped`) — never a
 *   silent re-arrangement.
 * - **No column alignment**, no cell spanning, no vertical alignment options,
 *   no vertical rules: the frozen IR carries `row.header` and nothing else
 *   (`../../../ir/ir.js`), so every cell is left-aligned, plain-GFM look.
 *
 * ## Column widths (the documented choice)
 *
 * Every cell is measured TWICE, unbroken, with the same tokenizer the layout
 * then breaks with (`oconvPdfLinebreak.tokenize`, header cells measured in
 * their forced bold class so the measurement matches the ink):
 *
 * - `minWidth` — the widest single unbreakable WORD token of the cell;
 * - `natWidth` — the widest single block of the cell, unbroken.
 *
 * Both get `2 · 3 pt` of cell padding added; a column's `min`/`nat` is the max
 * over its cells. With `available = ctx.column − ctx.indent` (not plain
 * `ctx.column`; subtracting the enclosing indent is the same number at the
 * top level and the only bound that stays inside the right margin for a table
 * nested in a quote or a list):
 *
 * | Case | Widths | Loss |
 * |---|---|---|
 * | `Σ nat ≤ available` | **exactly `nat`** — the slack is NOT distributed: a table narrower than the column, left-aligned, is the honest GFM look and keeps a two-column table from being stretched across the page | — |
 * | `Σ nat > available ≥ Σ min` | `w_i = max(min_i, nat_i · available / Σ nat)`, then the excess produced by those `max()` clamps is taken back from the columns that still have slack, proportionally to it | `layout/table-scaled` |
 * | `Σ min > available` | `w_i = min_i · available / Σ min` — sub-minimal by construction, so tokens WILL overrun their cell and are truncated at its right edge | `layout/table-clipped` |
 *
 * ## Re-flowing a cell at its column width (the `flowChildren` mechanism)
 *
 * `ctx.flowChildren` (renderer seam, defined once in `../../ir-to-pdf.js`) takes an
 * `indentDelta`, not a width: it re-enters `stack.flowBlocks` with
 * `indent = ctx.indent + delta`, and a text block there breaks at
 * `layout.column − indent`. So a cell whose inner width must be `inner` is
 * flowed with
 *
 * ```
 * delta = ctx.column − ctx.indent − inner
 * ```
 *
 * and the flowed lines come back positioned for a column at
 * `layout.margin + ctx.indent + delta`, which is NOT where the cell is. Every
 * item is therefore re-`x`-ed by the constant
 * `dx = cellX + 3 − (layout.margin + ctx.indent + delta)`, which preserves any
 * EXTRA indent a nested block acquired inside the cell (its own `indent`
 * minus the cell's base). `ruleX: null` is passed explicitly so an enclosing
 * blockquote's bar is not re-drawn inside every cell.
 *
 * ## Geometry
 *
 * Block-local space (renderer seam): `x` absolute, `y` the distance DOWNWARD from the
 * block's top edge — a text item's baseline, a rule rect's TOP edge.
 *
 * ```
 *  y=0  ├──────────────────────────┤  0.5 pt outer box (top)
 *       │ 3 pt padding, cell text  │  row 0 (header: bold)
 *       ├──────────────────────────┤  0.75 pt header rule
 *       │ …                        │  row 1
 *       ├──────────────────────────┤  0.5 pt row rule
 *       │ …                        │  row n−1
 *       └──────────────────────────┘  0.5 pt outer box (bottom)
 * ```
 *
 * Row height = tallest cell body + `2 · 3 pt`. Rule ITEMS number `rows + 1`
 * (one box top, one under every row — the one under a header row being the
 * 0.75 pt one and the one under the last row the 0.5 pt box bottom); there is
 * no separate "header rule" item on top of a row rule, the header rule IS
 * that row's rule, drawn thicker.
 *
 * **Rules are their own items.** `stack.js` reads `it.rule.y`/`it.rule.h` and
 * OVERWRITES `abs.y` on a rule-bearing item, so an item carrying both a rule
 * and text would have its text silently misplaced.
 *
 * ## Loss codes
 *
 * | Code | Detail | Meaning |
 * |---|---|---|
 * | `layout/table-scaled` | `{index, from, to, column}` | the natural widths did not fit and were scaled down |
 * | `layout/table-clipped` | `{index, columns, clippedCells, cells}` | at least one column is narrower than its widest token, or a token was truncated at a cell edge; `cells` names each `{row, column}` |
 * | `layout/table-empty` | `{index, rows}` | a `table` node with no `row` child — nothing to draw, and a delegated kind must never return zero items AND zero losses (the stack's accounting invariant) |
 *
 * A cell's own flow losses (`layout/line-overflow`, a nested renderer's) reach
 * the ledger through `flowChildren` under the CHILD index; this module never
 * re-records them.
 *
 * Capture-free (`fw/no-factory-capture`), worker-safe: every constant and
 * helper is declared inside `factory()`, whose single parameter is the
 * resolved `oconvPdfLinebreak`.
 *
 * @module oconv/write/pdf/render/table
 */

/**
 * Table renderer module descriptor.
 *
 * Public API (`runtime.resolve('oconvPdfRenderTable')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `render(node, ctx)` | `{items: object[], losses: object[], height?: number}` |
 *
 * @type {{name: string, dependencies: string[],
 *         factory: (linebreak: object) => object}}
 */
import { oconvPdfLinebreak } from '../linebreak.js';

export const oconvPdfRenderTable = {
    name: 'oconvPdfRenderTable',
    dependencies: ['oconvPdfLinebreak'],
    deps: [oconvPdfLinebreak],

    factory(linebreak) {
        /** Padding inside a cell, in points, on EACH side. */
        const CELL_PAD = 3;

        /** Thickness of the rule below the header row, in points. */
        const HEADER_RULE = 0.75;

        /** Thickness of a rule between two body rows, in points. */
        const ROW_RULE = 0.5;

        /** Thickness of the outer box, in points. */
        const BOX_RULE = 0.5;

        /** Slack, in points, absorbing float noise in fit comparisons. */
        const EPSILON = 1e-6;

        /**
         * The block children of a cell.
         *
         * @param {object} cell
         * @returns {object[]}
         */
        function blocksOf(cell) {
            return (cell && cell.children) || [];
        }

        /**
         * Type size of one block, exactly as `stack.js` resolves it.
         *
         * @param {object} node
         * @param {object} layout
         * @returns {number}
         */
        function sizeOfBlock(node, layout) {
            const kind = node && node.kind;
            if (kind === 'heading') return layout.sizeFor('heading', node.level);
            if (kind === 'codeBlock') return layout.sizeFor('code');
            return layout.sizeFor('paragraph');
        }

        /**
         * Collect the inline `run` nodes a block puts on the page, for
         * MEASUREMENT only. A `codeBlock`'s text and an `image`'s placeholder
         * are synthesised as runs so a cell holding one still reserves width;
         * both are approximations (the real ink is the code / image
         * renderer's), stated in the module header.
         *
         * @param {object} node Block node.
         * @param {object[]} out Accumulator.
         * @returns {object[]} `out`.
         */
        function inlineRunsOf(node, out) {
            const kind = node && node.kind;
            if (kind === 'paragraph' || kind === 'heading') {
                for (const kid of node.children || []) {
                    if (kid && kid.kind === 'run') out.push(kid);
                }
                return out;
            }
            if (kind === 'codeBlock') {
                out.push({
                    kind: 'run',
                    text: String(node.text === undefined ? '' : node.text),
                    code: true, link: null
                });
                return out;
            }
            if (kind === 'image') {
                out.push({
                    kind: 'run',
                    text: `[image: ${node.alt || node.name || ''}]`,
                    italic: true, link: null
                });
                return out;
            }
            for (const kid of node.children || []) inlineRunsOf(kid, out);
            return out;
        }

        /**
         * The forced style class of a HEADER cell. `flowChildren`'s
         * `styleOverride` is uniform per call, so the choice is per cell:
         * `'boldItalic'` when every run of the cell is italic, `'bold'`
         * otherwise (a mixed cell loses its italics — and an inline-code run
         * in a header loses its monospace face; stated here rather than
         * recorded, the ink is still there).
         *
         * @param {object} cell
         * @returns {string}
         */
        function headerStyleOf(cell) {
            let any = false;
            let allItalic = true;
            for (const b of blocksOf(cell)) {
                for (const r of inlineRunsOf(b, [])) {
                    any = true;
                    if (!r.italic) allItalic = false;
                }
            }
            return any && allItalic ? 'boldItalic' : 'bold';
        }

        /**
         * Measure one cell unbroken.
         *
         * @param {object} cell
         * @param {object} ctx Renderer context.
         * @param {string} [override] Forced style class (header cells).
         * @returns {{min: number, nat: number}} Padding INCLUDED.
         */
        function measureCell(cell, ctx, override) {
            const layout = ctx.layout;
            let min = 0;
            let nat = 0;
            for (const b of blocksOf(cell)) {
                const runs = inlineRunsOf(b, []);
                if (runs.length === 0) continue;
                const tokens = linebreak.tokenize(runs, ctx.measurer, sizeOfBlock(b, layout), override);
                let line = 0;
                for (const t of tokens) {
                    const w = Number.isFinite(t.width) ? t.width : 0;
                    line += w;
                    if (t.kind === 'word' && w > min) min = w;
                }
                if (line > nat) nat = line;
            }
            const pad = 2 * CELL_PAD;
            return { min: min + pad, nat: Math.max(nat, min) + pad };
        }

        /**
         * Resolve the column widths (see the module header's table).
         *
         * @param {number[]} nat Natural widths, padding included.
         * @param {number[]} min Minimum widths, padding included.
         * @param {number} available Usable width, in points.
         * @returns {{widths: number[], scaled: boolean, subMinimal: boolean,
         *   from: number, to: number}}
         */
        function resolveWidths(nat, min, available) {
            const sum = (xs) => xs.reduce((a, b) => a + b, 0);
            const sumNat = sum(nat);
            if (sumNat <= available + EPSILON) {
                return { widths: nat.slice(), scaled: false, subMinimal: false, from: sumNat, to: sumNat };
            }
            const sumMin = sum(min);
            if (sumMin > available + EPSILON) {
                const factor = sumMin > 0 ? available / sumMin : 0;
                const widths = min.map((m) => m * factor);
                return { widths, scaled: false, subMinimal: true, from: sumNat, to: sum(widths) };
            }
            const factor = sumNat > 0 ? available / sumNat : 0;
            let widths = nat.map((n, j) => Math.max(min[j], n * factor));
            let total = sum(widths);
            if (total > available + EPSILON) {
                // The `max()` clamps pushed the total back over the column:
                // take the excess out of the columns that still have slack
                // above their own minimum, proportionally to that slack.
                const slack = widths.map((w, j) => w - min[j]);
                const slackTotal = sum(slack);
                const excess = total - available;
                if (slackTotal > EPSILON) {
                    widths = widths.map((w, j) => w - slack[j] * (excess / slackTotal));
                    total = sum(widths);
                }
            }
            return { widths, scaled: true, subMinimal: false, from: sumNat, to: total };
        }

        /**
         * Longest prefix of `text` that fits `room` points.
         *
         * @param {string} text
         * @param {string} style
         * @param {number} sizePt
         * @param {number} room
         * @param {object} measurer
         * @returns {{text: string, width: number}}
         */
        function fitPrefix(text, style, sizePt, room, measurer) {
            const chars = Array.from(text);
            let kept = '';
            let width = 0;
            for (let i = 0; i < chars.length; i += 1) {
                const next = kept + chars[i];
                const w = measurer.widthOf(next, style, sizePt);
                if (w > room + EPSILON) break;
                kept = next;
                width = w;
            }
            return { text: kept, width };
        }

        /**
         * Place one broken line's tokens inside a cell, truncating at the
         * cell's right edge. EVERY emitted token carries a finite `width`:
         * the emitter places style segments by summing token widths, so a
         * width-less token would make the following segment overprint the
         * previous one with nothing recorded.
         *
         * @param {object[]} tokens
         * @param {number} x0 Left edge of the text.
         * @param {number} right Right edge of the cell's text area.
         * @param {number} sizePt
         * @param {object} ctx
         * @returns {{tokens: object[], clipped: boolean}}
         */
        function placeTokens(tokens, x0, right, sizePt, ctx) {
            const out = [];
            let x = x0;
            let clipped = false;
            for (const t of tokens) {
                const width = Number.isFinite(t.width) ? t.width : 0;
                if (x + width <= right + EPSILON) {
                    out.push({ ...t, width });
                    x += width;
                    continue;
                }
                clipped = true;
                const room = right - x;
                if (room > EPSILON && t.kind !== 'space') {
                    const style = t.style || 'regular';
                    const fitted = fitPrefix(String(t.text === undefined ? '' : t.text),
                        style, sizePt, room, ctx.measurer);
                    if (fitted.text !== '') out.push({ ...t, text: fitted.text, width: fitted.width });
                }
                break;                                    // nothing after it can fit either
            }
            return { tokens: out, clipped };
        }

        /**
         * Move one item produced by a NESTED renderer into this table's
         * block-local space. A rule-bearing item is moved through its `rule`
         * rect, whose `y` is the rect's TOP edge.
         *
         * @param {object} it
         * @param {number} dx
         * @param {number} dy
         * @param {object} ctx
         * @returns {object}
         */
        function translate(it, dx, dy, ctx) {
            const moved = { ...it, index: ctx.index, kind: 'table' };
            if (it.rule) {
                moved.rule = { ...it.rule, x: it.rule.x + dx, y: it.rule.y + dy };
                moved.x = moved.rule.x;
                moved.y = moved.rule.y;
            } else {
                moved.x = it.x + dx;
                moved.y = it.y + dy;
            }
            return moved;
        }

        /**
         * Lay one cell out at its resolved column width.
         *
         * @param {object} cell IR `cell` node (may be `undefined` — a short
         *   row simply leaves that column empty).
         * @param {{x: number, width: number, y0: number, override: string|null}} spec
         *   `x` the cell's LEFT edge, `y0` the block-local y of its content
         *   top (the row's top plus the padding).
         * @param {object} ctx
         * @returns {{items: object[], height: number, clipped: boolean}}
         *   `height` is the cell's BODY height, padding excluded.
         */
        function layoutCell(cell, spec, ctx) {
            const layout = ctx.layout;
            const blocks = blocksOf(cell);
            if (blocks.length === 0) return { items: [], height: 0, clipped: false };

            const inner = Math.max(1, spec.width - 2 * CELL_PAD);
            const baseIndent = Number.isFinite(ctx.indent) ? ctx.indent : 0;
            const column = Number.isFinite(ctx.column) ? ctx.column : layout.column;
            const delta = column - baseIndent - inner;
            const flowed = ctx.flowChildren(blocks, {
                indentDelta: delta,
                styleOverride: spec.override || undefined,
                ruleX: null
            }) || {};
            const flowedBlocks = flowed.blocks || [];
            const dx = spec.x + CELL_PAD - (layout.margin + baseIndent + delta);
            const right = spec.x + spec.width - CELL_PAD;

            const items = [];
            let y = 0;
            let clipped = false;
            flowedBlocks.forEach((b, bi) => {
                y += b.spaceBefore;
                if (b.lines) {
                    const leading = layout.leading(b.sizePt);
                    const x0 = layout.margin + b.indent + dx;
                    b.lines.forEach((line, n) => {
                        const fitted = placeTokens(line.tokens || [], x0, right, b.sizePt, ctx);
                        if (fitted.clipped) clipped = true;
                        if (fitted.tokens.length === 0) return;
                        items.push({
                            x: x0,
                            y: spec.y0 + y + (n + 1) * leading,
                            style: fitted.tokens[0].style || 'regular',
                            sizePt: b.sizePt,
                            tokens: fitted.tokens,
                            index: ctx.index,
                            kind: 'table'
                        });
                    });
                } else {
                    for (const it of b.items || []) items.push(translate(it, dx, spec.y0 + y, ctx));
                }
                y += b.height;
                // The stack adds a block's `spaceAfter` BETWEEN blocks; a
                // cell's last block must not push the cell's floor down.
                if (bi < flowedBlocks.length - 1) y += b.spaceAfter;
            });
            return { items, height: y, clipped };
        }

        /**
         * One filled rectangle, as its OWN item.
         *
         * @param {number} x
         * @param {number} y Distance downward to the rect's TOP edge.
         * @param {number} w
         * @param {number} h
         * @param {number} sizePt
         * @param {object} ctx
         * @returns {object}
         */
        function ruleItem(x, y, w, h, sizePt, ctx) {
            return {
                x, y,
                style: 'regular',
                sizePt,
                tokens: [],
                index: ctx.index,
                kind: 'table',
                rule: { x, y, w, h }
            };
        }

        /**
         * Render one `table` block.
         *
         * @param {object} node `oconv-ir/v1` `table` node.
         * @param {object} ctx Stack child context + `flowChildren`.
         * @returns {{items: object[], losses: object[], height: number,
         *   keepTogether: boolean}} `height` is the BODY height — the stack
         *   adds `spaceAfter` itself. `keepTogether` states the typesetter's refusal
         *   (a table never splits); `stack.js` reaches the same behaviour
         *   structurally — it does not read the flag on a delegated block.
         */
        function render(node, ctx) {
            const layout = ctx.layout;
            const sizePt = layout.sizeFor('paragraph');
            const indent = Number.isFinite(ctx.indent) ? ctx.indent : 0;
            const column = Number.isFinite(ctx.column) ? ctx.column : layout.column;
            const available = Math.max(2 * CELL_PAD, column - indent);
            const tableX = layout.margin + indent;
            /** @type {object[]} */
            const losses = [];

            const rows = ((node && node.children) || []).filter((r) => r && r.kind === 'row');
            if (rows.length === 0) {
                return {
                    items: [],
                    losses: [{ code: 'layout/table-empty', detail: { index: ctx.index, rows: 0 } }],
                    height: 0,
                    keepTogether: true
                };
            }

            const cellsOf = (row) => (row.children || []).filter((c) => c && c.kind === 'cell');
            let colCount = 0;
            for (const row of rows) colCount = Math.max(colCount, cellsOf(row).length);
            if (colCount === 0) {
                return {
                    items: [],
                    losses: [{ code: 'layout/table-empty', detail: { index: ctx.index, rows: rows.length } }],
                    height: 0,
                    keepTogether: true
                };
            }

            // --- measure -----------------------------------------------------
            const nat = new Array(colCount).fill(2 * CELL_PAD);
            const min = new Array(colCount).fill(2 * CELL_PAD);
            /** @type {(string|null)[][]} Per row, per column: the forced class. */
            const overrides = rows.map((row) => cellsOf(row).map(
                (cell) => (row.header ? headerStyleOf(cell) : null)
            ));
            rows.forEach((row, r) => {
                cellsOf(row).forEach((cell, j) => {
                    const m = measureCell(cell, ctx, overrides[r][j] || undefined);
                    if (m.nat > nat[j]) nat[j] = m.nat;
                    if (m.min > min[j]) min[j] = m.min;
                });
            });
            for (let j = 0; j < colCount; j += 1) {
                if (min[j] > nat[j]) nat[j] = min[j];
            }

            // --- column widths -----------------------------------------------
            const resolved = resolveWidths(nat, min, available);
            const widths = resolved.widths;
            if (resolved.scaled) {
                losses.push({
                    code: 'layout/table-scaled',
                    detail: {
                        index: ctx.index,
                        from: resolved.from,
                        to: resolved.to,
                        column: available
                    }
                });
            }
            const left = [];
            let acc = tableX;
            for (let j = 0; j < colCount; j += 1) { left.push(acc); acc += widths[j]; }
            const tableWidth = acc - tableX;

            // --- rows ---------------------------------------------------------
            /** @type {object[]} */
            const items = [];
            /** @type {{row: number, column: number}[]} */
            const clippedCells = [];
            let y = 0;
            items.push(ruleItem(tableX, y, tableWidth, BOX_RULE, sizePt, ctx));
            y += BOX_RULE;

            rows.forEach((row, r) => {
                const cells = cellsOf(row);
                const top = y;
                let body = 0;
                for (let j = 0; j < colCount; j += 1) {
                    const laid = layoutCell(cells[j], {
                        x: left[j],
                        width: widths[j],
                        y0: top + CELL_PAD,
                        override: overrides[r][j]
                    }, ctx);
                    if (laid.height > body) body = laid.height;
                    if (laid.clipped) clippedCells.push({ row: r, column: j });
                    for (const it of laid.items) items.push(it);
                }
                y = top + body + 2 * CELL_PAD;
                const last = r === rows.length - 1;
                const thickness = row.header ? HEADER_RULE : (last ? BOX_RULE : ROW_RULE);
                items.push(ruleItem(tableX, y, tableWidth, thickness, sizePt, ctx));
                y += thickness;
            });

            if (resolved.subMinimal || clippedCells.length > 0) {
                losses.push({
                    code: 'layout/table-clipped',
                    detail: {
                        index: ctx.index,
                        columns: widths.slice(),
                        clippedCells: clippedCells.length,
                        cells: clippedCells
                    }
                });
            }

            return { items, losses, height: y, keepTogether: true };
        }

        return { render };
    }
};
