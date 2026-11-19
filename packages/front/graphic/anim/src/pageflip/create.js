// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `createPageflip(el, opts)` — the **constructible helper** for
 * `graphic.pageflip`, so a non-fw consumer stops hand-wiring the descriptor.
 *
 * Before this helper, mounting a book outside an fw runtime meant calling
 * `pageflipModule.factory(...)` with **seven positional dependencies** resolved
 * by hand (`demos/pageflip/main.js` does exactly that — svgBuild, scopedIds,
 * timeline, tween, svgApply plus the two pure kernels `pageflip.fold` /
 * `pageflip.compose`). `createPageflip` absorbs that wiring: it registers the
 * descriptor **and its whole transitive `deps` closure** on the helpers'
 * shared `ModuleRuntime` (`registerDeep`, the confirmed off-aggregate recipe), resolves
 * `graphic.pageflip` (cached by the runtime), constructs a {@link Pageflip} from the caller's
 * options and mounts it into `el`.
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
 *     factory's closure, so two books built through the SAME resolved surface
 *     mint DISTINCT prefixes and therefore disjoint DOM ids. Id collision-freedom
 *     is entirely the scoped-ids doctrine's story — this helper adds none of its
 *     own and just relies on the module's default behaviour (an explicit
 *     `opts.prefix` still wins, unchanged).
 *
 * The runtime is reference-counted: the last `dispose()` releases it, so a page
 * that tears every book down keeps no engine instances alive.
 *
 * **Not Worker-safe** — element-anchored by design (as is `graphic.pageflip`
 * itself). The pure kernels it composes (`pageflip.fold` / `pageflip.compose`)
 * stay Worker-safe and are untouched.
 *
 * @module graphic.pageflip/create
 */

import { acquireRuntime, releaseRuntime } from '../helpers/shared-runtime.js';
import { pageflipModule } from './pageflip.js';

/**
 * @typedef {import('./pageflip.js').PageflipOptions} PageflipOptions
 * The REAL factory options — mirrored verbatim, never widened: `pages`,
 * `width`, `height`, `prefix?`, `duration?`, `easing?`, `marginPercent?`,
 * `ratio?`, `scheduler?`.
 */

/**
 * @typedef {Object} PageflipHandle
 * @property {object} instance The live `Pageflip` — its full public API
 *   (`next` / `previous` / `goTo` / `currentId` / `index` / `pageCount` / `el`).
 * @property {() => void} dispose Idempotent teardown: disposes the instance
 *   (cancelling any in-flight turn and detaching its subtree) and releases this
 *   helper's share of the shared runtime.
 */

/**
 * Acquire the helpers' shared runtime (see `../helpers/shared-runtime.js`) and
 * resolve `graphic.pageflip` on it. `registerDeep` walks the descriptor's
 * `deps` graph, so the five engine dependencies, the two injected pure kernels
 * and fw's `dom`/`secPolicy` are all registered before it resolves. Callers
 * MUST pair this with {@link release}.
 *
 * @returns {{ Pageflip: Function }} The resolved `graphic.pageflip` surface.
 */
function acquire() {
    return /** @type {{ Pageflip: Function }} */ (
        acquireRuntime(pageflipModule).resolve('graphic.pageflip')
    );
}

/** Release this instance's share of the shared runtime. @returns {void} */
const release = releaseRuntime;

/**
 * Build a page-turn book and mount it into `el` — the one call a non-fw
 * consumer needs.
 *
 * `opts` is forwarded VERBATIM to the real `Pageflip` constructor, so every
 * documented option keeps its exact meaning and default (including
 * `opts.scheduler`, the test/isolation seam). The helper adds no options of its
 * own.
 *
 * Mounting goes through `Pageflip#mountInto(el)`, i.e. the book's built `<svg>`
 * becomes the SOLE child of `el` (`replaceChildren`) — the module's own
 * documented mount semantics, not a new one.
 *
 * @param {Element} el Mount point. Its children are replaced by the book.
 * @param {PageflipOptions} opts Real `Pageflip` options (`pages`, `width`,
 *   `height` are required by the constructor).
 * @returns {PageflipHandle}
 * @throws {Error} `createPageflip: el must be an element` when `el` cannot be
 *   mounted into, plus every `Pageflip` constructor error (empty `pages`,
 *   non-positive `width`/`height`) — propagated unchanged, with the helper's
 *   own bookkeeping released first so a failed call leaks nothing.
 *
 * @example
 * const book = createPageflip(document.querySelector('#stage'), {
 *     pages: [{ id: 'p1' }, { id: 'p2' }],
 *     width: 400, height: 560, duration: 500,
 * });
 * book.instance.next();
 * book.dispose();
 */
export function createPageflip(el, opts) {
    if (!el || typeof el.replaceChildren !== 'function') {
        throw new Error('createPageflip: el must be an element');
    }

    const { Pageflip } = acquire();

    let instance;
    try {
        instance = new Pageflip(opts || {});
    } catch (err) {
        release();
        throw err;
    }
    instance.mountInto(el);

    /** @type {boolean} Set by the first `dispose()`; makes it idempotent. */
    let disposed = false;

    return {
        instance,

        /**
         * Tear down exactly what this call created: `Pageflip#dispose()` cancels
         * any in-flight turn `Timeline` (so nothing is left ticking on the shared
         * scheduler) and detaches the book's subtree from `el`, leaving no DOM
         * residue; then this handle's share of the shared runtime is released.
         * Idempotent — a second call is a no-op.
         * @returns {void}
         */
        dispose() {
            if (disposed) return;
            disposed = true;
            instance.dispose();
            release();
        },
    };
}
