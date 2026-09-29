// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview WebCrypto-backed RSA module wrapping `crypto.subtle`.
 *
 * Scheme-parameterized over the three RSA schemes WebCrypto supports:
 * - **RSA-OAEP** — encrypt / decrypt
 * - **RSA-PSS** — sign / verify
 * - **RSASSA-PKCS1-v1_5** — sign / verify (legacy; emits a deprecation warning)
 *
 * Plus keypair generate / import / export (spki / pkcs8 / jwk). Async,
 * `Uint8Array` / `CryptoKey` / `CryptoKeyPair` I/O. Opt-in alternative to the
 * pure-JS `rsa` + `rsaKeygen` modules, which remain the default.
 *
 * PKCS1-v1_5 *encryption* is intentionally NOT exposed: WebCrypto does not
 * support it and it is insecure — use OAEP for encryption. For PEM I/O use the
 * pure-JS `pem`/`asn1` modules; WebCrypto import/export here is DER/JWK only.
 *
 * No-throw contract (crypto README §1): every operation resolves to a result
 * or `false`. Rejections from `crypto.subtle` are caught and logged.
 *
 * Worker-safe: `crypto.subtle` is available in Web Workers.
 */

/**
 * Object returned by `webcryptoRsa.factory()`.
 * @typedef {object} WebcryptoRsaAPI
 * @property {() => boolean} isAvailable Whether `crypto.subtle` is present.
 * @property {(scheme: 'OAEP'|'PSS'|'PKCS1', modulusBits?: number, hash?: string, extractable?: boolean) => Promise<CryptoKeyPair|false>} generateKey
 *   Generate an RSA keypair for the given scheme.
 * @property {(publicKey: CryptoKey, data: Uint8Array, label?: Uint8Array) => Promise<Uint8Array|false>} encrypt
 *   RSA-OAEP encrypt (OAEP keys only).
 * @property {(privateKey: CryptoKey, ct: Uint8Array, label?: Uint8Array) => Promise<Uint8Array|false>} decrypt
 *   RSA-OAEP decrypt (OAEP keys only).
 * @property {(privateKey: CryptoKey, data: Uint8Array, saltLengthBytes?: number) => Promise<Uint8Array|false>} sign
 *   RSA-PSS or RSASSA-PKCS1-v1_5 sign, dispatched by key algorithm.
 * @property {(publicKey: CryptoKey, signature: Uint8Array, data: Uint8Array, saltLengthBytes?: number) => Promise<boolean>} verify
 *   RSA-PSS or RSASSA-PKCS1-v1_5 verify, dispatched by key algorithm.
 * @property {(format: 'spki'|'pkcs8'|'jwk', keyData: Uint8Array|object, scheme: 'OAEP'|'PSS'|'PKCS1', hash: string, usages: string[], extractable?: boolean) => Promise<CryptoKey|false>} importKey
 *   Import a key in DER (spki/pkcs8) or JWK form.
 * @property {(format: 'spki'|'pkcs8'|'jwk', key: CryptoKey) => Promise<Uint8Array|object|false>} exportKey
 *   Export a key; DER formats wrapped as `Uint8Array`, `jwk` returned as object.
 */

