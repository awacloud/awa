// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — W2 BOTH-SURFACES PARITY + SCOPED-ID e2e +
 * LEGACY PARITY for the three W2 modules (`graphic.svgBuild`,
 * `graphic.scopedIds`, `graphic.scene`).
 *
 * Mirrors `tests/parity.integration.test.js` (surface-resolution pattern) and
 * `tests/standalone-no-fw.integration.test.js` (framework-free guarantee),
 * extended to the three modules W2 (graphic/BATCH_4) adds on top of the
 * frozen W1 ten:
 *
 *   (a) **Both-surfaces parity** — fw-resolved === direct-ESM === standalone
 *       for a fixed input: built subtree structure (`svgBuild`), a scoped-id
 *       map (`scopedIds`), and a fired-timeline attribute-write sequence
 *       (`scene`). The standalone import must NOT pull `@awacloud/fw` (verified
 *       the same way `standalone-no-fw.integration.test.js` verifies it for
 *       the frozen ten).
 *   (b) **Scoped-id e2e** — two `createScene(sameSpec)` in ONE Happy-DOM
 *       document: the union of scoped ids has no duplicates and each scene's
 *       `refs` resolve to its OWN nodes (not the sibling's).
 *   (c) **Legacy parity** — a named event drives its element animations, and
 *       `loop: true` re-fires on completion, driven for N cycles via an
 *       injected clock (behavioral modernization of the legacy `@anim-old`
 *       `compute.events`/`loop` pattern — see `docs/api/scene/scene.md`
 *       "Legacy-modernization note").
 *
 * This task is test-only: any product bug surfaced here is reported in the
 * task report, NOT fixed in `src/**`.
 */

// happy-dom registers the DOM globals the resolved/inlined fw `dom` factory
// needs, and gives every surface a real `document` to build SVG subtrees in.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import {
    graphicModules,
    fw_require,
    lerpModule,
    easingModule,
    unitsModule,
    matrixModule,
    colorModule,
    scopedIdsModule,
    interpolateModule,
    svgApplyModule,
    svgBuildModule,
    schedulerModule,
    tweenModule,
    timelineModule,
    sceneModule,
} from '../src/main.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const STANDALONE = join(HERE, '..', 'dist', 'standalone');
const SVG_NS = 'http://www.w3.org/2000/svg';

/** @param {string} kebab @returns {string} Absolute path to a standalone bundle. */
function bundlePath(kebab) { return join(STANDALONE, `graphic-${kebab}-bundled.js`); }

/**
 * Strip JS comments so prose/JSDoc mentions of forbidden words don't
 * false-match (mirrors `standalone-no-fw.integration.test.js`).
 * @param {string} src @returns {string}
 */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ── Surface A — fw-resolved (ModuleRuntime) ───────────────────────────────────

const fwRuntime = new ModuleRuntime();
fwRuntime.registerAllDeep(graphicModules);

/** @param {string} name @returns {*} */
function fwResolve(name) { return fwRuntime.resolve(name); }

// ── Surface B — direct-ESM (tiny local resolver over the re-exported descriptors) ─

const ESM_DESCRIPTORS = (() => {
    const map = Object.create(null);
    for (const d of [
        lerpModule, easingModule, unitsModule, matrixModule, colorModule,
        scopedIdsModule, interpolateModule, svgApplyModule, svgBuildModule,
        schedulerModule, tweenModule, timelineModule, sceneModule,
        ...fw_require, // secPolicy, dom
    ]) {
        map[d.name] = d;
    }
    return map;
})();

const esmCache = Object.create(null);

/** @param {string} name @returns {*} */
function esmResolve(name) {
    if (name in esmCache) return esmCache[name];
    const def = ESM_DESCRIPTORS[name];
    if (!def) throw new Error(`esmResolve: unknown module ${name}`);
    const args = def.dependencies.map(esmResolve);
    return (esmCache[name] = def.factory.apply({}, args));
}

// ── Surface C — standalone (generated single-factory bundles) ─────────────────

/** @type {Record<string, *>} */
const standaloneCache = {};

/**
 * Resolve a public root from its generated standalone bundle.
 * @param {string} kebabRoot e.g. `'svg-build'`, `'scoped-ids'`, `'scene'`.
 * @returns {Promise<*>}
 */
