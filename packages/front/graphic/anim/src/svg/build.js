// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.svgBuild` — capture-free fw module descriptor for a
 * JSON→SVG builder. `build(node, opts?)` recursively constructs a
 * namespace-correct `SVGElement` subtree from a plain JSON descriptor using
 * `document.createElementNS(SVG_NS, tag)` — where `SVG_NS` comes from the
 * injected (frozen) `graphic.svgApply` module — and writes EVERY attribute
 * through `svgApply.svgAttr` (the single frozen write path; never raw
 * `setAttribute`).
 *
 * Builds on top of the frozen module core; it never re-implements it. The
 * element whitelist (`SVG_TAGS`) is defined inside the factory (capture-free).
 *
 * Sanitization scope (accurate): attribute values are written via
 * `svgApply.svgAttr` → fw `dom.attr` → raw `setAttribute`. `dom.attr` does NOT
 * invoke secPolicy sanitization (only `dom.style`/visibility paths do). The
 * builder therefore performs NO attribute sanitization; callers must not assume
 * values are filtered for XSS/injection beyond what `setAttribute` enforces.
 *
 * Path `d` and color values pass through verbatim as strings — the builder does
 * NOT parse them (that is `graphic.interpolate`'s job at animation time).
 *
 * Worker-safe: NO — depends on `document.createElementNS` (main-thread DOM).
 */

import { dom } from '@awacloud/fw/dom/query/dom.js';
import { svgApplyModule } from './apply.js';

/**
 * @typedef {{ tag: string, attrs?: Record<string, string|number>, children?: (NodeDesc|string)[], text?: string|number }} NodeDesc
 */

/**
 * @typedef {object} IdScope
 * @property {(id: string) => string} [id]  - Rewrite an `id` attribute value.
 * @property {(ref: string) => string} [ref] - Rewrite a `url(#…)` / `#…` reference value.
 */

/**
 * @typedef {{ build: (node: NodeDesc, opts?: { idScope?: IdScope }) => SVGElement, SVG_TAGS: Set<string> }} SvgBuildAPI
 */

export const svgBuildModule = {
    name: 'graphic.svgBuild',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['dom', 'graphic.svgApply'],
    deps: [dom, svgApplyModule],

    /**
     * @param {object} dom - fw `dom` module (unused directly; declared so the
     *   descriptor's `deps`/`dependencies` stay aligned and `svgApply` resolves).
     * @param {import('./apply.js').SvgApplyAPI} svgApply - Frozen `graphic.svgApply` return.
     * @returns {SvgBuildAPI}
     */
    factory(dom, svgApply) {
        // Frozen namespace source — do NOT hardcode a 2nd SVG_NS constant here.
        const { SVG_NS, svgAttr } = svgApply;

        /**
         * Whitelisted SVG element set: shapes + containers + defs/gradients/
         * filters. Defined in-factory (capture-free). Extending it is a one-line
         * edit here, mirrored in the doc — never accept arbitrary tags.
         */
        const SVG_TAGS = new Set([
            'svg', 'g', 'defs', 'symbol', 'use',
            'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
            'text', 'tspan', 'image',
            'clipPath', 'mask',
            'linearGradient', 'radialGradient', 'stop',
            'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix',
            'feMerge', 'feMergeNode', 'feFlood', 'feComposite',
            'marker', 'pattern',
        ]);

        /**
         * True when a reference-carrying attribute value should route through the
         * scope's `ref` rewriter: `url(#…)` and bare `#…` fragment references.
         *
         * @param {string} value
         * @returns {boolean}
         */
        const isRef = (value) =>
            typeof value === 'string' &&
            (value.startsWith('#') || value.startsWith('url(#'));

        /**
         * Apply the optional `idScope` to an attribute value: `id` attrs route
         * through `scope.id`, reference-shaped values through `scope.ref`. When
         * the scope (or the relevant hook) is absent, the value passes through
         * verbatim.
         *
         * @param {string} name
         * @param {string|number} value
         * @param {IdScope|undefined} scope
         * @returns {string|number}
         */
        const scopeValue = (name, value, scope) => {
            if (!scope) return value;
            if (name === 'id' && typeof scope.id === 'function') {
                return scope.id(String(value));
            }
            if (typeof scope.ref === 'function' && isRef(/** @type {string} */(value))) {
                return scope.ref(String(value));
            }
            return value;
        };

        /**
         * Recursively construct a namespace-correct `SVGElement` subtree from a
         * plain JSON descriptor.
         *
         * @param {NodeDesc} node - `{ tag, attrs?, children?, text? }`.
         * @param {{ idScope?: IdScope }} [opts] - Optional build options; `idScope`
         *   (from `graphic.scopedIds`) rewrites `id`/`url(#…)` values.
         * @returns {SVGElement}
         * @throws {Error} When `node.tag` is not in the `SVG_TAGS` whitelist.
         */
        function build(node, opts) {
            const tag = node && node.tag;
            if (!SVG_TAGS.has(tag)) {
                throw new Error(`svgBuild: unsupported tag "${tag}"`);
            }

            const scope = opts && opts.idScope;
            const el = document.createElementNS(SVG_NS, tag);

            if (node.attrs) {
                for (const name of Object.keys(node.attrs)) {
                    const value = scopeValue(name, node.attrs[name], scope);
                    // Single frozen write path — coerces to String internally.
                    svgAttr(el, name, value);
                }
            }

            if (node.children) {
                for (const child of node.children) {
                    if (typeof child === 'string') {
                        el.appendChild(document.createTextNode(child));
                    } else {
                        el.appendChild(build(child, opts));
                    }
                }
            }

            if (node.text !== undefined) {
                el.textContent = String(node.text);
            }

            return el;
        }

        return { build, SVG_TAGS };
    },
};
