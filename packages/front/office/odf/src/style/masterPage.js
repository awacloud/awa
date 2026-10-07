// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<style:master-page>`.
 *
 * Model:
 *
 * ```js
 * {
 *   name,
 *   displayName?,
 *   pageLayoutName,
 *   headers?: { default?: rawXmlChildren, left?: rawXmlChildren },
 *   footers?: { default?: rawXmlChildren, left?: rawXmlChildren },
 *   _extras?
 * }
 * ```
 *
 * Header/footer bodies are kept as raw XML element children, so they are
 * preserved on a round-trip — `textContent` can type them when needed.
 *
 * @module odf/style/masterPage
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const styleMasterPage = {
    name: 'styleMasterPage',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {

        function collectChildren(el) {
            const kids = [];
            for (const c of el.children || []) {
                if (c.type === 'element') kids.push(c);
            }
            return kids;
        }

        /**
         * Parse a `<style:master-page>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseMasterPage(el) {
            const a = el.attrs || {};
            const out = {
                name: a['style:name'] || '',
                pageLayoutName: a['style:page-layout-name'] || ''
            };
            if (a['style:display-name']) out.displayName = a['style:display-name'];
            // Preserve other attrs
            const known = new Set(['style:name', 'style:page-layout-name', 'style:display-name']);
            const xa = {};
            let anyAttr = false;
            for (const k of Object.keys(a)) {
                if (!known.has(k)) { xa[k] = a[k]; anyAttr = true; }
            }
            const headers = {};
            const footers = {};
            const xtra = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'style:header':       headers.default = collectChildren(c); break;
                    case 'style:header-left':  headers.left    = collectChildren(c); break;
                    case 'style:footer':       footers.default = collectChildren(c); break;
                    case 'style:footer-left':  footers.left    = collectChildren(c); break;
                    default: xtra.push(c);
                }
            }
            if (Object.keys(headers).length) out.headers = headers;
            if (Object.keys(footers).length) out.footers = footers;
            if (anyAttr || xtra.length) {
                out._extras = {};
                if (anyAttr) out._extras.attrs = xa;
                if (xtra.length) out._extras.children = xtra;
            }
            return out;
        }

        /**
         * Render a master-page model to a `<style:master-page>` node.
         *
         * @param {object} mp
         * @returns {object}
         */
        function renderMasterPage(mp) {
            const attrs = {
                'style:name':             mp.name || '',
                'style:page-layout-name': mp.pageLayoutName || ''
            };
            if (mp.displayName) attrs['style:display-name'] = mp.displayName;
            if (mp._extras && mp._extras.attrs) {
                for (const k of Object.keys(mp._extras.attrs)) attrs[k] = mp._extras.attrs[k];
            }
            const children = [];
            const h = mp.headers || {};
            if (h.default) children.push(xml.el('style:header',      {}, h.default.slice()));
            if (h.left)    children.push(xml.el('style:header-left', {}, h.left.slice()));
            const f = mp.footers || {};
            if (f.default) children.push(xml.el('style:footer',      {}, f.default.slice()));
            if (f.left)    children.push(xml.el('style:footer-left', {}, f.left.slice()));
            if (mp._extras && mp._extras.children) {
                for (const c of mp._extras.children) children.push(c);
            }
            return xml.el('style:master-page', attrs, children);
        }

        return { parseMasterPage, renderMasterPage };
    }
};
