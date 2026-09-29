// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview WebCrypto-backed AES module wrapping `crypto.subtle` for
 * symmetric encryption in AES-GCM (AEAD), AES-CBC, and AES-CTR modes.
 *
 * All operations are async and resolve to `Uint8Array | CryptoKey | false`.
 * Rejections from `crypto.subtle` are caught and logged — never propagated
 * (no-throw contract, crypto README §1).
 *
 * Key generation, import, and export are included. For AES-KW key-wrapping
 * see the sibling `webcryptoAesKw` module.
 *
 * GCM note: WebCrypto appends the authentication tag to the ciphertext.
 * `encryptGcm` output is `ciphertext || tag` (tagBits bits of tag).
 * `decryptGcm` expects the same concatenated form.
 *
 * Worker-safe: `crypto.subtle` is available in Web Workers; no DOM, no
 * main-thread closures.
 */

/**
 * Object returned by `webcryptoAes.factory()`.
 * @typedef {object} WebcryptoAesAPI
 * @property {() => boolean} isAvailable Whether `crypto.subtle` is present.
 * @property {(mode: 'GCM'|'CBC'|'CTR', lengthBits?: 128|192|256, extractable?: boolean) => Promise<CryptoKey|false>} generateKey
 *   Generate a random AES key.
 * @property {(raw: Uint8Array, mode: 'GCM'|'CBC'|'CTR', extractable?: boolean) => Promise<CryptoKey|false>} importKey
 *   Import raw key bytes as a `CryptoKey`.
 * @property {(key: CryptoKey) => Promise<Uint8Array|false>} exportKey
 *   Export a `CryptoKey` to raw bytes.
 * @property {(key: CryptoKey, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array, tagBits?: number) => Promise<Uint8Array|false>} encryptGcm
 *   AES-GCM encrypt; output is `ciphertext || tag`.
 * @property {(key: CryptoKey, iv: Uint8Array, ctWithTag: Uint8Array, aad?: Uint8Array, tagBits?: number) => Promise<Uint8Array|false>} decryptGcm
 *   AES-GCM decrypt; auth failure resolves `false`.
 * @property {(key: CryptoKey, iv: Uint8Array, plaintext: Uint8Array) => Promise<Uint8Array|false>} encryptCbc
 *   AES-CBC encrypt (PKCS#7 padding applied by the platform). `iv` must be 16 bytes.
 * @property {(key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array) => Promise<Uint8Array|false>} decryptCbc
 *   AES-CBC decrypt. `iv` must be 16 bytes.
 * @property {(key: CryptoKey, counter: Uint8Array, counterBits: number, data: Uint8Array) => Promise<Uint8Array|false>} encryptCtr
 *   AES-CTR encrypt. `counter` must be 16 bytes.
 * @property {(key: CryptoKey, counter: Uint8Array, counterBits: number, data: Uint8Array) => Promise<Uint8Array|false>} decryptCtr
 *   AES-CTR decrypt. `counter` must be 16 bytes.
 */

