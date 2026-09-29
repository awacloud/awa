// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview WebCrypto-backed digest module wrapping `crypto.subtle.digest`.
 *
 * Supports the four algorithms WebCrypto mandates: SHA-1, SHA-256, SHA-384,
 * SHA-512 (FIPS 180-4). Async, `Uint8Array` in / `Uint8Array` out.
 *
 * This module is an opt-in alternative to the pure-JS sha256/sha512/… modules;
 * those remain the default. For SHA-224, SHA-3, BLAKE2b — use the pure-JS
 * modules; WebCrypto does not support them.
 *
 * No-throw contract (crypto README §1): every operation resolves to a result
 * or `false`. Rejections from `crypto.subtle` are caught and logged.
 *
 * Worker-safe: `crypto.subtle` is available in Web Workers.
 */


/**
 * Object returned by `webcryptoDigest.factory()`.
 * @typedef {object} WebcryptoDigestAPI
 * @property {() => boolean} isAvailable Whether `crypto.subtle` is present.
 * @property {(algorithm: 'SHA-1'|'SHA-256'|'SHA-384'|'SHA-512', data: Uint8Array) => Promise<Uint8Array|false>} digest
 *   Hash `data` with `algorithm`; resolves `false` on error or unsupported algorithm.
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha256 SHA-256 shorthand.
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha384 SHA-384 shorthand.
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha512 SHA-512 shorthand.
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha1
 *   SHA-1 shorthand — emits a deprecation warning; use SHA-256+ for new code.
 */

export const webcryptoDigest = {
    name: 'webcryptoDigest',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    /** @returns {WebcryptoDigestAPI} */
    factory() {

        // Availability guard and supported-algorithm set are defined inside the
        // factory so the closure is serializable to a Worker (no-factory-capture).
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

        /** Algorithms natively supported by WebCrypto (FIPS 180-4 subset). */
        const _SUPPORTED = new Set(['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);

        /**
         * Returns whether `crypto.subtle` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        /**
         * Hash `data` with the given WebCrypto algorithm.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `algorithm` is not one of SHA-1/256/384/512
         * - `data` is not a `Uint8Array`
         * - `crypto.subtle.digest` rejects
         *
         * @param {'SHA-1'|'SHA-256'|'SHA-384'|'SHA-512'} algorithm
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        async function digest(algorithm, data) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!(data instanceof Uint8Array)) {
                console.error('[crypto] INVALID: webcryptoDigest: data must be a Uint8Array');
                return false;
            }
            if (!_SUPPORTED.has(algorithm)) {
                console.error(`[crypto] INVALID: webcryptoDigest: unsupported algorithm '${algorithm}'`);
                return false;
            }
            try {
                // TS 5.7+ types Uint8Array as Uint8Array<ArrayBufferLike>; subtle wants BufferSource.
                const buf = await crypto.subtle.digest(algorithm, /** @type {BufferSource} */ (data));
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoDigest.digest: ' + (e && e.message));
                return false;
            }
        }

        /**
         * SHA-256 digest of `data`.
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha256(data) {
            return digest('SHA-256', data);
        }

        /**
         * SHA-384 digest of `data`.
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha384(data) {
            return digest('SHA-384', data);
        }

        /**
         * SHA-512 digest of `data`.
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha512(data) {
            return digest('SHA-512', data);
        }

        /**
         * SHA-1 digest of `data`.
         *
         * @deprecated SHA-1 is cryptographically broken; use SHA-256+ for new code.
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha1(data) {
            console.warn('[crypto] DEPRECATED: SHA-1 is broken; use SHA-256+');
            return digest('SHA-1', data);
        }

        return { isAvailable, digest, sha256, sha384, sha512, sha1 };
    }
};
