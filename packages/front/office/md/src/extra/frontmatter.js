// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : YAML / TOML / JSON frontmatter extraction.
 *
 * Detects a fenced frontmatter block at the very start of the
 * document and strips it before the block parser sees the text.
 * The raw frontmatter content is attached to `document.data.frontmatter`
 * along with the detected language.
 *
 * Supported fences :
 *   `---` …YAML… `---`
 *   `+++` …TOML… `+++`
 *   `;;;` …JSON… `;;;` (rare but useful)
 *
 * The frontmatter content is **not** parsed (we don't ship a YAML/TOML
 * parser to stay zero-dep). Consumers can decode it with their own
 * parser:
 *
 *     import { bootstrapMd } from '@awacloud/md/bootstrap.js';
 *     const { md, resolve } = bootstrapMd();
 *     const m = md.createMd().use(resolve('mdFrontmatter'));
 *     const ast = m.parse(text);
 *     const meta = ast.data.frontmatter.content;
 *
 * Strict factory-only. `factory(mdShared)` returns
 * `{ name, install, stripFrontmatter }`.
 *
 * @module md/extra/frontmatter
 */

import { mdShared } from '../_shared/index.js';

export const mdFrontmatter = {
    name: 'mdFrontmatter',
    dependencies: ['mdShared'],
    deps: [mdShared],
    factory(mdShared) {
        const { escapeForRegex } = mdShared;

        const FENCES = {
            '---': 'yaml',
            '+++': 'toml',
            ';;;': 'json'
        };

        function stripFrontmatter(text) {
            if (typeof text !== 'string' || text.length < 7) {
                return { rest: text, frontmatter: null };
            }
            let pos = 0;
            if (text.charCodeAt(0) === 0xFEFF) pos = 1;

            const head = text.substr(pos, 3);
            const lang = FENCES[head];
            if (!lang) return { rest: text, frontmatter: null };

            const firstNl = text.indexOf('\n', pos);
            if (firstNl < 0) return { rest: text, frontmatter: null };
            const headLine = text.substring(pos, firstNl).trimEnd();
            if (headLine !== head) return { rest: text, frontmatter: null };

            const re = new RegExp('\\n' + escapeForRegex(head) + '[ \\t]*(?:\\n|$)');
            re.lastIndex = firstNl;
            const m = re.exec(text.substring(firstNl));
            if (!m) return { rest: text, frontmatter: null };

            const closeStart = firstNl + m.index;
            const closeEnd   = firstNl + m.index + m[0].length;
            const content    = text.substring(firstNl + 1, closeStart);
            const rest       = text.substring(closeEnd);
            return { rest, frontmatter: { lang, content } };
        }

        return {
            name: 'mdFrontmatter',
            stripFrontmatter,
            install(md) {
                const originalParse = md.parse;
                md.parse = function (text) {
                    const { rest, frontmatter } = stripFrontmatter(text);
                    const ast = originalParse.call(md, rest);
                    ast.data = ast.data || {};
                    ast.data.frontmatter = frontmatter;
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
