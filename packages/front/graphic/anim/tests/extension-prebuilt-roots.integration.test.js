// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the DEDICATED `graphic.pageflip` and
 * `graphic.hypertree` prebuilt roots (`graphic/BATCH_16` task 03).
 *
 * Same shape, same reason as `tests/svg3d-prebuilt-root.integration.test.js`.
 * Both composed classes sit OUTSIDE the frozen 14-module `graphic.anim`
 * aggregate, and their only entries (`src/pageflip/pageflip.js`,
 * `src/hypertree/hypertree.js`) transitively import `src/svg/apply.js`'s bare
 * `@awacloud/fw/dom/query/dom.js` specifier — which a browser resolves only
 * through an import map or a bundler. Their pure kernels (`pageflip.fold` /
 * `pageflip.compose`, `hypertree.layout` / `hypertree.measure`) were the only
 * bare-import-free surface.
 *
 * Task 03 closes that gap on both surfaces, from ONE `gen:bundles` run:
 *
 *   - `dist/build/graphic-<root>.{standalone,fw}.*` — the assembled pair, under
 *     the frozen two-variant convention (`ai/conventions/front-package.md`
 *     §"fw add-on packages"): `.standalone.` inlines the fw closure and needs
 *     nothing at runtime; `.fw.` declares `secPolicy`/`dom` as `dependencies`
 *     and has them DI-injected (the smaller artifact).
 *
 * Since `graphic/BATCH_19` task 03 the `.fw.` variant additionally DECLARES the
 * public `graphic.*` siblings it reaches, instead of inlining a second private
 * copy of them (`externalSiblings`, FINDINGS §§ 5–6 of the archived spike
 * `ai/archives/spikes/graphic-anim/w0-declared-dep/`).
 * Its consumer must therefore hold the core registry — which is what
 * `meta.json`'s `siblingDependencies.modules` states — and the artifact shrinks
 * by roughly 4×. The dedup property itself (declared ⇒ NOT inlined; everything
 * else in `modules` still inlined) is asserted below, so the saving cannot
 * silently regress into a second private copy.
 *   - `dist/standalone/graphic-<root>-bundled.js` — the framework-free per-root
 *     bundle, alongside the fourteen engine roots.
 *
 * **Closure completeness is the acceptance criterion**, and the way this file
 * proves it is by driving each prebuilt namespace through the EXACT recipe of
 * the task-02 constructible helpers (`src/pageflip/create.js` mounts with
 * `Pageflip#mountInto(el)`; `src/hypertree/create.js` builds an SVG root when
 * the caller's element is not already in the SVG namespace, then constructs
 * `new Hypertree(svgRoot, tree, opts)`). A missing transitive factory would
 * throw inside the inlined mini-DI before any of that renders. The last
 * describe block additionally cross-checks the prebuilt output against the real
 * helper running off `src/`, so "the built file behaves like the source" is
 * measured, not assumed.
 */

// happy-dom provides the DOM globals the inlined `dom` factory and the built
// SVG subtrees reference when the roots' factories resolve and render.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';

import { graphicModules, fw_require } from '../src/main.js';
import { AGGREGATE_NAMES } from '../src/aggregator.js';
import { createPageflip } from '../src/pageflip/create.js';
import { createHypertree } from '../src/hypertree/create.js';

const HERE       = dirname(fileURLToPath(import.meta.url));
const PKG        = join(HERE, '..');
const BUILD      = join(PKG, 'dist', 'build');
const STANDALONE = join(PKG, 'dist', 'standalone');

/** The fw modules the `fw` variant declares (same closure as every other root). */
const FW_NAMES = fw_require.map((m) => m.name);

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The two roots this task adds, with everything each assertion needs.
 * `modules` mirrors the descriptor's frozen `dependencies` tuple — read from
 * `src/` below rather than duplicated, so a tuple change cannot drift silently.
 */
