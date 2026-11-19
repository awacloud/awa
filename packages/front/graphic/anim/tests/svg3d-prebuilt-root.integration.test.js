// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the DEDICATED `graphic.svg3d` prebuilt root
 * (`graphic/BATCH_15` task 04, closing BACKLOG P2 / `ai/archives/packages/graphic/anim/demos-GAPS.md` item 4).
 *
 * Before this root existed, the composed `Svg3d`/`createTerrain` class was
 * unreachable without tooling: `graphic.svg3d` sits OUTSIDE the frozen
 * 14-module `graphic.anim` aggregate, and its only entry, `src/svg3d/svg3d.js`,
 * transitively imports `src/svg/apply.js`'s bare `@awacloud/fw/dom/query/dom.js`
 * specifier — which a browser resolves only through an import map or a
 * bundler. The four leaf kernels (`vec3`/`mesh`/`project`/`apply`) were the
 * only bare-import-free surface (that is what the BATCH_14 demo had to use).
 *
 * `dist/build/graphic-svg3d.{standalone,fw}.*` is the fix, emitted through the
 * SAME `generatePrebuilds` path as the `graphic-anim` aggregate pair
 * (`tools/generate-bundles.mjs`), under the same frozen two-variant convention
 * (`ai/conventions/front-package.md` §"fw add-on packages"):
 *
 *   - `graphic-svg3d.standalone.*` — generator `bundled` variant. fw INLINED,
 *     `dependencies: []`. A plain relative `import` is enough: no import map,
 *     no bundler, no runtime.
 *   - `graphic-svg3d.fw.*` — generator `package` variant. fw DECLARED as
 *     `dependencies` and DI-injected, NOT inlined (smaller artifact). Still
 *     free of any bare specifier of its own: the consumer supplies the fw
 *     values, either on an `@awacloud/fw` `ModuleRuntime` or by hand. Since
 *     `graphic/BATCH_19` task 03 it ALSO declares the public `graphic.*`
 *     siblings it reaches instead of inlining a private duplicate of them
 *     (`meta.json` → `siblingDependencies`), so its consumer must hold the
 *     `graphic-anim` registry as well.
 *
 * Covers, per variant: the file carries no `import` statement and no `@awacloud/fw`
 * specifier; the descriptor shape; the composed class is CONSTRUCTIBLE from
 * the built file alone; one frame's worth of projected geometry is painted and
 * has the right shape; and both variants agree byte for byte on that geometry.
 * Plus: the aggregate set / registry are untouched by this root.
 */

// happy-dom provides the DOM globals the inlined `dom` factory and the built
// SVG subtree reference when the root's factory resolves and renders.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';

import { graphicModules, fw_require } from '../src/main.js';
import { AGGREGATE_NAMES } from '../src/aggregator.js';

const HERE  = dirname(fileURLToPath(import.meta.url));
const PKG   = join(HERE, '..');
const BUILD = join(PKG, 'dist', 'build');

const STANDALONE_JS   = join(BUILD, 'graphic-svg3d.standalone.js');
const STANDALONE_MIN  = join(BUILD, 'graphic-svg3d.standalone.min.js');
const STANDALONE_META = join(BUILD, 'graphic-svg3d.standalone.meta.json');
const FW_JS           = join(BUILD, 'graphic-svg3d.fw.js');
const FW_MIN          = join(BUILD, 'graphic-svg3d.fw.min.js');
const FW_META         = join(BUILD, 'graphic-svg3d.fw.meta.json');

/** The fw modules the `fw` variant declares (same closure as the aggregate). */
const FW_NAMES = fw_require.map((m) => m.name);

/** The root's own module namespace — `graphic.svg3d`'s factory return. */
const SVG3D_KEYS = ['Svg3d', 'createTerrain'];

/**
 * Import a built root the way a bundler-free consumer would — a plain path
 * import — and return its single descriptor export.
 *
 * @param {string} path Absolute path to the built file.
 * @returns {Promise<object>} the descriptor.
 */
async function importDescriptor(path) {
    const mod = await import(path);
    const keys = Object.keys(mod).filter((k) => k !== 'default');
    expect(keys.length).toBe(1);
    return mod[keys[0]];
}

