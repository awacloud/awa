// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Bit-array utility library.
 *
 * Origin: adapted from the Stanford JavaScript Crypto Library (SJCL),
 * BSD-2-Clause (SJCL is dual-licensed BSD-2-Clause OR GPL-2.0-or-later; the
 * BSD-2-Clause terms are retained, see third-party/NOTICE-sjcl); the ESM
 * factory, JSDoc, tests and every later change are this project's own work.
 * See docs/dev/provenance.md.
 *
 * A **bit array** is a plain JavaScript `number[]` where each element is an
 * unsigned 32-bit integer. The last element may be a "partial word" whose
 * active bit-count is encoded in the upper bits via the formula
 * `word + len * 0x10000000000`, where `len ∈ [1, 31]`.  A full 32-bit word
 * has no tag; `getPartial` returns `32` for it.
 *
 * All public methods are pure (no side effects on inputs) unless explicitly
 * noted (e.g. `byteswapM` mutates in-place).
 *
 * @typedef {number[]} bitArray
 *
 */

/**
 * Public shape returned by `bitArray.factory()`.
 *
 * Every member operates on `number[]` bit arrays (SJCL 32-bit word arrays),
 * except the explicit byte-conversion helpers which bridge to `Uint8Array`.
 *
 * @typedef {object} BitArrayAPI
 * @property {(arr: number[]) => Uint8Array} ba_to_ui8 Convert a bit array to a `Uint8Array`.
 * @property {(arr: Uint8Array | number[]) => number[]} ui8_to_ba Convert a byte array to a bit array (big-endian packing).
 * @property {(a: number[], bstart: number, bend?: number) => number[]} bitSlice Slice a bit array in units of bits.
 * @property {(a: number[], bstart: number, blength: number) => number} extract Extract a number packed into a bit array.
 * @property {(a1: number[], a2: number[]) => number[]} concat Concatenate two bit arrays.
 * @property {(a: number[]) => number} bitLength Length of a bit array, in bits.
 * @property {(a: number[], len: number) => number[]} clamp Truncate a bit array to `len` bits.
 * @property {(len: number, x: number, _end?: number) => number} partial Build a partial word.
 * @property {(x: number) => number} getPartial Number of bits used by a partial word.
 * @property {(a: number[], b: number[]) => boolean} equal Constant-time equality of two bit arrays.
 * @property {(a: number[], shift: number, carry?: number, out?: number[]) => number[]} _shiftRight Shift a bit array right (private).
 * @property {(x: number[], y: number[]) => number[]} _xor4 XOR two 4-word blocks element-wise (private).
 * @property {(a: number[]) => (number[] | false)} byteswapM Byte-swap each word in place; `false` on a partial word.
 */

