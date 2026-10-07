// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed parse/render of every `anim:*`
 * SMIL animation element (par, seq, iterate, audio, command, set,
 * animate, animateColor, animateMotion, animateTransform,
 * transitionFilter, param).
 *
 * @module odf/extra/animations-smil
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfTypedHelper } from './_typed-helper.js';

export const animationsSmil = {
    name: 'animationsSmil',
    dependencies: ['xml', 'odfTypedHelper'],
    deps: [xml, odfTypedHelper],

    factory(xml, odfTypedHelper) {
        const ELEMENTS = new Set([
            'anim:par', 'anim:seq', 'anim:iterate',
            'anim:audio', 'anim:command',
            'anim:set', 'anim:animate', 'anim:animateColor',
            'anim:animate-color', 'anim:animateMotion', 'anim:animate-motion',
            'anim:animateTransform', 'anim:animate-transform',
            'anim:transitionFilter', 'anim:transition-filter',
            'anim:param'
        ]);

        const f = odfTypedHelper.buildTypedFamily(ELEMENTS, 'anim:', 'anim-node');

        function parseAnim(el) { return f.parseElement(el); }
        function renderAnim(obj) { return f.renderElement(obj); }

        function hydrateSlide(slide) {
            if (!slide || !slide._extras) return slide;
            const extras = Array.isArray(slide._extras) ? slide._extras : (slide._extras.children || []);
            const remaining = [];
            const promoted = slide.animations || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    promoted.push(parseAnim(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) slide.animations = promoted;
            if (Array.isArray(slide._extras)) {
                if (remaining.length) slide._extras = remaining; else delete slide._extras;
            } else {
                if (remaining.length) slide._extras.children = remaining; else delete slide._extras.children;
                if (!Object.keys(slide._extras).length) delete slide._extras;
            }
            return slide;
        }

        function dehydrateSlide(slide) {
            if (!slide || !slide.animations || !slide.animations.length) return slide;
            const out = { ...slide };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const a of out.animations) {
                if (a && a.type === 'anim-node') extras.push(renderAnim(a));
            }
            delete out.animations;
            if (Array.isArray(slide._extras) || !slide._extras) out._extras = extras;
            else out._extras = { ...slide._extras, children: extras };
            return out;
        }

        return { ...f, parseAnim, renderAnim, hydrateSlide, dehydrateSlide };
    }
};
