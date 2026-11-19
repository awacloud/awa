// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Opt-in gate for absolute wall-clock budgets.
 *
 * An absolute ms/frame ceiling depends on machine load, not on the code under
 * test (`ai/conventions/testing.md` § Evidence & gate design: wall-clock
 * figures are measurements; expensive or machine-dependent locks are
 * env-gated). The measurement always runs and its figure is always printed by
 * the caller; the ceiling is asserted only when `GRAPHIC_PERF=1`. Relative and
 * structural locks (ratios, writes per frame) are not routed through here.
 *
 * Lives under `tests/_lib/`, outside `bun test` discovery.
 */

/** True when the absolute budgets are enforced (`GRAPHIC_PERF=1`). */
export const PERF_GATE = process.env.GRAPHIC_PERF === '1';

/**
 * Check that `ms` is a real measurement and, when the gate is on, that it
 * stays within `budgetMs`.
 *
 * @param {(value: unknown) => any} expect The test's `expect`.
 * @param {number} ms Measured milliseconds (per frame).
 * @param {number} budgetMs Absolute ceiling, enforced only under `GRAPHIC_PERF=1`.
 * @returns {void}
 */
export function expectWithinBudget(expect, ms, budgetMs) {
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(0);
    if (PERF_GATE) expect(ms).toBeLessThanOrEqual(budgetMs);
}