const ROOTS = [
    {
        fileId:   'graphic-pageflip',
        core:     'graphic.pageflip',
        keys:     ['Pageflip', 'pageflip'],
        kernels:  ['pageflip.fold', 'pageflip.compose'],
    },
    {
        fileId:   'graphic-hypertree',
        core:     'graphic.hypertree',
        keys:     ['Hypertree', 'hypertree'],
        kernels:  ['hypertree.layout', 'hypertree.measure'],
    },
];

/** @param {string} fileId @param {string} variant @param {string} ext */
function buildPath(fileId, variant, ext) {
    return join(BUILD, `${fileId}.${variant}.${ext}`);
}

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
 * registry. This is exactly the precondition the declared `.fw.` variant
 * states in its `meta.json` (`siblingDependencies.modules` = what the runtime
 * must already have registered), and the reason the artifact can drop its own
 * copy of those factories.
 *
 * @returns {object} a fresh `ModuleRuntime` holding fw + `graphicModules`.
 */
function consumerRuntime() {
    const runtime = new ModuleRuntime();
    runtime.registerAllDeep([...fw_require, ...graphicModules]);
    return runtime;
}

/**
 * Resolve an `fw`-variant descriptor the documented consumer way: register it
 * on an `@awacloud/fw` `ModuleRuntime` that already carries everything it
 * declares — the fw modules and the `graphic.*` siblings.
 *
 * @param {object} descriptor The emitted `graphic<Root>Package` descriptor.
 * @returns {object} the resolved namespace.
 */
function resolveOnFwRuntime(descriptor) {
    const runtime = consumerRuntime();
    runtime.registerAllDeep([descriptor]);
    return runtime.resolve(descriptor.name);
}

/**
 * Resolve an `fw`-variant descriptor the OTHER documented way: hand-passed
 * values, the artifact itself never registered anywhere. The argument list is
 * built from the descriptor's OWN `dependencies`, read live — never a
 * hardcoded arity — so this path keeps working as the declared set moves.
 *
 * @param {object} descriptor The emitted descriptor.
 * @returns {object} the resolved namespace.
 */
function resolveByHand(descriptor) {
    const runtime = consumerRuntime();
    return descriptor.factory(...descriptor.dependencies.map((n) => runtime.resolve(n)));
}

/**
 * A no-op scheduler stand-in so no test instance can leak a tickable into a
 * real (even bundle-private) scheduler singleton.
 *
 * @returns {{ add: Function, remove: Function }}
 */
function inertScheduler() {
    return { add() {}, remove() {} };
}

/**
 * A MANUAL-CLOCK scheduler, so a turn can be driven to completion
 * deterministically. A prebuilt root's `factory()` returns only its OWN surface
 * (the documented standalone bundle shape), so the `Scheduler` class is taken
 * from the per-root `graphic-scheduler-bundled.js` bundle — the recipe the
 * standalone surface prescribes for exactly this case.
 *
 * @returns {Promise<{ scheduler: object, tick: (ts: number) => void }>}
 */
async function manualScheduler() {
    const mod = await import(join(STANDALONE, 'graphic-scheduler-bundled.js'));
    const { Scheduler } = mod[Object.keys(mod)[0]].factory();
    let now = 0;
    const scheduler = new Scheduler({ now: () => now, schedule: () => 1, cancel: () => {} });
    return {
        scheduler,
        tick(ts) { now = ts; scheduler.tick(ts); },
    };
}

