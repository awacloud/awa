// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — `graphic.hypertree` focus-transition PERF
 * under the frozen 16.67 ms/frame budget, at a representative tree size (~100
 * nodes).
 *
 * **Honesty caveat (W0 FINDINGS Q5, carried forward — see
 * `ai/memory/types/graphic.md` and `docs/hypertree.md`):** `bun:test` runs on
 * happy-dom, which has no real layout / paint / compositor and no browser frame
 * pump. The measured `msPerFrame` is the engine's per-frame COMPUTE cost
 * (position lerp + `d`/`transform` write-path dispatch over a happy-dom element
 * tree), NOT an achievable browser fps. The write leg is a floor (MEDIUM
 * confidence); the layout/lerp compute leg is representative (HIGH). A
 * DOM-backed real-browser perf run is a standing follow-up.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { expectWithinBudget } from './_lib/perf-gate.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { hypertreeModule } from '../src/hypertree/hypertree.js';

/** Budget: one 60fps frame. Stub-DOM compute, not browser fps (W0 caveat). */
const BUDGET_MS = 16.67;

const runtime = new ModuleRuntime();
runtime.registerDeep(hypertreeModule);
const { Hypertree } = runtime.resolve('graphic.hypertree');
const { Scheduler } = runtime.resolve('graphic.scheduler');
const { SVG_NS } = runtime.resolve('graphic.svgApply');

/** Balanced tree: 1 + fan + fan² nodes. fan=10 → 111 nodes. */
function bigTree(fan) {
    return {
        id: 'root',
        children: Array.from({ length: fan }, (_, i) => ({
            id: `n${i}`,
            children: Array.from({ length: fan }, (_, j) => ({ id: `n${i}_${j}` })),
        })),
    };
}

function nowMs() {
    const g = /** @type {any} */ (globalThis);
    return (g.performance && g.performance.now) ? g.performance.now() : Date.now();
}

describe('graphic.hypertree focus-transition perf', () => {
    test('~100-node focus transition stays far under the 16.67 ms/frame budget', () => {
        const fan = 10; // 1 + 10 + 100 = 111 nodes, 110 edges
        const host = document.createElementNS(SVG_NS, 'svg');
        const tree = new Hypertree(host, bigTree(fan), { duration: 320, scheduler:
            new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} }) });
        expect(tree._nodeEls.size).toBe(1 + fan + fan * fan);

        const sched = new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
        tree._scheduler = sched;

        // Focus a deep leaf → the heaviest transition (recenter + ancestor inject).
        tree.focus('n7_3');

        const frames = 60;
        const dt = 16;
        const t0 = nowMs();
        for (let f = 0; f < frames; f += 1) sched.tick(f * dt);
        const totalMs = nowMs() - t0;
        const msPerFrame = totalMs / frames;

        expect(Number.isFinite(msPerFrame)).toBe(true);
        expectWithinBudget(expect, msPerFrame, BUDGET_MS);
        // `no-console` is not an active rule anywhere in this package's flat
        // config (tests/**/*.integration.test.js resolves only
        // fw/no-factory-capture, turned off) — the eslint-disable that used to
        // sit here was an UNUSED directive and itself failed --max-warnings 0
        // (graphic/BATCH_16 task 05 hygiene sweep). No suppression is needed.
        console.log(`[perf-hypertree] nodes=${tree._nodeEls.size} msPerFrame=`
            + `${msPerFrame.toFixed(4)} (budget ${BUDGET_MS}) — happy-dom compute floor`);
    });
});
