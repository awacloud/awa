// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shared helper factory for typed extras that recognise a
 * fixed set of qualified element names (e.g. `chart:*`, `anim:*`,
 * `form:*`) and convert each to a typed
 * `{ type, kind, attrs, children? }` bag.
 *
 * Unlike `_misc-helper.js`, the produced bag carries a stable `type`
 * tag and `children` is only present when non-empty.
 *
 * Exposed as a worker-safe factory (`odfTypedHelper`). The legacy named
 * export `buildTypedFamily(xml, elementNames, ns, typeTag)` is preserved
 * for direct ESM consumers and the sibling test.
 *
 * Implementation note : the factory body inlines the helper logic so
 * `factory.toString()` (used by the prebuild generator) remains
 * self-contained — no reference to a module-level closure.
 *
 * @module odf/extra/_typed-helper
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const odfTypedHelper = {
    name: 'odfTypedHelper',
    dependencies: ['xml'],
    deps: [xml],
    factory(xml) {
        function build(elementNames, ns, typeTag, opts) {
            const passthrough = !!(opts && opts.passthrough);
            function parseElement(el) {
                if (!el || el.type !== 'element' || !elementNames.has(el.name)) return null;
                const kids = [];
                for (const c of el.children || []) {
                    if (c && c.type === 'element' && elementNames.has(c.name)) {
                        kids.push(parseElement(c));
                    } else { kids.push(c); }
                }
                const kind = el.name.startsWith(ns) ? el.name.slice(ns.length) : el.name;
                const out = { type: typeTag, kind, attrs: { ...(el.attrs || {}) } };
                if (passthrough) out._passthrough = true;
                if (kids.length) out.children = kids;
                return out;
            }
            function renderElement(obj) {
                if (!obj || obj.kind == null) return null;
                const name = obj.kind.includes(':') ? obj.kind : (ns + obj.kind);
                const kids = [];
                for (const c of obj.children || []) {
                    if (c && c.type === typeTag) kids.push(renderElement(c));
                    else kids.push(c);
                }
                return xml.el(name, { ...(obj.attrs || {}) }, kids);
            }
            function isCovered(name) { return elementNames.has(name); }
            return { parseElement, renderElement, isCovered, ELEMENTS: elementNames };
        }
        return {
            /**
             * @param {Set<string>} elementNames
             * @param {string} ns - namespace prefix incl. colon
             * @param {string} typeTag - value of the produced `type` field
             * @param {{ passthrough?: boolean }} [opts] - when
             *   `passthrough: true`, each parsed bag also carries
             *   `_passthrough: true` (used by `databaseSources`).
             */
            buildTypedFamily(elementNames, ns, typeTag, opts) {
                return build(elementNames, ns, typeTag, opts);
            }
        };
    }
};

/**
 * Legacy ESM helper — preserved for direct importers. Equivalent to
 * `odfTypedHelper.factory(xml).buildTypedFamily(elementNames, ns, typeTag)`.
 *
 * @param {Object} xml - xml factory instance
 * @param {Set<string>} elementNames - qualified names recognised
 * @param {string} ns - namespace prefix incl. colon
 * @param {string} typeTag - value of the produced `type` field
 */
export function buildTypedFamily(xml, elementNames, ns, typeTag, opts) {
    return odfTypedHelper.factory(xml).buildTypedFamily(elementNames, ns, typeTag, opts);
}
