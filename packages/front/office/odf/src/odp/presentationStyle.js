// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<presentation:placeholder>` and
 * `<presentation:notes>` (basic transition attrs preserved on the slide).
 *
 * Models:
 *
 * ```js
 * // placeholder
 * { type: 'placeholder', objectType?, x?, y?, width?, height?, _extras? }
 *
 * // notes
 * { type: 'notes', styleName?, body: [ ...rawXmlElements ], _extras? }
 * ```
 *
 * `body` is preserved as raw XML elements (paragraphs etc.);
 * `textContent` can type them when needed.
 *
 * @module odf/odp/presentationStyle
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const presentationStyle = {
    name: 'presentationStyle',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {

        /**
         * Parse a `<presentation:placeholder>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parsePlaceholder(el) {
            const out = { type: 'placeholder' };
            const a = el.attrs || {};
            if (a['presentation:object']) out.objectType = a['presentation:object'];
            if (a['svg:x'])      out.x = a['svg:x'];
            if (a['svg:y'])      out.y = a['svg:y'];
            if (a['svg:width'])  out.width = a['svg:width'];
            if (a['svg:height']) out.height = a['svg:height'];
            const known = new Set(['presentation:object', 'svg:x', 'svg:y',
                                   'svg:width', 'svg:height']);
            const xa = {};
            let any = false;
            for (const k of Object.keys(a)) {
                if (!known.has(k)) { xa[k] = a[k]; any = true; }
            }
            if (any) out._extras = { attrs: xa };
            return out;
        }

        /**
         * Render a placeholder model to a `<presentation:placeholder>` node.
         *
         * @param {object} p
         * @returns {object}
         */
        function renderPlaceholder(p) {
            const attrs = {};
            if (p.objectType) attrs['presentation:object'] = p.objectType;
            if (p.x)      attrs['svg:x']      = p.x;
            if (p.y)      attrs['svg:y']      = p.y;
            if (p.width)  attrs['svg:width']  = p.width;
            if (p.height) attrs['svg:height'] = p.height;
            if (p._extras && p._extras.attrs) {
                for (const k of Object.keys(p._extras.attrs)) attrs[k] = p._extras.attrs[k];
            }
            return xml.el('presentation:placeholder', attrs, []);
        }

        /**
         * Parse a `<presentation:notes>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseNotes(el) {
            const out = { type: 'notes', body: [] };
            const a = el.attrs || {};
            if (a['presentation:style-name']) out.styleName = a['presentation:style-name'];
            else if (a['draw:style-name'])    out.styleName = a['draw:style-name'];
            const known = new Set(['presentation:style-name', 'draw:style-name']);
            const xa = {};
            let any = false;
            for (const k of Object.keys(a)) {
                if (!known.has(k)) { xa[k] = a[k]; any = true; }
            }
            for (const c of el.children || []) {
                if (c.type === 'element') out.body.push(c);
            }
            if (any) out._extras = { attrs: xa };
            return out;
        }

        /**
         * Render a notes model to a `<presentation:notes>` node.
         *
         * @param {object} n
         * @returns {object}
         */
        function renderNotes(n) {
            const attrs = {};
            if (n.styleName) attrs['presentation:style-name'] = n.styleName;
            if (n._extras && n._extras.attrs) {
                for (const k of Object.keys(n._extras.attrs)) attrs[k] = n._extras.attrs[k];
            }
            return xml.el('presentation:notes', attrs, (n.body || []).slice());
        }

        return { parsePlaceholder, renderPlaceholder, parseNotes, renderNotes };
    }
};
