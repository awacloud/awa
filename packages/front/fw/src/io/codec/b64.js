// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Base64 encoding and decoding utilities for converting between byte arrays and Base64 strings.
 * Implements standard Base64 encoding (RFC 4648 section 4) with padding, and
 * the URL- and filename-safe alphabet without padding (section 5) under `url`.
 *
 * @example
 * const { b64 } = registry.resolve('b64');
 * const encoded = b64.fromBytes(new Uint8Array([72, 101, 108, 108, 111])); // "SGVsbG8="
 * const decoded = b64.toBytes('SGVsbG8='); // Uint8Array [72, 101, 108, 108, 111]
 * const valid = b64.test('SGVsbG8='); // true
 * const token = b64.url.fromBytes(new Uint8Array([251, 255])); // "-_8"
 * const back = b64.url.toBytes('-_8'); // Uint8Array [251, 255]
 */

/**
 * base64url (RFC 4648 section 5): the `-` / `_` alphabet, no padding.
 * @typedef {object} Base64UrlAPI
 * @property {(bytes: Uint8Array|number[]) => string} fromBytes Encode, without padding.
 * @property {(str: string) => (Uint8Array|false)} toBytes Decode the canonical
 *   unpadded form only: `false` for any other character, a length of 1 mod 4,
 *   or non-zero unused bits in the last character (sections 3.5 and 5), so one
 *   byte string has exactly one accepted spelling.
 * @property {(str: string) => boolean} test `true` when `toBytes` accepts `str`.
 */

