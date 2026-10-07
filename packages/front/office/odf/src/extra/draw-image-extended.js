// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed parse/render of the extended
 * `draw:*` image / fill / layer / OLE / image-map family that the core
 * `drawImage` does not handle.
 *
 * Covered elements : `draw:area-rectangle`, `draw:area-circle`,
 * `draw:area-polygon`, `draw:image-map`, `draw:gradient`, `draw:hatch`,
 * `draw:fill-image`, `draw:opacity`, `draw:marker`, `draw:stroke-dash`,
 * `draw:layer`, `draw:layer-set`, `draw:applet`, `draw:plugin`,
 * `draw:floating-frame`, `draw:object`, `draw:object-ole`, `draw:param`.
 *
 * @module odf/extra/draw-image-extended
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfTypedHelper } from './_typed-helper.js';

export const drawImageExtended = {
    name: 'drawImageExtended',
    dependencies: ['xml', 'odfTypedHelper'],
    deps: [xml, odfTypedHelper],

    factory(xml, odfTypedHelper) {
        const ELEMENTS = new Set([
            'draw:area-rectangle', 'draw:area-circle', 'draw:area-polygon',
            'draw:image-map', 'draw:gradient', 'draw:hatch', 'draw:fill-image',
            'draw:opacity', 'draw:marker', 'draw:stroke-dash',
            'draw:layer', 'draw:layer-set',
            'draw:applet', 'draw:plugin', 'draw:floating-frame',
            'draw:object', 'draw:object-ole', 'draw:param'
        ]);

        const f = odfTypedHelper.buildTypedFamily(ELEMENTS, 'draw:', 'draw-ext');

        function hydrateFrame(frame) {
            if (!frame || !frame._extras) return frame;
            const extras = Array.isArray(frame._extras) ? frame._extras : (frame._extras.children || []);
            if (!extras.length) return frame;
            const remaining = [];
            const promoted = frame.drawExtras || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    promoted.push(f.parseElement(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) frame.drawExtras = promoted;
            if (Array.isArray(frame._extras)) {
                if (remaining.length) frame._extras = remaining; else delete frame._extras;
            } else {
                if (remaining.length) frame._extras.children = remaining; else delete frame._extras.children;
                if (!Object.keys(frame._extras).length) delete frame._extras;
            }
            return frame;
        }

        function dehydrateFrame(frame) {
            if (!frame || !frame.drawExtras || !frame.drawExtras.length) return frame;
            const out = { ...frame };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const n of out.drawExtras) extras.push(f.renderElement(n));
            delete out.drawExtras;
            if (Array.isArray(frame._extras) || !frame._extras) out._extras = extras;
            else out._extras = { ...frame._extras, children: extras };
            return out;
        }

        return { ...f, hydrateFrame, dehydrateFrame };
    }
};
