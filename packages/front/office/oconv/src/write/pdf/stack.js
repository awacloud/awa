// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Flow-block generation + page stacking for the `md → pdf`
 * bounded typesetter, for the four block kinds this module owns
 * (`heading`, `paragraph`, `blockquote`, `hr`) and DELEGATING the other four
 * (`list`, `codeBlock`, `table`, `image`) to the renderer seam, which is
 * frozen — this file is shared by every renderer.
 *
 * Two steps, both pure:
 *
 * 1. {@link flowBlocks} flattens an `oconv-ir/v1` document into a linear
 *    sequence of {@link FlowBlock} records — text blocks carry their broken
 *    `lines` (`ctx.linebreak.breakInlines`), delegated blocks carry
 *    the `items` their renderer produced.
 * 2. {@link stackPages} stacks those boxes into pages under the **hard
 *    page-break rule**: a block that does not fit starts a new page; a block
 *    taller than one page's content height is CLIPPED at the page bottom and
 *    the clip is RECORDED (`layout/block-clipped`), never silent.
 *
 * The typesetter's published limits are law — promises AND refusals. This
 * module keeps the refusals: **no widow/orphan control, no table splitting, no floats, no TOC,
 * no vertical justification**. The heading `keepTogether` flag below is
 * deliberately NOT widow/orphan control — see {@link FlowBlock}.
 *
 * ## Contractual accounting invariant
 *
 * Every DRAWABLE flow block, identified BY INDEX, either placed at least one
 * item or is named by a loss record: `unaccounted(blocks, pages, losses)`
 * returns `[]`. {@link unaccounted} is exported so the invariant is a test
 * oracle, not a comment.
 *
 * ## Determinism
 *
 * Pure functions: no clock, no randomness, no ambient state. Verified
 * end-to-end by a `JSON.stringify` × 2 byte-identity test. The downstream
 * half of the property holds too: `@awacloud/pdf`'s `document/builder.js`
 * reads no clock — its only date handling is the `DATE_INFO` set
 * (`CreationDate` / `ModDate`) applied to CALLER-supplied metadata, and
 * `grep -n 'Date\.now()\|new Date('` over `pdf/src/document/**` returns
 * nothing (the only clock reads in `@awacloud/pdf` live under `src/sig/**`,
 * which the `md → pdf` write path never enters). Measured 2026-09-02.
 *
 * Pure module: `dependencies: []`. Like `./linebreak.js`, everything this
 * module composes with arrives as a CALL-TIME argument on `ctx` — the
 * measurer, the layout, the linebreaker and the renderer dispatcher — so the
 * descriptor stays worker-safe and the factory capture-free
 * (`fw/no-factory-capture`: a factory may reference only its own parameters
 * and factory-local declarations, so `factory.toString()` stays
 * self-contained for Worker serialization and the `standalone` build).
 *
 * @module oconv/write/pdf/stack
 */

/**
 * Flow + page-stacking module descriptor.
 *
 * Public API (`runtime.resolve('oconvPdfStack')`):
 *
 * | Member | Shape |
 * |---|---|
 * | `INDENT_STEP` | `18` — points of indent added per nesting level |
 * | `DELEGATED_KINDS` | `['list','codeBlock','table','image']` (renderer seam) |
 * | `flowBlocks(irDoc, ctx)` | `FlowBlock[]` |
 * | `stackPages(blocks, layout)` | `{pages: Page[], losses: Loss[]}` |
 * | `layoutDocument(irDoc, ctx)` | `{pages: Page[], losses: Loss[], blocks: FlowBlock[]}` |
 * | `laidOutText(pages)` | `string` — oracle helper |
 * | `unaccounted(blocks, pages, losses)` | `string[]` — `[]` when the invariant holds |
 *
 * @type {{name: string, dependencies: string[], factory: () => object}}
 */