/**
 * A CONSUMER runtime: the fw modules plus the whole public `graphic.*`
 * registry — the precondition the declared `fw` variant states in its
 * `meta.json` under `siblingDependencies.modules` (BATCH_19 task 03).
 *
 * @returns {object} a fresh `ModuleRuntime` holding fw + `graphicModules`.
 */
function consumerRuntime() {
    const runtime = new ModuleRuntime();
    runtime.registerAllDeep([...fw_require, ...graphicModules]);
    return runtime;
}

/**
 * Resolve the `fw` variant the documented consumer way: register it on an
 * `@awacloud/fw` `ModuleRuntime` that already carries everything it declares —
 * the fw modules and the `graphic.*` siblings.
 *
 * @param {object} descriptor The emitted `graphicSvg3dPackage` descriptor.
 * @returns {object} the resolved `{ Svg3d, createTerrain }`.
 */
function resolveOnFwRuntime(descriptor) {
    const runtime = consumerRuntime();
    runtime.registerAllDeep([descriptor]);
    return runtime.resolve(descriptor.name);
}

/**
 * Resolve the `fw` variant the OTHER documented way: hand-passed values, the
 * artifact itself never registered anywhere. Proves it needs VALUES, not module
 * resolution of its own. The argument list is built from the descriptor's own
 * `dependencies`, read live — never a hardcoded arity.
 *
 * @param {object} descriptor The emitted `graphicSvg3dPackage` descriptor.
 * @returns {object} the resolved `{ Svg3d, createTerrain }`.
 */
function resolveByHand(descriptor) {
    const runtime = consumerRuntime();
    return descriptor.factory(...descriptor.dependencies.map((n) => runtime.resolve(n)));
}

/** A flat (all-zero) heightmap of `side` samples per side — deterministic geometry. */
function flatHeightmap(side) {
    return { side, heights: new Float64Array(side * side) };
}

/**
 * A no-op scheduler stand-in: the constructor's initial render never touches
 * it, and `play()`/`dispose()` only `add`/`remove` against it — so no test
 * instance can ever leak into a real (even bundle-private) scheduler singleton.
 *
 * @returns {{ add: Function, remove: Function }}
 */
function inertScheduler() {
    return { add() {}, remove() {} };
}

/**
 * Build one terrain from a resolved root namespace and return the painted
 * frame: the bucket `d` attributes of the path rig, in DOM order.
 *
 * @param {{ Svg3d: Function, createTerrain: Function }} api Resolved namespace.
 * @returns {{ inst: object, group: object, ds: string[] }}
 */
function paintOneFrame(api) {
    const inst = api.createTerrain(null, flatHeightmap(17) /* cells=16 -> 512 tris */, {
        scheduler: inertScheduler(),
        prefix: 'prebuilt-svg3d',
        width: 640,
        height: 400,
    });
    const group = inst.node.childNodes[0];
    const ds = Array.from(group.childNodes).map((el) => el.getAttribute('d'));
    return { inst, group, ds };
}

// ── Artifacts exist ─────────────────────────────────────────────────────────

describe('dedicated graphic.svg3d root — artifacts', () => {
    test('both variants ship .js / .min.js / .meta.json', () => {
        for (const p of [STANDALONE_JS, STANDALONE_MIN, STANDALONE_META, FW_JS, FW_MIN, FW_META]) {
            expect(existsSync(p)).toBe(true);
        }
    });

    test('every built file carries the GENERATED — do not edit banner', () => {
        for (const p of [STANDALONE_JS, STANDALONE_MIN, FW_JS, FW_MIN]) {
            const src = readFileSync(p, 'utf8');
            expect(src.startsWith('/* GENERATED')).toBe(true);
            expect(src).toContain('do not edit');
        }
    });
});

// ── The point of the task: NO bare specifier, in EITHER variant ─────────────

