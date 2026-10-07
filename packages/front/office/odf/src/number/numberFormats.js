// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<number:*-style>` (date / time / number /
 * currency / percentage / boolean / text styles).
 *
 * Model:
 *
 * ```js
 * {
 *   formats: [
 *     {
 *       kind,                       // 'date' | 'time' | 'number' | 'currency'
 *                                   //   | 'percentage' | 'boolean' | 'text'
 *       name,
 *       parts: [
 *         { type, attrs, text? }    // type = element local name minus 'number:'
 *       ],
 *       _extras?
 *     }
 *   ]
 * }
 * ```
 *
 * Parts are stored as flat ordered records — the renderer just
 * round-trips them to `<number:<type> ...>text?</number:<type>>`.
 *
 * @module odf/number/numberFormats
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const numberFormats = {
    name: 'numberFormats',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const KIND_TAGS = {
            'number:date-style':       'date',
            'number:time-style':       'time',
            'number:number-style':     'number',
            'number:currency-style':   'currency',
            'number:percentage-style': 'percentage',
            'number:boolean-style':    'boolean',
            'number:text-style':       'text'
        };

        const TAG_BY_KIND = Object.fromEntries(
            Object.entries(KIND_TAGS).map(([tag, kind]) => [kind, tag])
        );


        function parsePart(el) {
            const out = {
                type: el.name.replace(/^number:/, ''),
                attrs: { ...(el.attrs || {}) }
            };
            const t = xml.textContent(el);
            if (t) out.text = t;
            return out;
        }

        function renderPart(part) {
            const tag = `number:${part.type}`;
            const children = [];
            if (part.text != null && part.text !== '') children.push(xml.text(String(part.text)));
            return xml.el(tag, { ...(part.attrs || {}) }, children);
        }

        function parseFormat(el, kind) {
            const out = {
                kind,
                name: (el.attrs && el.attrs['style:name']) || '',
                parts: []
            };
            // Preserve non-name attrs
            const xa = {};
            let any = false;
            for (const k of Object.keys(el.attrs || {})) {
                if (k !== 'style:name') { xa[k] = el.attrs[k]; any = true; }
            }
            const xtraChildren = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name.startsWith('number:')) out.parts.push(parsePart(c));
                else xtraChildren.push(c);
            }
            if (any || xtraChildren.length) {
                out._extras = {};
                if (any) out._extras.attrs = xa;
                if (xtraChildren.length) out._extras.children = xtraChildren;
            }
            return out;
        }

        function renderFormat(fmt) {
            const tag = TAG_BY_KIND[fmt.kind];
            if (!tag) return null;
            const attrs = { 'style:name': fmt.name || '' };
            if (fmt._extras && fmt._extras.attrs) {
                for (const k of Object.keys(fmt._extras.attrs)) attrs[k] = fmt._extras.attrs[k];
            }
            const children = (fmt.parts || []).map(renderPart);
            if (fmt._extras && fmt._extras.children) {
                for (const c of fmt._extras.children) children.push(c);
            }
            return xml.el(tag, attrs, children);
        }

        /**
         * Parse a container element (typically `<office:styles>`) and
         * pluck every `<number:*-style>` child.
         *
         * @param {object} containerEl
         * @returns {object}
         */
        function parse(containerEl) {
            const out = { formats: [] };
            for (const c of containerEl && containerEl.children || []) {
                if (c.type !== 'element') continue;
                const kind = KIND_TAGS[c.name];
                if (kind) out.formats.push(parseFormat(c, kind));
            }
            return out;
        }

        /**
         * Render the model to an **array** of `<number:*-style>` element
         * nodes (caller splices them into a container).
         *
         * @param {object} model
         * @returns {Array<object>}
         */
        function render(model) {
            const out = [];
            for (const f of model && model.formats || []) {
                const x = renderFormat(f);
                if (x) out.push(x);
            }
            return out;
        }

        function empty() { return { formats: [] }; }

        return { parse, render, parseFormat, renderFormat,
                 parsePart, renderPart, empty, KIND_TAGS };
    }
};
