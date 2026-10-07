// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in catch-all : passthrough typed coverage for any
 * residual `draw:*` element. See `_misc-helper.js`.
 *
 * @module odf/extra/draw-misc
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfMiscHelper } from './_misc-helper.js';

export const drawMisc = {
    name: 'drawMisc',
    dependencies: ['xml', 'odfMiscHelper'],
    deps: [xml, odfMiscHelper],

    factory(xml, odfMiscHelper) {
        const ELEMENTS = new Set([
            'draw:a', 'draw:glue-point', 'draw:glue-points', 'draw:page-thumbnail',
            'draw:text-box', 'draw:object', 'draw:object-ole', 'draw:floating-frame',
            'draw:applet', 'draw:plugin', 'draw:param', 'draw:contour-polygon',
            'draw:contour-path', 'draw:image-map', 'draw:area-rectangle',
            'draw:area-circle', 'draw:area-polygon', 'draw:layer', 'draw:layer-set',
            'draw:marker', 'draw:stroke-dash', 'draw:gradient', 'draw:hatch',
            'draw:fill-image', 'draw:opacity', 'draw:fill-pattern',
            'draw:page', 'draw:caption-point', 'draw:notify-on-update-of-ranges',
            'draw:custom-shape', 'draw:enhanced-geometry', 'draw:equation', 'draw:handle'
        ]);

        const h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, 'draw:');

        function hydrateFrame(f) {
            if (!f || !f._extras) return f;
            const extras = Array.isArray(f._extras) ? f._extras : (f._extras.children || []);
            if (!extras.length) return f;
            const remaining = [];
            const promoted = f.drawNodes || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    promoted.push(h.parseElement(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) f.drawNodes = promoted;
            if (Array.isArray(f._extras)) {
                if (remaining.length) f._extras = remaining; else delete f._extras;
            } else {
                if (remaining.length) f._extras.children = remaining; else delete f._extras.children;
                if (!Object.keys(f._extras).length) delete f._extras;
            }
            return f;
        }

        function dehydrateFrame(f) {
            if (!f || !f.drawNodes || !f.drawNodes.length) return f;
            const out = { ...f };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const n of out.drawNodes) {
                if (n && n._passthrough) extras.push(h.renderElement(n));
            }
            delete out.drawNodes;
            if (Array.isArray(f._extras) || !f._extras) out._extras = extras;
            else out._extras = { ...f._extras, children: extras };
            return out;
        }

        return { ...h, _passthrough: true, hydrateFrame, dehydrateFrame };
    }
};
