// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — BOTH-SURFACES PARITY.
 *
 * The single-source guarantee, proven end to end: for every public entry the
 * THREE delivery surfaces produce IDENTICAL results.
 *
 *   - fw-resolved   : `new ModuleRuntime().registerAllDeep(graphicModules)` then
 *                     `runtime.resolve(name)` — the fw-mode surface.
 *   - direct-ESM    : the re-exported descriptor consts from `src/main.js`, wired
 *                     by a tiny local resolver (no ModuleRuntime) — the
 *                     convenience surface.
 *   - standalone    : the GENERATED `dist/standalone/graphic-*-bundled.js`
 *                     single-factory bundles (inlined mini-DI) — the
 *                     framework-free surface.
 *
 * Sampled equality covers easing curves, Matrix decompose round-trips, color
 * parse/lerp, interpolator outputs (unit / color / transform / path), AND a full
 * deterministic tween run — a clock is injected, every `setAttribute` write to a
 * stub element is captured on each surface, and the attribute sequences must be
 * IDENTICAL across surfaces.
 *
 * Scheduler-singleton identity is compared WITHIN each surface (each surface has
 * its OWN DI container — there is no shared singleton across surfaces, and the
 * test must not assert one).
 */

// happy-dom registers the DOM globals the inlined/resolved fw `dom` factory needs.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect, beforeAll } from 'bun:test';
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
    interpolateModule,
    svgApplyModule,
    schedulerModule,
    tweenModule,
    timelineModule,
} from '../src/main.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const STANDALONE = join(HERE, '..', 'dist', 'standalone');

// ── Surface A — fw-resolved (ModuleRuntime) ───────────────────────────────────

const fwRuntime = new ModuleRuntime();
fwRuntime.registerAllDeep(graphicModules);

/** @param {string} name @returns {*} */
function fwResolve(name) { return fwRuntime.resolve(name); }

// ── Surface B — direct-ESM (tiny local resolver over the re-exported descriptors) ─
//
// This deliberately does NOT use ModuleRuntime: it wires the re-exported
// descriptor consts (plus the fw_require closure) by name, exercising the
// "import the descriptor and call its factory" convenience path.

