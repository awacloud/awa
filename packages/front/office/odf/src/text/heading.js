// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<text:h>` (heading) — paragraph variant
 * carrying an outline level.
 *
 * Model:
 *
 * ```js
 * { type: 'heading', outlineLevel: 1..10, styleName?, runs: [...], _extras? }
 * ```
 *
 * Runs follow the same shape as paragraph runs (see `textParagraph`) —
 * including the `span` emphasis flags and the `link` run kind.
 *
 * `_extras.attrs` carries every `<text:h>` attribute other than
 * `text:style-name` and `text:outline-level` (typed once as `outlineLevel`).
 *
 * Both entry points take an optional trailing `ctx` (the style seam built by
 * `odt`) and forward it verbatim to `textParagraph`; this module adds no
 * style behaviour of its own. Called without `ctx`, behaviour is unchanged.
 *
 * @module odf/text/heading
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { textParagraph } from './paragraph.js';

export const textHeading = {
    name: 'textHeading',
    dependencies: ['xml', 'textParagraph'],
    deps: [xml, textParagraph],

    factory(xml, para) {

        /**
         * Parse a `<text:h>` element into a heading model.
         *
         * @param {object} el
         * @param {object} [ctx] — style seam (a `textStyleRegistry` resolver),
         *   forwarded verbatim to `textParagraph.parseParagraph`.
         * @returns {object}
         */
        function parseHeading(el, ctx) {
            // Re-use paragraph parsing for run extraction, then promote.
            const p = para.parseParagraph(el, ctx);
            const out = { type: 'heading', runs: p.runs };
            if (p.styleName) out.styleName = p.styleName;
            if (p._extras) {
                // The outline level is typed (`outlineLevel`), never carried twice.
                const ex = p._extras;
                if (ex.attrs) {
                    delete ex.attrs['text:outline-level'];
                    if (!Object.keys(ex.attrs).length) delete ex.attrs;
                }
                if (Object.keys(ex).length) out._extras = ex;
            }
            const lvl = el.attrs && el.attrs['text:outline-level'];
            const n = parseInt(lvl, 10);
            out.outlineLevel = (Number.isFinite(n) && n > 0) ? n : 1;
            return out;
        }

        /**
         * Render a heading model to a `<text:h>` element node.
         *
         * @param {object} h
         * @param {object} [ctx] — style seam (a `textStyleRegistry` registry),
         *   forwarded verbatim to `textParagraph.renderParagraph`.
         * @returns {object}
         */
        function renderHeading(h, ctx) {
            const p = { type: 'paragraph', runs: h.runs || [] };
            if (h.styleName) p.styleName = h.styleName;
            if (h._extras) p._extras = h._extras;
            const node = para.renderParagraph(p, ctx);
            node.name = 'text:h';
            node.attrs['text:outline-level'] = String(h.outlineLevel || 1);
            return node;
        }

        /** Build a `{ type: 'heading' }` from a plain string. */
        function heading(textValue, opts) {
            const h = { type: 'heading', outlineLevel: (opts && opts.outlineLevel) || 1, runs: [] };
            if (textValue != null) h.runs.push({ type: 'text', value: String(textValue) });
            if (opts && opts.styleName) h.styleName = opts.styleName;
            return h;
        }

        return { parseHeading, renderHeading, heading };
    }
};
