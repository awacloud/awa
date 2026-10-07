// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<draw:frame>` — wrapper for embedded
 * images, text boxes, or generic objects.
 *
 * Model:
 *
 * ```js
 * {
 *   type: 'frame',
 *   anchorType?,                 // 'as-char' | 'char' | 'paragraph' | 'page' | …
 *   name?, styleName?,
 *   width?, height?, x?, y?,
 *   child: { kind: 'image' | 'text-box' | 'object', ... },
 *   _extras?
 * }
 * ```
 *
 * For `kind: 'image'`, child has `href, mimeType?` (see `drawImage`).
 * For `kind: 'text-box'`, child has `children: [...rawXml]` preserved.
 * For `kind: 'object'`, child has `href?, attrs` preserved.
 *
 * @module odf/draw/frame
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { drawImage } from './image.js';

export const drawFrame = {
    name: 'drawFrame',
    dependencies: ['xml', 'drawImage'],
    deps: [xml, drawImage],

    factory(xml, imageMod) {

        /**
         * Parse a `<draw:frame>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseFrame(el) {
            const out = { type: 'frame' };
            const a = el.attrs || {};
            if (a['text:anchor-type'])  out.anchorType = a['text:anchor-type'];
            if (a['draw:name'])         out.name = a['draw:name'];
            if (a['draw:style-name'])   out.styleName = a['draw:style-name'];
            if (a['svg:width'])         out.width = a['svg:width'];
            if (a['svg:height'])        out.height = a['svg:height'];
            if (a['svg:x'])             out.x = a['svg:x'];
            if (a['svg:y'])             out.y = a['svg:y'];
            // Preserve other attrs
            const known = new Set([
                'text:anchor-type', 'draw:name', 'draw:style-name',
                'svg:width', 'svg:height', 'svg:x', 'svg:y'
            ]);
            const xa = {};
            let anyAttr = false;
            for (const k of Object.keys(a)) {
                if (!known.has(k)) { xa[k] = a[k]; anyAttr = true; }
            }
            // Find first content child
            let child = null;
            const xtraChildren = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (!child) {
                    if (c.name === 'draw:image') {
                        child = { kind: 'image', ...stripType(imageMod.parseImage(c)) };
                    } else if (c.name === 'draw:text-box') {
                        const kids = [];
                        for (const k of c.children || []) {
                            if (k.type === 'element') kids.push(k);
                        }
                        child = { kind: 'text-box', children: kids,
                                  attrs: { ...(c.attrs || {}) } };
                    } else if (c.name === 'draw:object' || c.name === 'draw:object-ole') {
                        child = { kind: 'object', tag: c.name,
                                  attrs: { ...(c.attrs || {}) },
                                  href: (c.attrs && c.attrs['xlink:href']) || undefined };
                    } else {
                        xtraChildren.push(c);
                    }
                } else {
                    xtraChildren.push(c);
                }
            }
            if (child) out.child = child;
            if (anyAttr || xtraChildren.length) {
                out._extras = {};
                if (anyAttr) out._extras.attrs = xa;
                if (xtraChildren.length) out._extras.children = xtraChildren;
            }
            return out;
        }

        function stripType(node) {
            const { type: _type, ...rest } = node;
            return rest;
        }

        /**
         * Render a frame model to a `<draw:frame>` element node.
         *
         * @param {object} f
         * @returns {object}
         */
        function renderFrame(f) {
            const attrs = {};
            if (f.anchorType) attrs['text:anchor-type'] = f.anchorType;
            if (f.name)       attrs['draw:name']        = f.name;
            if (f.styleName)  attrs['draw:style-name']  = f.styleName;
            if (f.width)      attrs['svg:width']        = f.width;
            if (f.height)     attrs['svg:height']       = f.height;
            if (f.x)          attrs['svg:x']            = f.x;
            if (f.y)          attrs['svg:y']            = f.y;
            if (f._extras && f._extras.attrs) {
                for (const k of Object.keys(f._extras.attrs)) attrs[k] = f._extras.attrs[k];
            }
            const children = [];
            if (f.child) children.push(renderChild(f.child));
            if (f._extras && f._extras.children) {
                for (const c of f._extras.children) children.push(c);
            }
            return xml.el('draw:frame', attrs, children);
        }

        function renderChild(child) {
            if (!child) return null;
            if (child.kind === 'image') {
                return imageMod.renderImage({ href: child.href, mimeType: child.mimeType, _extras: child._extras });
            }
            if (child.kind === 'text-box') {
                return xml.el('draw:text-box', { ...(child.attrs || {}) }, (child.children || []).slice());
            }
            if (child.kind === 'object') {
                const tag = child.tag || 'draw:object';
                const a = { ...(child.attrs || {}) };
                if (child.href && !a['xlink:href']) a['xlink:href'] = child.href;
                return xml.el(tag, a, []);
            }
            return null;
        }

        return { parseFrame, renderFrame };
    }
};
