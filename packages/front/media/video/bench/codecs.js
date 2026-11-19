// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The codecs the bench runs, in table order. The three
 * references come first; each Track A row appends its candidates here.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../src/main.js';
import { identity, rgb555, hold4 } from './lib/reference.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const color = runtime.resolve('video.color');
const haar = runtime.resolve('video.haar');
const select = runtime.resolve('video.select');
const pack = runtime.resolve('video.pack');
const codec = runtime.resolve('video.codec');
const motion = runtime.resolve('video.motion');

/** The explored selection rule, with its colour test. */
const REF = { rule: 'reference', chroma: true };

/**
 * Every frame on its own: the colour approximation, then the pyramid,
 * every kept band written as it is. No selection of changed pixels yet:
 * what the transforms cost and what the lossless stage makes of them.
 *
 * @param {string} name
 * @param {{ levels: number, diagonal?: boolean, chroma?: 'base'|'all' }|null} options null: the colour planes alone.
 */
function intra(name, options) {
    return {
        name,
        createEncoder: ({ width, height }) => ({
            push(frame) {
                const planes = color.forward(frame);
                if (!options) return [Uint8Array.from([...planes[0], ...planes[1], ...planes[2]])];
                const pyramid = haar.forward(planes, width, height, options);
                const parts = [...pyramid.base];
                for (const level of pyramid.levels) {
                    for (const bands of level.planes) if (bands) parts.push(bands.gx, bands.hy, ...(bands.gy ? [bands.gy] : []));
                }
                const packet = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
                let at = 0;
                for (const part of parts) { packet.set(part, at); at += part.length; }
                return [packet];
            },
        }),
        createDecoder: ({ width, height }) => ({
            push(packet) {
                let at = 0;
                const take = (length) => new Uint8ClampedArray(packet.subarray(at, (at += length)));
                if (!options) {
                    const n = width * height;
                    return color.inverse([take(n), take(n), take(n)]);
                }
                const { levels, diagonal = false, chroma = 'base' } = options;
                const small = (width >> levels) * (height >> levels);
                const base = [take(small), take(small), take(small)];
                const list = [];
                for (let k = levels; k >= 1; k--) {
                    const w = width >> k;
                    const h = height >> k;
                    list.push({
                        width: w,
                        height: h,
                        planes: [0, 1, 2].map((index) => (index === 1 || chroma === 'all' ? { gx: take(w * h), hy: take(w * h), gy: diagonal ? take(w * h) : null } : null)),
                    });
                }
                return color.inverse(haar.inverse({ width, height, base, levels: list }));
            },
        }),
    };
}

/**
 * Conditional replenishment at full size, without the pyramid: the
 * colour approximation, the selection of changed pixels on the luma,
 * and for each selected pixel its three bytes. A packet is a bitmask of
 * one bit a pixel, then the red differences, the lumas and the blue
 * differences of the selected pixels. Nothing selected: no packet.
 *
 * @param {string} name
 * @param {object} [rule] Options of `video.select.create`: the rule, its colour test, its thresholds.
 */
function replenish(name, rule = {}) {
    return {
        name,
        createEncoder: ({ width, height, fps }) => {
            const selector = select.create({ width, height, fps, ...rule });
            const n = width * height;
            return {
                push(frame) {
                    const planes = color.forward(frame);
                    const { mask, count } = selector.push(planes[1], [planes[0], planes[2]]);
                    if (count === 0) return [];
                    const head = (n + 7) >> 3;
                    const packet = new Uint8Array(head + 3 * count);
                    let at = 0;
                    for (let i = 0; i < n; i++) {
                        if (!mask[i]) continue;
                        packet[i >> 3] |= 1 << (i & 7);
                        packet[head + at] = planes[0][i];
                        packet[head + count + at] = planes[1][i];
                        packet[head + 2 * count + at] = planes[2][i];
                        at++;
                    }
                    return [packet];
                },
            };
        },
        createDecoder: ({ width, height }) => {
            const n = width * height;
            const planes = [new Uint8ClampedArray(n).fill(127), new Uint8ClampedArray(n), new Uint8ClampedArray(n).fill(127)];
            return {
                push(packet) {
                    const head = (n + 7) >> 3;
                    const count = (packet.length - head) / 3;
                    let at = 0;
                    for (let i = 0; i < n; i++) {
                        if (!((packet[i >> 3] >> (i & 7)) & 1)) continue;
                        planes[0][i] = packet[head + at];
                        planes[1][i] = packet[head + count + at];
                        planes[2][i] = packet[head + 2 * count + at];
                        at++;
                    }
                    return color.inverse(planes);
                },
            };
        },
    };
}

