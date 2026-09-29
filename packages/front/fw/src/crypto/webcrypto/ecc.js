// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview WebCrypto-backed elliptic-curve module wrapping `crypto.subtle`.
 *
 * Covers the NIST P-curves WebCrypto supports — ECDSA (sign/verify) and ECDH
 * (deriveBits/deriveKey) on P-256, P-384, P-521 — plus key generate/import/
 * export (raw/spki/pkcs8/jwk). Async, `Uint8Array`/`CryptoKey`/`CryptoKeyPair`
 * I/O. Opt-in alternative to the pure-JS `ecc` module, which remains the default.
 *
 * ECDSA signatures are raw IEEE P1363 `r||s` (NOT ASN.1/DER) — the WebCrypto
 * native form. No DER transcoding is performed here. Curve25519 (Ed25519/X25519)
 * and secp256k1 are out of scope (WebCrypto has no secp256k1).
 *
 * No-throw contract (crypto README §1): every operation resolves to a result
 * or `false`. Rejections from `crypto.subtle` are caught and logged. Cross-kind
 * misuse (sign with an ECDH key, derive with an ECDSA key) is guarded against
 * the key's `algorithm.name` and resolves `false`.
 *
 * Worker-safe: `crypto.subtle` is available in Web Workers.
 */

/**
 * Object returned by `webcryptoEcc.factory()`.
 * @typedef {object} WebcryptoEccAPI
 * @property {() => boolean} isAvailable Whether `crypto.subtle` is present.
 * @property {(kind: 'ECDSA'|'ECDH', curve?: 'P-256'|'P-384'|'P-521', extractable?: boolean) => Promise<CryptoKeyPair|false>} generateKey
 *   Generate an ECDSA or ECDH key pair on the given curve.
 * @property {(privateKey: CryptoKey, data: Uint8Array, hash?: 'SHA-256'|'SHA-384'|'SHA-512') => Promise<Uint8Array|false>} sign
 *   ECDSA sign — raw IEEE P1363 `r||s` output. ECDH key → `false`.
 * @property {(publicKey: CryptoKey, signature: Uint8Array, data: Uint8Array, hash?: 'SHA-256'|'SHA-384'|'SHA-512') => Promise<boolean>} verify
 *   ECDSA verify of a raw `r||s` signature. Resolves `false` on error.
 * @property {(privateKey: CryptoKey, publicKey: CryptoKey, lengthBits: number) => Promise<Uint8Array|false>} deriveBits
 *   ECDH shared-secret derivation. ECDSA key → `false`.
 * @property {(privateKey: CryptoKey, publicKey: CryptoKey, derivedKeyAlg: object, usages: string[], extractable?: boolean) => Promise<CryptoKey|false>} deriveKey
 *   ECDH key derivation into a symmetric `CryptoKey`. ECDSA key → `false`.
 * @property {(format: 'raw'|'spki'|'pkcs8'|'jwk', keyData: Uint8Array|object, kind: 'ECDSA'|'ECDH', curve: 'P-256'|'P-384'|'P-521', usages: string[], extractable?: boolean) => Promise<CryptoKey|false>} importKey
 *   Import a key from raw/SPKI/PKCS8/JWK.
 * @property {(format: 'raw'|'spki'|'pkcs8'|'jwk', key: CryptoKey) => Promise<Uint8Array|object|false>} exportKey
 *   Export a key; DER/raw → `Uint8Array`, `jwk` → object.
 */

