// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.motion` — exploration: content that only moves.
 *
 * A codec that sends changed pixels pays for a page that scrolls or a
 * camera that pans as if everything were new: every pixel changed, yet
 * nearly all of them are pixels the receiver already has, somewhere
 * else. This module finds **one vector for the frame** — the picture
 * moved by so many pixels — and, optionally, which **tiles** follow it
 * (a panel that scrolls beside a still area). The receiver moves what it
 * holds by the vector before the changed pixels are applied; only what
 * came into view is left to send.
 *
 * It is deliberately small: one vector a frame, a flag a tile. Not a
 * vector per block, no fractional positions.
 *
 * The estimate samples the picture on a grid and tries each candidate
 * vector — along the two axes up to `range`, and every small diagonal.
 * A vector scores by the samples it explains that staying put does not,
 * less those it spoils; it is retained when the score is a clear share
 * of the samples that changed. With tiles the score is taken tile by
 * tile and only the tiles the vector helps count: what stays still
 * beside what moves does not speak against it.
 *
 * To spare the processor the search runs only when at least `minChange`
 * of the samples no longer match in place, and in two stages: every
 * candidate on a quarter of the samples, then the best few on all of
 * them.
 */

/**
 * @typedef {object} Move
 * @property {boolean} moved False: no vector worth applying.
 * @property {boolean} [searched] False when too little changed for a search to run.
 * @property {number} dx Content moved right by `dx` pixels (negative: left).
 * @property {number} dy Content moved down by `dy` pixels (negative: up).
 * @property {number} tile Tile size in pixels; 0: the whole frame moves.
 * @property {Uint8Array|null} tiles One flag a tile, row by row: the tile follows the vector.
 *
 * @typedef {object} MotionApi
 * @property {(now: ArrayLike<number>, reference: ArrayLike<number>, width: number, height: number, options?: { range?: number, tile?: number, threshold?: number, minChange?: number }) => Move} estimate
 * @property {<T extends Uint8ClampedArray|Int16Array|Uint16Array|Uint8Array>(plane: T, width: number, height: number, move: Move) => T} apply A new plane; where the source falls outside, the old value stays.
 */

