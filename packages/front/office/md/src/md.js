// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Top-level Markdown façade (strict factory-only).
 *
 * Provides the ergonomic API surface :
 *
 *     import { bootstrapMd } from '@awacloud/md/bootstrap.js';
 *     const { md } = bootstrapMd();
 *     const ast  = md.parse(text);
 *     const html = md.render(ast);          // or md.renderHtml(text)
 *
 * `.use(extension)` is the public hook for opt-in extensions.
 *
 * @module md
 */

import { mdErrors } from './errors.js';
import { blockParser } from './block/parser.js';
import { inlineParser } from './inline/parser.js';
import { inlineParserBuilder } from './inline/parser-builder.js';
import { renderHtmlMod } from './render/html.js';
import { renderMarkdownMod } from './render/markdown.js';
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';

export const mdMod = {
    name: 'md',
    dependencies: ['mdErrors', 'blockParser', 'inlineParser', 'inlineParserBuilder', 'renderHtmlMod', 'renderMarkdownMod', 'sanitize'],
    deps: [mdErrors, blockParser, inlineParser, inlineParserBuilder, renderHtmlMod, renderMarkdownMod, sanitize],
    factory(errors, blockParserAPI, inlineParserAPI, inlineParserBuilder, renderHtmlAPI, renderMarkdownAPI, sanitizeAPI) {
        const { ContractError } = errors;
        const sanitizeHtml = sanitizeAPI ? sanitizeAPI.sanitizeHtml : null;
        const renderHtml = renderHtmlAPI.renderHtml;
        const renderMarkdown = renderMarkdownAPI.renderMarkdown;

        function createMd(opts) {
            if (opts && Object.prototype.hasOwnProperty.call(opts, 'allowlist')) {
                try {
                    console.warn('createMd: the `allowlist` option was removed — pass `sanitizeOpts.allowedTags` / `sanitizeOpts.allowedAttributes` instead.');
                } catch { /* console may not be available */ }
            }
            const bp = blockParserAPI;
            // Build a per-instance inline parser when a builder is available,
            // so opts like extendedAutolinks/sourcepos/smart bind correctly.
            const ip = (typeof inlineParserBuilder === 'function')
                ? inlineParserBuilder(opts || {})
                : inlineParserAPI;
            const extensions = [];

            function pickLimit(v, dflt) {
                if (v === Infinity) return Infinity;
                return (typeof v === 'number' && v >= 0 && Number.isFinite(v)) ? v : dflt;
            }
            const maxDepth     = pickLimit(opts && opts.maxDepth,     1000);
            const maxNodes     = pickLimit(opts && opts.maxNodes,     100000);
            const maxUrlLength = pickLimit(opts && opts.maxUrlLength, 8192);

            function enforceLimits(document) {
                let nodeCount = 0;
                const w = document.walker();
                let ev;
                while ((ev = w.next()) !== null) {
                    if (!ev.entering) continue;
                    nodeCount++;
                    if (nodeCount > maxNodes) {
                        throw new ContractError('md/limit-exceeded',
                            'md.parse: node count exceeded limit (' + maxNodes + ')',
                            { context: { kind: 'maxNodes', limit: maxNodes } });
                    }
                    const node = ev.node;
                    let d = 0;
                    for (let p = node.parent; p; p = p.parent) d++;
                    if (d > maxDepth) {
                        throw new ContractError('md/limit-exceeded',
                            'md.parse: nesting depth exceeded limit (' + maxDepth + ')',
                            { context: { kind: 'maxDepth', limit: maxDepth, depth: d } });
                    }
                    if (node.destination && node.destination.length > maxUrlLength) {
                        throw new ContractError('md/limit-exceeded',
                            'md.parse: URL length exceeded limit (' + maxUrlLength + ')',
                            { context: { kind: 'maxUrlLength', limit: maxUrlLength, length: node.destination.length } });
                    }
                }
            }

            function parse(text) {
                if (typeof text !== 'string') {
                    throw new ContractError('md/parse-not-string',
                        'md.parse: expected a string, got ' + typeof text,
                        { context: { gotType: typeof text } });
                }
                const { document, refmap } = bp.parse(text, { inlineParser: ip.parse });
                document.data = { refmap };
                if (maxDepth !== Infinity || maxNodes !== Infinity || maxUrlLength !== Infinity) {
                    enforceLimits(document);
                }
                return document;
            }

            function render(ast, renderOpts) {
                const merged = Object.assign({}, opts || {}, renderOpts || {});
                let html = renderHtml(ast, merged);
                if (merged.sanitize && sanitizeHtml) {
                    html = sanitizeHtml(html, merged.sanitizeOpts || {});
                }
                return html;
            }

            function renderHtmlFn(text, renderOpts) { return render(parse(text), renderOpts); }

            // A string argument is parsed with `md.parse` (extension passes
            // included): `api.parse` is the late-bound facade member that
            // every extension wraps, not the closure-local `parse`.
            function renderMarkdownFn(astOrText, renderOpts) {
                const ast = typeof astOrText === 'string' ? api.parse(astOrText) : astOrText;
                return renderMarkdown(ast, renderOpts);
            }

            function use(...exts) {
                for (const ext of exts) {
                    if (!ext || typeof ext !== 'object' || typeof ext.install !== 'function') {
                        throw new ContractError('md/use-bad-extension',
                            'md.use: extension must be { name, install(md) }');
                    }
                    if (extensions.some(e => e.name === ext.name)) continue;
                    extensions.push(ext);
                    ext.install(api);
                }
                return api;
            }

            const api = { parse, render, renderHtml: renderHtmlFn,
                          renderMarkdown: renderMarkdownFn, use, extensions };
            return api;
        }

        const md = createMd();
        // Return the default `md` API instance, with `createMd` attached so
        // consumers can spawn fresh isolated instances via the same handle.
        // `ContractError` is also exposed for sibling tests / error matching.
        md.createMd = createMd;
        md.ContractError = ContractError;
        return md;
    }
};
