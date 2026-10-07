// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Style-tagged tokenizer + greedy space-breaking for the
 * `md → pdf` bounded typesetter.
 *
 * Bounded exactly as the typesetter's published limits state: break on spaces only, no hyphenation, no
 * justification (left-aligned ragged-right), no widow/orphan control. A
 * single token wider than the column is NOT broken — it is emitted
 * overflowing on a line of its own and the overflow is RECORDED
 * (`layout/line-overflow`, never silently clipped). Two inline styles the
 * drawn bytes cannot carry are recorded the same way, never dropped
 * silently: a struck run (`inline/strike-dropped`, no rule is drawn) and a
 * monospace run that is also bold or italic (`inline/code-emphasis-dropped`,
 * the monospace class wins).
 *
 * Pure module: `dependencies: []`. This module receives
 * the {@link module:oconv/write/pdf/metrics~Measurer Measurer} as a plain
 * function ARGUMENT (not a factory-injected dependency) — the linebreaker
 * stays measurer-agnostic and worker-safe. Consequently the style-class
 * resolution of its sibling `metrics.js`
 * (`styleOfRun`) is re-declared verbatim INSIDE this module's own
 * `factory()`: `oconvPdfMetrics.styleOfRun` only exists on the RESOLVED
 * module instance (built by ITS OWN factory), not as a static export this
 * file could import — and even a static import would trip
 * `fw/no-factory-capture` (a factory may reference only its own parameters
 * and factory-local declarations, never a module-scope binding, so
 * `factory.toString()` stays self-contained for Worker serialization / the
 * `standalone` build). The two implementations are pinned identical by each
 * module's own test suite.
 *
 * Latin script only (v1) — no bidi, no CJK breaking. Bidirectional text,
 * CJK, and other complex-script breaking are not implemented.
 *
 * @module oconv/write/pdf/linebreak
 */

/**
 * Style-tagged tokenizer + greedy line-breaking module descriptor.
 *
 * Public API (`runtime.resolve('oconvPdfLinebreak')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `tokenize(inlines, measurer, sizePt, styleOverride?)` | `Token[]` |
 * | `greedyBreak(tokens, columnPt)` | `{lines: Line[], overflowLines: number}` |
 * | `breakInlines(inlines, measurer, sizePt, columnPt, styleOverride?)` | `{lines: Line[], losses: Loss[]}` |
 * | `lineText(line)` | `string` |
 *
 * @type {{name: string, dependencies: string[], factory: () => object}}
 */
