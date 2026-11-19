// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.codec` — the encoder and the decoder of the
 * layered stream.
 *
 * Encoder, per frame: the colour approximation, the Haar pyramid, the
 * selection of the pixels to send on the smallest picture, and a packet
 * of units — the base (a header, the geometry, the luma of the selected
 * pixels), their colour, then one unit per detail level: for each
 * selected pixel, the block of detail it covers at that level. Nothing
 * to say: no packet.
 *
 * Decoder: it keeps the pyramid it was last sent and writes each packet
 * into it. Units may be missing — dropped by the sender, a relay or the
 * receiver: without the colour unit the updated pixels turn grey,
 * without a detail level they show the smaller picture enlarged. A lost
 * packet leaves old pixels where the picture has not moved since; the
 * refresh of the selection repairs them. The decoder may end on a
 * restoration filter (`post`, see `video.post`): its own choice, which
 * changes no byte of the stream.
 *
 * Options, in the spirit of the audio side:
 *   - `levels`, `diagonal`, `exact`: the pyramid — `exact` keeps its
 *     differences whole, so that it loses nothing by itself;
 *   - `select`: the selection rule, its colour test, its thresholds;
 *   - `quant`: the step by which the detail values are quantised (1:
 *     sent as they are), on the scale of the design's halved differences
 *     in both arithmetics; small details fall to zero, the rest is rebuilt
 *     at the middle of its interval;
 *   - `coding`: the detail values as bytes, in 4-bit codes with runs of
 *     zeros (`nibbles`);
 *   - `delta`: a selected pixel is sent as its difference from what the
 *     decoder holds — luma, colours and every detail it covers — in
 *     4-bit codes, where a small difference is one code and unchanged
 *     details a run. One bit a pixel says whole or difference: a pixel
 *     is whole on the first packet, when the selection sends it for
 *     refresh, and at least every two to three seconds — what repairs a
 *     lost packet must not lean on what the decoder may have lost. The
 *     pictures are those of the same options without it;
 *   - `hold` (with `delta`): a detail that differs from the one the
 *     decoder holds by no more than this threshold is left as it is — a
 *     difference of zero. A block is sent because one of its details
 *     moved; the others, which only carry the noise of the source, then
 *     cost nothing;
 *   - `smooth`: a luma or a colour of the base takes the value sent just
 *     before it when it differs by less than this (the design's optional
 *     loss): a few bytes saved, a banding for the eye;
 *   - `form`: the form of the geometry;
 *   - `detail`: also select a pixel of the base when a detail it covers
 *     differs from the one the decoder holds by more than a threshold —
 *     without it a change only the details show is missed;
 *   - `motion`: before the selection, look for one vector by which the
 *     whole picture (or tiles of it) moved against what the decoder
 *     holds, and say so in the packet; both ends move their pyramid by
 *     it, and only what came into view is left to send. A vector that is
 *     a multiple of 2^levels moves the pyramid as it is; any other
 *     rebuilds it from the moved picture.
 *
 * With `detail` or `motion` the encoder keeps the pyramid its decoder
 * holds, and `picture()` gives the picture that decoder shows.
 *
 * The vector is an option because it has a price: a decoder that misses
 * a packet carrying a move holds a picture out of place, and every later
 * move keeps it there (measured, row V13: one lost packet on a scrolling
 * page costs 30 to 48 dB until the content has left the screen). Two
 * things bound that price:
 *   - the **position**: with a vector, every packet says where the
 *     picture stands (the sum of the vectors so far, two bytes). A
 *     decoder that finds itself elsewhere moves by what it missed, at
 *     the next packet it receives. With tiles it moves the tiles of that
 *     packet, or of the last move it saw: a guess, right while the same
 *     area keeps moving. `motion.position: false` leaves it out;
 *   - the refresh of the selection, which then repairs what the lost
 *     packet carried — see `refresh: 'own'` in `video.select`.
 * Where the tolerance to lost packets comes first, leave the vector off.
 *
 * Base unit: `[header][flags]`, then with a position `[x][y]` (modulo
 * 256), then with a move `[dx][dy][tile / 8][one bit a tile…]`, then the
 * geometry and the lumas. Flags: 1 a move, 2 exact, 4 a position, 8 one
 * more byte before the move: the coding (high half) and the exponent of
 * the step (low three bits); 16 the encoder wishes the decoder's
 * colour smoothing; 32 differences: after the geometry one bit a
 * selected pixel (1: whole), then the lumas, the colours and the details
 * as 4-bit bands of differences.
 *
 * Presets are starting points, as on the audio side; every option stays
 * an option:
 *
 *   quality    exact pyramid, step 2             camera content
 *   standard   exact pyramid, step 4             camera content, fewer bytes
 *   economy    standard with higher selection    fewer bytes: small changes
 *              thresholds, 15 frames a second    are not sent, half the frames
 *   low        economy on a picture reduced by 2
 *   minimal    low at 10 frames a second         the least bytes
 *   screen     exact pyramid, step 2, the frame  screens and documents
 *              vector with its position
 *
 * An encoder is given the size and the rate of its **source**. With
 * `reduce` it codes a picture reduced by a whole number, with `maxFps` it
 * skips frames so that the coded rate stays under a limit; `encoder.coded`
 * says the size and the rate it codes, which is what a decoder is
 * created with. Enlarging the decoded picture is the display's business.
 *
 * The design's strips and repetitions (`video.strips`) were measured in
 * row V9b and lost to the two stages above: they are not an option here.
 * The base (luma and colour of the smallest picture) is sent as it is.
 */

import { colorModule } from '../color/color.js';
import { haarModule } from '../haar/haar.js';
import { selectModule } from '../select/select.js';
import { packModule } from '../pack/pack.js';
import { motionModule } from '../motion/motion.js';
import { nibblesModule } from '../pack/nibbles.js';
import { postModule } from '../post/post.js';
import { reduceModule } from '../reduce/reduce.js';

