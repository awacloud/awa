// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Experiment (row A6): the waveform as sparse points,
 * rebuilt by transition functions — the owner's idea.
 *
 * The encoder keeps the **turning points** of the waveform: where it
 * stops rising and starts falling, or the reverse. A reversal counts
 * only once it exceeds a threshold: smaller wiggles — the noise — are
 * not points and are therefore not carried. When no point came for
 * `maxGap` samples, the current sample is sent as a **through-point**,
 * which bounds the wait of the decoder.
 *
 * The decoder draws each stretch between two points with a transition
 * chosen by what the two points are — the easing shapes of an animation
 * library, used here to recompose a signal:
 *
 *   turning point → turning point   in-out (flat at both ends)
 *   turning point → through-point   in     (flat at the start)
 *   through-point → turning point   out    (flat at the end)
 *   through-point → through-point   a straight line
 *
 * A point is a gap (samples since the previous point) and the
 * difference of its quantised value from the previous one, as 4-bit
 * variable-length integers. A packet is a count of points, then the
 * points; a frame without a point sends nothing. A through-point is
 * recognised by its gap, equal to `maxGap`.
 *
 * A bench composition over the package's modules; it enters `src/` only
 * if the decision row retains it.
 */

import { modules } from './modules.js';

const SCALE = 32767;
const HALF_PI = Math.PI / 2;

const FAMILIES = {
    sine: {
        inOut: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
        in: (t) => 1 - Math.cos(HALF_PI * t),
        out: (t) => Math.sin(HALF_PI * t),
        line: (t) => t,
    },
    cubic: {
        inOut: (t) => t * t * (3 - 2 * t),
        in: (t) => t * t,
        out: (t) => t * (2 - t),
        line: (t) => t,
    },
    linear: { inOut: (t) => t, in: (t) => t, out: (t) => t, line: (t) => t },
};

/**
 * @param {'sine'|'cubic'|'linear'} family
 * @param {'inOut'|'in'|'out'|'line'} shape
 * @returns {(t: number) => number} A transition from 0 at t = 0 to 1 at t = 1.
 * @throws {RangeError} On an unknown family.
 */
export function ease(family, shape) {
    const shapes = FAMILIES[family];
    if (!shapes) throw new RangeError(`points: family ${family}`);
    return shapes[shape];
}

/**
 * @param {string} name
 * @param {object} config
 * @param {number} config.threshold Reversal that makes a turning point, on 16-bit values; 0 keeps every reversal.
 * @param {number} config.step Power-of-two step of the point values.
 * @param {'sine'|'cubic'|'linear'} config.family
 * @param {number} [config.maxGap=64] Longest stretch without a point, in samples.
 */
export function points(name, { threshold, step, family, maxGap = 64 }) {
    const { nibbles } = modules;
    const e = Math.log2(step);
    if (!Number.isInteger(e) || e < 0 || e > 15) throw new RangeError(`points: step ${step}`);
    if (!(threshold >= 0)) throw new RangeError(`points: threshold ${threshold}`);
    if (!Number.isInteger(maxGap) || maxGap < 2) throw new RangeError(`points: maxGap ${maxGap}`);
    const shapes = FAMILIES[family];
    if (!shapes) throw new RangeError(`points: family ${family}`);
    const half = e > 0 ? 1 << (e - 1) : 0;

    /**
     * Reads the points of a packet.
     * @param {Uint8Array} packet
     * @returns {[number, number][]} Gap and quantised value difference of each point.
     */
    function read(packet) {
        const reader = nibbles.reader(packet);
        const count = reader.unsigned();
        const list = [];
        for (let i = 0; i < count; i++) list.push([reader.unsigned() + 1, reader.signed()]);
        return list;
    }

    function createEncoder() {
        let n = 0;                  // position of the sample being read
        let lastAt = -1;            // last point sent: position and quantised value
        let lastValue = 0;
        let direction = 0;          // +1 rising towards a maximum, -1 falling, 0 not known yet
        let candidateAt = -1;       // the extreme since the last reversal
        let candidate = 0;
        let highAt = -1;            // while the direction is unknown: both extremes
        let high = 0;
        let lowAt = -1;
        let low = 0;
        let pending = [];

        const send = (at, value) => {
            if (at <= lastAt) return;
            const q = (value + half) >> e;
            pending.push(at - lastAt - 1, q - lastValue);
            lastAt = at;
            lastValue = q;
        };

        const packet = () => {
            if (pending.length === 0) return [];
            const bytes = [];
            const writer = nibbles.writer(bytes);
            writer.unsigned(pending.length / 2);
            for (let i = 0; i < pending.length; i += 2) {
                writer.unsigned(pending[i]);
                writer.signed(pending[i + 1]);
            }
            writer.end();
            pending = [];
            return [Uint8Array.from(bytes)];
        };

        return {
            push(frame) {
                for (let i = 0; i < frame.length; i++, n++) {
                    const x = Math.max(-32768, Math.min(32767, Math.round(frame[i] * SCALE)));
                    if (direction === 0) {
                        if (highAt < 0 || x > high) { highAt = n; high = x; }
                        if (lowAt < 0 || x < low) { lowAt = n; low = x; }
                        if (high - low > threshold) {
                            // The earlier extreme is a turning point; the later one is the candidate.
                            if (highAt < lowAt) { send(highAt, high); direction = -1; candidateAt = lowAt; candidate = low; }
                            else { send(lowAt, low); direction = 1; candidateAt = highAt; candidate = high; }
                        }
                    } else if (direction > 0) {
                        if (x >= candidate) { candidateAt = n; candidate = x; }
                        else if (candidate - x > threshold) { send(candidateAt, candidate); direction = -1; candidateAt = n; candidate = x; }
                    } else if (x <= candidate) { candidateAt = n; candidate = x; }
                    else if (x - candidate > threshold) { send(candidateAt, candidate); direction = 1; candidateAt = n; candidate = x; }

                    if (n - lastAt >= maxGap) {
                        // Nothing for too long: the current sample goes as a through-point.
                        send(n, x);
                        candidateAt = n; candidate = x;
                        highAt = n; high = x; lowAt = n; low = x;
                    }
                }
                return packet();
            },
            /** Sends the last sample, so that the decoder can draw up to the end. */
            flush() {
                if (n > 0 && lastAt < n - 1) {
                    // Splitting a tail longer than maxGap is not needed: the forced points already bound it.
                    pending.push(n - 1 - lastAt - 1, 0);
                    lastAt = n - 1;
                }
                return packet();
            },
        };
    }

    function createDecoder() {
        let value = 0;              // value of the last point, on 16 bits
        let through = true;         // the stream starts as from a through-point
        return {
            /** @throws {RangeError} When the packet is cut. */
            push(packet) {
                const list = read(packet);
                const out = new Float32Array(list.reduce((sum, [gap]) => sum + gap, 0));
                let at = 0;
                for (const [gap, difference] of list) {
                    const next = value + difference * step;
                    const nextThrough = gap === maxGap;
                    const shape = shapes[through ? (nextThrough ? 'line' : 'out') : nextThrough ? 'in' : 'inOut'];
                    for (let j = 1; j <= gap; j++) out[at++] = (value + (next - value) * shape(j / gap)) / SCALE;
                    value = next;
                    through = nextThrough;
                }
                return [out];
            },
        };
    }

    return { name, delay: 0, latency: maxGap, createEncoder, createDecoder, read };
}
