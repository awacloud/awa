// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : `==marked==` highlighting → `<mark>` element.
 *
 * Inline syntax : two equals signs around the marked text. Single `=`
 * is left alone. The text inside is rendered as-is (escaped).
 *
 * Strategy : post-parse AST pass over runs of adjacent `text` siblings.
 *
 * Strict factory-only. `factory(...)` returns `{ name, install,
 * expandHighlightInAst, lowerHighlightToHtml }`.
 *
 * @module md/extra/highlight
 */

import { mdNode } from '../ast/node.js';
import { mdAstWalker } from '../ast/walker.js';
import { mdAstTypes } from '../ast/types.js';

export const mdHighlight = {
    name: 'mdHighlight',
    dependencies: ['mdNode', 'mdAstWalker', 'mdAstTypes'],
    deps: [mdNode, mdAstWalker, mdAstTypes],
    factory(mdNode, mdAstWalker, mdAstTypes) {
        const { Node, trustedHtmlInline } = mdNode;
        const { walk } = mdAstWalker;
        const { T_TEXT, T_HIGHLIGHT } = mdAstTypes;

        const RE_MARK = /==([^=\n][^\n]*?)==/g;

        function expandHighlightInAst(root) {
            const runs = [];
            for (const { node, entering } of walk(root)) {
                if (!entering || node.type !== T_TEXT) continue;
                if (node.prev && node.prev.type === T_TEXT) continue;
                let last = node, joined = node.literal || '';
                while (last.next && last.next.type === T_TEXT) {
                    last = last.next; joined += (last.literal || '');
                }
                if (joined.indexOf('==') < 0) continue;
                runs.push({ first: node, last, joined });
            }
            for (const run of runs) {
                RE_MARK.lastIndex = 0;
                const parts = []; let lastIdx = 0, m;
                while ((m = RE_MARK.exec(run.joined)) !== null) {
                    if (m.index > lastIdx) parts.push({ kind: 'text', value: run.joined.substring(lastIdx, m.index) });
                    parts.push({ kind: 'mark', value: m[1] });
                    lastIdx = m.index + m[0].length;
                }
                if (parts.length === 0) continue;
                if (lastIdx < run.joined.length) parts.push({ kind: 'text', value: run.joined.substring(lastIdx) });
                const nodes = parts.map(p => {
                    if (p.kind === 'text') {
                        const n = new Node(T_TEXT); n.literal = p.value; return n;
                    }
                    const hl = new Node(T_HIGHLIGHT);
                    const t = new Node(T_TEXT); t.literal = p.value;
                    hl.appendChild(t);
                    return hl;
                });
                run.first.insertBefore(nodes[0]);
                let prev = nodes[0];
                for (let k = 1; k < nodes.length; k++) { prev.insertAfter(nodes[k]); prev = nodes[k]; }
                let cur = run.first; const end = run.last.next;
                while (cur && cur !== end) { const nx = cur.next; cur.unlink(); cur = nx; }
            }
        }

        function lowerHighlightToHtml(root) {
            const marks = [];
            for (const { node, entering } of walk(root)) {
                if (!entering) continue;
                if (node.type === T_HIGHLIGHT) marks.push(node);
            }
            for (const mk of marks) {
                // Extension-built nodes: trusted under `safe` through the
                // mdNode.trustedHtmlInline factory (see render/html.js header).
                const open = trustedHtmlInline('<mark>');
                const close = trustedHtmlInline('</mark>');
                mk.insertBefore(open);
                let c = mk.firstChild;
                let anchor = open;
                while (c) { const nx = c.next; c.unlink(); anchor.insertAfter(c); anchor = c; c = nx; }
                anchor.insertAfter(close);
                mk.unlink();
            }
        }

        return {
            name: 'mdHighlight',
            expandHighlightInAst,
            lowerHighlightToHtml,
            install(md) {
                const originalParse = md.parse;
                const originalRender = md.render;
                md.parse = function (text) {
                    const ast = originalParse.call(md, text);
                    expandHighlightInAst(ast);
                    return ast;
                };
                md.render = function (ast, renderOpts) {
                    lowerHighlightToHtml(ast);
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
