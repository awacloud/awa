// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — `graphic.svg3d` DOM-strategy PERF lock,
 * against the frozen 16.67 ms/frame budget, at the W4 spike's recommended
 * ceiling (8 192 triangles, a 64×64 quad grid).
 *
 * Adopts the frozen sweep methodology of `tests/hypertree-perf.integration.test.js`
 * / `tests/frames-perf.integration.test.js` / the W4 spike's own
 * `ai/archives/spikes/graphic-anim/04-svg3d-perf/perf.js`: manual-clock `Scheduler` injection, warm-up
 * ticks excluded from the timed window, one explicit `BUDGET_MS` constant. The
 * rotation rig here (camera.ry driven by a `graphic.timeline`/`graphic.tween`
 * on a manual-clock `graphic.scheduler`, with the render step as a SEPARATE
 * tickable added after it) is re-authored — never imported — from the spike's
 * `rotate.js`, and exercises the PRODUCTION `svg3d.mesh` / `svg3d.project` /
 * `svg3d.apply` kernels (not the spike's throwaway ones).
 *
 * Per FINDINGS and the plan, this locks:
 *   - a machine-robust RELATIVE claim: the bucketed path-`d` rig is >= 2x
 *     cheaper than the per-polygon rig at 8 192 triangles, and writes fewer
 *     than 1/100th the attributes per frame (FINDINGS decision (c));
 *   - the ONE absolute budget guard, at the 5x-headroom point: path-`d` @
 *     8 192 triangles stays under `BUDGET_MS / 5` (measured 3.34 ms in the
 *     spike against a 16.67 ms budget — a 5x margin).
 *
 * **Honesty caveat (W0 FINDINGS Q5, carried forward):** `bun:test` runs on
 * happy-dom — no real layout/paint/compositor/frame pump. `msPerFrame` is the
 * engine's per-frame COMPUTE + attribute-write-path cost, NOT an achievable
 * browser fps; the DOM leg is a FLOOR (a real-browser perf run is a standing
 * follow-up, W0 FINDINGS Q5 / W4 FINDINGS Gaps). The per-polygon rig is
 * additionally known to be SUITE-CONTENDED (FINDINGS: 12.5 ms alone vs 16.4 ms
 * inside the full area suite) — its per-size budget assertions below are kept
 * to sizes the spike measured safely under contention (<= 2048 triangles);
 * only the RELATIVE claim and the path-mode absolute guard are asserted at
 * 8 192 triangles.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect, setDefaultTimeout } from 'bun:test';
import { expectWithinBudget } from './_lib/perf-gate.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { svg3dModule } from '../src/svg3d/svg3d.js';

// The DOM-strategy sweeps build up to 8192 nodes per run: under load they slow
// down, they must not time out at bun's 5 s default.
setDefaultTimeout(60_000);

/** One 60fps frame — the package's frozen perf budget constant. */
const BUDGET_MS = 16.67;

const runtime = new ModuleRuntime();
runtime.registerDeep(svg3dModule);
const meshApi = runtime.resolve('svg3d.mesh');
const projectApi = runtime.resolve('svg3d.project');
const applyApi = runtime.resolve('svg3d.apply');
const svgBuild = runtime.resolve('graphic.svgBuild');
const svgApply = runtime.resolve('graphic.svgApply');
const { Scheduler } = runtime.resolve('graphic.scheduler');
const { Timeline } = runtime.resolve('graphic.timeline');
const { Tween } = runtime.resolve('graphic.tween');

/** @returns {number} High-resolution-ish timestamp in ms. */
function nowMs() {
    const g = /** @type {any} */ (globalThis);
    return (g.performance && g.performance.now) ? g.performance.now() : Date.now();
}

/**
 * Deterministic bumpy heightmap (no `Math.random` — banned) — `side` samples
 * per side, values in `[0, 1]`.
 * @param {number} side
 * @returns {Float64Array}
 */
function bumpyHeights(side) {
    const heights = new Float64Array(side * side);
    for (let j = 0; j < side; j += 1) {
        for (let i = 0; i < side; i += 1) {
            heights[j * side + i] = 0.5 + 0.5 * Math.sin(i * 0.3) * Math.cos(j * 0.3);
        }
    }
    return heights;
}

/**
 * @typedef {Object} SweepResult
 * @property {number} triangles
 * @property {number} msPerFrame
 * @property {number} writesPerFrame
 * @property {number} nodeCount
 */

/**
 * Sweep one DOM strategy over the PRODUCTION `svg3d.mesh`/`svg3d.project`/
 * `svg3d.apply` kernels, rotating the camera on a manual-clock scheduler via
 * the frozen `graphic.timeline`/`graphic.tween` engine (re-authored rotation
 * rig, mirroring the spike's `rotate.js` shape: the timeline registers as one
 * tickable, the render step as a second on the SAME scheduler after it).
 * Bypasses `graphic.svg3d`'s public ceiling policy on purpose — this measures
 * the RAW rig cost the ceiling DECISION is based on (the same layering the W4
 * spike used), not the public API's guard rails (covered in `svg3d.test.js`).
 *
 * @param {{ strategy: 'path'|'polygon', cells: number, frames?: number, warmup?: number, buckets?: number }} opts
 * @returns {SweepResult}
 */