export const bitArray = {
    name: 'bitArray',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: [],

    /** @returns {BitArrayAPI} */
    factory() {

        const bitArray = {

            /**
             * Convert a bit array to a `Uint8Array`.
             *
             * Iterates over the total bit-length of `arr` in 8-bit steps,
             * extracting each byte by shifting the current 32-bit word left by
             * 8 bits per step (`tmp <<= 8`) and reading the top byte via
             * triple right-shift (`tmp >>> 8 >>> 8 >>> 8`).
             *
             * @param {number[]} arr - Bit array to convert.
             * @returns {Uint8Array} Byte representation of the bit array.
             */
            // memo : word 32 bit --> uint8 ( << 8 )
            ba_to_ui8: function (arr) {
                let out = [], bl = bitArray.bitLength(arr), i, tmp;
                for (i = 0; i < bl / 8; i++) {
                    if ((i & 3) === 0) {
                        tmp = arr[i / 4];
                    }
                    out.push(tmp >>> 8 >>> 8 >>> 8);
                    tmp <<= 8;
                }
                return new Uint8Array(out);
            },
            /**
             * Convert a `Uint8Array` (or any array-like of bytes) to a bit array.
             *
             * Bytes are packed big-endian into 32-bit words.  When the total
             * number of bytes is not a multiple of 4, the final word is created
             * with {@link bitArray.partial} so that the trailing bit-count is
             * correctly encoded.
             *
             * @param {Uint8Array | number[]} arr - Byte array to convert.
             * @returns {number[]} Bit array representation.
             */
            ui8_to_ba: function (arr) {
                let out = [], i, tmp = 0;
                for (i = 0; i < arr.length; i++) {
                    tmp = tmp << 8 | arr[i];
                    if ((i & 3) === 3) {
                        out.push(tmp);
                        tmp = 0;
                    }
                }
                if (i & 3) {
                    out.push(bitArray.partial(8 * (i & 3), tmp));
                }
                return out;
            },
            /**
             * Array slices in units of bits.
             * @param {bitArray} a The array to slice.
             * @param {Number} bstart The offset to the start of the slice, in bits.
             * @param {Number} bend The offset to the end of the slice, in bits.  If this is undefined,
             * slice until the end of the array.
             * @return {bitArray} The requested slice.
             */
            bitSlice: function (a, bstart, bend) {
                a = bitArray._shiftRight(a.slice(bstart / 32), 32 - (bstart & 31)).slice(1);
                return (bend === undefined) ? a : bitArray.clamp(a, bend - bstart);
            },

            /**
             * Extract a number packed into a bit array.
             * @param {bitArray} a The array to slice.
             * @param {Number} bstart The offset to the start of the slice, in bits.
             * @param {Number} blength The length of the number to extract.
             * @return {Number} The requested slice.
             */
            extract: function (a, bstart, blength) {
                // memo: this floor is not necessary at all, but for some reason
                // seems to suppress a bug in the Chromium JIT.
                // pedagogical: var x, sh = floor((-bstart - blength) & 31);
                let x, sh = ((-bstart - blength) & 31) >> 0;
                if ((bstart + blength - 1 ^ bstart) & -32) {
                    // it crosses a boundary
                    x = (a[bstart / 32 | 0] << (32 - sh)) ^ (a[bstart / 32 + 1 | 0] >>> sh);
                } else {
                    // within a single word
                    x = a[bstart / 32 | 0] >>> sh;
                }
                return x & ((1 << blength) - 1);
            },

            /**
             * Concatenate two bit arrays.
             * @param {bitArray} a1 The first array.
             * @param {bitArray} a2 The second array.
             * @return {bitArray} The concatenation of a1 and a2.
             */
            concat: function (a1, a2) {
                if (a1.length === 0 || a2.length === 0) {
                    return a1.concat(a2);
                }

                let last = a1[a1.length - 1], shift = bitArray.getPartial(last);
                if (shift === 32) {
                    return a1.concat(a2);
                } else {
                    return bitArray._shiftRight(a2, shift, last | 0, a1.slice(0, a1.length - 1));
                }
            },

            /**
             * Find the length of an array of bits.
             * @param {bitArray} a The array.
             * @return {Number} The length of a, in bits.
             */
            bitLength: function (a) {
                let l = a.length, x;
                if (l === 0) {
                    return 0;
                }
                x = a[l - 1];
                return (l - 1) * 32 + bitArray.getPartial(x);
            },

            /**
             * Truncate an array.
             *
             * NOTE: when `a` is already shorter than `len` bits, the original
             * reference is returned unchanged (no copy). SJCL behaviour -
             * callers that need an independent buffer should `.slice()` first.
             *
             * @param {bitArray} a The array.
             * @param {Number} len The length to truncate to, in bits.
             * @return {bitArray} A new array, truncated to len bits (or `a`
             *                    itself when shorter than requested).
             */
            clamp: function (a, len) {
                if (a.length * 32 < len) {
                    return a;
                }
                a = a.slice(0, Math.ceil(len / 32));
                let l = a.length;
                len = len & 31;
                if (l > 0 && len) {
                    a[l - 1] = bitArray.partial(len, a[l - 1] & 0x80000000 >> (len - 1), 1);
                }
                return a;
            },

            /**
             * Make a partial word for a bit array.
             * @param {Number} len The number of bits in the word.
             * @param {Number} x The bits.
             * @param {Number} [_end=0] Pass 1 if x has already been shifted to the high side.
             * @return {Number} The partial word.
             */
            partial: function (len, x, _end) {
                if (len === 32) {
                    return x;
                }
                return (_end ? x | 0 : x << (32 - len)) + len * 0x10000000000;
            },

            /**
             * Get the number of bits used by a partial word.
             * @param {Number} x The partial word.
             * @return {Number} The number of bits used by the partial word.
             */
            getPartial: function (x) {
                return Math.round(x / 0x10000000000) || 32;
            },

            /**
             * Compare two arrays for equality in a predictable amount of time.
             * @param {bitArray} a The first array.
             * @param {bitArray} b The second array.
             * @return {boolean} true if a == b; false otherwise.
             */
            equal: function (a, b) {
                if (bitArray.bitLength(a) !== bitArray.bitLength(b)) {
                    return false;
                }
                let x = 0, i;
                for (i = 0; i < a.length; i++) {
                    x |= a[i] ^ b[i];
                }
                return (x === 0);
            },

            /** Shift an array right.
             * @param {bitArray} a The array to shift.
             * @param {Number} shift The number of bits to shift.
             * @param {Number} [carry=0] A byte to carry in
             * @param {bitArray} [out=[]] An array to prepend to the output.
             * @private
             */
            _shiftRight: function (a, shift, carry, out) {
                let i, last2, shift2;
                if (out === undefined) {
                    out = [];
                }

                for (; shift >= 32; shift -= 32) {
                    out.push(carry);
                    carry = 0;
                }
                if (shift === 0) {
                    return out.concat(a);
                }

                for (i = 0; i < a.length; i++) {
                    out.push(carry | a[i] >>> shift);
                    carry = a[i] << (32 - shift);
                }
                last2 = a.length ? a[a.length - 1] : 0;
                shift2 = bitArray.getPartial(last2);
                out.push(bitArray.partial(shift + shift2 & 31, (shift + shift2 > 32) ? carry : out.pop(), 1));
                return out;
            },

            /**
             * XOR two blocks of exactly 4 words element-wise.
             *
             * @param {number[]} x - First 4-word block.
             * @param {number[]} y - Second 4-word block.
             * @returns {number[]} New 4-element array with `x[i] ^ y[i]`.
             * @private
             */
            _xor4: function (x, y) {
                return [x[0] ^ y[0], x[1] ^ y[1], x[2] ^ y[2], x[3] ^ y[3]];
            },

            /**
             * Byte-swap every 32-bit word in `a` **in place**.
             *
             * Reverses the byte order within each word:
             * `0x12345678 → 0x78563412`.  Partial words are not handled
             * correctly: the function emits a `console.warn` and returns `a`
             * unchanged when the last word is partial.
             *
             * @param {number[]} a - Word array to swap in place.
             * @returns {number[]|false} The same array `a` with bytes swapped,
             *                           or `false` if `a` contains a partial word.
             */
            byteswapM: function (a) {
                if (a.length > 0 && bitArray.getPartial(a[a.length - 1]) !== 32) {
                    console.warn('[crypto] INVALID: bitArray.byteswapM: partial words not supported');
                    return false;
                }
                let i, v, m = 0xff00;
                for (i = 0; i < a.length; ++i) {
                    v = a[i];
                    a[i] = (v >>> 24) | ((v >>> 8) & m) | ((v & m) << 8) | (v << 24);
                }
                return a;
            }
        };

        return bitArray;
    }
};