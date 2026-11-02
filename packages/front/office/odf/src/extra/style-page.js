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


        // An element becomes a bag; any other child (text, CDATA, a
        // comment: a header's words) stays in place as the node read.
        function parseNode(el) {
            const out = {
                kind: el.name,
                attrs: { ...(el.attrs || {}) },
                children: []
            };
            for (const c of el.children || []) {
                out.children.push(c && c.type === 'element' ? parseNode(c) : c);
            }
            return out;
        }

        function renderNode(n) {
            const kids = (n.children || []).map((c) => (c && c.kind ? renderNode(c) : c));
            return xml.el(n.kind, { ...(n.attrs || {}) }, kids);
        }

        function isPageName(name) {
            return PAGE_NAMES.has(name) || PAGE_CHILDREN.has(name);
        }

        // --- Hooks ---

        // The container each element belongs in (page layouts in
        // office:automatic-styles, master pages in office:master-styles):
        // a bag met elsewhere records it (`container`) so it goes back there.
        const HOME = { 'style:page-layout': 'automaticStyles', 'style:master-page': 'masterStyles' };

        function bag(el, container) {
            const n = parseNode(el);
            if (container !== HOME[el.name]) n.container = container;
            return n;
        }

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
                    if (s.name === 'style:page-layout')  pages.push(bag(s, k));
                    else if (s.name === 'style:master-page') masters.push(bag(s, k));
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
                    if (s.name === 'style:page-layout')  pages.push(bag(s, '_extras'));
                    else if (s.name === 'style:master-page') masters.push(bag(s, '_extras'));
                    else remaining.push(s);
                }
                if (pages.length) styles.pageLayouts = pages;
                if (masters.length) styles.masterPages = masters;
                if (remaining.length) styles._extras = remaining;
                else delete styles._extras;
            }
            return styles;
        }

        // Each bag back into its container, after the elements left there;
        // `_extras` (the root's other children) is never replaced. The
        // given model is not changed: the containers are copied.
        function dehydrateStyles(styles) {
            if (!styles) return styles;
            if ((!styles.pageLayouts || !styles.pageLayouts.length) &&
                (!styles.masterPages || !styles.masterPages.length)) return styles;
            const out = { ...styles };
            const put = (n) => {
                const k = n.container || HOME[n.kind];
                // the first push into a container copies it
                if (out[k] === styles[k]) out[k] = Array.isArray(styles[k]) ? [...styles[k]] : [];
                out[k].push(renderNode(n));
            };
            for (const p of out.pageLayouts || []) put(p);
            for (const m of out.masterPages || []) put(m);
            delete out.pageLayouts;
            delete out.masterPages;
            return out;
        }

        return {
            parseNode, renderNode, isPageName,
            hydrateStyles, dehydrateStyles,
            PAGE_NAMES, PAGE_CHILDREN
        };
    }
};