function sweepRig(opts) {
    const { strategy, cells } = opts;
    const frames = opts.frames === undefined ? 60 : opts.frames;
    const warmup = opts.warmup === undefined ? 12 : opts.warmup;
    const dt = 16;

    const mesh = meshApi.buildGridMesh({ cells, heights: bumpyHeights(cells + 1) });
    const camera = projectApi.createCamera({});
    const buf = projectApi.createFrameBuffers(mesh);
    const rig = strategy === 'path'
        ? applyApi.createPathRig({ svgBuild, svgApply, mesh, buckets: opts.buckets === undefined ? 16 : opts.buckets })
        : applyApi.createPolygonRig({ svgBuild, svgApply, mesh });

    let writes = 0;
    let clockT = 0;
    const scheduler = new Scheduler({ now: () => clockT, schedule: () => 0, cancel: () => {} });

    const timeline = new Timeline({ scheduler });
    timeline.add(new Tween({
        target: camera,
        property: 'ry',
        from: camera.ry,
        to: camera.ry + Math.PI * 2,
        duration: (warmup + frames) * dt,
        easing: 'linear',
        scheduler,
        apply: (v, target) => { target.ry = Number(v); },
    }), 0);
    timeline.play();

    // Render tickable — a SEPARATE tickable added AFTER the timeline, exactly
    // as `graphic.svg3d`'s own `_startCycle` does (structural finding 4).
    scheduler.add({
        _step: () => {
            const count = projectApi.projectFrame(mesh, camera, buf);
            writes += rig.update(buf, count);
        },
    });

    // Warm-up ticks (JIT) — excluded from the timed window.
    for (let f = 0; f < warmup; f += 1) { clockT = f * dt; scheduler.tick(clockT); }
    writes = 0;

    const t0 = nowMs();
    for (let f = 0; f < frames; f += 1) { clockT = (warmup + f) * dt; scheduler.tick(clockT); }
    const totalMs = nowMs() - t0;

    return {
        triangles: mesh.triangleCount,
        msPerFrame: totalMs / frames,
        writesPerFrame: writes / frames,
        nodeCount: rig.nodeCount,
    };
}

describe('graphic.svg3d DOM-strategy perf lock', () => {
    test('DECISION (c): bucketed path-d is >= 2x cheaper than per-polygon attrs at 8192 tris, '
        + 'and writes < 1/100th the attributes/frame', () => {
        const poly = sweepRig({ strategy: 'polygon', cells: 64 });
        const path = sweepRig({ strategy: 'path', cells: 64, buckets: 16 });

        expect(poly.triangles).toBe(8192);
        expect(path.triangles).toBe(8192);

        const ratio = poly.msPerFrame / path.msPerFrame;
        expect(ratio).toBeGreaterThanOrEqual(2);
        expect(path.writesPerFrame).toBeLessThan(poly.writesPerFrame / 100);

        console.log(`[svg3d-perf-strategy] 8192 tris: polygon=${poly.msPerFrame.toFixed(4)} `
            + `path16=${path.msPerFrame.toFixed(4)} ratio=${ratio.toFixed(2)}x `
            + `polyWrites/frame=${poly.writesPerFrame.toFixed(0)} pathWrites/frame=${path.writesPerFrame.toFixed(0)}`);
    });

    test('DECISION (b): the recommended ceiling (8192 tris, path-d, 16 buckets) '
        + 'holds with >= 5x headroom against the 16.67 ms budget', () => {
        const r = sweepRig({ strategy: 'path', cells: 64, buckets: 16 });
        expect(r.triangles).toBe(8192);
        expectWithinBudget(expect, r.msPerFrame, BUDGET_MS / 5);

        console.log(`[svg3d-perf-ceiling] 8192 tris path-d: ${r.msPerFrame.toFixed(4)} ms/frame `
            + `vs budget/5 = ${(BUDGET_MS / 5).toFixed(2)} (budget ${BUDGET_MS}) — happy-dom FLOOR`);
    });

    test('per-polygon strategy stays within budget at the smaller, safely-measured sizes (<= 2048 tris)', () => {
        for (const cells of [16, 32]) {
            const r = sweepRig({ strategy: 'polygon', cells });
            expect(Number.isFinite(r.msPerFrame)).toBe(true);
            expectWithinBudget(expect, r.msPerFrame, BUDGET_MS);
            console.log(`[svg3d-perf-poly] tris=${r.triangles} msPerFrame=${r.msPerFrame.toFixed(4)} `
                + `(budget ${BUDGET_MS}) — happy-dom FLOOR`);
        }
    });

    test('bucket count barely moves the path-d cost (near-free fidelity, FINDINGS cost decomposition)', () => {
        const r1 = sweepRig({ strategy: 'path', cells: 64, buckets: 1 });
        const r16 = sweepRig({ strategy: 'path', cells: 64, buckets: 16 });
        expect(r1.triangles).toBe(8192);
        // Both stay comfortably in budget regardless of bucket count.
        expectWithinBudget(expect, r1.msPerFrame, BUDGET_MS);
        expectWithinBudget(expect, r16.msPerFrame, BUDGET_MS);
    });
});
