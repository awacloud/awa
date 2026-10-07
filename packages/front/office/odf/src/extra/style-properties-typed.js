// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed `style:*-properties` attribute bags.
 *
 * Promotes a curated subset of attributes on each `style:*-properties`
 * element into typed fields. Unknown attributes are preserved verbatim
 * via the `attrs` carry-bag.
 *
 * Recognised properties elements :
 *   style:paragraph-properties, style:text-properties,
 *   style:graphic-properties, style:section-properties,
 *   style:ruby-properties, style:table-properties,
 *   style:table-column-properties, style:table-row-properties,
 *   style:table-cell-properties, style:chart-properties,
 *   style:drawing-page-properties, style:list-level-properties,
 *   style:list-level-label-alignment, style:tab-stops, style:tab-stop.
 *
 * Hook : `hydrateStyles` / `dehydrateStyles`.
 *
 * @module odf/extra/style-properties-typed
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const stylePropertiesTyped = {
    name: 'stylePropertiesTyped',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const PROPS_NAMES = new Set([
            'style:paragraph-properties',
            'style:text-properties',
            'style:graphic-properties',
            'style:section-properties',
            'style:ruby-properties',
            'style:table-properties',
            'style:table-column-properties',
            'style:table-row-properties',
            'style:table-cell-properties',
            'style:chart-properties',
            'style:drawing-page-properties',
            'style:list-level-properties',
            'style:list-level-label-alignment',
            'style:tab-stops',
            'style:tab-stop'
        ]);

        const ATTR_MAP = {
            'fo:font-family':    'fontFamily',
            'fo:font-size':      'fontSize',
            'fo:font-weight':    'fontWeight',
            'fo:font-style':     'fontStyle',
            'fo:color':          'color',
            'fo:background-color': 'backgroundColor',
            'fo:text-align':     'textAlign',
            'fo:margin-left':    'marginLeft',
            'fo:margin-right':   'marginRight',
            'fo:margin-top':     'marginTop',
            'fo:margin-bottom':  'marginBottom',
            'fo:padding':        'padding',
            'fo:line-height':    'lineHeight',
            'fo:break-before':   'breakBefore',
            'fo:break-after':    'breakAfter',
            'style:font-name':   'fontName',
            'style:writing-mode':'writingMode',
            'style:column-width':'columnWidth',
            'style:row-height':  'rowHeight',
            'svg:width':         'width',
            'svg:height':        'height'
        };

        const REVERSE_MAP = {};
        for (const k of Object.keys(ATTR_MAP)) REVERSE_MAP[ATTR_MAP[k]] = k;

        function parseProperties(el) {
            const out = { kind: el.name, attrs: {} };
            for (const k of Object.keys(el.attrs || {})) {
                if (ATTR_MAP[k]) out[ATTR_MAP[k]] = el.attrs[k];
                else out.attrs[k] = el.attrs[k];
            }
            const subs = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (PROPS_NAMES.has(c.name)) subs.push(parseProperties(c));
                else subs.push(c);
            }
            if (subs.length) out.children = subs;
            return out;
        }

        function renderProperties(p) {
            const attrs = { ...(p.attrs || {}) };
            for (const k of Object.keys(REVERSE_MAP)) {
                if (p[k] != null) attrs[REVERSE_MAP[k]] = String(p[k]);
            }
            const kids = [];
            for (const c of p.children || []) {
                if (c && c.kind) kids.push(renderProperties(c));
                else kids.push(c);
            }
            return xml.el(p.kind, attrs, kids);
        }

        function walkStyleNode(s) {
            if (!s || s.type !== 'element') return s;
            const kids = s.children || [];
            const out = { ...s, children: [] };
            let mutated = false;
            for (const c of kids) {
                if (c.type === 'element' && PROPS_NAMES.has(c.name)) {
                    out.children.push(parseProperties(c));
                    mutated = true;
                } else {
                    out.children.push(c);
                }
            }
            return mutated ? out : s;
        }

        function emitStyleNode(s) {
            if (!s || s.type !== 'element') return s;
            const kids = s.children || [];
            const out = { ...s, children: [] };
            let mutated = false;
            for (const c of kids) {
                if (c && c.kind && PROPS_NAMES.has(c.kind)) {
                    out.children.push(renderProperties(c));
                    mutated = true;
                } else {
                    out.children.push(c);
                }
            }
            return mutated ? out : s;
        }

        function hydrateStyles(styles) {
            if (!styles) return styles;
            for (const k of ['styles', 'automaticStyles', 'masterStyles']) {
                if (!Array.isArray(styles[k])) continue;
                styles[k] = styles[k].map(walkStyleNode);
            }
            return styles;
        }

        function dehydrateStyles(styles) {
            if (!styles) return styles;
            const out = { ...styles };
            for (const k of ['styles', 'automaticStyles', 'masterStyles']) {
                if (!Array.isArray(out[k])) continue;
                out[k] = out[k].map(emitStyleNode);
            }
            return out;
        }

        return {
            parseProperties, renderProperties,
            hydrateStyles, dehydrateStyles,
            PROPS_NAMES, ATTR_MAP
        };
    }
};
