// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<draw:page>` — a single ODP slide.
 *
 * Model:
 *
 * ```js
 * {
 *   type: 'slide',
 *   name?, masterPageName?, styleName?, layoutName?,
 *   frames: [ ...frameModel ],
 *   notes?: { body: [ ...rawXml ] },
 *   _extras?
 * }
 * ```
 *
 * Slide content elements other than `<draw:frame>` (e.g. background
 * `<draw:rect>`) are kept as raw XML in `_extras.children`, so they are
 * preserved on a round-trip. `slideText(s, opts?)`
 * derives the visible text of a slide model (text-box frames, then the
 * text-bearing content of the raw markup — tables, shapes and text boxes
 * at any depth, frames and groups included; speaker notes opt-in).
 *
 * @module odf/odp/slide
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { textParagraph } from '../text/paragraph.js';
import { textContent } from '../text/content.js';
import { drawFrame } from '../draw/frame.js';

export const slide = {
    name: 'slide',
    dependencies: ['xml', 'textParagraph', 'textContent', 'drawFrame'],
    deps: [xml, textParagraph, textContent, drawFrame],

    factory(xml, paraMod, contentMod, frameMod) {
        void paraMod;

        const TEXT_BEARING = new Set(['text:p', 'text:h', 'text:list', 'table:table']);
        // Alternative text and notes are not visible slide text (notes stay opt-in).
        const NOT_SLIDE_TEXT = new Set(['svg:title', 'svg:desc', 'presentation:notes']);

        /**
         * Typed body nodes of a raw child list, text-bearing elements only.
         * @param {Array<object>} rawChildren
         * @returns {Array<object>}
         */
        function bodyNodesOf(rawChildren) {
            const nodes = [];
            for (const el of rawChildren || []) {
                if (!el || el.type !== 'element' || !TEXT_BEARING.has(el.name)) continue;
                const n = contentMod.parseNode(el);
                if (n) nodes.push(n);
            }
            return nodes;
        }

        /**
         * Parse a `<draw:page>` element into a slide model.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseSlide(el) {
            const out = { type: 'slide', frames: [] };
            const a = el.attrs || {};
            if (a['draw:name'])                                 out.name = a['draw:name'];
            if (a['draw:master-page-name'])                     out.masterPageName = a['draw:master-page-name'];
            if (a['draw:style-name'])                           out.styleName = a['draw:style-name'];
            if (a['presentation:presentation-page-layout-name']) out.layoutName = a['presentation:presentation-page-layout-name'];
            const known = new Set(['draw:name', 'draw:master-page-name',
                                   'draw:style-name',
                                   'presentation:presentation-page-layout-name']);
            const xa = {};
            let anyAttr = false;
            for (const k of Object.keys(a)) {
                if (!known.has(k)) { xa[k] = a[k]; anyAttr = true; }
            }
            const xtra = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'draw:frame') {
                    out.frames.push(frameMod.parseFrame(c));
                } else if (c.name === 'presentation:notes') {
                    const body = [];
                    for (const k of c.children || []) {
                        if (k.type === 'element') body.push(k);
                    }
                    out.notes = { body };
                    if (c.attrs) {
                        // Preserve notes attrs in _extras for slide-level roundtrip
                        const na = {};
                        let nanyAttr = false;
                        for (const ak of Object.keys(c.attrs)) {
                            na[ak] = c.attrs[ak]; nanyAttr = true;
                        }
                        if (nanyAttr) out.notes._attrs = na;
                    }
                } else {
                    xtra.push(c);
                }
            }
            if (anyAttr || xtra.length) {
                out._extras = {};
                if (anyAttr) out._extras.attrs = xa;
                if (xtra.length) out._extras.children = xtra;
            }
            return out;
        }

        /**
         * Render a slide model to a `<draw:page>` element node.
         *
         * @param {object} s
         * @returns {object}
         */
        function renderSlide(s) {
            const attrs = {};
            if (s.name)            attrs['draw:name'] = s.name;
            if (s.masterPageName)  attrs['draw:master-page-name'] = s.masterPageName;
            if (s.styleName)       attrs['draw:style-name'] = s.styleName;
            if (s.layoutName)      attrs['presentation:presentation-page-layout-name'] = s.layoutName;
            if (s._extras && s._extras.attrs) {
                for (const k of Object.keys(s._extras.attrs)) attrs[k] = s._extras.attrs[k];
            }
            const children = [];
            for (const f of s.frames || []) children.push(frameMod.renderFrame(f));
            if (s.notes) {
                const nAttrs = s.notes._attrs ? { ...s.notes._attrs } : {};
                children.push(xml.el('presentation:notes', nAttrs, (s.notes.body || []).slice()));
            }
            if (s._extras && s._extras.children) {
                for (const c of s._extras.children) children.push(c);
            }
            return xml.el('draw:page', attrs, children);
        }

        /**
         * Visible text of one slide, in document order: the typed frames (the
         * paragraphs of a `text-box` frame, then whatever raw markup the frame
         * keeps in its extras — e.g. a table), then every text-bearing element
         * of the slide's untyped markup (shapes, tables, text boxes, groups
         * included at any depth); alternative text (`svg:title`, `svg:desc`)
         * is not visible text. Speaker notes follow last, only with
         * `opts.notes === true`. Each block is `textContent.bodyText` of its
         * typed nodes; empty blocks are skipped; blocks are joined with a
         * newline. The slide `name` is never included.
         *
         * @param {object} s slide model
         * @param {{notes?: boolean}} [opts]
         * @returns {string}
         */
        function slideText(s, opts) {
            const blocks = [];
            const push = raw => {
                const nodes = bodyNodesOf(raw);
                if (!nodes.length) return;
                const t = contentMod.bodyText(nodes);
                if (t !== '') blocks.push(t);
            };
            // Raw-tree walk: consecutive text-bearing siblings form one block;
            // any other element is descended into (after flushing the run, so
            // document order holds). A text-bearing element already holds its
            // text in its typed node, so it is never descended into.
            const walkRaw = list => {
                let run = [];
                const flush = () => {
                    if (run.length) push(run);
                    run = [];
                };
                for (const el of list || []) {
                    if (!el || el.type !== 'element' || NOT_SLIDE_TEXT.has(el.name)) continue;
                    if (TEXT_BEARING.has(el.name)) {
                        run.push(el);
                    } else {
                        flush();
                        if (el.name === 'draw:text-box') push(el.children);
                        else walkRaw(el.children);
                    }
                }
                flush();
            };
            for (const f of (s && s.frames) || []) {
                if (!f) continue;
                if (f.child && f.child.kind === 'text-box') push(f.child.children);
                if (f._extras) walkRaw(f._extras.children);
            }
            walkRaw(s && s._extras && s._extras.children);
            if (opts && opts.notes === true && s && s.notes) push(s.notes.body);
            return blocks.join('\n');
        }

        return { parseSlide, renderSlide, slideText };
    }
};