/** A deterministic three-page book spec. */
function pages() {
    return [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
}

/** A deterministic five-node tree. */
function tree() {
    return {
        id: 'root',
        label: 'root',
        children: [
            { id: 'a', label: 'alpha', children: [{ id: 'a1', label: 'alpha one' }] },
            { id: 'b', label: 'beta' },
        ],
    };
}

/**
 * Build a book from a resolved `graphic.pageflip` namespace using the task-02
 * helper's recipe: construct, then `mountInto(el)`.
 *
 * @param {{ Pageflip: Function }} api Resolved namespace (prebuilt or source).
 * @param {string} prefix Explicit id prefix, so two surfaces are comparable.
 * @param {object} [scheduler] Scheduler override; inert by default.
 * @returns {{ inst: object, host: object }}
 */
function mountBook(api, prefix, scheduler) {
    const host = document.createElement('div');
    const inst = new api.Pageflip({
        pages: pages(), width: 400, height: 560, duration: 400,
        prefix, scheduler: scheduler || inertScheduler(),
    });
    inst.mountInto(host);
    return { inst, host };
}

/**
 * Build a tree from a resolved `graphic.hypertree` namespace using the task-02
 * helper's recipe: create the SVG root when the host is not already SVG, then
 * `new Hypertree(svgRoot, tree, opts)`.
 *
 * @param {{ Hypertree: Function }} api Resolved namespace (prebuilt or source).
 * @param {string} prefix Explicit id prefix, so two surfaces are comparable.
 * @returns {{ inst: object, host: object, svgRoot: object }}
 */
function mountTree(api, prefix) {
    const host = document.createElement('div');
    const svgRoot = document.createElementNS(SVG_NS, 'svg');
    svgRoot.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    host.appendChild(svgRoot);
    const inst = new api.Hypertree(svgRoot, tree(), {
        radius: 200, prefix, scheduler: inertScheduler(),
    });
    return { inst, host, svgRoot };
}

// ── Artifacts exist ─────────────────────────────────────────────────────────

describe('dedicated extension roots — artifacts', () => {
    for (const { fileId } of ROOTS) {
        test(`${fileId}: both variants ship .js / .min.js / .meta.json`, () => {
            for (const variant of ['standalone', 'fw']) {
                for (const ext of ['js', 'min.js', 'meta.json']) {
                    expect(existsSync(buildPath(fileId, variant, ext))).toBe(true);
                }
            }
        });

        test(`${fileId}: every built file carries the GENERATED — do not edit banner`, () => {
            for (const variant of ['standalone', 'fw']) {
                for (const ext of ['js', 'min.js']) {
                    const src = readFileSync(buildPath(fileId, variant, ext), 'utf8');
                    expect(src.startsWith('/* GENERATED')).toBe(true);
                    expect(src).toContain('do not edit');
                }
            }
        });

        test(`${fileId}: a per-root dist/standalone bundle ships too`, () => {
            expect(existsSync(join(STANDALONE, `${fileId}-bundled.js`))).toBe(true);
        });
    }
});

// ── The point of the task: NO bare specifier, in EITHER variant ─────────────

describe('no import map / no bundler required', () => {
    for (const { fileId } of ROOTS) {
        for (const variant of ['standalone', 'fw']) {
            test(`${fileId}.${variant}.js contains no import statement and no @awacloud/fw specifier`, () => {
                const src = readFileSync(buildPath(fileId, variant, 'js'), 'utf8');
                // The very defect these roots close: the composed entry reaches
                // `src/svg/apply.js`, which imports `@awacloud/fw/dom/query/dom.js`.
                expect(src).not.toContain('@awacloud/fw');
                expect(src).not.toContain('import ');
                expect(src).not.toContain('import.meta');
            });
        }

        test(`${fileId}: standalone INLINES the fw closure; fw DECLARES it instead`, () => {
            const sa = readFileSync(buildPath(fileId, 'standalone', 'js'), 'utf8');
            const fw = readFileSync(buildPath(fileId, 'fw', 'js'), 'utf8');
            for (const fwName of FW_NAMES) {
                expect(sa).toContain(`__register({ name: ${JSON.stringify(fwName)}`);
                expect(fw).toContain(`__cache[${JSON.stringify(fwName)}] =`);
                expect(fw).not.toContain(`__register({ name: ${JSON.stringify(fwName)}`);
            }
        });

        test(`${fileId}: the root's own pure kernels are inlined (closure carries the extras)`, () => {
            const { kernels } = ROOTS.find((r) => r.fileId === fileId);
            for (const variant of ['standalone', 'fw']) {
                const src = readFileSync(buildPath(fileId, variant, 'js'), 'utf8');
                for (const kernel of kernels) {
                    expect(src).toContain(`__register({ name: ${JSON.stringify(kernel)}`);
                }
            }
        });
    }
});

// ── Declared siblings: the dedup property, asserted in production ───────────
//
// The `.fw.` variant DECLARES the public `graphic.*` modules it reaches instead
// of inlining a private duplicate of them. Everything here is derived LIVE from
// the emitted descriptor and the registry — never a hardcoded name list — so a
// registry append cannot narrow these gates silently (the standing recount rule,
// `ai/memory/types/graphic.md` § Packaging & registration).

describe('the fw variant declares its graphic.* siblings (BATCH_19 task 03)', () => {
    for (const { fileId, core } of ROOTS) {
        /** The frozen namespace of this root, read live from `src/`. */
        const rootModules = graphicModules.find((m) => m.name === core).dependencies;
        const registryNames = graphicModules.map((m) => m.name);

        test(`${fileId}: fw names come FIRST, then public siblings this root really reaches`, async () => {
            const desc = await importDescriptor(buildPath(fileId, 'fw', 'js'));
            expect(desc.dependencies.slice(0, FW_NAMES.length)).toEqual(FW_NAMES);

            const siblings = desc.dependencies.slice(FW_NAMES.length);
            // NON-VACUITY: if the driver ever stopped passing the option, this
            // whole describe block would otherwise pass by asserting nothing.
            expect(siblings.length).toBeGreaterThan(0);
            for (const name of siblings) {
                // Public: a consumer can `resolve()` it by name off the registry.
                expect(registryNames).toContain(name);
                // Genuinely part of this root's namespace — `modules \ siblings`
                // is the inlined set (spike FINDINGS § 6a).
                expect(rootModules).toContain(name);
                // Never the root itself.
                expect(name).not.toBe(core);
            }
            // The factory takes one parameter per declared dependency.
            expect(desc.factory.length).toBe(desc.dependencies.length);
        });

        test(`${fileId}: every declared sibling is INJECTED, and every other module still INLINED`, async () => {
            const src  = readFileSync(buildPath(fileId, 'fw', 'js'), 'utf8');
            const desc = await importDescriptor(buildPath(fileId, 'fw', 'js'));
            const siblings = desc.dependencies.slice(FW_NAMES.length);

            for (const name of siblings) {
                expect(src).toContain(`__cache[${JSON.stringify(name)}] =`);
                expect(src).not.toContain(`__register({ name: ${JSON.stringify(name)}`);
            }
            // …and nothing else quietly disappeared with them.
            for (const name of rootModules.filter((n) => !siblings.includes(n))) {
                expect(src).toContain(`__register({ name: ${JSON.stringify(name)}`);
            }
        });

        test(`${fileId}: the STANDALONE variant declares nothing and still inlines every sibling`, async () => {
            const desc = await importDescriptor(buildPath(fileId, 'standalone', 'js'));
            expect(desc.dependencies).toEqual([]);
            const src = readFileSync(buildPath(fileId, 'standalone', 'js'), 'utf8');
            // Owner ruling (spike FINDINGS § 7.5): standalone stays fully inlined.
            for (const name of rootModules) {
                expect(src).toContain(`__register({ name: ${JSON.stringify(name)}`);
            }
        });

        test(`${fileId}: declaring is worth it — the fw variant is under HALF the standalone`, () => {
            const fwMeta = JSON.parse(readFileSync(buildPath(fileId, 'fw', 'meta.json'), 'utf8'));
            const saMeta = JSON.parse(readFileSync(buildPath(fileId, 'standalone', 'meta.json'), 'utf8'));
            // RELATIVE, with a wide margin (spike § 6c) — never an absolute byte
            // lock, so unrelated engine edits cannot turn this into a tripwire.
            expect(fwMeta.bytes.dev).toBeLessThan(0.5 * saMeta.bytes.dev);
            expect(fwMeta.bytes.min).toBeLessThan(0.5 * saMeta.bytes.min);
        });
    }
});

// ── Constructibility: the task-02 helper recipe, on the prebuilt namespace ───

describe('graphic-pageflip — constructible from the built file alone', () => {
    test('standalone declares no dependencies and returns { Pageflip, pageflip }', async () => {
        const desc = await importDescriptor(buildPath('graphic-pageflip', 'standalone', 'js'));
        expect(desc.dependencies).toEqual([]);
        expect(desc.factory.length).toBe(0);
        const api = desc.factory();
        expect(Object.keys(api).sort()).toEqual(['Pageflip', 'pageflip']);
    });

    test('standalone mounts a real book and turns a page', async () => {
        const api = (await importDescriptor(buildPath('graphic-pageflip', 'standalone', 'js'))).factory();
        const clock = await manualScheduler();
        const { inst, host } = mountBook(api, 'prebuilt-book', clock.scheduler);

        expect(inst.pageCount).toBe(3);
        expect(inst.el.tagName).toBe('svg');
        expect(inst.el.namespaceURI).toBe(SVG_NS);
        // `mountInto` makes the built root the SOLE child of the host.
        expect(host.childNodes.length).toBe(1);
        expect(host.childNodes[0]).toBe(inst.el);
        // Ids came through the scoped-ids kernel with the explicit prefix.
        expect(inst.el.getAttribute('id')).toBe('prebuilt-book-book-0');

        // The turning <path> sits on top of the page groups (built last).
        const turnPath = inst.el.childNodes[inst.el.childNodes.length - 1];
        expect(turnPath.tagName).toBe('path');

        // The turn is driven by the INLINED `pageflip.fold`/`compose` kernels
        // through the inlined tween/timeline/scheduler chain: a complete
        // closure is the only way any of this renders.
        const tl = inst.goTo('p2');
        expect(tl).toBeTruthy();
        clock.tick(0);
        clock.tick(200);
        // Mid-turn the fold kernel has emitted a real curl path.
        expect(turnPath.getAttribute('d').startsWith('M')).toBe(true);
        clock.tick(400);
        expect(inst.index).toBe(1);
        // On completion the turning path resets to rest.
        expect(turnPath.getAttribute('d')).toBe('');

        inst.dispose();
        expect(host.childNodes.length).toBe(0);
    });

    test('fw variant constructs on a consumer runtime and by hand', async () => {
        const desc = await importDescriptor(buildPath('graphic-pageflip', 'fw', 'js'));
        // The declared closure (fw names + siblings) is contract-checked in the
        // "declares its graphic.* siblings" block; here it only has to WORK.
        expect(desc.dependencies.slice(0, FW_NAMES.length)).toEqual(FW_NAMES);
        expect(desc.factory.length).toBe(desc.dependencies.length);

        for (const api of [resolveOnFwRuntime(desc), resolveByHand(desc)]) {
            expect(Object.keys(api).sort()).toEqual(['Pageflip', 'pageflip']);
            const { inst, host } = mountBook(api, 'fw-book');
            expect(inst.pageCount).toBe(3);
            expect(host.childNodes[0].tagName).toBe('svg');
            inst.dispose();
        }
    });

    test('minified twins construct too', async () => {
        const sa = await importDescriptor(buildPath('graphic-pageflip', 'standalone', 'min.js'));
        expect(sa.dependencies).toEqual([]);
        const saBook = mountBook(sa.factory(), 'min-book');
        expect(saBook.inst.pageCount).toBe(3);
        saBook.inst.dispose();

        const fw = await importDescriptor(buildPath('graphic-pageflip', 'fw', 'min.js'));
        expect(fw.dependencies.slice(0, FW_NAMES.length)).toEqual(FW_NAMES);
        const fwBook = mountBook(resolveOnFwRuntime(fw), 'min-fw-book');
        expect(fwBook.inst.pageCount).toBe(3);
        fwBook.inst.dispose();
    });
});

describe('graphic-hypertree — constructible from the built file alone', () => {
    test('standalone declares no dependencies and returns { Hypertree, hypertree }', async () => {
        const desc = await importDescriptor(buildPath('graphic-hypertree', 'standalone', 'js'));
        expect(desc.dependencies).toEqual([]);
        expect(desc.factory.length).toBe(0);
        const api = desc.factory();
        expect(Object.keys(api).sort()).toEqual(['Hypertree', 'hypertree']);
    });

    test('standalone builds a real tree and focuses a node', async () => {
        const api = (await importDescriptor(buildPath('graphic-hypertree', 'standalone', 'js'))).factory();
        const { inst, svgRoot } = mountTree(api, 'prebuilt-tree');

        // Layout came out of the INLINED `hypertree.layout` kernel.
        expect(inst.rootId).toBe('root');
        expect(inst.node('root').x).toBeCloseTo(200);
        expect(inst.el.tagName).toBe('g');
        expect(inst.el.namespaceURI).toBe(SVG_NS);
        expect(svgRoot.childNodes.length).toBe(1);

        // `focusSync` drives the layout kernel's `focusMove` with no scheduler.
        inst.focusSync('a');
        expect(inst.node('a').x).toBeCloseTo(200);
        expect(inst.node('a').y).toBeCloseTo(200);

        inst.dispose();
    });

    test('fw variant constructs on a consumer runtime and by hand', async () => {
        const desc = await importDescriptor(buildPath('graphic-hypertree', 'fw', 'js'));
        expect(desc.dependencies.slice(0, FW_NAMES.length)).toEqual(FW_NAMES);
        expect(desc.factory.length).toBe(desc.dependencies.length);

        for (const api of [resolveOnFwRuntime(desc), resolveByHand(desc)]) {
            expect(Object.keys(api).sort()).toEqual(['Hypertree', 'hypertree']);
            const { inst, svgRoot } = mountTree(api, 'fw-tree');
            expect(svgRoot.childNodes.length).toBe(1);
            expect(inst.node('a1')).toBeTruthy();
            inst.dispose();
        }
    });

    test('minified twins construct too', async () => {
        const sa = await importDescriptor(buildPath('graphic-hypertree', 'standalone', 'min.js'));
        expect(sa.dependencies).toEqual([]);
        const saTree = mountTree(sa.factory(), 'min-tree');
        expect(saTree.inst.rootId).toBe('root');
        saTree.inst.dispose();

        const fw = await importDescriptor(buildPath('graphic-hypertree', 'fw', 'min.js'));
        expect(fw.dependencies.slice(0, FW_NAMES.length)).toEqual(FW_NAMES);
        const fwTree = mountTree(resolveOnFwRuntime(fw), 'min-fw-tree');
        expect(fwTree.inst.rootId).toBe('root');
        fwTree.inst.dispose();
    });
});

// ── dist/standalone per-root bundles: same closure, other surface ────────────

describe('dist/standalone extension bundles resolve and construct', () => {
    test('graphic-pageflip-bundled builds a book', async () => {
        const mod = await import(join(STANDALONE, 'graphic-pageflip-bundled.js'));
        const desc = mod[Object.keys(mod)[0]];
        expect(desc.dependencies).toEqual([]);
        const { inst, host } = mountBook(desc.factory(), 'sa-bundle-book');
        expect(inst.pageCount).toBe(3);
        inst.dispose();
        expect(host.childNodes.length).toBe(0);
    });

    test('graphic-hypertree-bundled builds a tree', async () => {
        const mod = await import(join(STANDALONE, 'graphic-hypertree-bundled.js'));
        const desc = mod[Object.keys(mod)[0]];
        expect(desc.dependencies).toEqual([]);
        const { inst } = mountTree(desc.factory(), 'sa-bundle-tree');
        expect(inst.node('b')).toBeTruthy();
        inst.dispose();
    });

    test('graphic-svg3d-bundled resolves the composed terrain surface', async () => {
        const mod = await import(join(STANDALONE, 'graphic-svg3d-bundled.js'));
        const desc = mod[Object.keys(mod)[0]];
        expect(desc.dependencies).toEqual([]);
        const api = desc.factory();
        expect(Object.keys(api).sort()).toEqual(['Svg3d', 'createTerrain']);
    });
});

// ── meta.json shape (frozen build-meta) ─────────────────────────────────────

describe('meta shape — variant + fwDependencies discriminators', () => {
    for (const { fileId, core, kernels } of ROOTS) {
        // The frozen dependency tuple, read LIVE from the descriptor rather than
        // duplicated here — `meta.modules` is generated from the same source.
        const descriptor = graphicModules.find((m) => m.name === core);

        for (const [variant, expectedFwDeps] of [['standalone', []], ['fw', FW_NAMES]]) {
            test(`${fileId}.${variant}.meta.json matches the frozen build-meta shape`, () => {
                const meta = JSON.parse(readFileSync(buildPath(fileId, variant, 'meta.json'), 'utf8'));
                expect(meta.kind).toBe('build');
                expect(meta.variant).toBe(variant);
                expect(meta.name).toBe(fileId);
                expect(meta.package).toBe('@awacloud/graphic-anim');
                // A DEDICATED root, not an aggregate: `root`, never `aggregate`.
                expect(meta.root).toBe(core);
                expect(meta.aggregate).toBeUndefined();
                expect(meta.modules).toEqual(descriptor.dependencies);
                // `fwDependencies` keeps its frozen meaning: the fw closure ONLY.
                // Declared `graphic.*` siblings live under `siblingDependencies`.
                expect(meta.fwDependencies).toEqual(expectedFwDeps);
                expect(meta.bytes.dev).toBeGreaterThan(0);
                expect(meta.bytes.min).toBeGreaterThan(0);
                expect(meta.bytes.min).toBeLessThan(meta.bytes.dev);
                expect(meta.domBound).toBe(true);
                expect(meta.workerSafeSlice).toEqual(kernels);
                expect(typeof meta.builtBy).toBe('string');
                // DETERMINISM RULING (BATCH_19 task 03): no build stamp at all.
                expect('builtAt' in meta).toBe(false);
            });
        }

        test(`${fileId}.fw.meta.json carries the siblingDependencies contract; standalone does NOT`, () => {
            const fwMeta = JSON.parse(readFileSync(buildPath(fileId, 'fw', 'meta.json'), 'utf8'));
            const saMeta = JSON.parse(readFileSync(buildPath(fileId, 'standalone', 'meta.json'), 'utf8'));

            // The inlined variant declares nothing, so it gets no key at all —
            // pre-existing meta key sets are preserved exactly (FINDINGS § 6a).
            expect('siblingDependencies' in saMeta).toBe(false);

            expect(Array.isArray(fwMeta.siblingDependencies.modules)).toBe(true);
            expect(fwMeta.siblingDependencies.modules.length).toBeGreaterThan(0);
            expect(fwMeta.siblingDependencies.package).toBe('@awacloud/graphic-anim');
            // The DI contract: every declared name is resolvable off the public
            // registry, and belongs to this root's own namespace.
            for (const name of fwMeta.siblingDependencies.modules) {
                expect(graphicModules.map((m) => m.name)).toContain(name);
                expect(fwMeta.modules).toContain(name);
            }
            // Exactly the two keys — no third key crept into the shape.
            expect(Object.keys(fwMeta.siblingDependencies).sort()).toEqual(['modules', 'package']);
        });

        test(`${fileId}: declared bytes match the files on disk (lockstep)`, async () => {
            for (const variant of ['standalone', 'fw']) {
                const meta = JSON.parse(readFileSync(buildPath(fileId, variant, 'meta.json'), 'utf8'));
                expect(meta.bytes.dev).toBe(readFileSync(buildPath(fileId, variant, 'js')).length);
                expect(meta.bytes.min).toBe(readFileSync(buildPath(fileId, variant, 'min.js')).length);
                // …and the meta's dependency lists are read back from the emitted
                // descriptor: `fwDependencies` ++ `siblingDependencies.modules`
                // reconstructs the descriptor's own `dependencies`, in order.
                const desc = await importDescriptor(buildPath(fileId, variant, 'js'));
                const declared = [
                    ...meta.fwDependencies,
                    ...(meta.siblingDependencies ? meta.siblingDependencies.modules : []),
                ];
                expect(declared).toEqual(desc.dependencies);
            }
        });

        test(`${fileId}: the fw variant is the smaller artifact`, () => {
            const fwMeta = JSON.parse(readFileSync(buildPath(fileId, 'fw', 'meta.json'), 'utf8'));
            const saMeta = JSON.parse(readFileSync(buildPath(fileId, 'standalone', 'meta.json'), 'utf8'));
            expect(fwMeta.bytes.dev).toBeLessThan(saMeta.bytes.dev);
            expect(fwMeta.bytes.min).toBeLessThan(saMeta.bytes.min);
        });
    }
});

// ── The built file agrees with the source helper ────────────────────────────

describe('prebuilt roots agree with the task-02 helpers running off src/', () => {
    test('a prebuilt book and createPageflip() build the same subtree shape', async () => {
        const api = (await importDescriptor(buildPath('graphic-pageflip', 'standalone', 'js'))).factory();
        const built = mountBook(api, 'cmp-book');

        const hostB = document.createElement('div');
        const handle = createPageflip(hostB, {
            pages: pages(), width: 400, height: 560,
            prefix: 'cmp-book', scheduler: inertScheduler(),
        });

        const shape = (el) => Array.from(el.childNodes).map((c) => c.tagName).join(',');
        expect(shape(built.inst.el)).toBe(shape(handle.instance.el));
        expect(built.inst.el.getAttribute('viewBox'))
            .toBe(handle.instance.el.getAttribute('viewBox'));
        expect(built.inst.pageCount).toBe(handle.instance.pageCount);

        built.inst.dispose();
        handle.dispose();
    });

    test('a prebuilt tree and createHypertree() lay out identically', async () => {
        const api = (await importDescriptor(buildPath('graphic-hypertree', 'standalone', 'js'))).factory();
        const built = mountTree(api, 'cmp-tree');

        const hostB = document.createElement('div');
        const handle = createHypertree(hostB, {
            tree: tree(), radius: 200, prefix: 'cmp-tree', scheduler: inertScheduler(),
        });

        for (const id of ['root', 'a', 'a1', 'b']) {
            expect(built.inst.node(id).x).toBeCloseTo(handle.instance.node(id).x, 9);
            expect(built.inst.node(id).y).toBeCloseTo(handle.instance.node(id).y, 9);
        }

        built.inst.dispose();
        handle.dispose();
    });
});

// ── The roots are additive: nothing frozen moved ────────────────────────────

describe('additive only', () => {
    test('neither root joined the aggregate (AGGREGATE_NAMES untouched)', () => {
        expect(AGGREGATE_NAMES).not.toContain('graphic.pageflip');
        expect(AGGREGATE_NAMES).not.toContain('graphic.hypertree');
        expect(AGGREGATE_NAMES.length).toBe(14);
    });

    test('the registry is unchanged by these roots (measured live)', () => {
        expect(graphicModules.length).toBe(18);
        const names = graphicModules.map((m) => m.name);
        expect(names).toContain('graphic.pageflip');
        expect(names).toContain('graphic.hypertree');
    });
});
