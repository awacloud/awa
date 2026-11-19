// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.haar` — the two-dimensional Haar pyramid of the
 * owner's design.
 *
 * One pass takes a plane to four planes of half its size:
 *
 *   horizontally   Th = average of a pair     Tg = their difference
 *   vertically     Hx = average of Th         Hy = difference of Th
 *                  Gx = average of Tg         Gy = difference of Tg
 *
 * `Hx` is the picture at half size; `Gx` holds the horizontal detail,
 * `Hy` the vertical detail, `Gy` the diagonal one. The next pass works on
 * `Hx`. Each pass is a quality layer: a decoder that lacks the details
 * of a pass shows the picture at the size below, enlarged.
 *
 * Two arithmetics:
 *
 *   - the design's, on bytes: a difference is halved and centred on 127
 *     (`127 + ((a − b) >> 1)`). Every halving drops a bit: about 2 dB a
 *     pass, measured;
 *   - `exact`: the difference is kept whole (`a − b`, on 16-bit values),
 *     and the bit the average drops is found again from it. With every
 *     band kept, the pyramid then gives the plane back exactly — the
 *     same shifts and additions, one more bit a value.
 *
 * The defaults are the design's, to save bytes: the diagonal band is not
 * kept, and the two colour planes keep no detail at all — colour is
 * carried at the smallest size only. Both are options.
 */

/**
 * @typedef {Uint8ClampedArray|Int16Array} HaarBand Bytes centred on 127, or whole differences when exact.
 *
 * @typedef {object} HaarBands
 * @property {HaarBand} gx Horizontal detail.
 * @property {HaarBand} hy Vertical detail.
 * @property {HaarBand|null} gy Diagonal detail, when kept.
 *
 * @typedef {object} HaarLevel
 * @property {number} width Size of the bands of this level.
 * @property {number} height
 * @property {(HaarBands|null)[]} planes One entry per plane; null where the plane keeps no detail.
 *
 * @typedef {object} HaarPyramid
 * @property {number} width Size of the source.
 * @property {number} height
 * @property {boolean} [exact] The arithmetic of the bands.
 * @property {Uint8ClampedArray[]} base The planes at the smallest size.
 * @property {HaarLevel[]} levels From the coarsest to the finest.
 *
 * @typedef {object} HaarApi
 * @property {(planes: Uint8ClampedArray[], width: number, height: number, options: { levels: number, diagonal?: boolean, chroma?: 'base'|'all', exact?: boolean }) => HaarPyramid} forward
 * @property {(pyramid: HaarPyramid, options?: { levels?: number }) => Uint8ClampedArray[]} inverse Planes at the source size; `levels` limits how many detail levels are used.
 */