/**
 * @typedef {object} Base64API
 * @property {(bytes: Uint8Array|number[]) => string} fromBytes
 * @property {(str: string) => Uint8Array} toBytes
 * @property {(str: string) => boolean} test
 * @property {Base64UrlAPI} url The base64url codec.
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

        // ── Fast paths ──
        //
        // The decoder above is the reference behaviour, kept verbatim: the
        // fast decoder below hands it every input that is not canonical
        // base64. The encoder keeps the original arithmetic (one 24-bit
        // number per 3 bytes, `+` of the shifted bytes, then `& 0x3f` per
        // sextet) and the tail functions above, so every input — arrays of
        // out-of-range numbers and malformed strings included — gives
        // exactly the result it always gave.

        /** Alphabet codes. */
        const b64Code = Uint8Array.from(b64Char, (c) => c.charCodeAt(0));

        /** Whether a `Uint16Array` stores its low byte first (it does on every current platform). */
        const little = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

        /** 12 bits -> their two alphabet codes as one 16-bit unit, in memory order. */
        const pairCode = new Uint16Array(4096);
        for (let v = 0; v < 4096; v++) {
            const a = b64Code[v >> 6], b = b64Code[v & 0x3f];
            pairCode[v] = little ? a | (b << 8) : (a << 8) | b;
        }

        /** Decode table: sextet value, or 64 (bit 6) for a character outside the alphabet. */
        const sextet = new Uint8Array(256).fill(64);
        for (let m = 0; m < 64; m++) sextet[b64Char.charCodeAt(m)] = m;

        // `Uint8Array.prototype.toBase64` / `Uint8Array.fromBase64` (TC39
        // "Uint8Array to/from base64"; JavaScriptCore, SpiderMonkey), read
        // once: a realm without them takes the JS paths.
        // Typed `any`: not in the ES2023 lib the type build targets.
        const U8 = /** @type {any} */ (Uint8Array);
        const nativeTo = typeof U8.prototype.toBase64 === 'function' ? U8.prototype.toBase64 : null;
        const nativeFrom = typeof U8.fromBase64 === 'function' ? U8.fromBase64 : null;

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
         * Encode: the whole 3-byte groups through pair codes in a
         * `Uint16Array` (two 12-bit halves of the original 24-bit number), the
         * last 1-2 bytes through `_enc_remain1` / `_enc_remain2`.
         * @param {Uint8Array|number[]} bytes
         * @returns {string}
         */
        function _encodeFast(bytes) {
            const len = bytes.length;
            const remain = len % 3;
            const whole = len - remain;
            const pairs = new Uint16Array((whole / 3) * 2);
            for (let i = 0, j = 0; i < whole; i += 3, j += 2) {
                const num = (bytes[i] << 16) + (bytes[i + 1] << 8) + bytes[i + 2];
                pairs[j] = pairCode[(num >> 12) & 0xfff];
                pairs[j + 1] = pairCode[num & 0xfff];
            }
            const body = _codesToString(new Uint8Array(pairs.buffer));
            if (remain === 0) return body;
            const tail = [];
            if (remain === 1) _enc_remain1(tail, bytes[len - 1]);
            else _enc_remain2(tail, (bytes[len - 2] << 8) + bytes[len - 1]);
            return body + tail.join('');
        }

        /**
         * Decode canonical base64 — length a multiple of 4, alphabet
         * characters only, `=` only as the final one or two — or return
         * `null` for anything else.
         * @param {string} str
         * @returns {Uint8Array|null}
         */
        function _decodeFast(str) {
            const len = str.length;
            if (len % 4 !== 0) return null;
            if (len === 0) return new Uint8Array(0);
            let pad = 0;
            if (str.charCodeAt(len - 1) === 61) pad = str.charCodeAt(len - 2) === 61 ? 2 : 1;
            else if (str.charCodeAt(len - 2) === 61) return null;   // "x=y": the old decoder reads it its own way
            const out = new Uint8Array((len / 4) * 3 - pad);
            const full = pad ? len - 4 : len;
            let bad = 0, wide = 0, j = 0;
            for (let i = 0; i < full; i += 4) {
                const a = str.charCodeAt(i), b = str.charCodeAt(i + 1), c = str.charCodeAt(i + 2), d = str.charCodeAt(i + 3);
                wide |= a | b | c | d;
                const sa = sextet[a], sb = sextet[b], sc = sextet[c], sd = sextet[d];
                bad |= sa | sb | sc | sd;
                const num = (sa << 18) | (sb << 12) | (sc << 6) | sd;
                out[j++] = num >> 16;
                out[j++] = num >> 8;
                out[j++] = num;
            }
            if (pad) {
                const a = str.charCodeAt(full), b = str.charCodeAt(full + 1);
                const c = pad === 1 ? str.charCodeAt(full + 2) : 65;   // 'A': a zero sextet
                wide |= a | b | c;
                const sa = sextet[a], sb = sextet[b], sc = sextet[c];
                bad |= sa | sb | sc;
                out[j++] = (sa << 2) | (sb >> 4);
                if (pad === 1) out[j] = (sb << 4) | (sc >> 2);
            }
            // A code above 255 indexes past the table (undefined, i.e. 0 in
            // the arithmetic): `wide` catches it, `bad` every other outsider.
            return (bad & 64) || wide > 255 ? null : out;
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
            if (nativeTo && bytes instanceof Uint8Array) return nativeTo.call(bytes);
            return _encodeFast(bytes);
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
            if (typeof str !== 'string') return _decode(str, [], 0, /** @type {any} */ (str).length, 0);
            const len = str.length;
            if (nativeFrom && len % 4 === 0 && len > 0) {
                // The native decoder also accepts whitespace and missing
                // padding, which the old decoder reads differently: its
                // result is kept only when it has the canonical length, which
                // no such input can reach (each skipped character drops
                // output bits), and anything it rejects goes on below.
                const last = str.charCodeAt(len - 1) === 61, prev = str.charCodeAt(len - 2) === 61;
                if (last || !prev) {
                    try {
                        const r = nativeFrom(str);
                        if (r.length === (len / 4) * 3 - (last ? (prev ? 2 : 1) : 0)) return r;
                    } catch { /* not canonical: the JS paths below */ }
                }
            }
            return _decodeFast(str) || _decode(str, [], 0, len, 0);
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

        // ── base64url (RFC 4648 section 5) ──────────────────────────────

        const _B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

        /** @param {Uint8Array|number[]} bytes @returns {string} */
        const urlFromBytes = function (bytes) {
            return fromBytes(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        };

        /** @param {string} s @returns {boolean} the canonical unpadded form */
        const urlTest = function (s) {
            if (typeof s !== 'string' || !/^[A-Za-z0-9\-_]*$/.test(s)) return false;
            const rem = s.length % 4;
            if (rem === 1) return false;
            if (rem === 0) return true;
            const unusedBits = rem === 2 ? 4 : 2;
            return (_B64U.indexOf(s[s.length - 1]) & ((1 << unusedBits) - 1)) === 0;
        };

        /** @param {string} s @returns {Uint8Array|false} */
        const urlToBytes = function (s) {
            if (!urlTest(s)) return false;
            const std = s.replace(/-/g, '+').replace(/_/g, '/');
            return toBytes(std + '='.repeat((4 - (s.length % 4)) % 4));
        };

        const url = { fromBytes: urlFromBytes, toBytes: urlToBytes, test: urlTest };

        return { fromBytes, toBytes, test, url };
    }
};