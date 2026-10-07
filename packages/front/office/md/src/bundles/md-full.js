// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Kitchen-sink bundle : the `mdFullBundle` factory
 * descriptor that takes a fresh `md` instance and `.use()`-installs
 * every opt-in extra in the canonical order.
 *
 * Order matters for some extras :
 *   - `mdFrontmatter` runs first (strips the leading YAML/TOML block).
 *   - `mdFootnotes` runs before `mdWikilinks` so `[^x]` doesn't get
 *     picked up by wiki bracket detection.
 *   - Each `.use()` wraps the `md.parse` it finds, so an extra installed
 *     later runs its parse pass later. `mdMath` must run before the
 *     inline text passes (`mdSubsuper`, `mdHighlight`) so `$…$` is claimed
 *     before `^x^` / `==x==` are scanned; `mdFootnotes` must run before
 *     `mdSubsuper` so `[^id]` references are nodes before the `^x^` scan.
 *   - `mdMermaid` is a render-time post-processor and is safe last.
 *
 * Strict factory-only — the top-level imports below only feed the
 * generated `deps:` field; the factory itself captures none of them.
 * The runtime resolves the extras (each is itself a `{ name,
 * dependencies, factory }` descriptor returning an installable
 * extension) and feeds the materialised extensions to `factory()` below.
 * `main.js` lists this descriptor in its `bundle` array and materialises
 * no singleton: a consumer resolves `mdFullBundle` from a `ModuleRuntime`
 * (or reads `bootstrapMd().mdFull`).
 *
 * @module md/bundles/md-full
 */

import { mdMod as md } from '../md.js';
import { mdFrontmatter } from '../extra/frontmatter.js';
import { mdFootnotes } from '../extra/footnotes.js';
import { mdMath } from '../extra/math.js';
import { mdSubsuper } from '../extra/subsuper.js';
import { mdHighlight } from '../extra/highlight.js';
import { mdEmoji } from '../extra/emoji.js';
import { mdToc } from '../extra/toc.js';
import { mdWikilinks } from '../extra/wikilinks.js';
import { mdAdmonitions } from '../extra/admonitions.js';
import { mdMermaid } from '../extra/mermaid.js';

export const mdFullBundle = {
    name: 'mdFullBundle',
    dependencies: [
        'md',
        'mdFrontmatter', 'mdFootnotes', 'mdMath', 'mdSubsuper', 'mdHighlight',
        'mdEmoji', 'mdToc', 'mdWikilinks', 'mdAdmonitions', 'mdMermaid'
    ],
    deps: [md, mdFrontmatter, mdFootnotes, mdMath, mdSubsuper, mdHighlight, mdEmoji, mdToc, mdWikilinks, mdAdmonitions, mdMermaid],
    factory: function (md, ...extras) {
        for (const e of extras) md.use(e);
        return md;
    }
};