/**
 * @typedef {object} VideoEncoderConfig
 * @property {number} width Of the source; once reduced, divisible by 2^levels.
 * @property {number} height
 * @property {number} fps Of the source.
 * @property {number} [reduce=1] Code a picture reduced by this whole number.
 * @property {number} [maxFps] Skip frames so that the coded rate does not exceed this.
 * @property {number} [levels=2] Passes of the pyramid, 1 to 6.
 * @property {boolean} [diagonal=false] Keep the diagonal band.
 * @property {boolean} [exact=false] The exact pyramid: differences kept whole, two bytes a detail value.
 * @property {number} [quant=1] Quantisation step of the detail values, a power of two up to 64.
 * @property {'quality'|'standard'|'economy'|'low'|'minimal'|'screen'} [preset] A starting point; the options given win over it.
 * @property {'bytes'|'nibbles'} [coding='bytes'] Coding of the detail values.
 * @property {boolean} [delta=false] Send the selected pixels as differences from what the decoder holds. Needs the `reference` rule.
 * @property {number} [hold=0] With `delta`: threshold under which a detail is left as the decoder holds it, on the scale of `detail`; 0: off.
 * @property {((rgba: Uint8ClampedArray) => import('../haar/haar.js').HaarPyramid)|null} [analyse=null] A front end that gives the exact pyramid of a frame in place of the CPU kernels — the GPU's, `video.gl.analyse`. Needs `exact`; not with `motion` or `reduce` yet.
 * @property {boolean} [post=false] Wish the decoder's colour smoothing (one flag of the stream).
 * @property {number} [smooth=0] Threshold of the smoothing of the base values; 0: off.
 * @property {object} [select] Options of `video.select.create`; by default the `reference` rule with its colour test.
 * @property {number} [detail=0] Threshold of the detail test; 0: off.
 * @property {{ tile?: number, range?: number, threshold?: number, minChange?: number, position?: boolean }|null} [motion=null] Options of `video.motion.estimate`, and `position` (true by default: every packet says where the picture stands); null: no vector. Needs the `reference` rule.
 * @property {'auto'|'bits'|'runs'} [form='auto'] Form of the geometry.
 *
 * @typedef {object} VideoCodecApi
 * @property {(config: VideoEncoderConfig) => { push: (rgba: Uint8ClampedArray) => Uint8Array[], picture: () => Uint8ClampedArray, coded: { width: number, height: number, fps: number } }} createEncoder `push` takes a frame of the source and gives no packet for a frame it skips; `picture` is at the coded size.
 * @property {(config: { width: number, height: number, post?: import('../post/post.js').PostMode|{ mode: import('../post/post.js').PostMode, passes?: number }, present?: (pyramid: import('../haar/haar.js').HaarPyramid, filter: { mode: string, passes?: number }|null) => void }) => { push: (packet: Uint8Array) => Uint8ClampedArray|null }} createDecoder The picture returned is reused at the next call; with `present` the decoder computes no picture, hands its pyramid and the filter to apply to that function (the GPU's `video.gl.render`) and returns null; `post` is the restoration filter: by default what the stream wishes (the colour smoothing, or none).
 * @property {(packet: Uint8Array) => { levels: number, diagonal: boolean, exact: boolean, units: number[], move: { dx: number, dy: number, tile: number }|null, position: { x: number, y: number }|null, quant: number, coding: 'bytes'|'nibbles', post: boolean, delta: boolean }} describe
 * @property {Record<string, object>} presets
 */

