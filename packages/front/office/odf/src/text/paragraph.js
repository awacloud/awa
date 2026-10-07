// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<text:p>`, `<text:span>` and `<text:a>` from
 * ODF content.
 *
 * Paragraph model:
 *
 * ```js
 * { type: 'paragraph', styleName?, runs: [<run>...], _extras? }
 * ```
 *
 * `_extras.attrs` holds every `<text:p>` attribute other than
 * `text:style-name`, verbatim and in read order; `renderParagraph` emits the
 * typed style name first, then those attributes. `_extras.children` holds the
 * untyped inline children (re-emitted after the runs).
 *
 * Run kinds:
 * - `{ type: 'text', value }`                            — bare text
 * - `{ type: 'span', value, styleName?,
 *      bold?, italic?, strike?, monospace?,
 *      runs?, _extras? }`                                — text:span
 * - `{ type: 'space', count }`                           — text:s
 * - `{ type: 'tab' }`                                    — text:tab
 * - `{ type: 'line-break' }`                             — text:line-break
 * - `{ type: 'link', href, runs: [<run>...], _extras? }` — text:a
 * - `{ type: 'image', href, mimeType?, width?, height?, name?, anchorType?, styleName? }` — draw:frame > draw:image (write side; see below)
 * - `{ type: 'element', name, attrs, children }`         — a raw XML element
 *   kept at its position inside a span's `runs`
 *
 * **Span runs** — `value` is the flattened character data of the whole
 * `<text:span>` subtree. When the span has an element child, `runs` lists
 * its children in document order (text, spacing, nested spans, links, and
 * every other element as the raw node at its position); render then emits
 * `runs` and ignores `value`. `_extras.attrs` holds every span attribute
 * other than `text:style-name`.
 *
 * **Image runs** are rendered through `ctx.renderImage(run)` — the sink
 * `odt` builds from `drawFrame`/`drawImage`. Without a sink (`odp`/`ods`
 * callers, standalone render) the run emits nothing, like flags without a
 * registry. On read a `draw:frame` stays in the paragraph's
 * `_extras.children` (untyped) — or, inside a span, a raw element entry of
 * the span's `runs`; `textOf` gives an image run no text.
 *
 * **Emphasis flags** (`bold`/`italic`/`strike`/`monospace`) are booleans and
 * are meaningful on `span` runs only. Precedence on write: an explicit
 * `styleName` always wins; the flags are consulted only when `styleName` is
 * absent. That rule is what makes the read side's *keep-and-gain* shape
 * (a named style keeps its `styleName` **and** gains flags) round-trip
 * idempotently — see `parseInline` / `renderRun` below.
 *
 * **`ctx`** — every parse/render entry point takes an optional trailing
 * `ctx`, the style seam built by `odt` (a `textStyleRegistry` *resolver* on
 * read, a *registry* on write). Called without `ctx` — as `odp`/`ods` do —
 * this module behaves exactly as it did before the seam existed: spans are
 * opaque `styleName` passthrough and flags are ignored on write.
 *
 * Link runs never nest: a `<text:a>` inside a `<text:a>` is preserved raw in
 * the outer link's `_extras.children`.
 *
 * @module odf/text/paragraph
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const textParagraph = {
    name: 'textParagraph',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';

        /** Emphasis flags, in their canonical order. */
        const FLAGS = ['bold', 'italic', 'strike', 'monospace'];

        /**
         * Parse a `<text:span>` into a span run.
         *
         * With a resolver `ctx` and a `text:style-name`, the style is looked
         * up through `ctx.textFlags(styleName)`:
         *
         * - `null` (unresolved / foreign style) → opaque passthrough, exactly
         *   the pre-seam shape: `styleName` kept, no flags.
         * - `source: 'auto'` → the content.xml automatic style is *consumed*:
         *   the truthy flags are gained and `styleName` is DROPPED (the write
         *   side reconstructs an equivalent automatic style from the flags).
         * - `source: 'named'` → *keep-and-gain*: the truthy flags are gained
         *   and `styleName` is KEPT. A `styles.xml` named style is a
         *   document-level resource that may back many spans and is re-emitted
         *   only through the caller's `opts.styles`; dropping the name would
         *   rebind the span to a fresh `awa-t-*` automatic style and orphan
         *   the named style. `renderRun`'s "styleName wins" precedence makes
         *   this idempotent — write re-emits the original binding untouched,
         *   read re-derives the same flags.
         *
         * `value` is always the flattened character data of the whole span
         * subtree (`xml.textContent`). When the span has at least one element
         * child, `runs` additionally lists its children in document order:
         * text, spacing, nested spans (each resolving its own style), links,
         * and every other element kept as the raw XML node at its position.
         * Every attribute other than `text:style-name` is kept verbatim in
         * `_extras.attrs`.
         *
         * @param {object} c `<text:span>` element
         * @param {object} [ctx] style seam (resolver)
         * @param {boolean} [insideLink] when true, a nested `<text:a>` stays a
         *   raw element entry instead of becoming a link run.
         * @returns {object} span run
         */
        function parseSpan(c, ctx, insideLink) {
            const r = { type: 'span', value: xml.textContent(c) };
            const a = c.attrs || {};
            const sn = a['text:style-name'];
            let keepName = !!sn;
            let res = null;
            if (sn && ctx && typeof ctx.textFlags === 'function') {
                res = ctx.textFlags(sn);
                if (res && res.source === 'auto') keepName = false;
            }
            if (keepName) r.styleName = sn;
            if (res) {
                for (const f of FLAGS) if (res[f]) r[f] = true;
            }
            if ((c.children || []).some(k => k.type === 'element')) {
                r.runs = parseInline(c.children, ctx, insideLink, true).runs;
            }
            const attrs = {};
            let anyAttr = false;
            for (const k of Object.keys(a)) {
                if (k === 'text:style-name') continue;
                attrs[k] = a[k];
                anyAttr = true;
            }
            if (anyAttr) r._extras = { attrs };
            return r;
        }

        /**
         * Parse a `<text:a>` into a link run.
         *
         * `xlink:href` becomes `href` (missing → `''`). `xlink:type` is the
         * schema-fixed `'simple'` that `renderRun` always re-emits, so the
         * canonical value is reconstructed rather than stored; any other
         * value — and every other attribute — is preserved verbatim in
         * `_extras.attrs`.
         *
         * @param {object} c `<text:a>` element
         * @param {object} [ctx] style seam
         * @returns {object} link run
         */
        function parseLink(c, ctx) {
            const a = (c && c.attrs) || {};
            const r = { type: 'link', href: a['xlink:href'] || '', runs: [] };
            const attrs = {};
            let anyAttr = false;
            for (const k of Object.keys(a)) {
                if (k === 'xlink:href') continue;
                if (k === 'xlink:type' && a[k] === 'simple') continue;
                attrs[k] = a[k];
                anyAttr = true;
            }
            // A nested <text:a> is illegal in ODF — keep it raw rather than
            // inventing a nested link run.
            const inner = parseInline(c.children, ctx, true);
            r.runs = inner.runs;
            if (anyAttr || inner.extras.length) {
                r._extras = {};
                if (anyAttr) r._extras.attrs = attrs;
                if (inner.extras.length) r._extras.children = inner.extras;
            }
            return r;
        }

        /**
         * Parse an inline child list into runs plus the raw children no run
         * kind covers. Shared by `<text:p>`/`<text:h>` bodies, `<text:a>`
         * bodies and `<text:span>` bodies.
         *
         * @param {Array<object>} children
         * @param {object} [ctx] style seam, forwarded to span/link parsing.
         * @param {boolean} [insideLink] when true, a nested `<text:a>` is not
         *   a link run (it is routed like any other untyped element).
         * @param {boolean} [positional] when true (span bodies), an untyped
         *   element is kept as the raw node at its position in `runs` instead
         *   of being routed to `extras`.
         * @returns {{runs: Array<object>, extras: Array<object>}}
         */
        function parseInline(children, ctx, insideLink, positional) {
            const runs = [];
            const extras = [];
            for (const c of children || []) {
                if (c.type === 'text') {
                    runs.push({ type: 'text', value: c.value });
                } else if (c.type === 'element') {
                    if (c.name === 'text:span') {
                        runs.push(parseSpan(c, ctx, insideLink));
                    } else if (c.name === 'text:s') {
                        const count = parseInt(
                            (c.attrs && c.attrs['text:c']) || '1', 10) || 1;
                        runs.push({ type: 'space', count });
                    } else if (c.name === 'text:tab') {
                        runs.push({ type: 'tab' });
                    } else if (c.name === 'text:line-break') {
                        runs.push({ type: 'line-break' });
                    } else if (c.name === 'text:a' && !insideLink) {
                        runs.push(parseLink(c, ctx));
                    } else if (positional) {
                        runs.push(c);
                    } else {
                        extras.push(c);
                    }
                }
            }
            return { runs, extras };
        }

        /**
         * Parse a `<text:p>` element into a paragraph model.
         *
         * @param {object} el
         * @param {object} [ctx] — style seam (a `textStyleRegistry` resolver).
         *   Without it spans stay opaque `styleName` passthrough.
         * @returns {object}
         */
        function parseParagraph(el, ctx) {
            const out = { type: 'paragraph', runs: [] };
            const a = (el && el.attrs) || {};
            const styleName = a['text:style-name'];
            if (styleName) out.styleName = styleName;

            const attrs = {};
            let anyAttr = false;
            for (const k of Object.keys(a)) {
                if (k === 'text:style-name') continue;
                attrs[k] = a[k];
                anyAttr = true;
            }

            const inline = parseInline(el.children, ctx);
            out.runs = inline.runs;
            if (anyAttr || inline.extras.length) {
                out._extras = {};
                if (anyAttr) out._extras.attrs = attrs;
                if (inline.extras.length) out._extras.children = inline.extras;
            }
            return out;
        }

        /**
         * Render a paragraph model to a `<text:p>` element node.
         *
         * @param {object} p
         * @param {object} [ctx] — style seam (a `textStyleRegistry` registry),
         *   forwarded to every run.
         * @returns {object}
         */
        function renderParagraph(p, ctx) {
            const attrs = {};
            if (p.styleName) attrs['text:style-name'] = p.styleName;
            const extraAttrs = (p._extras && p._extras.attrs) || {};
            for (const k of Object.keys(extraAttrs)) {
                if (k === 'text:style-name') continue;
                attrs[k] = extraAttrs[k];
            }
            const children = [];
            for (const r of p.runs || []) {
                children.push(renderRun(r, ctx));
            }
            if (p._extras && p._extras.children) {
                for (const c of p._extras.children) children.push(c);
            }
            return xml.el('text:p', attrs, children);
        }

        /**
         * Render one run.
         *
         * Span precedence: an explicit `styleName` always wins. Otherwise, if
         * any emphasis flag is set AND a registry `ctx` is available, the
         * style name is allocated through `ctx.textStyle(...)` — which, for a
         * monospace request, also makes the registry declare its `awa-mono`
         * font face; `renderRun` itself emits nothing font-face-specific.
         *
         * **Degrade** — flags with NO `ctx` (standalone render, e.g. the
         * `odp`/`ods` callers) produce a plain unstyled `<text:span>` with the
         * text intact: a standalone render has no style sink to declare the
         * automatic style in, and silently inventing a dangling style name
         * would be worse than dropping the emphasis.
         *
         * **Image runs** delegate to `ctx.renderImage(r)` and are placed at
         * the run's position; with no such sink they emit nothing (an empty
         * text node).
         *
         * @param {object} r
         * @param {object} [ctx] — style seam (registry).
         * @returns {object} XML node
         */
        function renderRun(r, ctx) {
            switch (r.type) {
                case 'text':       return xml.text(r.value || '');
                case 'span': {
                    const a = {};
                    if (r.styleName) {
                        a['text:style-name'] = r.styleName;
                    } else if ((r.bold || r.italic || r.strike || r.monospace)
                        && ctx && typeof ctx.textStyle === 'function') {
                        a['text:style-name'] = ctx.textStyle({
                            bold: !!r.bold,
                            italic: !!r.italic,
                            strike: !!r.strike,
                            monospace: !!r.monospace
                        });
                    }
                    const extraAttrs = (r._extras && r._extras.attrs) || {};
                    for (const k of Object.keys(extraAttrs)) {
                        if (k === 'text:style-name') continue;
                        a[k] = extraAttrs[k];
                    }
                    if (Array.isArray(r.runs)) {
                        const children = [];
                        for (const inner of r.runs) children.push(renderRun(inner, ctx));
                        return xml.el('text:span', a, children);
                    }
                    return xml.el('text:span', a, [xml.text(r.value || '')]);
                }
                case 'space': {
                    const a = {};
                    if (r.count && r.count > 1) a['text:c'] = String(r.count);
                    return xml.el('text:s', a, []);
                }
                case 'tab':         return xml.el('text:tab', {}, []);
                case 'line-break':  return xml.el('text:line-break', {}, []);
                case 'link': {
                    const ex = r._extras || {};
                    const a = {
                        'xlink:type': 'simple',
                        'xlink:href': r.href || '',
                        ...(ex.attrs || {})
                    };
                    const children = [];
                    for (const inner of r.runs || []) {
                        children.push(renderRun(inner, ctx));
                    }
                    for (const c of ex.children || []) children.push(c);
                    return xml.el('text:a', a, children);
                }
                case 'image': return (ctx && typeof ctx.renderImage === 'function') ? ctx.renderImage(r) : xml.text('');
                // A raw XML element kept at its position (span bodies).
                case 'element':    return r;
                default:            return xml.text('');
            }
        }

        /**
         * Concatenate the visible text of a run list (recursing into links and
         * into the `runs` of spans that carry them). A raw `element` entry
         * contributes its character data. An `image` run contributes no text
         * (the switch ignores it, like every other unknown run kind).
         *
         * @param {Array<object>} runs
         * @returns {string}
         */
        function textOfRuns(runs) {
            const out = [];
            for (const r of runs || []) {
                switch (r.type) {
                    case 'text':       out.push(r.value || ''); break;
                    case 'span':
                        out.push(Array.isArray(r.runs) ? textOfRuns(r.runs) : (r.value || ''));
                        break;
                    case 'space':      out.push(' '.repeat(r.count || 1)); break;
                    case 'tab':        out.push('\t'); break;
                    case 'line-break': out.push('\n'); break;
                    case 'link':       out.push(textOfRuns(r.runs)); break;
                    case 'element':    out.push(xml.textContent(r)); break;
                }
            }
            return out.join('');
        }

        /**
         * Concatenate the visible text of a paragraph.
         *
         * @param {object} p
         * @returns {string}
         */
        function textOf(p) {
            return textOfRuns(p.runs);
        }

        /** Build a `{ type: 'paragraph', runs }` from a plain string. */
        function paragraph(textValue, opts) {
            const p = { type: 'paragraph', runs: [] };
            if (textValue != null) p.runs.push({ type: 'text', value: String(textValue) });
            if (opts && opts.styleName) p.styleName = opts.styleName;
            return p;
        }

        return { parseParagraph, renderParagraph, textOf, paragraph, TEXT_NS };
    }
};
