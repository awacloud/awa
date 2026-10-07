// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed parse/render for the extended
 * `draw:*` shape vocabulary.
 *
 * Recognised elements parsed into
 * `{ type: 'shape-ext', kind, attrs, enhancedGeometry?, children, _extras? }` :
 *
 *   draw:rect, draw:circle, draw:ellipse, draw:line,
 *   draw:polyline, draw:polygon, draw:path, draw:regular-polygon,
 *   draw:connector, draw:caption, draw:measure, draw:control,
 *   draw:custom-shape, draw:enhanced-geometry, draw:equation,
 *   draw:handle, draw:contour-polygon, draw:contour-path.
 *
 * The hook is `hydrateFrame` / `dehydrateFrame` for shapes embedded in
 * a frame ; helpers `parseShape` / `renderShape` are exposed for direct
 * use.
 *
 * @module odf/extra/draw-shapes
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const drawShapes = {
    name: 'drawShapes',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const SHAPE_NAMES = new Set([
            'draw:rect',
            'draw:circle',
            'draw:ellipse',
            'draw:line',
            'draw:polyline',
            'draw:polygon',
            'draw:path',
            'draw:regular-polygon',
            'draw:connector',
            'draw:caption',
            'draw:measure',
            'draw:control',
            'draw:custom-shape',
            'draw:contour-polygon',
            'draw:contour-path'
        ]);


        function parseEnhanced(el) {
            const out = { attrs: { ...(el.attrs || {}) }, equations: [], handles: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'draw:equation') {
                    out.equations.push({ attrs: { ...(c.attrs || {}) } });
                } else if (c.name === 'draw:handle') {
                    out.handles.push({ attrs: { ...(c.attrs || {}) } });
                }
            }
            return out;
        }

        function renderEnhanced(e) {
            const kids = [];
            for (const q of e.equations || []) kids.push(xml.el('draw:equation', { ...(q.attrs || {}) }));
            for (const h of e.handles || []) kids.push(xml.el('draw:handle', { ...(h.attrs || {}) }));
            return xml.el('draw:enhanced-geometry', { ...(e.attrs || {}) }, kids);
        }

        function parseShape(el) {
            const out = {
                type: 'shape-ext',
                kind: el.name,
                attrs: { ...(el.attrs || {}) },
                children: []
            };
            for (const c of el.children || []) {
                if (c.type !== 'element') { out.children.push(c); continue; }
                if (c.name === 'draw:enhanced-geometry') {
                    out.enhancedGeometry = parseEnhanced(c);
                } else {
                    out.children.push(c);
                }
            }
            if (!out.children.length) delete out.children;
            return out;
        }

        function renderShape(s) {
            const kids = [];
            if (s.enhancedGeometry) kids.push(renderEnhanced(s.enhancedGeometry));
            for (const c of s.children || []) kids.push(c);
            return xml.el(s.kind, { ...(s.attrs || {}) }, kids);
        }

        function isShapeName(name) { return SHAPE_NAMES.has(name); }

        // --- Hooks ---

        function hydrateFrame(f) {
            if (!f || !f._extras) return f;
            const extras = Array.isArray(f._extras) ? f._extras : (f._extras.children || []);
            if (!extras.length) return f;
            const remaining = [];
            const shapes = f.shapes || [];
            for (const c of extras) {
                if (c && c.type === 'element' && SHAPE_NAMES.has(c.name)) {
                    shapes.push(parseShape(c));
                } else {
                    remaining.push(c);
                }
            }
            if (shapes.length) f.shapes = shapes;
            if (Array.isArray(f._extras)) {
                if (remaining.length) f._extras = remaining;
                else delete f._extras;
            } else {
                if (remaining.length) f._extras.children = remaining;
                else delete f._extras.children;
                if (!Object.keys(f._extras).length) delete f._extras;
            }
            return f;
        }

        function dehydrateFrame(f) {
            if (!f || !f.shapes || !f.shapes.length) return f;
            const out = { ...f };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const s of out.shapes) extras.push(renderShape(s));
            delete out.shapes;
            if (Array.isArray(f._extras) || !f._extras) out._extras = extras;
            else out._extras = { ...f._extras, children: extras };
            return out;
        }

        return {
            parseShape, renderShape, isShapeName,
            parseEnhanced, renderEnhanced,
            hydrateFrame, dehydrateFrame,
            SHAPE_NAMES
        };
    }
};
