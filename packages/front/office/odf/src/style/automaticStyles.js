// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<office:automatic-styles>` — typed.
 *
 * Found both in `content.xml` and `styles.xml`.
 *
 * Model:
 *
 * ```js
 * {
 *   styles: [
 *     {
 *       name, family,                  // 'paragraph' | 'text' | 'table' | …
 *       parentStyleName?,
 *       properties: {
 *         paragraph?:  { ...flatAttrs },
 *         text?:       { ...flatAttrs },
 *         table?:      { ...flatAttrs },
 *         tableColumn?:{ ...flatAttrs },
 *         tableRow?:   { ...flatAttrs },
 *         tableCell?:  { ...flatAttrs },
 *         graphic?:    { ...flatAttrs }
 *       },
 *       _extras?
 *     }
 *   ],
 *   _extras?
 * }
 * ```
 *
 * Each properties bag is a **flat attribute bag** of `key → string`. The
 * renderer reverses the mapping. Unknown grandchildren are preserved in
 * `_extras.children`.
 *
 * @module odf/style/automaticStyles
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const styleAutomatic = {
    name: 'styleAutomatic',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const PROP_TAGS = {
            'style:paragraph-properties':    'paragraph',
            'style:text-properties':         'text',
            'style:table-properties':        'table',
            'style:table-column-properties': 'tableColumn',
            'style:table-row-properties':    'tableRow',
            'style:table-cell-properties':   'tableCell',
            'style:graphic-properties':      'graphic'
        };

        const TAG_BY_PROP = Object.fromEntries(
            Object.entries(PROP_TAGS).map(([tag, key]) => [key, tag])
        );


        function parseStyle(el) {
            const a = el.attrs || {};
            const out = {
                name: a['style:name'] || '',
                family: a['style:family'] || '',
                properties: {}
            };
            if (a['style:parent-style-name']) out.parentStyleName = a['style:parent-style-name'];
            // Preserve other attrs
            const known = new Set(['style:name', 'style:family', 'style:parent-style-name']);
            const xa = {};
            let anyAttr = false;
            for (const k of Object.keys(a)) {
                if (!known.has(k)) { xa[k] = a[k]; anyAttr = true; }
            }
            const xtraChildren = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                const key = PROP_TAGS[c.name];
                if (key) {
                    out.properties[key] = { ...(c.attrs || {}) };
                } else {
                    xtraChildren.push(c);
                }
            }
            if (anyAttr || xtraChildren.length) {
                out._extras = {};
                if (anyAttr) out._extras.attrs = xa;
                if (xtraChildren.length) out._extras.children = xtraChildren;
            }
            return out;
        }

        function renderStyle(s) {
            const attrs = { 'style:name': s.name || '', 'style:family': s.family || '' };
            if (s.parentStyleName) attrs['style:parent-style-name'] = s.parentStyleName;
            if (s._extras && s._extras.attrs) {
                for (const k of Object.keys(s._extras.attrs)) attrs[k] = s._extras.attrs[k];
            }
            const children = [];
            for (const key of Object.keys(s.properties || {})) {
                const tag = TAG_BY_PROP[key];
                if (!tag) continue;
                children.push(xml.el(tag, { ...(s.properties[key] || {}) }, []));
            }
            if (s._extras && s._extras.children) {
                for (const c of s._extras.children) children.push(c);
            }
            return xml.el('style:style', attrs, children);
        }

        /**
         * Parse an `<office:automatic-styles>` element.
         *
         * @param {object} containerEl
         * @returns {object}
         */
        function parse(containerEl) {
            const out = { styles: [] };
            const extras = [];
            for (const c of containerEl && containerEl.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'style:style') out.styles.push(parseStyle(c));
                else extras.push(c);
            }
            if (extras.length) out._extras = { children: extras };
            return out;
        }

        /**
         * Render the model to an `<office:automatic-styles>` element.
         *
         * @param {object} model
         * @returns {object}
         */
        function render(model) {
            const children = (model && model.styles || []).map(renderStyle);
            if (model && model._extras && model._extras.children) {
                for (const c of model._extras.children) children.push(c);
            }
            return xml.el('office:automatic-styles', {}, children);
        }

        function empty() { return { styles: [] }; }

        return { parse, render, parseStyle, renderStyle, empty, PROP_TAGS };
    }
};
