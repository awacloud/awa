// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.post` — the restoration filter of the decoder.
 *
 * The picture leaves the pyramid sharp where its details came, and with
 * its colour enlarged from the smallest picture: colours sit in blocks,
 * a little off the shapes. The owner's code ended on a filter that
 * gives the picture back a natural look. It works on the three planes
 * (a colour difference, the luma, the other colour difference), before
 * they become a picture again.
 *
 * Modes:
 *
 *   - `none`;
 *   - `laplace` — the design as written: each plane less its Laplacian
 *     (`4c − N − S − E − W`), the luma less a quarter of it. For the luma
 *     that is the mean of the four neighbours; for a colour plane, one
 *     step of diffusion. A smoothing, whatever its name;
 *   - `laplace-clamped` — the original code as it ran: it computed the
 *     Laplacian into a byte image, where a negative value becomes zero.
 *     Only local peaks are lowered; hollows are left;
 *   - `gauss` — a 3×3 binomial blur of the three planes, the Gaussian
 *     blur the patent's description names;
 *   - `chroma` — explored here: the binomial blur on the two colour
 *     planes only. The luma, where the detail is, stays as decoded.
 *
 * `passes` repeats the filter. The border pixels are left as decoded by
 * the Laplacian modes, as in the original; the blurs repeat the edge.
 *
 * It is a choice of the decoder: the stream does not change.
 */

/**
 * @typedef {'none'|'laplace'|'laplace-clamped'|'gauss'|'chroma'} PostMode
 *
 * @typedef {object} PostApi
 * @property {PostMode[]} modes
 * @property {(planes: Uint8ClampedArray[], width: number, height: number, options?: { mode?: PostMode, passes?: number }) => Uint8ClampedArray[]} apply New planes; with `none`, the planes given.
 */

export const postModule = {
    name: 'video.post',
    version: '0.1.0',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {PostApi} */
    factory() {
        const MODES = ['none', 'laplace', 'laplace-clamped', 'gauss', 'chroma'];

        /**
         * A plane less its Laplacian, shifted right by `shift`; the border is copied.
         * @param {boolean} clamped Keep only the positive Laplacians, as a byte image did.
         */
        function lessLaplacian(plane, w, h, shift, clamped) {
            const out = new Uint8ClampedArray(plane);
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const i = y * w + x;
                    let l = (plane[i] << 2) - plane[i - 1] - plane[i + 1] - plane[i - w] - plane[i + w];
                    if (clamped) l = l < 0 ? 0 : l > 255 ? 255 : l;
                    out[i] = plane[i] - (l >> shift);
                }
            }
            return out;
        }

        /** The 3×3 binomial blur (1 2 1 / 2 4 2 / 1 2 1, over 16); the edge is repeated. */
        function binomial(plane, w, h) {
            const rows = new Uint16Array(w * h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    rows[i] = plane[x > 0 ? i - 1 : i] + (plane[i] << 1) + plane[x < w - 1 ? i + 1 : i];
                }
            }
            const out = new Uint8ClampedArray(w * h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    out[i] = (rows[y > 0 ? i - w : i] + (rows[i] << 1) + rows[y < h - 1 ? i + w : i] + 8) >> 4;
                }
            }
            return out;
        }

        /**
         * @param {Uint8ClampedArray[]} planes `[red difference, luma, blue difference]` of `width` × `height`.
         * @param {number} width
         * @param {number} height
         * @param {object} [options]
         * @param {PostMode} [options.mode='none']
         * @param {number} [options.passes=1] Times the filter is applied, 1 to 8.
         * @returns {Uint8ClampedArray[]}
         * @throws {RangeError} On an unknown mode, a bad count of passes, or planes of the wrong size.
         */
        function apply(planes, width, height, { mode = 'none', passes = 1 } = {}) {
            if (!MODES.includes(mode)) throw new RangeError(`video.post: mode ${mode}`);
            if (!Number.isInteger(passes) || passes < 1 || passes > 8) throw new RangeError(`video.post: passes ${passes}`);
            if (planes.length !== 3 || planes.some((plane) => plane.length !== width * height)) throw new RangeError('video.post: planes of the wrong size');
            if (mode === 'none') return planes;
            let [red, luma, blue] = planes;
            for (let k = 0; k < passes; k++) {
                if (mode === 'gauss') {
                    red = binomial(red, width, height);
                    luma = binomial(luma, width, height);
                    blue = binomial(blue, width, height);
                } else if (mode === 'chroma') {
                    red = binomial(red, width, height);
                    blue = binomial(blue, width, height);
                } else {
                    const clamped = mode === 'laplace-clamped';
                    red = lessLaplacian(red, width, height, 0, clamped);
                    luma = lessLaplacian(luma, width, height, 2, clamped);
                    blue = lessLaplacian(blue, width, height, 0, clamped);
                }
            }
            return [red, luma, blue];
        }

        return { modes: MODES, apply };
    },
};
