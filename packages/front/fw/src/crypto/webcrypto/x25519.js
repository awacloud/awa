// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview WebCrypto-backed X25519 (RFC 7748) key-agreement module.
 *
 * Wraps `crypto.subtle` generate/deriveBits/deriveKey/import/export for the
 * `'X25519'` algorithm. Async, `Uint8Array`/`CryptoKey`/`CryptoKeyPair` I/O.
 *
 * `'X25519'` is a relatively recent WebCrypto algorithm (added in Chrome 113,
 * Firefox 130, Node 22, Bun 1.1). Older engines will cause operations to
 * resolve `false` via the graceful-degradation guard.
 *
 * No-throw contract (crypto README §1): every operation resolves to a result
 * or `false`. Rejections from `crypto.subtle` are caught and logged.
 *
 * Worker-safe: `crypto.subtle` is available in Web Workers.
 */

/**
 * Object returned by `webcryptoX25519.factory()`.
 * @typedef {object} WebcryptoX25519API
 * @property {() => boolean} isAvailable Whether `crypto.subtle` is present.
 * @property {(extractable?: boolean) => Promise<CryptoKeyPair|false>} generateKey
 *   Generate an X25519 key pair.
 * @property {(privateKey: CryptoKey, publicKey: CryptoKey, lengthBits?: number) => Promise<Uint8Array|false>} deriveBits
 *   Derive raw shared-secret bytes (default 256 bits = 32 bytes).
 * @property {(privateKey: CryptoKey, publicKey: CryptoKey, derivedKeyAlg: object, usages: string[], extractable?: boolean) => Promise<CryptoKey|false>} deriveKey
 *   Derive a symmetric `CryptoKey` from the X25519 shared secret.
 * @property {(format: 'raw'|'spki'|'pkcs8'|'jwk', keyData: Uint8Array|object, usages: string[], extractable?: boolean) => Promise<CryptoKey|false>} importKey
 *   Import an X25519 key.
 * @property {(format: 'raw'|'spki'|'pkcs8'|'jwk', key: CryptoKey) => Promise<Uint8Array|object|false>} exportKey
 *   Export an X25519 key; DER/raw → `Uint8Array`, `jwk` → object.
 */

