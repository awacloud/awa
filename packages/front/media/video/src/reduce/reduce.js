// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.reduce` — a picture reduced by a whole number.
 *
 * The cheapest way to spend fewer bytes is to send a smaller picture:
 * a quarter of the surface costs about three tenths of the bytes
 * (measured on real clips, row V16). Each pixel of the result is the
 * average of the square of pixels it stands for.
 */

/**
 * @typedef {object} ReduceApi
 * @property {(rgba: Uint8ClampedArray, width: number, height: number, factor: number) => Uint8ClampedArray} reduce RGBA of `width / factor` × `height / factor`; with a factor of 1, the picture given.
 */

export const reduceModule = {
    name: 'video.reduce',
    version: '0.1.0',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {ReduceApi} */
    factory() {
        /**
         * @param {Uint8ClampedArray} rgba A picture of `width` × `height`.
         * @param {number} width
         * @param {number} height
         * @param {number} factor A whole number that divides both sizes.
         * @returns {Uint8ClampedArray}
         * @throws {RangeError} On a bad factor, a size it does not divide, or a picture of another size.
         */
        function reduce(rgba, width, height, factor) {
            if (!Number.isInteger(factor) || factor < 1) throw new RangeError(`video.reduce: factor ${factor}`);
            if (width % factor !== 0 || height % factor !== 0) throw new RangeError(`video.reduce: ${width}x${height} does not divide by ${factor}`);
            if (rgba.length !== width * height * 4) throw new RangeError(`video.reduce: a picture of ${rgba.length} bytes, ${width * height * 4} expected`);
            if (factor === 1) return rgba;
            const w = width / factor;
            const h = height / factor;
            const area = factor * factor;
            const half = area >> 1;
            const out = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    let r = 0;
                    let g = 0;
                    let b = 0;
                    let a = 0;
                    for (let dy = 0; dy < factor; dy++) {
                        let i = ((y * factor + dy) * width + x * factor) * 4;
                        for (let dx = 0; dx < factor; dx++) {
                            r += rgba[i];
                            g += rgba[i + 1];
                            b += rgba[i + 2];
                            a += rgba[i + 3];
                            i += 4;
                        }
                    }
                    const o = (y * w + x) * 4;
                    out[o] = Math.floor((r + half) / area);
                    out[o + 1] = Math.floor((g + half) / area);
                    out[o + 2] = Math.floor((b + half) / area);
                    out[o + 3] = Math.floor((a + half) / area);
                }
            }
            return out;
        }

        return { reduce };
    },
};
