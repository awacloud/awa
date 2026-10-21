// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconvOdtToIr` — odt → `oconv-ir/v1` reader (tier 2).
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
 * | `heading` | `heading{level}` | `outlineLevel` is odt's own semantic field (`<text:h>`) — never a style-name heuristic. Clamped to 1–6, loss `heading/level-clamped` above 6. |
 * | `paragraph` | `paragraph` | Runs mapped 1:1 (see below). |
 * | `paragraph` styled `Preformatted_20_Text` (LibreOffice's "Preformatted Text"; or an automatic style whose parent it is) | `codeBlock{info:''}` | CONSECUTIVE such paragraphs form ONE code block, one line each (an empty paragraph is a blank line; a group of empty lines only is skipped); text, `space`, `tab`, `line-break`, spans and links are kept as characters; a raw element or a frame inside records `inline/dropped`. |
 * | `paragraph` styled `Quotations` (or via its automatic style) | `blockquote` of `paragraph`s | CONSECUTIVE such paragraphs form ONE quote (an empty one is skipped); quote nesting is not recoverable. |
 * | `paragraph` styled `Horizontal_20_Line` (or via its automatic style) | `hr` when EMPTY | With content it stays a paragraph. |
 * | `list` | `list{ordered}` | `node.ordered !== undefined` → `{ordered: node.ordered}`, NO loss (a named style's binding is kept and its resolved flag is added — a resolvable content-automatic OR styles.xml named list style, `styleName` present or not). `ordered` absent (foreign/unprovable style) → the legacy bullet fallback, loss `list/numbering-unresolved`. Nesting is real (a `list` inside a `listItem`), not flattened — odt's parser preserves it natively. |
 * | `table` | `table` | Rows/cells mapped 1:1 (see below) — `odt.read()` types a text-body `<table:table>`, so a table is mapped, never dropped. |
 * | `unknown` (any other odt/draw element `odt.read()` didn't type) | — (dropped) | loss `block/dropped`, detail = the raw odf element name. `image/unresolved` instead when the element is `draw:frame`/`draw:image`. |
 * | any other recognised-by-odf type with no IR equivalent (`section`, `soft-page-break`) | — (dropped) | loss `block/dropped`, detail = the corresponding odf element name. |
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
 * | `span` without `runs`, no flags set | `run{text}` (bold/italic/strike/code all `false`) | The style (named or auto) could not be resolved to emphasis flags — loss `run/format-unresolved`, detail = `styleName` or `'(unnamed)'`. |
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
 *   `oconv-ir/v1`'s `table`/`row`/`cell` carry no span props (`ir.js`'s
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
            section: 'text:section',
            'soft-page-break': 'text:soft-page-break'
        };

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
         * node goes through {@link mapBlock}.
         */
        function mapBlocks(nodes, losses) {
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
            for (const n of nodes || []) {
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
                const b = mapBlock(n, losses);
                if (b) out.push(b);
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
         * Map a typed frame run: an image frame becomes an IR `image`; any
         * other frame records `image/unresolved`, and inside a span a frame
         * holding text keeps it as one plain IR run.
         *
         * @param {object} f odt frame run
         * @param {{code:string, detail:string}[]} losses
         * @param {boolean} inSpan
         * @returns {object[]}
         */
        function mapFrameRun(f, losses, inSpan) {
            if (f.child && f.child.kind === 'image') return [imageFromFrame(f, losses)];
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
            if (!(flags.bold || flags.italic || flags.strike || flags.code)) {
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
                case 'text': return [oconvIr.node('run', { text: r.value || '' })];
                case 'span': {
                    if (Array.isArray(r.runs)) return mapSpanRuns(r, losses);
                    const hasFlags = !!(r.bold || r.italic || r.strike || r.monospace);
                    if (hasFlags) {
                        return [oconvIr.node('run', {
                            text: r.value || '',
                            bold: !!r.bold,
                            italic: !!r.italic,
                            strike: !!r.strike,
                            code: !!r.monospace
                        })];
                    }
                    losses.push({
                        code: 'run/format-unresolved',
                        detail: r.styleName || '(unnamed)'
                    });
                    return [oconvIr.node('run', { text: r.value || '' })];
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

        function mapHeading(node, losses) {
            let level = node.outlineLevel || 1;
            if (level > 6) {
                losses.push({ code: 'heading/level-clamped', detail: String(level) });
                level = 6;
            } else if (level < 1) {
                level = 1;
            }
            return oconvIr.node('heading', { level }, mapRuns(node, losses));
        }

        function mapParagraph(node, losses) {
            return oconvIr.node('paragraph', {}, mapRuns(node, losses));
        }

        function mapListItem(item, losses) {
            const children = mapBlocks(item.children, losses);
            const extras = item._extras && item._extras.children;
            if (extras) {
                for (const el of extras) pushDropLoss((el && el.name) || 'unknown', losses);
            }
            return oconvIr.node('listItem', {}, children);
        }

        function mapList(node, losses) {
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
         * Convert an `odt.read(bytes)` result into `oconv-ir/v1`.
         *
         * @param {object} readResult the value of `odt.read(bytes)`
         * @param {object} [_opts] reserved, unused (mirrors `oconvDocxToIr`'s
         *   factory shape for a future shared caller)
         * @returns {{ir: object, losses: {code:string, detail:string}[]}}
         */
        function odtToIr(readResult, _opts) {
            const losses = [];
            if (readResult && readResult.package) packageOf.set(losses, readResult.package);
            const autoStyles = readResult && readResult.autoStyles && readResult.autoStyles.styles;
            if (Array.isArray(autoStyles)) {
                const parents = new Map();
                for (const s of autoStyles) {
                    if (s && s.name && s.parentStyleName) parents.set(s.name, s.parentStyleName);
                }
                autoParentOf.set(losses, parents);
            }
            const body = (readResult && readResult.body) || [];
            return { ir: oconvIr.doc(mapBlocks(body, losses)), losses };
        }

        return { odtToIr };
    }
};
