// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/_svg3d.js
//
// The demos' shared loader of the composed `graphic.svg3d` module, matching
// the variant a page booted (`_boot.js`). `graphic.svg3d` is not part of the
// `graphic.anim` aggregate: it ships its own `dist/build` root, reached with a
// plain relative import (no import map, no bundler).
//
// No side effects at import — nothing happens until `buildComposedSvg3d()`.

/**
 * Resolve `{ Svg3d, createTerrain }` from the dedicated prebuilt root.
 *
 * The `fw` root is the DECLARED-sibling variant: besides `secPolicy`/`dom` it
 * asks for the public `graphic.*` modules it reaches, so the page hands it the
 * ones it already booted off `anim` instead of the artifact carrying a second
 * private copy of them (one scheduler, one tween registry, a ~4× smaller
 * file). The argument list is built from the descriptor's OWN `dependencies`,
 * read live, so a change to the declared set needs no edit here.
 *
 * @param {'standalone'|'fw'} variant
 * @param {object} anim The booted `graphic.anim` aggregate surface.
 * @returns {Promise<{ Svg3d: Function, createTerrain: Function }>}
 */
export async function buildComposedSvg3d(variant, anim) {
    if (variant === 'fw') {
        const [{ graphicSvg3dPackage }, { secPolicy }, { dom }] = await Promise.all([
            import('../dist/build/graphic-svg3d.fw.js'),
            import('../../../fw/src/dom/rendering/secPolicy.js'),
            import('../../../fw/src/dom/query/dom.js'),
        ]);
        // Hand-passed values — the OTHER documented resolution path
        // (`tests/svg3d-prebuilt-root.integration.test.js`'s `resolveByHand`),
        // no `@awacloud/fw` `ModuleRuntime` needed for just these values.
        const secValue = secPolicy.factory();
        const domValue = dom.factory(secValue);
        const fwValues = { secPolicy: secValue, dom: domValue };
        // `graphic.svgBuild` → the booted aggregate's own `svgBuild` member.
        const values = graphicSvg3dPackage.dependencies.map((name) => (
            name.startsWith('graphic.') ? anim[name.slice('graphic.'.length)] : fwValues[name]
        ));
        return graphicSvg3dPackage.factory(...values);
    }
    const { graphicSvg3dBundled } = await import('../dist/build/graphic-svg3d.standalone.js');
    return graphicSvg3dBundled.factory();
}
