// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Form-field tree walker per ISO 32000-2:2020 §12.7.4.
 *
 * @module pdf/form/fieldTree
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfFieldTree = {
    name: 'pdfFieldTree',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const INHERITABLE = new Set(['FT', 'Ff', 'V', 'DV', 'DA', 'Q', 'MaxLen']);

        function isFieldKidsArray(kids, resolveRef) {
            if (!kids || kids.type !== 'array' || kids.items.length === 0) return false;
            const first = kids.items[0];
            if (!first || first.type !== 'ref') return false;
            let resolved;
            try { resolved = resolveRef(first); } catch (_e) { return false; }
            if (!isType(resolved, 'dict')) return false;
            return !!resolved.entries.T;
        }

        function walkFieldTree(rootRefs, resolveRef, opts) {
            const maxDepth  = (opts && opts.maxDepth)  || 32;
            const maxFields = (opts && opts.maxFields) || 100000;
            if (!Array.isArray(rootRefs)) {
                throw new ParseError('pdf/form/tree/bad-roots',
                    'rootRefs must be an array',
                    { context: { 'type': typeof rootRefs } });
            }
            const out = [];
            const visited = new Set();
            for (const r of rootRefs) walk(r, [], 0);
            return out;

            function walk(ref, ancestors, depth) {
                if (depth > maxDepth) {
                    throw new ParseError('pdf/form/tree/max-depth',
                        'field tree depth limit exceeded',
                        { context: { depth, maxDepth } });
                }
                if (!ref || typeof ref.num !== 'number') {
                    throw new ParseError('pdf/form/tree/bad-ref',
                        'field reference is malformed',
                        { context: { ref } });
                }
                const key = ref.num + ':' + ref.gen;
                if (visited.has(key)) {
                    throw new ParseError('pdf/form/tree/cycle',
                        'cycle detected in field tree',
                        { context: { ref } });
                }
                visited.add(key);

                const node = resolveRef({ type: 'ref', num: ref.num, gen: ref.gen });
                if (!isType(node, 'dict')) {
                    throw new ParseError('pdf/form/tree/not-dict',
                        'field tree node is not a dict',
                        { context: { ref } });
                }

                const kids = node.entries.Kids;
                const isTerminal = !isFieldKidsArray(kids, resolveRef);

                out.push({
                    ref: { num: ref.num, gen: ref.gen },
                    node,
                    ancestors: ancestors.slice(),
                    terminal: isTerminal
                });
                if (out.length > maxFields) {
                    throw new ParseError('pdf/form/tree/too-many',
                        'field count limit exceeded',
                        { context: { maxFields } });
                }

                if (isTerminal) return;
                const nextAncestors = ancestors.concat([node]);
                for (const k of kids.items) {
                    if (k.type !== 'ref') {
                        throw new ParseError('pdf/form/tree/non-ref-kid',
                            'field /Kids entries must be indirect refs',
                            { context: { kind: k.type } });
                    }
                    walk({ num: k.num, gen: k.gen }, nextAncestors, depth + 1);
                }
            }
        }

        function getInherited(node, ancestors, key) {
            if (!INHERITABLE.has(key)) return undefined;
            if (node && node.entries && node.entries[key] !== undefined) {
                return node.entries[key];
            }
            for (let i = ancestors.length - 1; i >= 0; i--) {
                const a = ancestors[i];
                if (a && a.entries && a.entries[key] !== undefined) return a.entries[key];
            }
            return undefined;
        }

        return { walkFieldTree, getInherited };
    }
};