export const haarModule = {
    name: 'video.haar',
    version: '0.2.0',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {HaarApi} */
    factory() {
        const OFFSET = 127;

        /** One pass of the design's arithmetic on a plane of `w` × `h` (both even). */
        function split(plane, w, h, diagonal) {
            const hw = w >> 1;
            const hh = h >> 1;
            const th = new Uint8ClampedArray(hw * h);
            const tg = new Uint8ClampedArray(hw * h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < hw; x++) {
                    const a = plane[y * w + 2 * x];
                    const b = plane[y * w + 2 * x + 1];
                    th[y * hw + x] = (a + b) >> 1;
                    tg[y * hw + x] = OFFSET + ((a - b) >> 1);
                }
            }
            const hx = new Uint8ClampedArray(hw * hh);
            const hy = new Uint8ClampedArray(hw * hh);
            const gx = new Uint8ClampedArray(hw * hh);
            const gy = diagonal ? new Uint8ClampedArray(hw * hh) : null;
            for (let y = 0; y < hh; y++) {
                for (let x = 0; x < hw; x++) {
                    const top = 2 * y * hw + x;
                    const bottom = top + hw;
                    const at = y * hw + x;
                    hx[at] = (th[top] + th[bottom]) >> 1;
                    hy[at] = OFFSET + ((th[top] - th[bottom]) >> 1);
                    gx[at] = (tg[top] + tg[bottom]) >> 1;
                    if (gy) gy[at] = OFFSET + ((tg[top] - tg[bottom]) >> 1);
                }
            }
            return { hx, bands: { gx, hy, gy } };
        }

        /** The inverse pass of the design's arithmetic. */
        function merge(hx, bands, hw, hh) {
            const w = hw * 2;
            const out = new Uint8ClampedArray(w * hh * 2);
            for (let y = 0; y < hh; y++) {
                for (let x = 0; x < hw; x++) {
                    const at = y * hw + x;
                    // Without bands the differences are zero: the pixel is repeated.
                    const dv = bands ? bands.hy[at] - OFFSET : 0;
                    const g = bands ? bands.gx[at] : OFFSET;
                    const dg = bands && bands.gy ? bands.gy[at] - OFFSET : 0;
                    const thTop = hx[at] + dv;
                    const thBottom = hx[at] - dv;
                    const dTop = g + dg - OFFSET;
                    const dBottom = g - dg - OFFSET;
                    const top = 2 * y * w + 2 * x;
                    out[top] = thTop + dTop;
                    out[top + 1] = thTop - dTop;
                    out[top + w] = thBottom + dBottom;
                    out[top + w + 1] = thBottom - dBottom;
                }
            }
            return out;
        }

        /** One exact pass: averages by shift, differences kept whole. */
        function splitExact(plane, w, h, diagonal) {
            const hw = w >> 1;
            const hh = h >> 1;
            const th = new Int16Array(hw * h);
            const tg = new Int16Array(hw * h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < hw; x++) {
                    const a = plane[y * w + 2 * x];
                    const b = plane[y * w + 2 * x + 1];
                    th[y * hw + x] = (a + b) >> 1;
                    tg[y * hw + x] = a - b;
                }
            }
            const hx = new Uint8ClampedArray(hw * hh);
            const hy = new Int16Array(hw * hh);
            const gx = new Int16Array(hw * hh);
            const gy = diagonal ? new Int16Array(hw * hh) : null;
            for (let y = 0; y < hh; y++) {
                for (let x = 0; x < hw; x++) {
                    const top = 2 * y * hw + x;
                    const bottom = top + hw;
                    const at = y * hw + x;
                    hx[at] = (th[top] + th[bottom]) >> 1;
                    hy[at] = th[top] - th[bottom];
                    gx[at] = (tg[top] + tg[bottom]) >> 1;
                    if (gy) gy[at] = tg[top] - tg[bottom];
                }
            }
            return { hx, bands: { gx, hy, gy } };
        }

        /** The inverse exact pass: `a = average + ((difference + 1) >> 1)`, `b = a − difference`. */
        function mergeExact(hx, bands, hw, hh) {
            const w = hw * 2;
            const out = new Uint8ClampedArray(w * hh * 2);
            for (let y = 0; y < hh; y++) {
                for (let x = 0; x < hw; x++) {
                    const at = y * hw + x;
                    const dv = bands ? bands.hy[at] : 0;
                    const g = bands ? bands.gx[at] : 0;
                    const dg = bands && bands.gy ? bands.gy[at] : 0;
                    const thTop = hx[at] + ((dv + 1) >> 1);
                    const thBottom = thTop - dv;
                    const tgTop = g + ((dg + 1) >> 1);
                    const tgBottom = tgTop - dg;
                    const top = 2 * y * w + 2 * x;
                    const a = thTop + ((tgTop + 1) >> 1);
                    out[top] = a;
                    out[top + 1] = a - tgTop;
                    const c = thBottom + ((tgBottom + 1) >> 1);
                    out[top + w] = c;
                    out[top + w + 1] = c - tgBottom;
                }
            }
            return out;
        }

        /**
         * @param {Uint8ClampedArray[]} planes Planes of `width` × `height`; index 1 is the luma.
         * @param {number} width
         * @param {number} height
         * @param {object} options
         * @param {number} options.levels Passes, 1 to 6.
         * @param {boolean} [options.diagonal=false] Keep the diagonal band.
         * @param {'base'|'all'} [options.chroma='base'] Colour detail: none, or at every level.
         * @param {boolean} [options.exact=false] Keep the differences whole.
         * @returns {HaarPyramid}
         * @throws {RangeError} When the size does not divide by 2^levels, or on a bad option.
         */
        function forward(planes, width, height, { levels, diagonal = false, chroma = 'base', exact = false }) {
            if (!Number.isInteger(levels) || levels < 1 || levels > 6) throw new RangeError(`video.haar: levels ${levels}`);
            if (width % (1 << levels) !== 0 || height % (1 << levels) !== 0) {
                throw new RangeError(`video.haar: ${width}x${height} does not divide by 2^${levels}`);
            }
            if (chroma !== 'base' && chroma !== 'all') throw new RangeError(`video.haar: chroma ${chroma}`);
            const pass = exact ? splitExact : split;
            const out = new Array(levels);
            let current = planes;
            let w = width;
            let h = height;
            for (let k = 0; k < levels; k++) {
                const results = current.map((plane) => pass(plane, w, h, diagonal));
                w >>= 1;
                h >>= 1;
                out[levels - 1 - k] = {
                    width: w,
                    height: h,
                    planes: results.map((result, index) => (index === 1 || chroma === 'all' ? result.bands : null)),
                };
                current = results.map((result) => result.hx);
            }
            return { width, height, exact, base: current, levels: out };
        }

        /**
         * @param {HaarPyramid} pyramid
         * @param {object} [options]
         * @param {number} [options.levels] Detail levels to use, from the coarsest; all by default.
         * @returns {Uint8ClampedArray[]} Planes at the source size.
         */
        function inverse(pyramid, { levels = pyramid.levels.length } = {}) {
            const pass = pyramid.exact ? mergeExact : merge;
            let current = pyramid.base;
            pyramid.levels.forEach((level, k) => {
                current = current.map((plane, index) => pass(plane, k < levels ? level.planes[index] : null, level.width, level.height));
            });
            return current;
        }

        return { forward, inverse };
    },
};
