// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shared helper factory for the catch-all `*-misc`
 * passthrough extras. Each misc extra recognises a fixed prefix
 * (`text:`, `style:`, `draw:`, `table:`, `office:`) and converts unknown
 * elements to typed `{ _passthrough: true, kind, attrs, children }`
 * bags. Render reverses.
 *
 * Exposed as a worker-safe factory (`odfMiscHelper`) so each misc extra
 * resolves it via DI and parametrizes it with its own `ELEMENTS` set +
 * namespace prefix. The factory is stateless — `buildMiscPassthrough`
 * returns a fresh closure on every call.
 *
 * The legacy named export `buildMiscPassthrough(xml, elementNames, ns)`
 * is preserved for any direct ESM consumer (and the sibling test).
 *
 * Implementation note : the factory body inlines the helper logic so
 * `factory.toString()` (used by the prebuild generator) remains
 * self-contained — no reference to a module-level closure.
 *
 * @module odf/extra/_misc-helper
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const odfMiscHelper = {
    name: 'odfMiscHelper',
    dependencies: ['xml'],
    deps: [xml],
    factory(xml) {
        function build(elementNames, ns) {
            function parseChildren(children) {
                const out = [];
                for (const c of children || []) {
                    if (c && c.type === 'element' && elementNames.has(c.name)) {
                        out.push(parseElement(c));
                    } else {
                        out.push(c);
                    }
                }
                return out;
            }
            function parseElement(el) {
                if (!el || el.type !== 'element' || !elementNames.has(el.name)) return null;
                const kind = el.name.startsWith(ns) ? el.name.slice(ns.length) : el.name;
                return {
                    _passthrough: true,
                    kind,
                    attrs: { ...(el.attrs || {}) },
                    children: parseChildren(el.children)
                };
            }
            function renderChildren(children) {
                const out = [];
                for (const c of children || []) {
                    if (c && c._passthrough && c.kind != null) {
                        out.push(renderElement(c));
                    } else {
                        out.push(c);
                    }
                }
                return out;
            }
            function renderElement(obj) {
                if (!obj || obj.kind == null) return null;
                const name = obj.kind.includes(':') ? obj.kind : (ns + obj.kind);
                return xml.el(name, { ...(obj.attrs || {}) }, renderChildren(obj.children));
            }
            function isCovered(name) { return elementNames.has(name); }
            return { parseElement, renderElement, isCovered, ELEMENTS: elementNames };
        }
        return {
            /**
             * @param {Set<string>} elementNames
             * @param {string} ns - namespace prefix incl. colon
             */
            buildMiscPassthrough(elementNames, ns) {
                return build(elementNames, ns);
            }
        };
    }
};

/**
 * Legacy ESM helper — preserved for direct importers. Equivalent to
 * `odfMiscHelper.factory(xml).buildMiscPassthrough(elementNames, ns)`.
 *
 * @param {Object} xml - xml factory instance
 * @param {Set<string>} elementNames - qualified names recognised
 * @param {string} ns - namespace prefix incl. colon
 */
export function buildMiscPassthrough(xml, elementNames, ns) {
    return odfMiscHelper.factory(xml).buildMiscPassthrough(elementNames, ns);
}