export const oconvPdfStack = {
    name: 'oconvPdfStack',
    dependencies: [],

    factory() {
        /**
         * @typedef {object} Ctx
         * @property {object} measurer `oconvPdfMetrics.createMeasurer()`.
         * @property {object} layout `oconvPdfBox.resolveLayout()`.
         * @property {object} linebreak The RESOLVED `oconvPdfLinebreak` API
         *   (`{tokenize, greedyBreak, breakInlines, lineText}`). It arrives
         *   on `ctx` rather than as a declared dependency because this
         *   descriptor is contractually `dependencies: []`:
         *   everything it composes with is a call-time argument.
         * @property {(node: object, childCtx: Ctx) => {items: object[],
         *   losses: object[], height?: number}} render renderer-seam dispatcher for
         *   the four delegated kinds. Called with a CHILD ctx carrying
         *   `index`, `indent` and `kind` for the block being rendered.
         * @property {object[]} losses The single loss SINK. `flowBlocks`
         *   appends to it; `layoutDocument` appends the stacking losses too.
         * @property {number} [indent] Re-entry support (`flowChildren`):
         *   base indent, in points, of the blocks about to be flowed.
         *   Defaults to `0`.
         * @property {string} [indexPrefix] Re-entry support: dotted-path
         *   prefix for the indices of the blocks about to be flowed (a
         *   list item's children under block `3` get `'3.0'`, `'3.1'`, …).
         * @property {number|null} [ruleX] Re-entry support: x of an
         *   enclosing blockquote's left rule, or `null`/absent.
         */

        /**
         * One box in the linear flow. A block carries EITHER `lines` (a text
         * block this module broke itself) or `items` (a delegated block its
         * renderer laid out) — never both.
         *
         * @typedef {object} FlowBlock
         * @property {string} index IR block index in document order, as a
         *   dotted path: `'3'` is the fourth top-level block, `'3.1'` its
         *   second child. Always a STRING so a top-level and a nested index
         *   never collide in a `Set`.
         * @property {string} kind Originating IR kind.
         * @property {object[]} [lines] `oconvPdfLinebreak` `Line[]`.
         * @property {object[]} [items] Renderer items, in BLOCK-LOCAL space
         *   (see {@link flowBlocks}). An item may carry an `xobject`
         *   `{name, w, h}` instead of tokens — a placed image, drawn by
         *   `./render/text.js` as `q w 0 0 h x y cm /name Do Q`; its `y` is
         *   then the distance downward from the block's top edge to the
         *   image's BOTTOM edge, so the stacker's own clip test applies to
         *   it unchanged.
         * @property {number} height BODY height in points — excludes
         *   `spaceBefore` / `spaceAfter`. Total extent is
         *   `spaceBefore + height + spaceAfter`.
         * @property {number} spaceBefore Points of space above the body.
         * @property {number} spaceAfter Points of space below the body.
         * @property {boolean} [keepTogether] Set on headings only. A CHEAP
         *   "no heading alone at the page bottom" rule: if the heading plus
         *   ONE leading line of the next block do not fit, both move to the
         *   next page. This is NOT widow/orphan control (the typesetter refuses that) —
         *   nothing is ever moved because of where a paragraph's lines land.
         * @property {number} indent Left indent in points, added to
         *   `layout.margin` for the text x and subtracted from
         *   `layout.column` for the measuring column.
         * @property {number} sizePt Type size of the block's body.
         * @property {{x: number, width: number}} [rule] A rule to draw with
         *   the block. On an `hr` this is the HORIZONTAL rule: `x` its left
         *   edge, `width` its length, thickness = `height` (0.5 pt). On any
         *   other kind it is an enclosing blockquote's VERTICAL left bar:
         *   `x` its left edge, `width` its thickness (1 pt), spanning the
         *   block's own height (plus the gap to the next quoted block when
         *   that block lands on the same page).
         */

        /**
         * @typedef {object} LaidOutItem
         * @property {number} x Left edge, PDF user space.
         * @property {number} y Text BASELINE (PDF space, origin bottom-left)
         *   for a text item; the rect's BOTTOM edge for a rule item.
         * @property {string} style A `oconvPdfMetrics.STYLE_CLASSES` member —
         *   the dominant (first) style of the line; every token carries its
         *   own `style`, which is what the renderer encodes with.
         * @property {number} sizePt
         * @property {object[]} [tokens] `oconvPdfLinebreak` tokens — always
         *   present (possibly empty) on items this module builds.
         * @property {string} [text] Plain text, when a producer supplies a
         *   pre-rendered string instead of tokens (e.g. a page number).
         * @property {string} [link] Set only when EVERY word token of the
         *   line shares the same non-null link target. v1 draws no link
         *   annotation; the field is carried for a later version.
         * @property {{x: number, y: number, w: number, h: number}} [rule]
         *   A filled rectangle; `y` is its bottom edge.
         * @property {string} index The {@link FlowBlock} index this item
         *   came from. REQUIRED by the accounting invariant — without it
         *   `unaccounted` cannot map items back to blocks.
         * @property {string} kind The originating block kind.
         */

        /**
         * @typedef {object} Page
         * @property {number} number 1-based page number.
         * @property {LaidOutItem[]} items In placement order.
         */

        /** Points of indent added per nesting level (`indent += 18`). */
        const INDENT_STEP = 18;

        /** IR block kinds this module DELEGATES to `ctx.render` (renderer seam). */
        const DELEGATED_KINDS = Object.freeze(['list', 'codeBlock', 'table', 'image']);

        /** Thickness of an `hr`, in points (a fixed 0.5 pt rule). */
        const HR_THICKNESS = 0.5;

        /** Space above AND below an `hr`, in points (12 pt spacing). */
        const HR_SPACE = 12;

        /** Thickness of a blockquote's left rule, in points. */
        const QUOTE_RULE_WIDTH = 1;

        /** Heading `spaceBefore` = this ratio × the heading's own size. */
        const HEADING_SPACE_BEFORE = 1.0;

        /** Heading `spaceAfter` = this ratio × the heading's own size. */
        const HEADING_SPACE_AFTER = 0.5;

        /** Paragraph `spaceAfter` = this ratio × the body size. */
        const PARAGRAPH_SPACE_AFTER = 0.6;

        /**
         * Fraction of the type size assumed BELOW a baseline when a
         * delegated block's height has to be derived from its items (the
         * renderer did not report one). Approximate on purpose — a renderer
         * that cares reports `height`.
         */
        const DESCENDER_RATIO = 0.25;

        /** Slack, in points, absorbing float noise in fit comparisons. */
        const EPSILON = 1e-6;

        /**
         * `oconv: pdf stack needs ctx.<what>` — the ONE ctx-error shape.
         *
         * @param {string} what Missing ctx member.
         * @returns {Error}
         */
        function needsCtx(what) {
            return new Error(`oconv: pdf stack needs ctx.${what}`);
        }

        /**
         * Does a broken line carry ink?
         *
         * @param {object} line
         * @returns {boolean}
         */
        function lineHasInk(line) {
            return (line.tokens || []).some((t) => String(t.text === undefined ? '' : t.text).trim() !== '');
        }

        /**
         * Is a flow block expected to put ink on the page? Used by both the
         * stacker (a block with nothing to draw consumes no vertical space)
         * and the accounting invariant (only drawable blocks must be placed
         * or named).
         *
         * A DELEGATED block always counts as drawable: `list`, `codeBlock`,
         * `table` and `image` are ink-bearing IR kinds by nature, so a
         * renderer that returns zero items without recording a loss is
         * exactly the silent drop the invariant exists to catch.
         *
         * @param {FlowBlock} block
         * @returns {boolean}
         */
        function isDrawable(block) {
            if (block.items) return true;
            if (block.kind === 'hr') return true;
            return (block.lines || []).some(lineHasInk);
        }

        /**
         * Height of the FIRST typographic unit of a block — what a heading's
         * `keepTogether` needs so the heading is never left alone at the
         * bottom of a page.
         *
         * @param {FlowBlock} block
         * @param {object} layout
         * @returns {number} Points, `spaceBefore` included.
         */
        function firstUnitHeight(block, layout) {
            if (!block) return 0;
            let body;
            if (block.lines && block.lines.length > 0) body = layout.leading(block.sizePt);
            else if (block.items && block.items.length > 0) body = Math.min(block.height, layout.leading(block.sizePt));
            else body = block.height;
            return block.spaceBefore + body;
        }

        /**
         * Derive a delegated block's height from its items when the renderer
         * reported none.
         *
         * @param {object[]} items Block-local items.
         * @returns {number} Points.
         */
        function derivedHeight(items) {
            let bottom = 0;
            for (const it of items) {
                const b = it.rule
                    ? it.rule.y + it.rule.h
                    : it.y + DESCENDER_RATIO * (it.sizePt || 0);
                if (b > bottom) bottom = b;
            }
            return bottom;
        }

        /**
         * Flatten an `oconv-ir/v1` document into flow blocks.
         *
         * Production fidelity for the kinds this module owns:
         *
         * | kind | size | spaceBefore | spaceAfter | extra |
         * |---|---|---|---|---|
         * | `heading` | `layout.sizeFor('heading', level)` | 1.0 · size | 0.5 · size | `keepTogether` |
         * | `paragraph` | body | 0 | 0.6 · size | — |
         * | `blockquote` | (children) | — | — | children re-flowed at `indent + 18` with a 1 pt left rule; the runs KEEP their own styles (no italic override) |
         * | `hr` | body | 12 | 12 | 0.5 pt rule across the column |
         *
         * A `heading` or `paragraph` also has its inline children
         * PARTITIONED: the `run`s flow as the text block above, and every inline
         * `image` is delegated in source order right after it, at index
         * `<block>.i<n>`, with the same `indent` and `ruleX`. Before that
         * split, `oconvPdfLinebreak.tokenize` simply skipped a non-`run`
         * inline, so `![alt](x.png)` — which CommonMark always parses at
         * INLINE position — left no item and no loss on the page. An
         * image-only paragraph is not special-cased: it flows an empty text
         * block, which `isDrawable` already treats as ink-free.
         *
         * `list`, `codeBlock`, `table` and `image` go to `ctx.render(node,
         * childCtx)` (renderer seam). **The seam's coordinate contract** — items come
         * back in BLOCK-LOCAL space: `x` is already absolute (the renderer
         * knows `layout.margin` and `ctx.indent`), while `y` is the distance
         * DOWNWARD from the block's top edge — to a text item's baseline, or
         * to a `rule` rect's TOP edge. `stackPages` translates local `y` into
         * PDF space once the block's page position is known. The renderer may
         * report `height`; when it does not, the height is derived from the
         * items' extent.
         *
         * Flow-level losses (line overflow forwarded from the linebreaker,
         * renderer losses, unhandled IR kinds) are appended to `ctx.losses`,
         * each carrying the offending block's `index` and `kind`.
         *
         * @param {object} irDoc `oconv-ir/v1` node with block `children`.
         * @param {Ctx} ctx
         * @returns {FlowBlock[]}
         * @throws {Error} `oconv: pdf stack needs ctx.<member>` when
         *   `layout`, `linebreak`, `losses` or (on a delegated kind)
         *   `render` is missing.
         */
        function flowBlocks(irDoc, ctx) {
            const layout = ctx && ctx.layout;
            if (!layout || typeof layout.leading !== 'function') throw needsCtx('layout');
            const linebreak = ctx.linebreak;
            if (!linebreak || typeof linebreak.breakInlines !== 'function') throw needsCtx('linebreak');
            if (!Array.isArray(ctx.losses)) throw needsCtx('losses');

            const losses = ctx.losses;
            /** @type {FlowBlock[]} */
            const blocks = [];

            /**
             * Build a text flow block, breaking its inlines into lines.
             *
             * @param {object} spec
             * @returns {FlowBlock}
             */
            function textBlock(spec) {
                const columnPt = layout.column - spec.indent;
                const broken = linebreak.breakInlines(spec.inlines || [], ctx.measurer, spec.sizePt, columnPt);
                for (const loss of broken.losses) losses.push({ index: spec.index, kind: spec.kind, ...loss });
                /** @type {FlowBlock} */
                const block = {
                    index: spec.index,
                    kind: spec.kind,
                    lines: broken.lines,
                    height: broken.lines.length * layout.leading(spec.sizePt),
                    spaceBefore: spec.spaceBefore,
                    spaceAfter: spec.spaceAfter,
                    indent: spec.indent,
                    sizePt: spec.sizePt
                };
                if (spec.keepTogether) block.keepTogether = true;
                if (spec.ruleX !== null && spec.ruleX !== undefined) {
                    block.rule = { x: spec.ruleX, width: QUOTE_RULE_WIDTH };
                }
                return block;
            }

            /**
             * Flow one DELEGATED-kind node (`list`, `codeBlock`, `table`,
             * `image`) through `ctx.render` and push the resulting
             * flow block.
             *
             * Extracted from `emit`'s delegated-kind branch VERBATIM so both
             * call sites — a block-position node, and an image lifted out of
             * a text block's inlines — go through exactly one code path.
             * Behaviour for block-level kinds is unchanged.
             *
             * @param {object} node The delegated IR node.
             * @param {string} index Dotted path for this block.
             * @param {number} indent Points.
             * @param {number|null} ruleX Enclosing quote's rule x, or `null`.
             */
            function delegate(node, index, indent, ruleX) {
                const kind = node && node.kind;
                if (typeof ctx.render !== 'function') throw needsCtx('render');
                const childCtx = { ...ctx, index, indent, kind };
                const rendered = ctx.render(node, childCtx) || {};
                const items = rendered.items || [];
                for (const loss of rendered.losses || []) losses.push({ index, kind, ...loss });
                /** @type {FlowBlock} */
                const block = {
                    index, kind, items,
                    height: Number.isFinite(rendered.height) ? rendered.height : derivedHeight(items),
                    spaceBefore: 0,
                    spaceAfter: PARAGRAPH_SPACE_AFTER * layout.sizeFor('paragraph'),
                    indent,
                    sizePt: layout.sizeFor(kind === 'codeBlock' ? 'code' : 'paragraph')
                };
                if (ruleX !== null && ruleX !== undefined) {
                    block.rule = { x: ruleX, width: QUOTE_RULE_WIDTH };
                }
                blocks.push(block);
            }

            /**
             * Split a text block's inline children into the `run`s that flow
             * as text and the `image`s that must be DELEGATED.
             *
             * `oconvPdfLinebreak.tokenize` skips every inline that is not a
             * `run`, so before this split an inline image vanished from the
             * page with no item and NO loss — the silent drop this split closes.
             * Any other inline kind is left out of both lists, exactly as
             * the linebreaker already treated it.
             *
             * @param {object[]} children
             * @returns {{runs: object[], images: object[]}}
             */
            function partitionInlines(children) {
                const list = children || [];
                return {
                    runs: list.filter((c) => c && c.kind === 'run'),
                    images: list.filter((c) => c && c.kind === 'image')
                };
            }

            /**
             * Delegate every inline image of a text block, in source order,
             * AFTER the text block itself. The index is `<block>.i<n>` — the
             * `i` keeps an inline image's path out of the numeric child
             * namespace a `blockquote` or a `listItem` uses, so no two
             * blocks can collide in the accounting invariant's `Set`.
             *
             * The images inherit the text block's own `indent` and `ruleX`:
             * an image inside a quoted paragraph stays inside the quote.
             *
             * A text block left with no runs at all (an image-only
             * paragraph) is NOT special-cased: it flows as an empty text
             * block, which `isDrawable` already treats as ink-free, exactly
             * like today's empty paragraph.
             *
             * @param {object[]} images
             * @param {string} index The owning text block's index.
             * @param {number} indent Points.
             * @param {number|null} ruleX
             */
            function emitInlineImages(images, index, indent, ruleX) {
                images.forEach((img, n) => delegate(img, index + '.i' + n, indent, ruleX));
            }

            /**
             * Flow one IR block node.
             *
             * @param {object} node
             * @param {string} index Dotted path.
             * @param {number} indent Points.
             * @param {number|null} ruleX Enclosing quote's rule x, or `null`.
             */
            function emit(node, index, indent, ruleX) {
                const kind = node && node.kind;
                switch (kind) {
                    case 'heading': {
                        const sizePt = layout.sizeFor('heading', node.level);
                        const split = partitionInlines(node.children);
                        blocks.push(textBlock({
                            index, kind, inlines: split.runs, sizePt, indent,
                            spaceBefore: HEADING_SPACE_BEFORE * sizePt,
                            spaceAfter: HEADING_SPACE_AFTER * sizePt,
                            keepTogether: true, ruleX
                        }));
                        emitInlineImages(split.images, index, indent, ruleX);
                        break;
                    }
                    case 'paragraph': {
                        const sizePt = layout.sizeFor('paragraph');
                        const split = partitionInlines(node.children);
                        blocks.push(textBlock({
                            index, kind, inlines: split.runs, sizePt, indent,
                            spaceBefore: 0,
                            spaceAfter: PARAGRAPH_SPACE_AFTER * sizePt,
                            keepTogether: false, ruleX
                        }));
                        emitInlineImages(split.images, index, indent, ruleX);
                        break;
                    }
                    case 'blockquote': {
                        // The quote itself draws nothing: its children are
                        // re-flowed one indent step in, each carrying the
                        // quote's left rule. Runs KEEP their own styles —
                        // no italic override.
                        const childIndent = indent + INDENT_STEP;
                        const barX = layout.margin + indent;
                        (node.children || []).forEach((kid, i) => {
                            emit(kid, `${index}.${i}`, childIndent, barX);
                        });
                        break;
                    }
                    case 'hr': {
                        const sizePt = layout.sizeFor('paragraph');
                        blocks.push({
                            index, kind, lines: [],
                            height: HR_THICKNESS,
                            spaceBefore: HR_SPACE,
                            spaceAfter: HR_SPACE,
                            indent, sizePt,
                            rule: { x: layout.margin + indent, width: layout.column - indent }
                        });
                        break;
                    }
                    case 'list':
                    case 'codeBlock':
                    case 'table':
                    case 'image':
                        delegate(node, index, indent, ruleX);
                        break;
                    default:
                        losses.push({
                            code: 'layout/unhandled-block',
                            index, kind: String(kind),
                            detail: `IR kind '${kind}' has no flow mapping`
                        });
                }
            }

            const baseIndent = Number.isFinite(ctx.indent) ? ctx.indent : 0;
            const prefix = ctx.indexPrefix === undefined || ctx.indexPrefix === null ? '' : String(ctx.indexPrefix);
            const baseRuleX = ctx.ruleX === undefined ? null : ctx.ruleX;
            ((irDoc && irDoc.children) || []).forEach((node, i) => {
                emit(node, prefix === '' ? String(i) : `${prefix}.${i}`, baseIndent, baseRuleX);
            });
            return blocks;
        }

        /**
         * Stack flow blocks into pages under the hard page-break rule.
         *
         * - A block whose total extent does not fit the remaining space
         *   starts a NEW page (hard break — nothing is split across pages).
         * - A block taller than `layout.contentHeight` cannot fit any page:
         *   it is CLIPPED at the page bottom and a `layout/block-clipped`
         *   loss `{code, index, kind, clippedLines, detail}` is recorded.
         * - A heading with `keepTogether` also requires the first line of
         *   the next block to fit (see {@link FlowBlock}).
         * - Every placed item's baseline (and every rule rect's bottom) lies
         *   in `[layout.margin, layout.pageHeight − layout.margin]`.
         * - A block with nothing to draw consumes no space at all.
         *
         * @param {FlowBlock[]} blocks From {@link flowBlocks}.
         * @param {object} layout `oconvPdfBox.resolveLayout()`.
         * @returns {{pages: Page[], losses: object[]}}
         */
        function stackPages(blocks, layout) {
            /** @type {Page[]} */
            const pages = [];
            /** @type {object[]} */
            const losses = [];
            /** @type {Page} */
            let page = null;
            let cursorY = 0;
            /** Last placed quote bar, extendable over the gap below it. */
            let pendingBar = null;

            const newPage = () => {
                page = { number: pages.length + 1, items: [] };
                pages.push(page);
                cursorY = layout.pageHeight - layout.margin;
                pendingBar = null;
            };
            newPage();

            /**
             * Push one broken line at `baseline`.
             *
             * @param {FlowBlock} block
             * @param {object} line
             * @param {number} baseline
             */
            const pushLine = (block, line, baseline) => {
                const tokens = line.tokens || [];
                const words = tokens.filter((t) => t.kind === 'word');
                const first = words.length > 0 ? words[0].link : null;
                /** @type {LaidOutItem} */
                const item = {
                    x: layout.margin + block.indent,
                    y: baseline,
                    style: tokens.length > 0 ? tokens[0].style : 'regular',
                    sizePt: block.sizePt,
                    tokens,
                    index: block.index,
                    kind: block.kind
                };
                if (first && words.every((t) => t.link === first)) item.link = first;
                page.items.push(item);
            };

            /**
             * Push a filled rectangle whose BOTTOM edge is `bottom`.
             *
             * @param {FlowBlock} block
             * @param {number} x
             * @param {number} w
             * @param {number} bottom
             * @param {number} h
             * @returns {LaidOutItem}
             */
            const pushRect = (block, x, w, bottom, h) => {
                /** @type {LaidOutItem} */
                const item = {
                    x, y: bottom,
                    style: 'regular',
                    sizePt: block.sizePt,
                    tokens: [],
                    index: block.index,
                    kind: block.kind,
                    rule: { x, y: bottom, w, h }
                };
                page.items.push(item);
                return item;
            };

            blocks.forEach((block, i) => {
                if (!isDrawable(block)) return;               // nothing to draw, no space consumed

                const leading = layout.leading(block.sizePt);
                const total = block.spaceBefore + block.height + block.spaceAfter;
                const oversized = total > layout.contentHeight + EPSILON;
                const startedOnPage = page;

                if (oversized) {
                    // Hard page break: taller than a whole page — start clean if we are
                    // not already at the top of one, then clip.
                    if (cursorY < layout.pageHeight - layout.margin - EPSILON) newPage();
                } else {
                    const keep = block.keepTogether ? firstUnitHeight(blocks[i + 1], layout) : 0;
                    if (total + keep > cursorY - layout.margin + EPSILON) newPage();
                }

                // Extend the previous quoted block's bar over the gap when
                // this block continues the same quote on the SAME page.
                if (pendingBar && page === startedOnPage && block.rule
                    && block.kind !== 'hr' && block.rule.x === pendingBar.x) {
                    pendingBar.item.rule.h += pendingBar.gap;
                    pendingBar.item.rule.y -= pendingBar.gap;
                    pendingBar.item.y = pendingBar.item.rule.y;
                }
                pendingBar = null;

                cursorY -= block.spaceBefore;
                const blockTop = cursorY;
                let clipped = 0;

                if (block.kind === 'hr') {
                    cursorY -= block.height;
                    pushRect(block, block.rule.x, block.rule.width, cursorY, block.height);
                } else {
                    // The quote bar goes down FIRST so a renderer draws it
                    // beneath the text it accompanies.
                    let bar = null;
                    if (block.rule) {
                        const h = Math.min(block.height, blockTop - layout.margin);
                        bar = pushRect(block, block.rule.x, block.rule.width, blockTop - h, h);
                    }

                    if (block.lines) {
                        const room = Math.max(0, Math.floor((blockTop - layout.margin) / leading + EPSILON));
                        const keptCount = oversized ? Math.min(block.lines.length, room) : block.lines.length;
                        for (let n = 0; n < keptCount; n += 1) {
                            cursorY -= leading;
                            pushLine(block, block.lines[n], cursorY);
                        }
                        clipped = block.lines.length - keptCount;
                        if (!oversized) cursorY = blockTop - block.height;
                    } else {
                        for (const it of block.items || []) {
                            /** @type {LaidOutItem} */
                            const abs = { ...it };
                            if (it.rule) {
                                abs.rule = { ...it.rule, y: blockTop - it.rule.y - it.rule.h };
                                abs.y = abs.rule.y;
                            } else {
                                abs.y = blockTop - it.y;
                            }
                            if (abs.index === undefined) abs.index = block.index;
                            if (abs.kind === undefined) abs.kind = block.kind;
                            if (abs.tokens === undefined && abs.text === undefined) abs.tokens = [];
                            if (abs.y < layout.margin - EPSILON) { clipped += 1; continue; }
                            page.items.push(abs);
                        }
                        cursorY = Math.max(layout.margin, blockTop - block.height);
                    }

                    if (bar) pendingBar = { item: bar, x: block.rule.x, gap: block.spaceAfter };
                }

                if (clipped > 0) {
                    losses.push({
                        code: 'layout/block-clipped',
                        index: block.index,
                        kind: block.kind,
                        clippedLines: clipped,
                        detail: `block ${block.index} (${block.kind}) is taller than one page: `
                            + `${clipped} unit(s) clipped at the page bottom`
                    });
                }

                cursorY -= block.spaceAfter;
                if (cursorY < layout.margin) cursorY = layout.margin;
            });

            // Drop a trailing page that received nothing.
            while (pages.length > 1 && pages[pages.length - 1].items.length === 0) pages.pop();

            return { pages, losses };
        }

        /**
         * The whole layout pipeline for one IR document: flow, then stack.
         *
         * `ctx.losses` is the SINGLE loss sink — the flow losses are already
         * in it when `flowBlocks` returns, and the stacking losses are
         * appended here. The returned `losses` array is the same set, made
         * available for tests and standalone use: read ONE of the two, never
         * concatenate both.
         *
         * @param {object} irDoc
         * @param {Ctx} ctx
         * @returns {{pages: Page[], losses: object[], blocks: FlowBlock[]}}
         */
        function layoutDocument(irDoc, ctx) {
            if (!Array.isArray(ctx && ctx.losses)) throw needsCtx('losses');
            const before = ctx.losses.length;
            const blocks = flowBlocks(irDoc, ctx);
            const stacked = stackPages(blocks, ctx.layout);
            for (const loss of stacked.losses) ctx.losses.push(loss);
            return { pages: stacked.pages, losses: ctx.losses.slice(before), blocks };
        }

        /**
         * The full text of a laid-out document, in placement order — one
         * line per item (a rule item contributes an empty line).
         *
         * Oracle helper: the round-trip tests compare this stream,
         * whitespace-normalised, with the source document's word stream.
         *
         * @param {Page[]} pages
         * @returns {string}
         */
        function laidOutText(pages) {
            const out = [];
            for (const p of pages) {
                for (const item of p.items) {
                    out.push(item.text === undefined
                        ? (item.tokens || []).map((t) => t.text).join('')
                        : item.text);
                }
            }
            return out.join('\n');
        }

        /**
         * The accounting invariant, as a test oracle: every DRAWABLE flow
         * block either placed at least one item or is named by a loss.
         *
         * A loss names a block through its own `index`, or through
         * `detail.index` (the shape the renderer seam's stubs use).
         *
         * @param {FlowBlock[]} blocks
         * @param {Page[]} pages
         * @param {object[]} losses
         * @returns {string[]} `'<index>:<kind>'` for each unaccounted block —
         *   `[]` when the invariant holds.
         */
        function unaccounted(blocks, pages, losses) {
            const placed = new Set();
            for (const p of pages || []) {
                for (const it of p.items || []) placed.add(String(it.index));
            }
            const named = new Set();
            for (const loss of losses || []) {
                const idx = loss && loss.index !== undefined
                    ? loss.index
                    : (loss && loss.detail && loss.detail.index);
                if (idx !== undefined) named.add(String(idx));
            }
            const out = [];
            for (const block of blocks || []) {
                if (!isDrawable(block)) continue;
                const key = String(block.index);
                if (!placed.has(key) && !named.has(key)) out.push(`${key}:${block.kind}`);
            }
            return out;
        }

        return {
            INDENT_STEP,
            DELEGATED_KINDS,
            flowBlocks,
            stackPages,
            layoutDocument,
            laidOutText,
            unaccounted
        };
    }
};
