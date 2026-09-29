// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Bit-level reader/writer over a `Uint8Array`, packed the
 * way RFC 1951 §3.1.1 and RFC 7932 §1.5 lay out their streams.
 *
 * Both formats fill each byte starting at its least-significant bit, and a
 * multi-bit field keeps its own least-significant bit first. A bit position
 * is therefore a single absolute integer: byte `bitPos >>> 3`, bit
 * `bitPos & 7` inside it. Every accessor works on a fixed little-endian
 * byte window anchored at that byte - two bytes for the 16-bit pair, three
 * for the 24-bit pair - so the caller decides the width through the mask
 * (reads) or the value it passes (writes), and hoists both out of its loops.
 *
 * Writes OR into the destination: they never clear bits, so the caller
 * hands over a zeroed buffer with enough capacity. Reads past the end of
 * the buffer see zero bits and never throw.
 *
 * Prefix codes are sent most-significant bit first (§3.1.1), the opposite
 * of every other field; `rev` is the 15-bit mirror table that lets a
 * canonical-code builder flip a code once, up front, so it can travel
 * through the same LSB-first accessors.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `readBits(buf, bitPos, mask)` | up to 16 bits at `bitPos`, masked |
 * | `readBits16(buf, bitPos)` | up to 24 bits at `bitPos`, **not** masked |
 * | `writeBits(buf, bitPos, v)` | writes up to 16 bits (OR-into) |
 * | `writeBits16(buf, bitPos, v)` | writes up to 24 bits (OR-into) |
 * | `byteOffset(bitPos)` | `ceil(bitPos / 8)` |
 * | `slice(buf, start?, end?)` | copied sub-array (not a view) |
 * | `max(arr)` | maximum |
 * | `rev` | `rev[i]` = bit-reverse of `i` in 15 bits |
 */

/**
 * Public surface of `bitstream.factory()`.
 * @typedef {object} BitstreamAPI
 * @property {(buf: Uint8Array, bitPos: number, mask: number) => number} readBits Read up to 16 bits at `bitPos`, masked by `mask`.
 * @property {(buf: Uint8Array, bitPos: number) => number} readBits16 Read up to 24 bits at `bitPos` (unmasked).
 * @property {(buf: Uint8Array, bitPos: number, value: number) => void} writeBits OR up to 16 bits of `value` into `buf` at `bitPos`.
 * @property {(buf: Uint8Array, bitPos: number, value: number) => void} writeBits16 OR up to 24 bits of `value` into `buf` at `bitPos`.
 * @property {(bitPos: number) => number} byteOffset `ceil(bitPos / 8)` as an integer.
 * @property {(buf: Uint8Array, start?: number, end?: number) => Uint8Array} slice Copying subarray slice.
 * @property {(arr: ArrayLike<number>) => number} max Maximum value in `arr`.
 * @property {Uint16Array} rev 15-bit bit-reversal table (length 32768) for canonical Huffman.
 */

