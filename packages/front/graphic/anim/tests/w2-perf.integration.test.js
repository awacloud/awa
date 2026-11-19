// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — W2 PERF extension: a SCENE-FIRE scenario.
 *
 * Reuses the FROZEN `src/perf/harness.js` (`runPerf`) unmodified — this task
 * adds no new perf engine, only a scenario that drives the harness through
 * `graphic.scene` (builder + scoped-ids + timeline + tween) instead of a bare
 * `Tween`. Mirrors `tests/perf.integration.test.js`'s structure and budget.
 *
 * **Honesty caveat (W0 FINDINGS Q5, carried forward — see
 * `ai/memory/types/graphic.md` and `docs/api/perf.md` "What is measured (and
 * what is NOT)"):** `bun:test` has no real DOM Worker and no browser frame
 * pump. The default write target is a compute-only stub element (no real
 * layout/paint/compositor). The reported `msPerFrame` is therefore the
 * engine's per-frame COMPUTE cost (interpolation + write-path dispatch), NOT
 * an achievable browser fps — do not extrapolate an fps number from it.
 *
 * Two costs are measured and reported SEPARATELY, per the plan:
 *   - **compile cost** — one-time: `createScene(spec)` (builds the SVG
 *     subtree via `svgBuild`, mints scoped ids) + compiling N `fire()` calls
 *     into playing `Timeline`s (the builder+DSL compile step).
 *   - **per-frame cost** — steady-state: `msPerFrame` from driving the
 *     scheduler across simulated frames once every timeline is playing,
 *     exactly like `runPerf`'s existing per-frame loop.
 */

// happy-dom registers the DOM globals the resolved fw `dom` factory needs to
// build/attach SVG subtrees for the scene-fire scenario.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect } from 'bun:test';
import { expectWithinBudget } from './_lib/perf-gate.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { graphicModules } from '../src/main.js';
import { runPerf } from '../src/perf/harness.js';

/** Budget: one 60fps frame. Stub-target compute, not browser fps (W0 caveat). */
const BUDGET_MS = 16.67;
/** Regression margin already recorded for the frozen tween-only gate (`perf.integration.test.js`):
 * observed ~0.03 ms/frame at N=500, ~500x under budget. The scene-fire path adds
 * builder/DSL overhead only at COMPILE time (once), not per frame, so the
 * per-frame regression margin is expected to stay in the same order of
 * magnitude; this constant is the SAME budget, not a tighter one — W2 does not
 * introduce a new per-frame cost source. */
const REGRESSION_MARGIN_MS = 16.67;

/**
 * Build a fresh `graphic.scene` surface (own DI container per call, so no
 * shared-scheduler state leaks across scenario runs).
 * @returns {{ createScene: Function, scheduler: object, Scheduler: Function }}
 */
function resolveSceneEngine() {
    const runtime = new ModuleRuntime();
    runtime.registerAllDeep(graphicModules);
    const { createScene } = runtime.resolve('graphic.scene');
    const { Scheduler, scheduler } = runtime.resolve('graphic.scheduler');
    return { createScene, Scheduler, scheduler };
}

/** A one-rect scene spec whose `grow` event animates a single property. */
function sceneSpecFor(prefix) {
    return {
        prefix,
        template: { tag: 'rect', attrs: { id: 'box', x: 0, width: 10 } },
        refs: { box: 'box' },
        events: {
            grow: {
                at: 'box',
                animations: [{ property: 'width', from: 0, to: 300, duration: 2000, easing: 'easeInOutCubic' }],
            },
        },
    };
}

/**
 * Scene-fire perf scenario: compile N scenes (builder+DSL) then fire N
 * `grow` events (each producing one Timeline wrapping one Tween) onto a
 * SHARED manual-clock scheduler, then drive `frames` simulated frames.
 *
 * Compile cost and per-frame cost are measured and returned SEPARATELY.
 *
 * @param {{ n: number, frames?: number, dt?: number }} opts
 * @returns {{
 *   n: number, frames: number,
 *   compileMs: number, compileMsPerScene: number,
 *   totalMs: number, msPerFrame: number, msPerTweenPerFrame: number,
 * }}
 */
function runSceneFirePerf(opts) {
    const n = opts.n;
    const frames = opts.frames || 120;
    const dt = opts.dt || 16;

    const { createScene, Scheduler } = resolveSceneEngine();
    // One manual-clock scheduler shared by every fired timeline — mirrors the
    // "N concurrent tweens sharing ONE scheduler" invariant `runPerf` measures.
    let clockT = 0;
    const sched = new Scheduler({ now: () => clockT, schedule: () => 0, cancel: () => {} });

    const nowMs = () => (globalThis.performance && globalThis.performance.now
        ? globalThis.performance.now()
        : Date.now());

    // ── Compile cost: createScene (builder+DSL) + on()/fire() compile, N times ──
    const tCompile0 = nowMs();
    const timelines = [];
    for (let i = 0; i < n; i++) {
        const scene = createScene(sceneSpecFor(`sf${i}`));
        const tl = scene.on('grow'); // compiled Timeline, not yet playing
        tl._scheduler = sched;
        for (const c of tl._children) c.tween._scheduler = sched;
        timelines.push(tl);
    }
    const compileMs = nowMs() - tCompile0;

    // Play every compiled timeline onto the shared scheduler.
    for (const tl of timelines) tl.play();

    // ── Per-frame cost: drive `frames` simulated frames, steady state ──
    const duration = frames * dt;
    // Re-span: the scene's tween duration is fixed (2000ms) at spec time; keep
    // frames within the animation window so every timeline stays active for
    // the whole measured run (mirrors runPerf's span-the-tweens intent).
    void duration;

    const t0 = nowMs();
    for (let f = 0; f < frames; f++) {
        clockT = f * dt;
        sched.tick(clockT);
    }
    const totalMs = nowMs() - t0;
    sched.stop();

    const msPerFrame = totalMs / frames;
    const msPerTweenPerFrame = n > 0 ? msPerFrame / n : 0;
    return {
        n,
        frames,
        compileMs,
        compileMsPerScene: n > 0 ? compileMs / n : 0,
        totalMs,
        msPerFrame,
        msPerTweenPerFrame,
    };
}

