// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Experiment (row A5): a wavelet on a block of frames.
 *
 *   - `blocked`  one dimension: n frames joined into one longer frame for
 *                an inner codec;
 *   - `block2d`  two dimensions: n frames of 128 samples as an n × 128
 *                matrix — the wavelet along each frame (time), then
 *                across the frames, sample position by sample position.
 *
 * Both buffer n − 1 frames before they can emit: that is their latency.
 * Bench compositions over the package's modules; they enter `src/` only
 * if the decision row retains them.
 */

import { modules } from './modules.js';

const FRAME = 128;
const SCALE = 32767;

/**
 * Joins `frames` frames into one for an inner codec.
 *
 * @param {string} name
 * @param {number} frames Frames per block.
 * @param {{ createEncoder: () => { push: (frame: Float32Array) => Uint8Array[] }, createDecoder: () => { push: (packet: Uint8Array) => Float32Array[] } }} inner
 */
export function blocked(name, frames, inner) {
    return {
        name,
        delay: 0,
        latency: (frames - 1) * FRAME,
        createEncoder: () => {
            const encoder = inner.createEncoder();
            let block = new Float32Array(frames * FRAME);
            let filled = 0;
            const emit = () => {
                const packets = encoder.push(block);
                block = new Float32Array(frames * FRAME);
                filled = 0;
                return packets;
            };
            return {
                push(frame) {
                    block.set(frame, filled * FRAME);
                    filled++;
                    return filled === frames ? emit() : [];
                },
                /** Completes a started block with silence. */
                flush: () => (filled > 0 ? emit() : []),
            };
        },
        createDecoder: () => inner.createDecoder(),
    };
}

/**
 * The two-dimensional codec.
 *
 * Packet: one unit per time-band, the base band first then the details
 * from the coarsest to the finest; each unit is the band's matrix after
 * the transform across frames, in 4-bit codes. No header: both ends are
 * configured alike. A packet may be cut after any unit.
 *
 * @param {string} name
 * @param {object} config
 * @param {'haar'|'lift53'} config.kind
 * @param {number} config.frames Frames per block, a power of two from 2 to 128.
 * @param {number} config.step Power-of-two step of the detail bands.
 * @param {number} [config.baseStep=1] Power-of-two step of the base band.
 * @param {number} [config.levels=5] Passes along a frame.
 */
export function block2d(name, { kind, frames, step, baseStep = 1, levels = 5 }) {
    const { wavelet, nibbles } = modules;
    const across = Math.log2(frames);
    if (!Number.isInteger(across) || across < 1 || across > 7) throw new RangeError(`block2d: ${frames} frames`);
    const exponents = [Math.log2(baseStep), ...new Array(levels).fill(Math.log2(step))];
    if (exponents.some((e) => !Number.isInteger(e) || e < 0 || e > 15)) throw new RangeError('block2d: steps are powers of two');
    /** Width of each time-band: the base, then the details coarsest first. */
    const widths = [FRAME >> levels, ...Array.from({ length: levels }, (_, k) => FRAME >> (levels - k))];

    /** Splits a column of `frames` coefficients into the bands `inverse` expects. */
    function columnBands(column) {
        const bands = [column.subarray(0, frames >> across)];
        let at = frames >> across;
        for (let k = 0; k < across; k++) {
            const size = frames >> (across - k);
            bands.push(column.subarray(at, at + size));
            at += size;
        }
        return bands;
    }

    function encode(block) {
        // Along each frame.
        const rows = [];
        for (let f = 0; f < frames; f++) {
            const ints = new Int32Array(FRAME);
            for (let i = 0; i < FRAME; i++) ints[i] = Math.max(-32768, Math.min(32767, Math.round(block[f * FRAME + i] * SCALE)));
            rows.push(wavelet.forward(ints, levels, kind));
        }
        // Across the frames, band by band, column by column.
        const bytes = [];
        for (let band = 0; band <= levels; band++) {
            const width = widths[band];
            const unit = new Int32Array(frames * width);
            const e = exponents[band];
            const half = e > 0 ? 1 << (e - 1) : 0;
            const column = new Int32Array(frames);
            for (let j = 0; j < width; j++) {
                for (let f = 0; f < frames; f++) column[f] = rows[f][band][j];
                let at = 0;
                for (const part of wavelet.forward(column, across, kind)) {
                    // Row-major by vertical coefficient: the vertical details gather at the end.
                    for (let v = 0; v < part.length; v++) unit[(at + v) * width + j] = (part[v] + half) >> e;
                    at += part.length;
                }
            }
            nibbles.put(bytes, unit);
        }
        return [Uint8Array.from(bytes)];
    }

    /**
     * @param {Uint8Array} packet
     * @returns {{ block: Float32Array, ends: number[] }}
     */
    function decode(packet) {
        const rows = Array.from({ length: frames }, () => widths.map((width) => new Int32Array(width)));
        const ends = [];
        let at = 0;
        for (let band = 0; band <= levels && at < packet.length; band++) {
            const width = widths[band];
            const unit = new Int32Array(frames * width);
            at = nibbles.read(packet, at, unit, 1 << exponents[band]);
            ends.push(at);
            const column = new Int32Array(frames);
            for (let j = 0; j < width; j++) {
                for (let v = 0; v < frames; v++) column[v] = unit[v * width + j];
                const back = wavelet.inverse(columnBands(column), kind);
                for (let f = 0; f < frames; f++) rows[f][band][j] = back[f];
            }
        }
        if (ends.length === 0) throw new RangeError('block2d: empty packet');
        const block = new Float32Array(frames * FRAME);
        for (let f = 0; f < frames; f++) {
            const ints = wavelet.inverse(rows[f], kind);
            for (let i = 0; i < FRAME; i++) block[f * FRAME + i] = ints[i] / SCALE;
        }
        return { block, ends };
    }

    const codec = blocked(name, frames, {
        createEncoder: () => ({ push: encode }),
        createDecoder: () => ({ push: (packet) => [decode(packet).block] }),
    });
    /** Where a packet may be cut: after each unit present. */
    codec.units = (packet) => decode(packet).ends;
    return codec;
}
