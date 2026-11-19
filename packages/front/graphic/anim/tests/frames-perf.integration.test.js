// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — `graphic.frames` PERF under the frozen budget.
 *
 * Reuses the FROZEN `src/perf/harness.js` (`runPerf`) unmodified — this task
 * adds no new perf engine, only a `frames`-driving scenario alongside the
 * existing bare-tween one. Mirrors `tests/w2-perf.integration.test.js`'s
 * sweep structure and budget.
 *
 * **Honesty caveat (W0 FINDINGS Q5, carried forward — see
 * `ai/memory/types/graphic.md` and `docs/api/perf.md` "What is measured (and
 * what is NOT)"):** `bun:test` has no real DOM Worker and no browser frame
 * pump. The write target is a compute-only stub element (no real
 * layout/paint/compositor). The reported `msPerFrame` is the engine's
 * per-frame COMPUTE cost (frame-index math + write-path dispatch), NOT an
 * achievable browser fps — do not extrapolate an fps number from it.
 */

// happy-dom registers the DOM globals the resolved fw `dom` factory needs
// (the frames write path goes through svgApply -> dom.attr -> toNodes, which
// references the NodeList global).
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect } from 'bun:test';
import { expectWithinBudget } from './_lib/perf-gate.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { graphicModules } from '../src/main.js';
import { runPerf } from '../src/perf/harness.js';

/** Budget: one 60fps frame. Stub-target compute, not browser fps (W0 caveat). */
const BUDGET_MS = 16.67;

/**
 * Build a fresh `graphic.frames` surface (own DI container per call, so no
 * shared-scheduler state leaks across scenario runs).
 * @returns {{ Frames: Function, Scheduler: Function }}
 */
function resolveFramesEngine() {
    const runtime = new ModuleRuntime();
    runtime.registerAllDeep(graphicModules);
    const { Frames } = runtime.resolve('graphic.frames');
    const { Scheduler } = runtime.resolve('graphic.scheduler');
    return { Frames, Scheduler };
}

/**
 * Run N concurrent `Frames` (sprite mode, stub write target) on ONE shared
 * manual-clock scheduler for `frames` simulated ticks, and report per-frame
 * cost — mirrors `runPerf`'s per-frame loop shape exactly, but drives
 * `graphic.frames` instances instead of `graphic.tween` instances.
 *
 * @param {{ n: number, frames?: number, dt?: number }} opts
 * @returns {{ n: number, frames: number, totalMs: number, msPerFrame: number, msPerFrame_perInstance: number }}
 */
function runFramesPerf(opts) {
    const n = opts.n;
    const frames = opts.frames || 120;
    const dt = opts.dt || 16;

    const { Frames, Scheduler } = resolveFramesEngine();

    let clockT = 0;
    const sched = new Scheduler({ now: () => clockT, schedule: () => 0, cancel: () => {} });

    for (let i = 0; i < n; i++) {
        const target = { setAttribute() {} };
        new Frames({
            sprite: { target, cols: 8, rows: 8, frameW: 10, frameH: 10 },
            fps: 24,
            loop: true,
            scheduler: sched,
        }).play();
    }

    const nowMs = () => (globalThis.performance && globalThis.performance.now
        ? globalThis.performance.now()
        : Date.now());

    const t0 = nowMs();
    for (let f = 0; f < frames; f++) {
        clockT = f * dt;
        sched.tick(clockT);
    }
    const totalMs = nowMs() - t0;
    sched.stop();

    const msPerFrame = totalMs / frames;
    return {
        n,
        frames,
        totalMs,
        msPerFrame,
        msPerFrame_perInstance: n > 0 ? msPerFrame / n : 0,
    };
}

describe('graphic.frames perf — N concurrent frames on one shared scheduler', () => {
    test('N=100: finite, non-negative per-frame stats', () => {
        const r = runFramesPerf({ n: 100, frames: 60 });
        expect(r.n).toBe(100);
        expect(Number.isFinite(r.msPerFrame)).toBe(true);
        expect(r.msPerFrame).toBeGreaterThanOrEqual(0);
        console.log(`[perf-frames] N=100 msPerFrame=${r.msPerFrame.toFixed(4)} `
            + `(budget ${BUDGET_MS})`);
    });
});

describe('graphic.frames perf sweep — N in {10,50,100,250,500} concurrent frames', () => {
    const COUNTS = [10, 50, 100, 250, 500];

    for (const n of COUNTS) {
        test(`N=${n}: msPerFrame under budget (${BUDGET_MS})`, () => {
            const r = runFramesPerf({ n, frames: 120 });
            expectWithinBudget(expect, r.msPerFrame, BUDGET_MS);
            console.log(`[perf-frames-sweep] N=${n} msPerFrame=${r.msPerFrame.toFixed(4)} `
                + `(budget ${BUDGET_MS}) msPerFrame_perInstance=${r.msPerFrame_perInstance.toFixed(6)}`);
        });
    }
});

describe('graphic.frames perf — correctness of the write path under load', () => {
    test('N=50 concurrent frames actually advance to a non-initial frame by the end of the run', () => {
        const { Frames, Scheduler } = resolveFramesEngine();
        let clockT = 0;
        const sched = new Scheduler({ now: () => clockT, schedule: () => 0, cancel: () => {} });
        const N = 50;
        const anims = [];
        for (let i = 0; i < N; i++) {
            const target = { setAttribute() {} };
            const anim = new Frames({
                sprite: { target, cols: 4, rows: 1, frameW: 10, frameH: 10 },
                fps: 10,
                loop: true,
                scheduler: sched,
            });
            anim.play();
            anims.push(anim);
        }

        const dt = 16;
        const frames = 60; // ~960ms at 16ms/frame, well past several fps=10 cycles
        for (let f = 0; f < frames; f++) {
            clockT = f * dt;
            sched.tick(clockT);
        }
        sched.stop();

        for (const anim of anims) {
            expect(anim.playing).toBe(true); // loop:true never stops
            expect(anim.frame).toBeGreaterThanOrEqual(0);
            expect(anim.frame).toBeLessThan(anim.frameCount);
        }
    });
});

describe('regression — the frozen bare-tween perf.integration.test.js baseline is unaffected', () => {
    test('runPerf({tweens:500}) still meets budget (frames does not regress the tween-only gate)', () => {
        const r = runPerf({ tweens: 500, frames: 120 });
        expectWithinBudget(expect, r.msPerFrame, BUDGET_MS);
        console.log(`[perf-frames-baseline] bare-tween N=500 msPerFrame=${r.msPerFrame.toFixed(4)} (budget ${BUDGET_MS})`);
    });
});
