// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : subscript (`H~2~O`) and superscript (`E=mc^2^`).
 *
 * Inline syntaxes (Pandoc / Quarto compatible) :
 *   - `~x~` → `<sub>x</sub>` (single tilde — distinct from GFM
 *     strike-through which uses `~~x~~`).
 *   - `^x^` → `<sup>x</sup>`.
 *
 * Strategy : post-parse AST pass — the source text is never rewritten,
 * so code spans, fenced code, autolinks and bare URLs keep their bytes.
 *   - Subscript : the GFM parser already turns `~x~` into a
 *     `strikethrough` node and records the tilde run length on it
 *     (`delimiterCount`, 1 or 2). With this extra installed, a
 *     single-tilde `strikethrough` whose text holds no whitespace is
 *     reinterpreted as a `subscript` node in place. Without the extra
 *     the parser output is untouched, so GFM `~x~` keeps rendering as
 *     `<del>`. `~~x~~` and `~a b~` (whitespace) stay strike-through.
 *   - Superscript : runs of adjacent `text` siblings are scanned for
 *     `^x^` (no whitespace in `x`); the match starts at the opening `^`,
 *     so the preceding character is kept (`E=mc^2^` keeps its `c`).
 *     Text inside an autolink (link text equal to its destination) is
 *     skipped.
 *
 * Escapes keep protecting : `\~` is never a strike-through delimiter,
 * and `\^` / `&#94;` produce a `text` node whose literal is exactly `^`,
 * which ends a run and is never matched — both stay literal.
 *
 * Lowering : `lowerSubSupToHtml` replaces each node by a pair of
 * `html_inline` nodes built with `mdNode.trustedHtmlInline`, so the
 * tags survive the `safe` default while author raw HTML is still
 * stripped. `md.renderMarkdown` serialises the `subscript` /
 * `superscript` nodes of a parsed AST back to `~x~` / `^x^`.
 *
 * Strict factory-only. `factory(...)` returns `{ name, install,
 * expandSubSupInAst, lowerSubSupToHtml }`.
 *
 * @module md/extra/subsuper
 */

import { mdNode } from '../ast/node.js';
import { mdAstWalker } from '../ast/walker.js';
import { mdAstTypes } from '../ast/types.js';