export const oconvPdfLinebreak = {
    name: 'oconvPdfLinebreak',
    dependencies: [],

    factory() {
        /**
         * @typedef {object} Token
         * @property {'word'|'space'} kind
         * @property {string} text
         * @property {string} style One of `oconvPdfMetrics.STYLE_CLASSES`.
         * @property {number} width Advance in points at the paragraph's size.
         * @property {string|null} link The run's link target, or `null`.
         *   Carried so a later text-rendering stage can underline it (v1
         *   renders no underline — the field is kept for that, recorded
         *   nowhere as a loss).
         */

        /**
         * @typedef {object} Line
         * @property {Token[]} tokens Word tokens (inter-word spaces
         *   included, never leading or trailing).
         * @property {number} width Sum of token widths, in points.
         * @property {boolean} overflow `true` when the line is wider than
         *   the column because it holds ONE unbreakable token.
         */

        /**
         * @typedef {object} Loss
         * @property {'layout/line-overflow'|'inline/strike-dropped'|'inline/code-emphasis-dropped'} code
         * @property {{tokens: number, width: number, column: number,
         *   text: string}|{runs: number, text: string}} detail For
         *   `layout/line-overflow`, `text` is the line's rendered text; for
         *   the two `inline/*` codes, `runs` counts the affected runs and
         *   `text` is the first affected run's text. Both truncated to
         *   their first 40 characters.
         */

        /**
         * Map an IR `run` node's style flags onto a style class. Identical
         * to `oconvPdfMetrics`'s own `styleOfRun` (`code` wins, then
         * `bold + italic` collapses to `boldItalic`) — re-declared here,
         * factory-local, per this file's header note.
         *
         * @param {{bold?: boolean, italic?: boolean, code?: boolean}} run
         * @returns {string} One of `oconvPdfMetrics.STYLE_CLASSES`.
         */
        function styleOfRun(run) {
            if (run && run.code) return 'code';
            if (run && run.bold && run.italic) return 'boldItalic';
            if (run && run.bold) return 'bold';
            if (run && run.italic) return 'italic';
            return 'regular';
        }

        /**
         * Flatten IR inline `run` nodes into style-tagged word / space
         * tokens. Any inline that is not a `run` (e.g. an `image`) is
         * skipped — this stage measures text only; image handling is
         * another stage's problem (out of scope for v1).
         *
         * @param {object[]} inlines IR inline nodes — `run` typed, in
         *   practice a paragraph/heading's `children`.
         * @param {object} measurer A `oconvPdfMetrics.createMeasurer()`
         *   instance (`widthOf(text, style, sizePt)`).
         * @param {number} sizePt
         * @param {string} [styleOverride] Forces every token's style class
         *   to this value instead of `styleOfRun(node)` — e.g. `'code'` for
         *   a fenced code block's text, `'italic'` for a blockquote's
         *   default emphasis or an image's alt text.
         * @returns {Token[]}
         */
        function tokenize(inlines, measurer, sizePt, styleOverride) {
            const tokens = [];
            for (const node of inlines || []) {
                if (!node || node.kind !== 'run') continue;
                const style = styleOverride || styleOfRun(node);
                const link = (node.link === undefined) ? null : node.link;
                // Split keeping the separators so run-internal whitespace
                // survives as explicit space tokens (a break opportunity).
                const parts = String(node.text === undefined ? '' : node.text).split(/(\s+)/);
                for (const part of parts) {
                    if (part === '') continue;
                    const kind = /^\s+$/.test(part) ? 'space' : 'word';
                    const text = kind === 'space' ? ' ' : part;
                    tokens.push({ kind, text, style, width: measurer.widthOf(text, style, sizePt), link });
                }
            }
            return tokens;
        }

        /**
         * Greedy line breaking.
         *
         * Algorithm: walk word tokens left to right; a word joins the
         * current line when `currentWidth + pendingSpaceWidth + wordWidth
         * <= columnPt`. Otherwise the line is flushed and the word starts
         * the next one. Leading spaces of a line are dropped; trailing
         * spaces never count toward the line width. The FIRST word of a
         * line always goes on, even when it alone overflows — the typesetter
         * refuses hyphenation, so an unbreakable token has nowhere else to go.
         *
         * @param {Token[]} tokens From {@link tokenize}.
         * @param {number} columnPt Usable column width in points.
         * @returns {{lines: Line[], overflowLines: number}}
         */
        function greedyBreak(tokens, columnPt) {
            /** @type {Line[]} */
            const lines = [];
            /** @type {Token[]} */
            let current = [];
            let width = 0;
            /** @type {Token|null} */
            let pendingSpace = null;
            let overflowLines = 0;

            const flush = () => {
                if (current.length === 0) return;
                const over = width > columnPt;
                if (over) overflowLines += 1;
                lines.push({ tokens: current, width, overflow: over });
                current = [];
                width = 0;
            };

            for (const t of tokens) {
                if (t.kind === 'space') {
                    // Collapse runs of spaces; a space is only material
                    // between two words on the SAME line.
                    if (current.length > 0) pendingSpace = t;
                    continue;
                }
                const gap = pendingSpace ? pendingSpace.width : 0;
                if (current.length === 0) {
                    current.push(t);
                    width = t.width;
                    pendingSpace = null;
                    continue;
                }
                if (width + gap + t.width <= columnPt) {
                    if (pendingSpace) { current.push(pendingSpace); width += gap; }
                    current.push(t);
                    width += t.width;
                    pendingSpace = null;
                } else {
                    flush();
                    current.push(t);
                    width = t.width;
                    pendingSpace = null;
                }
            }
            flush();

            return { lines, overflowLines };
        }

        /**
         * Plain-text rendering of a line.
         *
         * @param {Line} line
         * @returns {string}
         */
        function lineText(line) {
            return line.tokens.map((t) => t.text).join('');
        }

        /**
         * Convenience: tokenize + break one IR paragraph/heading-like
         * node's inline children and record what the drawn bytes cannot
         * carry. Three loss codes, in this order:
         *
         * - `layout/line-overflow` — one record per overflowing line,
         *   `{tokens, width, column, text}`.
         * - `inline/strike-dropped` — ONE record for the block when at
         *   least one `run` has `strike: true`, `{runs, text}`: no
         *   strikethrough rule is drawn, the text is drawn plain.
         * - `inline/code-emphasis-dropped` — ONE record for the block when
         *   at least one `run` has `code: true` together with `bold` or
         *   `italic`, `{runs, text}`: the monospace class wins and the
         *   emphasis is not drawn.
         *
         * The two `inline/*` records describe the runs THEMSELVES —
         * `styleOverride` does not affect them — and record only: the
         * tokens, lines and drawn bytes are exactly what they would be
         * without them. `runs` counts the affected runs; `text` is the
         * first affected run's text truncated to 40 characters.
         *
         * @param {object[]} inlines
         * @param {object} measurer
         * @param {number} sizePt
         * @param {number} columnPt
         * @param {string} [styleOverride]
         * @returns {{lines: Line[], losses: Loss[]}}
         */
        function breakInlines(inlines, measurer, sizePt, columnPt, styleOverride) {
            const tokens = tokenize(inlines, measurer, sizePt, styleOverride);
            const { lines } = greedyBreak(tokens, columnPt);
            const losses = [];
            for (const line of lines) {
                if (!line.overflow) continue;
                losses.push({
                    code: 'layout/line-overflow',
                    detail: {
                        tokens: line.tokens.length,
                        width: line.width,
                        column: columnPt,
                        text: lineText(line).slice(0, 40)
                    }
                });
            }
            // Inline styles the drawn bytes cannot carry: recorded, never
            // dropped silently. Runs only; `styleOverride` is ignored here.
            let struck = 0, codeEmph = 0, struckText = '', codeEmphText = '';
            for (const node of inlines || []) {
                if (!node || node.kind !== 'run') continue;
                if (node.strike === true) { if (!struck) struckText = String(node.text || ''); struck++; }
                if (node.code === true && (node.bold === true || node.italic === true)) {
                    if (!codeEmph) codeEmphText = String(node.text || ''); codeEmph++;
                }
            }
            if (struck) losses.push({ code: 'inline/strike-dropped', detail: { runs: struck, text: struckText.slice(0, 40) } });
            if (codeEmph) losses.push({ code: 'inline/code-emphasis-dropped', detail: { runs: codeEmph, text: codeEmphText.slice(0, 40) } });
            return { lines, losses };
        }

        return { tokenize, greedyBreak, breakInlines, lineText };
    }
};
