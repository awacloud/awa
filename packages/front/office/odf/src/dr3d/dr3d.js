// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<dr3d:scene>` 3D drawings.
 *
 * Recognised elements:
 *
 *   `dr3d:scene` (container), `dr3d:cube`, `dr3d:sphere`,
 *   `dr3d:extrude`, `dr3d:rotate`, `dr3d:light`.
 *
 * Model:
 *
 * ```js
 * {
 *   type: 'dr3d-scene',
 *   attrs: {...},
 *   lights: [{ kind: 'dr3d:light', attrs }],
 *   shapes: [{ kind, attrs, _extras? }],
 *   _extras?
 * }
 * ```
 *
 * Lights are split out for ergonomic access; everything else stays in
 * `shapes`. Unknown child elements survive on `_extras.children`.
 *
 * @module odf/dr3d/dr3d
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const dr3dScene = {
    name: 'dr3dScene',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const SHAPE_KINDS = new Set([
            'dr3d:cube',
            'dr3d:sphere',
            'dr3d:extrude',
            'dr3d:rotate'
        ]);

        const ALL_3D = new Set([
            'dr3d:scene', 'dr3d:cube', 'dr3d:sphere',
            'dr3d:extrude', 'dr3d:rotate', 'dr3d:light'
        ]);


        /** @param {string} name */
        function is3dElementName(name) {
            return ALL_3D.has(name);
        }

        /**
         * Parse a `<dr3d:scene>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseScene(el) {
            const out = {
                type: 'dr3d-scene',
                attrs: { ...(el.attrs || {}) },
                lights: [],
                shapes: []
            };
            const xc = [];
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'dr3d:light') {
                    out.lights.push({ kind: 'dr3d:light', attrs: { ...(c.attrs || {}) } });
                } else if (SHAPE_KINDS.has(c.name)) {
                    out.shapes.push({ kind: c.name, attrs: { ...(c.attrs || {}) } });
                } else {
                    xc.push(c);
                }
            }
            if (xc.length) out._extras = { children: xc };
            return out;
        }

        /**
         * Render a scene model.
         *
         * @param {object} s
         * @returns {object}
         */
        function renderScene(s) {
            const kids = [];
            for (const l of s.lights || []) {
                kids.push(xml.el('dr3d:light', { ...(l.attrs || {}) }, []));
            }
            for (const sh of s.shapes || []) {
                kids.push(xml.el(sh.kind, { ...(sh.attrs || {}) }, []));
            }
            if (s._extras && s._extras.children) {
                for (const c of s._extras.children) kids.push(c);
            }
            return xml.el('dr3d:scene', { ...(s.attrs || {}) }, kids);
        }

        return { is3dElementName, parseScene, renderScene, SHAPE_KINDS };
    }
};