export const webcryptoX25519 = {
    name: 'webcryptoX25519',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    /** @returns {WebcryptoX25519API} */
    factory() {

        // Availability guard and constants are defined inside the factory so the
        // closure is serializable to a Worker (no-factory-capture).
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

        /** Valid import/export formats for X25519 keys. */
        const _FORMATS = new Set(['raw', 'spki', 'pkcs8', 'jwk']);

        /**
         * Returns whether `crypto.subtle` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        /**
         * Log a "NOT READY" error and return false when subtle is absent.
         * @returns {false}
         */
        function _notReady() {
            console.error('[crypto] NOT READY: crypto.subtle unavailable');
            return false;
        }

        /**
         * Generate an X25519 key pair.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - the runtime does not support `'X25519'` (subtle rejects)
         *
         * @param {boolean} [extractable=true]
         * @returns {Promise<CryptoKeyPair|false>}
         */
        async function generateKey(extractable = true) {
            if (!_hasSubtle) return _notReady();
            try {
                // X25519 generateKey always yields a key pair (asymmetric scheme).
                return /** @type {CryptoKeyPair} */ (
                    await crypto.subtle.generateKey('X25519', extractable, ['deriveBits', 'deriveKey'])
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoX25519.generateKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Derive raw shared-secret bytes from `privateKey` and the peer's `publicKey`.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `privateKey.algorithm.name` is not `'X25519'` (cross-kind misuse)
         * - `crypto.subtle.deriveBits` rejects (e.g. engine lacks X25519)
         *
         * @param {CryptoKey} privateKey
         * @param {CryptoKey} publicKey
         * @param {number} [lengthBits=256] Number of bits to derive; must be ≤ 255 for X25519.
         * @returns {Promise<Uint8Array|false>}
         */
        async function deriveBits(privateKey, publicKey, lengthBits = 256) {
            if (!_hasSubtle) return _notReady();
            if (!privateKey || !privateKey.algorithm || privateKey.algorithm.name !== 'X25519') {
                console.error('[crypto] INVALID: webcryptoX25519.deriveBits: privateKey is not an X25519 key');
                return false;
            }
            try {
                const buf = await crypto.subtle.deriveBits(
                    { name: 'X25519', public: publicKey },
                    privateKey,
                    lengthBits
                );
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoX25519.deriveBits: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Derive a symmetric `CryptoKey` from the X25519 shared secret.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `privateKey.algorithm.name` is not `'X25519'`
         * - `crypto.subtle.deriveKey` rejects
         *
         * @param {CryptoKey} privateKey
         * @param {CryptoKey} publicKey
         * @param {object} derivedKeyAlg Algorithm for the derived key (e.g. `{name:'AES-GCM',length:256}`).
         * @param {string[]} usages Usages for the derived key.
         * @param {boolean} [extractable=false]
         * @returns {Promise<CryptoKey|false>}
         */
        async function deriveKey(privateKey, publicKey, derivedKeyAlg, usages, extractable = false) {
            if (!_hasSubtle) return _notReady();
            if (!privateKey || !privateKey.algorithm || privateKey.algorithm.name !== 'X25519') {
                console.error('[crypto] INVALID: webcryptoX25519.deriveKey: privateKey is not an X25519 key');
                return false;
            }
            try {
                return await crypto.subtle.deriveKey(
                    { name: 'X25519', public: publicKey },
                    privateKey,
                    derivedKeyAlg,
                    extractable,
                    /** @type {KeyUsage[]} */ (usages)
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoX25519.deriveKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Import an X25519 key from `raw`/`spki`/`pkcs8`/`jwk`.
         *
         * - `'raw'` imports a 32-byte public key.
         * - `'pkcs8'`/`'jwk'` import private keys.
         * - `extractable` defaults to `false` for `pkcs8`, `true` otherwise.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `format` is not one of `raw`/`spki`/`pkcs8`/`jwk`
         * - `crypto.subtle.importKey` rejects (e.g. invalid data or engine lacks X25519)
         *
         * @param {'raw'|'spki'|'pkcs8'|'jwk'} format
         * @param {Uint8Array|object} keyData
         * @param {string[]} usages
         * @param {boolean} [extractable]
         * @returns {Promise<CryptoKey|false>}
         */
        async function importKey(format, keyData, usages, extractable) {
            if (!_hasSubtle) return _notReady();
            if (!_FORMATS.has(format)) {
                console.error(`[crypto] INVALID: webcryptoX25519.importKey: unsupported format '${format}'`);
                return false;
            }
            const ext = extractable !== undefined ? extractable : format !== 'pkcs8';
            /** @type {KeyUsage[]} */
            const keyUsages = /** @type {KeyUsage[]} */ (usages);
            try {
                // Branch by format so each overload sees a concrete format + key-data type:
                // 'jwk' takes a JsonWebKey, raw/spki/pkcs8 take a BufferSource.
                if (format === 'jwk') {
                    return await crypto.subtle.importKey(
                        'jwk', /** @type {JsonWebKey} */ (keyData), 'X25519', ext, keyUsages
                    );
                }
                return await crypto.subtle.importKey(
                    format, /** @type {BufferSource} */ (keyData), 'X25519', ext, keyUsages
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoX25519.importKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Export `key` in `raw`/`spki`/`pkcs8`/`jwk`.
         *
         * DER/raw formats resolve a `Uint8Array`; `jwk` resolves a plain object.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `format` is not one of `raw`/`spki`/`pkcs8`/`jwk`
         * - `key.algorithm.name` is not `'X25519'`
         * - `crypto.subtle.exportKey` rejects (e.g. non-extractable key)
         *
         * @param {'raw'|'spki'|'pkcs8'|'jwk'} format
         * @param {CryptoKey} key
         * @returns {Promise<Uint8Array|object|false>}
         */
        async function exportKey(format, key) {
            if (!_hasSubtle) return _notReady();
            if (!_FORMATS.has(format)) {
                console.error(`[crypto] INVALID: webcryptoX25519.exportKey: unsupported format '${format}'`);
                return false;
            }
            if (!key || !key.algorithm || key.algorithm.name !== 'X25519') {
                console.error('[crypto] INVALID: webcryptoX25519.exportKey: key is not an X25519 key');
                return false;
            }
            try {
                // Branch by format: 'jwk' resolves to a JsonWebKey, raw/DER to an ArrayBuffer.
                if (format === 'jwk') {
                    return await crypto.subtle.exportKey('jwk', key);
                }
                return new Uint8Array(await crypto.subtle.exportKey(format, key));
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoX25519.exportKey: ' + (e && e.message));
                return false;
            }
        }

        return {
            isAvailable,
            generateKey,
            deriveBits,
            deriveKey,
            importKey,
            exportKey
        };
    }
};
