// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the GENERATED dual-surface bundles.
 *
 * Covers:
 *   1. The full expected set of `dist/standalone/*-bundled.js` files exists.
 *   2. Each re-imports cleanly and exposes a single valid module descriptor
 *      (`{ name, dependencies: [], factory }`).
 *   3. Each bundle's factory RESOLVES (runs the inlined mini-DI to build the
 *      core value) without a ReferenceError — the effective capture-free
 *      backstop: a captured free variable would throw here.
 *   4. fw-inlining matches the contract: pure-leaf bundles inline no DOM-bound
 *      fw module, only fw's pure io modules (`interp`, `easing`, `clock`;
 *      Worker-safe), DOM-bound bundles that depend on `dom` inline
 *      `secPolicy`+`dom`.
 *   5. The `dist/build/index.js` barrel re-exports `graphicModules` (18) + every
 *      module descriptor its GENERATED named-export list currently carries,
 *      now including `svg3dModule` (graphic/BATCH_12 task 02 regenerated the
 *      barrel's static named-export list). `graphic.anim` — the whole-package
 *      aggregator — is a registry + `graphicModules` barrel member but NOT a
 *      standalone bundle root (its assembled pair lives in `dist/build`).
 *      The three composed EXTENSION modules `graphic.pageflip`,
 *      `graphic.hypertree` and `graphic.svg3d` DID become standalone roots in
 *      graphic/BATCH_16 task 03 (`tools/generate-bundles.mjs` appends their
 *      bundle entries after `src/main.js`'s frozen fourteen) — ROOTS is 17.
 *   6. DETERMINISM: re-running `gen:bundles` produces byte-identical output,
 *      with no exception — the former `builtAt` ISO stamp was removed from
 *      every `meta.json` by the `graphic/BATCH_19` task 03 ruling, so nothing
 *      is stripped before hashing any more (raw bytes throughout).
 */

// happy-dom provides the DOM globals (HTMLElement, NodeList, document, …) that
// the inlined `dom` factory references when DOM-bound bundle factories resolve.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE       = dirname(fileURLToPath(import.meta.url));
const PKG        = join(HERE, '..');
const STANDALONE = join(PKG, 'dist', 'standalone');
const BUILD      = join(PKG, 'dist', 'build');

// Public resolution roots (kebab file ids) in the frozen registration order.
// W2 (graphic/BATCH_4) appends scoped-ids (pure leaf), svg-build and scene.
// P2 (graphic/BATCH_5) appends frames (DOM-bound via svgApply→dom) topo-last.
// graphic/BATCH_16 task 03 appends the three composed EXTENSION roots
// (pageflip / hypertree / svg3d) AFTER the frozen fourteen, so a bundler-free
// consumer can reach those classes without an import map. Each carries its own
// off-registry DI kernels (`pageflip.fold`/`compose`, `hypertree.layout`/
// `measure`, `svg3d.vec3`/`mesh`/`project`/`apply`), inlined via `extras`.
const ROOTS = [
    'lerp', 'easing', 'units', 'matrix', 'color', 'scoped-ids', 'interpolate',
    'svg-apply', 'svg-build', 'scheduler', 'tween', 'timeline', 'scene', 'frames',
    'pageflip', 'hypertree', 'svg3d',
];

// Bundles that depend (transitively) on fw `dom` → must inline secPolicy+dom.
// W2: svg-build (deps dom+svgApply) and scene (via svgBuild) are DOM-bound;
// scoped-ids is a pure Worker-safe leaf (inlines no fw module at all).
// P2: frames deps graphic.svgApply (→ dom) → DOM-bound.
// BATCH_16: all three extension roots depend on graphic.svgApply (→ dom).
const DOM_BOUND = new Set([
    'svg-apply', 'svg-build', 'tween', 'timeline', 'scene', 'frames',
    'pageflip', 'hypertree', 'svg3d',
]);

function bundlePath(root) {
    return join(STANDALONE, `graphic-${root}-bundled.js`);
}

describe('standalone bundle set', () => {
    test('every expected dist/standalone/*-bundled.js exists', () => {
        for (const root of ROOTS) {
            expect(existsSync(bundlePath(root))).toBe(true);
        }
    });

    test('no unexpected files in dist/standalone (bundled-only surface)', () => {
        const files = readdirSync(STANDALONE).sort();
        // Each bundle has its generated declaration beside it.
        const expected = ROOTS.flatMap(r => [`graphic-${r}-bundled.js`, `graphic-${r}-bundled.d.ts`]).sort();
        expect(files).toEqual(expected);
    });
});

describe('standalone bundles re-import + resolve cleanly', () => {
    for (const root of ROOTS) {
        test(`graphic-${root} imports, is a valid descriptor, and resolves`, async () => {
            const mod = await import(bundlePath(root));
            const keys = Object.keys(mod);
            expect(keys.length).toBe(1);
            const desc = mod[keys[0]];
            expect(desc).toBeTruthy();
            expect(Array.isArray(desc.dependencies)).toBe(true);
            // Standalone bundles declare no external dependencies.
            expect(desc.dependencies).toEqual([]);
            expect(typeof desc.factory).toBe('function');
            // Running the factory exercises the inlined mini-DI end to end;
            // a captured (undefined) free variable would throw here.
            const value = desc.factory();
            expect(value == null).toBe(false);
        });
    }
});

/** fw's pure io modules a pure leaf may inline (no DOM, Worker-safe). */
const PURE_FW_IO = new Set(['interp', 'easing', 'clock']);

describe('fw-inlining matches the frozen contract', () => {
    for (const root of ROOTS) {
        const domBound = DOM_BOUND.has(root);
        test(`graphic-${root} ${domBound ? 'inlines secPolicy+dom' : 'inlines no DOM-bound fw module'}`, () => {
            const src = readFileSync(bundlePath(root), 'utf8');
            const hasSec = src.includes('name: "secPolicy"');
            const hasDom = src.includes('name: "dom"');
            if (domBound) {
                expect(hasSec).toBe(true);
                expect(hasDom).toBe(true);
            } else {
                expect(hasSec).toBe(false);
                expect(hasDom).toBe(false);
                // A pure leaf may inline fw's pure io modules only (graphic.lerp,
                // graphic.easing and graphic.scheduler are built on them).
                const fwInlined = [...src.matchAll(/__register\(\{ name: "([^".]+)"/g)].map((m) => m[1]);
                expect(fwInlined.filter((n) => !PURE_FW_IO.has(n))).toEqual([]);
            }
        });
    }
});

describe('dist/build barrel', () => {
    test('index.js re-exports graphicModules (18) + every descriptor', async () => {
        expect(existsSync(join(BUILD, 'index.js'))).toBe(true);
        const barrel = await import(join(BUILD, 'index.js'));
        expect(Array.isArray(barrel.graphicModules)).toBe(true);
        // graphicModules is re-exported LIVE from src/main.js — its length
        // mirrors the current registry (18, since graphic/BATCH_12 task 02
        // appended graphic.svg3d) even though dist/** itself is unregenerated.
        expect(barrel.graphicModules.length).toBe(18);
        for (const name of [
            'lerpModule', 'easingModule', 'unitsModule', 'matrixModule',
            'colorModule', 'scopedIdsModule', 'interpolateModule', 'svgApplyModule',
            'svgBuildModule', 'schedulerModule', 'tweenModule', 'timelineModule',
            'sceneModule', 'framesModule', 'pageflipModule', 'hypertreeModule',
            'animAggregatorModule', 'svg3dModule',
        ]) {
            expect(typeof barrel[name]).toBe('object');
            expect(barrel[name].name.startsWith('graphic.')).toBe(true);
        }
    });
});

// Determinism and freshness of the generated dist (two runs into temp dirs,
// then a byte comparison with the committed tree) live in
// `tests/dist-freshness.integration.test.js`, which never writes `dist/`.
