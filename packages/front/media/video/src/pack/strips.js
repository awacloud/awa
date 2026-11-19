// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.strips` — the 4-bit rewriting of the owner's
 * design (« bandelettes » and repetitions; claim 5 of the patent).
 *
 * Values that follow each other in a picture are near each other. A
 * **strip** is a run of values within 13 of its lowest one: it is
 * written as the code 14, that lowest value, then one 4-bit offset (0 to
 * 13) a value. Three or more equal values are a **repetition**: the code
 * 15, how many, and the value.
 *
 * Where the design document is silent, this module decides, and says so:
 *   - the lowest value of a strip is written in groups of three bits, a
 *     fourth bit saying another group follows (any non-negative integer);
 *   - a repetition counts 3 to 18 values, on one code; longer ones repeat;
 *   - the repeated value is an offset of the current strip;
 *   - a strip opens on the lowest of the values ahead that fit together.
 *
 * Signed values must be folded to non-negative ones by the caller.
 */

/**
 * @typedef {object} StripsApi
 * @property {(bytes: number[], values: ArrayLike<number>) => void} put Appends a table of non-negative integers.
 * @property {(packet: Uint8Array, at: number, out: Int32Array) => number} read Reads `out.length` values; returns the offset after them.
 */

export const stripsModule = {
    name: 'video.strips',
    version: '0.1.0',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {StripsApi} */
    factory() {
        const MALFORMED = 'video.strips: malformed table';
        const SPAN = 13;

        /**
         * @param {number[]} bytes
         * @param {ArrayLike<number>} values Non-negative integers.
         * @throws {RangeError} On a negative value.
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
            let low = -1;                       // lowest value of the open strip
            let i = 0;
            while (i < n) {
                const v = values[i];
                if (v < 0) throw new RangeError(`video.strips: value ${v}`);
                if (low < 0 || v < low || v > low + SPAN) {
                    // The values ahead that fit in one strip, and their lowest.
                    let lo = v;
                    let hi = v;
                    for (let j = i + 1; j < n; j++) {
                        const w = values[j];
                        const nextLo = w < lo ? w : lo;
                        const nextHi = w > hi ? w : hi;
                        if (nextHi - nextLo > SPAN) break;
                        lo = nextLo;
                        hi = nextHi;
                    }
                    low = lo;
                    push(14);
                    let rest = low;
                    while (rest > 7) {
                        push((rest & 7) | 8);
                        rest = Math.floor(rest / 8);
                    }
                    push(rest);
                }
                let run = 1;
                while (i + run < n && values[i + run] === v) run++;
                if (run >= 3) {
                    const take = run > 18 ? 18 : run;
                    push(15);
                    push(take - 3);
                    push(v - low);
                    i += take;
                } else {
                    push(v - low);
                    i++;
                }
            }
            if (pending >= 0) push(0);          // pad the last byte
        }

        /**
         * @param {Uint8Array} packet
         * @param {number} at First byte of the table.
         * @param {Int32Array} out Its length is the number of values expected.
         * @returns {number} The offset of the byte after the table.
         * @throws {RangeError} When the codes run out, overshoot, or come before any strip.
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
            let low = -1;
            let i = 0;
            while (i < n) {
                const code = next();
                if (code === 14) {
                    let value = 0;
                    let scale = 1;
                    for (;;) {
                        const group = next();
                        value += (group & 7) * scale;
                        if (group < 8) break;
                        scale *= 8;
                        if (scale > 2 ** 30) throw new RangeError(MALFORMED);
                    }
                    low = value;
                } else if (code === 15) {
                    const count = next() + 3;
                    const offset = next();
                    if (low < 0 || offset > SPAN || i + count > n) throw new RangeError(MALFORMED);
                    out.fill(low + offset, i, i + count);
                    i += count;
                } else {
                    if (low < 0) throw new RangeError(MALFORMED);
                    out[i++] = low + code;
                }
            }
            return (position + 1) >> 1;
        }

        return { put, read };
    },
};
