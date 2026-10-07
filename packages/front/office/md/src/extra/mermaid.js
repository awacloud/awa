// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : Mermaid diagrams.
 *
 * Detects fenced code blocks with info string `mermaid` and rewrites
 * them at render time as `<div class="mermaid">…</div>` containers.
 * The diagram source stays HTML-ESCAPED inside the container: Mermaid's
 * runtime reads the element's `textContent`, which decodes the entities
 * back to the original source. Unescaping here would turn a hostile
 * fence body into live markup AFTER the `safe` / `sanitize` passes ran.
 *
 * Implementation : post-render regex replacement on
 *   `<pre><code class="language-mermaid">…</code></pre>`.
 *
 * The original AST node is untouched.
 *
 * Strict factory-only. `factory(mdShared)` returns
 * `{ name, install, rewriteMermaidHtml }`.
 *
 * @module md/extra/mermaid
 */

import { mdShared } from '../_shared/index.js';

export const mdMermaid = {
    name: 'mdMermaid',
    dependencies: ['mdShared'],
    deps: [mdShared],
    factory(_mdShared) {
        const RE = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;

        function rewriteMermaidHtml(html) {
            return html.replace(RE, (_, body) => {
                return '<div class="mermaid">' + body + '</div>';
            });
        }

        return {
            name: 'mdMermaid',
            rewriteMermaidHtml,
            install(md) {
                const originalRender = md.render;
                md.render = function (ast, renderOpts) {
                    const out = originalRender.call(md, ast, renderOpts);
                    return rewriteMermaidHtml(out);
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
