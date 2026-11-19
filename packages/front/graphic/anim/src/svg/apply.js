// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.svgApply` — fw module descriptor for SVG attribute
 * writing. Delegates to the injected fw `dom` module's `attr` method so that
 * the single attribute write path goes through the fw DOM layer.
 *
 * Sanitization scope (accurate): `dom.attr` writes via raw `setAttribute` —
 * it does NOT invoke secPolicy sanitization. Only `dom.style`/visibility paths
 * sanitize through secPolicy. Callers must not assume attribute values are
 * filtered for XSS/injection beyond what `setAttribute` itself enforces.
 *
 * Worker-safe: NO — depends on fw `dom` which is main-thread only.
 */

import { dom } from '@awacloud/fw/dom/query/dom.js';

/**
 * @typedef {{ SVG_NS: string, svgAttr: (target: object, name: string, value: string|number) => void }} SvgApplyAPI
 */

export const svgApplyModule = {
    name: 'graphic.svgApply',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['dom'],
    deps: [dom],

    /**
     * @param {{ attr: (target: object, name: string, value: string) => void }} dom
     * @returns {SvgApplyAPI}
     */
    factory(dom) {
        /** Single canonical SVG namespace URI for element construction via `createElementNS`. */
        const SVG_NS = 'http://www.w3.org/2000/svg';

        /**
         * Write an interpolated value to a named SVG/DOM attribute via `dom.attr`.
         * No-op when the target cannot accept attributes — never throws on a
         * missing or invalid target (the engine's "no-op, never throw" contract).
         * dom.attr does NOT guard non-elements, so we guard here.
         *
         * @param {object}        target - SVG/DOM element (or falsy / plain object — handled gracefully).
         * @param {string}        name   - Attribute name (e.g. `'width'`, `'cx'`).
         * @param {string|number} value  - Attribute value; coerced to string.
         */
        const svgAttr = (target, name, value) => {
            if (target && typeof target.setAttribute === 'function') {
                dom.attr(target, name, String(value));
            }
        };

        return { SVG_NS, svgAttr };
    },
};