export const webcryptoAes = {
    name: 'webcryptoAes',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    /** @returns {WebcryptoAesAPI} */
    factory() {

        // All constants and guards are defined INSIDE the factory so the
        // closure is serializable to a Worker (no-factory-capture rule).
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

        /** Valid AES modes supported by this module. */
        const _VALID_MODES = new Set(['GCM', 'CBC', 'CTR']);

        /** Valid AES key byte-lengths: 128, 192, 256 bits → 16, 24, 32 bytes. */
        const _VALID_KEY_BYTES = new Set([16, 24, 32]);

        // ── internal helpers ────────────────────────────────────────────────

        /**
         * Log a NOT READY error and return false.
         * @returns {false}
         */
        function _notReady() {
            console.error('[crypto] NOT READY: crypto.subtle unavailable');
            return false;
        }

        /**
         * Log an INVALID error and return false.
         * @param {string} reason
         * @returns {false}
         */
        function _invalid(reason) {
            console.error('[crypto] INVALID: webcryptoAes: ' + reason);
            return false;
        }

        /**
         * Log a FAIL error and return false.
         * @param {string} method
         * @param {unknown} e
         * @returns {false}
         */
        function _fail(method, e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('[crypto] FAIL: webcryptoAes.' + method + ': ' + msg);
            return false;
        }

        // ── availability ────────────────────────────────────────────────────

        /**
         * Returns whether `crypto.subtle` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        // ── key management ──────────────────────────────────────────────────

        /**
         * Generate a random AES key.
         *
         * @param {'GCM'|'CBC'|'CTR'} mode AES mode.
         * @param {128|192|256} [lengthBits=256] Key length in bits.
         * @param {boolean} [extractable=true] Whether the key can be exported.
         * @returns {Promise<CryptoKey|false>}
         */
        async function generateKey(mode, lengthBits, extractable) {
            if (!_hasSubtle) return _notReady();
            if (!_VALID_MODES.has(mode)) return _invalid('unsupported mode \'' + mode + '\'');
            const length = lengthBits ?? 256;
            if (length !== 128 && length !== 192 && length !== 256) {
                return _invalid('invalid key length ' + length + ' (must be 128, 192, or 256)');
            }
            const isExtractable = extractable ?? true;
            try {
                return await crypto.subtle.generateKey(
                    { name: 'AES-' + mode, length },
                    isExtractable,
                    ['encrypt', 'decrypt']
                );
            } catch (e) {
                return _fail('generateKey', e);
            }
        }

        /**
         * Import raw key bytes as a `CryptoKey`.
         *
         * `raw.length` must be 16 (128-bit), 24 (192-bit), or 32 (256-bit).
         *
         * @param {Uint8Array} raw Raw key bytes.
         * @param {'GCM'|'CBC'|'CTR'} mode AES mode.
         * @param {boolean} [extractable=false] Whether the key can be exported.
         * @returns {Promise<CryptoKey|false>}
         */
        async function importKey(raw, mode, extractable) {
            if (!_hasSubtle) return _notReady();
            if (!(raw instanceof Uint8Array)) return _invalid('raw must be a Uint8Array');
            if (!_VALID_KEY_BYTES.has(raw.length)) {
                return _invalid('invalid raw key length ' + raw.length + ' bytes (must be 16, 24, or 32)');
            }
            if (!_VALID_MODES.has(mode)) return _invalid('unsupported mode \'' + mode + '\'');
            const isExtractable = extractable ?? false;
            try {
                return await crypto.subtle.importKey(
                    'raw', /** @type {BufferSource} */ (raw),
                    { name: 'AES-' + mode },
                    isExtractable,
                    ['encrypt', 'decrypt']
                );
            } catch (e) {
                return _fail('importKey', e);
            }
        }

        /**
         * Export a `CryptoKey` to raw bytes.
         *
         * The key must have been created with `extractable: true`.
         *
         * @param {CryptoKey} key
         * @returns {Promise<Uint8Array|false>}
         */
        async function exportKey(key) {
            if (!_hasSubtle) return _notReady();
            try {
                const buf = await crypto.subtle.exportKey('raw', key);
                return new Uint8Array(buf);
            } catch (e) {
                return _fail('exportKey', e);
            }
        }

        // ── AES-GCM ─────────────────────────────────────────────────────────

        /**
         * AES-GCM authenticated encryption.
         *
         * Output is `ciphertext || tag` (WebCrypto appends the tag).
         * Recommend 12-byte random IV per message (NIST SP 800-38D §8.2).
         *
         * @param {CryptoKey} key AES-GCM `CryptoKey`.
         * @param {Uint8Array} iv Initialization vector (12 bytes recommended).
         * @param {Uint8Array} plaintext Data to encrypt.
         * @param {Uint8Array} [aad] Additional authenticated data (not encrypted).
         * @param {number} [tagBits=128] Authentication tag length in bits (32–128, multiple of 8).
         * @returns {Promise<Uint8Array|false>} `ciphertext || tag` or `false`.
         */
        async function encryptGcm(key, iv, plaintext, aad, tagBits) {
            if (!_hasSubtle) return _notReady();
            if (!(iv instanceof Uint8Array)) return _invalid('GCM iv must be a Uint8Array');
            if (!(plaintext instanceof Uint8Array)) return _invalid('GCM plaintext must be a Uint8Array');
            const tLen = tagBits ?? 128;
            /** @type {AesGcmParams} */
            const params = { name: 'AES-GCM', iv: /** @type {BufferSource} */ (iv), tagLength: tLen };
            if (aad instanceof Uint8Array) {
                params.additionalData = /** @type {BufferSource} */ (aad);
            }
            try {
                const buf = await crypto.subtle.encrypt(params, key, /** @type {BufferSource} */ (plaintext));
                return new Uint8Array(buf);
            } catch (e) {
                return _fail('encryptGcm', e);
            }
        }

        /**
         * AES-GCM authenticated decryption.
         *
         * `ctWithTag` must be `ciphertext || tag` as produced by `encryptGcm`.
         * Authentication failure (wrong key, corrupted ciphertext/tag, wrong AAD)
         * resolves `false` rather than throwing.
         *
         * @param {CryptoKey} key AES-GCM `CryptoKey`.
         * @param {Uint8Array} iv Initialization vector used during encryption.
         * @param {Uint8Array} ctWithTag Ciphertext concatenated with the authentication tag.
         * @param {Uint8Array} [aad] Additional authenticated data.
         * @param {number} [tagBits=128] Authentication tag length in bits.
         * @returns {Promise<Uint8Array|false>} Plaintext or `false` on auth failure.
         */
        async function decryptGcm(key, iv, ctWithTag, aad, tagBits) {
            if (!_hasSubtle) return _notReady();
            if (!(iv instanceof Uint8Array)) return _invalid('GCM iv must be a Uint8Array');
            if (!(ctWithTag instanceof Uint8Array)) return _invalid('GCM ctWithTag must be a Uint8Array');
            const tLen = tagBits ?? 128;
            /** @type {AesGcmParams} */
            const params = { name: 'AES-GCM', iv: /** @type {BufferSource} */ (iv), tagLength: tLen };
            if (aad instanceof Uint8Array) {
                params.additionalData = /** @type {BufferSource} */ (aad);
            }
            try {
                const buf = await crypto.subtle.decrypt(params, key, /** @type {BufferSource} */ (ctWithTag));
                return new Uint8Array(buf);
            } catch (e) {
                // Authentication failure rejects — caught here, resolves false.
                return _fail('decryptGcm', e);
            }
        }

        // ── AES-CBC ─────────────────────────────────────────────────────────

        /**
         * AES-CBC encryption. PKCS#7 padding is applied by the platform.
         *
         * @param {CryptoKey} key AES-CBC `CryptoKey`.
         * @param {Uint8Array} iv Initialization vector (must be 16 bytes).
         * @param {Uint8Array} plaintext Data to encrypt.
         * @returns {Promise<Uint8Array|false>}
         */
        async function encryptCbc(key, iv, plaintext) {
            if (!_hasSubtle) return _notReady();
            if (!(iv instanceof Uint8Array)) return _invalid('CBC iv must be a Uint8Array');
            if (iv.length !== 16) return _invalid('CBC iv must be 16 bytes, got ' + iv.length);
            if (!(plaintext instanceof Uint8Array)) return _invalid('CBC plaintext must be a Uint8Array');
            try {
                const buf = await crypto.subtle.encrypt(
                    { name: 'AES-CBC', iv: /** @type {BufferSource} */ (iv) },
                    key,
                    /** @type {BufferSource} */ (plaintext)
                );
                return new Uint8Array(buf);
            } catch (e) {
                return _fail('encryptCbc', e);
            }
        }

        /**
         * AES-CBC decryption.
         *
         * @param {CryptoKey} key AES-CBC `CryptoKey`.
         * @param {Uint8Array} iv Initialization vector (must be 16 bytes).
         * @param {Uint8Array} ciphertext Data to decrypt.
         * @returns {Promise<Uint8Array|false>}
         */
        async function decryptCbc(key, iv, ciphertext) {
            if (!_hasSubtle) return _notReady();
            if (!(iv instanceof Uint8Array)) return _invalid('CBC iv must be a Uint8Array');
            if (iv.length !== 16) return _invalid('CBC iv must be 16 bytes, got ' + iv.length);
            if (!(ciphertext instanceof Uint8Array)) return _invalid('CBC ciphertext must be a Uint8Array');
            try {
                const buf = await crypto.subtle.decrypt(
                    { name: 'AES-CBC', iv: /** @type {BufferSource} */ (iv) },
                    key,
                    /** @type {BufferSource} */ (ciphertext)
                );
                return new Uint8Array(buf);
            } catch (e) {
                return _fail('decryptCbc', e);
            }
        }

        // ── AES-CTR ─────────────────────────────────────────────────────────

        /**
         * AES-CTR encryption.
         *
         * @param {CryptoKey} key AES-CTR `CryptoKey`.
         * @param {Uint8Array} counter Counter block (must be 16 bytes).
         * @param {number} counterBits Number of bits in the counter block used for the counter (1–128, typically 64).
         * @param {Uint8Array} data Data to encrypt.
         * @returns {Promise<Uint8Array|false>}
         */
        async function encryptCtr(key, counter, counterBits, data) {
            if (!_hasSubtle) return _notReady();
            if (!(counter instanceof Uint8Array)) return _invalid('CTR counter must be a Uint8Array');
            if (counter.length !== 16) return _invalid('CTR counter must be 16 bytes, got ' + counter.length);
            if (!(data instanceof Uint8Array)) return _invalid('CTR data must be a Uint8Array');
            try {
                const buf = await crypto.subtle.encrypt(
                    { name: 'AES-CTR', counter: /** @type {BufferSource} */ (counter), length: counterBits },
                    key, /** @type {BufferSource} */ (data)
                );
                return new Uint8Array(buf);
            } catch (e) {
                return _fail('encryptCtr', e);
            }
        }

        /**
         * AES-CTR decryption. Identical to encryption in CTR mode.
         *
         * @param {CryptoKey} key AES-CTR `CryptoKey`.
         * @param {Uint8Array} counter Counter block (must be 16 bytes).
         * @param {number} counterBits Number of bits used as the counter (1–128, typically 64).
         * @param {Uint8Array} data Data to decrypt.
         * @returns {Promise<Uint8Array|false>}
         */
        async function decryptCtr(key, counter, counterBits, data) {
            if (!_hasSubtle) return _notReady();
            if (!(counter instanceof Uint8Array)) return _invalid('CTR counter must be a Uint8Array');
            if (counter.length !== 16) return _invalid('CTR counter must be 16 bytes, got ' + counter.length);
            if (!(data instanceof Uint8Array)) return _invalid('CTR data must be a Uint8Array');
            try {
                const buf = await crypto.subtle.decrypt(
                    { name: 'AES-CTR', counter: /** @type {BufferSource} */ (counter), length: counterBits },
                    key, /** @type {BufferSource} */ (data)
                );
                return new Uint8Array(buf);
            } catch (e) {
                return _fail('decryptCtr', e);
            }
        }

        return {
            isAvailable,
            generateKey,
            importKey,
            exportKey,
            encryptGcm,
            decryptGcm,
            encryptCbc,
            decryptCbc,
            encryptCtr,
            decryptCtr,
        };
    }
};
