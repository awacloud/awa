// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `mdShared` — canonical source of stateless string /
 * AST helpers that were previously duplicated across multiple `@awacloud/md`
 * extras.
 *
 * Exposes :
 * - **`escapeHtml(s)`** — canonical HTML attribute / text escaping
 *   (`&`, `<`, `>`, `"`). Byte-identical to the version historically
 *   inlined in `extra/admonitions.js`, `extra/footnotes.js` and
 *   `extra/math.js`.
 * - **`escapeForRegex(s)`** — escape every metacharacter so `s` can be
 *   safely interpolated into a `RegExp` body. Identity-preserving for
 *   ASCII alphanumerics. Replaces the inline helper in
 *   `extra/frontmatter.js`.
 * - **`unescapeHtml(s)`** — inverse of `escapeHtml` for `&amp;` /
 *   `&lt;` / `&gt;` / `&quot;`. Historically used by `extra/mermaid.js`,
 *   which now keeps the diagram body escaped; kept as a public helper.
 * - **`createLocalWalker(BLOCK, INLINE)`** — factory returning a
 *   `WalkerLocal` class parameterised by two container-name sets.
 *   Mirrors the worker-safe inline walker historically duplicated in
 *   `renderHtmlMod` and `renderXmlMod`. **Note** : the worker-safe
 *   factories (`render/html.js` and `render/xml.js`) keep their own
 *   inline copy for worker-safety reasons (every name referenced in
 *   their factory body must close over the factory's own scope, not
 *   over imports). This helper is exposed for **non-worker** consumers
 *   that walk the AST with custom container sets (extras, debug tools,
 *   etc.).
 *
 * **Worker-safe** : every export is a pure function ; no module-level
 * mutable state. Consumers obtain helpers via `mdShared.factory()`.
 *
 * @module md/_shared
 */

export const mdShared = {
    name: 'mdShared',
    dependencies: [],

    factory() {
        // --- HTML escape (canonical, byte-identical to extras) ----------
        function escapeHtml(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // --- HTML unescape (inverse of escapeHtml) ----------------------
        // Order matters : `&amp;` must come last so we don't double-decode
        // `&amp;lt;` into `<`. The substitutions on the right-hand side
        // never produce any of the entity prefixes on the left, so the
        // four-entity set above round-trips.
        function unescapeHtml(s) {
            return String(s)
                .replace(/&quot;/g, '"')
                .replace(/&gt;/g, '>')
                .replace(/&lt;/g, '<')
                .replace(/&amp;/g, '&');
        }

        // --- Regex escape ----------------------------------------------
        function escapeForRegex(s) {
            return String(s).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        }

        // --- Local AST walker factory ----------------------------------
        // Returns a `WalkerLocal` class whose container predicate is
        // built from the two sets passed in. Same semantics as
        // `ast/walker.js#walk` (and the inline copies in `render/html.js`
        // / `render/xml.js`).
        function createLocalWalker(BLOCK, INLINE) {
            const blockSet = BLOCK instanceof Set ? BLOCK : new Set(BLOCK || []);
            const inlineSet = INLINE instanceof Set ? INLINE : new Set(INLINE || []);
            function isContainerType(type) {
                return blockSet.has(type) || inlineSet.has(type);
            }
            return class WalkerLocal {
                constructor(root) {
                    this.current = root;
                    this.root = root;
                    this.entering = true;
                }
                next() {
                    const cur = this.current;
                    if (cur === null) return null;
                    const entering = this.entering;
                    const container = isContainerType(cur.type);
                    if (entering && container) {
                        if (cur.firstChild) { this.current = cur.firstChild; this.entering = true; }
                        else { this.entering = false; }
                    } else if (cur === this.root) {
                        this.current = null;
                    } else if (cur.next === null) {
                        this.current = cur.parent; this.entering = false;
                    } else {
                        this.current = cur.next; this.entering = true;
                    }
                    return { entering, node: cur };
                }
            };
        }

        return { escapeHtml, escapeForRegex, unescapeHtml, createLocalWalker };
    }
};