export const mdSubsuper = {
    name: 'mdSubsuper',
    dependencies: ['mdNode', 'mdAstWalker', 'mdAstTypes'],
    deps: [mdNode, mdAstWalker, mdAstTypes],
    factory(mdNode, mdAstWalker, mdAstTypes) {
        const { Node, trustedHtmlInline } = mdNode;
        const { walk } = mdAstWalker;
        const { T_TEXT, T_LINK, T_STRIKETHROUGH, T_SUBSCRIPT, T_SUPERSCRIPT } = mdAstTypes;

        const RE_SUP = /\^([^\s^]+)\^/g;

        /**
         * Concatenated literals of the leaf descendants of `node`; soft and
         * hard line breaks count as a newline (whitespace).
         * @param {object} node
         * @returns {string}
         */
        function textOf(node) {
            let out = '';
            for (const { node: n, entering } of walk(node)) {
                if (!entering || n === node) continue;
                if (n.type === 'softbreak' || n.type === 'linebreak') out += '\n';
                else if (typeof n.literal === 'string') out += n.literal;
            }
            return out;
        }

        function decodeDestination(dest) {
            try { return decodeURI(dest); } catch { return dest; }
        }

        /**
         * True when the nearest `link` ancestor of `node` has the autolink
         * shape : its destination equals its text (optionally behind the
         * `mailto:` / `http://` prefix the parser adds, compared raw and
         * percent-decoded since the parser normalises destinations).
         * @param {object} node
         * @returns {boolean}
         */
        function inAutolink(node) {
            let p = node.parent;
            while (p && p.type !== T_LINK) p = p.parent;
            if (!p || typeof p.destination !== 'string') return false;
            const text = textOf(p);
            const dests = [p.destination, decodeDestination(p.destination)];
            for (const d of dests) {
                if (d === text || d === 'mailto:' + text || d === 'http://' + text) return true;
            }
            return false;
        }

        function isCaretNode(node) {
            return node.type === T_TEXT && node.literal === '^';
        }

        function isRunText(node) {
            return !!node && node.type === T_TEXT && !isCaretNode(node);
        }

        /**
         * Rewrite the parsed AST in place : single-tilde strike-through
         * without whitespace → `subscript`, `^x^` in text → `superscript`.
         * @param {object} root  document (or any container) node
         */
        function expandSubSupInAst(root) {
            // (a) single-tilde strikethrough → subscript.
            const strikes = [];
            for (const { node, entering } of walk(root)) {
                if (entering && node.type === T_STRIKETHROUGH && node.delimiterCount === 1) strikes.push(node);
            }
            for (const s of strikes) if (!/\s/.test(textOf(s))) s.type = T_SUBSCRIPT;

            // (b) `^x^` over runs of adjacent text nodes. A node whose literal
            // is exactly '^' (an escape or an entity) ends a run and is skipped.
            const runs = [];
            for (const { node, entering } of walk(root)) {
                if (!entering || !isRunText(node)) continue;
                if (isRunText(node.prev)) continue;
                let last = node, joined = node.literal || '';
                while (isRunText(last.next)) {
                    last = last.next; joined += (last.literal || '');
                }
                if (joined.indexOf('^') < 0) continue;
                if (inAutolink(node)) continue;
                runs.push({ first: node, last, joined });
            }
            for (const run of runs) {
                RE_SUP.lastIndex = 0;
                const parts = []; let lastIdx = 0, m;
                while ((m = RE_SUP.exec(run.joined)) !== null) {
                    if (m.index > lastIdx) parts.push({ kind: 'text', value: run.joined.substring(lastIdx, m.index) });
                    parts.push({ kind: 'sup', body: m[1] });
                    lastIdx = m.index + m[0].length;
                }
                if (parts.length === 0) continue;
                if (lastIdx < run.joined.length) parts.push({ kind: 'text', value: run.joined.substring(lastIdx) });
                const nodes = parts.map(p => {
                    if (p.kind === 'text') {
                        const n = new Node(T_TEXT); n.literal = p.value; return n;
                    }
                    const sup = new Node(T_SUPERSCRIPT);
                    const t = new Node(T_TEXT); t.literal = p.body;
                    sup.appendChild(t);
                    return sup;
                });
                run.first.insertBefore(nodes[0]);
                let prev = nodes[0];
                for (let k = 1; k < nodes.length; k++) { prev.insertAfter(nodes[k]); prev = nodes[k]; }
                let cur = run.first; const end = run.last.next;
                while (cur && cur !== end) { const nx = cur.next; cur.unlink(); cur = nx; }
            }
        }

        /**
         * Replace every `subscript` / `superscript` node by trusted
         * `<sub>` / `<sup>` `html_inline` nodes around its children.
         * @param {object} root
         */
        function lowerSubSupToHtml(root) {
            const nodes = [];
            for (const { node, entering } of walk(root)) {
                if (!entering) continue;
                if (node.type === T_SUBSCRIPT || node.type === T_SUPERSCRIPT) nodes.push(node);
            }
            for (const n of nodes) {
                const tag = n.type === T_SUBSCRIPT ? 'sub' : 'sup';
                // Extension-built nodes: trusted under `safe` through the
                // mdNode.trustedHtmlInline factory (see render/html.js header).
                const open = trustedHtmlInline('<' + tag + '>');
                const close = trustedHtmlInline('</' + tag + '>');
                n.insertBefore(open);
                let c = n.firstChild;
                let anchor = open;
                while (c) { const nx = c.next; c.unlink(); anchor.insertAfter(c); anchor = c; c = nx; }
                anchor.insertAfter(close);
                n.unlink();
            }
        }

        return {
            name: 'mdSubsuper',
            expandSubSupInAst,
            lowerSubSupToHtml,
            install(md) {
                const originalParse = md.parse;
                const originalRender = md.render;
                md.parse = function (text) {
                    const ast = originalParse.call(md, text);
                    expandSubSupInAst(ast);
                    return ast;
                };
                md.render = function (ast, renderOpts) {
                    lowerSubSupToHtml(ast);
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
