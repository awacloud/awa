// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed support for ODF page layout +
 * master page.
 *
 * Recognised elements parsed into typed bags
 * (`{ kind, attrs, children, _extras? }`) :
 *
 *   style:page-layout, style:page-layout-properties,
 *   style:header-style, style:footer-style,
 *   style:master-page, style:header, style:footer,
 *   style:header-left, style:footer-left,
 *   style:header-first, style:footer-first,
 *   style:background-image,
 *   style:column, style:columns, style:column-sep,
 *   style:footnote-sep, style:layout-grid-properties.
 *
 * Hooks : `hydrateStyles` / `dehydrateStyles`.
 *
 * @module odf/extra/style-page
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const stylePage = {
    name: 'stylePage',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const PAGE_NAMES = new Set([
            'style:page-layout',
            'style:master-page'
        ]);
        const PAGE_CHILDREN = new Set([
            'style:page-layout-properties',
            'style:header-style',
            'style:footer-style',
            'style:header',
            'style:footer',
            'style:header-left',
            'style:footer-left',
            'style:header-first',
            'style:footer-first',
            'style:background-image',
            'style:column',
            'style:columns',
            'style:column-sep',
            'style:footnote-sep',
            'style:layout-grid-properties'
        ]);


        function parseNode(el) {
            const out = {
                kind: el.name,
                attrs: { ...(el.attrs || {}) },
                children: []
            };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                out.children.push(parseNode(c));
            }
            return out;
        }

        function renderNode(n) {
            const kids = (n.children || []).map(renderNode);
            return xml.el(n.kind, { ...(n.attrs || {}) }, kids);
        }

        function isPageName(name) {
            return PAGE_NAMES.has(name) || PAGE_CHILDREN.has(name);
        }

        // --- Hooks ---

        function hydrateStyles(styles) {
            if (!styles) return styles;
            const containers = ['styles', 'automaticStyles', 'masterStyles'];
            for (const k of containers) {
                if (!Array.isArray(styles[k])) continue;
                const remaining = [];
                const pages = styles.pageLayouts || [];
                const masters = styles.masterPages || [];
                for (const s of styles[k]) {
                    if (!s || s.type !== 'element') { remaining.push(s); continue; }
                    if (s.name === 'style:page-layout')  pages.push(parseNode(s));
                    else if (s.name === 'style:master-page') masters.push(parseNode(s));
                    else remaining.push(s);
                }
                if (pages.length) styles.pageLayouts = pages;
                if (masters.length) styles.masterPages = masters;
                styles[k] = remaining;
            }
            if (Array.isArray(styles._extras)) {
                const remaining = [];
                const pages = styles.pageLayouts || [];
                const masters = styles.masterPages || [];
                for (const s of styles._extras) {
                    if (!s || s.type !== 'element') { remaining.push(s); continue; }
                    if (s.name === 'style:page-layout')  pages.push(parseNode(s));
                    else if (s.name === 'style:master-page') masters.push(parseNode(s));
                    else remaining.push(s);
                }
                if (pages.length) styles.pageLayouts = pages;
                if (masters.length) styles.masterPages = masters;
                if (remaining.length) styles._extras = remaining;
                else delete styles._extras;
            }
            return styles;
        }

        function dehydrateStyles(styles) {
            if (!styles) return styles;
            if ((!styles.pageLayouts || !styles.pageLayouts.length) &&
                (!styles.masterPages || !styles.masterPages.length)) return styles;
            const out = { ...styles };
            const extras = Array.isArray(out._extras) ? [...out._extras] : [];
            for (const p of out.pageLayouts || []) extras.push(renderNode(p));
            for (const m of out.masterPages || []) extras.push(renderNode(m));
            delete out.pageLayouts;
            delete out.masterPages;
            if (extras.length) out._extras = extras;
            return out;
        }

        return {
            parseNode, renderNode, isPageName,
            hydrateStyles, dehydrateStyles,
            PAGE_NAMES, PAGE_CHILDREN
        };
    }
};