export const bitstream = {
    name: 'bitstream',
    version: '1.0.0',
    type: 'fw.io.compress',
    dependencies: [],

    /** @returns {BitstreamAPI} */
    factory() {

        // --- RFC 1951 §3.1.1 bit packing: reads ---
        //
        // An index past the end of `buf` yields `undefined`, which the
        // bitwise operators coerce to 0: a read near the tail sees zero
        // padding instead of throwing.

        /**
         * Two-byte window at `bitPos`, shifted down to the bit offset and
         * masked. Valid while `width + (bitPos & 7) <= 16`.
         *
         * @param {Uint8Array} buf
         * @param {number} bitPos Absolute bit index.
         * @param {number} mask `(1 << width) - 1`, precomputed by the caller.
         * @returns {number}
         */
        function readBits(buf, bitPos, mask) {
            const at = bitPos >>> 3;
            const window = buf[at] | buf[at + 1] << 8;
            return (window >>> (bitPos & 7)) & mask;
        }

        /**
         * Three-byte window at `bitPos`, shifted down to the bit offset and
         * left unmasked - the caller keeps the low bits it needs. Valid while
         * `width + (bitPos & 7) <= 24`.
         *
         * @param {Uint8Array} buf
         * @param {number} bitPos Absolute bit index.
         * @returns {number}
         */
        function readBits16(buf, bitPos) {
            const at = bitPos >>> 3;
            const window = buf[at] | buf[at + 1] << 8 | buf[at + 2] << 16;
            return window >>> (bitPos & 7);
        }

        // --- RFC 1951 §3.1.1 bit packing: writes ---
        //
        // The value is shifted to the bit offset once, then split over the
        // window bytes; a Uint8Array store keeps the low 8 bits, so anything
        // above the window is dropped, and a store past the end is a no-op.

        /**
         * OR `value` into the two-byte window at `bitPos`.
         *
         * @param {Uint8Array} buf Zeroed at the target bits.
         * @param {number} bitPos Absolute bit index.
         * @param {number} value Field value, at most `16 - (bitPos & 7)` bits wide.
         * @returns {void}
         */
        function writeBits(buf, bitPos, value) {
            const at = bitPos >>> 3;
            const placed = value << (bitPos & 7);
            buf[at] |= placed;
            buf[at + 1] |= placed >>> 8;
        }

        /**
         * OR `value` into the three-byte window at `bitPos`.
         *
         * @param {Uint8Array} buf Zeroed at the target bits.
         * @param {number} bitPos Absolute bit index.
         * @param {number} value Field value, at most `24 - (bitPos & 7)` bits wide.
         * @returns {void}
         */
        function writeBits16(buf, bitPos, value) {
            const at = bitPos >>> 3;
            const placed = value << (bitPos & 7);
            buf[at] |= placed;
            buf[at + 1] |= placed >>> 8;
            buf[at + 2] |= placed >>> 16;
        }

        // --- Byte helpers ---

        /**
         * Number of bytes a stream of `bitPos` bits occupies.
         *
         * @param {number} bitPos
         * @returns {number} `ceil(bitPos / 8)`.
         */
        function byteOffset(bitPos) {
            return (bitPos + 7) >>> 3;
        }

        /**
         * Copy of `buf[start, end)` in a fresh `Uint8Array` (never a view,
         * even when `buf` is a subclass whose own `slice` shares memory).
         * A missing or negative `start` means 0; a missing or oversized
         * `end` means `buf.length`.
         *
         * @param {Uint8Array} buf
         * @param {number} [start]
         * @param {number} [end]
         * @returns {Uint8Array}
         */
        function slice(buf, start, end) {
            const from = start == null || start < 0 ? 0 : start;
            const to = end == null || end > buf.length ? buf.length : end;
            return new Uint8Array(buf.subarray(from, to));
        }

        /**
         * Largest element of `arr`; `arr[0]` (i.e. `undefined`) when empty.
         *
         * @param {ArrayLike<number>} arr
         * @returns {number}
         */
        function max(arr) {
            let top = arr[0];
            for (let k = arr.length - 1; k > 0; --k) {
                const v = arr[k];
                if (v > top) top = v;
            }
            return top;
        }

        // --- 15-bit mirror table (prefix codes travel MSB-first) ---
        //
        // Dropping the low bit of `code` and mirroring the rest equals the
        // mirror of `code` shifted one place toward the low end; the dropped
        // bit then lands on the top position (bit 14). One pass in index
        // order fills the table from entries it has already written.

        const rev = new Uint16Array(0x8000);
        for (let code = 1; code < 0x8000; code++) {
            rev[code] = ((code & 1) << 14) | (rev[code >> 1] >> 1);
        }

        return {
            rev,
            byteOffset,
            readBits, writeBits,
            readBits16, writeBits16,
            slice, max,
        };
    },
};
