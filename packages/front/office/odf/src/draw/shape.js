// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render typed drawing shapes.
 *
 * Recognised elements:
 *
 * - `draw:rect`, `draw:circle`, `draw:ellipse`, `draw:line`
 * - `draw:polyline`, `draw:polygon`, `draw:path`
 * - `draw:custom-shape` (which may carry a child `draw:enhanced-geometry`)
 *
 * Model:
 *
 * ```js
 * { type: 'shape', kind, attrs: {...},
 *   enhancedGeometry?: { attrs: {...}, _extras? },
 *   children: [...rawXml],
 *   _extras? }
 * ```
 *
 * `attrs` keeps all known attributes (svg:x/y/width/height,
 * draw:style-name, draw:name, …). `children` preserves any non-typed
 * descendants verbatim.
 *
 * @module odf/draw/shape
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const drawShape = {
    name: 'drawShape',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const KINDS = new Set([
            'draw:rect',
            'draw:circle',
            'draw:ellipse',
            'draw:line',
            'draw:polyline',
            'draw:polygon',
            'draw:path',
            'draw:custom-shape'
        ]);


        /** @param {string} name */
        function isShapeName(name) {
            return KINDS.has(name);
        }

        /**
         * Parse a shape element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseShape(el) {
            const out = {
                type: 'shape',
                kind: el.name,
                attrs: { ...(el.attrs || {}) },
                children: []
            };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'draw:enhanced-geometry'
                    && el.name === 'draw:custom-shape') {
                    out.enhancedGeometry = parseEnhanced(c);
                } else {
                    out.children.push(c);
                }
            }
            return out;
        }

        function parseEnhanced(el) {
            const out = { attrs: { ...(el.attrs || {}) } };
            const xc = [];
            for (const c of el.children || []) {
                if (c.type === 'element') xc.push(c);
            }
            if (xc.length) out._extras = { children: xc };
            return out;
        }

        /**
         * Render a shape model.
         *
         * @param {object} s
         * @returns {object}
         */
        function renderShape(s) {
            const children = [];
            if (s.enhancedGeometry && s.kind === 'draw:custom-shape') {
                children.push(renderEnhanced(s.enhancedGeometry));
            }
            if (s.children) for (const c of s.children) children.push(c);
            if (s._extras && s._extras.children) {
                for (const c of s._extras.children) children.push(c);
            }
            return xml.el(s.kind, { ...(s.attrs || {}) }, children);
        }

        function renderEnhanced(g) {
            const kids = (g._extras && g._extras.children) ? g._extras.children.slice() : [];
            return xml.el('draw:enhanced-geometry', { ...(g.attrs || {}) }, kids);
        }

        return { isShapeName, parseShape, renderShape, KINDS };
    }
};
