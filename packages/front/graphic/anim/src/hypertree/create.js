// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `createHypertree(rootEl, opts)` — the **constructible helper**
 * for `graphic.hypertree`, including the **SVG-root recipe as code**.
 *
 * Before this helper, mounting a tree outside an fw runtime meant calling
 * `hypertreeModule.factory(...)` with **eight positional dependencies** resolved
 * by hand (`demos/hypertree/main.js` does exactly that) AND hand-building a
 * namespace-correct `<svg>` root with a `viewBox` matching the layout radius
 * (`docs/hypertree.md` § "Sizing" prints that recipe as prose). `createHypertree`
 * absorbs both: it registers the descriptor **and its whole transitive `deps`
 * closure** on the helpers' shared `ModuleRuntime` (`registerDeep`, the confirmed
 * off-aggregate recipe), resolves `graphic.hypertree` once, creates the SVG root
 * when the caller hands it a plain container, and constructs the tree.
 *
 * **It composes, it never re-implements.** No descriptor, no factory signature
 * and no dependency tuple is touched (`docs/CONTRACT.md` stays frozen); this
 * module is additive and is not a `graphicModules` member.
 *
 * **One runtime, shared by both helpers and across calls**
 * (`../helpers/shared-runtime.js`, lazily built — no work at import). Sharing
 * matters twice over:
 *   - a second `ModuleRuntime` would resolve a second `graphic.scheduler`
 *     singleton, i.e. a second rAF loop — the single-scheduler invariant, which
 *     holds across `createPageflip` and `createHypertree` alike;
 *   - the default id prefix is minted by a counter living in the resolved
 *     factory's closure, so two trees built through the SAME resolved surface
 *     mint DISTINCT prefixes and therefore disjoint DOM ids. Id collision-freedom
 *     is entirely the scoped-ids doctrine's story — this helper adds none of its
 *     own and just relies on the module's default behaviour (an explicit
 *     `opts.prefix` still wins, unchanged).
 *
 * The runtime is reference-counted: the last `dispose()` releases it, so a page
 * that tears every tree down keeps no engine instances alive.
 *
 * **Not Worker-safe** — element-anchored by design (as is `graphic.hypertree`
 * itself). The pure kernels it composes (`hypertree.layout` /
 * `hypertree.measure`) stay Worker-safe and are untouched.
 *
 * @module graphic.hypertree/create
 */

import { acquireRuntime, releaseRuntime } from '../helpers/shared-runtime.js';
import { hypertreeModule } from './hypertree.js';

/**
 * @typedef {import('./hypertree.js').TreeNode} TreeNode
 */

/**
 * @typedef {import('./hypertree.js').HypertreeOptions & { tree: TreeNode|TreeNode[] }} CreateHypertreeOptions
 * The REAL `Hypertree` options — mirrored verbatim, never widened (`radius?`,
 * `prefix?`, `duration?`, `easing?`, `onFocus?`, `onNodeClick?`,
 * `ignoreWhileFocusing?`, `maxLabel?`, `scheduler?`) — plus `tree`, the
 * constructor's second POSITIONAL argument, which the prescribed two-parameter
 * helper signature `createHypertree(rootEl, opts)` has to carry in `opts`. It is
 * stripped before the rest is forwarded, so the module sees exactly its own
 * option object.
 */

/**
 * @typedef {Object} HypertreeHandle
 * @property {object} instance The live `Hypertree` — its full public API
 *   (`focus` / `focusSync` / `focusId` / `node` / `rootId` / `el`).
 * @property {Element} root The SVG root the tree was built into: the
 *   caller-supplied one, or the element this helper created inside the container.
 * @property {() => void} dispose Idempotent teardown: disposes the instance
 *   (listeners off, focus timelines stopped), removes every node this helper put
 *   in the DOM, and releases its share of the shared runtime.
 */

/**
 * Acquire the helpers' shared runtime (see `../helpers/shared-runtime.js`) and
 * resolve `graphic.hypertree` and `graphic.svgApply` on it. `registerDeep`
 * walks the descriptor's `deps` graph, so the six engine dependencies, the two
 * injected pure kernels and fw's `dom`/`secPolicy` are all registered before it
 * resolves. Callers MUST pair this with {@link release}.
 *
 * @returns {{ Hypertree: Function, SVG_NS: string, svgAttr: Function }}
 */
function acquire() {
    const runtime = acquireRuntime(hypertreeModule);
    const { Hypertree } = runtime.resolve('graphic.hypertree');
    const { SVG_NS, svgAttr } = runtime.resolve('graphic.svgApply');
    return { Hypertree, SVG_NS, svgAttr };
}

/** Release this instance's share of the shared runtime. @returns {void} */
const release = releaseRuntime;

