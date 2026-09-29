// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Adler32 checksum factory.
 *
 * Implements the Adler-32 rolling checksum algorithm as defined in RFC 1950.
 * Used by Zlib-format compressed data to verify integrity.
 *
 * API mirrors the existing `crc32` factory:
 * ```js
 * const Adler32 = adler32.factory();
 * const instance = new Adler32();
 * instance.append(data);
 * const checksum = instance.get(); // unsigned 32-bit integer: (B << 16) | A
 * ```
 *
 */

/**
 * Public shape of an Adler32 streaming instance.
 * @typedef {object} Adler32Instance
 * @property {(data: Uint8Array) => void} append Update the running checksum with `data`.
 * @property {() => number} get Final Adler32 checksum as an unsigned 32-bit integer.
 */

/**
 * Constructor returned by `adler32.factory()`.
 * @typedef {new () => Adler32Instance} Adler32Ctor
 */

export const adler32 = {
    name: 'adler32',
    version: '1.0.0',
    type: 'fw.io.calc',
    dependencies: [],

    /** @returns {Adler32Ctor} */
    factory() {

        /**
         * Adler32 checksum instance.
         *
         * @constructor
         *
         * @example
         * const a = new Adler32();
         * a.append(new Uint8Array([72, 101, 108, 108, 111]));
         * const checksum = a.get(); // e.g. 0x07C801B5
         */
        function Adler32() {
            this._a = 1;
            this._b = 0;
        }

        /**
         * Append data to the checksum.
         *
         * Uses 2655-byte blocks with fast modular reduction:
         * 65536 ≡ 15 (mod 65521), so after each block:
         * `n = (n & 0xFFFF) + 15 * (n >> 16)` avoids expensive `%` on every byte.
         *
         * @param {Uint8Array} data
         * @returns {void}
         */
        Adler32.prototype.append = function(data) {
            let a = this._a, b = this._b;
            const l = data.length | 0;
            for (let i = 0; i !== l;) {
                const e = Math.min(i + 2655, l);
                for (; i < e; ++i) b += (a += data[i]);
                a = (a & 0xFFFF) + 15 * (a >> 16);
                b = (b & 0xFFFF) + 15 * (b >> 16);
            }
            this._a = a;
            this._b = b;
        };

        /**
         * Return the final Adler32 checksum as an unsigned 32-bit integer.
         *
         * Format: `(B << 16) | A` (RFC 1950 §2.2).
         * When written as big-endian bytes this equals the Adler32 value in a Zlib footer.
         *
         * @returns {number} Unsigned 32-bit checksum.
         */
        Adler32.prototype.get = function() {
            return (((this._b % 65521) << 16) | (this._a % 65521)) >>> 0;
        };

        return Adler32;
    }
};
