// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.scopedIds` — collision-free scoped id generation and
 * reference rewriting fw module descriptor.
 *
 * Replaces the legacy fragile JSON-regex id rewriting with a proper
 * per-instance scoped-id + reference contract: when the same SVG template is
 * instantiated multiple times in one document, each `createScope()` mints a
 * disjoint id set, so `url(#…)` / `href="#…"` references stay internally
 * consistent and never collide across instances.
 *
 * **Minting discipline**: each scope mints ids from a single per-instance
 * monotonic counter, consumed once per unique `rawId` — the same discipline as
 * the fw parser's id generator (`packages/front/fw/src/dom/rendering/parser.js`:
 * `let _seq = 0; const nextId = () => 'p' + (_seq++)`). Only the *structure* is
 * shared; the minted-string shape (`${prefix}-${rawId}-${n}`) and the public
 * contract are graphic's own and are unchanged.
 *
 * **Default-prefix doctrine**: the collision
 * guarantee is *prefix-scoped* — two scopes sharing a prefix mint identical
 * strings. `createScope()` therefore no longer defaults to the bare shared
 * `'g'`: an omitted prefix draws a distinct index from a second, factory-scope
 * monotonic counter and yields `g-<n>`, matching the package's established
 * default-prefix style (`hypertree-<n>` / `pageflip-<n>` / `svg3d-<n>`, each
 * minted by its own in-factory counter). An **explicit** prefix — including a
 * falsy-but-supplied `''` or `null` — bypasses that counter entirely and keeps
 * byte-identical behavior.
 *
 * **Worker-safe**: pure string/id logic. No `window`, no `document`, no
 * module-level mutable state — the per-scope minting counter is instance state
 * and the default-prefix counter lives inside `factory()` (module-scope state
 * would be a `fw/no-factory-capture` violation and would not survive
 * `runtime.serialize()`; see the counter's own note for the resulting bound).
 *
 * @module graphic.scopedIds
 */

/**
 * `graphic.scopedIds` module descriptor.
 *
 * Resolved value: `{ createScope(prefix?: string): Scope }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [], factory(): { createScope(prefix?: string): { id(rawId?: string): string, ref(value: string, attrName?: string): string, prefix: string, seq(): number } } }}
 */
export const scopedIdsModule = {
    name: 'graphic.scopedIds',
    type: 'lib.graphic.svg',
    version: '0.1.0',
    dependencies: [],
    deps: [],

    /**
     * Returns the scope factory.
     *
     * @returns {{ createScope(prefix?: string): { id(rawId?: string): string, ref(value: string, attrName?: string): string, prefix: string, seq(): number } }}
     *
     * @example
     * const { createScope } = scopedIdsModule.factory();
     * const scope = createScope('card');
     * scope.id('grad');                    // 'card-grad-0'
     * scope.id('grad');                    // 'card-grad-0' (same rawId → same id)
     * scope.ref('url(#grad)', 'fill');     // 'url(#card-grad-0)'
     * scope.ref('#grad', 'href');          // '#card-grad-0'
     * scope.ref('#fff', 'fill');           // '#fff' (colour passes through)
     * createScope().prefix;                // 'g-0', then 'g-1', … (distinct)
     */
    factory() {
        /**
         * Factory-scope monotonic counter minting DISTINCT DEFAULT prefixes, so
         * two scopes created with no explicit prefix can never mint colliding
         * ids (the per-instance id prefix rule). Mirrors
         * the counter `hypertree`/`pageflip`/`svg3d` each already keep for the
         * same purpose.
         *
         * Never reset and never re-seeded (no `Date.now()`, no randomness) — ids
         * stay stable-ordered within one process, so tests assert distinctness
         * and format, never absolute values.
         *
         * Declared in-factory, not at module scope: `fw/no-factory-capture`
         * rejects any module-scope binding referenced inside `factory()`,
         * because `runtime.serialize()` ships `factory.toString()` into a bare
         * scope. **Resulting bound**: the counter's lifetime is one `factory()`
         * invocation, i.e. one resolved `graphic.scopedIds` singleton. Two
         * independent containers (an fw runtime plus a `dist/standalone`
         * bundle, say) each restart at 0 — a caller mixing surfaces in one
         * document must still pass its own explicit prefixes.
         * @type {number}
         */
        let _defaultPrefixSeq = 0;

        /**
         * SVG attributes whose value is a bare local reference (`#id`). Used to
         * decide whether a bare `#…` value is an id reference (rewrite) rather
         * than a `#rrggbb` colour (pass through). A `url(#…)` value is always a
         * reference regardless of attribute. Defined in-factory so the
         * descriptor stays capture-free (Worker-serializable).
         * @type {Set<string>}
         */
        const HREF_ATTRS = new Set(['href', 'xlink:href']);

        /**
         * A scope over one template instance. Isolated minting counter + id map
         * guarantee its ids are disjoint from every other scope.
         *
         * @typedef {{ id(rawId?: string): string, ref(value: string, attrName?: string): string, prefix: string, seq(): number }} Scope
         */

        /**
         * Create a fresh, isolated id scope.
         *
         * @param {string} [rawPrefix] Prefix prepended to every minted id. When
         *   omitted, a DISTINCT `g-<n>` is minted from the factory-scope
         *   default-prefix counter so two default scopes never collide. Any
         *   supplied value — including a falsy `''` or `null` — is used
         *   verbatim and leaves the counter untouched.
         * @returns {Scope}
         */
        function createScope(rawPrefix) {
            /**
             * The effective prefix. Only a literally absent argument takes the
             * generated default: `''`/`null` stay verbatim, so every explicit
             * call site keeps byte-identical mints.
             * @type {string}
             */
            const prefix = rawPrefix === undefined ? `g-${_defaultPrefixSeq++}` : rawPrefix;

            /**
             * Per-scope monotonic counter (instance state, not module state).
             * Mirrors the fw parser id generator's single sequence discipline
             * (`packages/front/fw/src/dom/rendering/parser.js` — `let _seq = 0`):
             * one counter is the sole source of the trailing `-${n}` index and is
             * consumed by exactly one call site, `nextSeq()`.
             * @type {number}
             */
            let _seq = 0;

            /**
             * The single monotonic-sequence source — the ONLY place `_seq` is
             * read-and-advanced (mirrors the fw parser's `nextId = () => 'p' +
             * (_seq++)` discipline: one call site owns the increment). Every
             * minted id — anonymous or per-`rawId` — draws its index from here, so
             * indices within a scope form one strictly increasing sequence and no
             * two mints in a scope share an index.
             * @returns {number} The next sequence index (post-increment).
             */
            const nextSeq = () => _seq++;

            /**
             * rawId → scoped id mapping. Ensures a repeated `rawId` (and any
             * forward reference to it) resolves to the same minted id — the
             * "minted-once per unique rawId" half of the discipline: `nextSeq()`
             * fires exactly once per distinct `rawId`, then the result is cached.
             * @type {Map<string, string>}
             */
            const minted = new Map();

            /**
             * Mint (or fetch) the scoped id for a raw id. Deterministic per
             * `(scope, rawId)`: the first sighting mints `${prefix}-${rawId}-${n}`
             * (drawing `n` from the single `nextSeq()` source) and records it;
             * subsequent calls with the same `rawId` return the SAME scoped id
             * without advancing the counter. An empty/absent `rawId` yields an
             * anonymous `${prefix}-${n}` (never recorded — always unique).
             *
             * @param {string} [rawId] Author-supplied id from the template.
             * @returns {string} The scoped id.
             */
            function id(rawId) {
                if (rawId === undefined || rawId === null || rawId === '') {
                    return `${prefix}-${nextSeq()}`;
                }
                const key = String(rawId);
                const existing = minted.get(key);
                if (existing !== undefined) return existing;
                const scoped = `${prefix}-${key}-${nextSeq()}`;
                minted.set(key, scoped);
                return scoped;
            }

            /**
             * Rewrite a string attribute value that references an id.
             *
             * Rewrites only when the value is a genuine id reference:
             *  - `url(#foo)` → `url(#<scoped foo>)` (any attribute; the
             *    `url(#…)` syntax is unambiguous);
             *  - a bare `#foo` → `#<scoped foo>` ONLY for a known reference
             *    attribute (`href` / `xlink:href`) — this disambiguates an id
             *    reference from a `#rrggbb` colour value, which passes through
             *    unchanged.
             *
             * Forward reference: if the referenced `rawId` was never minted, it
             * is minted now, so a `ref` seen before its `id` still maps
             * consistently.
             *
             * Any other value passes through unchanged.
             *
             * @param {string} value      Raw attribute value.
             * @param {string} [attrName] Attribute name the value belongs to.
             * @returns {string} Rewritten (or untouched) value.
             */
            function ref(value, attrName) {
                if (typeof value !== 'string') return value;

                // url(#foo) — unambiguous reference syntax, any attribute.
                const urlMatch = value.match(/^url\(\s*#([^\s)]+)\s*\)$/);
                if (urlMatch) return `url(#${id(urlMatch[1])})`;

                // Bare #foo — only a reference when the attribute is a known
                // href-style reference attr. Otherwise (e.g. fill="#fff") it is
                // a colour and must pass through untouched.
                if (attrName !== undefined && HREF_ATTRS.has(attrName)) {
                    const hashMatch = value.match(/^#([^\s]+)$/);
                    if (hashMatch) return `#${id(hashMatch[1])}`;
                }

                return value;
            }

            return {
                id,
                ref,
                prefix,
                /**
                 * @returns {number} The current in-scope counter (next id
                 *   index) — the live value of the single monotonic sequence.
                 */
                seq() {
                    return _seq;
                },
            };
        }

        return { createScope };
    },
};
