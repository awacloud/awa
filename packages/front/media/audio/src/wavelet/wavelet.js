// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.wavelet` — an integer wavelet pyramid
 * on each frame, written as separable layers.
 *
 * Two transforms, both exactly reversible on integers and both working
 * inside the frame (no sample of another frame, hence no delay):
 *
 *   - `haar`    each pair becomes its average and its difference — the
 *               transform of the video codec, on a line of samples;
 *   - `lift53`  the 5/3 lifting wavelet: a detail is what a sample adds
 *               to the mean of its two neighbours, then the kept samples
 *               are smoothed by a quarter of the neighbouring details.
 *               Shifts and additions only, like Haar, but it separates
 *               frequencies better, and with the details missing the
 *               inverse is a linear interpolation where Haar holds a
 *               staircase.
 *
 * After `levels` passes a frame is a base band and `levels` detail
 * bands. Every value is quantised by a step that is a power of two: a
 * shift.
 *
 * Packet:
 *
 *   [header] [exponents] [base] [detail band] [detail band] …
 *
 *   header     bits 0–2 the level count, bit 3 the kind, bit 4 the
 *              coding, bit 5 "one step per level", bits 6–7 the format
 *              version (1);
 *   exponents  one byte: the base step (high half) and the detail step
 *              (low half) as powers of two; with one step per level, the
 *              low half is the coarsest level's and the further levels
 *              follow, half a byte each;
 *   base       the first value, then the difference from one value to
 *              the next;
 *   bands      from the coarsest to the finest, each starting on a byte.
 *
 * There is no length in the packet. Each band delimits itself, so a
 * packet may still be cut after any band — the missing ones read as
 * zero, the frame decodes at a lower definition — and `units` finds
 * those boundaries by reading the packet. Trailing bands that quantise
 * to nothing are not written at all. No band depends on a later one.
 * The frame length is not in the packet: both ends are configured alike.
 *
 * Whoever cuts a packet holds its plain bytes: the sender or the
 * receiver. A relay of an encrypted stream cannot; for it the layers
 * must travel as separate encrypted units, framed by the stream.
 *
 * Detail codings:
 *   - `bytes`    each value as a variable-length integer, at least one
 *                byte;
 *   - `nibbles`  the 4-bit band coding of `audio.nibbles`: small
 *                values, an escape, runs of zeros, "the rest of the
 *                band is zero".
 *
 * Status: the 5/3 lifting is the transform `audio.codec` retained; the Haar form stays for the bench.
 */

/**
 * @typedef {object} WaveletConfig
 * @property {'haar'|'lift53'} [kind='haar']
 * @property {number} levels 1 to 7 passes.
 * @property {number|number[]|{bits: number}} [step=1] Quantisation step of the details, a power of two up to 32768: one value, or one per level, coarsest first; or `{ bits }` — the step follows each frame, keeping that many significant bits under its peak.
 * @property {number|{bits: number}} [baseStep=1] Quantisation step of the base band: a power of two up to 32768, or `{ bits }`.
 * @property {'bytes'|'nibbles'} [coding='bytes']
 * @property {number} [frame=128] Frame length, divisible by 2^levels.
 *
 * @typedef {object} WaveletApi
 * @property {string[]} kinds
 * @property {string[]} codings
 * @property {(frame: Int32Array, levels: number, kind?: string) => Int32Array[]} forward Base band, then detail bands coarsest first.
 * @property {(bands: Int32Array[], kind?: string) => Int32Array} inverse
 * @property {(config: WaveletConfig) => { push: (frame: Float32Array) => Uint8Array[] }} createEncoder
 * @property {(config?: { frame?: number }) => { push: (packet: Uint8Array) => Float32Array[] }} createDecoder
 * @property {(packet: Uint8Array, frame?: number) => number[]} units End offset of the base (header included) and of each band present.
 */

import { nibblesModule } from './nibbles.js';