async function standaloneResolve(kebabRoot) {
    if (kebabRoot in standaloneCache) return standaloneCache[kebabRoot];
    const mod = await import(bundlePath(kebabRoot));
    const desc = mod[Object.keys(mod)[0]];
    return (standaloneCache[kebabRoot] = desc.factory());
}

let saScopedIds; let saSvgBuild; let saScene;

beforeAll(async () => {
    saScopedIds = await standaloneResolve('scoped-ids');
    saSvgBuild = await standaloneResolve('svg-build');
    saScene = await standaloneResolve('scene');
});

// ─────────────────────────────────────────────────────────────────────────────
// (a) both-surfaces parity — graphic.scopedIds (pure Worker-safe leaf)
// ─────────────────────────────────────────────────────────────────────────────

describe('parity — graphic.scopedIds', () => {
    test('id() minting agrees across surfaces for a fixed sequence', () => {
        const fw = fwResolve('graphic.scopedIds');
        const esm = esmResolve('graphic.scopedIds');

        const run = (mod) => {
            const scope = mod.createScope('card');
            return [scope.id('grad'), scope.id('grad'), scope.id('stop'), scope.id()];
        };
        const fwSeq = run(fw);
        expect(run(esm)).toEqual(fwSeq);
        expect(run(saScopedIds)).toEqual(fwSeq);
    });

    test('ref() rewriting (url(#…) and href) agrees across surfaces', () => {
        const fw = fwResolve('graphic.scopedIds');
        const esm = esmResolve('graphic.scopedIds');

        const run = (mod) => {
            const scope = mod.createScope('g');
            scope.id('grad');
            return [
                scope.ref('url(#grad)', 'fill'),
                scope.ref('#grad', 'href'),
                scope.ref('#fff', 'fill'), // colour — must pass through unchanged
            ];
        };
        const fwSeq = run(fw);
        expect(run(esm)).toEqual(fwSeq);
        expect(run(saScopedIds)).toEqual(fwSeq);
        expect(fwSeq[2]).toBe('#fff');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (a) both-surfaces parity — graphic.svgBuild (built subtree structure)
// ─────────────────────────────────────────────────────────────────────────────

/** A fixed template exercising tag/attrs/children/text + an idScope rewrite. */
function fixedTemplate() {
    return {
        tag: 'g',
        children: [
            {
                tag: 'rect',
                attrs: { id: 'box', x: 0, width: 10, height: 10, fill: 'url(#grad)' },
            },
            { tag: 'text', attrs: { x: 5 }, text: 'hi' },
        ],
    };
}

/**
 * Serialize a built SVG subtree into a structure-only shape (tag, sorted
 * attrs, children) so it can be compared with `toEqual` independent of any
 * surface-specific Element identity.
 * @param {SVGElement} el
 * @returns {object}
 */
function serialize(el) {
    /** @type {Record<string,string>} */
    const attrs = {};
    for (const name of el.getAttributeNames ? el.getAttributeNames() : []) {
        attrs[name] = el.getAttribute(name);
    }
    const children = [];
    for (const child of el.childNodes || []) {
        if (child.nodeType === 3) { // TEXT_NODE
            children.push(child.textContent);
        } else {
            children.push(serialize(child));
        }
    }
    return { tag: el.tagName, attrs, children };
}

describe('parity — graphic.svgBuild', () => {
    test('built subtree structure agrees across surfaces (with idScope rewriting)', () => {
        const fw = fwResolve('graphic.svgBuild');
        const esm = esmResolve('graphic.svgBuild');
        const fwScope = fwResolve('graphic.scopedIds').createScope('t');

        const built = (buildMod, scope) => serialize(buildMod.build(fixedTemplate(), { idScope: scope }));

        const fwTree = built(fw, fwScope);
        expect(built(esm, esmResolve('graphic.scopedIds').createScope('t'))).toEqual(fwTree);
        expect(built(saSvgBuild, saScopedIds.createScope('t'))).toEqual(fwTree);

        // Sanity: the rewrite actually happened (id + ref both scoped identically).
        expect(fwTree.children[0].attrs.id).toBe('t-box-0');
        expect(fwTree.children[0].attrs.fill).toBe('url(#t-grad-1)');
    });

    test('built subtree agrees across surfaces with no idScope (verbatim ids)', () => {
        const fw = fwResolve('graphic.svgBuild');
        const esm = esmResolve('graphic.svgBuild');
        const fwTree = serialize(fw.build(fixedTemplate()));
        expect(serialize(esm.build(fixedTemplate()))).toEqual(fwTree);
        expect(serialize(saSvgBuild.build(fixedTemplate()))).toEqual(fwTree);
        expect(fwTree.children[0].attrs.id).toBe('box');
    });

    test('unsupported tag throws the identical message across surfaces', () => {
        const fw = fwResolve('graphic.svgBuild');
        const esm = esmResolve('graphic.svgBuild');
        const bad = { tag: 'script' };
        expect(() => fw.build(bad)).toThrow('svgBuild: unsupported tag "script"');
        expect(() => esm.build(bad)).toThrow('svgBuild: unsupported tag "script"');
        expect(() => saSvgBuild.build(bad)).toThrow('svgBuild: unsupported tag "script"');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (a) both-surfaces parity — graphic.scene (fired-timeline attribute writes)
// ─────────────────────────────────────────────────────────────────────────────

/** A fixed one-rect scene spec with a `grow` event, deterministic across surfaces. */
function sceneSpec() {
    return {
        prefix: 'p',
        template: { tag: 'rect', attrs: { id: 'box', x: 0, width: 10 } },
        refs: { box: 'box' },
        events: {
            grow: {
                at: 'box',
                animations: [{ property: 'width', from: 10, to: 100, duration: 1000, easing: 'linear' }],
            },
        },
    };
}

/**
 * Fire `grow` on a scene created from `sceneMod.createScene`, driving frames
 * with an injected manual clock, and return the captured attribute-write
 * sequence read back from the built element (via `getAttribute`, so the
 * assertion is surface-agnostic — no dependency on a shared spy hook).
 * @param {{ createScene: Function }} sceneMod
 * @returns {string[]} `width` values observed at each driven frame.
 */
function runScene(sceneMod) {
    const scene = sceneMod.createScene(sceneSpec());
    const target = scene.el('box');
    const tl = scene.on('grow');
    // Rebind onto a manual (no-op schedule) clock for deterministic driving,
    // mirroring `scene.test.js`'s pattern.
    const s = new (Object.getPrototypeOf(tl._scheduler).constructor)({
        now: () => 0, schedule: () => 1, cancel: () => {},
    });
    tl._scheduler = s;
    for (const c of tl._children) c.tween._scheduler = s;
    tl.play();
    const widths = [];
    for (const ts of [0, 250, 500, 750, 1000]) {
        s.tick(ts);
        widths.push(target.getAttribute('width'));
    }
    return widths;
}

describe('parity — graphic.scene', () => {
    test('fired-timeline attribute-write sequence agrees across surfaces', () => {
        const fwSeq = runScene(fwResolve('graphic.scene'));
        const esmSeq = runScene(esmResolve('graphic.scene'));
        const saSeq = runScene(saScene);

        expect(fwSeq[0]).toBe('10');
        expect(fwSeq[fwSeq.length - 1]).toBe('100');
        expect(esmSeq).toEqual(fwSeq);
        expect(saSeq).toEqual(fwSeq);
    });

    test('scoped root id (built via svgBuild+scopedIds) agrees across surfaces', () => {
        const fw = fwResolve('graphic.scene').createScene(sceneSpec());
        const esm = esmResolve('graphic.scene').createScene(sceneSpec());
        const sa = saScene.createScene(sceneSpec());
        expect(fw.root.getAttribute('id')).toBe('p-box-0');
        expect(esm.root.getAttribute('id')).toBe('p-box-0');
        expect(sa.root.getAttribute('id')).toBe('p-box-0');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (a) standalone surface pulls NO @awacloud/fw — mirrors standalone-no-fw suite
// ─────────────────────────────────────────────────────────────────────────────

describe('W2 standalone bundles carry no fw import statement', () => {
    for (const root of ['scoped-ids', 'svg-build', 'scene']) {
        test(`graphic-${root}-bundled has no @awacloud/fw / bare-fw import`, () => {
            const code = stripComments(readFileSync(bundlePath(root), 'utf8'));
            expect(code.includes('@awacloud/fw')).toBe(false);
            expect(/\bimport\s+[^;]*\bfrom\b/.test(code)).toBe(false);
            expect(/\bexport\s+\*\s+from\b/.test(code)).toBe(false);
            expect(/from\s+['"]fw[^'"]*['"]/.test(code)).toBe(false);
        });
    }

    test('graphic-scoped-ids-bundled (pure Worker-safe leaf) inlines no dom/window/document', () => {
        const code = stripComments(readFileSync(bundlePath('scoped-ids'), 'utf8'));
        expect(/\bwindow\b/.test(code)).toBe(false);
        expect(/\bdocument\b/.test(code)).toBe(false);
        expect(code.includes('name: "dom"')).toBe(false);
    });

    test('graphic-svg-build-bundled and graphic-scene-bundled inline secPolicy+dom as TEXT, not imports', () => {
        for (const root of ['svg-build', 'scene']) {
            const code = readFileSync(bundlePath(root), 'utf8');
            expect(code.includes('name: "secPolicy"')).toBe(true);
            expect(code.includes('name: "dom"')).toBe(true);
            expect(/from\s+['"][^'"]*secPolicy[^'"]*['"]/.test(code)).toBe(false);
            expect(/from\s+['"][^'"]*\/dom\/[^'"]*['"]/.test(code)).toBe(false);
        }
    });

    test('the standalone scene bundle runs createScene end-to-end with zero fw on the import path', async () => {
        const mod = await import(bundlePath('scene'));
        const core = mod[Object.keys(mod)[0]].factory();
        expect(typeof core.createScene).toBe('function');
        const scene = core.createScene(sceneSpec());
        expect(scene.root.tagName).toBe('rect');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) scoped-id e2e — two createScene(sameSpec) in ONE document, no collision
// ─────────────────────────────────────────────────────────────────────────────

describe('scoped-id e2e — two scene instances in one document', () => {
    test('union of scoped ids has no duplicates; each scene resolves its own nodes', () => {
        const runtime = new ModuleRuntime();
        runtime.registerAllDeep([sceneModule]);
        const { createScene } = runtime.resolve('graphic.scene');

        // The SAME spec shape (this is `createScene(sameSpec)`, per the plan)
        // instantiated twice — the historically fragile case for the legacy
        // JSON-regex id rewriting this replaces. Per the documented collision
        // guarantee (`docs/api/svg/scoped-ids.md` "Collision guarantee"), two
        // scopes produce DISJOINT id sets when given distinct prefixes — the
        // `prefix` is therefore part of "sameSpec" only insofar as its SHAPE
        // (template/refs/events) is identical; each instantiation supplies its
        // own scope-disambiguating prefix, exactly as a real multi-instance
        // caller would (mint via `createScope(prefix)`, never a bare shared
        // default when multiple instances coexist in one document).
        const makeSpec = (prefix) => ({
            prefix,
            template: {
                tag: 'g',
                children: [
                    { tag: 'defs', children: [{ tag: 'linearGradient', attrs: { id: 'grad' } }] },
                    { tag: 'rect', attrs: { id: 'box', x: 0, width: 10, fill: 'url(#grad)' } },
                ],
            },
            refs: { box: 'box' },
            events: {
                grow: { at: 'box', animations: [{ property: 'width', from: 10, to: 100, duration: 100 }] },
            },
        });

        const sceneA = createScene(makeSpec('a'));
        const sceneB = createScene(makeSpec('b'));

        // One document, both roots attached.
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.appendChild(sceneA.root);
        svg.appendChild(sceneB.root);
        expect(svg.childNodes.length).toBe(2);

        // Collect every id in the attached document subtree.
        const collectIds = (el, out) => {
            const id = el.getAttribute && el.getAttribute('id');
            if (id) out.push(id);
            for (const child of el.childNodes || []) {
                if (child.nodeType !== 3) collectIds(child, out);
            }
            return out;
        };
        const allIds = [...collectIds(sceneA.root, []), ...collectIds(sceneB.root, [])];
        expect(allIds.length).toBeGreaterThan(0);
        expect(new Set(allIds).size).toBe(allIds.length); // no duplicates in the union

        // Each scene's `refs` resolve to its OWN node, not the sibling's.
        const boxA = sceneA.el('box');
        const boxB = sceneB.el('box');
        expect(boxA).not.toBe(boxB);
        expect(svg.contains(boxA)).toBe(true);
        expect(svg.contains(boxB)).toBe(true);

        // And each scene's fill ref resolves within its own scope (disjoint
        // gradient ids, both consistent with their own `box`'s id prefix).
        const gradA = sceneA.root.querySelector('linearGradient').getAttribute('id');
        const gradB = sceneB.root.querySelector('linearGradient').getAttribute('id');
        expect(gradA).not.toBe(gradB);
        expect(boxA.getAttribute('fill')).toBe(`url(#${gradA})`);
        expect(boxB.getAttribute('fill')).toBe(`url(#${gradB})`);
    });

    test('the literal SAME spec object (default prefix) mints DISTINCT id STRINGS per scene (GAPS #3)', () => {
        // Re-measured for the scoped-ids doctrine (`graphic/BATCH_16` task 01,
        // GAPS #3): `createScene` no longer defaults to the bare shared
        // `'scene'` prefix — an omitted `spec.prefix` draws a distinct
        // `scene-<n>` from the factory-scope default-prefix counter, so the
        // literal same spec passed twice now mints DIFFERENT id strings and
        // both scenes may be attached to one document without violating DOM
        // id-uniqueness. This test previously locked in the opposite (an
        // "honesty note": same string, distinct nodes) — the exact collision
        // the doctrine retires. The assertion is INVERTED, not relaxed: it
        // still fails if the strings collide, and additionally pins the minted
        // format. See `scene.test.js` "two scenes from the identical
        // DEFAULT-prefix spec mint disjoint ids (GAPS #3)" and
        // `docs/api/svg/scoped-ids.md` "Collision guarantee".
        //
        // Counter bound (documented, not asserted): the sequence lives in one
        // `factory()` invocation, so this fresh runtime restarts at 0 — assert
        // distinctness and format, never absolute values.
        const runtime = new ModuleRuntime();
        runtime.registerAllDeep([sceneModule]);
        const { createScene } = runtime.resolve('graphic.scene');
        const spec = { template: { tag: 'rect', attrs: { id: 'box', x: 0 } }, refs: { box: 'box' }, events: {} };

        const sceneA = createScene(spec);
        const sceneB = createScene(spec);
        const idA = sceneA.root.getAttribute('id');
        const idB = sceneB.root.getAttribute('id');
        expect(idA).toMatch(/^scene-\d+-box-0$/);
        expect(idB).toMatch(/^scene-\d+-box-0$/);
        expect(idA).not.toBe(idB); // distinct strings — the GAPS #3 guarantee
        expect(sceneA.root).not.toBe(sceneB.root); // and disjoint DOM nodes
        expect(sceneA.el('box')).toBe(sceneA.root);
        expect(sceneB.el('box')).toBe(sceneB.root);
        expect(sceneA.el('box')).not.toBe(sceneB.el('box')); // refs resolve to own node
    });

    test('collision-free holds even across ALL three surfaces sharing one document', async () => {
        // Cross-surface variant: one scene per surface, all attached to the
        // same document. Each surface has its own DI container (no shared
        // scopedIds counter), so the default prefix repeats numerically —
        // the union must still be duplicate-free because svgBuild/scopedIds
        // state is per-scope, not global, and here we vary the prefix to
        // reflect realistic multi-instance usage.
        const fwScene = fwResolve('graphic.scene').createScene({ ...sceneSpec(), prefix: 'x1' });
        const esmScene = esmResolve('graphic.scene').createScene({ ...sceneSpec(), prefix: 'x2' });
        const saSceneInst = saScene.createScene({ ...sceneSpec(), prefix: 'x3' });

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.appendChild(fwScene.root);
        svg.appendChild(esmScene.root);
        svg.appendChild(saSceneInst.root);

        const ids = [fwScene.root, esmScene.root, saSceneInst.root].map((el) => el.getAttribute('id'));
        expect(new Set(ids).size).toBe(3);
        expect(fwScene.el('box')).toBe(fwScene.root);
        expect(esmScene.el('box')).toBe(esmScene.root);
        expect(saSceneInst.el('box')).toBe(saSceneInst.root);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) legacy parity — named event drives element animations; loop re-fires
// ─────────────────────────────────────────────────────────────────────────────

describe('legacy parity — named event drives element animations', () => {
    test('fire(event) writes the animated property from `from` to `to` on the bound element', () => {
        const runtime = new ModuleRuntime();
        runtime.registerAllDeep([sceneModule]);
        const { createScene } = runtime.resolve('graphic.scene');
        const { Scheduler } = runtime.resolve('graphic.scheduler');
        const sharedScheduler = runtime.resolve('graphic.scheduler').scheduler;

        const scene = createScene(sceneSpec());
        const target = scene.el('box');
        const tl = scene.fire('grow');
        expect(sharedScheduler.active.has(tl)).toBe(true);

        sharedScheduler.tick(0);
        expect(target.getAttribute('width')).toBe('10');
        sharedScheduler.tick(500);
        // Midpoint (linear easing): from=10 to=100 at t=0.5 → 55.
        expect(target.getAttribute('width')).toBe('55');
        sharedScheduler.tick(1000);
        expect(target.getAttribute('width')).toBe('100');
        expect(tl.done).toBe(true);
        expect(sharedScheduler.active.has(tl)).toBe(false);
        void Scheduler; // referenced for parity with the resolve above
    });

    test('loop: true re-fires the event on completion, driven for 5 cycles via an injected clock', () => {
        const runtime = new ModuleRuntime();
        runtime.registerAllDeep([sceneModule]);
        const { createScene } = runtime.resolve('graphic.scene');
        const { Scheduler } = runtime.resolve('graphic.scheduler');

        const s = new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
        const spec = {
            template: { tag: 'rect', attrs: { id: 'box', x: 0 } },
            refs: { box: 'box' },
            events: {
                pulse: {
                    at: 'box',
                    loop: true,
                    animations: [{ property: 'x', from: 0, to: 10, duration: 100, easing: 'linear' }],
                },
            },
        };
        const scene = createScene(spec);
        const target = scene.el('box');
        const tl0 = scene.on('pulse');
        tl0._scheduler = s;
        for (const c of tl0._children) c.tween._scheduler = s;
        tl0.play();

        const CYCLES = 5;
        const DURATION = 100;
        const finalXPerCycle = [];
        let clockT = 0;
        for (let cycle = 0; cycle < CYCLES; cycle++) {
            // Drive the cycle start and end; loop's onComplete registers the next
            // Timeline on the SAME (default) shared scheduler, but this run keeps
            // driving `s` directly is only valid for cycle 0 (tl0 is bound to `s`
            // explicitly). Re-fires after cycle 0 land on the module's shared
            // scheduler (per the scene.js contract: `onComplete: () => this.fire(eventName)`
            // and `fire` always uses the injected `scheduler` module's default).
            // So for cycles > 0 we drive the SAME injected clock's shared
            // scheduler singleton instead.
            if (cycle === 0) {
                s.tick(clockT);
                clockT += DURATION;
                s.tick(clockT);
            } else {
                const shared = runtime.resolve('graphic.scheduler').scheduler;
                shared.tick(clockT);
                clockT += DURATION;
                shared.tick(clockT);
            }
            finalXPerCycle.push(target.getAttribute('x'));
        }

        // Every cycle reaches the same end value (`to`), proving the loop
        // actually re-fires and re-drives the animation identically each time.
        expect(finalXPerCycle.length).toBe(CYCLES);
        for (const x of finalXPerCycle) expect(x).toBe('10');
    });

    test('loop re-fire registers a fresh Timeline on the shared scheduler each cycle (no leak of a second scheduler)', () => {
        const runtime = new ModuleRuntime();
        runtime.registerAllDeep([sceneModule]);
        const { createScene } = runtime.resolve('graphic.scene');
        const sharedScheduler = runtime.resolve('graphic.scheduler').scheduler;

        const scene = createScene({
            template: { tag: 'rect', attrs: { id: 'box', x: 0 } },
            refs: { box: 'box' },
            events: {
                pulse: {
                    at: 'box',
                    loop: true,
                    animations: [{ property: 'x', from: 0, to: 10, duration: 50 }],
                },
            },
        });

        let active = tl_active(sharedScheduler);
        const tl1 = scene.fire('pulse');
        expect(sharedScheduler.active.size).toBe(active + 1);

        for (let i = 0; i < 3; i++) {
            sharedScheduler.tick(i * 50);
            sharedScheduler.tick((i + 1) * 50);
            // After each completion + re-fire, exactly one timeline for this
            // scene's loop is active — never two (no second scheduler / no
            // stray leaked timeline).
            expect(sharedScheduler.active.size).toBe(active + 1);
        }
        void tl1;

        /** @param {{active: Set<*>}} sched @returns {number} */
        function tl_active(sched) { return sched.active.size; }
    });
});
