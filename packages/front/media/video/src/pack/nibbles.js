// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.nibbles` — a band of integers in 4-bit codes.
 *
 * Quantised detail values are mostly zero or small. Each takes one
 * 4-bit code: 0–12 a small value (sign folded into the low bit), 13 an
 * escape followed by a larger one in groups of three bits, 14 a run of 3
 * to 18 zeros, 15 "the rest of the band is zero". A band starts and ends
 * on a byte and delimits itself: the reader is told how many values to
 * expect.
 *
 * The same coding as the audio side's (`audio.nibbles`), kept in this
 * package so that neither depends on the other.
 */

/**
 * @typedef {object} VideoNibblesApi
 * @property {(bytes: number[], values: Int32Array) => void} put Appends a band.
 * @property {(packet: Uint8Array, at: number, out: Int32Array) => number} read Reads a band into the zero-filled `out`; returns the offset after it.
 */

export const nibblesModule = {
    name: 'video.nibbles',
    version: '0.1.1',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {VideoNibblesApi} */
    factory() {
        const MALFORMED = 'video.nibbles: malformed band';

        /**
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
            if (last < n || pending >= 0 || n === 0) push(15);
            if (pending >= 0) push(15);         // pad the last byte
        }

        /**
         * @param {Uint8Array} packet
         * @param {number} at First byte of the codes.
         * @param {Int32Array} out Zero-filled; its length is the number of values expected.
         * @returns {number} The offset of the byte after the band.
         * @throws {RangeError} When the codes run out or overshoot the band.
         */
        function read(packet, at, out) {
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
            // An empty band is its terminator alone (`put` writes it): read it, or the unit's end is a byte short.
            if (n === 0 && next() !== 15) throw new RangeError(MALFORMED);
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
                out[i++] = (u >>> 1) ^ -(u & 1);
            }
            return (position + 1) >> 1;
        }

        return { put, read };
    },
};
