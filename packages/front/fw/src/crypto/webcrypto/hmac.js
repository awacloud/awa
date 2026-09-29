// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview WebCrypto-backed HMAC module wrapping `crypto.subtle`.
 *
 * Supports HMAC over SHA-256 (default), SHA-384, SHA-512, and SHA-1 (legacy).
 * Async, `Uint8Array`/`CryptoKey` I/O. Opt-in alternative to the pure-JS
 * `hmac` module, which remains the default.
 *
 * No-throw contract (crypto README §1): every operation resolves to a result
 * or `false`. Rejections from `crypto.subtle` are caught and logged.
 *
 * Worker-safe: `crypto.subtle` is available in Web Workers.
 */

/**
 * Object returned by `webcryptoHmac.factory()`.
 * @typedef {object} WebcryptoHmacAPI
 * @property {() => boolean} isAvailable Whether `crypto.subtle` is present.
 * @property {(rawKey: Uint8Array, hash?: string, extractable?: boolean) => Promise<CryptoKey|false>} importKey
 *   Import a raw key for HMAC under the given hash.
 * @property {(hash?: string, lengthBits?: number, extractable?: boolean) => Promise<CryptoKey|false>} generateKey
 *   Generate a random HMAC key under the given hash.
 * @property {(key: CryptoKey, data: Uint8Array) => Promise<Uint8Array|false>} sign
 *   Compute HMAC tag over `data` with `key`.
 * @property {(key: CryptoKey, signature: Uint8Array, data: Uint8Array) => Promise<boolean>} verify
 *   Verify an HMAC tag; constant-time per platform guarantee.
 * @property {(rawKey: Uint8Array, data: Uint8Array, hash?: string) => Promise<Uint8Array|false>} mac
 *   One-shot: import key then sign.
 */

export const webcryptoHmac = {
    name: 'webcryptoHmac',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    /** @returns {WebcryptoHmacAPI} */
    factory() {

        // Availability guard and supported-hash set are defined inside the
        // factory so the closure is serializable to a Worker (no-factory-capture).
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

        /** Hash algorithms supported for HMAC by WebCrypto. */
        const _SUPPORTED = new Set(['SHA-256', 'SHA-384', 'SHA-512', 'SHA-1']);

        /**
         * Returns whether `crypto.subtle` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        /**
         * Validate hash name; log and return false if unsupported.
         * @param {string} hash
         * @param {string} caller
         * @returns {boolean}
         */
        function _validateHash(hash, caller) {
            if (!_SUPPORTED.has(hash)) {
                console.error(`[crypto] INVALID: ${caller}: unsupported hash '${hash}'`);
                return false;
            }
            return true;
        }

        /**
         * Import a raw key for HMAC under the given hash algorithm.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `hash` is not one of SHA-256/384/512/SHA-1
         * - `crypto.subtle.importKey` rejects
         *
         * @param {Uint8Array} rawKey
         * @param {string} [hash='SHA-256']
         * @param {boolean} [extractable=false]
         * @returns {Promise<CryptoKey|false>}
         */
        async function importKey(rawKey, hash = 'SHA-256', extractable = false) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (hash === 'SHA-1') {
                console.warn('[crypto] DEPRECATED: HMAC-SHA-1');
            }
            if (!_validateHash(hash, 'webcryptoHmac.importKey')) return false;
            try {
                return await crypto.subtle.importKey(
                    'raw',
                    /** @type {BufferSource} */ (rawKey),
                    { name: 'HMAC', hash },
                    extractable,
                    ['sign', 'verify']
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoHmac.importKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Generate a random HMAC `CryptoKey` under the given hash.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `hash` is not one of SHA-256/384/512/SHA-1
         * - `crypto.subtle.generateKey` rejects
         *
         * @param {string} [hash='SHA-256']
         * @param {number} [lengthBits] Optional key length in bits (platform default when omitted).
         * @param {boolean} [extractable=true]
         * @returns {Promise<CryptoKey|false>}
         */
        async function generateKey(hash = 'SHA-256', lengthBits, extractable = true) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (hash === 'SHA-1') {
                console.warn('[crypto] DEPRECATED: HMAC-SHA-1');
            }
            if (!_validateHash(hash, 'webcryptoHmac.generateKey')) return false;
            const algorithm = lengthBits !== undefined
                ? { name: 'HMAC', hash, length: lengthBits }
                : { name: 'HMAC', hash };
            try {
                return await crypto.subtle.generateKey(algorithm, extractable, ['sign', 'verify']);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoHmac.generateKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Compute an HMAC signature (tag) over `data` using `key`.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `crypto.subtle.sign` rejects
         *
         * @param {CryptoKey} key
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        async function sign(key, data) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            try {
                const buf = await crypto.subtle.sign('HMAC', key, /** @type {BufferSource} */ (data));
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoHmac.sign: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Verify an HMAC `signature` over `data` using `key`.
         *
         * The comparison is constant-time per the WebCrypto platform guarantee.
         * Always resolves to a boolean; never rejects.
         *
         * @param {CryptoKey} key
         * @param {Uint8Array} signature
         * @param {Uint8Array} data
         * @returns {Promise<boolean>}
         */
        async function verify(key, signature, data) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            try {
                return await crypto.subtle.verify(
                    'HMAC',
                    key,
                    /** @type {BufferSource} */ (signature),
                    /** @type {BufferSource} */ (data)
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoHmac.verify: ' + (e && e.message));
                return false;
            }
        }

        /**
         * One-shot HMAC: import `rawKey` then sign `data` under `hash`.
         *
         * Resolves `false` on any error (unavailable, unsupported hash, subtle failure).
         *
         * @param {Uint8Array} rawKey
         * @param {Uint8Array} data
         * @param {string} [hash='SHA-256']
         * @returns {Promise<Uint8Array|false>}
         */
        async function mac(rawKey, data, hash = 'SHA-256') {
            const key = await importKey(rawKey, hash, false);
            if (key === false) return false;
            return sign(key, data);
        }

        return { isAvailable, importKey, generateKey, sign, verify, mac };
    }
};
