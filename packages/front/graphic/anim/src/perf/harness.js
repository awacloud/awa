// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `@awacloud/graphic-anim` — perf harness (ported from the W0 spike,
 * `ai/archives/spikes/graphic-anim/01-anim-vertical-slice/perf.js`).
 *
 * Drives N concurrent tweens through ONE shared scheduler over a fixed number of
 * simulated frames and reports per-frame cost as a function of concurrent-tween
 * count. This is the standing perf gate the whole orchestration inherits
 * (W0 FINDINGS #5): a deterministic, clock-injected frame loop measuring the
 * engine's per-frame WORK (interpolation + apply), not wall-clock scheduling —
 * so the number is reproducible and CI-stable.
 *
 * **W0 caveat (kept):** `bun:test` has no real DOM Worker and no browser frame
 * pump, so we report **ms/frame**, NOT fps. The default target is a stub element
 * (compute-only); pass `makeTarget` returning a live SVG element for a DOM-backed
 * run that exercises the resolved `svgApply.svgAttr` → `dom.attr` write path.
 *
 * The harness resolves the engine through the SAME single source every surface
 * uses: `new ModuleRuntime().registerAllDeep(graphicModules)`. There is no
 * re-implementation of the scheduler/tween here — it consumes the resolved
 * `graphic.scheduler` + `graphic.tween` factories.
 *
 * This file is plain ESM (exported functions), not an fw module descriptor, so
 * `fw/no-factory-capture` does not apply — but it stays capture-clean anyway.
 *
 * @module @awacloud/graphic-anim/perf/harness
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { graphicModules } from '../main.js';

/**
 * A perf scenario.
 * @typedef {Object} PerfScenario
 * @property {number} tweens   Concurrent tweens.
 * @property {number} frames   Frames to run.
 * @property {number} [dt]     Simulated ms per frame (default 16 ≈ 60fps).
 * @property {string|number} [from] Start value (default `'0px'`).
 * @property {string|number} [to]   End value (default `'300px'`).
 * @property {string} [easing] Easing curve name (default `'easeInOutCubic'`).
 * @property {string} [property] Animated attribute name (default `'x'`).
 * @property {(() => object)} [makeTarget] Factory for a throwaway write target.
 *   Default builds a stub element; pass a live-SVG factory for the DOM-backed run.
 */

/**
 * Per-frame perf stats for one scenario run.
 * @typedef {Object} PerfResult
 * @property {number} tweens
 * @property {number} frames
 * @property {number} totalMs            Total wall time spent in the tick loop.
 * @property {number} msPerFrame         `totalMs / frames` — the budget metric.
 * @property {number} msPerTweenPerFrame `msPerFrame / tweens`.
 * @property {boolean} domBacked          True when a non-stub `makeTarget` was used.
 */

/**
 * A minimal no-DOM write target so the harness runs in any context (the engine
 * cost we measure is interpolation + apply, not real layout). For a DOM-backed
 * run, pass `makeTarget` returning a real SVG element.
 *
 * Exposes `setAttribute` so the resolved `svgApply.svgAttr` (which guards on
 * `typeof target.setAttribute === 'function'`) writes through `dom.attr`.
 *
 * @returns {{ setAttribute: (n: string, v: string) => void, _last: string }}
 */
export function stubTarget() {
    return {
        _last: '',
        setAttribute(_n, v) { this._last = v; },
    };
}

/**
 * Resolve `{ Scheduler, Tween }` from the SINGLE source (the fw-mode surface).
 * Each call builds a fresh runtime so per-run state (the shared scheduler
 * singleton) never leaks between scenarios.
 *
 * @returns {{ Scheduler: Function, Tween: Function }}
 */
export function resolveEngine() {
    const runtime = new ModuleRuntime();
    runtime.registerAllDeep(graphicModules);
    const { Scheduler } = runtime.resolve('graphic.scheduler');
    const { Tween } = runtime.resolve('graphic.tween');
    return { Scheduler, Tween };
}

/** @returns {number} A high-resolution-ish timestamp in ms. */
function nowMs() {
    const g = /** @type {any} */ (globalThis);
    if (g.performance && typeof g.performance.now === 'function') return g.performance.now();
    return Date.now();
}

/**
 * Run one perf scenario and return per-frame stats.
 *
 * Deterministic by construction: a manual clock advances by a fixed `dt` each
 * frame and we call `sched.tick(clockT)` ourselves; `schedule`/`cancel` are
 * no-ops so no real rAF is involved. We time only the per-frame engine work.
 *
 * @param {PerfScenario} scenario
 * @returns {PerfResult}
 */
export function runPerf(scenario) {
    const tweens = scenario.tweens;
    const frames = scenario.frames;
    const dt = scenario.dt || 16;
    const from = scenario.from != null ? scenario.from : '0px';
    const to = scenario.to != null ? scenario.to : '300px';
    const easing = scenario.easing || 'easeInOutCubic';
    const property = scenario.property || 'x';
    const makeTarget = scenario.makeTarget || stubTarget;
    const domBacked = makeTarget !== stubTarget;

    const { Scheduler, Tween } = resolveEngine();

    // Manual clock: tick advances by dt each frame; schedule/cancel are no-ops
    // because we call scheduler.tick() ourselves, deterministically.
    let clockT = 0;
    const sched = new Scheduler({
        now: () => clockT,
        schedule: () => 0,
        cancel: () => {},
    });

    // Span the tweens so they stay active across the whole run.
    const duration = frames * dt;
    for (let i = 0; i < tweens; i++) {
        new Tween({
            target: makeTarget(),
            property,
            from,
            to,
            duration,
            easing,
            scheduler: sched,
        }).play();
    }

    const t0 = nowMs();
    for (let f = 0; f < frames; f++) {
        clockT = f * dt;
        sched.tick(clockT);
    }
    const totalMs = nowMs() - t0;
    sched.stop();

    const msPerFrame = totalMs / frames;
    const msPerTweenPerFrame = tweens > 0 ? msPerFrame / tweens : 0;
    return { tweens, frames, totalMs, msPerFrame, msPerTweenPerFrame, domBacked };
}

/**
 * Run a sweep across several concurrent-tween counts. Reports **ms/frame vs N**.
 *
 * @param {number[]} [counts] Concurrent-tween counts (default `[10,50,100,250,500]`).
 * @param {number} [frames]   Frames per scenario (default 120).
 * @param {Partial<PerfScenario>} [opts] Extra scenario overrides (e.g. `makeTarget`).
 * @returns {PerfResult[]}
 */
export function sweep(counts = [10, 50, 100, 250, 500], frames = 120, opts = {}) {
    return counts.map((tweens) => runPerf({ ...opts, tweens, frames }));
}

/**
 * Regression-budget assertion. Runs `runPerf` at a fixed N and asserts the
 * measured **ms/frame** is at or under `budgetMs`. Returns the result for
 * logging. Throws an Error (not an assertion-library call) so the harness has
 * no test-framework dependency.
 *
 * @param {Object}  [opts]
 * @param {number}  [opts.tweens=500]   Concurrent tweens at the gate point.
 * @param {number}  [opts.frames=120]   Frames to average over.
 * @param {number}  [opts.budgetMs=16.67] ms/frame ceiling (one 60fps frame).
 * @param {(() => object)} [opts.makeTarget] Optional live-target factory.
 * @returns {PerfResult}
 */
export function assertBudget(opts = {}) {
    const tweens = opts.tweens != null ? opts.tweens : 500;
    const frames = opts.frames != null ? opts.frames : 120;
    const budgetMs = opts.budgetMs != null ? opts.budgetMs : 16.67;
    const result = runPerf({ tweens, frames, makeTarget: opts.makeTarget });
    if (result.msPerFrame > budgetMs) {
        throw new Error(
            `perf regression: ${result.msPerFrame.toFixed(4)} ms/frame at N=${tweens} `
            + `exceeds budget ${budgetMs} ms/frame (totalMs=${result.totalMs.toFixed(2)})`,
        );
    }
    return result;
}
