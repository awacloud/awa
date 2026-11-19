// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the standing PERF GATE.
 *
 * Runs the ported W0 harness (`src/perf/harness.js`) as a regression budget:
 *
 *   1. `runPerf` at a fixed N yields finite, non-negative per-frame stats.
 *   2. The regression budget (`assertBudget`) is green: ms/frame <= 16.67 (one
 *      60fps frame) up to N=500 concurrent tweens — STUB-target compute cost,
 *      NOT browser fps (W0 caveat). Reported as ms/frame, not fps.
 *   3. `sweep` produces a baseline table of ms/frame vs N.
 *   4. A DOM-backed variant runs end-to-end against live SVG elements (write
 *      path through the resolved svgApply → dom.attr) and also stays in budget.
 *
 * Deterministic: a manual clock drives every frame; no real rAF is involved, so
 * the measured number is the engine's per-frame WORK and is CI-stable.
 */

// happy-dom registers DOM globals so (a) the resolved fw `dom` factory evaluates
// and (b) the DOM-backed variant can build live SVG elements.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered in this worker */ }

import { describe, test, expect } from 'bun:test';
import { expectWithinBudget, PERF_GATE } from './_lib/perf-gate.js';
import { runPerf, sweep, assertBudget } from '../src/perf/harness.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Budget: one 60fps frame. Stub-target compute, not browser fps (W0 caveat). */
const BUDGET_MS = 16.67;
/** Gate point: 500 concurrent tweens sharing ONE scheduler. */
const GATE_N = 500;

describe('perf harness — per-frame stats', () => {
    test('runPerf yields finite, non-negative per-frame stats', () => {
        const r = runPerf({ tweens: 100, frames: 120 });
        expect(r.tweens).toBe(100);
        expect(r.frames).toBe(120);
        expect(r.totalMs).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(r.msPerFrame)).toBe(true);
        expect(r.msPerFrame).toBeGreaterThanOrEqual(0);
        expect(r.domBacked).toBe(false);
        console.log(`[perf] tweens=100 frames=120 totalMs=${r.totalMs.toFixed(2)} `
            + `msPerFrame=${r.msPerFrame.toFixed(4)}`);
    });
});

describe('perf regression budget (the standing gate)', () => {
    test(`ms/frame <= ${BUDGET_MS} at N=${GATE_N} concurrent tweens`, () => {
        const r = PERF_GATE
            ? assertBudget({ tweens: GATE_N, frames: 120, budgetMs: BUDGET_MS })
            : runPerf({ tweens: GATE_N, frames: 120 });
        expect(r.tweens).toBe(GATE_N);
        expectWithinBudget(expect, r.msPerFrame, BUDGET_MS);
        console.log(`[perf-gate] N=${GATE_N} msPerFrame=${r.msPerFrame.toFixed(4)} `
            + `(budget ${BUDGET_MS}) msPerTweenPerFrame=${r.msPerTweenPerFrame.toFixed(6)}`);
    });
});

describe('assertBudget — throwing contract (clock-independent)', () => {
    test('throws when the measured ms/frame exceeds the budget', () => {
        // A zero budget is exceeded by any real measurement, whatever the machine.
        expect(() => assertBudget({ tweens: 10, frames: 30, budgetMs: 0 })).toThrow(/exceeds budget/);
    });

    test('returns the measurement when within the budget', () => {
        const r = assertBudget({ tweens: 10, frames: 30, budgetMs: Number.POSITIVE_INFINITY });
        expect(Number.isFinite(r.msPerFrame)).toBe(true);
    });
});

describe('perf sweep — ms/frame vs N baseline table', () => {
    test('sweep across concurrent-tween counts reports ms/frame (not fps)', () => {
        const table = sweep([10, 50, 100, 250, 500], 120);
        expect(table.length).toBe(5);
        for (const row of table) {
            expect(Number.isFinite(row.msPerFrame)).toBe(true);
            expect(row.msPerFrame).toBeGreaterThanOrEqual(0);
            console.log(`[perf-sweep] tweens=${row.tweens} msPerFrame=${row.msPerFrame.toFixed(4)} `
                + `msPerTweenPerFrame=${row.msPerTweenPerFrame.toFixed(6)}`);
        }
    });
});

describe('perf DOM-backed variant — live SVG write path', () => {
    test('runs end-to-end against live SVG elements and stays in budget', () => {
        const makeTarget = () => document.createElementNS(SVG_NS, 'rect');
        const r = runPerf({ tweens: 100, frames: 60, makeTarget });
        expect(r.domBacked).toBe(true);
        expect(Number.isFinite(r.msPerFrame)).toBe(true);
        expectWithinBudget(expect, r.msPerFrame, BUDGET_MS);
        console.log(`[perf-dom] tweens=100 frames=60 msPerFrame=${r.msPerFrame.toFixed(4)} `
            + `(budget ${BUDGET_MS})`);
    });

    test('DOM-backed run actually wrote the attribute value to a live element', () => {
        // Capture the last-created element to confirm the write path executed.
        // Linear easing + enough frames that the final clock tick reaches t>=1
        // (frames*dt must span the full duration, which is itself frames*dt).
        let lastEl = null;
        const makeTarget = () => { lastEl = document.createElementNS(SVG_NS, 'rect'); return lastEl; };
        runPerf({ tweens: 1, frames: 30, from: '0px', to: '300px', easing: 'linear', makeTarget });
        expect(lastEl).not.toBeNull();
        // The write path executed: 'x' is a px value strictly between start and end.
        const written = lastEl.getAttribute('x');
        expect(written).not.toBeNull();
        expect(written.endsWith('px')).toBe(true);
        const n = parseFloat(written);
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThanOrEqual(300);
    });
});
