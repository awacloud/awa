// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.nibbles` — integers in 4-bit codes.
 *
 * Two uses:
 *
 *   - a **band** of quantised values, most of them zero or small
 *     (`put` / `read`): 0–12 a small value (zigzag), 13 an escape
 *     followed by a larger one, 14 a run of 3 to 18 zeros, 15 "the rest
 *     of the band is zero". A band starts and ends on a byte and
 *     delimits itself: the reader is told how many values to expect;
 *   - a plain **sequence** of integers (`writer` / `reader`): three bits
 *     of value per nibble, the fourth says another nibble follows. 0–7
 *     cost one nibble, up to 63 two.
 */

/**
 * @typedef {object} NibblesApi
 * @property {(bytes: number[], values: Int32Array) => void} put Appends a band.
 * @property {(packet: Uint8Array, at: number, out: Int32Array, step: number) => number} read Reads a band into `out`, scaled by `step`; returns the offset after it.
 * @property {(bytes: number[]) => { unsigned: (u: number) => void, signed: (v: number) => void, end: () => void }} writer
 * @property {(packet: Uint8Array, at?: number) => { unsigned: () => number, signed: () => number }} reader
 */

export const nibblesModule = {
    name: 'audio.nibbles',
    version: '0.1.0',
    type: 'lib.media.audio',
    dependencies: [],
    deps: [],

    /** @returns {NibblesApi} */
    factory() {
        const MALFORMED = 'audio.nibbles: malformed stream';

        /**
         * Appends the 4-bit codes of a band of quantised values.
         * @param {number[]} bytes
         * @param {Int32Array} values
         */
        function put(bytes, values) {
            let pending = -1;
            const push = (nibble) => {
                if (pending < 0) pending = nibble;
                else {
                    bytes.push((pending << 4) | nibble);
                    pending = -1;
                }
            };
            const n = values.length;
            let last = n;                       // index after the last non-zero value
            while (last > 0 && values[last - 1] === 0) last--;
            let i = 0;
            while (i < last) {
                const v = values[i];
                if (v === 0) {
                    let run = 1;
                    while (values[i + run] === 0) run++;
                    i += run;
                    while (run >= 3) {
                        const take = run > 18 ? 18 : run;
                        push(14);
                        push(take - 3);
                        run -= take;
                    }
                    for (; run > 0; run--) push(0);
                    continue;
                }
                const u = ((v << 1) ^ (v >> 31)) >>> 0;
                if (u <= 12) push(u);
                else {
                    push(13);
                    let rest = u - 13;
                    while (rest > 7) {
                        push((rest & 7) | 8);
                        rest >>>= 3;
                    }
                    push(rest);
                }
                i++;
            }
            if (last < n) push(15);
            if (pending >= 0) push(15);         // pad the last byte
        }

        /**
         * Reads a band of 4-bit codes into `out`, scaled by `step`.
         * @param {Uint8Array} packet
         * @param {number} at First byte of the codes.
         * @param {Int32Array} out Zero-filled.
         * @param {number} step
         * @returns {number} The offset of the byte after the band.
         * @throws {RangeError} When the codes run out or overshoot the band.
         */
        function read(packet, at, out, step) {
            let position = at * 2;
            const limit = packet.length * 2;
            const next = () => {
                if (position >= limit) throw new RangeError(MALFORMED);
                const byte = packet[position >> 1];
                const nibble = position & 1 ? byte & 15 : byte >> 4;
                position++;
                return nibble;
            };
            const n = out.length;
            let i = 0;
            while (i < n) {
                const code = next();
                if (code === 15) break;
                if (code === 14) {
                    i += next() + 3;
                    if (i > n) throw new RangeError(MALFORMED);
                    continue;
                }
                let u = code;
                if (code === 13) {
                    let rest = 0;
                    let shift = 0;
                    for (;;) {
                        const group = next();
                        rest |= (group & 7) << shift;
                        if (group < 8) break;
                        shift += 3;
                        if (shift > 27) throw new RangeError(MALFORMED);
                    }
                    u = 13 + rest;
                }
                out[i++] = ((u >>> 1) ^ -(u & 1)) * step;
            }
            return (position + 1) >> 1;
        }

        /**
         * A writer of plain 4-bit variable-length integers.
         * @param {number[]} bytes
         */
        function writer(bytes) {
            let pending = -1;
            const push = (nibble) => {
                if (pending < 0) pending = nibble;
                else {
                    bytes.push((pending << 4) | nibble);
                    pending = -1;
                }
            };
            const api = {
                unsigned(value) {
                    let rest = value >>> 0;
                    while (rest > 7) {
                        push((rest & 7) | 8);
                        rest >>>= 3;
                    }
                    push(rest);
                },
                signed(value) {
                    api.unsigned(((value << 1) ^ (value >> 31)) >>> 0);
                },
                /** Completes the last byte. The reader must know how many integers to read. */
                end() {
                    if (pending >= 0) push(0);
                },
            };
            return api;
        }

        /**
         * A reader of what `writer` wrote.
         * @param {Uint8Array} packet
         * @param {number} [at=0] First byte.
         */
        function reader(packet, at = 0) {
            let position = at * 2;
            const limit = packet.length * 2;
            const api = {
                /** @throws {RangeError} When the stream runs out. */
                unsigned() {
                    let value = 0;
                    let shift = 0;
                    for (;;) {
                        if (position >= limit || shift > 30) throw new RangeError(MALFORMED);
                        const byte = packet[position >> 1];
                        const nibble = position & 1 ? byte & 15 : byte >> 4;
                        position++;
                        value |= (nibble & 7) << shift;
                        if (nibble < 8) return value >>> 0;
                        shift += 3;
                    }
                },
                signed() {
                    const u = api.unsigned();
                    return (u >>> 1) ^ -(u & 1);
                },
            };
            return api;
        }

        return { put, read, writer, reader };
    },
};
