// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.lerp` — scalar linear interpolation fw module descriptor.
 *
 * The interpolation itself is fw's: the descriptor depends on fw `interp`
 * (`io/math/interp.js`) and resolves to its `linear(a, b, t)`. The package
 * keeps the `graphic.lerp` name so every module that takes a lerp
 * (`graphic.matrix`, `graphic.color`, `graphic.interpolate`) is unchanged.
 *
 * **Worker-safe**: fw `interp` is pure arithmetic, no `window`/`document`.
 *
 * @module graphic.lerp
 */

import { interp } from '@awacloud/fw/io/math/interp.js';

/**
 * `graphic.lerp` module descriptor.
 *
 * Resolved value: `(a: number, b: number, t: number) => number`
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof interp], factory(interpApi: { linear: (a: number, b: number, t: number) => number }): (a: number, b: number, t: number) => number }}
 */
export const lerpModule = {
    name: 'graphic.lerp',
    type: 'lib.graphic.math',
    version: '0.1.0',
    dependencies: ['interp'],
    deps: [interp],

    /**
     * Returns fw's scalar linear interpolation, `a + t * (b - a)`.
     *
     * Not clamped — `t` values outside `[0,1]` extrapolate linearly. Clamping
     * is the Tween's responsibility.
     *
     * @param {{ linear: (a: number, b: number, t: number) => number }} interpApi
     *   Resolved fw `interp`.
     * @returns {(a: number, b: number, t: number) => number} Lerp function.
     *
     * @example
     * const lerp = lerpModule.factory(interp.factory());
     * lerp(0, 100, 0.5); // 50
     * lerp(0, 100, 1.5); // 150  (extrapolates)
     */
    factory(interpApi) {
        return interpApi.linear;
    },
};
