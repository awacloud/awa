// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Base64 encoding and decoding utilities for converting between byte arrays and Base64 strings.
 * Implements standard Base64 encoding (RFC 4648) with padding.
 *
 * @example
 * const { b64 } = registry.resolve('b64');
 * const encoded = b64.fromBytes(new Uint8Array([72, 101, 108, 108, 111])); // "SGVsbG8="
 * const decoded = b64.toBytes('SGVsbG8='); // Uint8Array [72, 101, 108, 108, 111]
 * const valid = b64.test('SGVsbG8='); // true
 */

/**
 * @typedef {object} Base64API
 * @property {(bytes: Uint8Array|number[]) => string} fromBytes
 * @property {(str: string) => Uint8Array} toBytes
 * @property {(str: string) => boolean} test
 */
export const b64 = {
    name: 'b64',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: [],

    /**
     * Factory function that creates Base64 encoder/decoder instance.
     *
     * @returns {Base64API} Object containing Base64 encoding/decoding methods
     *
     * @example
     * const codec = b64.factory();
     * const encoded = codec.fromBytes(new Uint8Array([65, 66, 67]));
     * console.log(encoded); // "QUJD"
     */
    factory() {
        const byteToB64 = [];
        const b64Char = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

        // Initialize lookup table for decoding
        for (let m = 0; m < 64; m++) {
            byteToB64[b64Char.charCodeAt(m)] = m;
        }

        /**
         * Converts a 24-bit number to 4 Base64 characters
         * @private
         * @param {number} num - 24-bit number to convert
         * @returns {string} 4 Base64 characters
         */
        function _numTob64(num) {
            return (
                b64Char[(num >> 18) & 0x3f] +
                b64Char[(num >> 12) & 0x3f] +
                b64Char[(num >> 6) & 0x3f] +
                b64Char[num & 0x3f]
            );
        }

        /**
         * Converts 4 Base64 characters to a 24-bit number
         * @private
         * @param {string} a - First Base64 character
         * @param {string} b - Second Base64 character
         * @param {string} c - Third Base64 character
         * @param {string} d - Fourth Base64 character
         * @returns {number} 24-bit number
         */
        function _b64ToNum(a, b, c, d) {
            return (
                (byteToB64[a.charCodeAt(0)] << 18) |
                (byteToB64[b.charCodeAt(0)] << 12) |
                (byteToB64[c.charCodeAt(0)] << 6) |
                byteToB64[d.charCodeAt(0)]
            );
        }

        /**
         * Encodes remaining 1 byte with padding
         * @private
         * @param {Array<string>} arr - Output array
         * @param {number} remain - Remaining byte
         */
        function _enc_remain1(arr, remain) {
            arr.push(b64Char[remain >> 2]);
            arr.push(b64Char[(remain << 4) & 0x3f]);
            arr.push('==');
        }

        /**
         * Encodes remaining 2 bytes with padding
         * @private
         * @param {Array<string>} arr - Output array
         * @param {number} remain - Combined 2 remaining bytes
         */
        function _enc_remain2(arr, remain) {
            arr.push(b64Char[remain >> 10]);
            arr.push(b64Char[(remain >> 4) & 0x3f]);
            arr.push(b64Char[(remain << 2) & 0x3f]);
            arr.push('=');
        }

        /**
         * Internal encoding implementation
         * @private
         * @param {Uint8Array} bytes - Bytes to encode
         * @param {Array<string>} arr - Output array
         * @param {number} len - Length of bytes
         * @param {number} remain - Number of remaining bytes (0, 1, or 2)
         * @returns {string} Base64 encoded string
         */
        function _encode(bytes, arr, len, remain) {
            len = len - remain;

            for (let i = 0; i < len; i += 3) {
                arr.push(
                    _numTob64(
                        (bytes[i] << 16) + (bytes[i + 1] << 8) + bytes[i + 2]
                    )
                );
            }

            len = bytes.length;

            if (remain === 1) {
                _enc_remain1(arr, bytes[len - 1]);
            } else if (remain === 2) {
                _enc_remain2(arr, (bytes[len - 2] << 8) + bytes[len - 1]);
            }

            return arr.join('');
        }

        /**
         * Decodes remaining 1 byte from Base64
         * @private
         * @param {Array<number>} arr - Output array
         * @param {number} remain - Decoded value
         */
        function _dec_remain1(arr, remain) {
            arr.push((remain >> 8) & 0xff);
            arr.push(remain & 0xff);
        }

        /**
         * Internal decoding implementation
         * @private
         * @param {string} str - Base64 string to decode
         * @param {Array<number>} arr - Output array
         * @param {number} num - Temporary number storage
         * @param {number} len - Length of string
         * @param {number} remain - Number of remaining characters
         * @returns {Uint8Array} Decoded bytes
         */
        function _decode(str, arr, num, len, remain) {
            if (str[len - 2] === '=') remain = 2;
            else if (str[len - 1] === '=') remain = 1;

            len = remain > 0 ? len - 4 : len;

            let i;
            for (i = 0; i < len; i += 4) {
                num = _b64ToNum(str[i], str[i + 1], str[i + 2], str[i + 3]);
                arr.push((num >> 16) & 0xff);
                arr.push((num >> 8) & 0xff);
                arr.push(num & 0xff);
            }

            if (remain === 2) {
                arr.push(
                    ((byteToB64[str.charCodeAt(i)] << 2) | (byteToB64[str.charCodeAt(i + 1)] >> 4)) & 0xff
                );
            } else if (remain === 1) {
                _dec_remain1(arr, (
                    (byteToB64[str.charCodeAt(i)] << 10) |
                    (byteToB64[str.charCodeAt(i + 1)] << 4) |
                    (byteToB64[str.charCodeAt(i + 2)] >> 2)
                ));
            }

            return new Uint8Array(arr);
        }

        /**
         * Encodes a byte array to a Base64 string
         *
         * @param {Uint8Array|Array<number>} bytes - Byte array to encode
         * @returns {string} Base64 encoded string with padding
         *
         * @example
         * const bytes = new Uint8Array([72, 101, 108, 108, 111]);
         * const encoded = fromBytes(bytes); // "SGVsbG8="
         */
        const fromBytes = function (bytes) {
            // @ts-ignore - _encode accepts number[]|Uint8Array; TS infers Uint8Array only
            return _encode(bytes, [], bytes.length, bytes.length % 3);
        };

        /**
         * Decodes a Base64 string to a byte array
         *
         * @param {string} str - Base64 string to decode
         * @returns {Uint8Array} Decoded byte array
         *
         * @example
         * const decoded = toBytes('SGVsbG8=');
         * console.log(decoded); // Uint8Array [72, 101, 108, 108, 111]
         */
        const toBytes = function (str) {
            return _decode(str, [], 0, str.length, 0);
        };

        /**
         * Tests if a string is valid Base64 format
         * Validates that the string contains only valid Base64 characters,
         * has correct padding, and length is a multiple of 4
         *
         * @param {string} str - String to validate
         * @returns {boolean} True if valid Base64, false otherwise
         *
         * @example
         * test('SGVsbG8='); // true
         * test('Hello!'); // false
         * test('SGVsbG8'); // false (missing padding)
         */
        const test = function(str) {
            return /^(?=(.{4})*$)[A-Za-z0-9+/]*={0,2}$/.test(str);
        };

        return { fromBytes, toBytes, test };
    }
};