// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Outline (bookmarks) tree walker per ISO 32000-2:2020
 * §12.3.3.
 *
 * The outline is a doubly-linked tree of `/Type /Outlines` (root) and
 * outline items. Each item carries `/Title`, `/Parent`, `/Prev`, `/Next`,
 * `/First`, `/Last`, `/Count`, `/A` (action), `/Dest`, `/C` (color, 3
 * numbers), `/F` (style flags). `/SE` (structure element) is deprecated.
 *
 * `walkOutline(rootDict, resolveRef)` returns a flat depth-first list of
 * typed records:
 *   `{ ref, title, dest?, action?, count?, parent, prev, next, first,
 *      last, color?, F?, _extras }`
 *
 * The caller resolves indirect refs; the walker enforces cycle
 * detection and maxDepth, similarly to pageTree.
 *
 * @module pdf/outline/outline
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfOutline = {
    name: 'pdfOutline',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN = new Set([
            'Title', 'Parent', 'Prev', 'Next', 'First', 'Last',
            'Count', 'A', 'Dest', 'SE', 'C', 'F', 'Type'
        ]);

        function typeOutlineItem(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/outline/item/not-dict',
                    'outline item must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (!e.Title || e.Title.type !== 'string') {
                throw new ParseError('pdf/outline/missing-title',
                    'outline item missing /Title string',
                    { context: { type: e.Title && e.Title.type } });
            }
            const out = { title: e.Title.value, raw: dict, _extras: {} };
            if (e.Parent && e.Parent.type === 'ref') out.parent = e.Parent;
            if (e.Prev   && e.Prev.type   === 'ref') out.prev   = e.Prev;
            if (e.Next   && e.Next.type   === 'ref') out.next   = e.Next;
            if (e.First  && e.First.type  === 'ref') out.first  = e.First;
            if (e.Last   && e.Last.type   === 'ref') out.last   = e.Last;
            if (e.Count  && (e.Count.type === 'int' || e.Count.type === 'real')) {
                out.count = e.Count.value | 0;
            }
            if (e.A)    out.action = e.A;
            if (e.Dest) out.dest   = e.Dest;
            if (e.C && e.C.type === 'array') {
                const c = e.C.items.filter((x) => x.type === 'int' || x.type === 'real')
                    .map((x) => x.value);
                if (c.length === 3) out.color = c;
            }
            if (e.F && (e.F.type === 'int' || e.F.type === 'real')) {
                out.F = e.F.value | 0;
            }
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function walkOutline(rootDict, resolveRef, opts) {
            if (!isType(rootDict, 'dict')) {
                throw new ParseError('pdf/outline/not-dict',
                    'outline root must be a dictionary',
                    { context: { type: rootDict && rootDict.type } });
            }
            const maxDepth = (opts && opts.maxDepth) || 64;
            const maxItems = (opts && opts.maxItems) || 100000;
            const out = [];
            const visited = new Set();
            const first = rootDict.entries.First;
            if (!first) return out;
            if (first.type !== 'ref') {
                throw new ParseError('pdf/outline/bad-first',
                    '/First must be an indirect reference',
                    { context: { type: first.type } });
            }
            if (typeof resolveRef !== 'function') {
                throw new ParseError('pdf/outline/no-resolver',
                    'walkOutline requires a resolveRef function');
            }

            function walkSiblings(ref, depth) {
                if (depth > maxDepth) {
                    throw new ParseError('pdf/outline/max-depth',
                        'outline depth limit exceeded',
                        { context: { depth, maxDepth } });
                }
                let cur = ref;
                let guard = 0;
                while (cur) {
                    if (cur.type !== 'ref') {
                        throw new ParseError('pdf/outline/non-ref-sibling',
                            'outline sibling must be an indirect ref',
                            { context: { kind: cur.type } });
                    }
                    const key = cur.num + ':' + cur.gen;
                    if (visited.has(key)) {
                        throw new ParseError('pdf/outline/cycle',
                            'cycle detected in outline siblings',
                            { context: { ref: cur } });
                    }
                    visited.add(key);

                    const node = resolveRef(cur);
                    if (!isType(node, 'dict')) {
                        throw new ParseError('pdf/outline/not-dict',
                            'outline item must be a dictionary',
                            { context: { ref: cur } });
                    }
                    const rec = typeOutlineItem(node);
                    rec.ref = { num: cur.num, gen: cur.gen };
                    out.push(rec);
                    if (out.length > maxItems) {
                        throw new ParseError('pdf/outline/too-many',
                            'outline item limit exceeded',
                            { context: { maxItems } });
                    }

                    if (rec.first) walkSiblings(rec.first, depth + 1);

                    cur = rec.next || null;
                    if (++guard > maxItems) {
                        throw new ParseError('pdf/outline/runaway',
                            'outline sibling chain exceeded item cap');
                    }
                }
            }

            walkSiblings(first, 0);
            return out;
        }

        return { walkOutline, typeOutlineItem };
    }
};