export const codecModule = {
    name: 'video.codec',
    version: '0.14.1',
    type: 'lib.media.video',
    dependencies: ['video.color', 'video.haar', 'video.select', 'video.pack', 'video.motion', 'video.nibbles', 'video.post', 'video.reduce'],
    deps: [colorModule, haarModule, selectModule, packModule, motionModule, nibblesModule, postModule, reduceModule],

    /**
     * @param {import('../color/color.js').ColorApi} color
     * @param {import('../haar/haar.js').HaarApi} haar
     * @param {import('../select/select.js').SelectApi} select
     * @param {import('../pack/pack.js').PackApi} pack
     * @param {import('../motion/motion.js').MotionApi} motion
     * @param {import('../pack/nibbles.js').VideoNibblesApi} nibbles
     * @param {import('../post/post.js').PostApi} post
     * @param {import('../reduce/reduce.js').ReduceApi} reduction
     * @returns {VideoCodecApi}
     */
    factory(color, haar, select, pack, motion, nibbles, post, reduction) {
        const VERSION = 2;
        const NEUTRAL = 127;
        const MALFORMED = 'video.codec: malformed packet';
        const bandsOf = (diagonal) => (diagonal ? ['gx', 'hy', 'gy'] : ['gx', 'hy']);

        /** The pyramid a decoder holds before anything came: grey, no detail. */
        function emptyState(width, height, levels, diagonal, exact) {
            const bw = width >> levels;
            const bh = height >> levels;
            const n = bw * bh;
            return {
                width, height, levels, diagonal, exact, bw, bh, n,
                // What a detail is worth when it did not come.
                neutral: exact ? 0 : NEUTRAL,
                names: bandsOf(diagonal),
                base: [new Uint8ClampedArray(n).fill(NEUTRAL), new Uint8ClampedArray(n), new Uint8ClampedArray(n).fill(NEUTRAL)],
                list: Array.from({ length: levels }, (_, k) => {
                    const size = (bw << k) * (bh << k);
                    const band = () => (exact ? new Int16Array(size) : new Uint8ClampedArray(size).fill(NEUTRAL));
                    const bands = { gx: band(), hy: band(), gy: diagonal ? band() : null };
                    return { width: bw << k, height: bh << k, planes: [null, bands, null] };
                }),
            };
        }

        /** The picture of a state, into `out`. */
        function render(state, out) {
            return color.inverse(haar.inverse({ width: state.width, height: state.height, exact: state.exact, base: state.base, levels: state.list }), out);
        }

        /**
         * Moves a state by a vector — the same steps on both ends.
         * @param {ReturnType<typeof emptyState>} state
         * @param {import('../motion/motion.js').Move} move
         */
        function moveState(state, move) {
            const { levels, width, height } = state;
            const unit = 1 << levels;
            if (move.dx % unit === 0 && move.dy % unit === 0 && move.tile % unit === 0) {
                // The pyramid moves as it is: each plane by the vector at its own scale.
                const at = (scale) => ({ moved: true, dx: (move.dx / unit) * scale, dy: (move.dy / unit) * scale, tile: (move.tile / unit) * scale, tiles: move.tiles });
                state.base = state.base.map((plane) => motion.apply(plane, state.bw, state.bh, at(1)));
                state.list.forEach((level, k) => {
                    const bands = level.planes[1];
                    for (const name of state.names) bands[name] = motion.apply(bands[name], level.width, level.height, at(1 << k));
                });
                return;
            }
            // Any other vector: move the picture's planes, then take their pyramid again.
            const planes = haar.inverse({ width, height, exact: state.exact, base: state.base, levels: state.list }).map((plane) => motion.apply(plane, width, height, move));
            const pyramid = haar.forward(planes, width, height, { levels, diagonal: state.diagonal, exact: state.exact });
            state.base = pyramid.base;
            pyramid.levels.forEach((level, k) => { state.list[k].planes[1] = level.planes[1]; });
        }

        /**
         * Writes the content of a packet into a state.
         * @param {ReturnType<typeof emptyState>} state
         * @param {Uint8Array} mask
         * @param {number} selected
         * @param {(at: number) => number} lumaAt
         * @param {Uint8Array|undefined} colour
         * @param {(Uint8Array|Int16Array|undefined)[]} details The detail values of each level.
         */
        function write(state, mask, selected, lumaAt, colour, details) {
            const { bw, n, names, base, list, levels } = state;
            let at = 0;
            for (let i = 0; i < n; i++) {
                if (!mask[i]) continue;
                base[1][i] = lumaAt(at);
                // Without its colour a new pixel is grey: an old colour under a new luma would be wrong.
                base[0][i] = colour ? colour[at] : NEUTRAL;
                base[2][i] = colour ? colour[selected + at] : NEUTRAL;
                at++;
            }
            for (let k = 0; k < levels; k++) {
                const side = 1 << k;
                const lw = bw << k;
                const bytes = details[k];
                let from = 0;
                for (const name of names) {
                    const plane = list[k].planes[1][name];
                    for (let i = 0; i < n; i++) {
                        if (!mask[i]) continue;
                        const bx = i % bw;
                        const by = (i - bx) / bw;
                        for (let dy = 0; dy < side; dy++) {
                            const row = (by * side + dy) * lw + bx * side;
                            // A level that did not come is neutral where the base changed.
                            for (let dx = 0; dx < side; dx++) plane[row + dx] = bytes ? bytes[from++] : state.neutral;
                        }
                    }
                }
            }
        }

        /**
         * Whole differences as bytes: sign folded into the low bit, the low bytes then the high bytes —
         * the high ones are nearly all zero, which the lossless stage removes.
         * @param {Int16Array} values
         * @returns {Uint8Array}
         */
        function wide(values) {
            const m = values.length;
            const bytes = new Uint8Array(2 * m);
            for (let j = 0; j < m; j++) {
                const v = values[j];
                const u = v < 0 ? -2 * v - 1 : 2 * v;
                bytes[j] = u & 0xff;
                bytes[m + j] = u >> 8;
            }
            return bytes;
        }

        /** The inverse of `wide`. */
        function narrow(bytes) {
            const m = bytes.length >> 1;
            const values = new Int16Array(m);
            for (let j = 0; j < m; j++) {
                const u = bytes[j] | (bytes[m + j] << 8);
                values[j] = u & 1 ? -((u + 1) >> 1) : u >> 1;
            }
            return values;
        }

        const CODINGS = ['bytes', 'nibbles'];
        /** The rule the lane's bench and the owner's eye retained (row V11). */
        const REFERENCE = { rule: 'reference', chroma: true };
        const ECONOMY = { levels: 2, diagonal: true, exact: true, quant: 4, coding: 'nibbles', detail: 8, select: { ...REFERENCE, thresholds: [[6, 6], [6, 6], [7, 7], [7, 7], [8, 8]] }, post: true };
        // A scrolled document (a real capture, row V17): little of a white page changes, and a wheel step
        // moves it by 32 to 96 pixels a frame — search from 2 % of change, as far as a vector can say.
        const SCROLL = { tile: 32, range: 127, minChange: 0.02 };
        const PRESETS = {
            quality: { levels: 2, diagonal: true, exact: true, quant: 2, coding: 'nibbles', detail: 4, select: REFERENCE, post: true },
            standard: { levels: 2, diagonal: true, exact: true, quant: 4, coding: 'nibbles', detail: 4, select: REFERENCE, post: true },
            // On real video a coarser step was graded too degraded; higher thresholds were graded good (D14).
            // The economy side then spends fewer frames, then a smaller picture (row V16).
            economy: { ...ECONOMY, maxFps: 15 },
            low: { ...ECONOMY, maxFps: 15, reduce: 2 },
            minimal: { ...ECONOMY, maxFps: 10, reduce: 2 },
            screen: { levels: 2, diagonal: true, exact: true, quant: 2, coding: 'nibbles', detail: 4, select: REFERENCE, motion: SCROLL, post: false },
        };
        /** The filter a stream wishes. */
        const WISHED = { mode: 'chroma', passes: 1 };

        /** The shift that quantises a band: whole differences are two (gx, hy) and four (gy) times the design's. */
        const shiftOf = (e, exact, name) => (e === 0 ? 0 : e + (exact ? (name === 'gy' ? 2 : 1) : 0));

        /** The code of a centred value under a shift: towards zero. */
        const quantise = (c, shift) => (c < 0 ? -(-c >> shift) : c >> shift);

        /** A band of integers in 4-bit codes. */
        const toBand = (codes) => {
            const list = [];
            nibbles.put(list, codes);
            return Uint8Array.from(list);
        };

        /**
         * `count` integers from a 4-bit band at `bytes[at…]`, which must end the unit.
         * @throws {RangeError} On a band cut short or followed by something.
         */
        const fromBand = (bytes, at, count) => {
            const codes = new Int32Array(count);
            let end;
            try {
                end = nibbles.read(bytes, at, codes);
            } catch {
                throw new RangeError(MALFORMED);
            }
            if (end !== bytes.length) throw new RangeError(MALFORMED);
            return codes;
        };

        /**
         * Delta mode, decoder: the detail values of a level from the differences received, in the order `write` reads them.
         * @param {ReturnType<typeof emptyState>} state What the decoder holds, not yet written.
         * @param {Uint8Array} mask
         * @param {Uint8Array} whole One flag a selected pixel: its values are whole, not differences.
         * @param {number} k Level.
         * @param {Int32Array|null} codes The band of the level; null when the unit did not come.
         * @param {number} e Exponent of the step.
         */
        function deltaDetails(state, mask, whole, k, codes, e) {
            const { bw, n, names, exact } = state;
            const side = 1 << k;
            const lw = bw << k;
            let selected = 0;
            for (let i = 0; i < n; i++) if (mask[i]) selected++;
            const values = exact ? new Int16Array(selected * side * side * names.length) : new Uint8ClampedArray(selected * side * side * names.length);
            const offset = exact ? 0 : NEUTRAL;
            let to = 0;
            for (const name of names) {
                const plane = state.list[k].planes[1][name];
                const shift = shiftOf(e, exact, name);
                let j = 0;
                for (let i = 0; i < n; i++) {
                    if (!mask[i]) continue;
                    const full = whole[j++];
                    const bx = i % bw;
                    const by = (i - bx) / bw;
                    for (let dy = 0; dy < side; dy++) {
                        const row = (by * side + dy) * lw + bx * side;
                        for (let dx = 0; dx < side; dx++) {
                            const held = plane[row + dx];
                            // A level that did not come: a difference pixel keeps what is held, a whole one is neutral.
                            if (!codes) values[to++] = full ? state.neutral : held;
                            else {
                                const q = full ? codes[to] : codes[to] + quantise(held - offset, shift);
                                values[to++] = restore(q, shift) + offset;
                            }
                        }
                    }
                }
            }
            return values;
        }

        /** The value a quantised code stands for: the middle of its interval, zero for zero. */
        const restore = (q, shift) => {
            if (q === 0 || shift === 0) return q;
            const half = 1 << (shift - 1);
            return q < 0 ? -((-q << shift) + half) : (q << shift) + half;
        };

        /**
         * The detail values of a level, from its unit.
         * @param {Uint8Array} bytes
         * @param {number} total Values expected: every band of every selected block.
         * @param {{ names: string[], exact: boolean }} state
         * @param {number} e Exponent of the step.
         * @param {number} coding Index in `CODINGS`.
         * @returns {Uint8Array|Int16Array}
         * @throws {RangeError} On a unit of the wrong size.
         */
        function readDetails(bytes, total, state, e, coding) {
            const { names, exact } = state;
            if (coding === 0 && e === 0) {
                if (bytes.length !== total * (exact ? 2 : 1)) throw new RangeError(MALFORMED);
                return exact ? narrow(bytes) : bytes;
            }
            let codes;
            if (coding === 1) {
                codes = new Int32Array(total);
                let end;
                try {
                    end = nibbles.read(bytes, 0, codes);
                } catch {
                    throw new RangeError(MALFORMED);
                }
                if (end !== bytes.length) throw new RangeError(MALFORMED);
            } else if (exact) {
                if (bytes.length !== total * 2) throw new RangeError(MALFORMED);
                codes = narrow(bytes);
            } else {
                if (bytes.length !== total) throw new RangeError(MALFORMED);
                codes = Int16Array.from(bytes, (byte) => byte - NEUTRAL);
            }
            const values = exact ? new Int16Array(total) : new Uint8ClampedArray(total);
            const each = total / names.length;
            names.forEach((name, k) => {
                const shift = shiftOf(e, exact, name);
                for (let j = k * each; j < (k + 1) * each; j++) values[j] = restore(codes[j], shift) + (exact ? 0 : NEUTRAL);
            });
            return values;
        }

        /** @throws {RangeError} On an unknown preset or a bad configuration. */
        function createEncoder({ preset, ...given }) {
            if (preset !== undefined && !Object.hasOwn(PRESETS, preset)) throw new RangeError(`video.codec: preset ${preset}`);
            // An option given as undefined is an option not given.
            const stated = Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined));
            const { width, height, fps, reduce: factor = 1, maxFps, ...options } = { ...(preset ? PRESETS[preset] : {}), ...stated };
            if (!Number.isInteger(factor) || factor < 1) throw new RangeError(`video.codec: reduce ${factor}`);
            if (maxFps !== undefined && !(maxFps > 0)) throw new RangeError(`video.codec: maxFps ${maxFps}`);
            if (width % factor !== 0 || height % factor !== 0) throw new RangeError(`video.codec: ${width}x${height} does not divide by ${factor}`);
            // One frame in `every`, so that the coded rate does not exceed the limit.
            const every = maxFps === undefined ? 1 : Math.max(1, Math.ceil(fps / maxFps - 1e-9));
            const coded = { width: width / factor, height: height / factor, fps: fps / every };
            if (options.analyse && factor !== 1) throw new RangeError('video.codec: a front end does not go with a reduced picture yet');
            const inner = build({ ...options, ...coded });
            let index = 0;
            return {
                coded,
                /** @throws {RangeError} When the frame has not the size of the source. */
                push(rgba) {
                    if (rgba.length !== width * height * 4) throw new RangeError(`video.codec: a frame of ${rgba.length} bytes, ${width * height * 4} expected`);
                    if (index++ % every !== 0) return [];
                    return inner.push(reduction.reduce(rgba, width, height, factor));
                },
                picture: () => inner.picture(),
            };
        }

        /** @throws {RangeError} On a bad configuration. */
        function build({ width, height, fps, levels = 2, diagonal = false, exact = false, quant = 1, coding = 'bytes', baseCoding, smooth = 0, select: rule = REFERENCE, detail = 0, motion: search = null, form = 'auto', post: wish = false, delta = false, hold = 0, analyse = null }) {
            if (!Number.isInteger(levels) || levels < 1 || levels > 6) throw new RangeError(`video.codec: levels ${levels}`);
            if (width % (1 << levels) !== 0 || height % (1 << levels) !== 0) throw new RangeError(`video.codec: ${width}x${height} does not divide by 2^${levels}`);
            if (!(detail >= 0)) throw new RangeError(`video.codec: detail ${detail}`);
            if (!Number.isInteger(quant) || quant < 1 || quant > 64 || (quant & (quant - 1)) !== 0) throw new RangeError(`video.codec: quant ${quant}`);
            if (!CODINGS.includes(coding)) throw new RangeError(`video.codec: coding ${coding}`);
            const e = Math.log2(quant);
            if (analyse !== null && (typeof analyse !== 'function' || !exact || search)) throw new RangeError('video.codec: a front end is a function, needs the exact pyramid, and does not go with the frame vector');
            if (delta && rule.rule !== 'reference') throw new RangeError('video.codec: delta needs the reference rule');
            if (!(hold >= 0) || (hold > 0 && !delta)) throw new RangeError(`video.codec: hold ${hold}${delta ? '' : ' without delta'}`);
            // Differences are always written in 4-bit codes.
            const coder = delta ? 1 : CODINGS.indexOf(coding);
            // The step and the coding are said in the packet only when they are not the plain ones.
            if (baseCoding !== undefined) throw new RangeError('video.codec: baseCoding is no longer an option (row V11)');
            if (!(smooth >= 0)) throw new RangeError(`video.codec: smooth ${smooth}`);
            const coded = e > 0 || coder > 0;
            if (search) {
                if (rule.rule !== 'reference') throw new RangeError('video.codec: a frame vector needs the reference rule');
                const tile = search.tile ?? 0;
                if (!Number.isInteger(tile) || tile < 0 || tile % 8 !== 0 || tile % (1 << levels) !== 0 || tile > 2040) throw new RangeError(`video.codec: tile ${tile}`);
            }
            const names = bandsOf(diagonal);
            const selector = select.create({ width: width >> levels, height: height >> levels, fps, ...rule });
            // The pyramid the decoder holds, when the encoder has to know it.
            const shadow = detail > 0 || search || delta ? emptyState(width, height, levels, diagonal, exact) : null;
            let opened = false;     // the decoder holds something to differ from
            // Delta mode: the frame each pixel last went whole, and how long it may go without.
            let lastWhole = delta ? new Int32Array(shadow.n) : null;
            const period = Math.round(2 * fps);
            const span = Math.max(1, Math.round(fps));
            let tick = 0;
            const { bw, n } = shadow ?? { bw: width >> levels, n: (width >> levels) * (height >> levels) };
            const header = (VERSION << 4) | (diagonal ? 8 : 0) | levels;
            // Where the picture stands: the sum of the vectors so far, modulo 256.
            const located = Boolean(search) && search.position !== false;
            let px = 0;
            let py = 0;
            // What the vectors moved that the base, at its scale, has not followed yet.
            const unit = 1 << levels;
            let carryX = 0;
            let carryY = 0;
            // `detail` is given on the scale of the design's halved differences: whole ones are two and four times larger.
            const reach = exact ? { gx: 2, hy: 2, gy: 4 } : { gx: 1, hy: 1, gy: 1 };
            let first = true;

            return {
                /** @throws {RangeError} When the frame has not the configured size. */
                push(rgba) {
                    if (rgba.length !== width * height * 4) throw new RangeError(`video.codec: a frame of ${rgba.length} bytes, ${width * height * 4} expected`);
                    // A front end (the GPU's, `video.gl.analyse`) gives the pyramid itself.
                    const planes = analyse ? null : color.forward(rgba);
                    tick++;
                    let move = null;
                    if (search && !first) {
                        const held = haar.inverse({ width, height, exact, base: shadow.base, levels: shadow.list })[1];
                        const found = motion.estimate(planes[1], held, width, height, search);
                        if (found.moved) {
                            move = found;
                            px = (px + found.dx) & 0xff;
                            py = (py + found.dy) & 0xff;
                            moveState(shadow, found);
                            // The keep delays belong to the content: they travel with it, by whole pixels of the base.
                            carryX += found.dx;
                            carryY += found.dy;
                            const bx = Math.trunc(carryX / unit);
                            const by = Math.trunc(carryY / unit);
                            if (bx !== 0 || by !== 0) {
                                carryX -= bx * unit;
                                carryY -= by * unit;
                                const small = { moved: true, dx: bx, dy: by, tile: found.tile / unit, tiles: found.tiles };
                                selector.remap((plane) => motion.apply(plane, bw, shadow.bh, small));
                                // So does the date each pixel last went whole.
                                if (lastWhole) lastWhole = motion.apply(lastWhole, bw, shadow.bh, small);
                            }
                            selector.adopt(shadow.base[1], [shadow.base[0], shadow.base[2]]);
                        }
                    }
                    first = false;
                    const pyramid = analyse ? analyse(rgba) : haar.forward(planes, width, height, { levels, diagonal, exact });
                    const [red, luma, blue] = pyramid.base;
                    const result = selector.push(luma, [red, blue]);
                    const mask = result.mask;
                    let count = result.count;
                    if (detail > 0) {
                        // A pixel of the base is also sent when a detail it covers moved away from the one the decoder holds.
                        // One straight pass a band, in reading order; a pixel of the base already sent is skipped (row B3c:
                        // the same mask as a search pixel by pixel, without its divisions and nested loops).
                        const bh = n / bw;
                        for (let k = 0; k < levels; k++) {
                            const lw = bw << k;
                            const lh = bh << k;
                            for (const name of names) {
                                const plane = pyramid.levels[k].planes[1][name];
                                const old = shadow.list[k].planes[1][name];
                                // What the decoder holds is off by up to a step: the quantiser's own rounding, on top of the threshold.
                                const limit = detail * reach[name] + (e > 0 ? 1 << shiftOf(e, exact, name) : 0);
                                for (let y = 0; y < lh; y++) {
                                    const row = y * lw;
                                    const baseRow = (y >> k) * bw;
                                    for (let x = 0; x < lw; x++) {
                                        const i = baseRow + (x >> k);
                                        if (mask[i]) continue;
                                        let d = plane[row + x] - old[row + x];
                                        if (d < 0) d = -d;
                                        if (d > limit) { mask[i] = 1; count++; }
                                    }
                                }
                            }
                        }
                    }
                    if (count === 0 && !move) return [];
                    const geometry = pack.encodeMask(mask, form);
                    const tileBytes = move && move.tiles ? (move.tiles.length + 7) >> 3 : 0;
                    const head = 2 + (located ? 2 : 0) + (coded ? 1 : 0);
                    const start = head + (move ? 3 + tileBytes : 0);
                    // The lumas and the colours of the selected pixels, in reading order.
                    const lumas = new Uint8Array(count);
                    const colour = new Uint8Array(2 * count);
                    let at = 0;
                    for (let i = 0; i < n; i++) {
                        if (!mask[i]) continue;
                        lumas[at] = luma[i];
                        colour[at] = red[i];
                        colour[count + at] = blue[i];
                        at++;
                    }
                    if (smooth > 0) {
                        // A value takes the one sent just before it when they are this close.
                        for (const [table, from, to] of [[lumas, 0, count], [colour, 0, count], [colour, count, 2 * count]]) {
                            for (let j = from + 1; j < to; j++) {
                                let d = table[j] - table[j - 1];
                                if (d < 0) d = -d;
                                if (d < smooth) table[j] = table[j - 1];
                            }
                        }
                    }
                    // Delta mode: which selected pixels go whole, and the differences of the others from what the decoder holds.
                    let whole = null;
                    let lumaBytes = lumas;
                    let colourBytes = colour;
                    if (delta) {
                        whole = new Uint8Array(count);
                        const lumaCodes = new Int32Array(count);
                        const colourCodes = new Int32Array(2 * count);
                        const bits = new Uint8Array((count + 7) >> 3);
                        const before = [NEUTRAL, 128, NEUTRAL];     // the last whole red, luma, blue of this packet
                        let j = 0;
                        for (let i = 0; i < n; i++) {
                            if (!mask[i]) continue;
                            // Whole on the first packet, at a refresh, and at least every two to three seconds:
                            // a pixel that keeps changing is never due for refresh, and would never be repaired.
                            const full = !opened || result.due[i] === 1 || tick - lastWhole[i] >= period + (i % span);
                            if (full) {
                                whole[j] = 1;
                                bits[j >> 3] |= 1 << (j & 7);
                                lastWhole[i] = tick;
                            }
                            // A whole value is written against the whole value before it in the packet (neighbours look
                            // alike) — never against a difference pixel, whose value leans on what the decoder holds.
                            lumaCodes[j] = lumas[j] - (full ? before[1] : shadow.base[1][i]);
                            colourCodes[j] = colour[j] - (full ? before[0] : shadow.base[0][i]);
                            colourCodes[count + j] = colour[count + j] - (full ? before[2] : shadow.base[2][i]);
                            if (full) {
                                before[0] = colour[j];
                                before[1] = lumas[j];
                                before[2] = colour[count + j];
                            }
                            j++;
                        }
                        const band = toBand(lumaCodes);
                        lumaBytes = new Uint8Array(bits.length + band.length);
                        lumaBytes.set(bits);
                        lumaBytes.set(band, bits.length);
                        colourBytes = toBand(colourCodes);
                    }
                    const base = new Uint8Array(start + geometry.length + lumaBytes.length);
                    base[0] = header;
                    base[1] = (move ? 1 : 0) | (exact ? 2 : 0) | (located ? 4 : 0) | (coded ? 8 : 0) | (wish ? 16 : 0) | (delta ? 32 : 0);
                    if (coded) base[head - 1] = (coder << 4) | e;
                    if (located) {
                        base[2] = px;
                        base[3] = py;
                    }
                    if (move) {
                        base[head] = move.dx & 0xff;
                        base[head + 1] = move.dy & 0xff;
                        base[head + 2] = move.tile >> 3;
                        if (move.tiles) move.tiles.forEach((flag, k) => { if (flag) base[head + 3 + (k >> 3)] |= 1 << (k & 7); });
                    }
                    base.set(geometry, start);
                    base.set(lumaBytes, start + geometry.length);
                    const units = [{ type: pack.types.BASE, bytes: base }, { type: pack.types.COLOUR, bytes: colourBytes }];
                    const details = [];
                    for (let k = 0; k < levels; k++) {
                        const side = 1 << k;
                        const lw = bw << k;
                        const total = count * side * side * names.length;
                        // What the decoder will hold, and when quantised or coded, the codes that say it.
                        const values = exact ? new Int16Array(total) : new Uint8ClampedArray(total);
                        const codes = coded ? new Int32Array(total) : null;
                        let to = 0;
                        for (const name of names) {
                            const plane = pyramid.levels[k].planes[1][name];
                            const heldPlane = delta ? shadow.list[k].planes[1][name] : null;
                            const offset = exact ? 0 : NEUTRAL;
                            const shift = shiftOf(e, exact, name);
                            let j = 0;
                            for (let i = 0; i < n; i++) {
                                if (!mask[i]) continue;
                                const differ = delta && !whole[j];
                                j++;
                                const bx = i % bw;
                                const by = (i - bx) / bw;
                                for (let dy = 0; dy < side; dy++) {
                                    const row = (by * side + dy) * lw + bx * side;
                                    for (let dx = 0; dx < side; dx++) {
                                        const v = plane[row + dx];
                                        if (codes) {
                                            const q = quantise(v - offset, shift);
                                            if (differ) {
                                                // The decoder rebuilds the code from what it holds plus this difference.
                                                const heldCode = quantise(heldPlane[row + dx] - offset, shift);
                                                let d = v - heldPlane[row + dx];
                                                if (d < 0) d = -d;
                                                // Held: a detail that has not really moved is left as the decoder has it.
                                                const kept = hold > 0 && d <= hold * reach[name] + (e > 0 ? 1 << shift : 0);
                                                values[to] = restore(kept ? heldCode : q, shift) + offset;
                                                codes[to++] = kept ? 0 : q - heldCode;
                                            } else {
                                                values[to] = restore(q, shift) + offset;
                                                codes[to++] = q;
                                            }
                                        } else values[to++] = v;
                                    }
                                }
                            }
                        }
                        details.push(values);
                        let bytes;
                        if (!codes) bytes = exact ? wide(values) : values;
                        else if (coder === 1) {
                            const list = [];
                            nibbles.put(list, codes);
                            bytes = Uint8Array.from(list);
                        } else bytes = exact ? wide(Int16Array.from(codes)) : Uint8Array.from(codes, (q) => q + NEUTRAL);
                        units.push({ type: pack.types.DETAIL + k, bytes });
                    }
                    if (shadow) write(shadow, mask, count, (j) => lumas[j], colour, details);
                    opened = true;
                    return [pack.writeUnits(units)];

                },
                /**
                 * The picture a decoder that received every packet shows.
                 * @returns {Uint8ClampedArray} A new picture.
                 * @throws {Error} Without `detail` or `motion`: the encoder then keeps no pyramid.
                 */
                picture() {
                    if (!shadow) throw new Error('video.codec: picture() needs the detail or the motion option');
                    return render(shadow);
                },
            };
        }

        /**
         * Reads the base unit of a packet.
         * @param {Uint8Array} packet
         * @throws {RangeError} When the packet has no base unit, an unknown version, or a move cut short.
         */
        function open(packet) {
            const units = new Map(pack.readUnits(packet).map((unit) => [unit.type, unit.bytes]));
            const base = units.get(pack.types.BASE);
            if (!base || base.length < 3 || base[0] >> 4 !== VERSION) throw new RangeError(MALFORMED);
            const levels = base[0] & 7;
            if (levels < 1 || levels > 6 || base[1] > 63) throw new RangeError(MALFORMED);
            const located = (base[1] & 4) !== 0;
            const coded = (base[1] & 8) !== 0;
            // Where the move, or the geometry, starts.
            const at = 2 + (located ? 2 : 0) + (coded ? 1 : 0);
            if (base.length < at) throw new RangeError(MALFORMED);
            const e = coded ? base[at - 1] & 7 : 0;
            const coding = coded ? base[at - 1] >> 4 : 0;
            // Bit 8 and coding 2 were the strips of row V9b: no longer read.
            if (e > 6 || coding >= CODINGS.length || (coded && (base[at - 1] & 8) !== 0)) throw new RangeError(MALFORMED);
            return { units, base, levels, diagonal: (base[0] & 8) !== 0, hasMove: (base[1] & 1) !== 0, exact: (base[1] & 2) !== 0, located, at, e, coding, wished: (base[1] & 16) !== 0, delta: (base[1] & 32) !== 0 };
        }

        /**
         * Reads the move of a base unit.
         * @returns {{ move: import('../motion/motion.js').Move|null, start: number }}
         */
        function readMove(base, hasMove, at, width, height) {
            if (!hasMove) return { move: null, start: at };
            if (base.length < at + 3) throw new RangeError(MALFORMED);
            const tile = base[at + 2] << 3;
            const count = tile ? Math.ceil(width / tile) * Math.ceil(height / tile) : 0;
            const start = at + 3 + ((count + 7) >> 3);
            if (base.length < start) throw new RangeError(MALFORMED);
            const tiles = tile ? Uint8Array.from({ length: count }, (_, k) => (base[at + 3 + (k >> 3)] >> (k & 7)) & 1) : null;
            return { move: { moved: true, dx: (base[at] << 24) >> 24, dy: (base[at + 1] << 24) >> 24, tile, tiles }, start };
        }

        function describe(packet) {
            const { units, base, levels, diagonal, hasMove, exact, located, at, e, coding, wished, delta } = open(packet);
            const move = hasMove && base.length >= at + 3 ? { dx: (base[at] << 24) >> 24, dy: (base[at + 1] << 24) >> 24, tile: base[at + 2] << 3 } : null;
            return { levels, diagonal, exact, units: [...units.keys()], move, position: located ? { x: base[2], y: base[3] } : null, quant: 1 << e, coding: CODINGS[coding], post: wished, delta };
        }

        function createDecoder({ width, height, post: filter, present = null }) {
            if (present !== null && typeof present !== 'function') throw new RangeError('video.codec: present is a function');
            // Given a filter, the decoder uses it; given none, it follows the wish of the stream.
            const chosen = filter === undefined ? null : typeof filter === 'string' ? { mode: filter } : filter;
            if (chosen && !post.modes.includes(chosen.mode)) throw new RangeError(`video.codec: post ${chosen.mode}`);
            let state = null;       // built from the first packet: the stream says its levels and bands
            const picture = new Uint8ClampedArray(width * height * 4);
            // Where this decoder's picture stands, and the tiles of the last move it saw.
            let px = 0;
            let py = 0;
            let last = { tile: 0, tiles: null };

            return {
                /** @throws {RangeError} On a malformed packet, or one that does not fit the picture. */
                push(packet) {
                    const { units, base, levels, diagonal, hasMove, exact, located, at, e, coding, wished, delta } = open(packet);
                    let held = true;        // this decoder holds a picture the position can be checked against
                    if (!state || state.levels !== levels || state.diagonal !== diagonal || state.exact !== exact) {
                        if (width % (1 << levels) !== 0 || height % (1 << levels) !== 0) throw new RangeError(MALFORMED);
                        state = emptyState(width, height, levels, diagonal, exact);
                        held = false;
                    }
                    const { move, start } = readMove(base, hasMove, at, width, height);
                    if (located) {
                        // What the stream moved by that this decoder did not see: packets were lost.
                        const mx = ((base[2] - px - (move ? move.dx : 0)) << 24) >> 24;
                        const my = ((base[3] - py - (move ? move.dy : 0)) << 24) >> 24;
                        if (held && (mx !== 0 || my !== 0)) {
                            const like = move ?? last;
                            moveState(state, { moved: true, dx: mx, dy: my, tile: like.tile, tiles: like.tiles });
                        }
                        px = base[2];
                        py = base[3];
                    }
                    if (move) {
                        moveState(state, move);
                        last = move;
                    }
                    const { mask, selected, end } = pack.decodeMask(base, start, state.n);
                    let lumas;
                    let colour = units.get(pack.types.COLOUR);
                    const details = [];
                    if (delta) {
                        // One bit a selected pixel, then the bands of differences from what this decoder holds.
                        const bitBytes = (selected + 7) >> 3;
                        if (end + bitBytes > base.length) throw new RangeError(MALFORMED);
                        const lumaCodes = selected > 0 ? fromBand(base, end + bitBytes, selected) : new Int32Array(0);
                        const colourCodes = colour ? fromBand(colour, 0, 2 * selected) : null;
                        const whole = new Uint8Array(selected);
                        lumas = new Uint8ClampedArray(selected);
                        colour = new Uint8ClampedArray(2 * selected);
                        const before = [NEUTRAL, 128, NEUTRAL];
                        let j = 0;
                        for (let i = 0; i < state.n; i++) {
                            if (!mask[i]) continue;
                            const full = (base[end + (j >> 3)] >> (j & 7)) & 1;
                            whole[j] = full;
                            // A whole value was written against the whole value before it in the packet.
                            lumas[j] = lumaCodes[j] + (full ? before[1] : state.base[1][i]);
                            if (full) before[1] = lumas[j];
                            // Without its colour unit a difference pixel keeps its colour, a whole one is grey.
                            if (colourCodes) {
                                colour[j] = colourCodes[j] + (full ? before[0] : state.base[0][i]);
                                colour[selected + j] = colourCodes[selected + j] + (full ? before[2] : state.base[2][i]);
                                if (full) {
                                    before[0] = colour[j];
                                    before[2] = colour[selected + j];
                                }
                            } else {
                                colour[j] = full ? NEUTRAL : state.base[0][i];
                                colour[selected + j] = full ? NEUTRAL : state.base[2][i];
                            }
                            j++;
                        }
                        for (let k = 0; k < levels; k++) {
                            const bytes = units.get(pack.types.DETAIL + k);
                            const total = selected * (1 << k) * (1 << k) * state.names.length;
                            details.push(deltaDetails(state, mask, whole, k, bytes ? (total > 0 ? fromBand(bytes, 0, total) : new Int32Array(0)) : null, e));
                        }
                    } else {
                        if (end + selected !== base.length) throw new RangeError(MALFORMED);
                        lumas = base.subarray(end);
                        if (colour && colour.length !== 2 * selected) throw new RangeError(MALFORMED);
                        for (let k = 0; k < levels; k++) {
                            const bytes = units.get(pack.types.DETAIL + k);
                            details.push(bytes ? readDetails(bytes, selected * (1 << k) * (1 << k) * state.names.length, state, e, coding) : undefined);
                        }
                    }
                    write(state, mask, selected, (j) => lumas[j], colour, details);
                    const restoration = chosen ?? (wished ? WISHED : null);
                    const filtering = restoration && restoration.mode !== 'none' ? restoration : null;
                    if (present) {
                        // The picture is someone else's to make — the GPU's, `video.gl.render`.
                        present({ width, height, exact: state.exact, base: state.base, levels: state.list }, filtering);
                        return null;
                    }
                    if (!filtering) return render(state, picture);
                    const planes = haar.inverse({ width, height, exact: state.exact, base: state.base, levels: state.list });
                    return color.inverse(post.apply(planes, width, height, restoration), picture);
                },
            };
        }

        return { presets: PRESETS, createEncoder, createDecoder, describe };
    },
};
