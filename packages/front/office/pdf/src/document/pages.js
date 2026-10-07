// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Page-tree walker per ISO 32000-2:2020 §7.7.3.
 *
 * The page tree is a balanced tree of `/Type /Pages` nodes whose leaves
 * are `/Type /Page` dicts. Internal nodes carry `/Kids` (an array of
 * refs) and `/Count` (number of leaves in the subtree). The catalog
 * holds a reference to the root.
 *
 * This module walks an already-resolved tree (the caller passes a
 * `resolveRef(ref) → obj` function) and produces an ordered list of
 * page refs.
 *
 * @module pdf/document/pages
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfPages = {
    name: 'pdfPages',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        function walkPageTree(rootRef, resolveRef, opts) {
            const maxDepth = (opts && opts.maxDepth) || 64;
            const maxPages = (opts && opts.maxPages) || 200000;
            const out = [];
            const visited = new Set();
            walk(rootRef, 0);
            return out;

            function walk(ref, depth) {
                if (depth > maxDepth) {
                    throw new ParseError('pdf/pages/max-depth',
                        'page tree depth limit exceeded',
                        { context: { depth, maxDepth } });
                }
                const key = ref.num + ':' + ref.gen;
                if (visited.has(key)) {
                    throw new ParseError('pdf/pages/cycle',
                        'cycle detected in page tree',
                        { context: { ref } });
                }
                visited.add(key);

                const node = resolveRef({ type: 'ref', num: ref.num, gen: ref.gen });
                if (!isType(node, 'dict')) {
                    throw new ParseError('pdf/pages/not-dict',
                        'page tree node is not a dict',
                        { context: { ref } });
                }
                const t = node.entries.Type;
                const isPage = (t && t.type === 'name' && t.value === 'Page')
                    || (!node.entries.Kids && !t);
                if (isPage) {
                    out.push({ num: ref.num, gen: ref.gen });
                    if (out.length > maxPages) {
                        throw new ParseError('pdf/pages/too-many',
                            'page count limit exceeded',
                            { context: { maxPages } });
                    }
                    return;
                }

                const kids = node.entries.Kids;
                if (!kids || kids.type !== 'array') {
                    throw new ParseError('pdf/pages/missing-kids',
                        'intermediate page tree node missing /Kids array',
                        { context: { ref, hasKids: !!kids } });
                }
                for (const k of kids.items) {
                    if (k.type !== 'ref') {
                        throw new ParseError('pdf/pages/non-ref-kid',
                            'page tree /Kids entries must be indirect refs',
                            { context: { kind: k.type } });
                    }
                    walk({ num: k.num, gen: k.gen }, depth + 1);
                }
            }
        }

        function readPageCount(node) {
            if (!isType(node, 'dict')) return null;
            const c = node.entries.Count;
            if (!c || (c.type !== 'int' && c.type !== 'real')) return null;
            return c.value | 0;
        }

        return { walkPageTree, readPageCount };
    }
};