/**
 * Replenishment at full size that follows a move of the picture (row
 * V12): before the selection, one vector for the frame is looked for
 * against what the receiver holds; when there is one, both ends move
 * their planes by it, and only what came into view is left to send.
 * Packet: a flag byte; with a move, the two components of the vector, the
 * tile size in units of 8 pixels and one bit a tile; then the bitmask and
 * the selected pixels as in `replenish`.
 *
 * @param {string} name
 * @param {object} rule Options of the selection.
 * @param {{ tile?: number, range?: number }} search Options of `video.motion.estimate`.
 */
function following(name, rule, search = {}) {
    return {
        name,
        createEncoder: ({ width, height, fps }) => {
            const selector = select.create({ width, height, fps, ...rule });
            const n = width * height;
            let first = true;
            return {
                push(frame) {
                    const planes = color.forward(frame);
                    let move = null;
                    if (!first) {
                        const found = motion.estimate(planes[1], selector.reference(), width, height, search);
                        if (found.moved) {
                            move = found;
                            selector.remap((plane) => motion.apply(plane, width, height, found));
                        }
                    }
                    first = false;
                    const { mask, count } = selector.push(planes[1], [planes[0], planes[2]]);
                    if (count === 0 && !move) return [];
                    const tileBytes = move && move.tiles ? (move.tiles.length + 7) >> 3 : 0;
                    const start = move ? 4 + tileBytes : 1;
                    const head = (n + 7) >> 3;
                    const packet = new Uint8Array(start + head + 3 * count);
                    if (move) {
                        packet[0] = 1;
                        packet[1] = move.dx & 0xff;
                        packet[2] = move.dy & 0xff;
                        packet[3] = move.tile >> 3;
                        if (move.tiles) move.tiles.forEach((flag, k) => { if (flag) packet[4 + (k >> 3)] |= 1 << (k & 7); });
                    }
                    let at = 0;
                    for (let i = 0; i < n; i++) {
                        if (!mask[i]) continue;
                        packet[start + (i >> 3)] |= 1 << (i & 7);
                        packet[start + head + at] = planes[0][i];
                        packet[start + head + count + at] = planes[1][i];
                        packet[start + head + 2 * count + at] = planes[2][i];
                        at++;
                    }
                    return [packet];
                },
            };
        },
        createDecoder: ({ width, height }) => {
            const n = width * height;
            let planes = [new Uint8ClampedArray(n).fill(127), new Uint8ClampedArray(n), new Uint8ClampedArray(n).fill(127)];
            return {
                push(packet) {
                    let start = 1;
                    if (packet[0] === 1) {
                        const tile = packet[3] << 3;
                        const count = tile ? Math.ceil(width / tile) * Math.ceil(height / tile) : 0;
                        const tiles = tile ? Uint8Array.from({ length: count }, (_, k) => (packet[4 + (k >> 3)] >> (k & 7)) & 1) : null;
                        const move = { moved: true, dx: (packet[1] << 24) >> 24, dy: (packet[2] << 24) >> 24, tile, tiles };
                        planes = planes.map((plane) => motion.apply(plane, width, height, move));
                        start = 4 + ((count + 7) >> 3);
                    }
                    const head = (n + 7) >> 3;
                    const count = (packet.length - start - head) / 3;
                    let at = 0;
                    for (let i = 0; i < n; i++) {
                        if (!((packet[start + (i >> 3)] >> (i & 7)) & 1)) continue;
                        planes[0][i] = packet[start + head + at];
                        planes[1][i] = packet[start + head + count + at];
                        planes[2][i] = packet[start + head + 2 * count + at];
                        at++;
                    }
                    return color.inverse(planes);
                },
            };
        },
    };
}

/**
 * `video.codec` as a bench codec.
 *
 * @param {string} name
 * @param {object} config Options of `video.codec.createEncoder`, and:
 * @param {(type: number) => boolean} [config.keep] Units kept between the encoder and the decoder, as a relay would drop the others.
 * @param {string|object} [config.post] The decoder's restoration filter; 'wish' to follow the stream.
 */
