// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Markup Compatibility — ECMA-376 part 3.
 *
 * Office formats let producers offer **alternative content** for
 * features that didn't exist in older versions, plus **ignorable**
 * extensions that older readers should silently skip. Without
 * processing these, a strict parser breaks on every modern `.docx` /
 * `.xlsx` / `.pptx` (w14 / w15 / x14 / p14 extensions are
 * ubiquitous since Office 2010).
 *
 * Three constructs are covered :
 *
 * | Construct | Effect |
 * |-----------|--------|
 * | `mc:AlternateContent` | Wraps `mc:Choice Requires="prefix"` branches and an `mc:Fallback`. The first Choice whose required prefixes are all "supported" wins ; otherwise Fallback is used. |
 * | `mc:Ignorable` (attr) | Lists prefixes whose elements/attributes can be safely dropped if not understood. Inherited down the tree. |
 * | `mc:ProcessContent` (attr) | Lists element names whose **content** should still be processed even if the wrapping element itself is ignored. |
 *
 * Reference : ECMA-376 part 3 §10.
 *
 * Document model — none ; this module operates by mutating an XML
 * tree in place. The returned tree contains no `mc:*` constructs.
 *
 * @module ooxml/mc
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const markupCompatibility = {
    name: 'markupCompatibility',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

        /**
         * Walk an XML tree and rewrite all MC constructs in place.
         *
         * @param {object} root XML element node (as produced by
         *                      `xml.parse`).
         * @param {object} [options]
         * @param {string[]} [options.supportedPrefixes=[]] Namespace
         *     prefixes the caller declares as "understood". A
         *     `mc:Choice` is selected when **all** its required
         *     prefixes are in this list.
         * @param {boolean} [options.preserveAlternateContent=false]
         *     When `true`, AlternateContent elements are left untouched
         *     (only `mc:Ignorable` attribute stripping happens).
         * @param {string[]} [options.keepElements=[]] Qualified element
         *     names (`prefix:localName`) that survive even when their
         *     prefix is ignorable, together with their whole subtree
         *     (attributes and descendants included: no ignorable-prefix
         *     dropping happens inside a kept element). Matching is by
         *     prefix, like the rest of this module: a document binding
         *     the same namespace to another prefix is not recognised.
         * @returns {object} the same `root` (mutated).
         */
        function process(root, options) {
            const opts = {
                supportedPrefixes: [],
                preserveAlternateContent: false,
                keepElements: [],
                ...(options || {})
            };
            if (!Array.isArray(opts.keepElements)) opts.keepElements = [];
            walk(root, new Set(), opts, false);
            return root;
        }

        function walk(node, ignorable, opts, kept) {
            if (!node || node.type !== 'element') return;

            // Pick up mc:Ignorable on this node, scoped to its subtree.
            // Inside a kept element nothing is ignorable.
            const localIgnorable = kept
                ? ignorable
                : pickIgnorable(node, ignorable, opts);
            // Capture mc:ProcessContent before stripping mc:* attributes.
            const processContent = parseSpaceSep(
                node.attrs && node.attrs['mc:ProcessContent']);

            // Strip mc:* attributes + attributes from ignorable namespaces.
            const attrKeys = Object.keys(node.attrs || {});
            for (const k of attrKeys) {
                if (isMcAttr(k)) delete node.attrs[k];
                else if (localIgnorable.size && hasPrefix(k, localIgnorable)) {
                    delete node.attrs[k];
                }
            }

            if (!node.children || !node.children.length) return;

            const out = [];
            for (const child of node.children) {
                if (child.type !== 'element') {
                    out.push(child);
                    continue;
                }
                if (child.name === 'mc:AlternateContent'
                    && !opts.preserveAlternateContent) {
                    const replacement = resolveAlternateContentRecursive(child, opts);
                    for (const r of replacement) {
                        walk(r, localIgnorable, opts, kept);
                        out.push(r);
                    }
                    continue;
                }
                if (opts.keepElements.includes(child.name)) {
                    // Listed element: kept with its whole subtree.
                    walk(child, new Set(), opts, true);
                    out.push(child);
                    continue;
                }
                if (localIgnorable.size && hasPrefix(child.name, localIgnorable)) {
                    // Element from an ignorable namespace : drop the wrapper.
                    // If its tag is in mc:ProcessContent, surface its children
                    // up to this level (still recursively cleaned).
                    if (processContent.includes(child.name)) {
                        for (const grand of (child.children || [])) {
                            if (grand.type === 'element') {
                                walk(grand, localIgnorable, opts, kept);
                            }
                            out.push(grand);
                        }
                    }
                    continue;
                }
                walk(child, localIgnorable, opts, kept);
                out.push(child);
            }
            node.children = out;
        }

        function parseSpaceSep(s) {
            if (!s) return [];
            return String(s).split(/\s+/).filter(Boolean);
        }

        function pickIgnorable(node, parentSet, opts) {
            const ig = node.attrs && node.attrs['mc:Ignorable'];
            if (!ig) return parentSet;
            const merged = new Set(parentSet);
            for (const prefix of String(ig).split(/\s+/).filter(Boolean)) {
                if (!opts.supportedPrefixes.includes(prefix)) {
                    merged.add(prefix);
                }
            }
            return merged;
        }

        function isMcAttr(name) {
            return name === 'mc:Ignorable'
                || name === 'mc:PreserveElements'
                || name === 'mc:PreserveAttributes'
                || name === 'mc:MustUnderstand'
                || name === 'mc:ProcessContent';
        }

        function hasPrefix(name, prefixSet) {
            const colon = name.indexOf(':');
            if (colon <= 0) return false;
            return prefixSet.has(name.slice(0, colon));
        }

        // Recursively unwrap nested <mc:AlternateContent> in a resolution result.
        function resolveAlternateContentRecursive(altEl, opts) {
            const direct = resolveAlternateContent(altEl, opts);
            const out = [];
            for (const e of direct) {
                if (e.type === 'element' && e.name === 'mc:AlternateContent'
                    && !opts.preserveAlternateContent) {
                    for (const inner of resolveAlternateContentRecursive(e, opts)) {
                        out.push(inner);
                    }
                } else {
                    out.push(e);
                }
            }
            return out;
        }

        /**
         * Pick a single replacement set of children for an
         * `<mc:AlternateContent>` element.
         *
         * Selection order (per ECMA-376 part 3 §10.1.2.4) :
         *   1. First `<mc:Choice Requires="...">` whose every required
         *      prefix is in `options.supportedPrefixes`.
         *   2. `<mc:Fallback>` content.
         *   3. Empty.
         */
        function resolveAlternateContent(altEl, opts) {
            const choices = (altEl.children || []).filter(
                c => c.type === 'element' && c.name === 'mc:Choice');
            for (const choice of choices) {
                const requires = String(choice.attrs.Requires || '')
                    .split(/\s+/).filter(Boolean);
                if (requires.every(p => opts.supportedPrefixes.includes(p))) {
                    return (choice.children || []).filter(
                        c => c.type === 'element');
                }
            }
            const fallback = (altEl.children || []).find(
                c => c.type === 'element' && c.name === 'mc:Fallback');
            if (fallback) {
                return (fallback.children || []).filter(
                    c => c.type === 'element');
            }
            return [];
        }

        // --- Producer side: build AlternateContent wrappers ---

        /**
         * Build an `<mc:AlternateContent>` element wrapping one or
         * more Choices and an optional Fallback.
         *
         * @example
         * mc.wrapAlternateContent({
         *   choices: [
         *     { requires: 'w14', element: w14Extension }
         *   ],
         *   fallback: vanillaElement
         * });
         */
        function wrapAlternateContent({ choices, fallback }) {
            const children = [];
            for (const c of choices || []) {
                const inner = Array.isArray(c.element)
                    ? c.element : (c.element ? [c.element] : []);
                children.push(xml.el('mc:Choice',
                    { Requires: String(c.requires || '') }, inner));
            }
            if (fallback !== undefined) {
                const inner = Array.isArray(fallback)
                    ? fallback : (fallback ? [fallback] : []);
                children.push(xml.el('mc:Fallback', {}, inner));
            }
            return xml.el('mc:AlternateContent', {}, children);
        }

        /**
         * Add `mc:Ignorable="<prefixes>"` and the matching
         * `xmlns:mc=...` declaration to a root element. No-op if both
         * are already present.
         */
        function setIgnorable(rootEl, prefixes) {
            if (!rootEl || rootEl.type !== 'element') return rootEl;
            const list = Array.isArray(prefixes)
                ? prefixes.join(' ')
                : String(prefixes);
            if (!rootEl.attrs['xmlns:mc']) {
                rootEl.attrs['xmlns:mc'] = MC_NS;
            }
            const existing = rootEl.attrs['mc:Ignorable'];
            if (!existing) {
                rootEl.attrs['mc:Ignorable'] = list;
            } else {
                const set = new Set(existing.split(/\s+/).filter(Boolean));
                for (const p of list.split(/\s+/).filter(Boolean)) set.add(p);
                rootEl.attrs['mc:Ignorable'] = [...set].join(' ');
            }
            return rootEl;
        }

        return {
            process, wrapAlternateContent, setIgnorable,
            MC_NS
        };
    }
};
