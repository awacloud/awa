// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Inline ODF text fields (`<text:date>`, `<text:page-number>`,
 * variables, references…).
 *
 * Model: `{ type: 'field', kind, value?, attrs, _extras? }` where:
 * - `kind`     — the local element name minus the `text:` prefix
 *                (e.g. `'date'`, `'page-number'`, `'variable-set'`).
 * - `value`    — the rendered text content the field carries, if any.
 * - `attrs`    — preserved attribute bag (key/value strings).
 *
 * @module odf/text/fields
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const textFields = {
    name: 'textFields',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const KINDS = new Set([
            'text:date',
            'text:time',
            'text:page-number',
            'text:page-count',
            'text:author-name',
            'text:title',
            'text:subject',
            'text:keywords',
            'text:file-name',
            'text:variable-set',
            'text:variable-get',
            'text:user-field-get',
            'text:sequence',
            'text:bookmark-ref',
            'text:reference-ref'
        ]);


        function isFieldName(name) { return KINDS.has(name); }

        /**
         * Parse an inline field element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseField(el) {
            const kind = el.name.replace(/^text:/, '');
            const out = { type: 'field', kind, attrs: { ...(el.attrs || {}) } };
            const value = xml.textContent(el);
            if (value) out.value = value;
            // Preserve element-typed children (rare; non-text)
            const extraChildren = [];
            for (const c of el.children || []) {
                if (c.type === 'element') extraChildren.push(c);
            }
            if (extraChildren.length) out._extras = { children: extraChildren };
            return out;
        }

        /**
         * Render a field model to an XML element.
         *
         * @param {object} f
         * @returns {object}
         */
        function renderField(f) {
            const name = `text:${f.kind}`;
            const children = [];
            if (f.value != null && f.value !== '') children.push(xml.text(String(f.value)));
            if (f._extras && f._extras.children) {
                for (const c of f._extras.children) children.push(c);
            }
            return xml.el(name, { ...(f.attrs || {}) }, children);
        }

        return { isFieldName, parseField, renderField, KINDS };
    }
};
