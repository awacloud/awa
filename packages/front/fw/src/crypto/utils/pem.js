// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview PEM (Privacy-Enhanced Mail) encoding for DER blobs (RFC 7468).
 *
 * Wraps an arbitrary DER byte array as `-----BEGIN <LABEL>-----` /
 * `-----END <LABEL>-----` with the body base64-encoded and line-wrapped at
 * 64 characters per RFC 7468 §3. Decoding accepts either CRLF or LF line
 * endings, ignores whitespace, and validates the label match.
 *
 * Common labels: `CERTIFICATE`, `PUBLIC KEY`, `PRIVATE KEY`,
 * `RSA PRIVATE KEY`, `EC PRIVATE KEY`, `ENCRYPTED PRIVATE KEY`.
 *
 */

import { b64 } from '../../io/codec/b64.js';

/**
 * Public shape returned by `pem.factory()`.
 * @typedef {object} PemAPI
 * @property {string} name Module name (`'pem'`).
 * @property {(bytes: Uint8Array, label: string) => string} encode Encode bytes as a PEM block.
 * @property {(text: string, expectLabel?: string) => ({label:string, bytes:Uint8Array}|false)} decode Decode a single PEM block.
 */

export const pem = {
    name: 'pem',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['b64'],
    deps: [b64],

    /** @returns {PemAPI} */
    factory(b64) {

        function _wrapLines(s, w) {
            let out = '';
            for (let i = 0; i < s.length; i += w) {
                out += s.substring(i, i + w) + '\n';
            }
            return out;
        }

        /**
         * Encode raw bytes as PEM with the given label.
         * @param {Uint8Array} bytes DER content.
         * @param {string} label Label without dashes (e.g. "PRIVATE KEY").
         * @returns {string}
         */
        function encode(bytes, label) {
            const body = b64.fromBytes(bytes);
            return `-----BEGIN ${label}-----\n${_wrapLines(body, 64)}-----END ${label}-----\n`;
        }

        /**
         * Decode a single PEM block. Bundles containing multiple
         * `-----BEGIN/END-----` blocks (e.g. certificate chains) are
         * **not** supported by this function - only the first block is
         * returned. Callers requiring multi-block parsing must split
         * the input manually and decode each block independently.
         *
         * @param {string} text PEM text (single block).
         * @param {string} [expectLabel] If set, fail unless the label matches.
         * @returns {{label:string, bytes:Uint8Array}|false}
         */
        function decode(text, expectLabel) {
            const m = text.match(/-----BEGIN ([^-]+)-----([\s\S]+?)-----END ([^-]+)-----/);
            if (!m) {
                console.warn('[crypto] INVALID: pem: no BEGIN/END markers');
                return false;
            }
            const label = m[1].trim();
            const endLabel = m[3].trim();
            if (label !== endLabel) {
                console.warn('[crypto] INVALID: pem: BEGIN/END label mismatch');
                return false;
            }
            if (expectLabel && label !== expectLabel) {
                console.warn(`[crypto] INVALID: pem: expected ${expectLabel}, got ${label}`);
                return false;
            }
            const body = m[2].replace(/\s+/g, '');
            return { label, bytes: b64.toBytes(body) };
        }

        return { name: 'pem', encode, decode };
    }
};
