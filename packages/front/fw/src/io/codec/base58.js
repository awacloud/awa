// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Base58 encoding and decoding utilities for converting between byte arrays and Base58 strings.
 * Uses the Bitcoin/IPFS alphabet (no '0', 'O', 'I', 'l' to avoid visual ambiguity).
 * No padding - output length depends on input value. Leading zero bytes are preserved
 * and encoded as leading '1' characters.
 *
 * @example
 * const base58 = registry.resolve('base58');
 * const encoded = base58.fromBytes(new Uint8Array([72, 101, 108, 108, 111])); // "9Ajdvzr"
 * const decoded = base58.toBytes('9Ajdvzr'); // Uint8Array [72, 101, 108, 108, 111]
 * const valid = base58.test('9Ajdvzr'); // true
 */

/**
 * @typedef {object} Base58API
 * @property {(bytes: Uint8Array|number[]) => string} fromBytes
 * @property {(str: string) => Uint8Array} toBytes
 * @property {(str: string) => boolean} test
 */
export const base58 = {
    name: 'base58',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: [],

    /**
     * Factory function that creates Base58 encoder/decoder instance.
     *
     * @returns {Base58API} Object containing Base58 encoding/decoding methods
     *
     * @example
     * const codec = base58.factory();
     * const encoded = codec.fromBytes(new Uint8Array([0, 0, 1]));
     * console.log(encoded); // "112"
     */
    factory() {
        const b58Char = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const charToVal = new Int8Array(128).fill(-1);

        // Initialize lookup table for decoding
        for (let i = 0; i < 58; i++) {
            charToVal[b58Char.charCodeAt(i)] = i;
        }

        /**
         * Encodes a byte array to a Base58 string.
         * Leading zero bytes are preserved as leading '1' characters.
         *
         * @param {Uint8Array|Array<number>} bytes - Byte array to encode
         * @returns {string} Base58 encoded string (no padding)
         *
         * @example
         * const bytes = new Uint8Array([0, 0, 1]);
         * const encoded = fromBytes(bytes); // "112"
         */
        const fromBytes = function (bytes) {
            const len = bytes.length;
            if (len === 0) return '';

            // Count leading zeros
            let zeros = 0;
            while (zeros < len && bytes[zeros] === 0) zeros++;

            // Copy input (we'll mutate it during long-division)
            const input = new Uint8Array(len);
            for (let i = 0; i < len; i++) input[i] = bytes[i] & 0xff;

            // Convert base-256 to base-58 via repeated long-division
            const out = [];
            let start = zeros;
            while (start < len) {
                let remainder = 0;
                for (let i = start; i < len; i++) {
                    const acc = (remainder << 8) + input[i];
                    input[i] = (acc / 58) | 0;
                    remainder = acc % 58;
                }
                out.push(b58Char[remainder]);
                while (start < len && input[start] === 0) start++;
            }

            // Prepend '1' for each leading zero byte
            let result = '';
            for (let i = 0; i < zeros; i++) result += b58Char[0];
            for (let i = out.length - 1; i >= 0; i--) result += out[i];
            return result;
        };

        /**
         * Decodes a Base58 string to a byte array.
         * Leading '1' characters restore leading zero bytes in the output.
         *
         * @param {string} str - Base58 string to decode
         * @returns {Uint8Array} Decoded byte array
         * @throws {Error} If the string contains characters outside the Base58 alphabet
         *
         * @example
         * const decoded = toBytes('112');
         * console.log(decoded); // Uint8Array [0, 0, 1]
         */
        const toBytes = function (str) {
            const len = str.length;
            if (len === 0) return new Uint8Array(0);

            // Count leading '1' (= leading zero bytes)
            const oneCode = b58Char.charCodeAt(0);
            let ones = 0;
            while (ones < len && str.charCodeAt(ones) === oneCode) ones++;

            // Convert input chars to values
            const values = new Int16Array(len);
            for (let i = 0; i < len; i++) {
                const code = str.charCodeAt(i);
                const val = code < 128 ? charToVal[code] : -1;
                if (val < 0) {
                    throw new Error(`Invalid base58 character '${str[i]}' at index ${i}`);
                }
                values[i] = val;
            }

            // Convert base-58 to base-256 via repeated long-division
            const out = [];
            let start = ones;
            while (start < len) {
                let remainder = 0;
                for (let i = start; i < len; i++) {
                    const acc = remainder * 58 + values[i];
                    values[i] = (acc / 256) | 0;
                    remainder = acc & 0xff;
                }
                out.push(remainder);
                while (start < len && values[start] === 0) start++;
            }

            // Build output: leading zero bytes + reversed remainders
            const bytes = new Uint8Array(ones + out.length);
            for (let i = 0; i < out.length; i++) {
                bytes[ones + i] = out[out.length - 1 - i];
            }
            return bytes;
        };

        /**
         * Tests if a string uses only valid Base58 characters.
         * Alphabet : 1-9, A-H, J-N, P-Z, a-k, m-z (no 0, O, I, l).
         * Empty string is considered valid.
         *
         * @param {string} str - String to validate
         * @returns {boolean} True if all characters are in the Base58 alphabet
         *
         * @example
         * test('9Ajdvzr'); // true
         * test('0OIl');    // false - excluded characters
         * test('Hello!');  // false - '!' not in alphabet
         */
        const test = function (str) {
            return /^[1-9A-HJ-NP-Za-km-z]*$/.test(str);
        };

        return { fromBytes, toBytes, test };
    }
};
