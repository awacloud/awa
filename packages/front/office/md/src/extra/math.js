// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : LaTeX math.
 *
 * Supports :
 *   - Inline math : `$x$` (single dollar)
 *   - Display math : `$$x$$` (double dollar)
 *   - Fenced display math : ``` ```math … ``` ```
 *
 * Strategy : post-parse AST pass.
 *   - Walk `text` nodes, split on `$$...$$` and `$...$` boundaries,
 *     producing `math_inline` / `math_block` nodes carrying `literal`
 *     = LaTeX source.
 *   - Walk `code_block` nodes whose info string is `math` and replace
 *     them with a `math_block` node.
 *
 * Strict factory-only. `factory(...)` returns `{ name, install,
 * splitMath, expandMathInAst, lowerMathToHtml }`.
 *
 * @module md/extra/math
 */

import { mdNode } from '../ast/node.js';
import { mdAstWalker } from '../ast/walker.js';
import { mdAstTypes } from '../ast/types.js';
import { mdShared } from '../_shared/index.js';

export const mdMath = {
    name: 'mdMath',
    dependencies: ['mdNode', 'mdAstWalker', 'mdAstTypes', 'mdShared'],
    deps: [mdNode, mdAstWalker, mdAstTypes, mdShared],
    factory(mdNode, mdAstWalker, mdAstTypes, mdShared) {
        const { Node, trustedHtmlInline, trustedHtmlBlock } = mdNode;
        const { walk } = mdAstWalker;
        const {
            T_TEXT, T_CODE_BLOCK, T_MATH_INLINE, T_MATH_BLOCK
        } = mdAstTypes;
        const { escapeHtml } = mdShared;

        function splitMath(lit) {
            if (!lit || lit.indexOf('$') < 0) return null;
            const parts = [];
            let i = 0;
            while (i < lit.length) {
                const dollar = lit.indexOf('$', i);
                if (dollar < 0) {
                    if (i < lit.length) parts.push({ kind: 'text', value: lit.substring(i) });
                    break;
                }
                if (dollar > i) parts.push({ kind: 'text', value: lit.substring(i, dollar) });
                if (lit.substr(dollar, 2) === '$$') {
                    const end = lit.indexOf('$$', dollar + 2);
                    if (end > 0) {
                        parts.push({ kind: 'math_block', value: lit.substring(dollar + 2, end) });
                        i = end + 2;
                        continue;
                    }
                }
                let j = dollar + 1;
                let found = -1;
                while (j < lit.length) {
                    const c = lit.charCodeAt(j);
                    if (c === 0x0A) break;
                    if (c === 0x5C) { j += 2; continue; }
                    if (c === 0x24) { found = j; break; }
                    j++;
                }
                if (found > dollar + 1) {
                    parts.push({ kind: 'math_inline', value: lit.substring(dollar + 1, found) });
                    i = found + 1;
                    continue;
                }
                parts.push({ kind: 'text', value: lit.substring(dollar) });
                i = lit.length;
            }
            if (parts.length === 0) return null;
            if (parts.every(p => p.kind === 'text')) return null;
            return parts;
        }

        function collectTextRuns(root) {
            const runs = [];
            for (const { node, entering } of walk(root)) {
                if (!entering) continue;
                if (node.type !== T_TEXT) continue;
                if (node.prev && node.prev.type === T_TEXT) continue;
                let last = node;
                let joined = node.literal || '';
                while (last.next && last.next.type === T_TEXT) {
                    last = last.next;
                    joined += (last.literal || '');
                }
                if (joined.indexOf('$') >= 0) runs.push({ first: node, last, joined });
            }
            return runs;
        }

        function expandMathInAst(root) {
            const codeReplacements = [];
            for (const { node, entering } of walk(root)) {
                if (!entering) continue;
                if (node.type === T_CODE_BLOCK) {
                    const info = (node.info || '').split(/\s+/)[0];
                    if (info === 'math') codeReplacements.push(node);
                }
            }
            const runs = collectTextRuns(root);
            for (const run of runs) {
                const parts = splitMath(run.joined);
                if (!parts) continue;
                const nodes = parts.map(p => {
                    const n = p.kind === 'text' ? new Node(T_TEXT)
                        : new Node(p.kind === 'math_block' ? T_MATH_BLOCK : T_MATH_INLINE);
                    n.literal = p.value;
                    return n;
                });
                run.first.insertBefore(nodes[0]);
                let prev = nodes[0];
                for (let k = 1; k < nodes.length; k++) {
                    prev.insertAfter(nodes[k]);
                    prev = nodes[k];
                }
                let cur = run.first;
                const end = run.last.next;
                while (cur && cur !== end) {
                    const nx = cur.next;
                    cur.unlink();
                    cur = nx;
                }
            }
            for (const cb of codeReplacements) {
                const mb = new Node(T_MATH_BLOCK);
                mb.literal = cb.literal || '';
                cb.insertBefore(mb);
                cb.unlink();
            }
            return root;
        }

        function renderMathHtml(value, display) {
            if (display) {
                return '<div class="math display">' + escapeHtml(value) + '</div>';
            }
            return '<span class="math inline">' + escapeHtml(value) + '</span>';
        }

        function lowerMathToHtml(root) {
            const toRewrite = [];
            for (const { node, entering } of walk(root)) {
                if (!entering) continue;
                if (node.type === T_MATH_INLINE || node.type === T_MATH_BLOCK) {
                    toRewrite.push(node);
                }
            }
            for (const node of toRewrite) {
                const display = node.type === T_MATH_BLOCK;
                // Extension-built node: trusted under `safe` through the
                // mdNode.trustedHtmlBlock / trustedHtmlInline factories (see
                // render/html.js header); renderMathHtml escapes the value.
                const html = renderMathHtml(node.literal || '', display);
                const replacement = display ? trustedHtmlBlock(html) : trustedHtmlInline(html);
                node.insertBefore(replacement);
                node.unlink();
            }
            return root;
        }

        return {
            name: 'mdMath',
            splitMath,
            expandMathInAst,
            lowerMathToHtml,
            install(md) {
                const originalParse = md.parse;
                const originalRender = md.render;
                md.parse = function (text) {
                    const ast = originalParse.call(md, text);
                    expandMathInAst(ast);
                    return ast;
                };
                md.render = function (ast, renderOpts) {
                    lowerMathToHtml(ast);
                    return originalRender.call(md, ast, renderOpts);
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
