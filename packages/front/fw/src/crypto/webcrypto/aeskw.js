// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview WebCrypto-backed AES-KW (RFC 3394) key-wrap/unwrap module.
 *
 * Wraps `crypto.subtle.wrapKey` / `unwrapKey` with `AES-KW` as the
 * wrapping algorithm. Supports KEK sizes 128, 192, and 256 bits. Async,
 * `CryptoKey` / `Uint8Array`. Opt-in alternative to the pure-JS `mode/kw`
 * module, which remains the default.
 *
 * Out-of-scope: KWP (with-pad) — WebCrypto exposes AES-KW only. Bulk data
 * encryption → `webcryptoAes`. `bitArray` I/O.
 *
 * No-throw contract (crypto README §1): every operation resolves to a result
 * or `false`. Rejections from `crypto.subtle` are caught and logged.
 *
 * Worker-safe: `crypto.subtle` is available in Web Workers.
 */


/**
 * Object returned by `webcryptoAesKw.factory()`.
 * @typedef {object} WebcryptoAesKwAPI
 * @property {() => boolean} isAvailable Whether `crypto.subtle` is present.
 * @property {(lengthBits?: 128|192|256, extractable?: boolean) => Promise<CryptoKey|false>} generateKek
 *   Generate a new AES-KW KEK.
 * @property {(raw: Uint8Array, extractable?: boolean) => Promise<CryptoKey|false>} importKek
 *   Import raw key bytes as an AES-KW KEK.
 * @property {(kek: CryptoKey, keyToWrap: CryptoKey) => Promise<Uint8Array|false>} wrapKey
 *   Wrap a CryptoKey (must be extractable) with a KEK; returns the wrapped bytes.
 * @property {(kek: CryptoKey, wrapped: Uint8Array, unwrappedKeyAlg: object, usages: KeyUsage[], extractable?: boolean) => Promise<CryptoKey|false>} unwrapKey
 *   Unwrap previously wrapped bytes back to a CryptoKey; resolves `false` on
 *   integrity failure or any subtle error.
 */

export const webcryptoAesKw = {
    name: 'webcryptoAesKw',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    /** @returns {WebcryptoAesKwAPI} */
    factory() {

        // Availability guard and crypto.subtle calls are defined inside the
        // factory so the closure is serializable to a Worker (no-factory-capture).
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

        /** Valid raw KEK byte lengths (16 = 128-bit, 24 = 192-bit, 32 = 256-bit). */
        const _VALID_LENGTHS = new Set([16, 24, 32]);

        /**
         * Returns whether `crypto.subtle` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        /**
         * Generate a new AES-KW key-encryption key.
         *
         * @param {128|192|256} [lengthBits=256] KEK size in bits.
         * @param {boolean} [extractable=true] Whether the CryptoKey may be exported.
         * @returns {Promise<CryptoKey|false>}
         */
        async function generateKek(lengthBits = 256, extractable = true) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (lengthBits !== 128 && lengthBits !== 192 && lengthBits !== 256) {
                console.error('[crypto] INVALID: webcryptoAesKw.generateKek: lengthBits must be 128, 192, or 256');
                return false;
            }
            try {
                return await crypto.subtle.generateKey(
                    { name: 'AES-KW', length: lengthBits },
                    extractable,
                    ['wrapKey', 'unwrapKey']
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoAesKw.generateKek: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Import raw bytes as an AES-KW key-encryption key.
         *
         * @param {Uint8Array} raw Raw key bytes (16, 24, or 32 bytes).
         * @param {boolean} [extractable=false] Whether the CryptoKey may be exported.
         * @returns {Promise<CryptoKey|false>}
         */
        async function importKek(raw, extractable = false) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!(raw instanceof Uint8Array)) {
                console.error('[crypto] INVALID: webcryptoAesKw.importKek: raw must be a Uint8Array');
                return false;
            }
            if (!_VALID_LENGTHS.has(raw.length)) {
                console.error('[crypto] INVALID: webcryptoAesKw.importKek: raw.length must be 16, 24, or 32 bytes');
                return false;
            }
            try {
                return await crypto.subtle.importKey(
                    'raw',
                    /** @type {BufferSource} */ (raw),
                    { name: 'AES-KW' },
                    extractable,
                    ['wrapKey', 'unwrapKey']
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoAesKw.importKek: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Wrap a CryptoKey using AES-KW.
         *
         * The key being wrapped must be `extractable`; WebCrypto enforces this
         * at the platform level (subtle.wrapKey will reject otherwise).
         *
         * @param {CryptoKey} kek The AES-KW key-encryption key.
         * @param {CryptoKey} keyToWrap The key to wrap (must be extractable).
         * @returns {Promise<Uint8Array|false>} Wrapped key bytes or `false` on error.
         */
        async function wrapKey(kek, keyToWrap) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            try {
                const buf = await crypto.subtle.wrapKey('raw', keyToWrap, kek, 'AES-KW');
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoAesKw.wrapKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Unwrap a previously wrapped key using AES-KW.
         *
         * An integrity failure (wrong KEK, tampered bytes) causes `crypto.subtle`
         * to reject — the rejection is caught and `false` is returned.
         *
         * @param {CryptoKey} kek The AES-KW key-encryption key used to wrap.
         * @param {Uint8Array} wrapped The wrapped key bytes.
         * @param {object} unwrappedKeyAlg Algorithm dict of the wrapped key
         *   (e.g. `{ name: 'AES-GCM', length: 256 }`).
         * @param {KeyUsage[]} usages Intended usages for the unwrapped key.
         * @param {boolean} [extractable=false] Whether the unwrapped CryptoKey may be exported.
         * @returns {Promise<CryptoKey|false>}
         */
        async function unwrapKey(kek, wrapped, unwrappedKeyAlg, usages, extractable = false) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            try {
                return await crypto.subtle.unwrapKey(
                    'raw',
                    /** @type {BufferSource} */ (wrapped),
                    kek,
                    'AES-KW',
                    unwrappedKeyAlg,
                    extractable,
                    usages
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoAesKw.unwrapKey: ' + (e && e.message));
                return false;
            }
        }

        return { isAvailable, generateKek, importKek, wrapKey, unwrapKey };
    }
};