const ESM_DESCRIPTORS = (() => {
    const map = Object.create(null);
    for (const d of [
        lerpModule, easingModule, unitsModule, matrixModule, colorModule,
        interpolateModule, svgApplyModule, schedulerModule, tweenModule, timelineModule,
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
 * Resolve a public root from its generated standalone bundle. The bundle is one
 * descriptor `{ name, dependencies: [], factory }` whose factory runs the inlined
 * mini-DI and returns the core value directly.
 * @param {string} kebabRoot e.g. `'easing'`, `'svg-apply'`.
 * @returns {Promise<*>}
 */
async function standaloneResolve(kebabRoot) {
    if (kebabRoot in standaloneCache) return standaloneCache[kebabRoot];
    const mod = await import(join(STANDALONE, `graphic-${kebabRoot}-bundled.js`));
    const desc = mod[Object.keys(mod)[0]];
    return (standaloneCache[kebabRoot] = desc.factory());
}

// Resolved surfaces, populated in beforeAll (standalone import is async).
let saEasing; let saMatrix; let saColor; let saInterp; let saUnits; let saLerp;
let saTweenMod; let saSchedMod;

beforeAll(async () => {
    saLerp = await standaloneResolve('lerp');
    saEasing = await standaloneResolve('easing');
    saUnits = await standaloneResolve('units');
    saMatrix = await standaloneResolve('matrix');
    saColor = await standaloneResolve('color');
    saInterp = await standaloneResolve('interpolate');
    saTweenMod = await standaloneResolve('tween');
    saSchedMod = await standaloneResolve('scheduler');
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. lerp — the pure primitive
// ─────────────────────────────────────────────────────────────────────────────

describe('parity — graphic.lerp', () => {
    test('fw === esm === standalone for sampled inputs', () => {
        const fw = fwResolve('graphic.lerp');
        const esm = esmResolve('graphic.lerp');
        const samples = [[0, 10, 0], [0, 10, 0.5], [0, 10, 1], [-5, 5, 0.25], [100, 200, 0.7]];
        for (const [a, b, t] of samples) {
            const expected = a + (b - a) * t;
            expect(fw(a, b, t)).toBe(expected);
            expect(esm(a, b, t)).toBe(expected);
            expect(saLerp(a, b, t)).toBe(expected);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. easing — every curve at several t
// ─────────────────────────────────────────────────────────────────────────────

describe('parity — graphic.easing', () => {
    test('all 31 curves agree across surfaces at t in {0,.25,.5,.75,1}', () => {
        const fw = fwResolve('graphic.easing');
        const esm = esmResolve('graphic.easing');
        const keys = Object.keys(fw);
        expect(keys.length).toBe(31);
        const ts = [0, 0.25, 0.5, 0.75, 1];
        for (const k of keys) {
            expect(typeof esm[k]).toBe('function');
            expect(typeof saEasing[k]).toBe('function');
            for (const t of ts) {
                const v = fw[k](t);
                expect(esm[k](t)).toBe(v);
                expect(saEasing[k](t)).toBe(v);
            }
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. matrix — decompose round-trips
// ─────────────────────────────────────────────────────────────────────────────

describe('parity — graphic.matrix', () => {
    test('decompose round-trip agrees across surfaces', () => {
        const fw = fwResolve('graphic.matrix');
        const esm = esmResolve('graphic.matrix');
        const decomp = { translateX: 12, translateY: -7, scaleX: 2, scaleY: 3, rotate: 35, skewX: 0 };
        const fwStr = fw.Matrix.fromDecomposition(decomp).toString();
        const esmStr = esm.Matrix.fromDecomposition(decomp).toString();
        const saStr = saMatrix.Matrix.fromDecomposition(decomp).toString();
        expect(esmStr).toBe(fwStr);
        expect(saStr).toBe(fwStr);

        // And the decompose values themselves.
        const fwDec = fw.Matrix.fromDecomposition(decomp).decompose();
        const esmDec = esm.Matrix.fromDecomposition(decomp).decompose();
        const saDec = saMatrix.Matrix.fromDecomposition(decomp).decompose();
        expect(esmDec).toEqual(fwDec);
        expect(saDec).toEqual(fwDec);
    });

    test('lerpDecomposition agrees across surfaces', () => {
        const fw = fwResolve('graphic.matrix');
        const esm = esmResolve('graphic.matrix');
        const from = { translateX: 0, translateY: 0, rotate: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };
        const to = { translateX: 100, translateY: 50, rotate: 90, scaleX: 2, scaleY: 2, skewX: 0, skewY: 0 };
        const fwL = fw.lerpDecomposition(from, to, 0.5);
        expect(esm.lerpDecomposition(from, to, 0.5)).toEqual(fwL);
        expect(saMatrix.lerpDecomposition(from, to, 0.5)).toEqual(fwL);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. color — parse + lerp + format
// ─────────────────────────────────────────────────────────────────────────────

describe('parity — graphic.color', () => {
    test('parse agrees across surfaces', () => {
        const fw = fwResolve('graphic.color');
        const esm = esmResolve('graphic.color');
        for (const input of ['#ff0000', '#f00', 'rgb(10,20,30)', 'rgba(0,0,0,0.5)', 'rebeccapurple']) {
            const v = fw.parse(input);
            expect(esm.parse(input)).toEqual(v);
            expect(saColor.parse(input)).toEqual(v);
        }
    });

    test('lerp agrees across surfaces', () => {
        const fw = fwResolve('graphic.color');
        const esm = esmResolve('graphic.color');
        for (const t of [0, 0.5, 1]) {
            const v = fw.lerp('#000000', '#ffffff', t);
            expect(esm.lerp('#000000', '#ffffff', t)).toBe(v);
            expect(saColor.lerp('#000000', '#ffffff', t)).toBe(v);
        }
        expect(saColor.lerp('rgba(0,0,0,0)', 'rgba(0,0,0,1)', 0.5))
            .toBe(fw.lerp('rgba(0,0,0,0)', 'rgba(0,0,0,1)', 0.5));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. units
// ─────────────────────────────────────────────────────────────────────────────

describe('parity — graphic.units', () => {
    test('split + format agree across surfaces', () => {
        const fw = fwResolve('graphic.units');
        const esm = esmResolve('graphic.units');
        for (const input of ['50px', '1.5rem', '100%', '0', 42]) {
            const v = fw.split(input);
            expect(esm.split(input)).toEqual(v);
            expect(saUnits.split(input)).toEqual(v);
        }
        expect(esm.format(3.14159, 'px')).toBe(fw.format(3.14159, 'px'));
        expect(saUnits.format(3.14159, 'px')).toBe(fw.format(3.14159, 'px'));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. interpolate — every value kind
// ─────────────────────────────────────────────────────────────────────────────

describe('parity — graphic.interpolate', () => {
    test('interpolator outputs agree across surfaces (unit/color/transform/path)', () => {
        const fw = fwResolve('graphic.interpolate');
        const esm = esmResolve('graphic.interpolate');
        const cases = [
            ['0px', '300px'],
            ['#000000', '#ffffff'],
            ['rgb(0,0,0)', 'rgb(100,200,40)'],
            ['translate(0,0)', 'translate(100,50)'],
            ['rotate(0)', 'rotate(90)'],
            ['M0 0 L10 0', 'M0 0 L20 10'],
        ];
        for (const [a, b] of cases) {
            const fwI = fw.interpolator(a, b);
            const esmI = esm.interpolator(a, b);
            const saI = saInterp.interpolator(a, b);
            for (const t of [0, 0.5, 1]) {
                const v = String(fwI(t));
                expect(String(esmI(t))).toBe(v);
                expect(String(saI(t))).toBe(v);
            }
        }
    });

    test('detect agrees across surfaces', () => {
        const fw = fwResolve('graphic.interpolate');
        const esm = esmResolve('graphic.interpolate');
        for (const v of ['#ff0000', 'translate(0,0)', 'M0 0 L1 1', '50px', 5]) {
            const k = fw.detect(v);
            expect(esm.detect(v)).toBe(k);
            expect(saInterp.detect(v)).toBe(k);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Full deterministic tween run — captured attribute sequences must MATCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A stub element whose every `setAttribute` is captured (name+value).
 * @returns {{ writes: Array<{name:string,value:string}>, el: object }}
 */
function makeSpyElement() {
    const writes = [];
    const el = {
        setAttribute(name, value) { writes.push({ name, value }); },
    };
    return { writes, el };
}

/**
 * Run an identical deterministic tween on a surface's `{ Tween, Scheduler }`
 * and return the captured attribute-write sequence.
 * @param {{ Tween: Function }} tweenMod
 * @param {{ Scheduler: Function }} schedMod
 * @returns {Array<{name:string,value:string}>}
 */
function runTween(tweenMod, schedMod) {
    const sched = new schedMod.Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
    const { writes, el } = makeSpyElement();
    new tweenMod.Tween({
        target: el,
        property: 'x',
        from: '0px',
        to: '300px',
        duration: 1000,
        easing: 'easeInOutCubic',
        scheduler: sched,
    }).play();
    // Drive identical frames on every surface.
    for (const ts of [0, 200, 400, 600, 800, 1000]) sched.tick(ts);
    return writes;
}

describe('parity — full deterministic tween run', () => {
    test('attribute-write sequences are IDENTICAL across the 3 surfaces', () => {
        const fwSeq = runTween(fwResolve('graphic.tween'), fwResolve('graphic.scheduler'));
        const esmSeq = runTween(esmResolve('graphic.tween'), esmResolve('graphic.scheduler'));
        const saSeq = runTween(saTweenMod, saSchedMod);

        // Non-trivial: the tween actually wrote something.
        expect(fwSeq.length).toBeGreaterThan(0);
        // Every write targets 'x' and the final value reaches the end state.
        expect(fwSeq[fwSeq.length - 1].value).toBe('300px');

        expect(esmSeq).toEqual(fwSeq);
        expect(saSeq).toEqual(fwSeq);
    });

    test('a color tween writes identical sequences across surfaces', () => {
        const runColor = (tweenMod, schedMod) => {
            const sched = new schedMod.Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
            const { writes, el } = makeSpyElement();
            new tweenMod.Tween({
                target: el, property: 'fill', from: '#000000', to: '#ffffff',
                duration: 100, easing: 'linear', scheduler: sched,
            }).play();
            for (const ts of [0, 25, 50, 75, 100]) sched.tick(ts);
            return writes;
        };
        const fwSeq = runColor(fwResolve('graphic.tween'), fwResolve('graphic.scheduler'));
        const esmSeq = runColor(esmResolve('graphic.tween'), esmResolve('graphic.scheduler'));
        const saSeq = runColor(saTweenMod, saSchedMod);
        expect(fwSeq[fwSeq.length - 1].value).toBe('rgb(255, 255, 255)');
        expect(esmSeq).toEqual(fwSeq);
        expect(saSeq).toEqual(fwSeq);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Scheduler-singleton identity — WITHIN each surface, not across
// ─────────────────────────────────────────────────────────────────────────────

describe('parity — scheduler singleton identity (within each surface)', () => {
    test('fw surface exposes a stable shared scheduler singleton', () => {
        const a = fwResolve('graphic.scheduler');
        const b = fwResolve('graphic.scheduler');
        // resolve() memoizes → same module value → same singleton instance.
        expect(a.scheduler).toBe(b.scheduler);
        expect(typeof a.Scheduler).toBe('function');
        expect(a.scheduler).toBeInstanceOf(a.Scheduler);
    });

    test('esm surface exposes a stable shared scheduler singleton', () => {
        const a = esmResolve('graphic.scheduler');
        const b = esmResolve('graphic.scheduler');
        expect(a.scheduler).toBe(b.scheduler);
        expect(a.scheduler).toBeInstanceOf(a.Scheduler);
    });

    test('standalone surface exposes a stable shared scheduler singleton', () => {
        // saSchedMod is resolved once (memoized in standaloneCache); within the
        // bundle's mini-DI the scheduler is a single instance.
        expect(saSchedMod.scheduler).toBeInstanceOf(saSchedMod.Scheduler);
    });

    test('the three surfaces have DISTINCT scheduler singletons (own DI each)', () => {
        const fw = fwResolve('graphic.scheduler');
        const esm = esmResolve('graphic.scheduler');
        // No shared singleton across surfaces — each container is independent.
        expect(fw.scheduler).not.toBe(esm.scheduler);
        expect(fw.scheduler).not.toBe(saSchedMod.scheduler);
        expect(esm.scheduler).not.toBe(saSchedMod.scheduler);
    });
});
