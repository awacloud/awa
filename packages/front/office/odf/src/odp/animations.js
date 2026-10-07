// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render ODF SMIL animation trees (`anim:*`) plus
 * basic `presentation:transition` helper.
 *
 * Recognised element kinds (anim:): `par`, `seq`, `set`, `animate`,
 * `animateColor`, `animateMotion`, `animateTransform`, `transitionFilter`,
 * `audio`, `command`, `iterate`, `param`.
 *
 * Tree model:
 *
 * ```js
 * { kind: 'anim:par', attrs: {...}, children: [<nodeOrRawXml>…], _extras? }
 * ```
 *
 * Non-anim children are preserved verbatim (raw XML element nodes).
 *
 * @module odf/odp/animations
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const odpAnimations = {
    name: 'odpAnimations',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const ANIM_PREFIX = 'anim:';


        /** @param {string} name */
        function isAnimName(name) {
            return typeof name === 'string' && name.startsWith(ANIM_PREFIX);
        }

        /**
         * Recursively parse an animation root (typically `<anim:par>`).
         *
         * @param {object} el
         * @returns {object}
         */
        function parseAnimations(el) {
            if (!el || el.type !== 'element') {
                return { kind: 'anim:par', attrs: {}, children: [] };
            }
            return parseNode(el);
        }

        function parseNode(el) {
            const out = {
                kind: el.name,
                attrs: { ...(el.attrs || {}) },
                children: []
            };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (isAnimName(c.name)) out.children.push(parseNode(c));
                else out.children.push(c);
            }
            return out;
        }

        /**
         * Render an animation tree.
         *
         * @param {object} a
         * @returns {object}
         */
        function renderAnimations(a) {
            return renderNode(a);
        }

        function renderNode(a) {
            const kids = [];
            for (const c of a.children || []) {
                if (c && c.kind && isAnimName(c.kind)) kids.push(renderNode(c));
                else kids.push(c);
            }
            return xml.el(a.kind, { ...(a.attrs || {}) }, kids);
        }

        /**
         * Parse a `<presentation:transition>` element into a model.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseTransition(el) {
            return {
                kind: 'presentation:transition',
                attrs: { ...(el.attrs || {}) },
                children: (el.children || []).filter(c => c.type === 'element')
            };
        }

        /**
         * Render a transition model.
         *
         * @param {object} t
         * @returns {object}
         */
        function renderTransition(t) {
            return xml.el('presentation:transition',
                { ...(t.attrs || {}) }, (t.children || []).slice());
        }

        return {
            isAnimName,
            parseAnimations, renderAnimations,
            parseTransition, renderTransition
        };
    }
};