/**
 * Build a radial / hyperbolic tree and mount it under `rootEl` — the one call a
 * non-fw consumer needs.
 *
 * **SVG-root recipe** (`docs/hypertree.md` § "Sizing", as code): the tree lays
 * out in user units on a `2R × 2R` square with the root at `(R, R)`.
 * - `rootEl` already in the SVG namespace (an `<svg>` or a `<g>`) → a conformant
 *   root: used AS-IS, never re-sized, never re-attributed.
 * - `rootEl` a plain container (any HTML element) → the helper creates the root
 *   itself with `createElementNS` (the fw `parser` is HTML-scoped and cannot
 *   produce SVG elements) and appends it. `R` is read back from the LIVE layout
 *   (`instance.node(instance.rootId).x`, the root's own coordinate) rather than
 *   from a duplicated default, so `viewBox="0 0 2R 2R"` fits whatever `radius`
 *   the tree actually used. `preserveAspectRatio="xMidYMid meet"` keeps it fluid
 *   and undistorted; the container owns the CSS size.
 *
 * `opts` minus `tree` is forwarded VERBATIM to the real `Hypertree` constructor,
 * so every documented option keeps its exact meaning and default (including
 * `opts.scheduler`, the test/isolation seam). The helper adds no options of its
 * own.
 *
 * @param {Element} rootEl SVG root, or a plain container to build one in.
 * @param {CreateHypertreeOptions} opts Real `Hypertree` options + the required
 *   `tree` (`{ id, label?, children? }`).
 * @returns {HypertreeHandle}
 * @throws {Error} `createHypertree: rootEl is required` when `rootEl` is absent,
 *   `createHypertree: opts.tree is required` when no tree is supplied, plus
 *   every `Hypertree` constructor error (e.g. a cycle in the tree) — propagated
 *   unchanged, with the helper's own bookkeeping released and any element it had
 *   already inserted removed, so a failed call leaves nothing behind.
 *
 * @example
 * const carto = createHypertree(document.querySelector('#carto'), {
 *     tree: { id: 'root', children: [{ id: 'a' }, { id: 'b' }] },
 *     radius: 400,
 *     onFocus: (id) => console.log('focused', id),
 * });
 * carto.instance.focus('a');
 * carto.dispose();
 */
export function createHypertree(rootEl, opts) {
    if (!rootEl) throw new Error('createHypertree: rootEl is required');
    const o = opts || {};
    if (!o.tree) throw new Error('createHypertree: opts.tree is required');

    const { tree, ...forwarded } = o;
    const { Hypertree, SVG_NS, svgAttr } = acquire();

    // SVG-root recipe: reuse a conformant root, otherwise build one.
    /** @type {Element|null} The root this helper inserted (null when reusing). */
    let createdRoot = null;
    let svgRoot = rootEl;
    if (rootEl.namespaceURI !== SVG_NS) {
        svgRoot = document.createElementNS(SVG_NS, 'svg');
        svgAttr(svgRoot, 'preserveAspectRatio', 'xMidYMid meet');
        rootEl.appendChild(svgRoot);
        createdRoot = svgRoot;
    }

    let instance;
    try {
        instance = new Hypertree(svgRoot, tree, forwarded);
    } catch (err) {
        if (createdRoot && createdRoot.parentNode) {
            createdRoot.parentNode.removeChild(createdRoot);
        }
        release();
        throw err;
    }

    if (createdRoot) {
        // R is the root node's own coordinate in the live layout (root at (R,R)),
        // so the box always matches the radius actually in force.
        const side = instance.node(instance.rootId).x * 2;
        svgAttr(createdRoot, 'viewBox', `0 0 ${side} ${side}`);
    }

    /** @type {boolean} Set by the first `dispose()`; makes it idempotent. */
    let disposed = false;

    return {
        instance,
        root: svgRoot,

        /**
         * Tear down exactly what this call created. `Hypertree#dispose()` removes
         * the click listeners and stops every in-flight focus `Timeline` (so
         * nothing is left ticking on the shared scheduler) but deliberately leaves
         * its subtree attached — the helper owns the mounting, so it also detaches
         * the built `<g>` and, when it created the SVG root, that root too. A
         * caller-supplied root is left in place (the helper never created it),
         * emptied of this tree. Then this handle's share of the shared runtime is
         * released. Idempotent — a second call is a no-op.
         * @returns {void}
         */
        dispose() {
            if (disposed) return;
            disposed = true;
            instance.dispose();
            const built = instance.el;
            if (built && built.parentNode) built.parentNode.removeChild(built);
            if (createdRoot && createdRoot.parentNode) {
                createdRoot.parentNode.removeChild(createdRoot);
            }
            release();
        },
    };
}
