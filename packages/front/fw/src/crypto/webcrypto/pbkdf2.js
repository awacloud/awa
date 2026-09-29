// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview webcryptoPbkdf2 — async PBKDF2 key derivation via crypto.subtle.
 *
 * Wraps `crypto.subtle.importKey` + `deriveBits` / `deriveKey`.
 * Supported PRF hashes: SHA-1, SHA-256, SHA-384, SHA-512.
 * Default iteration count: 600 000 (OWASP recommendation).
 *
 * Worker-safe: yes — pure factory, no DOM, `crypto.subtle` available in workers.
 */

/** @typedef {'SHA-1'|'SHA-256'|'SHA-384'|'SHA-512'} HashName */

export const webcryptoPbkdf2 = {
    name: 'webcryptoPbkdf2',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    factory() {
        // All constants inside the factory — required by fw/no-factory-capture
        // (factory must be serializable to a Worker via runtime.serialize).
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;
        const DEFAULT_ITERATIONS = 600000;
        const SUPPORTED_HASHES = new Set(['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);

        /**
         * Whether `crypto.subtle` is available in the current environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        /**
         * Import a raw password as a PBKDF2 base key.
         * @param {Uint8Array} password
         * @returns {Promise<CryptoKey>}
         */
        function _importKey(password) {
            return crypto.subtle.importKey(
                'raw',
                /** @type {BufferSource} */ (password),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );
        }

        /**
         * Derive raw bits using PBKDF2.
         * @param {Uint8Array} password
         * @param {Uint8Array} salt
         * @param {number} lengthBits  Must be a positive multiple of 8.
         * @param {number} [iterations]  Defaults to 600 000.
         * @param {HashName} [hash]  Defaults to 'SHA-256'.
         * @returns {Promise<Uint8Array|false>}
         */
        async function deriveBits(password, salt, lengthBits, iterations, hash) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }

            const iters = iterations === undefined ? DEFAULT_ITERATIONS : iterations;
            if (!Number.isInteger(iters) || iters < 1) {
                console.error('[crypto] INVALID: webcryptoPbkdf2.deriveBits: iterations must be a positive integer');
                return false;
            }

            if (typeof lengthBits !== 'number' || lengthBits <= 0 || lengthBits % 8 !== 0) {
                console.error('[crypto] INVALID: webcryptoPbkdf2.deriveBits: lengthBits must be a positive multiple of 8');
                return false;
            }

            const h = hash === undefined ? 'SHA-256' : hash;
            if (!SUPPORTED_HASHES.has(h)) {
                console.error('[crypto] INVALID: webcryptoPbkdf2.deriveBits: unsupported hash \'' + h + '\'');
                return false;
            }

            try {
                const baseKey = await _importKey(password);
                const buf = await crypto.subtle.deriveBits(
                    { name: 'PBKDF2', salt: /** @type {BufferSource} */ (salt), iterations: iters, hash: h },
                    baseKey,
                    lengthBits
                );
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoPbkdf2.deriveBits: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Derive a `CryptoKey` using PBKDF2.
         * @param {Uint8Array} password
         * @param {Uint8Array} salt
         * @param {object} derivedKeyAlg  WebCrypto key-algorithm dict
         *   (e.g. `{name:'AES-GCM', length:256}` or `{name:'HMAC', hash:'SHA-256'}`).
         * @param {KeyUsage[]} usages
         * @param {number} [iterations]  Defaults to 600 000.
         * @param {HashName} [hash]  Defaults to 'SHA-256'.
         * @param {boolean} [extractable]  Defaults to false.
         * @returns {Promise<CryptoKey|false>}
         */
        async function deriveKey(password, salt, derivedKeyAlg, usages, iterations, hash, extractable) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }

            const iters = iterations === undefined ? DEFAULT_ITERATIONS : iterations;
            if (!Number.isInteger(iters) || iters < 1) {
                console.error('[crypto] INVALID: webcryptoPbkdf2.deriveKey: iterations must be a positive integer');
                return false;
            }

            const h = hash === undefined ? 'SHA-256' : hash;
            if (!SUPPORTED_HASHES.has(h)) {
                console.error('[crypto] INVALID: webcryptoPbkdf2.deriveKey: unsupported hash \'' + h + '\'');
                return false;
            }

            try {
                const baseKey = await _importKey(password);
                return await crypto.subtle.deriveKey(
                    { name: 'PBKDF2', salt: /** @type {BufferSource} */ (salt), iterations: iters, hash: h },
                    baseKey,
                    derivedKeyAlg,
                    extractable !== undefined ? extractable : false,
                    usages
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoPbkdf2.deriveKey: ' + (e && e.message));
                return false;
            }
        }

        return { isAvailable, deriveBits, deriveKey };
    }
};
