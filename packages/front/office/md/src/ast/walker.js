// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview AST walker for CommonMark trees.
 *
 * Strict factory-only : the `walk(root)` generator (and a `Walker`
 * re-export shim for back-compat) live inside the `mdAstWalker`
 * descriptor's `factory()` body. The factory takes the `mdNode` API as
 * an injected dependency to source the `Walker` class identity.
 *
 * **Shim contract.** `mdAstWalker` does not define its own `Walker`
 * class — the canonical imperative walker (`{ next(), resumeAt() }`,
 * `next()` returns `{ node, entering }` or `null` at end-of-tree) is
 * `mdNode`'s. This module is a thin **adapter shim**: `walk(root)`
 * wraps a fresh `new Walker(root)` in a generator so callers can use
 * `for…of` / `for await…of` instead of manually pumping `.next()`
 * against a sentinel `null`. Contract:
 *  - `walk(root)` yields `WalkEvent` objects, one per `Walker#next()`
 *    call, in the same pre-order-with-explicit-exit sequence `Walker`
 *    itself produces (see `mdNode`'s `Walker.next()` for the traversal
 *    rule) — the shim adds no buffering, filtering, or reordering.
 *  - `Walker` is re-exported unchanged (identity-preserving) purely
 *    for back-compat consumers that still instantiate it directly
 *    (e.g. `node.walker()` in `mdNode`); new code should prefer
 *    `walk(root)`.
 *  - The generator holds no state beyond the wrapped `Walker` instance
 *    — resumability/early-`break` semantics are exactly a generator's
 *    (the underlying `Walker` is simply abandoned, safely, since it
 *    carries no external references).
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field). The factory
 * must be invoked with its deps (either via DI through the
 * `ModuleRuntime`, or explicitly by passing the resolved `mdNode` API).
 * No top-level materialisation — the canonical instance is produced by
 * `main.js` (sole bootstrap site) and seeded into the package-level
 * `ModuleRuntime`.
 *
 * @module md/ast/walker
 */

import { mdNode } from './node.js';

/**
 * @typedef {Object} WalkEvent
 * @property {import('./node.js').Node} node — the AST node being visited.
 * @property {boolean} entering — `true` on the pre-order (descending)
 *   visit of a container node, `false` on its post-order (ascending)
 *   visit; always `true` for a non-container (leaf) node.
 */

export const mdAstWalker = {
    name: 'mdAstWalker',
    dependencies: ['mdNode'],
    deps: [mdNode],
    factory(nodeApi) {
        const { Walker } = nodeApi;

        /**
         * Adapt a `Walker` so it can be consumed by `for…of`. Shim over
         * `Walker#next()` — see the module-level "Shim contract" note.
         *
         * @param {import('./node.js').Node} root
         * @returns {Generator<WalkEvent, void, void>}
         */
        function* walk(root) {
            const w = new Walker(root);
            let ev;
            while ((ev = w.next()) !== null) yield ev;
        }

        return { walk, Walker };
    }
};