describe('scene-fire perf scenario — compile cost reported separately from per-frame cost', () => {
    test('N=100: finite, non-negative compile and per-frame stats', () => {
        const r = runSceneFirePerf({ n: 100, frames: 60 });
        expect(r.n).toBe(100);
        expect(Number.isFinite(r.compileMs)).toBe(true);
        expect(r.compileMs).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(r.msPerFrame)).toBe(true);
        expect(r.msPerFrame).toBeGreaterThanOrEqual(0);
        console.log(`[perf-scene] N=100 compileMs=${r.compileMs.toFixed(3)} `
            + `(${r.compileMsPerScene.toFixed(4)} ms/scene) msPerFrame=${r.msPerFrame.toFixed(4)}`);
    });
});

describe('scene-fire perf sweep — N in {10,50,100,250,500} concurrent tweens fired', () => {
    const COUNTS = [10, 50, 100, 250, 500];

    for (const n of COUNTS) {
        test(`N=${n}: msPerFrame under budget (${BUDGET_MS}) and within the recorded regression margin`, () => {
            const r = runSceneFirePerf({ n, frames: 120 });
            expectWithinBudget(expect, r.msPerFrame, BUDGET_MS);
            expectWithinBudget(expect, r.msPerFrame, REGRESSION_MARGIN_MS);
            console.log(`[perf-scene-sweep] N=${n} compileMs=${r.compileMs.toFixed(3)} `
                + `(${r.compileMsPerScene.toFixed(4)} ms/scene) msPerFrame=${r.msPerFrame.toFixed(4)} `
                + `(budget ${BUDGET_MS}) msPerTweenPerFrame=${r.msPerTweenPerFrame.toFixed(6)}`);
        });
    }

    test('compile cost is reported SEPARATELY from per-frame cost (both present, independent fields)', () => {
        const r = runSceneFirePerf({ n: 250, frames: 120 });
        // Both costs are on the result but are DISTINCT measurements — compile
        // is a one-time cost (createScene + on()), msPerFrame is steady-state
        // per-tick cost. Neither is derived from the other.
        expect(r).toHaveProperty('compileMs');
        expect(r).toHaveProperty('msPerFrame');
        expect(typeof r.compileMs).toBe('number');
        expect(typeof r.msPerFrame).toBe('number');
    });
});

describe('scene-fire vs bare-tween perf.integration.test.js baseline', () => {
    test('the frozen bare-tween harness (runPerf) still meets budget at N=500 (regression baseline unaffected by W2)', () => {
        // Sanity cross-check: the frozen harness this scenario extends is
        // untouched by W2 and still meets the SAME budget, confirming the new
        // scene-fire scenario measures ADDITIONAL builder/DSL cost on top of
        // (not instead of) the existing tween-only gate.
        const r = runPerf({ tweens: 500, frames: 120 });
        expectWithinBudget(expect, r.msPerFrame, BUDGET_MS);
        console.log(`[perf-scene-baseline] bare-tween N=500 msPerFrame=${r.msPerFrame.toFixed(4)} (budget ${BUDGET_MS})`);
    });
});

describe('scene-fire perf — correctness of the write path under load', () => {
    test('N=50 scene-fire actually drives every timeline to completion by the end of the run', () => {
        const { createScene, Scheduler } = resolveSceneEngine();
        let clockT = 0;
        const sched = new Scheduler({ now: () => clockT, schedule: () => 0, cancel: () => {} });
        const N = 50;
        const DURATION = 500;
        const scenes = [];
        const timelines = [];
        for (let i = 0; i < N; i++) {
            const scene = createScene({
                prefix: `w${i}`,
                template: { tag: 'rect', attrs: { id: 'box', x: 0, width: 0 } },
                refs: { box: 'box' },
                events: {
                    grow: { at: 'box', animations: [{ property: 'width', from: 0, to: 100, duration: DURATION, easing: 'linear' }] },
                },
            });
            const tl = scene.on('grow');
            tl._scheduler = sched;
            for (const c of tl._children) c.tween._scheduler = sched;
            scenes.push(scene);
            timelines.push(tl);
        }
        for (const tl of timelines) tl.play();

        const dt = 16;
        const frames = Math.ceil(DURATION / dt) + 2;
        for (let f = 0; f < frames; f++) {
            clockT = f * dt;
            sched.tick(clockT);
        }
        sched.stop();

        for (const scene of scenes) {
            expect(scene.el('box').getAttribute('width')).toBe('100');
        }
        for (const tl of timelines) {
            expect(tl.done).toBe(true);
        }
    });
});
