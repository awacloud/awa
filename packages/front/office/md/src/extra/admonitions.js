// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : admonition callouts.
 *
 * Two source syntaxes are supported :
 *
 *   1. GitHub-style alert (inside a block-quote) :
 *
 *          > [!NOTE]
 *          > Body text.
 *
 *   2. Material-MkDocs style :
 *
 *          !!! note "Optional title"
 *              Body text
 *              continued.
 *
 * Both produce an `admonition` AST node with `data.kind` (lowercase
 * keyword) and `data.title` (string). Children are the body blocks.
 *
 * The HTML render path wraps the admonition in
 *   `<div class="admonition admonition-<kind>">…</div>`.
 *
 * Strict factory-only : exposes a `{ name, dependencies, factory }`
 * descriptor. `factory(...)` returns the installable extension object
 * `{ name, install(md), <named helpers> }` so callers can either
 * `md.use(ext)` or destructure helpers (`preprocessMkdocsAdmonitions`,
 * `expandAdmonitionsInAst`, `lowerAdmonitionsToHtml`).
 *
 * @module md/extra/admonitions
 */

import { mdNode } from '../ast/node.js';
import { mdAstWalker } from '../ast/walker.js';
import { mdAstTypes } from '../ast/types.js';
import { mdShared } from '../_shared/index.js';

export const mdAdmonitions = {
    name: 'mdAdmonitions',
    dependencies: ['mdNode', 'mdAstWalker', 'mdAstTypes', 'mdShared'],
    deps: [mdNode, mdAstWalker, mdAstTypes, mdShared],
    factory(mdNode, mdAstWalker, mdAstTypes, mdShared) {
        const { Node, trustedHtmlBlock } = mdNode;
        const { walk } = mdAstWalker;
        const {
            T_BLOCK_QUOTE, T_PARAGRAPH, T_TEXT, T_ADMONITION
        } = mdAstTypes;
        const { escapeHtml } = mdShared;

        const VALID_KINDS = new Set(['note', 'warning', 'tip', 'caution', 'important', 'danger', 'info']);
        const RE_MKDOCS_HEAD = /^!!![ \t]+([a-zA-Z]+)(?:[ \t]+"([^"]*)")?[ \t]*$/;

        function preprocessMkdocsAdmonitions(text) {
            if (typeof text !== 'string' || text.indexOf('!!!') < 0) return text;
            const lines = text.split('\n');
            const out = [];
            let i = 0;
            while (i < lines.length) {
                const m = RE_MKDOCS_HEAD.exec(lines[i]);
                if (!m) { out.push(lines[i]); i++; continue; }
                const kind = m[1].toLowerCase();
                const title = m[2] || '';
                if (!VALID_KINDS.has(kind)) { out.push(lines[i]); i++; continue; }
                i++;
                const body = [];
                while (i < lines.length) {
                    const ln = lines[i];
                    if (ln === '') {
                        if (i + 1 < lines.length && /^(?: {4}|\t)/.test(lines[i + 1])) {
                            body.push(''); i++; continue;
                        }
                        break;
                    }
                    if (/^(?: {4}|\t)/.test(ln)) {
                        body.push(ln.replace(/^(?: {4}|\t)/, ''));
                        i++;
                    } else {
                        break;
                    }
                }
                out.push('> [!' + kind.toUpperCase() + (title ? ':' + title : '') + ']');
                for (const b of body) out.push('> ' + b);
                out.push('');
            }
            return out.join('\n');
        }

        function expandAdmonitionsInAst(root) {
            const toConvert = [];
            for (const { node, entering } of walk(root)) {
                if (!entering || node.type !== T_BLOCK_QUOTE) continue;
                const first = node.firstChild;
                if (!first || first.type !== T_PARAGRAPH) continue;
                let head = '';
                let last = null;
                let c = first.firstChild;
                while (c && c.type === T_TEXT) {
                    head += c.literal || '';
                    last = c;
                    c = c.next;
                }
                const m = /^\[!([A-Za-z]+)(?::([^\]]*))?\]\s*$/.exec(head);
                if (!m) continue;
                const kind = m[1].toLowerCase();
                if (!VALID_KINDS.has(kind)) continue;
                const title = m[2] || '';
                toConvert.push({ node, kind, title, lastMarkerText: last });
            }
            for (const { node, kind, title, lastMarkerText } of toConvert) {
                const adm = new Node(T_ADMONITION);
                adm.data = { kind, title };
                const para = node.firstChild;
                let c = para.firstChild;
                const stop = lastMarkerText && lastMarkerText.next;
                while (c && c !== stop) { const nx = c.next; c.unlink(); c = nx; }
                if (para.firstChild && (para.firstChild.type === 'softbreak' || para.firstChild.type === 'linebreak')) {
                    para.firstChild.unlink();
                }
                if (!para.firstChild) para.unlink();
                let q = node.firstChild;
                while (q) { const nx = q.next; adm.appendChild(q); q = nx; }
                node.insertBefore(adm);
                node.unlink();
            }
            return root;
        }

        function lowerAdmonitionsToHtml(root) {
            const adms = [];
            for (const { node, entering } of walk(root)) {
                if (!entering) continue;
                if (node.type === T_ADMONITION) adms.push(node);
            }
            for (const adm of adms) {
                const kind = (adm.data && adm.data.kind) || 'note';
                const title = (adm.data && adm.data.title) || (kind.charAt(0).toUpperCase() + kind.slice(1));
                // Extension-built nodes: trusted under `safe` through the
                // mdNode.trustedHtmlBlock factory (see render/html.js header);
                // kind and title are escaped.
                const opener = trustedHtmlBlock('<div class="admonition admonition-' + escapeHtml(kind) + '">\n' +
                    '<p class="admonition-title">' + escapeHtml(title) + '</p>');
                const closer = trustedHtmlBlock('</div>');
                adm.insertBefore(opener);
                let anchor = opener;
                let c = adm.firstChild;
                while (c) {
                    const nx = c.next;
                    c.unlink();
                    anchor.insertAfter(c);
                    anchor = c;
                    c = nx;
                }
                anchor.insertAfter(closer);
                adm.unlink();
            }
            return root;
        }

        return {
            name: 'mdAdmonitions',
            preprocessMkdocsAdmonitions,
            expandAdmonitionsInAst,
            lowerAdmonitionsToHtml,
            install(md) {
                const originalParse = md.parse;
                const originalRender = md.render;
                md.parse = function (text) {
                    const pre = preprocessMkdocsAdmonitions(text);
                    const ast = originalParse.call(md, pre);
                    expandAdmonitionsInAst(ast);
                    return ast;
                };
                md.render = function (ast, renderOpts) {
                    lowerAdmonitionsToHtml(ast);
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