export const motionModule = {
    name: 'video.motion',
    version: '0.3.0',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {MotionApi} */
    factory() {
        /**
         * @param {ArrayLike<number>} now The plane of the current frame.
         * @param {ArrayLike<number>} reference The plane the receiver holds.
         * @param {number} width
         * @param {number} height
         * @param {object} [options]
         * @param {number} [options.range=32] Longest move searched along an axis, in pixels.
         * @param {number} [options.tile=0] Tile size, a multiple of 8; 0: one decision for the frame.
         * @param {number} [options.threshold=3] Two values this close are the same.
         * @param {number} [options.minChange=0.1] Share of the picture that must have changed for a search to run, 0 to 1.
         * @returns {Move}
         * @throws {RangeError} On planes of the wrong size or a bad option.
         */
        function estimate(now, reference, width, height, { range = 32, tile = 0, threshold = 3, minChange = 0.1 } = {}) {
            const n = width * height;
            if (now.length !== n || reference.length !== n) throw new RangeError('video.motion: planes of the wrong size');
            if (!Number.isInteger(range) || range < 1 || range > 127) throw new RangeError(`video.motion: range ${range}`);
            if (!Number.isInteger(tile) || tile < 0 || tile % 8 !== 0) throw new RangeError(`video.motion: tile ${tile}`);
            if (!(minChange >= 0 && minChange <= 1)) throw new RangeError(`video.motion: minChange ${minChange}`);
            const none = { moved: false, searched: false, dx: 0, dy: 0, tile, tiles: null };

            // A grid of about four thousand samples.
            const step = Math.max(1, Math.floor(Math.sqrt(n / 4000)));
            const xs = [];
            const ys = [];
            let stay = 0;           // samples that already match where they are
            for (let y = step >> 1; y < height; y += step) {
                for (let x = step >> 1; x < width; x += step) {
                    xs.push(x);
                    ys.push(y);
                    let d = now[y * width + x] - reference[y * width + x];
                    if (d < 0) d = -d;
                    if (d <= threshold) stay++;
                }
            }
            const samples = xs.length;
            // Too little changed for a move of the picture to be worth looking for.
            if (samples - stay <= samples * minChange) return none;
            none.searched = true;

            const candidates = [];
            for (let d = 1; d <= range; d++) candidates.push([0, d], [0, -d], [d, 0], [-d, 0]);
            for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx !== 0 && dy !== 0) candidates.push([dx, dy]);

            // With tiles, each sample belongs to one: a vector is judged on the tiles it helps. A toolbar, a margin
            // or a still panel beside what scrolls would otherwise count against it (the owner's document, row V17).
            const cells = tile > 0 ? Math.ceil(width / tile) * Math.ceil(height / tile) : 0;
            const cellOf = tile > 0 ? Uint16Array.from(xs, (x, k) => Math.floor(ys[k] / tile) * Math.ceil(width / tile) + Math.floor(x / tile)) : null;
            const perCell = tile > 0 ? new Int32Array(cells) : null;

            /** Samples a vector explains, less those it spoils, on every `stride`-th sample. */
            const scoreOf = (dx, dy, stride) => {
                let score = 0;
                if (perCell) perCell.fill(0);
                for (let k = 0; k < samples; k += stride) {
                    const x = xs[k];
                    const y = ys[k];
                    const sx = x - dx;
                    const sy = y - dy;
                    if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
                    const v = now[y * width + x];
                    let here = v - reference[y * width + x];
                    if (here < 0) here = -here;
                    let there = v - reference[sy * width + sx];
                    if (there < 0) there = -there;
                    let gain = 0;
                    if (there <= threshold && here > threshold) gain = 1;
                    else if (here <= threshold && there > threshold) gain = -1;
                    if (perCell) perCell[cellOf[k]] += gain;
                    else score += gain;
                }
                if (perCell) for (let c = 0; c < cells; c++) if (perCell[c] > 0) score += perCell[c];
                return score;
            };
            // First every candidate on a quarter of the samples, then the best four on all of them.
            const ranked = candidates.map(([dx, dy]) => [scoreOf(dx, dy, 4), dx, dy]).sort((a, b) => b[0] - a[0]).slice(0, 4);
            let best = null;
            let bestScore = 0;
            for (const [, dx, dy] of ranked) {
                const score = scoreOf(dx, dy, 1);
                if (score > bestScore) { bestScore = score; best = [dx, dy]; }
            }
            // A move must explain a clear share of what does not match in place.
            // (and at least a hundredth of the samples: on a white page with a few lines of text little changes at all).
            if (!best || bestScore < Math.max(samples * 0.01, (samples - stay) * 0.3)) return none;
            const [dx, dy] = best;
            if (tile === 0) return { moved: true, searched: true, dx, dy, tile, tiles: null };

            // Each tile follows the vector when it then matches clearly better.
            const across = Math.ceil(width / tile);
            const down = Math.ceil(height / tile);
            const tiles = new Uint8Array(across * down);
            let following = 0;
            for (let ty = 0; ty < down; ty++) {
                for (let tx = 0; tx < across; tx++) {
                    let here = 0;
                    let there = 0;
                    const yEnd = Math.min(height, (ty + 1) * tile);
                    const xEnd = Math.min(width, (tx + 1) * tile);
                    for (let y = ty * tile; y < yEnd; y += 2) {
                        for (let x = tx * tile; x < xEnd; x += 2) {
                            const sx = x - dx;
                            const sy = y - dy;
                            if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
                            const v = now[y * width + x];
                            let a = v - reference[y * width + x];
                            if (a < 0) a = -a;
                            let b = v - reference[sy * width + sx];
                            if (b < 0) b = -b;
                            if (a > threshold) here++;
                            if (b > threshold) there++;
                        }
                    }
                    if (there * 2 < here) { tiles[ty * across + tx] = 1; following++; }
                }
            }
            if (following === 0) return none;
            return { moved: true, searched: true, dx, dy, tile, tiles };
        }

        /**
         * @param {Uint8ClampedArray|Int16Array|Uint16Array|Uint8Array} plane
         * @param {number} width
         * @param {number} height
         * @param {Move} move
         * @returns {typeof plane} A new plane of the same type.
         */
        function apply(plane, width, height, move) {
            const out = plane.slice();
            if (!move.moved) return out;
            const { dx, dy, tile, tiles } = move;
            const across = tile ? Math.ceil(width / tile) : 0;
            for (let y = 0; y < height; y++) {
                const sy = y - dy;
                if (sy < 0 || sy >= height) continue;
                const row = tile ? Math.floor(y / tile) * across : 0;
                for (let x = 0; x < width; x++) {
                    const sx = x - dx;
                    if (sx < 0 || sx >= width) continue;
                    if (tiles && !tiles[row + Math.floor(x / tile)]) continue;
                    out[y * width + x] = plane[sy * width + sx];
                }
            }
            return out;
        }

        return { estimate, apply };
    },
};
