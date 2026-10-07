// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Number-tree walker for `/ParentTree` per ISO 32000-2:2020
 * §7.9.7 and §14.7.4.
 *
 * The structure tree's `/ParentTree` is a number tree mapping integer
 * keys (the `/StructParents` or `/StructParent` values found on pages
 * and annotations / content-stream objects) to:
 *
 *   - a StructElem reference (annotations / form XObjects, where a
 *     single MCID/object owns the parent), or
 *   - an array of StructElem references indexed by MCID (pages, where
 *     each MCID on the page has its own parent).
 *
 * A number-tree node is a dict with either `/Nums` (leaf) or `/Kids`
 * (intermediate). Intermediate nodes carry `/Limits` (2-int array)
 * giving the inclusive key range of the subtree.
 *
 * @module pdf/tagged/parentTree
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfParentTree = {
    name: 'pdfParentTree',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        function lookupParent(tree, key, resolveRef, opts) {
            const maxDepth = (opts && opts.maxDepth) || 32;
            let node = tree;
            if (node && node.type === 'ref') node = resolveRef(node);
            return walk(node, 0);

            function walk(n, depth) {
                if (depth > maxDepth) {
                    throw new ParseError('pdf/tagged/parent-tree/max-depth',
                        'number tree depth limit exceeded',
                        { context: { depth, maxDepth } });
                }
                if (!isType(n, 'dict')) {
                    throw new ParseError('pdf/tagged/parent-tree/not-dict',
                        'number tree node is not a dict',
                        { context: { kind: n && n.type } });
                }
                const nums = n.entries.Nums;
                const kids = n.entries.Kids;

                if (nums && nums.type === 'array') {
                    return findInNums(nums.items, key);
                }
                if (kids && kids.type === 'array') {
                    for (const k of kids.items) {
                        if (k.type !== 'ref') {
                            throw new ParseError('pdf/tagged/parent-tree/non-ref-kid',
                                'number-tree /Kids entries must be indirect refs',
                                { context: { kind: k.type } });
                        }
                        const child = resolveRef(k);
                        if (!isType(child, 'dict')) {
                            throw new ParseError('pdf/tagged/parent-tree/bad-child',
                                'number-tree kid did not resolve to dict',
                                { context: { ref: k } });
                        }
                        if (inLimits(child.entries.Limits, key)) {
                            return walk(child, depth + 1);
                        }
                    }
                    return null;
                }
                throw new ParseError('pdf/tagged/parent-tree/empty-node',
                    'number tree node has neither /Nums nor /Kids',
                    { context: {} });
            }
        }

        function findInNums(items, key) {
            if (items.length % 2 !== 0) {
                throw new ParseError('pdf/tagged/parent-tree/bad-nums',
                    '/Nums must have an even number of entries',
                    { context: { len: items.length } });
            }
            for (let i = 0; i < items.length; i += 2) {
                const k = items[i];
                if (!k || (k.type !== 'int' && k.type !== 'real')) {
                    throw new ParseError('pdf/tagged/parent-tree/bad-key',
                        '/Nums key must be a number',
                        { context: { kind: k && k.type } });
                }
                if ((k.value | 0) === key) return items[i + 1];
            }
            return null;
        }

        function inLimits(limits, key) {
            if (!limits) return true;
            if (limits.type !== 'array' || limits.items.length !== 2) {
                throw new ParseError('pdf/tagged/parent-tree/bad-limits',
                    '/Limits must be a 2-element array of integers',
                    { context: { kind: limits.type } });
            }
            const lo = limits.items[0];
            const hi = limits.items[1];
            if (!lo || !hi || (lo.type !== 'int' && lo.type !== 'real')
                           || (hi.type !== 'int' && hi.type !== 'real')) {
                throw new ParseError('pdf/tagged/parent-tree/bad-limits',
                    '/Limits entries must be numbers',
                    { context: {} });
            }
            return key >= (lo.value | 0) && key <= (hi.value | 0);
        }

        return { lookupParent };
    }
};
