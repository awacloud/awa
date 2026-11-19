// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconvOdtToIr` — odt → `oconv-ir/v2` reader (tier 2).
 *
 * Converts the value of `@awacloud/odf`'s `odt.read(bytes)` into the frozen
 * pivot IR (`../ir/ir.js`), composing `@awacloud/odf`'s public surface only
 * (a HARD design constraint of the pivot). A capability the
 * public surface does not expose is never worked around inside `@awacloud/odf`
 * — it is not available upstream, so the affected element is recorded as an
 * explicit loss on the returned `losses` list.
 *
 * `odt.read()` now types spans, link runs, ordered/bulleted lists and
 * text-body tables (through `@awacloud/odf`'s resolver `ctx` seam,
 * `text/style-registry.js`). This reader picks up every one of those
 * typed signals; nothing here reaches into `@awacloud/odf` internals.
 *
 * ## Mapping (odt body node → IR)
 *
 * | odt `type` | IR node | Notes |
 * |---|---|---|
 * | `heading` | `heading{level}` | `outlineLevel` is odt's own semantic field (`<text:h>`) — never a style-name heuristic. Clamped to 1–6, loss `heading/level-clamped` above 6. Its outline number (`1.3`), from the document's outline style, leads its text (see "Heading outline numbers"). |
 * | `paragraph` | `paragraph` | Runs mapped 1:1 (see below; an empty `text` run or span maps to no inline). An empty one — its runs map to no inline — is a spacer, skipped without a loss wherever blocks are walked (the body, sections, cells, list items), as the docx reader skips it. |
 * | `paragraph` styled `Preformatted_20_Text` (LibreOffice's "Preformatted Text"; or an automatic style whose parent it is) | `codeBlock{info:''}` | CONSECUTIVE such paragraphs form ONE code block, one line each (an empty paragraph is a blank line; a group of empty lines only is skipped); text, `space`, `tab`, `line-break`, spans and links are kept as characters; a raw element or a frame inside records `inline/dropped`. |
 * | `paragraph` styled `Quotations` (or via its automatic style) | `blockquote` of `paragraph`s | CONSECUTIVE such paragraphs form ONE quote (an empty one is skipped); quote nesting is not recoverable. |
 * | `paragraph` styled `Horizontal_20_Line` (or via its automatic style) | `hr` when EMPTY | With content it stays a paragraph. |
 * | `list` | `list{ordered}` | `node.ordered !== undefined` → `{ordered: node.ordered}`, NO loss (a named style's binding is kept and its resolved flag is added — a resolvable content-automatic OR styles.xml named list style, `styleName` present or not). `ordered` absent (foreign/unprovable style) → the legacy bullet fallback, loss `list/numbering-unresolved`. Nesting is real (a `list` inside a `listItem`), not flattened — odt's parser preserves it natively. An item whose first run leads with `☐ ` / `☒ ` (the GFM task marker as oconv's odt writer draws it) reads as `escapes.md.task` `'unchecked'` / `'checked'`, the marker stripped. |
 * | `table` | `table` | Rows/cells mapped 1:1 (see below) — `odt.read()` types a text-body `<table:table>`, so a table is mapped, never dropped. |
 * | `unknown` (any other odt/draw element `odt.read()` didn't type) | — (dropped) | loss `block/dropped`, detail = the raw odf element name. `image/unresolved` instead when the element is `draw:frame`/`draw:image`. |
 * | `unknown` `text:table-of-content`, under `opts.include: ['toc']` | its entries' `paragraph`s, in place | See "Table of contents". NO loss. Without the option, `block/dropped` as any other `unknown`. |
 * | `section` (`text:section`) | its `children`, in place | Mapped as if the section were not there, nested sections too; its name and style are not carried (the IR has no section node). NO loss. |
 * | any other recognised-by-odf type with no IR equivalent (`soft-page-break`) | — (dropped) | loss `block/dropped`, detail = the corresponding odf element name. |
 *
 * ## Table of contents (`opts.include: ['toc']`)
 *
 * A `text:table-of-content` (a raw `unknown` node of the core read) maps,
 * in place, to the paragraphs of its `text:index-body` in document order —
 * its `text:p` / `text:h` children, those of a `text:index-title` too —
 * one IR paragraph each of the text the document shows: text nodes kept,
 * `text:s` its count of spaces, `text:tab` and `text:line-break` a space,
 * any other element walked; whitespace runs collapsed, trimmed; an empty
 * entry skipped. The page numbers are kept; the entry links (to heading
 * bookmarks the IR does not carry) are not. Other indexes stay dropped.
 *
 * ## Heading outline numbers
 *
 * The outline style is the `text:outline-style` raw element of
 * `styles.styles` (else a typed `outline-style` entry of
 * `styles.listStyles`, the large bundle); per level it gives
 * `style:num-format`, `style:num-prefix`, `style:num-suffix`,
 * `text:display-levels` (default 1) and `text:start-value` (default 1). In
 * document order, a heading outside any list whose level has a non-empty
 * format, and which is not `text:is-list-header="true"`, advances its
 * level's counter (from the start value; `text:restart-numbering="true"`
 * restarts it at the heading's `text:start-value`, else the level's) and
 * resets the deeper ones. Its label — the prefix, the counters of its last
 * `display-levels` levels in their formats (`1`, `a`, `A`, `i`, `I`;
 * another format is written as `1`) joined by `.`, the suffix — trimmed,
 * is the heading's first IR run, followed by one space
 * (`1.3 Normative References`), so the Markdown anchor follows it. Any
 * other heading gets no label and leaves the counters as they are; no
 * outline style, no label. NO loss.
 *
 * ## Paragraph / heading run mapping
 *
 * | odt run `type` | IR node | Notes |
 * |---|---|---|
 * | `text` | `run{text}` | Verbatim. |
 * | `space` | `run{text: ' '.repeat(count)}` | |
 * | `tab` | `run{text:'\t'}` | |
 * | `line-break` | `run{text:'\n'}` | |
 * | `span` without `runs`, any of bold/italic/strike/monospace set | `run{text, bold, italic, strike, code: !!monospace}`, NO loss | A named style's binding is kept and its resolved flags are added: a resolvable content-automatic OR styles.xml named style carries these flags — `styleName` may ALSO be present (kept, named case) or absent (dropped, auto case); the reader keys on flag presence, never on `styleName` absence. |
 * | `span` without `runs`, no flags set | `run{text}` (bold/italic/strike/code all `false`) | The style (named or auto) could not be resolved to emphasis flags — loss `run/format-unresolved`, detail = `styleName` or `'(unnamed)'` — unless the style is defined in the document (a `content.xml` automatic style as read, or a `styles.xml` style) and neither it nor a style up its parent chain states an emphasis property (`fo:font-weight`, `fo:font-style`, their `-asian` / `-complex` forms, `style:text-line-through-style` / `-type`): such a style states no emphasis, and the span is read with no loss (T84; a size, a font, a colour, an underline or a script alone, as oconv's docx → odt writes them). |
 * | `span` with `runs` (odf lists the span's inner markup when it has at least one element child) | one IR `run` per mapped inner entry, in document order; the span's own flags are OR-ed onto each, so nested span flags add up | `value` is not used. The span's own `run/format-unresolved` rule is the one above (one loss for this span when it has no flag). `text`/`space`/`tab`/`line-break`/`link` entries map as at paragraph level; a nested `span` maps recursively (its own loss rule applies); a raw element entry follows the field-text rule below. |
 * | `link` | one IR `run` per inner run, each carrying that inner run's own text/flags PLUS `link: href` | `<text:a>` is now a typed paragraph/heading run (no longer routed through `_extras`, see below). An empty/missing `href` emits `link/target-missing` (reusing the pre-existing code — same situation, same code) and every produced run gets `link: null` instead. |
 *
 * The resolution scope behind the two rows above that read resolved style
 * data (span flags and list `ordered`): `odt.read()`
 * resolves a style from content.xml automatic styles OR a fully-mapped
 * `styles.xml` `office:styles` entry (parent-chained or partially-mapped
 * named styles stay unresolved — a known limitation, not a silent
 * approximation; see `text/style-registry.js`'s own "honesty rule"). A style
 * resolvable from neither bucket keeps the legacy opaque-passthrough /
 * fallback behaviour and its existing loss code.
 *
 * Unrecognised inline children of a paragraph/heading (anything
 * `textParagraph`/`textHeading` routes to `_extras.children`, since it isn't
 * `text`/`span`/`space`/`tab`/`line-break`/`link`) are inspected by element
 * name only — no odf internals are touched, `_extras` is itself the
 * documented, stable public shape of the paragraph/heading model. `text:a`
 * never reaches this path: odf types every top-level `<text:a>` into a
 * `link` run (`odf/src/text/paragraph.js`'s `parseInline` pushes it onto
 * `runs` whenever `!insideLink`), so `_extras.children` only ever carries
 * genuinely unrelated markup (a NESTED `<text:a>`, illegal in ODF, is parked
 * raw on the *enclosing link run's own* `_extras`, never here):
 *
 * - `draw:frame` / `draw:image` — an inline image reference left raw (a
 *   result read without `framesInRuns`; `oconv` reads with it, see below).
 *   Resolving it here would mean re-implementing odf's `drawFrame` parser
 *   against raw XML — the "reach into odf internals" this module must not
 *   do. Loss `image/unresolved`; no IR node emitted.
 * - anything else (bookmarks, fields, tracked-change markers, …) — loss
 *   `inline/dropped`, detail = the element name; no IR node emitted.
 *
 * Inside a span with `runs`, odf keeps such an element at its position as
 * a raw entry (`{ type: 'element', name, attrs, children }`) instead. The
 * field-text rule applies to it: when the element holds no text (an empty
 * bookmark, a frame holding an image only) it is handled exactly as above;
 * when it holds text (a field or reference showing `Table 3`, a frame
 * holding a text box) that text — its descendant text nodes concatenated,
 * spacing elements contributing nothing, as in the span's `value` — is kept
 * as one plain IR run carrying the span's flags, and ONE loss is recorded:
 * `image/unresolved` for `draw:frame`/`draw:image`, otherwise
 * `inline/flattened` (detail = the element name: the text is kept, the
 * element's meaning — field, reference, note — is not).
 *
 * A result read with `odt.read(bytes, { elementsInRuns: true })` (what
 * `oconv` itself does, with `framesInRuns`) carries each such untyped
 * element of a paragraph, heading or link body as a raw
 * `{ type: 'element' }` run at its place instead of an `_extras.children`
 * entry; it is mapped by the span field-text rule above — a cross-reference
 * or field showing `4.3` keeps that text in place (`inline/flattened`), an
 * element with no text is handled as in `_extras` (A45a).
 *
 * A list item that holds headings alone (directly, or through nested
 * lists whose items hold headings alone) — how LibreOffice writes a
 * numbered heading, `text:h` in a list item — gives those headings up at
 * their place, the list split around them, without a loss: the docx
 * reader reads a numbered heading as a heading too. Such a heading takes
 * no outline number (it is in a list).
 *
 * A result read with `odt.read(bytes, { notes: true })` (what `oconv`
 * itself does, since 2.0.0) carries each `text:note` as a note run: it
 * reads as the IR `note` at its place (`class` its `noteClass`, `mark` its
 * `label` or `null`, its children the note's body mapped as the body is),
 * so a writer without notes drops it (`note/dropped`) instead of its text
 * running into its paragraph (`inline/flattened`, 1.x). A note inside a
 * code paragraph records `inline/dropped` (detail `text:note`).
 *
 * A result read with `odt.read(bytes, { framesInRuns: true })` (what
 * `oconv` itself does) carries each frame as a `{ type: 'frame' }` run at
 * its place instead. An IMAGE frame becomes an IR `image` there: `name` =
 * the frame's `draw:name`, else the picture path's basename; `alt` = its
 * `svg:title`, else its `svg:desc`; the bytes of the package part it names
 * travel in `escapes.odt` (`{ bytes, contentType }` — the manifest media
 * type, else `null`), which every writer reads after `escapes.docx`; a
 * missing or external part records `image/bytes-unavailable` (the image
 * reference is kept). Span flags never apply to an image, and an image
 * inside a link keeps no target (`inline/dropped`, detail `link-target`).
 * A frame with no content child at all (nothing but its `svg:title` /
 * `svg:desc`: how oconv's odt writer keeps an image it has no bytes for)
 * is an IR `image` without bytes: `name` = its `draw:name`, else `image`,
 * `alt` as above, loss `image/bytes-unavailable`.
 * Any other frame maps like the raw frame above — loss `image/unresolved`
 * (detail `draw:frame`), no IR node, except inside a span where a frame
 * holding text (a text box, a title) keeps that text as one plain IR run.
 *
 * A link run's own untyped children (`_extras.children`: a field, a
 * reference, a bookmark — or, read without `framesInRuns`, a frame inside
 * the `<text:a>`) follow the span field-text rule above, after the link's
 * runs (odf re-emits them there); the text they keep carries the link.
 *
 * ## Table mapping
 *
 * `odt.read()` types a `<table:table>` in the text body: rows
 * carry `header`/`repeated`, cells carry `covered`/`repeated`/`colSpan`/
 * `rowSpan`, and — WITHIN `textContent` only — a non-covered cell's
 * `children` are already the same TYPED body nodes as everywhere else
 * (`textContent.md` "Table cells are typed here"), so this reader recurses
 * them through the same `mapBlock` used for the document body and list
 * items — mirroring `docx-to-ir.js`'s cell convention (cell content reuses
 * the ordinary block loss codes; no cell-specific code exists or is
 * invented here).
 *
 * - **Rows**: the table's own `headerRows` count (odf's `table.js`, the
 *   number of `<table:table-row>` children found under
 *   `<table:table-header-rows>`) marks the first that many ROW ENTRIES
 *   `header: true` — mirroring the render side's own `rows.slice(0,
 *   headerRows)` convention. A row's `repeated` (`table:number-rows-
 *   repeated`) is expanded into that many IR rows, all sharing the same
 *   header status and (freshly mapped, not shared-by-reference) content.
 * - **Cells**: a `covered` cell (`<table:covered-table-cell>` — the
 *   continuation of a colSpan/rowSpan) is skipped — no IR cell is emitted
 *   for it. A cell's `repeated` (`table:number-columns-repeated`) is
 *   expanded into that many IR cells with freshly mapped (not shared) content.
 *   `oconv-ir/v2`'s `table`/`row`/`cell` carry no span props (`ir.js`'s
 *   frozen v1 vocabulary), so a `colSpan`/`rowSpan` beyond the automatic
 *   skip-covered flattens to: the spanning cell's own content is kept, the
 *   covered continuation cells contribute nothing — no dedicated loss code,
 *   since nothing recognisable is dropped (the covered cells carry no
 *   content of their own, `textContent`'s own documented parse rule).
 *
 * @module oconv/read/odt-to-ir
 */

import { oconvIr } from '../ir/ir.js';
import { odt } from '@awacloud/odf';

export const oconvOdtToIr = {
    name: 'oconvOdtToIr',
    dependencies: ['oconvIr', 'odt'],
    deps: [oconvIr, odt],

    factory(oconvIr, odt) {
        // unused-dep guard (referenced for runtime registration only): the
        // factory surface takes an already-produced `odt.read()` result, not
        // `odt` itself — mirrors odf/odt/odt.js's own `void mimetypeMod;`.
        void odt;

        /** odf `textContent` type → its source element name, for loss detail. */
        const TYPE_TO_ELEMENT = {
            'soft-page-break': 'text:soft-page-break'
        };

        /** `nodes` with every `section` replaced by its children, nested ones too. */
        function withoutSections(nodes) {
            const out = [];
            for (const n of nodes || []) {
                if (n && n.type === 'section') out.push(...withoutSections(n.children));
                else out.push(n);
            }
            return out;
        }

        /**
         * @param {string} name odf element name
         * @param {{code:string, detail:string}[]} losses
         */
        function pushDropLoss(name, losses) {
            if (name === 'draw:frame' || name === 'draw:image') {
                losses.push({ code: 'image/unresolved', detail: name });
            } else {
                losses.push({ code: 'block/dropped', detail: name });
            }
        }

        /**
         * Map one odt "extra" inline child (an unrecognised raw xml element
         * from `_extras.children`, or a raw entry of a span's `runs` that
         * holds no text) to an IR run, or `null` when dropped.
         *
         * `text:a` is deliberately NOT handled here: odf types every
         * top-level `<text:a>` into a `link` run now (see the file
         * overview), so this function never observes one in practice.
         */
        function mapExtraInline(el, losses) {
            if (!el || el.type !== 'element') return null;
            if (el.name === 'draw:frame' || el.name === 'draw:image') {
                losses.push({ code: 'image/unresolved', detail: el.name });
                return null;
            }
            losses.push({ code: 'inline/dropped', detail: el.name });
            return null;
        }

        /**
         * Concatenated text of a raw XML node's descendant text nodes, in
         * document order. Spacing elements (`text:s`, `text:tab`,
         * `text:line-break`) have no text child and contribute `''` — the
         * same rule that builds a span's flattened `value`.
         *
         * @param {object} node raw XML node (`element` or `text`)
         * @returns {string}
         */
        function rawText(node) {
            if (!node) return '';
            if (node.type === 'text') return node.value || '';
            if (!Array.isArray(node.children)) return '';
            let s = '';
            for (const c of node.children) s += rawText(c);
            return s;
        }

        /**
         * Map one raw XML element found inside a span's `runs` (a field, a
         * reference, a frame, a bookmark, a note, …). An element with no
         * text goes through `mapExtraInline` (the paragraph-level codes).
         * An element with text keeps that text as one plain IR run and
         * records ONE loss: `image/unresolved` for a frame/image, otherwise
         * `inline/flattened` (the text is kept, the element's meaning is not).
         *
         * @param {object} el raw XML element
         * @param {{code:string, detail:string}[]} losses
         * @returns {object[]}
         */
        function mapSpanElement(el, losses) {
            const t = rawText(el);
            if (t === '') {
                const r = mapExtraInline(el, losses);
                return r ? [r] : [];
            }
            if (el.name === 'draw:frame' || el.name === 'draw:image') {
                losses.push({ code: 'image/unresolved', detail: el.name });
            } else {
                losses.push({ code: 'inline/flattened', detail: el.name });
            }
            return [oconvIr.node('run', { text: t })];
        }

        /**
         * Text of a typed frame run (`odt.read(bytes, { framesInRuns: true })`):
         * the text-box content, then the `svg:title` / `svg:desc` extras —
         * the schema order of a `<draw:frame>`, as `rawText` reads the raw
         * frame.
         *
         * @param {object} f odt frame run
         * @returns {string}
         */
        function frameText(f) {
            let s = '';
            for (const c of (f.child && f.child.children) || []) s += rawText(c);
            for (const c of (f._extras && f._extras.children) || []) s += rawText(c);
            return s;
        }

        /**
         * The package of the `odtToIr` call a `losses` array belongs to
         * (`readResult.package`): image frames take their bytes from it.
         * Keyed by the call's own `losses` array, so the `map*` functions
         * keep their signatures and two calls never share an entry.
         */
        const packageOf = new WeakMap();

        /**
         * `name → parentStyleName` of the call's content automatic styles
         * (`readResult.autoStyles`), keyed like {@link packageOf}: a
         * paragraph whose style is automatic resolves its block style one
         * hop up its parent.
         */
        const autoParentOf = new WeakMap();

        /**
         * `name → { text, parent }` of the call's defined styles (T84): the
         * content automatic styles as read and the `styles.xml` styles and
         * automatic styles, each its text properties and parent; keyed like
         * {@link packageOf}.
         */
        const styleDefsOf = new WeakMap();

        /** The text properties that state an emphasis (bold, italic, strike). */
        const EMPHASIS_KEY = /^(fo:font-weight|fo:font-style|style:font-weight-(asian|complex)|style:font-style-(asian|complex)|style:text-line-through-(style|type))$/;

        /**
         * True when `name` is a defined style and neither it nor a style up
         * its parent chain states an emphasis property (T84): a span of it
         * carries no emphasis, and is not unresolved.
         */
        function statesNoEmphasis(losses, name) {
            const defs = styleDefsOf.get(losses);
            if (!defs || typeof name !== 'string' || !defs.has(name)) return false;
            const seen = new Set();
            for (let n = name; n !== undefined && !seen.has(n); ) {
                seen.add(n);
                const d = defs.get(n);
                if (!d) return seen.size > 1;
                if (Object.keys(d.text).some((k) => EMPHASIS_KEY.test(k))) return false;
                n = d.parent;
            }
            return true;
        }

        /** The defined styles of a read result: its content automatic styles and its `styles.xml` styles. */
        function styleDefs(readResult) {
            const defs = new Map();
            for (const s of (readResult && readResult.autoStyles && readResult.autoStyles.styles) || []) {
                if (s && typeof s.name === 'string') {
                    defs.set(s.name, { text: (s.properties && s.properties.text) || {}, parent: s.parentStyleName });
                }
            }
            const st = readResult && readResult.styles;
            for (const el of [...((st && st.styles) || []), ...((st && st.automaticStyles) || [])]) {
                if (!el || el.type !== 'element' || el.name !== 'style:style') continue;
                const a = el.attrs || {};
                if (typeof a['style:name'] !== 'string' || defs.has(a['style:name'])) continue;
                const tp = (el.children || []).find((c) => c && c.name === 'style:text-properties');
                defs.set(a['style:name'], { text: (tp && tp.attrs) || {}, parent: a['style:parent-style-name'] });
            }
            return defs;
        }

        /** Frozen paragraph-style names (display form, lower-cased) read as blocks. */
        const CODE_STYLES = new Set(['preformatted text']);
        const QUOTE_STYLES = new Set(['quotations']);
        const RULE_STYLES = new Set(['horizontal line']);

        /**
         * `'code'` | `'quote'` | `'rule'` | `null` for one odt body node: a
         * paragraph whose style name (its `_20_` decoded to a space),
         * else its automatic style's parent, is a frozen block style.
         */
        function blockStyleOf(n, losses) {
            if (!n || n.type !== 'paragraph' || !n.styleName) return null;
            const kindOf = (name) => {
                const key = String(name).replace(/_20_/g, ' ').toLowerCase();
                if (CODE_STYLES.has(key)) return 'code';
                if (QUOTE_STYLES.has(key)) return 'quote';
                if (RULE_STYLES.has(key)) return 'rule';
                return null;
            };
            const direct = kindOf(n.styleName);
            if (direct) return direct;
            const parents = autoParentOf.get(losses);
            const parent = parents && parents.get(n.styleName);
            return parent ? kindOf(parent) : null;
        }

        /**
         * Text of a code paragraph's runs: text, spaces (`text:s`), tabs and
         * line breaks kept, spans and links walked; a raw element or a
         * frame inside it records `inline/dropped` (its name).
         */
        function codeTextOf(runs, losses) {
            let s = '';
            for (const r of runs || []) {
                if (!r) continue;
                switch (r.type) {
                    case 'text': s += r.value || ''; break;
                    case 'space': s += ' '.repeat(r.count || 1); break;
                    case 'tab': s += '\t'; break;
                    case 'line-break': s += '\n'; break;
                    case 'span': s += Array.isArray(r.runs) ? codeTextOf(r.runs, losses) : (r.value || ''); break;
                    case 'link': s += codeTextOf(r.runs, losses); break;
                    case 'frame': losses.push({ code: 'inline/dropped', detail: 'draw:frame' }); break;
                    case 'element': losses.push({ code: 'inline/dropped', detail: r.name || 'unknown' }); break;
                    case 'note': losses.push({ code: 'inline/dropped', detail: 'text:note' }); break;
                    default: break;
                }
            }
            return s;
        }

        /**
         * Map a sequence of odt body / cell / item nodes to IR blocks:
         * consecutive code paragraphs form ONE `codeBlock` (one line each,
         * an empty paragraph a blank line; a group of empty lines only is
         * skipped), consecutive quote paragraphs ONE `blockquote` (an
         * empty one skipped), an EMPTY rule paragraph an `hr`; every other
         * node goes through {@link mapBlock}. Outside a list item, a list
         * gives up the headings its items hold alone ({@link liftHeadings}).
         *
         * @param {object[]} nodes
         * @param {{code:string, detail:string}[]} losses
         * @param {boolean} [inItem] The nodes are a list item's content.
         */
        function mapBlocks(nodes, losses, inItem) {
            const out = [];
            let code = null;
            let quote = null;
            const flushCode = () => {
                if (code && code.some((line) => line)) {
                    out.push(oconvIr.node('codeBlock', { info: '', text: code.join('\n') }));
                }
                code = null;
            };
            const flushQuote = () => {
                if (quote && quote.length) out.push(oconvIr.node('blockquote', {}, quote));
                quote = null;
            };
            for (const n of withoutSections(nodes)) {
                const kind = blockStyleOf(n, losses);
                if (kind !== 'code') flushCode();
                if (kind !== 'quote') flushQuote();
                if (kind === 'code') {
                    const extras = (n._extras && n._extras.children) || [];
                    for (const el of extras) losses.push({ code: 'inline/dropped', detail: (el && el.name) || 'unknown' });
                    (code || (code = [])).push(codeTextOf(n.runs, losses));
                    continue;
                }
                if (kind === 'quote' || kind === 'rule') {
                    const inlines = mapRuns(n, losses);
                    if (kind === 'quote') {
                        if (inlines.length) (quote || (quote = [])).push(oconvIr.node('paragraph', {}, inlines));
                    } else {
                        out.push(inlines.length ? oconvIr.node('paragraph', {}, inlines) : oconvIr.node('hr'));
                    }
                    continue;
                }
                const inc = includeOf.get(losses);
                if (inc && inc.has('toc') && n && n.type === 'unknown' && n.element
                        && n.element.name === 'text:table-of-content') {
                    out.push(...mapToc(n.element));
                    continue;
                }
                const b = mapBlock(n, losses);
                // An empty plain paragraph is a spacer, skipped without a
                // loss, as the docx reader skips it.
                if (b && b.kind === 'list' && !inItem) out.push(...liftHeadings(b));
                else if (b && !(b.kind === 'paragraph' && b.children.length === 0)) out.push(b);
            }
            flushCode();
            flushQuote();
            return out;
        }

        /** Text of the first `svg:title` (else `svg:desc`) among a frame's extras. */
        function frameAlt(f) {
            const extras = (f._extras && f._extras.children) || [];
            for (const name of ['svg:title', 'svg:desc']) {
                const el = extras.find((c) => c && c.type === 'element' && c.name === name);
                if (el) return rawText(el);
            }
            return '';
        }

        /**
         * Whether a frame without a typed child holds nothing but its
         * `svg:title` / `svg:desc` (no plugin, applet, floating frame or
         * table among its other children).
         */
        function isEmptyFrame(f) {
            const extras = (f._extras && f._extras.children) || [];
            return extras.every((c) => !c || c.type !== 'element' || c.name === 'svg:title' || c.name === 'svg:desc');
        }

        /**
         * IR `image` for a frame run whose child is an image: `name` = the
         * frame's `draw:name`, else the href basename; `alt` = its title,
         * else its description; the bytes of the package part the href
         * names travel in `escapes.odt` (`{ bytes, contentType }`, the
         * manifest's media type or `null`) — else `image/bytes-unavailable`.
         *
         * @param {object} f odt frame run (`child.kind === 'image'`)
         * @param {{code:string, detail:string}[]} losses
         * @returns {object}
         */
        function imageFromFrame(f, losses) {
            const href = String(f.child.href || '');
            const path = href.replace(/^\.\//, '');
            const name = f.name || path.slice(path.lastIndexOf('/') + 1) || 'image';
            const props = { name, alt: frameAlt(f) };
            const pkg = packageOf.get(losses);
            const bytes = pkg && pkg.parts && Object.prototype.hasOwnProperty.call(pkg.parts, path)
                ? pkg.parts[path] : null;
            if (bytes instanceof Uint8Array) {
                const entry = ((pkg.manifest && pkg.manifest.entries) || [])
                    .find((e) => e && e.fullPath === path);
                props.escapes = { odt: { bytes, contentType: (entry && entry.mediaType) || null } };
            } else {
                losses.push({ code: 'image/bytes-unavailable', detail: name });
            }
            return oconvIr.node('image', props);
        }

        /**
         * Map a typed frame run: an image frame becomes an IR `image`, and
         * so does a frame with no content child (without bytes); any other
         * frame records `image/unresolved`, and inside a span a frame
         * holding text keeps it as one plain IR run.
         *
         * @param {object} f odt frame run
         * @param {{code:string, detail:string}[]} losses
         * @param {boolean} inSpan
         * @returns {object[]}
         */
        function mapFrameRun(f, losses, inSpan) {
            if (f.child && f.child.kind === 'image') return [imageFromFrame(f, losses)];
            if (!f.child && isEmptyFrame(f)) {
                // A frame without a content child: an image whose bytes the
                // writer did not have (oconv's odt writer writes one so).
                const name = f.name || 'image';
                losses.push({ code: 'image/bytes-unavailable', detail: name });
                return [oconvIr.node('image', { name, alt: frameAlt(f) })];
            }
            losses.push({ code: 'image/unresolved', detail: 'draw:frame' });
            const t = inSpan ? frameText(f) : '';
            return t === '' ? [] : [oconvIr.node('run', { text: t })];
        }

        /**
         * Map a span that carries `runs` (its inner markup, in document
         * order) entry by entry. The span's own flags are OR-ed onto every
         * produced IR run, so the flags of nested spans add up. The span's
         * `run/format-unresolved` rule is the same as for a span without
         * `runs`: one loss for THIS span when it carries no flag.
         *
         * @param {object} span odt span run with an array `runs`
         * @param {{code:string, detail:string}[]} losses
         * @returns {object[]}
         */
        function mapSpanRuns(span, losses) {
            const flags = {
                bold: !!span.bold,
                italic: !!span.italic,
                strike: !!span.strike,
                code: !!span.monospace
            };
            if (!(flags.bold || flags.italic || flags.strike || flags.code) && !statesNoEmphasis(losses, span.styleName)) {
                losses.push({
                    code: 'run/format-unresolved',
                    detail: span.styleName || '(unnamed)'
                });
            }
            const out = [];
            for (const entry of span.runs) {
                if (!entry) continue;
                const mapped = entry.type === 'element'
                    ? mapSpanElement(entry, losses)
                    : entry.type === 'frame'
                        ? mapFrameRun(entry, losses, true)
                        : mapRun(entry, losses);
                for (const ir of mapped) {
                    if (ir.kind !== 'run') { out.push(ir); continue; }
                    ir.bold = ir.bold || flags.bold;
                    ir.italic = ir.italic || flags.italic;
                    ir.strike = ir.strike || flags.strike;
                    ir.code = ir.code || flags.code;
                    out.push(ir);
                }
            }
            return out;
        }

        /**
         * Map one odt paragraph/heading run to zero or more IR runs (a
         * `link` run expands to one IR run per inner run it carries; a
         * `span` with `runs` to one IR run per mapped inner entry).
         *
         * @param {object} r odt run
         * @param {{code:string, detail:string}[]} losses
         * @returns {object[]}
         */
        function mapRun(r, losses) {
            switch (r.type) {
                // An empty text maps to no inline (as in the docx reader), so
                // a paragraph of empty runs stays a skipped spacer.
                case 'text': return r.value ? [oconvIr.node('run', { text: r.value })] : [];
                case 'span': {
                    if (Array.isArray(r.runs)) return mapSpanRuns(r, losses);
                    const hasFlags = !!(r.bold || r.italic || r.strike || r.monospace);
                    if (hasFlags) {
                        if (!r.value) return [];
                        return [oconvIr.node('run', {
                            text: r.value || '',
                            bold: !!r.bold,
                            italic: !!r.italic,
                            strike: !!r.strike,
                            code: !!r.monospace
                        })];
                    }
                    if (!statesNoEmphasis(losses, r.styleName)) {
                        losses.push({
                            code: 'run/format-unresolved',
                            detail: r.styleName || '(unnamed)'
                        });
                    }
                    return r.value ? [oconvIr.node('run', { text: r.value })] : [];
                }
                case 'space': return [oconvIr.node('run', { text: ' '.repeat(r.count || 1) })];
                case 'tab': return [oconvIr.node('run', { text: '\t' })];
                case 'line-break': return [oconvIr.node('run', { text: '\n' })];
                case 'link': {
                    const href = r.href;
                    const missing = !href;
                    if (missing) losses.push({ code: 'link/target-missing', detail: 'text:a' });
                    const out = [];
                    for (const inner of r.runs || []) {
                        for (const mapped of mapRun(inner, losses)) {
                            if (mapped.kind === 'run') mapped.link = missing ? null : href;
                            // An IR image has no link prop: its target is lost.
                            else if (!missing) losses.push({ code: 'inline/dropped', detail: 'link-target' });
                            out.push(mapped);
                        }
                    }
                    // The link's own untyped children (a field, a reference,
                    // a bookmark — odf re-emits them after the link's runs):
                    // the span field-text rule, the text carrying the link.
                    for (const el of (r._extras && r._extras.children) || []) {
                        if (!el || el.type !== 'element') continue;
                        for (const mapped of mapSpanElement(el, losses)) {
                            mapped.link = missing ? null : href;
                            out.push(mapped);
                        }
                    }
                    return out;
                }
                case 'frame': return mapFrameRun(r, losses, false);
                case 'element': return mapSpanElement(r, losses);
                // A note (read with odf's `notes`, T82): the IR note, its
                // body mapped as the body is.
                case 'note': return [oconvIr.node('note', {
                    class: r.noteClass === 'endnote' ? 'endnote' : 'footnote',
                    mark: typeof r.label === 'string' && r.label ? r.label : null
                }, mapBlocks(r.body || [], losses))];
                default: return [];
            }
        }

        /** Map an odt paragraph/heading's `runs` + `_extras` to IR inline children. */
        function mapRuns(node, losses) {
            const out = [];
            for (const r of node.runs || []) {
                out.push(...mapRun(r, losses));
            }
            const extras = node._extras && node._extras.children;
            if (extras) {
                for (const el of extras) {
                    const run = mapExtraInline(el, losses);
                    if (run) out.push(run);
                }
            }
            return out;
        }

        /**
         * The outline numbering state of the call a `losses` array belongs
         * to, keyed like {@link packageOf}: `levels[L]` the attributes of
         * the outline style's level L, `counters[L]` the last number given
         * at level L, `listDepth` how many lists enclose the node mapped.
         */
        const outlineOf = new WeakMap();

        /**
         * Per-level attributes of the document's outline style: a raw
         * `text:outline-style` of `styles.styles`, else a typed
         * `outline-style` entry of `styles.listStyles` (the large bundle).
         *
         * @param {object} [styles] the read result's `styles`
         * @returns {object[]|null} attributes by `text:level`, or `null`
         */
        function outlineLevels(styles) {
            if (!styles) return null;
            const raw = (styles.styles || []).find((e) => e && e.type === 'element' && e.name === 'text:outline-style');
            const typed = (styles.listStyles || []).find((e) => e && e.type === 'outline-style');
            const entries = raw
                ? (raw.children || []).filter((c) => c && c.type === 'element' && c.name === 'text:outline-level-style')
                : typed ? typed.levels || [] : null;
            if (!entries) return null;
            const levels = [];
            for (const e of entries) {
                const n = Number(e.attrs && e.attrs['text:level']);
                if (Number.isInteger(n) && n > 0) levels[n] = e.attrs;
            }
            return levels;
        }

        /** A positive integer of a numeric attribute, else `dflt`. */
        function positive(v, dflt) {
            const n = Number(v);
            return Number.isInteger(n) && n > 0 ? n : dflt;
        }

        const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
            [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];

        /** `n` in an ODF `style:num-format`; a format other than these five is `1`. */
        function formatNumber(n, format) {
            if (format === 'a' || format === 'A') {
                let s = '';
                for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
                return format === 'A' ? s.toUpperCase() : s;
            }
            if (format === 'i' || format === 'I') {
                let s = '';
                let k = n;
                for (const [v, r] of ROMAN) while (k >= v) { s += r; k -= v; }
                return format === 'I' ? s.toUpperCase() : s;
            }
            return String(n);
        }

        /**
         * The outline number of a heading of level `level` (`1.3`), or `''`:
         * no outline style, inside a list, a list header, or no format at
         * its level. A numbered heading advances its level's counter (or
         * restarts it) and resets the deeper ones.
         */
        function outlineLabel(node, level, losses) {
            const st = outlineOf.get(losses);
            if (!st || st.listDepth > 0) return '';
            const attrs = (node._extras && node._extras.attrs) || {};
            const own = st.levels[level] || {};
            const format = own['style:num-format'] || '';
            if (format === '' || attrs['text:is-list-header'] === 'true') return '';
            const start = positive(own['text:start-value'], 1);
            st.counters[level] = attrs['text:restart-numbering'] === 'true'
                ? positive(attrs['text:start-value'], start)
                : st.counters[level] === undefined ? start : st.counters[level] + 1;
            st.counters.length = level + 1;
            const shown = Math.min(positive(own['text:display-levels'], 1), level);
            const parts = [];
            for (let k = level - shown + 1; k <= level; k++) {
                const at = st.levels[k] || {};
                parts.push(formatNumber(st.counters[k] ?? positive(at['text:start-value'], 1), at['style:num-format'] || '1'));
            }
            return ((own['style:num-prefix'] || '') + parts.join('.') + (own['style:num-suffix'] || '')).trim();
        }

        function mapHeading(node, losses) {
            const label = outlineLabel(node, node.outlineLevel || 1, losses);
            let level = node.outlineLevel || 1;
            if (level > 6) {
                losses.push({ code: 'heading/level-clamped', detail: String(level) });
                level = 6;
            } else if (level < 1) {
                level = 1;
            }
            const runs = mapRuns(node, losses);
            if (label) runs.unshift(oconvIr.node('run', { text: label + ' ' }));
            return oconvIr.node('heading', { level }, runs);
        }

        function mapParagraph(node, losses) {
            return oconvIr.node('paragraph', {}, mapRuns(node, losses));
        }

        /**
         * The headings a list item holds alone — headings, or nested lists
         * each of whose items holds only headings — else `null`.
         */
        function headingsOf(item) {
            const hs = [];
            for (const c of item.children || []) {
                if (c.kind === 'heading') { hs.push(c); continue; }
                if (c.kind !== 'list') return null;
                for (const it of c.children) {
                    const h = headingsOf(it);
                    if (!h) return null;
                    hs.push(...h);
                }
            }
            return hs.length ? hs : null;
        }

        /**
         * A list whose items hold a heading alone (LibreOffice's numbered
         * heading, `text:h` in a list item) gives those headings up at
         * their place, the list split around them, without a loss: the
         * docx reader reads a numbered heading as a heading too.
         */
        function liftHeadings(list) {
            if (!list.children.some((it) => headingsOf(it))) return [list];
            const out = [];
            let items = [];
            const flush = () => {
                if (items.length) out.push({ ...list, children: items });
                items = [];
            };
            for (const it of list.children) {
                const hs = headingsOf(it);
                if (hs) { flush(); out.push(...hs); } else items.push(it);
            }
            flush();
            return out;
        }

        function mapListItem(item, losses) {
            const children = mapBlocks(item.children, losses, true);
            const extras = item._extras && item._extras.children;
            if (extras) {
                for (const el of extras) pushDropLoss((el && el.name) || 'unknown', losses);
            }
            return listItemNode(children);
        }

        /**
         * IR `listItem` of `children`. A first paragraph whose first run is
         * a text run (no link, no code) leading with a GFM task marker as
         * oconv's writers draw it — `☐ ` (U+2610) / `☒ ` (U+2612), the glyph
         * then one space — reads as `escapes.md.task`, the marker stripped
         * (the run dropped when nothing is left). Anything else stays text.
         */
        function listItemNode(children) {
            const markers = { '☐ ': 'unchecked', '☒ ': 'checked' };
            const first = children[0];
            const run = first && first.kind === 'paragraph' && first.children ? first.children[0] : null;
            const lead = run && run.kind === 'run' && typeof run.text === 'string' && !run.link && !run.code
                ? run.text.slice(0, 2) : '';
            if (!Object.hasOwn(markers, lead)) return oconvIr.node('listItem', {}, children);
            const rest = run.text.slice(2);
            const runs = rest ? [{ ...run, text: rest }, ...first.children.slice(1)] : first.children.slice(1);
            return oconvIr.node('listItem', { escapes: { md: { task: markers[lead] } } },
                [{ ...first, children: runs }, ...children.slice(1)]);
        }

        function mapList(node, losses) {
            const st = outlineOf.get(losses);
            if (st) st.listDepth++;
            try {
                return mapListItems(node, losses);
            } finally {
                if (st) st.listDepth--;
            }
        }

        function mapListItems(node, losses) {
            if (node.ordered !== undefined) {
                const items = (node.items || []).map((it) => mapListItem(it, losses));
                return oconvIr.node('list', { ordered: node.ordered }, items);
            }
            losses.push({
                code: 'list/numbering-unresolved',
                detail: node.styleName || '(unstyled)'
            });
            const items = (node.items || []).map((it) => mapListItem(it, losses));
            return oconvIr.node('list', { ordered: false }, items);
        }

        /** Map one odt table cell's typed `children` to IR cell content. */
        function mapCell(cell, losses) {
            return oconvIr.node('cell', {}, mapBlocks(cell.children, losses));
        }

        /**
         * Map one odt table row to 1+ IR rows (expanding `row.repeated`),
         * skipping `covered` cells and expanding a cell's own `repeated`.
         */
        function mapRow(row, isHeader, losses) {
            function buildCells() {
                const cells = [];
                for (const cell of row.cells || []) {
                    if (cell.covered) continue;
                    const repeat = cell.repeated && cell.repeated > 1 ? cell.repeated : 1;
                    for (let i = 0; i < repeat; i++) cells.push(mapCell(cell, losses));
                }
                return cells;
            }
            const repeat = row.repeated && row.repeated > 1 ? row.repeated : 1;
            const out = [];
            for (let i = 0; i < repeat; i++) {
                out.push(oconvIr.node('row', { header: isHeader }, buildCells()));
            }
            return out;
        }

        /** Map an odt `table` node (odf's typed table model) to an IR table. */
        function mapTable(node, losses) {
            const headerCount = node.headerRows || 0;
            const rows = [];
            (node.rows || []).forEach((row, idx) => {
                rows.push(...mapRow(row, idx < headerCount, losses));
            });
            return oconvIr.node('table', {}, rows);
        }

        /** The parts `opts.include` may bring back (A45b). */
        const INCLUDE_NAMES = new Set(['toc']);

        /**
         * `undefined` reads as nothing included; otherwise an array of
         * distinct names of `INCLUDE_NAMES`, else throws `oconv: bad odt
         * include`.
         *
         * @param {*} v
         * @returns {Set<string>}
         * @throws {Error} `oconv: bad odt include`
         */
        function includeSet(v) {
            if (v === undefined) return new Set();
            if (!Array.isArray(v) || new Set(v).size !== v.length
                    || !v.every((n) => typeof n === 'string' && INCLUDE_NAMES.has(n))) {
                throw new Error('oconv: bad odt include');
            }
            return new Set(v);
        }

        /** The `opts.include` set of the call, keyed like {@link packageOf}. */
        const includeOf = new WeakMap();

        /**
         * Text of one index-body entry as the document shows it: text kept,
         * `text:s` its count of spaces, `text:tab` and `text:line-break` a
         * space, any other element walked; whitespace runs collapsed, trimmed.
         */
        function entryText(el) {
            const walk = (n) => {
                if (!n) return '';
                if (n.type === 'text') return n.value || '';
                if (n.type !== 'element') return '';
                if (n.name === 'text:s') return ' '.repeat(Math.max(1, Number((n.attrs && n.attrs['text:c']) || 1) || 1));
                if (n.name === 'text:tab' || n.name === 'text:line-break') return ' ';
                return (n.children || []).map(walk).join('');
            };
            return walk(el).replace(/\s+/g, ' ').trim();
        }

        /**
         * The paragraphs of a `text:table-of-content`'s `text:index-body`, in
         * document order (an index title's too), one IR paragraph each; an
         * empty entry skipped; the entry links are not kept.
         */
        function mapToc(el) {
            const out = [];
            const body = (el.children || []).find((c) => c && c.type === 'element' && c.name === 'text:index-body');
            const walk = (n) => {
                for (const c of (n && n.children) || []) {
                    if (!c || c.type !== 'element') continue;
                    if (c.name === 'text:p' || c.name === 'text:h') {
                        const t = entryText(c);
                        if (t) out.push(oconvIr.node('paragraph', {}, [oconvIr.node('run', { text: t })]));
                    } else if (c.name === 'text:index-title') {
                        walk(c);
                    }
                }
            };
            walk(body);
            return out;
        }

        /** Map one odt body/cell/item node to an IR block, or `null` when dropped. */
        function mapBlock(node, losses) {
            if (!node) return null;
            switch (node.type) {
                case 'heading': return mapHeading(node, losses);
                case 'paragraph': return mapParagraph(node, losses);
                case 'list': return mapList(node, losses);
                case 'table': return mapTable(node, losses);
                case 'unknown': {
                    const name = (node.element && node.element.name) || 'unknown';
                    pushDropLoss(name, losses);
                    return null;
                }
                default:
                    pushDropLoss(TYPE_TO_ELEMENT[node.type] || String(node.type), losses);
                    return null;
            }
        }

        /**
         * Convert an `odt.read(bytes)` result into `oconv-ir/v2`.
         *
         * @param {object} readResult the value of `odt.read(bytes)`
         * @param {{include?: string[]}} [opts] `include` — the opt-in parts
         *   read back: `'toc'` (a table of contents' entries as paragraphs,
         *   see "Table of contents"); an array of distinct known names, else
         *   `oconv: bad odt include`; absent or `[]`, every result unchanged
         * @returns {{ir: object, losses: {code:string, detail:string}[]}}
         * @throws {Error} `oconv: bad odt include`
         */
        function odtToIr(readResult, opts) {
            const include = includeSet(opts && opts.include);
            const losses = [];
            if (include.size) includeOf.set(losses, include);
            if (readResult && readResult.package) packageOf.set(losses, readResult.package);
            const autoStyles = readResult && readResult.autoStyles && readResult.autoStyles.styles;
            if (Array.isArray(autoStyles)) {
                const parents = new Map();
                for (const s of autoStyles) {
                    if (s && s.name && s.parentStyleName) parents.set(s.name, s.parentStyleName);
                }
                autoParentOf.set(losses, parents);
            }
            styleDefsOf.set(losses, styleDefs(readResult));
            const levels = outlineLevels(readResult && readResult.styles);
            if (levels) outlineOf.set(losses, { levels, counters: [], listDepth: 0 });
            const body = (readResult && readResult.body) || [];
            return { ir: oconvIr.doc(mapBlocks(body, losses)), losses };
        }

        return { odtToIr };
    }
};
