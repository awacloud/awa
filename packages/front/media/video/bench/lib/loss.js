// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The lost-packet measure of the video bench (row V13).
 *
 * One encoder feeds two decoders: one receives every packet, the other
 * misses those of the frames named. Frame by frame the picture of each
 * is compared with the source; the gap between the two figures is what
 * the loss cost at that instant. A frame is **damaged** when the gap
 * exceeds one decibel.
 *
 * The encoder is not told of the loss: this is the stream alone healing
 * itself, by what it sends anyway and by its refresh.
 */

import { prng } from './sequences.js';
import { psnrLuma } from './metrics.js';

/** A figure above this is "the same picture". */
const CAP = 99;
/** Decibels of gap from which a frame counts as damaged. */
const DAMAGE = 1;

/**
 * @typedef {object} LossRow
 * @property {string} codec
 * @property {string} sequence
 * @property {number} frames
 * @property {number} lost Packets withheld.
 * @property {number} bytesPerFrame Mean packet bytes a frame, as sent.
 * @property {number} psnrWhole Mean luma PSNR of the decoder that missed nothing, dB.
 * @property {number} psnrLossy Mean luma PSNR of the decoder that missed packets, dB.
 * @property {number} damaged Frames where the loss cost more than 1 dB.
 * @property {number} worstGap The largest cost on one frame, dB.
 * @property {number} repair Frames from the last lost one to the first frame after the last damaged one; 0 when nothing was damaged.
 * @property {boolean} healed The last frame is not damaged.
 * @property {number[]} gaps The cost on each frame, dB.
 */

/**
 * @param {{ name: string, createEncoder: Function, createDecoder: Function }} codec A bench codec.
 * @param {{ name: string, width: number, height: number, frames: number, fps: number, frame: (t: number) => Uint8ClampedArray }} sequence
 * @param {Set<number>} lostFrames Frames whose packets do not reach the second decoder.
 * @returns {LossRow}
 */
export function measureLoss(codec, sequence, lostFrames) {
    const { width, height, frames, fps } = sequence;
    const encoder = codec.createEncoder({ width, height, fps });
    const decoders = [codec.createDecoder({ width, height }), codec.createDecoder({ width, height })];
    const black = () => {
        const picture = new Uint8ClampedArray(width * height * 4);
        for (let i = 3; i < picture.length; i += 4) picture[i] = 255;
        return picture;
    };
    const pictures = [black(), black()];
    const gaps = [];
    let lost = 0;
    let bytes = 0;
    let sumWhole = 0;
    let sumLossy = 0;
    let lastLost = -1;
    let lastDamaged = -1;
    let damaged = 0;
    let worstGap = 0;

    for (let t = 0; t < frames; t++) {
        const source = sequence.frame(t);
        for (const packet of encoder.push(source)) {
            bytes += packet.length;
            pictures[0] = decoders[0].push(packet);
            if (lostFrames.has(t)) {
                lost++;
                lastLost = t;
            } else {
                pictures[1] = decoders[1].push(packet);
            }
        }
        const whole = Math.min(CAP, psnrLuma(source, pictures[0]).psnr);
        const lossy = Math.min(CAP, psnrLuma(source, pictures[1]).psnr);
        const gap = whole - lossy;
        gaps.push(gap);
        sumWhole += whole;
        sumLossy += lossy;
        if (gap > DAMAGE) {
            damaged++;
            lastDamaged = t;
        }
        if (gap > worstGap) worstGap = gap;
    }

    return {
        codec: codec.name,
        sequence: sequence.name,
        frames,
        lost,
        bytesPerFrame: bytes / frames,
        psnrWhole: sumWhole / frames,
        psnrLossy: sumLossy / frames,
        damaged,
        worstGap,
        repair: lastDamaged < 0 ? 0 : lastDamaged + 1 - Math.max(0, lastLost),
        healed: lastDamaged !== frames - 1,
        gaps,
    };
}

/**
 * The frames lost, by pattern.
 *
 * @param {'one'|'burst'|'random'} kind
 * @param {object} options
 * @param {number} [options.at] `one`, `burst`: the first frame lost.
 * @param {number} [options.length] `burst`: frames lost in a row.
 * @param {number} [options.share] `random`: share of the frames lost, 0 to 1.
 * @param {number} [options.frames] `random`: frames of the run.
 * @param {number} [options.seed] `random`.
 * @param {number} [options.from=1] `random`: the first frame that may be lost.
 * @returns {Set<number>}
 * @throws {RangeError} On an unknown pattern.
 */
export function pattern(kind, { at, length, share, frames, seed, from = 1 }) {
    if (kind === 'one') return new Set([at]);
    if (kind === 'burst') return new Set(Array.from({ length }, (_, k) => at + k));
    if (kind === 'random') {
        const random = prng(seed);
        const lost = new Set();
        for (let t = 0; t < frames; t++) {
            const draw = random();
            if (t >= from && draw < share) lost.add(t);
        }
        return lost;
    }
    throw new RangeError(`bench loss: pattern ${kind}`);
}