export const webcryptoRsa = {
    name: 'webcryptoRsa',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    /** @returns {WebcryptoRsaAPI} */
    factory() {

        // Availability guard and the scheme/hash/modulus sets are defined inside
        // the factory so the closure is serializable to a Worker
        // (fw/no-factory-capture: no module-level bindings).
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

        /** Scheme name → WebCrypto algorithm name. */
        const _SCHEME_TO_ALG = {
            OAEP: 'RSA-OAEP',
            PSS: 'RSA-PSS',
            PKCS1: 'RSASSA-PKCS1-v1_5'
        };

        /** Hash algorithms supported for RSA by WebCrypto. */
        const _HASHES = new Set(['SHA-256', 'SHA-384', 'SHA-512', 'SHA-1']);

        /** Modulus lengths accepted by this module. */
        const _MODULI = new Set([2048, 3072, 4096]);

        /** Import/export key formats supported. */
        const _FORMATS = new Set(['spki', 'pkcs8', 'jwk']);

        /** Fixed public exponent: 65537. */
        const _PUB_EXPONENT = new Uint8Array([0x01, 0x00, 0x01]);

        /** Hash name → output size in bytes (used for the default PSS salt length). */
        const _HASH_BYTES = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 };

        /**
         * Returns whether `crypto.subtle` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        /**
         * Generate an RSA keypair for the given scheme.
         *
         * Usages are `['encrypt','decrypt']` for OAEP and `['sign','verify']`
         * for PSS / PKCS1.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `scheme` is not OAEP/PSS/PKCS1
         * - `modulusBits` is not 2048/3072/4096
         * - `hash` is not SHA-256/384/512/SHA-1
         * - `crypto.subtle.generateKey` rejects
         *
         * @param {'OAEP'|'PSS'|'PKCS1'} scheme
         * @param {number} [modulusBits=2048]
         * @param {string} [hash='SHA-256']
         * @param {boolean} [extractable=true]
         * @returns {Promise<CryptoKeyPair|false>}
         */
        async function generateKey(scheme, modulusBits = 2048, hash = 'SHA-256', extractable = true) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            const name = _SCHEME_TO_ALG[scheme];
            if (!name) {
                console.error(`[crypto] INVALID: webcryptoRsa.generateKey: unsupported scheme '${scheme}'`);
                return false;
            }
            if (!_MODULI.has(modulusBits)) {
                console.error(`[crypto] INVALID: webcryptoRsa.generateKey: unsupported modulus '${modulusBits}'`);
                return false;
            }
            if (!_HASHES.has(hash)) {
                console.error(`[crypto] INVALID: webcryptoRsa.generateKey: unsupported hash '${hash}'`);
                return false;
            }
            if (scheme === 'PKCS1') {
                console.warn('[crypto] DEPRECATED: RSASSA-PKCS1-v1_5; prefer RSA-PSS');
            }
            /** @type {KeyUsage[]} */
            const usages = scheme === 'OAEP' ? ['encrypt', 'decrypt'] : ['sign', 'verify'];
            try {
                // `name` is a plain string here (scheme→alg lookup), so the params object
                // must be cast to RsaHashedKeyGenParams for the overload to match.
                /** @type {RsaHashedKeyGenParams} */
                const algorithm = {
                    name,
                    modulusLength: modulusBits,
                    publicExponent: /** @type {Uint8Array<ArrayBuffer>} */ (_PUB_EXPONENT),
                    hash
                };
                // RSA generateKey always yields a key pair (asymmetric scheme).
                return /** @type {CryptoKeyPair} */ (
                    await crypto.subtle.generateKey(algorithm, extractable, usages)
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoRsa.generateKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Guard a key against the algorithm the operation requires.
         * @param {CryptoKey} key
         * @param {string} expectedAlg
         * @param {string} caller
         * @returns {boolean} true when the key matches `expectedAlg`.
         */
        function _matchesAlg(key, expectedAlg, caller) {
            const alg = key && key.algorithm && key.algorithm.name;
            if (alg !== expectedAlg) {
                console.error(`[crypto] INVALID: ${caller}: key algorithm '${alg}' does not match '${expectedAlg}'`);
                return false;
            }
            return true;
        }

        /**
         * RSA-OAEP encrypt `data` with `publicKey`.
         *
         * Resolves `false` when the key is not an RSA-OAEP key, when
         * `crypto.subtle` is unavailable, or when the operation rejects.
         *
         * @param {CryptoKey} publicKey
         * @param {Uint8Array} data
         * @param {Uint8Array} [label]
         * @returns {Promise<Uint8Array|false>}
         */
        async function encrypt(publicKey, data, label) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!_matchesAlg(publicKey, 'RSA-OAEP', 'webcryptoRsa.encrypt')) return false;
            const algorithm = label !== undefined
                ? { name: 'RSA-OAEP', label }
                : { name: 'RSA-OAEP' };
            try {
                const buf = await crypto.subtle.encrypt(algorithm, publicKey, /** @type {BufferSource} */ (data));
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoRsa.encrypt: ' + (e && e.message));
                return false;
            }
        }

        /**
         * RSA-OAEP decrypt `ct` with `privateKey`.
         *
         * Resolves `false` when the key is not an RSA-OAEP key, when
         * `crypto.subtle` is unavailable, or when the operation rejects
         * (e.g. tampered ciphertext).
         *
         * @param {CryptoKey} privateKey
         * @param {Uint8Array} ct
         * @param {Uint8Array} [label]
         * @returns {Promise<Uint8Array|false>}
         */
        async function decrypt(privateKey, ct, label) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!_matchesAlg(privateKey, 'RSA-OAEP', 'webcryptoRsa.decrypt')) return false;
            const algorithm = label !== undefined
                ? { name: 'RSA-OAEP', label }
                : { name: 'RSA-OAEP' };
            try {
                const buf = await crypto.subtle.decrypt(algorithm, privateKey, /** @type {BufferSource} */ (ct));
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoRsa.decrypt: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Sign `data` with `privateKey`, dispatched by the key's algorithm.
         *
         * - RSA-PSS: `saltLength` defaults to the hash output size in bytes;
         *   override with `saltLengthBytes`.
         * - RSASSA-PKCS1-v1_5: emits a deprecation warning; `saltLengthBytes`
         *   is ignored.
         *
         * Resolves `false` when the key is neither PSS nor PKCS1, when
         * `crypto.subtle` is unavailable, or when the operation rejects.
         *
         * @param {CryptoKey} privateKey
         * @param {Uint8Array} data
         * @param {number} [saltLengthBytes]
         * @returns {Promise<Uint8Array|false>}
         */
        async function sign(privateKey, data, saltLengthBytes) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            const alg = privateKey && privateKey.algorithm && privateKey.algorithm.name;
            let algorithm;
            if (alg === 'RSA-PSS') {
                // RSA-PSS keys carry RsaHashedKeyAlgorithm; KeyAlgorithm lacks `hash`.
                const pssAlg = /** @type {RsaHashedKeyAlgorithm} */ (privateKey.algorithm);
                const hashName = pssAlg.hash && pssAlg.hash.name;
                const saltLength = saltLengthBytes !== undefined
                    ? saltLengthBytes
                    : (_HASH_BYTES[hashName] || 32);
                algorithm = { name: 'RSA-PSS', saltLength };
            } else if (alg === 'RSASSA-PKCS1-v1_5') {
                console.warn('[crypto] DEPRECATED: RSASSA-PKCS1-v1_5; prefer RSA-PSS');
                algorithm = 'RSASSA-PKCS1-v1_5';
            } else {
                console.error(`[crypto] INVALID: webcryptoRsa.sign: key algorithm '${alg}' is not a signing scheme`);
                return false;
            }
            try {
                const buf = await crypto.subtle.sign(algorithm, privateKey, /** @type {BufferSource} */ (data));
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoRsa.sign: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Verify `signature` over `data` with `publicKey`, dispatched by the
         * key's algorithm (mirror of {@link sign}).
         *
         * Always resolves to a boolean; never rejects. Resolves `false` when
         * the key is neither PSS nor PKCS1, when `crypto.subtle` is
         * unavailable, or when the operation rejects.
         *
         * @param {CryptoKey} publicKey
         * @param {Uint8Array} signature
         * @param {Uint8Array} data
         * @param {number} [saltLengthBytes]
         * @returns {Promise<boolean>}
         */
        async function verify(publicKey, signature, data, saltLengthBytes) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            const alg = publicKey && publicKey.algorithm && publicKey.algorithm.name;
            let algorithm;
            if (alg === 'RSA-PSS') {
                // RSA-PSS keys carry RsaHashedKeyAlgorithm; KeyAlgorithm lacks `hash`.
                const pssAlg = /** @type {RsaHashedKeyAlgorithm} */ (publicKey.algorithm);
                const hashName = pssAlg.hash && pssAlg.hash.name;
                const saltLength = saltLengthBytes !== undefined
                    ? saltLengthBytes
                    : (_HASH_BYTES[hashName] || 32);
                algorithm = { name: 'RSA-PSS', saltLength };
            } else if (alg === 'RSASSA-PKCS1-v1_5') {
                console.warn('[crypto] DEPRECATED: RSASSA-PKCS1-v1_5; prefer RSA-PSS');
                algorithm = 'RSASSA-PKCS1-v1_5';
            } else {
                console.error(`[crypto] INVALID: webcryptoRsa.verify: key algorithm '${alg}' is not a signing scheme`);
                return false;
            }
            try {
                return await crypto.subtle.verify(
                    algorithm,
                    publicKey,
                    /** @type {BufferSource} */ (signature),
                    /** @type {BufferSource} */ (data)
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoRsa.verify: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Import a key in DER (`spki` public / `pkcs8` private) or `jwk` form.
         *
         * `extractable` defaults to `true` for `spki` (public material) and
         * `false` otherwise.
         *
         * Resolves `false` when:
         * - `crypto.subtle` is unavailable
         * - `format`/`scheme`/`hash` are invalid
         * - `crypto.subtle.importKey` rejects
         *
         * @param {'spki'|'pkcs8'|'jwk'} format
         * @param {Uint8Array|object} keyData
         * @param {'OAEP'|'PSS'|'PKCS1'} scheme
         * @param {string} hash
         * @param {string[]} usages
         * @param {boolean} [extractable]
         * @returns {Promise<CryptoKey|false>}
         */
        async function importKey(format, keyData, scheme, hash, usages, extractable) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!_FORMATS.has(format)) {
                console.error(`[crypto] INVALID: webcryptoRsa.importKey: unsupported format '${format}'`);
                return false;
            }
            const name = _SCHEME_TO_ALG[scheme];
            if (!name) {
                console.error(`[crypto] INVALID: webcryptoRsa.importKey: unsupported scheme '${scheme}'`);
                return false;
            }
            if (!_HASHES.has(hash)) {
                console.error(`[crypto] INVALID: webcryptoRsa.importKey: unsupported hash '${hash}'`);
                return false;
            }
            const ext = extractable !== undefined ? extractable : (format === 'spki');
            /** @type {KeyUsage[]} */
            const keyUsages = /** @type {KeyUsage[]} */ (usages);
            try {
                // Branch by format so each overload sees a concrete format + key-data type:
                // 'jwk' takes a JsonWebKey, 'spki'/'pkcs8' take a BufferSource.
                if (format === 'jwk') {
                    return await crypto.subtle.importKey(
                        'jwk', /** @type {JsonWebKey} */ (keyData), { name, hash }, ext, keyUsages
                    );
                }
                return await crypto.subtle.importKey(
                    format, /** @type {BufferSource} */ (keyData), { name, hash }, ext, keyUsages
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoRsa.importKey: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Export a key. DER formats (`spki`/`pkcs8`) are wrapped as a
         * `Uint8Array`; `jwk` is returned as a plain object.
         *
         * Resolves `false` when `crypto.subtle` is unavailable, `format` is
         * invalid, or `crypto.subtle.exportKey` rejects (e.g. non-extractable).
         *
         * @param {'spki'|'pkcs8'|'jwk'} format
         * @param {CryptoKey} key
         * @returns {Promise<Uint8Array|object|false>}
         */
        async function exportKey(format, key) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!_FORMATS.has(format)) {
                console.error(`[crypto] INVALID: webcryptoRsa.exportKey: unsupported format '${format}'`);
                return false;
            }
            try {
                // Branch by format: 'jwk' resolves to a JsonWebKey, DER formats to an ArrayBuffer.
                if (format === 'jwk') {
                    return await crypto.subtle.exportKey('jwk', key);
                }
                return new Uint8Array(await crypto.subtle.exportKey(format, key));
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoRsa.exportKey: ' + (e && e.message));
                return false;
            }
        }

        return { isAvailable, generateKey, encrypt, decrypt, sign, verify, importKey, exportKey };
    }
};