describe('no import map / no bundler required', () => {
    for (const [label, path] of [['standalone', STANDALONE_JS], ['fw', FW_JS]]) {
        test(`graphic-svg3d.${label}.js contains no import statement and no @awacloud/fw specifier`, () => {
            const src = readFileSync(path, 'utf8');
            // The very defect this root closes: `src/svg3d/svg3d.js` reaches
            // `src/svg/apply.js`, which imports `@awacloud/fw/dom/query/dom.js`.
            expect(src).not.toContain('@awacloud/fw');
            expect(src).not.toContain('import ');
            // No `import.meta.url`-relative asset resolution either (the fw
            // seam risk that bites `wasmRuntime`-shaped modules) — svg3d has
            // no assets: the heightmap always arrives already decoded.
            expect(src).not.toContain('import.meta');
        });
    }

    test('standalone INLINES the fw closure; fw DECLARES it instead', () => {
        const sa = readFileSync(STANDALONE_JS, 'utf8');
        const fw = readFileSync(FW_JS, 'utf8');
        for (const fwName of FW_NAMES) {
            expect(sa).toContain(`__register({ name: ${JSON.stringify(fwName)}`);
            expect(fw).toContain(`__cache[${JSON.stringify(fwName)}] =`);
            expect(fw).not.toContain(`__register({ name: ${JSON.stringify(fwName)}`);
        }
    });
});

// ── Constructibility, per variant (the acceptance criterion) ────────────────

