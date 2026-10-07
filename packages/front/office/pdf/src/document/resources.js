// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Resource dictionary resolution per ISO 32000-2:2020
 * §7.8.3.
 *
 * A Page (or Form XObject) carries a `/Resources` dict with six
 * named sub-dicts that map local names (used in content streams) to
 * indirect references:
 *
 * | Sub-dict      | Maps to                          |
 * |---------------|----------------------------------|
 * | `/Font`       | Font dicts                       |
 * | `/XObject`    | Image / Form XObjects            |
 * | `/ColorSpace` | ColorSpace arrays / refs         |
 * | `/ExtGState`  | ExtGState dicts                  |
 * | `/Pattern`    | Pattern dicts                    |
 * | `/Shading`    | Shading dicts                    |
 *
 * A `/ProcSet` array exists for legacy PDFs and is read but never
 * required at L2 (the spec deprecates it in PDF 2.0).
 *
 * Resources are **inheritable**: a Page that lacks `/Resources` of its
 * own inherits from its `/Parent` chain in the page tree (§7.7.3.4).
 *
 * @module pdf/document/resources
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfResources = {
    name: 'pdfResources',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserObjMod) {
        const { ParseError } = errors;
        const isType = (parserObjMod && parserObjMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const CATEGORIES = ['Font', 'XObject', 'ColorSpace', 'ExtGState', 'Pattern', 'Shading'];

        /**
         * Type a `/Resources` dictionary into its six category maps.
         *
         * A category value (`/Font`, `/ExtGState`, …) may itself be an
         * indirect reference (ISO 32000-2 §7.3.10 — any object may be
         * indirect); when `resolveRef` is supplied such a reference is
         * resolved through it (the document's own resolver, which reaches
         * objects inside object streams). Without a resolver a referenced
         * category is rejected as before (`pdf/resources/bad-subdict`).
         *
         * @param {object|null} dict Typed `/Resources` dict, or `null`.
         * @param {(ref: object) => object} [resolveRef] Indirect-ref resolver.
         * @returns {object} The typed `Resources` shape.
         */
        function typeResources(dict, resolveRef) {
            const out = {
                Font: {}, XObject: {}, ColorSpace: {},
                ExtGState: {}, Pattern: {}, Shading: {},
                ProcSet: null,
                raw: dict || null
            };
            if (!dict) return out;
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/resources/not-dict',
                    '/Resources must be a dictionary',
                    { context: { type: dict.type } });
            }
            for (const cat of CATEGORIES) {
                let sub = dict.entries[cat];
                if (!sub) continue;
                if (sub.type === 'ref' && typeof resolveRef === 'function') {
                    sub = resolveRef(sub);
                    if (!sub || sub.type === 'null') continue;
                }
                if (sub.type !== 'dict') {
                    throw new ParseError('pdf/resources/bad-subdict',
                        `/${cat} entry must be a dictionary`,
                        { context: { category: cat, type: sub.type } });
                }
                out[cat] = { ...sub.entries };
            }
            if (dict.entries.ProcSet && dict.entries.ProcSet.type === 'array') {
                out.ProcSet = dict.entries.ProcSet.items
                    .filter(it => it.type === 'name')
                    .map(it => it.value);
            }
            return out;
        }

        function resolvePageResources(pageDict, resolveRef) {
            let node = pageDict;
            const visited = new Set();
            for (let safety = 0; safety < 64; safety++) {
                if (!isType(node, 'dict')) break;
                if (node.entries.Resources) {
                    const r = node.entries.Resources;
                    if (r.type === 'ref') return typeResources(resolveRef(r), resolveRef);
                    if (r.type === 'dict') return typeResources(r, resolveRef);
                    throw new ParseError('pdf/resources/bad-shape',
                        '/Resources must be a dict or indirect ref',
                        { context: { type: r.type } });
                }
                const parent = node.entries.Parent;
                if (!parent || parent.type !== 'ref') break;
                const key = parent.num + ':' + parent.gen;
                if (visited.has(key)) {
                    throw new ParseError('pdf/resources/cycle',
                        'cycle in page-tree parent chain',
                        { context: { ref: parent } });
                }
                visited.add(key);
                node = resolveRef(parent);
            }
            return typeResources(null);
        }

        function lookupResource(resources, category, name, resolveRef) {
            const cat = resources[category];
            if (!cat) {
                throw new ParseError('pdf/resources/unknown-category',
                    `unknown resource category "${category}"`,
                    { context: { category } });
            }
            const entry = cat[name];
            if (!entry) {
                throw new ParseError('pdf/resources/missing-name',
                    `resource /${category} /${name} not found`,
                    { context: { category, name, available: Object.keys(cat) } });
            }
            if (entry.type === 'ref' && typeof resolveRef === 'function') {
                return resolveRef(entry);
            }
            return entry;
        }

        return { typeResources, resolvePageResources, lookupResource };
    }
};
