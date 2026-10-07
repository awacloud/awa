// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : extended typing for the `dr3d:*` 3D scene
 * vocabulary. Mirrors the core `dr3dScene` module but adds deeper attribute
 * preservation on every node (`dr3d:scene`, `dr3d:cube`, `dr3d:sphere`,
 * `dr3d:extrude`, `dr3d:rotate`, `dr3d:light`).
 *
 * @module odf/extra/dr3d-3d
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfTypedHelper } from './_typed-helper.js';

export const dr3d3d = {
    name: 'dr3d3d',
    dependencies: ['xml', 'odfTypedHelper'],
    deps: [xml, odfTypedHelper],

    factory(xml, odfTypedHelper) {
        const ELEMENTS = new Set([
            'dr3d:scene', 'dr3d:cube', 'dr3d:sphere',
            'dr3d:extrude', 'dr3d:rotate', 'dr3d:light'
        ]);

        const f = odfTypedHelper.buildTypedFamily(ELEMENTS, 'dr3d:', 'dr3d-typed');

        function parseScene(el) { return f.parseElement(el); }
        function renderScene(obj) { return f.renderElement(obj); }

        function hydrateFrame(frame) {
            if (!frame || !frame._extras) return frame;
            const extras = Array.isArray(frame._extras) ? frame._extras : (frame._extras.children || []);
            const remaining = [];
            const promoted = frame.dr3d || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    promoted.push(f.parseElement(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) frame.dr3d = promoted;
            if (Array.isArray(frame._extras)) {
                if (remaining.length) frame._extras = remaining; else delete frame._extras;
            } else {
                if (remaining.length) frame._extras.children = remaining; else delete frame._extras.children;
                if (!Object.keys(frame._extras).length) delete frame._extras;
            }
            return frame;
        }

        function dehydrateFrame(frame) {
            if (!frame || !frame.dr3d || !frame.dr3d.length) return frame;
            const out = { ...frame };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const n of out.dr3d) extras.push(f.renderElement(n));
            delete out.dr3d;
            if (Array.isArray(frame._extras) || !frame._extras) out._extras = extras;
            else out._extras = { ...frame._extras, children: extras };
            return out;
        }

        return { ...f, parseScene, renderScene, hydrateFrame, dehydrateFrame };
    }
};
