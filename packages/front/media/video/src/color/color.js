// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.color` — the integer colour approximation of the
 * owner's design.
 *
 * A pixel becomes a luma approximation and two colour differences, with
 * shifts and additions on bytes only:
 *
 *   luma  = (4·R + 11·G + B) >> 4        weights 0.25, 0.6875, 0.0625
 *   red   = 127 + ((luma − R) >> 1)
 *   blue  = 127 + ((luma − B) >> 1)
 *
 * The weights are chosen for bitwise arithmetic; 127 centres a halved
 * difference in a byte. The inverse rebuilds R and B from the halved
 * differences and G from the luma, so the transform is not exact: each
 * halving drops a bit, and G is divided by 11. The error is measured in
 * the package's bench.
 *
 * The three results are returned as separate planes, the form the
 * wavelet works on.
 */

/**
 * @typedef {object} ColorApi
 * @property {number} offset 127.
 * @property {(rgba: Uint8ClampedArray) => Uint8ClampedArray[]} forward `[red difference, luma, blue difference]`, one byte a pixel each.
 * @property {(planes: Uint8ClampedArray[], out?: Uint8ClampedArray) => Uint8ClampedArray} inverse RGBA, alpha 255.
 */

export const colorModule = {
    name: 'video.color',
    version: '0.1.0',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {ColorApi} */
    factory() {
        const OFFSET = 127;

        /**
         * @param {Uint8ClampedArray} rgba
         * @returns {Uint8ClampedArray[]} `[red difference, luma, blue difference]`.
         */
        function forward(rgba) {
            const n = rgba.length >> 2;
            const red = new Uint8ClampedArray(n);
            const luma = new Uint8ClampedArray(n);
            const blue = new Uint8ClampedArray(n);
            for (let p = 0, i = 0; p < n; p++, i += 4) {
                const r = rgba[i];
                const b = rgba[i + 2];
                const y = ((r << 2) + 11 * rgba[i + 1] + b) >> 4;
                luma[p] = y;
                red[p] = OFFSET + ((y - r) >> 1);
                blue[p] = OFFSET + ((y - b) >> 1);
            }
            return [red, luma, blue];
        }

        /**
         * @param {Uint8ClampedArray[]} planes `[red difference, luma, blue difference]`.
         * @param {Uint8ClampedArray} [out] Receives the picture; allocated when absent.
         * @returns {Uint8ClampedArray} RGBA, alpha 255.
         */
        function inverse(planes, out) {
            const [red, luma, blue] = planes;
            const n = luma.length;
            const rgba = out ?? new Uint8ClampedArray(n * 4);
            for (let p = 0, i = 0; p < n; p++, i += 4) {
                const y = luma[p];
                // The stores clamp: G is computed from the clamped R and B, as a decoder sees them.
                rgba[i] = y - ((red[p] - OFFSET) << 1);
                rgba[i + 2] = y - ((blue[p] - OFFSET) << 1);
                rgba[i + 1] = Math.round(((y << 4) - (rgba[i] << 2) - rgba[i + 2]) / 11);
                rgba[i + 3] = 255;
            }
            return rgba;
        }

        return { offset: OFFSET, forward, inverse };
    },
};
