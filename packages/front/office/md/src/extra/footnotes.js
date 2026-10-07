// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : Pandoc-style footnotes.
 *
 *     Here is a note[^1] and another[^lbl].
 *
 *     [^1]: First note body.
 *     [^lbl]: Second note body
 *         with a continuation line.
 *
 * Strategy (entirely post-parse) :
 *   1. Walk block paragraphs and detect `[^id]: …` definitions at the
 *      start of a paragraph. Extract them out of the AST, accumulate
 *      `footnote_def` nodes into `document.data.footnotes`.
 *   2. Walk inline `text` nodes (across runs) and replace `[^id]` with
 *      `footnote_ref` nodes carrying the resolved 1-based number.
 *   3. At render time, append a footnotes section to the HTML output.
 *
 * Footnotes are numbered in the order they are first **referenced**, à
 * la Pandoc — unreferenced definitions are ignored.
 *
 * Strict factory-only. `factory(...)` returns `{ name, install,
 * stripFootnoteDefs, extractFootnoteDefs, expandFootnoteRefs,
 * renderFootnotesHtml, lowerFootnoteRefs }`.
 *
 * @module md/extra/footnotes
 */

import { mdNode } from '../ast/node.js';
import { mdAstWalker } from '../ast/walker.js';
import { mdAstTypes } from '../ast/types.js';
import { mdShared } from '../_shared/index.js';

