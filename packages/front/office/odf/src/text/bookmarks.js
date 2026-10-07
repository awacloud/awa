// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Inline bookmark / reference-mark elements found inside
 * paragraphs and headings.
 *
 * Recognised element kinds (`text:` prefix):
 *
 * | Element                     | type                       |
 * |-----------------------------|----------------------------|
 * | `text:bookmark`             | `bookmark`                 |
 * | `text:bookmark-start`       | `bookmark-start`           |
 * | `text:bookmark-end`         | `bookmark-end`             |
 * | `text:reference-mark`       | `reference-mark`           |
 * | `text:reference-mark-start` | `reference-mark-start`     |
 * | `text:reference-mark-end`   | `reference-mark-end`       |
 *
 * Model: `{ type: 'marker', kind, name?, _extras? }`.
 *
 * @module odf/text/bookmarks
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const textBookmarks = {
    name: 'textBookmarks',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const KINDS = new Set([
            'text:bookmark',
            'text:bookmark-start',
            'text:bookmark-end',
            'text:reference-mark',
            'text:reference-mark-start',
            'text:reference-mark-end'
        ]);


        /** @param {string} name */
        function isMarkerName(name) {
            return KINDS.has(name);
        }

        /**
         * Parse a bookmark/reference-mark element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseMarker(el) {
            const out = { type: 'marker', kind: el.name };
            const name = el.attrs && el.attrs['text:name'];
            if (name != null) out.name = name;
            // Preserve extra attributes
            const extra = {};
            let any = false;
            for (const k of Object.keys(el.attrs || {})) {
                if (k !== 'text:name') { extra[k] = el.attrs[k]; any = true; }
            }
            if (any) out._extras = { attrs: extra };
            return out;
        }

        /**
         * Render a marker model to an XML element node.
         *
         * @param {object} m
         * @returns {object}
         */
        function renderMarker(m) {
            const attrs = {};
            if (m.name != null) attrs['text:name'] = m.name;
            if (m._extras && m._extras.attrs) {
                for (const k of Object.keys(m._extras.attrs)) attrs[k] = m._extras.attrs[k];
            }
            return xml.el(m.kind, attrs, []);
        }

        return { isMarkerName, parseMarker, renderMarker, KINDS };
    }
};
