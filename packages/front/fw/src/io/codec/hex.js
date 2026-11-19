// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Hexadecimal encoding and decoding utilities for converting between byte arrays and hex strings.
 * Output uses lowercase hex characters; input accepts both upper- and lowercase.
 *
 * Strict input validation: `toBytes` throws on non-hex characters and on
 * odd-length input.
 *
 * @example
 * const { hex } = registry.resolve('hex');
 * const encoded = hex.fromBytes(new Uint8Array([72, 101, 108, 108, 111])); // "48656c6c6f"
 * const decoded = hex.toBytes('48656c6c6f'); // Uint8Array [72, 101, 108, 108, 111]
 * const valid = hex.test('48656c6c6f'); // true
 */

/**
 * @typedef {object} HexAPI
 * @property {(text: string) => Uint8Array} toBytes
 * @property {(bytes: Uint8Array|number[]) => string} fromBytes
 * @property {(str: string) => boolean} test
 */
export const hex = {
    name: 'hex',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: [],

    /**
     * Factory function that creates hexadecimal encoder/decoder instance.
     *
     * @returns {HexAPI} Object containing hex encoding/decoding methods
     *
     * @example
     * const codec = hex.factory();
     * const encoded = codec.fromBytes(new Uint8Array([255, 0, 128]));
     * console.log(encoded); // "ff0080"
     */
    factory() {
        const hexChar = '0123456789abcdef';

        // Pre-computed nibble lookup table for decoding (index = char code).
        // -1 means "invalid hex digit".
        const charToNibble = new Int8Array(128).fill(-1);
        for (let i = 0; i < 16; i++) {
            charToNibble[hexChar.charCodeAt(i)] = i;
            // Uppercase A-F.
            if (i >= 10) charToNibble['ABCDEF'.charCodeAt(i - 10)] = i;
        }

        /** The 16 digit codes. */
        const hexCode = Uint8Array.from(hexChar, (c) => c.charCodeAt(0));

        /** Whether a `Uint16Array` stores its low byte first (it does on every current platform). */
        const little = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

        /** Byte -> its two digit codes as one 16-bit unit, in memory order. */
        const pairCode = new Uint16Array(256);
        for (let b = 0; b < 256; b++) {
            const hi = hexCode[b >> 4], lo = hexCode[b & 0x0f];
            pairCode[b] = little ? hi | (lo << 8) : (hi << 8) | lo;
        }

        // `Uint8Array.prototype.toHex` (TC39 "Uint8Array to/from base64";
        // JavaScriptCore, SpiderMonkey) gives the same lowercase string;
        // read once, so a realm without it takes the JS path below.
        // Typed `any`: not in the ES2023 lib the type build targets.
        const U8P = /** @type {any} */ (Uint8Array.prototype);
        const nativeToHex = typeof U8P.toHex === 'function' ? U8P.toHex : null;

        // ASCII bytes decode as UTF-8 to the same characters; the platform
        // decoder is several times faster than `String.fromCharCode`, which
        // remains the fallback of a realm without `TextDecoder`.
        const ascii = typeof TextDecoder === 'function' ? new TextDecoder() : null;

        /** Character codes per `String.fromCharCode` call (argument-count limit). */
        const CHUNK = 8192;

        /**
         * A string from ASCII character codes.
         * @param {Uint8Array} codes
         * @returns {string}
         */
        function _codesToString(codes) {
            if (ascii) return ascii.decode(codes);
            if (codes.length <= CHUNK) return String.fromCharCode.apply(null, /** @type {any} */ (codes));
            const parts = [];
            for (let k = 0; k < codes.length; k += CHUNK) {
                parts.push(String.fromCharCode.apply(null, /** @type {any} */ (codes.subarray(k, k + CHUNK))));
            }
            return parts.join('');
        }

        /**
         * Converts a hexadecimal string to a byte array.
         * Accepts upper- or lowercase hex digits (0-9, a-f, A-F).
         *
         * @param {string} text - Hexadecimal string to decode (must have even length).
         * @returns {Uint8Array} Decoded byte array
         * @throws {Error} On odd-length input or on any non-hex character.
         *
         * @example
         * const bytes = toBytes('48656c6c6f');
         * console.log(bytes); // Uint8Array [72, 101, 108, 108, 111]
         *
         * @example
         * const bytes = toBytes('FF00AB');
         * console.log(bytes); // Uint8Array [255, 0, 171]
         */
        const toBytes = (text) => {
            const len = text.length;
            if (len % 2 !== 0) {
                throw new Error(`hex: odd-length input (length ${len})`);
            }
            const arr = new Uint8Array(len >> 1);
            for (let i = 0, j = 0; i < len; i += 2, j++) {
                const c1 = text.charCodeAt(i);
                const c2 = text.charCodeAt(i + 1);
                const hi = c1 < 128 ? charToNibble[c1] : -1;
                const lo = c2 < 128 ? charToNibble[c2] : -1;
                if (hi < 0 || lo < 0) {
                    throw new Error(`hex: invalid character at index ${hi < 0 ? i : i + 1}`);
                }
                arr[j] = (hi << 4) | lo;
            }
            return arr;
        };

        /**
         * Converts a byte array to a hexadecimal string.
         * Output uses lowercase hexadecimal characters (0-9, a-f).
         *
         * @param {Uint8Array|Array<number>} bytes - Byte array to encode
         * @returns {string} Hexadecimal string representation
         *
         * @example
         * const hex = fromBytes(new Uint8Array([72, 101, 108, 108, 111]));
         * console.log(hex); // "48656c6c6f"
         */
        const fromBytes = (bytes) => {
            if (nativeToHex && bytes instanceof Uint8Array) return nativeToHex.call(bytes);
            const n = bytes.length;
            const pairs = new Uint16Array(n);
            // `& 0xff` keeps the old per-byte result for any array element
            // (out-of-range numbers, holes): `(b & 0xf0) >> 4` and `b & 0x0f`.
            for (let i = 0; i < n; i++) pairs[i] = pairCode[bytes[i] & 0xff];
            return _codesToString(new Uint8Array(pairs.buffer));
        };

        /**
         * Tests if a string is a valid hex string (even length, only [0-9a-fA-F]).
         * Empty string is considered valid.
         *
         * @param {string} str - String to validate
         * @returns {boolean} True if valid hex, false otherwise
         *
         * @example
         * test('48656c6c6f'); // true
         * test('FF00AB');     // true
         * test('abc');        // false (odd length)
         * test('XYZ');        // false (non-hex chars)
         */
        const test = (str) => {
            if (typeof str !== 'string') return false;
            if (str.length % 2 !== 0) return false;
            return /^[0-9a-fA-F]*$/.test(str);
        };

        return { toBytes, fromBytes, test };
    }
};