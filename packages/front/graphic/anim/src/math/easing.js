// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.easing` — the normalized easing table, over fw's.
 *
 * The curves are fw's: the descriptor depends on fw `easing`
 * (`io/calc/easing.js`, the 31 Penner curves in `(t, b, c, d)` form) and
 * resolves to the same 31 names in normalized `(t) => t'` form, each one
 * `fwEasing[name](t, 0, 1, 1)`. No curve is written here; fw carries the
 * curves' origin and their third-party notice.
 *
 * **Worker-safe**: fw `easing` is pure arithmetic, no `window`/`document`.
 *
 * @module graphic.easing
 */

import { easing } from '@awacloud/fw/io/calc/easing.js';

/** @typedef {(t: number) => number} NormalizedEase */

/** @typedef {(t: number, b: number, c: number, d: number) => number} PennerEase */

/**
 * `graphic.easing` module descriptor.
 *
 * Resolved value: `Record<string, NormalizedEase>` (31-curve table).
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof easing], factory(fwEasing: Object<string, PennerEase>): Object<string, NormalizedEase> }}
 */
export const easingModule = {
    name: 'graphic.easing',
    type: 'lib.graphic.math',
    version: '0.1.0',
    dependencies: ['easing'],
    deps: [easing],

    /**
     * Returns the 31-curve normalized table over fw's Penner table.
     *
     * Each entry maps a normalized clock `t ∈ [0,1]` to a shaped progress
     * (`f(0) = 0`, `f(1) = 1`; Back/Elastic/Bounce overshoot near the ends).
     *
     * @param {Object<string, PennerEase>} fwEasing Resolved fw `easing`.
     * @returns {Object<string, NormalizedEase>} The normalized table.
     */
    factory(fwEasing) {
        /** @type {Object<string, NormalizedEase>} */
        const table = {};
        for (const name of Object.keys(fwEasing)) {
            const curve = fwEasing[name];
            if (typeof curve === 'function') table[name] = (t) => curve(t, 0, 1, 1);
        }
        return table;
    },
};
