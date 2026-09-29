// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview WebCrypto-backed Ed25519 (RFC 8032) module wrapping `crypto.subtle`.
 *
 * Provides generate/sign/verify/import/export for the Ed25519 signature scheme.
 * Async, `Uint8Array`/`CryptoKey`/`CryptoKeyPair`. Opt-in alternative to the
 * pure-JS `ed25519` module.
 *
 * Availability caveat: `'Ed25519'` is a recent WebCrypto addition. Older engines
 * (pre-Chrome 113, pre-Firefox 130, pre-Safari 17) may not implement it.
 * When the underlying `crypto.subtle` call rejects, the method catches and
 * resolves `false` — the caller should test `generateKey()` (non-false) before
 * using sign/verify if runtime availability is uncertain.
 *
 * No-throw contract (crypto README §1): every operation resolves to a result
 * or `false`. Rejections from `crypto.subtle` are caught and logged.
 *
 * Worker-safe: `crypto.subtle` is available in Web Workers; no DOM dependency.
 */


/**
 * Object returned by `webcryptoEd25519.factory()`.
 * @typedef {object} WebcryptoEd25519API
 * @property {() => boolean} isAvailable Whether `crypto.subtle` is present.
 * @property {(extractable?: boolean) => Promise<CryptoKeyPair|false>} generateKey
 *   Generate an Ed25519 key pair; resolves `false` if the platform lacks Ed25519.
 * @property {(privateKey: CryptoKey, message: Uint8Array) => Promise<Uint8Array|false>} sign
 *   Sign `message` with `privateKey`; resolves 64-byte `Uint8Array` or `false`.
 * @property {(publicKey: CryptoKey, signature: Uint8Array, message: Uint8Array) => Promise<boolean>} verify
 *   Verify `signature` over `message` with `publicKey`; resolves `boolean` (never rejects).
 * @property {(format: 'raw'|'spki'|'pkcs8'|'jwk', keyData: Uint8Array|object, usages: KeyUsage[], extractable?: boolean) => Promise<CryptoKey|false>} importKey
 *   Import a key from `keyData` in the given `format`.
 * @property {(format: 'raw'|'spki'|'pkcs8'|'jwk', key: CryptoKey) => Promise<Uint8Array|object|false>} exportKey
 *   Export `key` in the given `format`; DER/raw → `Uint8Array`, jwk → object.
 */