export const waveletModule = {
    name: 'audio.wavelet',
    version: '0.4.0',
    type: 'lib.media.audio',
    dependencies: ['audio.nibbles'],
    deps: [nibblesModule],

    /**
     * @param {import('./nibbles.js').NibblesApi} nibbles
     * @returns {WaveletApi}
     */
    factory(nibbles) {
        const MAX_LEVELS = 7;
        const SCALE = 32767;
        const VERSION = 1;
        const KINDS = ['haar', 'lift53'];
        const CODINGS = ['bytes', 'nibbles'];
        const MALFORMED = 'audio.wavelet: malformed packet';

        // ── Transforms ───────────────────────────────────────────────────

        /**
         * One pass: `x` (even length) to its low and high halves.
         * @param {number} kind Index in `KINDS`.
         * @param {Int32Array} x
         * @returns {[Int32Array, Int32Array]}
         */
        function split(kind, x) {
            const n = x.length;
            const half = n >> 1;
            const low = new Int32Array(half);
            const high = new Int32Array(half);
            if (kind === 0) {
                for (let i = 0; i < half; i++) {
                    const a = x[2 * i];
                    const b = x[2 * i + 1];
                    low[i] = (a + b) >> 1;
                    high[i] = a - b;
                }
                return [low, high];
            }
            for (let i = 0; i < half; i++) {
                const right = 2 * i + 2 < n ? x[2 * i + 2] : x[2 * i];
                high[i] = x[2 * i + 1] - ((x[2 * i] + right) >> 1);
            }
            for (let i = 0; i < half; i++) {
                low[i] = x[2 * i] + ((high[i > 0 ? i - 1 : 0] + high[i] + 2) >> 2);
            }
            return [low, high];
        }

        /**
         * The inverse pass.
         * @param {number} kind
         * @param {Int32Array} low
         * @param {Int32Array} high
         * @returns {Int32Array}
         */
        function merge(kind, low, high) {
            const half = low.length;
            const n = half * 2;
            const x = new Int32Array(n);
            if (kind === 0) {
                for (let i = 0; i < half; i++) {
                    const d = high[i];
                    const a = low[i] + ((d + 1) >> 1);
                    x[2 * i] = a;
                    x[2 * i + 1] = a - d;
                }
                return x;
            }
            for (let i = 0; i < half; i++) {
                x[2 * i] = low[i] - ((high[i > 0 ? i - 1 : 0] + high[i] + 2) >> 2);
            }
            for (let i = 0; i < half; i++) {
                const right = 2 * i + 2 < n ? x[2 * i + 2] : x[2 * i];
                x[2 * i + 1] = high[i] + ((x[2 * i] + right) >> 1);
            }
            return x;
        }

        /** @throws {RangeError} When the kind is unknown. */
        function kindIndex(kind) {
            const index = KINDS.indexOf(kind);
            if (index < 0) throw new RangeError(`audio.wavelet: kind ${kind}`);
            return index;
        }

        /** @throws {RangeError} When the level count or the length does not fit. */
        function checkShape(length, levels) {
            if (!Number.isInteger(levels) || levels < 1 || levels > MAX_LEVELS) throw new RangeError(`audio.wavelet: levels ${levels}`);
            if (!Number.isInteger(length) || length < 1 || length % (1 << levels) !== 0) {
                throw new RangeError(`audio.wavelet: a frame of ${length} does not divide by 2^${levels}`);
            }
        }

        /**
         * @param {Int32Array} frame Integers; length divisible by 2^levels.
         * @param {number} levels 1 to 7.
         * @param {'haar'|'lift53'} [kind='haar']
         * @returns {Int32Array[]} `[base, detail coarsest, …, detail finest]`.
         * @throws {RangeError} On a bad level count, kind or frame length.
         */
        function forward(frame, levels, kind = 'haar') {
            const index = kindIndex(kind);
            checkShape(frame.length, levels);
            const bands = new Array(levels + 1);
            let current = frame;
            for (let pass = 0; pass < levels; pass++) {
                const [low, high] = split(index, current);
                bands[levels - pass] = high;
                current = low;
            }
            bands[0] = current;
            return bands;
        }

        /**
         * @param {Int32Array[]} bands As returned by `forward`; a missing band is given as zeros.
         * @param {'haar'|'lift53'} [kind='haar']
         * @returns {Int32Array}
         * @throws {RangeError} On an unknown kind.
         */
        function inverse(bands, kind = 'haar') {
            const index = kindIndex(kind);
            let current = bands[0];
            for (let k = 1; k < bands.length; k++) current = merge(index, current, bands[k]);
            return current;
        }

        // ── Steps ─────────────────────────────────────────────────────────

        /**
         * @param {number} step
         * @returns {number} `e` such that `step` is 2^e.
         * @throws {RangeError} When `step` is not a power of two from 1 to 32768.
         */
        function exponent(step) {
            if (!Number.isInteger(step) || step < 1 || step > 32768 || (step & (step - 1)) !== 0) {
                throw new RangeError(`audio.wavelet: step ${step}, a power of two from 1 to 32768 expected`);
            }
            return 31 - Math.clz32(step);
        }

        /**
         * Quantises a band by 2^e, rounding to the nearest multiple.
         * @param {Int32Array} band
         * @param {number} e
         * @returns {Int32Array}
         */
        function quantise(band, e) {
            if (e === 0) return band;
            const half = 1 << (e - 1);
            return band.map((value) => (value + half) >> e);
        }

        // ── Byte coding: zigzag, then 7 bits per byte, low group first ────

        /** Appends the variable-length code of an unsigned integer. */
        function putUnsigned(bytes, value) {
            let v = value >>> 0;
            while (v > 0x7f) {
                bytes.push((v & 0x7f) | 0x80);
                v >>>= 7;
            }
            bytes.push(v);
        }

        /** Appends a signed integer (zigzag: small magnitudes stay short). */
        function putSigned(bytes, value) {
            putUnsigned(bytes, (value << 1) ^ (value >> 31));
        }

        /**
         * A cursor over a packet.
         * @param {Uint8Array} packet
         * @param {number} at
         */
        function reader(packet, at) {
            const end = packet.length;
            const cursor = {
                at,
                /** @throws {RangeError} When the bytes run out. */
                signed() {
                    let value = 0;
                    let shift = 0;
                    for (;;) {
                        if (cursor.at >= end || shift > 28) throw new RangeError(MALFORMED);
                        const byte = packet[cursor.at++];
                        value |= (byte & 0x7f) << shift;
                        if (byte < 0x80) break;
                        shift += 7;
                    }
                    const u = value >>> 0;
                    return (u >>> 1) ^ -(u & 1);
                },
            };
            return cursor;
        }

        // ── Packet ────────────────────────────────────────────────────────

        /**
         * Reads a packet: its bands, scaled back, and where each unit ends.
         * @param {Uint8Array} packet
         * @param {number} frame Frame length both ends agreed on.
         * @returns {{ kind: number, bands: Int32Array[], ends: number[] }}
         * @throws {RangeError} On a bad header, an unknown version, or a unit cut short.
         */
        function parse(packet, frame) {
            if (packet.length < 2) throw new RangeError(MALFORMED);
            const header = packet[0];
            if (header >> 6 !== VERSION) throw new RangeError('audio.wavelet: unknown packet version');
            const levels = header & 7;
            if (levels < 1 || frame % (1 << levels) !== 0) throw new RangeError(MALFORMED);
            const coding = (header >> 4) & 1;
            const exponents = new Array(levels).fill(packet[1] & 15);
            const baseStep = 1 << (packet[1] >> 4);
            let at = 2;
            if (header & 32) {
                for (let k = 1; k < levels; k += 2) {
                    if (at >= packet.length) throw new RangeError(MALFORMED);
                    const byte = packet[at++];
                    exponents[k] = byte >> 4;
                    if (k + 1 < levels) exponents[k + 1] = byte & 15;
                }
            }
            const cursor = reader(packet, at);
            const base = new Int32Array(frame >> levels);
            let previous = 0;
            for (let i = 0; i < base.length; i++) {
                previous += cursor.signed();
                base[i] = previous * baseStep;
            }
            const bands = [base];
            const ends = [cursor.at];
            for (let k = 1; k <= levels; k++) {
                const details = new Int32Array(frame >> (levels - k + 1));
                if (cursor.at < packet.length) {
                    const step = 1 << exponents[k - 1];
                    if (coding === 0) {
                        for (let i = 0; i < details.length; i++) details[i] = cursor.signed() * step;
                    } else {
                        cursor.at = nibbles.read(packet, cursor.at, details, step);
                    }
                    ends.push(cursor.at);
                }
                bands.push(details);
            }
            return { kind: (header >> 3) & 1, bands, ends };
        }

        /**
         * @param {Uint8Array} packet
         * @param {number} [frame=128]
         * @returns {number[]} Where the packet may be cut: after the base, after each band present.
         * @throws {RangeError} On a malformed packet.
         */
        function units(packet, frame = 128) {
            return parse(packet, frame).ends;
        }

        /** @throws {RangeError} On a bad configuration. */
        function createEncoder({ kind = 'haar', levels, step = 1, baseStep = 1, coding = 'bytes', frame = 128 }) {
            const kindAt = kindIndex(kind);
            checkShape(frame, levels);
            const codingAt = CODINGS.indexOf(coding);
            if (codingAt < 0) throw new RangeError(`audio.wavelet: coding ${coding}`);
            // A step is fixed (a power of two) or follows the level: `{ bits }` keeps
            // that many significant bits under the peak of each frame.
            const kept = (value) => {
                if (value === null || typeof value !== 'object' || Array.isArray(value)) return 0;
                if (!Number.isInteger(value.bits) || value.bits < 1 || value.bits > 16) throw new RangeError(`audio.wavelet: bits ${value.bits}`);
                return value.bits;
            };
            const stepBits = kept(step);
            const baseBits = kept(baseStep);
            const steps = Array.isArray(step) ? step : new Array(levels).fill(stepBits ? 1 : step);
            if (steps.length !== levels) throw new RangeError('audio.wavelet: one step per level expected');
            const fixedExponents = steps.map(exponent);
            const fixedBase = exponent(baseBits ? 1 : baseStep);
            const each = fixedExponents.some((e) => e !== fixedExponents[0]);
            const first = (VERSION << 6) | (each ? 32 : 0) | (codingAt << 4) | (kindAt << 3) | levels;
            return {
                /** @throws {RangeError} When the frame has not the configured length. */
                push(samples) {
                    if (samples.length !== frame) throw new RangeError(`audio.wavelet: frame of ${samples.length}, ${frame} expected`);
                    const ints = new Int32Array(frame);
                    for (let i = 0; i < frame; i++) ints[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * SCALE)));
                    let exponents = fixedExponents;
                    let baseExponent = fixedBase;
                    if (stepBits || baseBits) {
                        let peak = 0;
                        for (let i = 0; i < frame; i++) {
                            const magnitude = ints[i] < 0 ? -ints[i] : ints[i];
                            if (magnitude > peak) peak = magnitude;
                        }
                        const significant = 32 - Math.clz32(peak);
                        if (stepBits) exponents = new Array(levels).fill(Math.max(0, significant - stepBits));
                        if (baseBits) baseExponent = Math.max(0, significant - baseBits);
                    }
                    const bands = forward(ints, levels, kind);
                    const bytes = [first, (baseExponent << 4) | exponents[0]];
                    if (each) {
                        for (let k = 1; k < levels; k += 2) bytes.push((exponents[k] << 4) | (k + 1 < levels ? exponents[k + 1] : 0));
                    }
                    let previous = 0;
                    for (const value of quantise(bands[0], baseExponent)) {
                        putSigned(bytes, value - previous);
                        previous = value;
                    }
                    // Quantise the details; trailing bands left with nothing are not written.
                    let written = 0;
                    for (let k = 1; k <= levels; k++) {
                        bands[k] = quantise(bands[k], exponents[k - 1]);
                        if (bands[k].some((value) => value !== 0)) written = k;
                    }
                    for (let k = 1; k <= written; k++) {
                        if (codingAt === 0) {
                            for (const value of bands[k]) putSigned(bytes, value);
                        } else {
                            nibbles.put(bytes, bands[k]);
                        }
                    }
                    return [Uint8Array.from(bytes)];
                },
            };
        }

        function createDecoder({ frame = 128 } = {}) {
            return {
                /** @throws {RangeError} On a malformed packet, or one that does not fit the frame length. */
                push(packet) {
                    const { kind, bands } = parse(packet, frame);
                    const ints = inverse(bands, KINDS[kind]);
                    const out = new Float32Array(frame);
                    for (let i = 0; i < frame; i++) out[i] = ints[i] / SCALE;
                    return [out];
                },
            };
        }

        return { kinds: KINDS, codings: CODINGS, forward, inverse, createEncoder, createDecoder, units };
    },
};
