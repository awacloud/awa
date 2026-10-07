// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : table of contents.
 *
 *   - `mdToc.generate(ast, opts)` walks the AST and returns a nested
 *     Markdown list (string) reflecting the heading hierarchy.
 *   - `mdToc.install(md)` adds a parse hook that scans top-level
 *     paragraphs of the form `[[TOC]]` and replaces them with the
 *     generated list (parsed back into an AST list).
 *
 * The default slug algorithm mirrors GitHub's anchor scheme : lower
 * case, strip punctuation, replace spaces with hyphens.
 *
 * Strict factory-only. `factory(...)` returns `{ name, install,
 * generate, collectHeadings, slugify, replaceTocPlaceholders }`.
 *
 * @module md/extra/toc
 */

import { mdAstWalker } from '../ast/walker.js';
import { mdAstTypes } from '../ast/types.js';

export const mdToc = {
    name: 'mdToc',
    dependencies: ['mdAstWalker', 'mdAstTypes'],
    deps: [mdAstWalker, mdAstTypes],
    factory(mdAstWalker, mdAstTypes) {
        const { walk } = mdAstWalker;
        const { T_HEADING, T_PARAGRAPH, T_TEXT, T_SOFTBREAK, T_LINEBREAK } = mdAstTypes;

        function slugify(s) {
            return String(s).trim().toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/^-+|-+$/g, '');
        }

        function headingText(h) {
            let s = '';
            for (const { node, entering } of walk(h)) {
                if (!entering || node === h) continue;
                if (node.type === T_SOFTBREAK || node.type === T_LINEBREAK) s += ' ';
                else if (node.literal) s += node.literal;
            }
            return s;
        }

        /** Backslash-escape the characters that would re-parse as inline syntax inside `[...]`. */
        function escapeLinkText(s) {
            return String(s).replace(/([\\`*_[\]<>~&!])/g, '\\$1');
        }

        function collectHeadings(ast, opts) {
            const min = (opts && opts.minLevel) || 1;
            const max = (opts && opts.maxLevel) || 6;
            const out = [];
            const slugCount = new Map();
            for (const { node, entering } of walk(ast)) {
                if (!entering || node.type !== T_HEADING) continue;
                const lvl = node.level;
                if (lvl < min || lvl > max) continue;
                const txt = headingText(node);
                let slug = slugify(txt);
                if (!slug) slug = 'section';
                const n = slugCount.get(slug) || 0;
                slugCount.set(slug, n + 1);
                if (n > 0) slug = slug + '-' + n;
                out.push({ level: lvl, text: txt, slug });
            }
            return out;
        }

        function generate(ast, opts) {
            const headings = collectHeadings(ast, opts);
            if (headings.length === 0) return '';
            const baseLevel = headings.reduce((m, h) => Math.min(m, h.level), 6);
            const lines = [];
            for (const h of headings) {
                const indent = '  '.repeat(Math.max(0, h.level - baseLevel));
                lines.push(indent + '- [' + escapeLinkText(h.text) + '](#' + h.slug + ')');
            }
            return lines.join('\n');
        }

        function replaceTocPlaceholders(doc, parser, opts) {
            const targets = [];
            let cur = doc.firstChild;
            while (cur) {
                if (cur.type === T_PARAGRAPH) {
                    let s = '';
                    let ok = true;
                    let c = cur.firstChild;
                    while (c) {
                        if (c.type === T_TEXT || c.type === 'code' || c.type === 'html_inline') {
                            s += c.literal || '';
                        } else if (c.type === 'softbreak' || c.type === 'linebreak') {
                            s += '\n';
                        } else { ok = false; break; }
                        c = c.next;
                    }
                    if (ok && s.trim() === '[[TOC]]') targets.push(cur);
                }
                cur = cur.next;
            }
            if (targets.length === 0) return;
            const tocText = generate(doc, opts);
            if (!tocText) {
                for (const t of targets) t.unlink();
                return;
            }
            for (const t of targets) {
                const sub = parser(tocText);
                let c = sub.firstChild;
                while (c) {
                    const nx = c.next;
                    c.unlink();
                    t.insertBefore(c);
                    c = nx;
                }
                t.unlink();
            }
        }

        return {
            name: 'mdToc',
            generate,
            collectHeadings,
            slugify,
            replaceTocPlaceholders,
            install(md, opts) {
                const originalParse = md.parse;
                md.parse = function (text) {
                    const ast = originalParse.call(md, text);
                    replaceTocPlaceholders(ast, (s) => originalParse.call(md, s), opts);
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