export const webcryptoEd25519 = {
    name: 'webcryptoEd25519',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    /** @returns {WebcryptoEd25519API} */
    factory() {

        // Availability guard is defined inside the factory so the closure is
        // serializable to a Worker (no-factory-capture rule).
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

        /** Valid key formats for import/export. */
        const _VALID_FORMATS = new Set(['raw', 'spki', 'pkcs8', 'jwk']);

        /**
         * Returns whether `crypto.subtle` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        /**
         * Generate an Ed25519 key pair.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - The runtime does not support `'Ed25519'` (subtle rejects → caught → false)
         *
         * @param {boolean} [extractable=true]
         * @returns {Promise<CryptoKeyPair|false>}
         */
        async function generateKey(extractable = true) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            try {
                return await crypto.subtle.generateKey('Ed25519', extractable, ['sign', 'verify']);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEd25519.generateKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Sign `message` with an Ed25519 private key.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `privateKey.algorithm.name` is not `'Ed25519'`
         * - `message` is not a `Uint8Array`
         * - `crypto.subtle.sign` rejects
         *
         * @param {CryptoKey} privateKey
         * @param {Uint8Array} message
         * @returns {Promise<Uint8Array|false>}
         */
        async function sign(privateKey, message) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!privateKey || privateKey.algorithm.name !== 'Ed25519') {
                console.error('[crypto] INVALID: webcryptoEd25519.sign: key must be an Ed25519 CryptoKey');
                return false;
            }
            if (!(message instanceof Uint8Array)) {
                console.error('[crypto] INVALID: webcryptoEd25519.sign: message must be a Uint8Array');
                return false;
            }
            try {
                const buf = await crypto.subtle.sign('Ed25519', privateKey, /** @type {BufferSource} */ (message));
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEd25519.sign: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Verify an Ed25519 `signature` over `message` with a public key.
         *
         * Resolves `false` on guard failure or any crypto error (never rejects).
         *
         * @param {CryptoKey} publicKey
         * @param {Uint8Array} signature
         * @param {Uint8Array} message
         * @returns {Promise<boolean>}
         */
        async function verify(publicKey, signature, message) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!publicKey || publicKey.algorithm.name !== 'Ed25519') {
                console.error('[crypto] INVALID: webcryptoEd25519.verify: key must be an Ed25519 CryptoKey');
                return false;
            }
            if (!(signature instanceof Uint8Array)) {
                console.error('[crypto] INVALID: webcryptoEd25519.verify: signature must be a Uint8Array');
                return false;
            }
            if (!(message instanceof Uint8Array)) {
                console.error('[crypto] INVALID: webcryptoEd25519.verify: message must be a Uint8Array');
                return false;
            }
            try {
                return await crypto.subtle.verify(
                    'Ed25519',
                    publicKey,
                    /** @type {BufferSource} */ (signature),
                    /** @type {BufferSource} */ (message)
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEd25519.verify: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Import an Ed25519 key from `keyData`.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `format` is not one of `'raw'|'spki'|'pkcs8'|'jwk'`
         * - `crypto.subtle.importKey` rejects
         *
         * The default `extractable` is `true` for all formats except `'pkcs8'`
         * (private key material) where it defaults to `false`.
         *
         * @param {'raw'|'spki'|'pkcs8'|'jwk'} format
         * @param {Uint8Array|object} keyData  32-byte `Uint8Array` for `'raw'`; JWK object for `'jwk'`; DER `Uint8Array` for `'spki'`/`'pkcs8'`.
         * @param {KeyUsage[]} usages
         * @param {boolean} [extractable]
         * @returns {Promise<CryptoKey|false>}
         */
        async function importKey(format, keyData, usages, extractable) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!_VALID_FORMATS.has(format)) {
                console.error(`[crypto] INVALID: webcryptoEd25519.importKey: unsupported format '${format}'`);
                return false;
            }
            // Default extractable: false for pkcs8 (private key), true otherwise.
            const ext = extractable !== undefined ? extractable : (format !== 'pkcs8');
            try {
                // Branch by format so each overload sees a concrete format + key-data type:
                // 'jwk' takes a JsonWebKey, raw/spki/pkcs8 take a BufferSource.
                if (format === 'jwk') {
                    return await crypto.subtle.importKey(
                        'jwk', /** @type {JsonWebKey} */ (keyData), 'Ed25519', ext, usages
                    );
                }
                return await crypto.subtle.importKey(
                    format, /** @type {BufferSource} */ (keyData), 'Ed25519', ext, usages
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEd25519.importKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Export an Ed25519 key in the given `format`.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `format` is not one of `'raw'|'spki'|'pkcs8'|'jwk'`
         * - `key.algorithm.name` is not `'Ed25519'`
         * - `crypto.subtle.exportKey` rejects (e.g. key is not extractable)
         *
         * @param {'raw'|'spki'|'pkcs8'|'jwk'} format
         * @param {CryptoKey} key
         * @returns {Promise<Uint8Array|object|false>}
         */
        async function exportKey(format, key) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!_VALID_FORMATS.has(format)) {
                console.error(`[crypto] INVALID: webcryptoEd25519.exportKey: unsupported format '${format}'`);
                return false;
            }
            if (!key || key.algorithm.name !== 'Ed25519') {
                console.error('[crypto] INVALID: webcryptoEd25519.exportKey: key must be an Ed25519 CryptoKey');
                return false;
            }
            try {
                // Branch by format: 'jwk' resolves to a JsonWebKey, raw/DER to an ArrayBuffer.
                if (format === 'jwk') {
                    return await crypto.subtle.exportKey('jwk', key);
                }
                return new Uint8Array(await crypto.subtle.exportKey(format, key));
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEd25519.exportKey: ' + (e && e.message));
                return false;
            }
        }

        return { isAvailable, generateKey, sign, verify, importKey, exportKey };
    }
};
