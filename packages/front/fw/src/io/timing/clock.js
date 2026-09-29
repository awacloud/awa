// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Monotonic clock - replacement for `performance.now()` which
 * is blocked by `sanity/base.js`.
 *
 * Provides :
 *   - `now()` → wall-clock milliseconds (`Date.now()` wrapper, may jump on
 *               NTP/DST adjustments - fine for timestamps and absolute times).
 *   - `monotonic()` → never-decreasing milliseconds. If wall clock jumps
 *                     backwards, the returned value flattens until the wall
 *                     catches up. Use for intervals/profile counters where
 *                     monotonicity matters more than absolute accuracy.
 *   - `since(t0)`   → `monotonic() - t0` (positive elapsed ms).
 *   - `iso()`       → `new Date().toISOString()` snapshot.
 *   - `format(ms)`  → `'1.234 s'` / `'12.3 ms'` for human-readable display.
 *
 * Resolution : 1 ms (`Date.now()`). Lower precision than `performance.now()`
 * but consistent across all browser / Node / Bun runtimes.
 *
 */

/**
 * Public API returned by `clock.factory()`.
 * @typedef {object} ClockAPI
 * @property {() => number} now Wall-clock milliseconds (`Date.now()` wrapper).
 * @property {() => number} monotonic Never-decreasing milliseconds; flattens if the wall clock jumps backwards.
 * @property {(t0: number) => number} since Positive elapsed milliseconds since `t0` (`monotonic() - t0`, clamped at 0).
 * @property {() => string} iso `new Date().toISOString()` snapshot.
 * @property {(ms: number) => string} format Human-readable duration string (e.g. `'1.234 s'`, `'12.3 ms'`).
 */

export const clock = {
    name: 'clock',
    version: '1.0.0',
    type: 'fw.io.timing',
    dependencies: [],

    /** @returns {ClockAPI} */
    factory() {

        // Track last returned monotonic value to enforce non-decrease.
        let _lastMono = Date.now();

        function now() {
            return Date.now();
        }

        function monotonic() {
            const t = Date.now();
            if (t < _lastMono) return _lastMono;   // wall-clock jumped back ; flatten
            _lastMono = t;
            return t;
        }

        function since(t0) {
            return Math.max(0, monotonic() - t0);
        }

        function iso() {
            return new Date().toISOString();
        }

        function format(ms) {
            const n = Number(ms);
            if (!Number.isFinite(n)) return String(ms);
            const abs = Math.abs(n);
            if (abs < 1)         return n.toFixed(3) + ' ms';
            if (abs < 1000)      return n.toFixed(1) + ' ms';
            if (abs < 60_000)    return (n / 1000).toFixed(3) + ' s';
            if (abs < 3_600_000) return (n / 60_000).toFixed(2) + ' min';
            return (n / 3_600_000).toFixed(2) + ' h';
        }

        return { now, monotonic, since, iso, format };
    },
};