export const mdFootnotes = {
    name: 'mdFootnotes',
    dependencies: ['mdNode', 'mdAstWalker', 'mdAstTypes', 'mdShared'],
    deps: [mdNode, mdAstWalker, mdAstTypes, mdShared],
    factory(mdNode, mdAstWalker, mdAstTypes, mdShared) {
        const { Node, trustedHtmlInline } = mdNode;
        const { walk } = mdAstWalker;
        const {
            T_TEXT, T_PARAGRAPH, T_FOOTNOTE_REF
        } = mdAstTypes;
        const { escapeHtml } = mdShared;

        const RE_DEF_HEAD = /^\[\^([^\]\s]+)\]:[ \t]?/;
        const RE_REF = /\[\^([^\]\s]+)\]/g;

        function stripFootnoteDefs(text) {
            const defs = new Map();
            if (typeof text !== 'string') return { rest: text, defs };
            const lines = text.split('\n');
            const out = [];
            let i = 0;
            while (i < lines.length) {
                const m = RE_DEF_HEAD.exec(lines[i]);
                if (m) {
                    const id = m[1];
                    let body = lines[i].substring(m[0].length);
                    i++;
                    while (i < lines.length) {
                        const ln = lines[i];
                        if (/^[ \t]+\S/.test(ln)) {
                            body += '\n' + ln.replace(/^[ \t]+/, '');
                            i++;
                        } else if (ln === '' && i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) {
                            body += '\n';
                            i++;
                        } else {
                            break;
                        }
                    }
                    defs.set(id, body);
                    out.push('');
                    continue;
                }
                out.push(lines[i]);
                i++;
            }
            return { rest: out.join('\n'), defs };
        }

        function paragraphRawText(para) {
            let s = '';
            let c = para.firstChild;
            while (c) {
                if (c.type === T_TEXT) s += c.literal || '';
                else if (c.type === 'softbreak' || c.type === 'linebreak') s += '\n';
                else if (c.literal) s += c.literal;
                c = c.next;
            }
            return s;
        }

        function extractFootnoteDefs(doc) {
            const defs = new Map();
            if (!doc.firstChild) return defs;
            const toRemove = [];
            let cur = doc.firstChild;
            while (cur) {
                const next = cur.next;
                if (cur.type === T_PARAGRAPH) {
                    const text = paragraphRawText(cur);
                    const m = RE_DEF_HEAD.exec(text);
                    if (m) {
                        const id = m[1];
                        const body = text.substring(m[0].length);
                        defs.set(id, body);
                        toRemove.push(cur);
                    }
                }
                cur = next;
            }
            for (const n of toRemove) n.unlink();
            return defs;
        }

        function expandFootnoteRefs(root, defs) {
            const order = [];
            const used = new Map();
            function assign(id) {
                if (!defs.has(id)) return null;
                if (!used.has(id)) {
                    used.set(id, order.length + 1);
                    order.push(id);
                }
                return used.get(id);
            }
            const runs = [];
            for (const { node, entering } of walk(root)) {
                if (!entering || node.type !== T_TEXT) continue;
                if (node.prev && node.prev.type === T_TEXT) continue;
                let last = node, joined = node.literal || '';
                while (last.next && last.next.type === T_TEXT) {
                    last = last.next; joined += (last.literal || '');
                }
                if (joined.indexOf('[^') < 0) continue;
                runs.push({ first: node, last, joined });
            }
            for (const run of runs) {
                RE_REF.lastIndex = 0;
                let m, lastIdx = 0;
                const parts = [];
                while ((m = RE_REF.exec(run.joined)) !== null) {
                    const id = m[1];
                    const num = assign(id);
                    if (num === null) continue;
                    if (m.index > lastIdx) parts.push({ kind: 'text', value: run.joined.substring(lastIdx, m.index) });
                    parts.push({ kind: 'ref', id, num });
                    lastIdx = m.index + m[0].length;
                }
                if (parts.length === 0) continue;
                if (lastIdx < run.joined.length) parts.push({ kind: 'text', value: run.joined.substring(lastIdx) });
                const nodes = parts.map(p => {
                    if (p.kind === 'text') {
                        const n = new Node(T_TEXT); n.literal = p.value; return n;
                    }
                    const n = new Node(T_FOOTNOTE_REF);
                    n.data = { id: p.id, num: p.num };
                    return n;
                });
                run.first.insertBefore(nodes[0]);
                let prev = nodes[0];
                for (let k = 1; k < nodes.length; k++) { prev.insertAfter(nodes[k]); prev = nodes[k]; }
                let cur = run.first; const end = run.last.next;
                while (cur && cur !== end) { const nx = cur.next; cur.unlink(); cur = nx; }
            }
            return { order, used };
        }

        function renderFootnotesHtml(html, order, defs) {
            if (order.length === 0) return html;
            let out = html;
            out += '<section class="footnotes">\n<ol>\n';
            for (let i = 0; i < order.length; i++) {
                const id = order[i];
                const body = defs.get(id) || '';
                out += '<li id="fn-' + escapeHtml(id) + '">';
                out += '<p>' + escapeHtml(body) + ' ';
                out += '<a href="#fnref-' + escapeHtml(id) + '" class="footnote-back">&#8617;</a>';
                out += '</p></li>\n';
            }
            out += '</ol>\n</section>\n';
            return out;
        }

        function lowerFootnoteRefs(root) {
            const refs = [];
            for (const { node, entering } of walk(root)) {
                if (!entering) continue;
                if (node.type === T_FOOTNOTE_REF) refs.push(node);
            }
            for (const r of refs) {
                const id = r.data && r.data.id;
                const num = r.data && r.data.num;
                // Extension-built node: trusted under `safe` through the
                // mdNode.trustedHtmlInline factory (see render/html.js header).
                const inline = trustedHtmlInline('<sup class="footnote-ref"><a href="#fn-' + escapeHtml(id) +
                    '" id="fnref-' + escapeHtml(id) + '">' + num + '</a></sup>');
                r.insertBefore(inline);
                r.unlink();
            }
        }

        return {
            name: 'mdFootnotes',
            stripFootnoteDefs,
            extractFootnoteDefs,
            expandFootnoteRefs,
            renderFootnotesHtml,
            lowerFootnoteRefs,
            install(md) {
                const originalParse = md.parse;
                const originalRender = md.render;
                md.parse = function (text) {
                    const { rest, defs } = stripFootnoteDefs(text);
                    const ast = originalParse.call(md, rest);
                    const { order } = expandFootnoteRefs(ast, defs);
                    ast.data = ast.data || {};
                    ast.data.footnotes = { defs, order };
                    return ast;
                };
                md.render = function (ast, renderOpts) {
                    lowerFootnoteRefs(ast);
                    let html = originalRender.call(md, ast, renderOpts);
                    const fn = ast.data && ast.data.footnotes;
                    if (fn) html = renderFootnotesHtml(html, fn.order, fn.defs);
                    return html;
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
