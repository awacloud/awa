// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * UTF-8 encoding and decoding utilities for converting between strings and byte arrays.
 * Supports the full Unicode range, including 4-byte sequences (codepoints
 * U+10000 .. U+10FFFF, e.g. emoji, math symbols, CJK extensions).
 *
 * Uses the platform `TextEncoder` / `TextDecoder` when available (Node ≥ 11,
 * Bun, Deno, all modern browsers); falls back to a hand-rolled UTF-16 ↔ UTF-8
 * loop on older runtimes. The fallback handles surrogate pairs and emits the
 * U+FFFD replacement character for lone surrogates / malformed sequences.
 *
 * @example
 * const { utf8 } = registry.resolve('utf8');
 * const bytes = utf8.toBytes('Hello 世界 😀'); // full Unicode, including astral
 * const text  = utf8.fromBytes(bytes);        // "Hello 世界 😀"
 */

/**
 * @typedef {object} Utf8API
 * @property {(text: string) => Uint8Array} toBytes
 * @property {(bytes: Uint8Array|number[]) => string} fromBytes
 */
export const utf8 = {
    name: 'utf8',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: [],

    /**
     * Factory function that creates UTF-8 encoder/decoder instance.
     *
     * @returns {Utf8API} Object containing UTF-8 encoding/decoding methods
     */
    factory() {
        const hasTextEncoder = typeof TextEncoder !== 'undefined';
        const hasTextDecoder = typeof TextDecoder !== 'undefined';
        const enc = hasTextEncoder ? new TextEncoder() : null;
        // `fatal: false` matches the lenient fallback (replacement on malformed input).
        const dec = hasTextDecoder ? new TextDecoder('utf-8', { fatal: false }) : null;

        /**
         * Manual UTF-16 → UTF-8 fallback. Decodes surrogate pairs to 4-byte
         * sequences. Lone surrogates are emitted as U+FFFD (EF BF BD).
         * @private
         * @param {string} text
         * @returns {Uint8Array}
         */
        function manualToBytes(text) {
            const len = text.length;
            // Worst case : 3 bytes per BMP char or 4 bytes per surrogate pair (2 units → 4 bytes).
            const arr = new Uint8Array(len * 3);
            let p = 0;
            for (let i = 0; i < len; i++) {
                let cp = text.charCodeAt(i);
                if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < len) {
                    const next = text.charCodeAt(i + 1);
                    if (next >= 0xDC00 && next <= 0xDFFF) {
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (next - 0xDC00);
                        i++;
                    } else {
                        cp = 0xFFFD;
                    }
                } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
                    cp = 0xFFFD;
                }
                if (cp < 0x80) {
                    arr[p++] = cp;
                } else if (cp < 0x800) {
                    arr[p++] = 0xC0 | (cp >> 6);
                    arr[p++] = 0x80 | (cp & 0x3F);
                } else if (cp < 0x10000) {
                    arr[p++] = 0xE0 | (cp >> 12);
                    arr[p++] = 0x80 | ((cp >> 6) & 0x3F);
                    arr[p++] = 0x80 | (cp & 0x3F);
                } else {
                    arr[p++] = 0xF0 | (cp >> 18);
                    arr[p++] = 0x80 | ((cp >> 12) & 0x3F);
                    arr[p++] = 0x80 | ((cp >> 6) & 0x3F);
                    arr[p++] = 0x80 | (cp & 0x3F);
                }
            }
            return arr.subarray(0, p);
        }

        /**
         * Manual UTF-8 → UTF-16 fallback. Bounds-checked: truncated sequences
         * emit U+FFFD instead of reading past the end. Handles 1/2/3/4-byte
         * sequences and emits surrogate pairs for codepoints ≥ U+10000.
         * @private
         * @param {Uint8Array|Array<number>} bytes
         * @returns {string}
         */
        function manualFromBytes(bytes) {
            const out = [];
            const len = bytes.length;
            let i = 0;
            while (i < len) {
                const b1 = bytes[i];
                let cp;
                if (b1 < 0x80) {
                    cp = b1;
                    i += 1;
                } else if (b1 < 0xC0) {
                    // Stray continuation byte.
                    cp = 0xFFFD;
                    i += 1;
                } else if (b1 < 0xE0) {
                    if (i + 1 >= len) { out.push(String.fromCharCode(0xFFFD)); break; }
                    cp = ((b1 & 0x1F) << 6) | (bytes[i + 1] & 0x3F);
                    i += 2;
                } else if (b1 < 0xF0) {
                    if (i + 2 >= len) { out.push(String.fromCharCode(0xFFFD)); break; }
                    cp = ((b1 & 0x0F) << 12)
                        | ((bytes[i + 1] & 0x3F) << 6)
                        | (bytes[i + 2] & 0x3F);
                    i += 3;
                } else if (b1 < 0xF8) {
                    if (i + 3 >= len) { out.push(String.fromCharCode(0xFFFD)); break; }
                    cp = ((b1 & 0x07) << 18)
                        | ((bytes[i + 1] & 0x3F) << 12)
                        | ((bytes[i + 2] & 0x3F) << 6)
                        | (bytes[i + 3] & 0x3F);
                    i += 4;
                } else {
                    cp = 0xFFFD;
                    i += 1;
                }
                if (cp < 0x10000) {
                    out.push(String.fromCharCode(cp));
                } else {
                    cp -= 0x10000;
                    out.push(String.fromCharCode(0xD800 | (cp >> 10), 0xDC00 | (cp & 0x3FF)));
                }
            }
            return out.join('');
        }

        /**
         * Converts a string to a UTF-8 encoded byte array.
         *
         * @param {string} text - String to encode
         * @returns {Uint8Array} UTF-8 encoded byte array
         *
         * @example
         * toBytes('Hello'); // Uint8Array [72, 101, 108, 108, 111]
         * toBytes('😀');     // Uint8Array [240, 159, 152, 128]
         */
        const toBytes = function (text) {
            if (text === '' || text == null) return new Uint8Array(0);
            if (enc) return enc.encode(String(text));
            return manualToBytes(String(text));
        };

        /**
         * Converts a UTF-8 encoded byte array to a string.
         * Handles 1/2/3/4-byte sequences. Malformed input is replaced with U+FFFD.
         *
         * @param {Uint8Array|Array<number>} bytes - UTF-8 encoded byte array
         * @returns {string} Decoded string
         *
         * @example
         * fromBytes(new Uint8Array([72, 101, 108, 108, 111])); // "Hello"
         * fromBytes(new Uint8Array([240, 159, 152, 128]));     // "😀"
         */
        const fromBytes = function (bytes) {
            if (!bytes || bytes.length === 0) return '';
            if (dec) {
                // TextDecoder requires a typed array view.
                const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
                return dec.decode(u8);
            }
            return manualFromBytes(bytes);
        };

        return { toBytes, fromBytes };
    }
};