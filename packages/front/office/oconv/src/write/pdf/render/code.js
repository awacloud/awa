// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `codeBlock` renderer of the `md → pdf` bounded
 * typesetter — one flow line per SOURCE line, monospace, no
 * wrapping, no syntax colouring (the typesetter's published limits). Its
 * export signature follows the renderer seam contract.
 *
 * ## Layout
 *
 * - Face `code` (Courier / embedded mono), size `layout.sizeFor('code')`
 *   (`layout.codeSize`, 9.5 pt by default), leading `CODE_LEADING_RATIO`
 *   (1.2) × size — a DIFFERENT ratio than `layout.leading()`'s own
 *   `leadingRatio` (1.32 by default), so this module computes its own
 *   leading rather than calling `layout.leading(sizePt)`.
 * - `node.text` is split on `\n` into ONE flow line per SOURCE line — no
 *   word-breaking, no wrapping: the WHOLE line is a single token. A tab
 *   expands to 4 spaces (`\t` → `'    '`) before measuring/emitting. A
 *   single trailing `'\n'` is trimmed first (the fenced-code convention:
 *   `node.text` ends with a newline after the last content line) so a
 *   3-line fence yields exactly 3 items, not 4.
 * - A line wider than the column is emitted OVERFLOWING (never wrapped,
 *   never clipped) and records one `layout/line-overflow` loss — the SAME
 *   code `oconvPdfLinebreak.breakInlines` uses for a paragraph's
 *   unbreakable token, with the same detail shape
 *   `{tokens, width, column, text}` (`tokens: 1`, a code line is always
 *   ONE unbreakable token).
 * - `CODE_SPACE_BEFORE`/`CODE_SPACE_AFTER` (6 pt each) are internal padding
 *   this module bakes into its own `height` and its lines' `y` — distinct
 *   from `stack.js`'s own uniform delegated-kind `spaceAfter`
 *   (`PARAGRAPH_SPACE_AFTER` in `../stack.js`), which is added ON TOP by
 *   the stack, not by this module.
 * - An EMPTY fence (`node.text` reduces to zero source lines) renders
 *   NOTHING and records NO loss — genuinely nothing to
 *   typeset and nothing lost. This is a narrow, deliberate exception to the
 *   general "a delegated kind is always drawable" rule (`stack.js`
 *   `isDrawable`: an empty `items` array from a delegated kind still reads
 *   as drawable, so a hypothetical full-document layout of a document whose
 *   ONLY content is one empty fence would report it unaccounted — this
 *   exact return shape is the module's contract for the case regardless).
 * - `node.info` (the fence's language tag) is read nowhere: the typesetter
 *   renders no syntax colouring, so there is nothing the info string would drive.
 *
 * ## Item attribution (mirrors `render/table.js` / `render/list.js`)
 *
 * Every item carries `index: ctx.index, kind: 'codeBlock'` — this block is
 * a flat leaf (no nested delegated content), so there is no finer index to
 * preserve; using the block's own index on every line also satisfies the
 * stack's accounting invariant trivially (`stack.js` `unaccounted`).
 *
 * ## Renderer seam contract (the interface every renderer implements)
 *
 * ```
 * render(node, childCtx) → { items, losses, height? }
 * ```
 *
 * - `items` come back in BLOCK-LOCAL coordinates: `x` ABSOLUTE, `y` the
 *   distance DOWNWARD from the block's top edge (baseline).
 * - `height` is BODY height only (space AFTER the whole block is added by
 *   the stack, not by this module).
 *
 * A renderer NEVER edits `../../ir-to-pdf.js`: `render` and `flowChildren`
 * are defined there once, for all four kinds. This module does not
 * use `ctx.flowChildren` at all — a code block's text has no inline
 * children to re-flow.
 *
 * Capture-free (`fw/no-factory-capture`), worker-safe.
 *
 * @module oconv/write/pdf/render/code
 */

/**
 * Code-block renderer module descriptor.
 *
 * Public API (`runtime.resolve('oconvPdfRenderCode')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `render(node, ctx)` | `{items: object[], losses: object[], height?: number}` |
 *
 * @type {{name: string, dependencies: string[],
 *         factory: (linebreak: object) => object}}
 */
import { oconvPdfLinebreak } from '../linebreak.js';

export const oconvPdfRenderCode = {
    name: 'oconvPdfRenderCode',
    dependencies: ['oconvPdfLinebreak'],
    deps: [oconvPdfLinebreak],

    factory(linebreak) {
        // Declared so the resolved linebreaker is available here
        // without touching `main.js` or the facade's dependency list — this
        // module's own line-splitting is not `oconvPdfLinebreak`'s job (no
        // word-breaking happens here). Same `void` idiom the sibling stub
        // used (and `oconv.js` before it).
        void linebreak;

        /** This module's OWN leading ratio — deliberately not
         * `layout.leading()`'s (leading 1.2×). */
        const CODE_LEADING_RATIO = 1.2;

        /** Points of internal padding above/below the block's text. */
        const CODE_SPACE_BEFORE = 6;
        const CODE_SPACE_AFTER = 6;

        /** A tab expands to this many spaces before measuring/emitting. */
        const TAB_WIDTH = 4;
        const TAB_EXPANSION = ' '.repeat(TAB_WIDTH);

        /**
         * `node.text` → source lines, trailing newline trimmed, tabs
         * expanded. `''` (nothing, or only the trimmed newline) → `[]`.
         *
         * @param {string} text
         * @returns {string[]}
         */
        function sourceLines(text) {
            let body = text;
            if (body.endsWith('\n')) body = body.slice(0, -1);
            if (body === '') return [];
            return body.split('\n').map((line) => line.split('\t').join(TAB_EXPANSION));
        }

        /**
         * Render one `codeBlock` block: one item per source line, monospace,
         * unwrapped.
         *
         * @param {object} node `oconv-ir/v1` `codeBlock` node
         *   (`{info, text}`).
         * @param {object} ctx Stack child context (see the module header).
         * @returns {{items: object[], losses: object[], height?: number}}
         */
        function render(node, ctx) {
            const layout = ctx.layout;
            const sizePt = layout.sizeFor('code');
            const leadingPt = CODE_LEADING_RATIO * sizePt;
            const x = layout.margin + (Number.isFinite(ctx.indent) ? ctx.indent : 0);
            const columnPt = layout.column - (Number.isFinite(ctx.indent) ? ctx.indent : 0);
            const text = node && typeof node.text === 'string' ? node.text : '';
            const lines = sourceLines(text);

            if (lines.length === 0) return { items: [], losses: [] };

            const items = [];
            const losses = [];
            let y = CODE_SPACE_BEFORE;

            lines.forEach((line) => {
                y += leadingPt;
                const width = ctx.measurer.widthOf(line, 'code', sizePt);
                if (width > columnPt) {
                    losses.push({
                        code: 'layout/line-overflow',
                        detail: {
                            tokens: 1, width, column: columnPt, text: line.slice(0, 40)
                        }
                    });
                }
                items.push({
                    x,
                    y,
                    style: 'code',
                    sizePt,
                    tokens: [{ kind: 'word', text: line, style: 'code', width, link: null }],
                    index: ctx.index,
                    kind: 'codeBlock'
                });
            });

            return { items, losses, height: y + CODE_SPACE_AFTER };
        }

        return { render };
    }
};
