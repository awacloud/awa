// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: VML legacy objects in WordprocessingML.
 *
 * Surface typed wrappers for `<w:pict>`, `<w:object>`, `<w:control>` and
 * `<w:movie>`, plus a typed projection of the dominant `<v:shape>` /
 * `<v:rect>` / `<v:oval>` / `<v:roundrect>` / `<v:line>` / `<v:group>`
 * inner element attributes (id, type, style, fillcolor, strokecolor,
 * coordsize, alt, href, …) and `<o:OLEObject>` / `<o:lock>` /
 * `<v:imagedata>` / `<v:textbox>` / `<v:fill>` / `<v:stroke>` blobs.
 *
 * Goal: enough typing to inspect/edit the most common controls and
 * embedded objects without reformatting opaque VML geometry.
 *
 * @module ooxml/extra/wml-vml-legacy
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const wmlVmlLegacy = {
    name: 'wmlVmlLegacy',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const TAGS = ['pict', 'object', 'control', 'movie'];

        // VML inner shape kinds we surface attrs for.
        const VML_SHAPE_TAGS = ['v:shape', 'v:rect', 'v:oval', 'v:roundrect',
                                'v:line', 'v:group', 'v:polyline', 'v:shapetype'];
        const VML_SHAPE_SET = new Set(VML_SHAPE_TAGS);

        // Standard surface attrs across VML shapes.
        const SHAPE_ATTRS = ['id', 'type', 'style', 'fillcolor', 'strokecolor',
                             'coordsize', 'coordorigin', 'alt', 'href', 'title',
                             'filled', 'stroked', 'o:spid', 'o:connectortype'];

        function pickShapeAttrs(el) {
            const out = {};
            for (const a of SHAPE_ATTRS) {
                if (el.attrs[a] != null) out[a] = el.attrs[a];
            }
            // pick remaining attrs as raw (preserve unknowns)
            const known = new Set(SHAPE_ATTRS);
            const extra = {};
            let hasExtra = false;
            for (const [k, v] of Object.entries(el.attrs || {})) {
                if (!known.has(k)) { extra[k] = v; hasExtra = true; }
            }
            if (hasExtra) out._extraAttrs = extra;
            return out;
        }

        function parseVmlShape(el) {
            const out = {
                tag: el.name,
                ...pickShapeAttrs(el),
                children: el.children.filter(c => c.type === 'element')
            };
            return out;
        }

        function renderVmlShape(s) {
            const attrs = {};
            for (const a of SHAPE_ATTRS) {
                if (s[a] != null) attrs[a] = String(s[a]);
            }
            if (s._extraAttrs) for (const [k, v] of Object.entries(s._extraAttrs)) attrs[k] = String(v);
            return xml.el(s.tag || 'v:shape', attrs, s.children || []);
        }

        function parseLegacy(el) {
            const out = {
                kind: el.name.replace(/^w:/, ''),
                attrs: { ...el.attrs },
                shapes: [],
                vml: []
            };
            for (const c of el.children) {
                if (c.type !== 'element') { out.vml.push(c); continue; }
                if (VML_SHAPE_SET.has(c.name)) {
                    out.shapes.push(parseVmlShape(c));
                } else {
                    out.vml.push(c);
                }
            }
            return out;
        }

        function renderLegacy(l) {
            const kids = [];
            for (const s of (l.shapes || [])) kids.push(renderVmlShape(s));
            for (const v of (l.vml || [])) kids.push(v);
            const tag = 'w:' + l.kind;
            switch (tag) {
                case 'w:pict':    return xml.el('w:pict',    l.attrs || {}, kids);
                case 'w:object':  return xml.el('w:object',  l.attrs || {}, kids);
                case 'w:control': return xml.el('w:control', l.attrs || {}, kids);
                case 'w:movie':   return xml.el('w:movie',   l.attrs || {}, kids);
                default:          return xml.el(tag, l.attrs || {}, kids);
            }
        }

        return {
            parseLegacy, renderLegacy,
            parseVmlShape, renderVmlShape,
            TAGS, VML_SHAPE_TAGS, SHAPE_ATTRS
        };
    }
};
