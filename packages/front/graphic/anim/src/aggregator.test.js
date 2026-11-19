// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit test — `graphic.anim` aggregator descriptor shape,
 * parity (namespace ≡ the 14 individual resolves), strict-superset topo
 * order, and the frozen eager-resolve-all perf budget (FINDINGS Q3/Q5,
 * `ai/archives/spikes/graphic-anim/03-packaging/FINDINGS.md`).
 *
 * Ported from `ai/archives/spikes/graphic-anim/03-packaging/aggregator.test.js` (the W0 spike, GO
 * verdict) against the now-registered `animAggregatorModule` (this task
 * registers it topo-last in `graphicModules`, replacing the throwaway
 * `candidate/aggregator-draft.js` import).
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { graphicModules } from './main.js';
import { animAggregatorModule, AGGREGATE_NAMES } from './aggregator.js';

/** Proposed frozen ceiling (W1 acceptance gate, FINDINGS Q5): ms per cold eager resolve-all. */
const RESOLVE_ALL_BUDGET_MS = 1.0;

function nowMs() {
    const g = /** @type {any} */ (globalThis);
    return g.performance && typeof g.performance.now === 'function' ? g.performance.now() : Date.now();
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('animAggregatorModule descriptor', () => {
    test('has the frozen name / type / version', () => {
        expect(animAggregatorModule.name).toBe('graphic.anim');
        expect(animAggregatorModule.type).toBe('fw.dom.graphic');
        expect(animAggregatorModule.version).toBe('0.1.0');
    });

    test('dependencies are exactly the frozen 14-core tuple, in topo order', () => {
        expect(animAggregatorModule.dependencies).toEqual(AGGREGATE_NAMES);
        expect(animAggregatorModule.dependencies).toHaveLength(14);
    });

    test('deps mirror dependencies in the same order', () => {
        expect(animAggregatorModule.deps.map(d => d.name)).toEqual(animAggregatorModule.dependencies);
    });

    test('is registered second-to-last in graphicModules (graphic/BATCH_12 appended graphic.svg3d after it)', () => {
        expect(graphicModules[graphicModules.length - 2]).toBe(animAggregatorModule);
    });
});

// ── Parity ────────────────────────────────────────────────────────────────────

describe('graphic.anim aggregator — parity', () => {
    test('resolving graphic.anim yields a namespace ≡ the 14 individual resolves', () => {
        const rt = new ModuleRuntime();
        rt.registerAllDeep(graphicModules);
        const ns = rt.resolve('graphic.anim');

        expect(Object.keys(ns)).toHaveLength(14);
        for (const fullName of AGGREGATE_NAMES) {
            const key = fullName.split('.')[1];
            // Same INSTANCE — the aggregator re-exports injected deps, no re-build.
            expect(ns[key]).toBe(rt.resolve(fullName));
        }
    });

    test('the aggregator is a strict superset — the frozen 14 core deps, topo order preserved', () => {
        const coreOrder = graphicModules.slice(0, 14).map(m => m.name);
        expect(animAggregatorModule.dependencies).toEqual(coreOrder);
    });

    test('the frozen 16-order (pageflip, hypertree included) is untouched — graphic.anim/graphic.svg3d are pure appends', () => {
        const names = graphicModules.map(m => m.name);
        expect(names.slice(0, 16)).toEqual([
            'graphic.lerp', 'graphic.easing', 'graphic.units', 'graphic.matrix',
            'graphic.color', 'graphic.scopedIds', 'graphic.interpolate',
            'graphic.svgApply', 'graphic.svgBuild', 'graphic.scheduler',
            'graphic.tween', 'graphic.timeline', 'graphic.scene', 'graphic.frames',
            'graphic.pageflip', 'graphic.hypertree',
        ]);
        expect(names[16]).toBe('graphic.anim');
        // graphic/BATCH_12 task 02 appended graphic.svg3d topo-last.
        expect(names[17]).toBe('graphic.svg3d');
        expect(names).toHaveLength(18);
    });
});

// ── Perf budget (Q5, frozen acceptance) ──────────────────────────────────────

describe('graphic.anim aggregator — eager resolve-all perf (Q5)', () => {
    test('cold register+resolve-all cost is under the proposed frozen budget', () => {
        const mods = graphicModules;
        const N = 500;
        // warmup (JIT)
        for (let i = 0; i < 20; i++) {
            const rt = new ModuleRuntime();
            rt.registerAllDeep(mods);
            rt.resolve('graphic.anim');
        }
        const t0 = nowMs();
        for (let i = 0; i < N; i++) {
            const rt = new ModuleRuntime();
            rt.registerAllDeep(mods);
            rt.resolve('graphic.anim');
        }
        const total = nowMs() - t0;
        const msPerResolveAll = total / N;

        console.log(`[perf] eager resolve-all: N=${N} total=${total.toFixed(2)}ms per-op=${msPerResolveAll.toFixed(4)}ms (budget ${RESOLVE_ALL_BUDGET_MS}ms)`);
        expect(msPerResolveAll).toBeLessThan(RESOLVE_ALL_BUDGET_MS);
    });

    test('memoized resolve after registration is effectively free', () => {
        const rt = new ModuleRuntime();
        rt.registerAllDeep(graphicModules);
        rt.resolve('graphic.anim');
        const N = 1000;
        const t0 = nowMs();
        for (let i = 0; i < N; i++) rt.resolve('graphic.anim');
        const perOp = (nowMs() - t0) / N;
        expect(perOp).toBeLessThan(0.05);
    });
});
