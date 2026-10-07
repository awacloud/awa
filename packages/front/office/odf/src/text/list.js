// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<text:list>` and `<text:list-item>`.
 *
 * Model:
 *
 * ```js
 * {
 *   type: 'list',
 *   styleName?,
 *   ordered?: boolean,
 *   numFormat?: '1'|'a'|'A'|'i'|'I',
 *   continueNumbering?: boolean,
 *   items: [ { children: [...nodes], _extras? } ],
 *   _extras?
 * }
 * ```
 *
 * Each item's `children` may contain typed paragraphs/headings/lists
 * (typed by the caller via `textContent`), or raw XML element nodes
 * preserved untouched (when used standalone without a content parser
 * binding).
 *
 * **Ordered/numFormat semantics.** `ordered === true` means numbered
 * (`numFormat` one of `'1'|'a'|'A'|'i'|'I'`, default `'1'` when absent);
 * `ordered === false` means bullet, rendered through an emitted bullet
 * style rather than left unstyled; `ordered` absent is the legacy
 * passthrough — parse/render behave exactly as before this field existed.
 *
 * **`ctx` seam.** `parseList`/`renderList` accept an optional trailing
 * `ctx` — the `textStyleRegistry` resolver (read) or registry (write) from
 * `text/style-registry.js`. On parse, a resolvable `text:style-name` is
 * translated into `ordered`/`numFormat`: an `'auto'`-source resolution
 * consumes and drops `styleName`; a `'named'`-source resolution (a
 * `styles.xml` named list style) keeps `styleName` alongside the derived
 * flags (keep-and-gain — the same rationale as `text/paragraph.js`'s span
 * rule: the named style may be referenced elsewhere and is only re-emitted
 * via the caller's `opts.styles`). An unresolvable `styleName` is left
 * untouched, no `ordered` field. On render, an explicit `list.styleName`
 * always wins; only when it is absent and `list.ordered !== undefined`
 * does `ctx.listStyle(...)` allocate/reuse a style name. Without `ctx`
 * (or with a `ctx` that lacks `listStyle` on write / `listNumbering` on
 * read), semantic fields degrade to an unstyled list (documented degrade,
 * mirrors `text/paragraph.js`). `ctx` is forwarded through the internal
 * item/nested-list recursion; each nested list carries its own generated
 * `text:style-name` (legal ODF — a reader resolves each level
 * independently against its own style, never inherited from the parent).
 *
 * @module odf/text/list
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { textParagraph } from './paragraph.js';

export const textList = {
    name: 'textList',
    dependencies: ['xml', 'textParagraph'],
    deps: [xml, textParagraph],

    factory(xml, para) {

        /**
         * Parse a `<text:list>` element.
         *
         * @param {object} el
         * @param {object} [hooks] — `{ parseChild?(el) → node|null }` to
         *   delegate item children (paragraph/heading/nested list) to a
         *   higher-level content parser.
         * @param {object} [ctx] — style seam (`textStyleRegistry` resolver).
         *   Forwarded to nested lists via the internal recursion. See the
         *   fileoverview for the resolution semantics.
         * @returns {object}
         */
        function parseList(el, hooks, ctx) {
            const out = { type: 'list', items: [] };
            const styleName = el.attrs && el.attrs['text:style-name'];
            if (styleName) out.styleName = styleName;
            if (ctx && typeof ctx.listNumbering === 'function' && styleName) {
                const num = ctx.listNumbering(styleName);
                if (num) {
                    out.ordered = num.ordered;
                    if (num.ordered && num.numFormat) out.numFormat = num.numFormat;
                    if (num.source === 'auto') delete out.styleName;
                }
            }
            const cont = el.attrs && el.attrs['text:continue-numbering'];
            if (cont === 'true') out.continueNumbering = true;
            const extras = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'text:list-item') {
                    out.items.push(parseItem(c, hooks, ctx));
                } else if (c.name === 'text:list-header') {
                    out.items.push({ ...parseItem(c, hooks, ctx), header: true });
                } else {
                    extras.push(c);
                }
            }
            if (extras.length) out._extras = { children: extras };
            return out;
        }

        function parseItem(el, hooks, ctx) {
            const item = { children: [] };
            const xtra = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                let node = null;
                if (hooks && typeof hooks.parseChild === 'function') {
                    node = hooks.parseChild(c);
                } else if (c.name === 'text:p') {
                    node = para.parseParagraph(c);
                } else if (c.name === 'text:list') {
                    node = parseList(c, hooks, ctx);
                }
                if (node) item.children.push(node);
                else xtra.push(c);
            }
            if (xtra.length) item._extras = { children: xtra };
            return item;
        }

        /**
         * Render a list model to a `<text:list>` element node.
         *
         * @param {object} list
         * @param {object} [hooks] — `{ renderChild?(node) → xmlNode }`.
         * @param {object} [ctx] — style seam (`textStyleRegistry` registry).
         *   Forwarded to nested lists via the internal recursion. See the
         *   fileoverview for the resolution semantics.
         * @returns {object}
         */
        function renderList(list, hooks, ctx) {
            const attrs = {};
            if (list.styleName) {
                attrs['text:style-name'] = list.styleName;
            } else if (list.ordered !== undefined && ctx && typeof ctx.listStyle === 'function') {
                attrs['text:style-name'] = ctx.listStyle({
                    ordered: !!list.ordered,
                    numFormat: list.numFormat
                });
            }
            if (list.continueNumbering) attrs['text:continue-numbering'] = 'true';
            const items = (list.items || []).map(it => renderItem(it, hooks, ctx));
            if (list._extras && list._extras.children) {
                for (const c of list._extras.children) items.push(c);
            }
            return xml.el('text:list', attrs, items);
        }

        function renderItem(item, hooks, ctx) {
            const children = [];
            for (const node of item.children || []) {
                let xmlNode = null;
                if (hooks && typeof hooks.renderChild === 'function') {
                    xmlNode = hooks.renderChild(node);
                } else if (node && node.type === 'paragraph') {
                    xmlNode = para.renderParagraph(node);
                } else if (node && node.type === 'list') {
                    xmlNode = renderList(node, hooks, ctx);
                } else if (node && node.type === 'element') {
                    xmlNode = node;
                }
                if (xmlNode) children.push(xmlNode);
            }
            if (item._extras && item._extras.children) {
                for (const c of item._extras.children) children.push(c);
            }
            const tag = item.header ? 'text:list-header' : 'text:list-item';
            return xml.el(tag, {}, children);
        }

        return { parseList, renderList };
    }
};
