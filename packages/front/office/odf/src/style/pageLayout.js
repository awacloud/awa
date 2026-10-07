// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<style:page-layout>` (page geometry +
 * header/footer style blocks).
 *
 * Model:
 *
 * ```js
 * {
 *   name,
 *   properties: { ...flatAttrs },     // <style:page-layout-properties>
 *   headerStyle?: { properties: { ...flatAttrs } },
 *   footerStyle?: { properties: { ...flatAttrs } },
 *   _extras?
 * }
 * ```
 *
 * @module odf/style/pageLayout
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const stylePageLayout = {
    name: 'stylePageLayout',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {

        function parseHF(el) {
            // <style:header-style> / <style:footer-style> contain <style:header-footer-properties>
            const out = { properties: {} };
            const xtra = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'style:header-footer-properties') {
                    out.properties = { ...(c.attrs || {}) };
                } else xtra.push(c);
            }
            if (xtra.length) out._extras = { children: xtra };
            return out;
        }

        function renderHF(tag, hf) {
            const children = [];
            children.push(xml.el('style:header-footer-properties',
                { ...(hf.properties || {}) }, []));
            if (hf._extras && hf._extras.children) {
                for (const c of hf._extras.children) children.push(c);
            }
            return xml.el(tag, {}, children);
        }

        /**
         * Parse a `<style:page-layout>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parsePageLayout(el) {
            const out = {
                name: (el.attrs && el.attrs['style:name']) || '',
                properties: {}
            };
            const xtra = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'style:page-layout-properties') {
                    out.properties = { ...(c.attrs || {}) };
                } else if (c.name === 'style:header-style') {
                    out.headerStyle = parseHF(c);
                } else if (c.name === 'style:footer-style') {
                    out.footerStyle = parseHF(c);
                } else xtra.push(c);
            }
            if (xtra.length) out._extras = { children: xtra };
            return out;
        }

        /**
         * Render a page layout model to a `<style:page-layout>` node.
         *
         * @param {object} p
         * @returns {object}
         */
        function renderPageLayout(p) {
            const children = [];
            children.push(xml.el('style:page-layout-properties',
                { ...(p.properties || {}) }, []));
            if (p.headerStyle) children.push(renderHF('style:header-style', p.headerStyle));
            if (p.footerStyle) children.push(renderHF('style:footer-style', p.footerStyle));
            if (p._extras && p._extras.children) {
                for (const c of p._extras.children) children.push(c);
            }
            return xml.el('style:page-layout', { 'style:name': p.name || '' }, children);
        }

        return { parsePageLayout, renderPageLayout };
    }
};