describe('graphic-svg3d.standalone.js — constructible with nothing at runtime', () => {
    test('declares no dependencies and its factory returns { Svg3d, createTerrain }', async () => {
        const desc = await importDescriptor(STANDALONE_JS);
        expect(desc.dependencies).toEqual([]);
        expect(typeof desc.factory).toBe('function');
        expect(desc.factory.length).toBe(0);
        const api = desc.factory();
        expect(Object.keys(api).sort()).toEqual([...SVG3D_KEYS].sort());
        expect(typeof api.Svg3d).toBe('function');
        expect(typeof api.createTerrain).toBe('function');
    });

    test('constructs a terrain and paints one frame of projected geometry', async () => {
        const api = (await importDescriptor(STANDALONE_JS)).factory();
        const { inst, ds } = paintOneFrame(api);

        // Mesh + mode came out of the inlined kernels, not a stub.
        expect(inst.mode).toBe('path');
        expect(inst.mesh.triangleCount).toBe(512);
        expect(inst.prefix).toBe('prebuilt-svg3d');

        // The built subtree is namespace-correct SVG with the default 16 buckets.
        expect(inst.node.tagName).toBe('svg');
        expect(inst.node.namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(ds.length).toBe(16);

        // One frame's worth of geometry: every visible triangle is one
        // `M … L … L … Z` sub-path, spread across the buckets.
        const painted = ds.join('');
        expect(painted.length).toBeGreaterThan(0);
        const triangles = (painted.match(/Z/g) || []).length;
        expect(triangles).toBeGreaterThan(0);
        expect(triangles).toBeLessThanOrEqual(inst.mesh.triangleCount);
        // Every non-empty bucket is a well-formed path starting with a moveto.
        for (const d of ds) {
            if (d !== '') expect(d.startsWith('M')).toBe(true);
        }
    });

    test('re-rendering through the public surface repaints (setCamera / seek)', async () => {
        const api = (await importDescriptor(STANDALONE_JS)).factory();
        const { inst, group } = paintOneFrame(api);
        const before = Array.from(group.childNodes).map((el) => el.getAttribute('d')).join('');

        inst.seek(1000); // quarter of the default 4000 ms orbit — a real rotation
        const after = Array.from(group.childNodes).map((el) => el.getAttribute('d')).join('');
        expect(after).not.toBe(before);

        // Flipping the camera to the far side backface-culls the whole flat
        // mesh: every bucket blanks. Proves the projection kernel is live.
        inst.setCamera({ y: 900 });
        for (const el of group.childNodes) expect(el.getAttribute('d')).toBe('');
    });
});

describe('graphic-svg3d.fw.js — constructible with fw values supplied', () => {
    test('declares the fw names FIRST, then the graphic.* siblings it reaches', async () => {
        const desc = await importDescriptor(FW_JS);
        const rootModules = graphicModules.find((m) => m.name === 'graphic.svg3d').dependencies;
        const registryNames = graphicModules.map((m) => m.name);

        expect(desc.dependencies.slice(0, FW_NAMES.length)).toEqual(FW_NAMES);

        const siblings = desc.dependencies.slice(FW_NAMES.length);
        // NON-VACUITY: without the driver's `externalSiblings` wiring this list
        // is empty and the whole declared-variant claim below asserts nothing.
        expect(siblings.length).toBeGreaterThan(0);
        for (const name of siblings) {
            expect(registryNames).toContain(name);   // resolvable off the registry
            expect(rootModules).toContain(name);     // genuinely this root's own
            expect(name).not.toBe('graphic.svg3d');  // never the root itself
        }
        expect(desc.factory.length).toBe(desc.dependencies.length);
    });

    test('every declared sibling is INJECTED, and every other module still INLINED', async () => {
        const src  = readFileSync(FW_JS, 'utf8');
        const desc = await importDescriptor(FW_JS);
        const siblings = desc.dependencies.slice(FW_NAMES.length);
        const rootModules = graphicModules.find((m) => m.name === 'graphic.svg3d').dependencies;

        for (const name of siblings) {
            expect(src).toContain(`__cache[${JSON.stringify(name)}] =`);
            expect(src).not.toContain(`__register({ name: ${JSON.stringify(name)}`);
        }
        for (const name of rootModules.filter((n) => !siblings.includes(n))) {
            expect(src).toContain(`__register({ name: ${JSON.stringify(name)}`);
        }
    });

    test('the STANDALONE twin declares nothing and still inlines every sibling', async () => {
        const desc = await importDescriptor(STANDALONE_JS);
        expect(desc.dependencies).toEqual([]);
        const src = readFileSync(STANDALONE_JS, 'utf8');
        // Owner ruling (spike FINDINGS § 7.5): standalone stays fully inlined.
        for (const name of graphicModules.find((m) => m.name === 'graphic.svg3d').dependencies) {
            expect(src).toContain(`__register({ name: ${JSON.stringify(name)}`);
        }
    });

    test('resolves { Svg3d, createTerrain } on a real @awacloud/fw ModuleRuntime', async () => {
        const api = resolveOnFwRuntime(await importDescriptor(FW_JS));
        expect(Object.keys(api).sort()).toEqual([...SVG3D_KEYS].sort());
    });

    test('resolves with hand-passed fw values — no runtime needed', async () => {
        const api = resolveByHand(await importDescriptor(FW_JS));
        expect(Object.keys(api).sort()).toEqual([...SVG3D_KEYS].sort());
    });

    test('constructs a terrain and paints one frame of projected geometry', async () => {
        const api = resolveOnFwRuntime(await importDescriptor(FW_JS));
        const { inst, ds } = paintOneFrame(api);
        expect(inst.mode).toBe('path');
        expect(inst.mesh.triangleCount).toBe(512);
        expect(ds.length).toBe(16);
        const triangles = (ds.join('').match(/Z/g) || []).length;
        expect(triangles).toBeGreaterThan(0);
    });

    test('is the smaller artifact — under HALF the standalone once siblings are declared', () => {
        const fwMeta = JSON.parse(readFileSync(FW_META, 'utf8'));
        const saMeta = JSON.parse(readFileSync(STANDALONE_META, 'utf8'));
        // RELATIVE with a wide margin (spike § 6c) — never an absolute byte lock.
        expect(fwMeta.bytes.dev).toBeLessThan(0.5 * saMeta.bytes.dev);
        expect(fwMeta.bytes.min).toBeLessThan(0.5 * saMeta.bytes.min);
    });
});

describe('both variants paint the SAME frame', () => {
    test('standalone factory() and fw runtime-resolve agree on the geometry', async () => {
        const sa = (await importDescriptor(STANDALONE_JS)).factory();
        const fw = resolveOnFwRuntime(await importDescriptor(FW_JS));
        expect(paintOneFrame(sa).ds).toEqual(paintOneFrame(fw).ds);
    });
});

describe('minified twins are constructible too', () => {
    test('graphic-svg3d.standalone.min.js constructs a terrain', async () => {
        const desc = await importDescriptor(STANDALONE_MIN);
        expect(desc.dependencies).toEqual([]);
        const api = desc.factory();
        expect(Object.keys(api).sort()).toEqual([...SVG3D_KEYS].sort());
        expect(paintOneFrame(api).inst.mesh.triangleCount).toBe(512);
    });

    test('graphic-svg3d.fw.min.js constructs a terrain on an fw runtime', async () => {
        const desc = await importDescriptor(FW_MIN);
        expect(desc.dependencies.slice(0, FW_NAMES.length)).toEqual(FW_NAMES);
        const api = resolveOnFwRuntime(desc);
        expect(paintOneFrame(api).inst.mesh.triangleCount).toBe(512);
    });
});

// ── meta.json shape ─────────────────────────────────────────────────────────

describe('meta shape — variant + fwDependencies discriminators', () => {
    for (const [label, path, variant, expectedFwDeps] of [
        ['graphic-svg3d.standalone.meta.json', STANDALONE_META, 'standalone', []],
        ['graphic-svg3d.fw.meta.json', FW_META, 'fw', FW_NAMES],
    ]) {
        test(`${label} matches the frozen build-meta shape`, () => {
            const meta = JSON.parse(readFileSync(path, 'utf8'));
            expect(meta.kind).toBe('build');
            expect(meta.variant).toBe(variant);
            expect(meta.name).toBe('graphic-svg3d');
            expect(meta.package).toBe('@awacloud/graphic-anim');
            // A DEDICATED root, not an aggregate: `root`, never `aggregate`.
            expect(meta.root).toBe('graphic.svg3d');
            expect(meta.aggregate).toBeUndefined();
            expect(meta.modules).toEqual([
                'svg3d.vec3', 'svg3d.mesh', 'svg3d.project', 'svg3d.apply',
                'graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
                'graphic.tween', 'graphic.svgApply', 'graphic.scheduler',
            ]);
            expect(meta.fwDependencies).toEqual(expectedFwDeps);
            expect(meta.bytes.dev).toBeGreaterThan(0);
            expect(meta.bytes.min).toBeGreaterThan(0);
            expect(meta.bytes.min).toBeLessThan(meta.bytes.dev);
            expect(meta.domBound).toBe(true);
            expect(meta.workerSafeSlice).toEqual(['svg3d.vec3', 'svg3d.mesh', 'svg3d.project']);
            expect(typeof meta.builtBy).toBe('string');
            // DETERMINISM RULING (BATCH_19 task 03): no build stamp at all.
            expect('builtAt' in meta).toBe(false);
        });
    }

    test('the fw meta carries siblingDependencies; the standalone meta does not', () => {
        const saMeta = JSON.parse(readFileSync(STANDALONE_META, 'utf8'));
        const fwMeta = JSON.parse(readFileSync(FW_META, 'utf8'));

        // The inlined variant declares nothing, so the key is absent entirely —
        // pre-existing meta key sets are preserved exactly (FINDINGS § 6a).
        expect('siblingDependencies' in saMeta).toBe(false);

        expect(Object.keys(fwMeta.siblingDependencies).sort()).toEqual(['modules', 'package']);
        expect(fwMeta.siblingDependencies.package).toBe('@awacloud/graphic-anim');
        expect(fwMeta.siblingDependencies.modules.length).toBeGreaterThan(0);
        for (const name of fwMeta.siblingDependencies.modules) {
            expect(graphicModules.map((m) => m.name)).toContain(name);
            expect(fwMeta.modules).toContain(name);
        }
    });

    test('the meta dependency lists match each emitted descriptor own dependencies', async () => {
        const saMeta = JSON.parse(readFileSync(STANDALONE_META, 'utf8'));
        const fwMeta = JSON.parse(readFileSync(FW_META, 'utf8'));
        // `fwDependencies` ++ `siblingDependencies.modules` reconstructs the
        // descriptor's own `dependencies`, in order — nothing is hardcoded.
        const declared = (meta) => [
            ...meta.fwDependencies,
            ...(meta.siblingDependencies ? meta.siblingDependencies.modules : []),
        ];
        expect(declared(saMeta)).toEqual((await importDescriptor(STANDALONE_JS)).dependencies);
        expect(declared(fwMeta)).toEqual((await importDescriptor(FW_JS)).dependencies);
    });
});

// ── The root is additive: nothing frozen moved ──────────────────────────────

describe('additive only', () => {
    test('graphic.svg3d is NOT an aggregate member (AGGREGATE_NAMES untouched)', () => {
        expect(AGGREGATE_NAMES).not.toContain('graphic.svg3d');
        expect(AGGREGATE_NAMES.length).toBe(14);
    });

    test('the registry is unchanged by this root (measured live)', () => {
        expect(graphicModules.length).toBe(18);
        expect(graphicModules.map((m) => m.name)).toContain('graphic.svg3d');
    });
});
