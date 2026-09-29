// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Base32 encoding and decoding utilities for converting between byte arrays and Base32 strings.
 * Implements standard Base32 encoding (RFC 4648) with padding.
 * Uppercase alphabet: A-Z and 2-7, padding with '='.
 *
 * @example
 * const base32 = registry.resolve('base32');
 * const encoded = base32.fromBytes(new Uint8Array([72, 101, 108, 108, 111])); // "JBSWY3DP"
 * const decoded = base32.toBytes('JBSWY3DP'); // Uint8Array [72, 101, 108, 108, 111]
 * const valid = base32.test('JBSWY3DP'); // true
 */

/**
 * @typedef {object} Base32API
 * @property {(bytes: Uint8Array|number[]) => string} fromBytes
 * @property {(str: string) => Uint8Array} toBytes
 * @property {(str: string) => boolean} test
 */
export const base32 = {
    name: 'base32',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: [],

    /**
     * Factory function that creates Base32 encoder/decoder instance.
     *
     * @returns {Base32API} Object containing Base32 encoding/decoding methods
     *
     * @example
     * const codec = base32.factory();
     * const encoded = codec.fromBytes(new Uint8Array([65, 66, 67]));
     * console.log(encoded); // "IFBEG==="
     */
    factory() {
        const b32Char = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        const charToVal = new Int8Array(128).fill(-1);

        // Initialize lookup table for decoding
        for (let i = 0; i < 32; i++) {
            charToVal[b32Char.charCodeAt(i)] = i;
        }

        /**
         * Encodes a byte array to a Base32 string.
         * Pads output to a multiple of 8 characters with '='.
         *
         * @param {Uint8Array|Array<number>} bytes - Byte array to encode
         * @returns {string} Base32 encoded string with padding
         *
         * @example
         * const bytes = new Uint8Array([72, 101, 108, 108, 111]);
         * const encoded = fromBytes(bytes); // "JBSWY3DP"
         */
        const fromBytes = function (bytes) {
            const len = bytes.length;
            if (len === 0) return '';

            const arr = [];
            let buffer = 0;
            let bitsLeft = 0;

            for (let i = 0; i < len; i++) {
                buffer = (buffer << 8) | (bytes[i] & 0xff);
                bitsLeft += 8;
                while (bitsLeft >= 5) {
                    bitsLeft -= 5;
                    arr.push(b32Char[(buffer >> bitsLeft) & 0x1f]);
                }
            }

            if (bitsLeft > 0) {
                arr.push(b32Char[(buffer << (5 - bitsLeft)) & 0x1f]);
            }

            while (arr.length % 8 !== 0) {
                arr.push('=');
            }

            return arr.join('');
        };

        /**
         * Decodes a Base32 string to a byte array.
         * Accepts both uppercase and lowercase input. Padding is optional.
         *
         * @param {string} str - Base32 string to decode
         * @returns {Uint8Array} Decoded byte array
         *
         * @example
         * const decoded = toBytes('JBSWY3DP');
         * console.log(decoded); // Uint8Array [72, 101, 108, 108, 111]
         */
        const toBytes = function (str) {
            // Strip padding
            let end = str.length;
            while (end > 0 && str.charCodeAt(end - 1) === 0x3d) end--;
            if (end === 0) return new Uint8Array(0);

            const arr = [];
            let buffer = 0;
            let bitsLeft = 0;

            for (let i = 0; i < end; i++) {
                let code = str.charCodeAt(i);
                // Normalize lowercase to uppercase
                if (code >= 0x61 && code <= 0x7a) code -= 0x20;
                const val = code < 128 ? charToVal[code] : -1;
                if (val < 0) continue;

                buffer = (buffer << 5) | val;
                bitsLeft += 5;
                if (bitsLeft >= 8) {
                    bitsLeft -= 8;
                    arr.push((buffer >> bitsLeft) & 0xff);
                }
            }

            return new Uint8Array(arr);
        };

        /**
         * Tests if a string is valid Base32 format (RFC 4648).
         * Validates uppercase alphabet (A-Z, 2-7), correct padding, and length multiple of 8.
         *
         * @param {string} str - String to validate
         * @returns {boolean} True if valid Base32, false otherwise
         *
         * @example
         * test('JBSWY3DP'); // true
         * test('JBSWY3DPEB3W64TMMQ======'); // true
         * test('Hello!'); // false
         * test('JBSWY3DP='); // false (invalid padding length)
         */
        const test = function (str) {
            // Length multiple of 8, uppercase alphabet, valid padding counts: 0, 1, 3, 4 or 6
            return /^(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}={6}|[A-Z2-7]{4}={4}|[A-Z2-7]{5}={3}|[A-Z2-7]{7}=)?$/.test(str);
        };

        return { fromBytes, toBytes, test };
    }
};
