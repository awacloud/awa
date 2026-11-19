// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/_boot.js
//
// Both-surfaces resolver for the graphic-anim demos harness.
//
// A demo page never imports `@awacloud/fw` or `dist/build/*` directly — it calls
// `boot(variant)` and gets back the resolved `graphic.anim` aggregate surface
// uniformly, whichever variant is running:
//
//   - 'standalone' : the fw-inlined aggregate (`dependencies: []`) — nothing
//                    required at runtime, framework-free.
//   - 'fw'         : the fw-declared aggregate, registered on a fresh fw
//                    `ModuleRuntime` alongside fw's own `secPolicy` + `dom`.
//
// No side effects at import — this module does nothing until `boot()` is
// called. Every fw/dist import below is a RELATIVE path (no bare specifier,
// no import map): these pages must run with no build step, straight off the
// filesystem or a plain static server.

/**
 * @typedef {'standalone'|'fw'} Variant
 */

/**
 * Resolve the `graphic.anim` aggregate surface for either runtime variant.
 *
 * @param {Variant} [variant] Defaults to the `?variant=` URL query param
 *   (e.g. `?variant=fw`), or `'standalone'` when the param is absent/unset.
 * @returns {Promise<{ anim: object, variant: Variant }>}
 */
export async function boot(variant) {
    const resolved = variant
        ?? new URLSearchParams(globalThis.location?.search ?? '').get('variant')
        ?? 'standalone';

    if (resolved === 'fw') {
        const anim = await bootFw();
        return { anim, variant: 'fw' };
    }

    const anim = await bootStandalone();
    return { anim, variant: 'standalone' };
}

/**
 * `standalone` variant: the fw-inlined aggregate needs no registration —
 * its descriptor's `factory()` (`dependencies: []`) resolves the whole
 * `graphic.anim` surface directly.
 *
 * @returns {Promise<object>} The `graphic.anim` core surface.
 */
async function bootStandalone() {
    // Exported descriptor name confirmed live from
    // dist/build/graphic-anim.standalone.js / .standalone.meta.json:
    // `<camel>Bundled` → `graphicAnimBundled` (generator convention, never
    // trust an authoring-time name).
    const { graphicAnimBundled } = await import('../dist/build/graphic-anim.standalone.js');
    return graphicAnimBundled.factory();
}

/**
 * `fw` variant: the fw-declared aggregate must be registered, alongside fw's
 * own `secPolicy` + `dom`, on a fresh `ModuleRuntime`.
 *
 * The aggregate is registered on this runtime under its OWN dist-generated
 * descriptor name (`graphicAnimPackage`, confirmed live from
 * dist/build/graphic-anim.fw.js / .fw.meta.json — generator convention
 * `<camel>Package`) — `'graphic.anim'` is not a name registered on this
 * runtime; it only exists inside the descriptor's own private sub-registry,
 * which its `factory(secPolicy, dom)` already resolves internally and
 * returns directly. Resolving `'graphicAnimPackage'` here yields that exact
 * `graphic.anim` core object.
 *
 * @returns {Promise<object>} The `graphic.anim` core surface.
 */
async function bootFw() {
    const [
        { graphicAnimPackage },
        { ModuleRuntime },
        { secPolicy },
        { dom },
        { interp },
        { easing },
        { clock },
    ] = await Promise.all([
        import('../dist/build/graphic-anim.fw.js'),
        import('../../../fw/src/core/runtime.js'),
        import('../../../fw/src/dom/rendering/secPolicy.js'),
        import('../../../fw/src/dom/query/dom.js'),
        import('../../../fw/src/io/math/interp.js'),
        import('../../../fw/src/io/calc/easing.js'),
        import('../../../fw/src/io/timing/clock.js'),
    ]);

    const runtime = new ModuleRuntime();
    // fw's own descriptors first, in order (dom depends on secPolicy; the
    // three io modules graphic.lerp/easing/scheduler are built on have none).
    runtime.register(secPolicy);
    runtime.register(dom);
    runtime.register(interp);
    runtime.register(easing);
    runtime.register(clock);
    // The package-variant descriptor last.
    runtime.register(graphicAnimPackage);

    return runtime.resolve('graphicAnimPackage');
}