export const webcryptoEcc = {
    name: 'webcryptoEcc',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    /** @returns {WebcryptoEccAPI} */
    factory() {

        // Availability guard and validation sets are defined inside the factory
        // so the closure is serializable to a Worker (no-factory-capture).
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

        /** Elliptic curves supported for ECDSA/ECDH by WebCrypto. */
        const _CURVES = new Set(['P-256', 'P-384', 'P-521']);
        /** EC algorithm kinds supported here. */
        const _KINDS = new Set(['ECDSA', 'ECDH']);
        /** Hash algorithms usable with ECDSA. */
        const _HASHES = new Set(['SHA-256', 'SHA-384', 'SHA-512']);
        /** Key import/export formats. */
        const _FORMATS = new Set(['raw', 'spki', 'pkcs8', 'jwk']);

        /**
         * Returns whether `crypto.subtle` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        /**
         * Guard `crypto.subtle` availability; log if absent.
         * @returns {boolean}
         */
        function _ready() {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            return true;
        }

        /**
         * Resolve the algorithm `name` of a `CryptoKey`, or `undefined`.
         * @param {CryptoKey} key
         * @returns {string|undefined}
         */
        function _keyKind(key) {
            return key && key.algorithm && key.algorithm.name;
        }

        /**
         * Generate an ECDSA or ECDH key pair on the given curve.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `kind` is not ECDSA/ECDH or `curve` is not a supported P-curve
         * - `crypto.subtle.generateKey` rejects
         *
         * @param {'ECDSA'|'ECDH'} kind
         * @param {'P-256'|'P-384'|'P-521'} [curve='P-256']
         * @param {boolean} [extractable=true]
         * @returns {Promise<CryptoKeyPair|false>}
         */
        async function generateKey(kind, curve = 'P-256', extractable = true) {
            if (!_ready()) return false;
            if (!_KINDS.has(kind)) {
                console.error(`[crypto] INVALID: webcryptoEcc.generateKey: unsupported kind '${kind}'`);
                return false;
            }
            if (!_CURVES.has(curve)) {
                console.error(`[crypto] INVALID: webcryptoEcc.generateKey: unsupported curve '${curve}'`);
                return false;
            }
            /** @type {KeyUsage[]} */
            const usages = kind === 'ECDSA' ? ['sign', 'verify'] : ['deriveBits', 'deriveKey'];
            try {
                // EC generateKey always yields a key pair (asymmetric scheme).
                return /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey(
                    { name: kind, namedCurve: curve },
                    extractable,
                    usages
                ));
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEcc.generateKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * ECDSA sign `data` with `privateKey`.
         *
         * Output is a raw IEEE P1363 `r||s` signature (NOT ASN.1/DER).
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `hash` is not SHA-256/384/512
         * - `privateKey` is not an ECDSA key (cross-kind misuse)
         * - `crypto.subtle.sign` rejects
         *
         * @param {CryptoKey} privateKey
         * @param {Uint8Array} data
         * @param {'SHA-256'|'SHA-384'|'SHA-512'} [hash='SHA-256']
         * @returns {Promise<Uint8Array|false>}
         */
        async function sign(privateKey, data, hash = 'SHA-256') {
            if (!_ready()) return false;
            if (!_HASHES.has(hash)) {
                console.error(`[crypto] INVALID: webcryptoEcc.sign: unsupported hash '${hash}'`);
                return false;
            }
            if (_keyKind(privateKey) !== 'ECDSA') {
                console.error('[crypto] INVALID: webcryptoEcc.sign: key is not an ECDSA key');
                return false;
            }
            try {
                const buf = await crypto.subtle.sign(
                    { name: 'ECDSA', hash }, privateKey, /** @type {BufferSource} */ (data)
                );
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEcc.sign: ' + (e && e.message));
                return false;
            }
        }

        /**
         * ECDSA verify a raw `r||s` `signature` over `data` with `publicKey`.
         *
         * Always resolves to a boolean; never rejects. Resolves `false` when
         * `crypto.subtle` is unavailable, `hash` is invalid, the key is not an
         * ECDSA key, or `crypto.subtle.verify` rejects.
         *
         * @param {CryptoKey} publicKey
         * @param {Uint8Array} signature
         * @param {Uint8Array} data
         * @param {'SHA-256'|'SHA-384'|'SHA-512'} [hash='SHA-256']
         * @returns {Promise<boolean>}
         */
        async function verify(publicKey, signature, data, hash = 'SHA-256') {
            if (!_ready()) return false;
            if (!_HASHES.has(hash)) {
                console.error(`[crypto] INVALID: webcryptoEcc.verify: unsupported hash '${hash}'`);
                return false;
            }
            if (_keyKind(publicKey) !== 'ECDSA') {
                console.error('[crypto] INVALID: webcryptoEcc.verify: key is not an ECDSA key');
                return false;
            }
            try {
                return await crypto.subtle.verify(
                    { name: 'ECDSA', hash },
                    publicKey,
                    /** @type {BufferSource} */ (signature),
                    /** @type {BufferSource} */ (data)
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEcc.verify: ' + (e && e.message));
                return false;
            }
        }

        /**
         * ECDH derive `lengthBits` of shared secret from `privateKey` and the
         * peer's `publicKey`.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `privateKey` is not an ECDH key (cross-kind misuse)
         * - `crypto.subtle.deriveBits` rejects
         *
         * @param {CryptoKey} privateKey
         * @param {CryptoKey} publicKey
         * @param {number} lengthBits
         * @returns {Promise<Uint8Array|false>}
         */
        async function deriveBits(privateKey, publicKey, lengthBits) {
            if (!_ready()) return false;
            if (_keyKind(privateKey) !== 'ECDH') {
                console.error('[crypto] INVALID: webcryptoEcc.deriveBits: key is not an ECDH key');
                return false;
            }
            try {
                const buf = await crypto.subtle.deriveBits(
                    { name: 'ECDH', public: publicKey },
                    privateKey,
                    lengthBits
                );
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEcc.deriveBits: ' + (e && e.message));
                return false;
            }
        }

        /**
         * ECDH derive a symmetric `CryptoKey` from `privateKey` and the peer's
         * `publicKey`.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `privateKey` is not an ECDH key (cross-kind misuse)
         * - `crypto.subtle.deriveKey` rejects
         *
         * @param {CryptoKey} privateKey
         * @param {CryptoKey} publicKey
         * @param {object} derivedKeyAlg Algorithm for the derived key (e.g. `{name:'AES-GCM', length:256}`).
         * @param {string[]} usages Usages for the derived key.
         * @param {boolean} [extractable=false]
         * @returns {Promise<CryptoKey|false>}
         */
        async function deriveKey(privateKey, publicKey, derivedKeyAlg, usages, extractable = false) {
            if (!_ready()) return false;
            if (_keyKind(privateKey) !== 'ECDH') {
                console.error('[crypto] INVALID: webcryptoEcc.deriveKey: key is not an ECDH key');
                return false;
            }
            try {
                return await crypto.subtle.deriveKey(
                    { name: 'ECDH', public: publicKey },
                    privateKey,
                    derivedKeyAlg,
                    extractable,
                    /** @type {KeyUsage[]} */ (usages)
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEcc.deriveKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Import an EC key from `raw`/`spki`/`pkcs8`/`jwk`.
         *
         * `'raw'` carries the public point only. `extractable` defaults to
         * `false` for `pkcs8` (private keys), `true` otherwise.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `format`, `kind`, or `curve` is invalid
         * - `crypto.subtle.importKey` rejects
         *
         * @param {'raw'|'spki'|'pkcs8'|'jwk'} format
         * @param {Uint8Array|object} keyData
         * @param {'ECDSA'|'ECDH'} kind
         * @param {'P-256'|'P-384'|'P-521'} curve
         * @param {string[]} usages
         * @param {boolean} [extractable]
         * @returns {Promise<CryptoKey|false>}
         */
        async function importKey(format, keyData, kind, curve, usages, extractable) {
            if (!_ready()) return false;
            if (!_FORMATS.has(format)) {
                console.error(`[crypto] INVALID: webcryptoEcc.importKey: unsupported format '${format}'`);
                return false;
            }
            if (!_KINDS.has(kind)) {
                console.error(`[crypto] INVALID: webcryptoEcc.importKey: unsupported kind '${kind}'`);
                return false;
            }
            if (!_CURVES.has(curve)) {
                console.error(`[crypto] INVALID: webcryptoEcc.importKey: unsupported curve '${curve}'`);
                return false;
            }
            const ext = extractable !== undefined ? extractable : format !== 'pkcs8';
            /** @type {KeyUsage[]} */
            const keyUsages = /** @type {KeyUsage[]} */ (usages);
            const algorithm = { name: kind, namedCurve: curve };
            try {
                // Branch by format so each overload sees a concrete format + key-data type:
                // 'jwk' takes a JsonWebKey, raw/spki/pkcs8 take a BufferSource.
                if (format === 'jwk') {
                    return await crypto.subtle.importKey(
                        'jwk', /** @type {JsonWebKey} */ (keyData), algorithm, ext, keyUsages
                    );
                }
                return await crypto.subtle.importKey(
                    format, /** @type {BufferSource} */ (keyData), algorithm, ext, keyUsages
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEcc.importKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Export `key` in `raw`/`spki`/`pkcs8`/`jwk`.
         *
         * DER/raw formats resolve a `Uint8Array`; `jwk` resolves a plain object.
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `format` is invalid
         * - `crypto.subtle.exportKey` rejects (e.g. non-extractable key)
         *
         * @param {'raw'|'spki'|'pkcs8'|'jwk'} format
         * @param {CryptoKey} key
         * @returns {Promise<Uint8Array|object|false>}
         */
        async function exportKey(format, key) {
            if (!_ready()) return false;
            if (!_FORMATS.has(format)) {
                console.error(`[crypto] INVALID: webcryptoEcc.exportKey: unsupported format '${format}'`);
                return false;
            }
            try {
                // Branch by format: 'jwk' resolves to a JsonWebKey, raw/DER to an ArrayBuffer.
                if (format === 'jwk') {
                    return await crypto.subtle.exportKey('jwk', key);
                }
                return new Uint8Array(await crypto.subtle.exportKey(format, key));
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoEcc.exportKey: ' + (e && e.message));
                return false;
            }
        }

        return {
            isAvailable,
            generateKey,
            sign,
            verify,
            deriveBits,
            deriveKey,
            importKey,
            exportKey
        };
    }
};