function layered(name, { keep = null, rule, post = 'none', ...config }) {
    return {
        name,
        createEncoder: (shape) => {
            const encoder = codec.createEncoder({ ...shape, select: rule, ...config });
            if (!keep) return encoder;
            return { push: (frame) => encoder.push(frame).map((packet) => pack.writeUnits(pack.readUnits(packet).filter((unit) => keep(unit.type)))) };
        },
        createDecoder: ({ width, height }) => {
            // A preset may code a reduced picture: the bench enlarges it again, by repeating pixels, to compare with the source.
            const factor = (config.preset && codec.presets[config.preset].reduce) || config.reduce || 1;
            const w = width / factor;
            const h = height / factor;
            // 'wish': the decoder is given no filter and follows the wish of the stream.
            const decoder = codec.createDecoder({ width: w, height: h, post: post === 'wish' ? undefined : post });
            // The harness keeps pictures across frames: hand it its own copy.
            if (factor === 1) return { push: (packet) => new Uint8ClampedArray(decoder.push(packet)) };
            return {
                push(packet) {
                    const small = decoder.push(packet);
                    const out = new Uint8ClampedArray(width * height * 4);
                    for (let y = 0; y < height; y++) {
                        const row = Math.floor(y / factor) * w;
                        for (let x = 0; x < width; x++) {
                            const from = (row + Math.floor(x / factor)) * 4;
                            out.set(small.subarray(from, from + 4), (y * width + x) * 4);
                        }
                    }
                    return out;
                },
            };
        },
    };
}

/** Thresholds of the reference rule set above a camera noise. */
const QUIET = [[4, 4], [4, 4], [5, 5], [5, 5], [6, 6]];

