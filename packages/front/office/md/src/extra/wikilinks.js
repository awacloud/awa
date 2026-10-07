// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : `[[Page Name]]` wiki links.
 *
 * Syntax :
 *   - `[[Page Name]]` → link to `page-name` with text "Page Name".
 *   - `[[Page|alias]]` → link to `page` with text "alias".
 *   - `[[Page#section|alias]]` → link to `page#section` with text "alias".
 *
 * Strategy : post-parse AST pass — concat adjacent text nodes, scan
 * for `[[…]]`, replace with `link` nodes.
 *
 * Strict factory-only. `factory(...)` returns `{ name, install,
 * defaultSlugify, expandWikilinksInAst }`.
 *
 * @module md/extra/wikilinks
 */

import { mdNode } from '../ast/node.js';
import { mdAstWalker } from '../ast/walker.js';
import { mdAstTypes } from '../ast/types.js';

export const mdWikilinks = {
    name: 'mdWikilinks',
    dependencies: ['mdNode', 'mdAstWalker', 'mdAstTypes'],
    deps: [mdNode, mdAstWalker, mdAstTypes],
    factory(mdNode, mdAstWalker, mdAstTypes) {
        const { Node } = mdNode;
        const { walk } = mdAstWalker;
        const { T_TEXT, T_LINK } = mdAstTypes;

        const RE_WIKI = /\[\[([^[\]\n|#]+)(?:#([^[\]\n|]+))?(?:\|([^[\]\n]+))?\]\]/g;

        function defaultSlugify(s) {
            return String(s).trim().toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }

        function expandWikilinksInAst(root, slugify) {
            const runs = [];
            for (const { node, entering } of walk(root)) {
                if (!entering || node.type !== T_TEXT) continue;
                if (node.prev && node.prev.type === T_TEXT) continue;
                let last = node, joined = node.literal || '';
                while (last.next && last.next.type === T_TEXT) {
                    last = last.next; joined += (last.literal || '');
                }
                if (joined.indexOf('[[') < 0) continue;
                runs.push({ first: node, last, joined });
            }
            for (const run of runs) {
                RE_WIKI.lastIndex = 0;
                const parts = [];
                let lastIdx = 0, m;
                while ((m = RE_WIKI.exec(run.joined)) !== null) {
                    if (m.index > lastIdx) parts.push({ kind: 'text', value: run.joined.substring(lastIdx, m.index) });
                    const page = m[1].trim();
                    const anchor = m[2] ? m[2].trim() : '';
                    const alias = m[3] ? m[3].trim() : '';
                    const dest = slugify(page) + (anchor ? '#' + slugify(anchor) : '');
                    const display = alias || (anchor ? page + ' § ' + anchor : page);
                    parts.push({ kind: 'link', dest, title: page, display });
                    lastIdx = m.index + m[0].length;
                }
                if (parts.length === 0) continue;
                if (lastIdx < run.joined.length) parts.push({ kind: 'text', value: run.joined.substring(lastIdx) });
                const nodes = parts.map(p => {
                    if (p.kind === 'text') {
                        const n = new Node(T_TEXT); n.literal = p.value; return n;
                    }
                    const link = new Node(T_LINK);
                    link.destination = p.dest;
                    link.title = p.title;
                    const txt = new Node(T_TEXT); txt.literal = p.display;
                    link.appendChild(txt);
                    return link;
                });
                run.first.insertBefore(nodes[0]);
                let prev = nodes[0];
                for (let k = 1; k < nodes.length; k++) { prev.insertAfter(nodes[k]); prev = nodes[k]; }
                let cur = run.first; const end = run.last.next;
                while (cur && cur !== end) { const nx = cur.next; cur.unlink(); cur = nx; }
            }
            return root;
        }

        return {
            name: 'mdWikilinks',
            defaultSlugify,
            expandWikilinksInAst,
            install(md, opts) {
                const slugify = (opts && opts.slugify) || defaultSlugify;
                const originalParse = md.parse;
                md.parse = function (text) {
                    const ast = originalParse.call(md, text);
                    expandWikilinksInAst(ast, slugify);
                    return ast;
                };
                md.renderHtml = function (textOrAst, renderOpts) {
                    if (typeof textOrAst === 'string') {
                        return md.render(md.parse(textOrAst), renderOpts);
                    }
                    return md.render(textOrAst, renderOpts);
                };
            }
        };
    }
};
