// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<text:section>`.
 *
 * Model:
 *
 * ```js
 * { type: 'section', name, styleName?, children: [...nodes], _extras? }
 * ```
 *
 * Section children may be typed nodes (when wired through
 * `textContent`) or raw XML element nodes preserved untouched.
 *
 * @module odf/text/section
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const textSection = {
    name: 'textSection',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {

        /**
         * Parse a `<text:section>` element.
         *
         * @param {object} el
         * @param {object} [hooks] — `{ parseChild?(el) → node|null }`.
         * @returns {object}
         */
        function parseSection(el, hooks) {
            const out = {
                type: 'section',
                name: (el.attrs && el.attrs['text:name']) || '',
                children: []
            };
            const sn = el.attrs && el.attrs['text:style-name'];
            if (sn) out.styleName = sn;
            // Preserve other attributes
            const xtraAttrs = {};
            let anyAttr = false;
            for (const k of Object.keys(el.attrs || {})) {
                if (k !== 'text:name' && k !== 'text:style-name') {
                    xtraAttrs[k] = el.attrs[k]; anyAttr = true;
                }
            }
            const xtraChildren = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                let node = null;
                if (hooks && typeof hooks.parseChild === 'function') {
                    node = hooks.parseChild(c);
                }
                if (node) out.children.push(node);
                else out.children.push(c); // opaque element passthrough
            }
            if (anyAttr || xtraChildren.length) {
                out._extras = {};
                if (anyAttr) out._extras.attrs = xtraAttrs;
                if (xtraChildren.length) out._extras.children = xtraChildren;
            }
            return out;
        }

        /**
         * Render a section model to a `<text:section>` element node.
         *
         * @param {object} sec
         * @param {object} [hooks] — `{ renderChild?(node) → xmlNode }`.
         * @returns {object}
         */
        function renderSection(sec, hooks) {
            const attrs = { 'text:name': sec.name || '' };
            if (sec.styleName) attrs['text:style-name'] = sec.styleName;
            if (sec._extras && sec._extras.attrs) {
                for (const k of Object.keys(sec._extras.attrs)) attrs[k] = sec._extras.attrs[k];
            }
            const children = [];
            for (const node of sec.children || []) {
                if (node && node.type === 'element') { children.push(node); continue; }
                let x = null;
                if (hooks && typeof hooks.renderChild === 'function') x = hooks.renderChild(node);
                if (x) children.push(x);
            }
            if (sec._extras && sec._extras.children) {
                for (const c of sec._extras.children) children.push(c);
            }
            return xml.el('text:section', attrs, children);
        }

        return { parseSection, renderSection };
    }
};