export const codecs = [
    identity,
    rgb555,
    hold4,

    // Rows V3 and V4 — the transforms alone, every frame on its own.
    intra('color', null),
    intra('haar1', { levels: 1 }),
    intra('haar2', { levels: 2 }),
    intra('haar3', { levels: 3 }),
    intra('haar2-diag', { levels: 2, diagonal: true }),
    intra('haar2-chroma', { levels: 2, chroma: 'all' }),
    intra('haar2-all', { levels: 2, diagonal: true, chroma: 'all' }),

    // Row V5 — the selection of changed pixels (first candidate), at full size.
    replenish('replenish'),

    // Row V6 — the three rules side by side.
    replenish('replenish-complete', { rule: 'complete' }),
    replenish('replenish-ref', { rule: 'reference' }),
    replenish('replenish-ref-colour', { rule: 'reference', chroma: true }),
    // The reference rule with thresholds set above a camera noise.
    replenish('replenish-ref-colour-t4', { rule: 'reference', chroma: true, thresholds: [[4, 4], [4, 4], [5, 5], [5, 5], [6, 6]] }),

    // Row V7 — the layered packet. L: passes; the selection runs on the smallest picture.
    layered('layered-L2-history', { levels: 2, rule: { rule: 'history' } }),
    layered('layered-L2', { levels: 2, rule: REF }),
    layered('layered-L2-diag', { levels: 2, diagonal: true, rule: REF }),
    layered('layered-L1-diag', { levels: 1, diagonal: true, rule: REF }),
    layered('layered-L3-diag', { levels: 3, diagonal: true, rule: REF }),
    // The geometry forced to one form.
    layered('layered-L2-diag-bits', { levels: 2, diagonal: true, rule: REF, form: 'bits' }),
    layered('layered-L2-diag-runs', { levels: 2, diagonal: true, rule: REF, form: 'runs' }),
    // Units dropped on the way: the finest level; every level; the colour.
    layered('layered-L2-diag-no-fine', { levels: 2, diagonal: true, rule: REF, keep: (type) => type !== pack.types.DETAIL + 1 }),
    layered('layered-L2-diag-base-only', { levels: 2, diagonal: true, rule: REF, keep: (type) => type < pack.types.DETAIL }),
    layered('layered-L2-diag-no-colour', { levels: 2, diagonal: true, rule: REF, keep: (type) => type !== pack.types.COLOUR }),

    // Row V8 — the selection also reads the details (d: its threshold).
    layered('layered-L2-diag-d2', { levels: 2, diagonal: true, rule: REF, detail: 2 }),
    layered('layered-L2-diag-d4', { levels: 2, diagonal: true, rule: REF, detail: 4 }),
    layered('layered-L2-diag-d8', { levels: 2, diagonal: true, rule: REF, detail: 8 }),
    layered('layered-L1-diag-d4', { levels: 1, diagonal: true, rule: REF, detail: 4 }),
    // The same with every threshold set above a camera noise.
    layered('layered-L2-diag-d6-quiet', { levels: 2, diagonal: true, rule: { ...REF, thresholds: QUIET }, detail: 6 }),

    // Row V12 — content that only moves: one vector for the frame, then tiles of 32 pixels.
    following('replenish-move', REF),
    following('replenish-move-tiles', REF, { tile: 32 }),

    // Row V12b — the vector inside the pyramid codec.
    layered('layered-L1-diag-d4-move', { levels: 1, diagonal: true, rule: REF, detail: 4, motion: { tile: 32 } }),
    layered('layered-L2-diag-d4-move', { levels: 2, diagonal: true, rule: REF, detail: 4, motion: { tile: 32 } }),
    layered('layered-L2-diag-d2-move', { levels: 2, diagonal: true, rule: REF, detail: 2, motion: { tile: 32 } }),

    // Row V12c — the exact pyramid, alone then with the vector; and the search with no floor on the change.
    layered('layered-L2-diag-d4-exact', { levels: 2, diagonal: true, exact: true, rule: REF, detail: 4 }),
    layered('layered-L1-diag-d4-exact-move', { levels: 1, diagonal: true, exact: true, rule: REF, detail: 4, motion: { tile: 32 } }),
    layered('layered-L2-diag-d4-exact-move', { levels: 2, diagonal: true, exact: true, rule: REF, detail: 4, motion: { tile: 32 } }),
    layered('layered-L3-diag-d4-exact-move', { levels: 3, diagonal: true, exact: true, rule: REF, detail: 4, motion: { tile: 32 } }),
    layered('layered-L2-diag-d4-move-always', { levels: 2, diagonal: true, rule: REF, detail: 4, motion: { tile: 32, minChange: 0 } }),

    // Row V13 — lost packets. `bare`: the vector without the position; `own`: a refresh budget of its own.
    layered('layered-L2-diag-d4-exact-move-bare', { levels: 2, diagonal: true, exact: true, rule: REF, detail: 4, motion: { tile: 32, position: false } }),
    layered('layered-L2-diag-d4-exact-move-own', { levels: 2, diagonal: true, exact: true, rule: { ...REF, refresh: 'own' }, detail: 4, motion: { tile: 32 } }),
    layered('layered-L2-diag-d4-exact-own', { levels: 2, diagonal: true, exact: true, rule: { ...REF, refresh: 'own' }, detail: 4 }),
    layered('layered-L2-diag-d4-own', { levels: 2, diagonal: true, rule: { ...REF, refresh: 'own' }, detail: 4 }),
    layered('layered-L1-diag-d4-move-own', { levels: 1, diagonal: true, rule: { ...REF, refresh: 'own' }, detail: 4, motion: { tile: 32 } }),

    // Row V9a — quantisation of the details (q: the step) and the 4-bit coding (nib).
    layered('layered-L2-diag-d4-nib', { levels: 2, diagonal: true, rule: REF, detail: 4, coding: 'nibbles' }),
    layered('layered-L2-diag-d4-q2', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 2 }),
    layered('layered-L2-diag-d4-q4', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 4 }),
    layered('layered-L2-diag-d4-q2-nib', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 2, coding: 'nibbles' }),
    layered('layered-L2-diag-d4-q4-nib', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 4, coding: 'nibbles' }),
    layered('layered-L2-diag-d4-q8-nib', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 8, coding: 'nibbles' }),
    layered('layered-L2-diag-d4-q16-nib', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 16, coding: 'nibbles' }),
    layered('layered-L2-diag-d4-exact-move-nib', { levels: 2, diagonal: true, exact: true, rule: REF, detail: 4, motion: { tile: 32 }, coding: 'nibbles' }),
    layered('layered-L2-diag-d4-exact-move-q2-nib', { levels: 2, diagonal: true, exact: true, rule: REF, detail: 4, motion: { tile: 32 }, quant: 2, coding: 'nibbles' }),
    layered('layered-L2-diag-d4-exact-move-q4-nib', { levels: 2, diagonal: true, exact: true, rule: REF, detail: 4, motion: { tile: 32 }, quant: 4, coding: 'nibbles' }),
    layered('layered-L3-diag-d4-q4-nib', { levels: 3, diagonal: true, rule: REF, detail: 4, quant: 4, coding: 'nibbles' }),

    // Row V9b — the stages the patent names. s: the smoothing threshold; g: the smallest group sent;
    // c: the error-correction threshold. The strips were measured there (v9b-table.md) and left the codec in V11.
    layered('layered-L2-diag-d4-q4-nib-s3', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 4, coding: 'nibbles', smooth: 3 }),
    layered('layered-L2-diag-d4-q4-nib-g2', { levels: 2, diagonal: true, rule: { ...REF, minGroup: 2 }, detail: 4, quant: 4, coding: 'nibbles' }),
    layered('layered-L2-diag-d4-q4-nib-g3', { levels: 2, diagonal: true, rule: { ...REF, minGroup: 3 }, detail: 4, quant: 4, coding: 'nibbles' }),
    layered('layered-L2-diag-d4-g3', { levels: 2, diagonal: true, rule: { ...REF, minGroup: 3 }, detail: 4 }),
    replenish('replenish-c3', { correct: 3 }),
    replenish('replenish-complete-c3', { rule: 'complete', correct: 3 }),
    layered('layered-L2-history-c3', { levels: 2, rule: { rule: 'history', correct: 3 } }),

    // Row V10 — the decoder's restoration filter. Same streams as their rows above; only the decoder changes.
    layered('layered-L2-diag-d4-post-laplace', { levels: 2, diagonal: true, rule: REF, detail: 4, post: 'laplace' }),
    layered('layered-L2-diag-d4-post-clamped', { levels: 2, diagonal: true, rule: REF, detail: 4, post: 'laplace-clamped' }),
    layered('layered-L2-diag-d4-post-gauss', { levels: 2, diagonal: true, rule: REF, detail: 4, post: 'gauss' }),
    layered('layered-L2-diag-d4-post-chroma', { levels: 2, diagonal: true, rule: REF, detail: 4, post: 'chroma' }),
    layered('layered-L2-diag-d4-post-chroma2', { levels: 2, diagonal: true, rule: REF, detail: 4, post: { mode: 'chroma', passes: 2 } }),
    layered('layered-L2-diag-d4-post-chroma4', { levels: 2, diagonal: true, rule: REF, detail: 4, post: { mode: 'chroma', passes: 4 } }),
    layered('layered-L2-diag-d4-q4-nib-post-laplace', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 4, coding: 'nibbles', post: 'laplace' }),
    layered('layered-L2-diag-d4-q4-nib-post-clamped', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 4, coding: 'nibbles', post: 'laplace-clamped' }),
    layered('layered-L2-diag-d4-q4-nib-post-gauss', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 4, coding: 'nibbles', post: 'gauss' }),
    layered('layered-L2-diag-d4-q4-nib-post-chroma2', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 4, coding: 'nibbles', post: { mode: 'chroma', passes: 2 } }),
    layered('layered-L2-diag-d4-q16-nib-post-gauss', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 16, coding: 'nibbles', post: 'gauss' }),
    layered('layered-L2-diag-d4-q16-nib-post-chroma2', { levels: 2, diagonal: true, rule: REF, detail: 4, quant: 16, coding: 'nibbles', post: { mode: 'chroma', passes: 2 } }),

    // Row V11 — the presets ruled by the owner (D13). The decoder follows the wish of the stream.
    layered('preset-quality', { preset: 'quality', post: 'wish' }),
    layered('preset-standard', { preset: 'standard', post: 'wish' }),
    layered('preset-economy', { preset: 'economy', post: 'wish' }),
    layered('preset-low', { preset: 'low', post: 'wish' }),
    layered('preset-minimal', { preset: 'minimal', post: 'wish' }),
    layered('preset-screen', { preset: 'screen', post: 'wish' }),

    // Row V15 — selected pixels as differences from what the decoder holds; hold: details that did not move are kept.
    layered('preset-standard-delta', { preset: 'standard', delta: true, post: 'wish' }),
    layered('preset-standard-delta-hold4', { preset: 'standard', delta: true, hold: 4, post: 'wish' }),
    layered('preset-quality-delta-hold4', { preset: 'quality', delta: true, hold: 4, post: 'wish' }),
    layered('preset-screen-delta', { preset: 'screen', delta: true, post: 'wish' }),
];
