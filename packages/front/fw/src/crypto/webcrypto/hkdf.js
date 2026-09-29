// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview webcryptoHkdf — WebCrypto-backed HKDF deriveBits/deriveKey.
 *
 * Wraps `crypto.subtle` to perform HKDF key derivation (RFC 5869) via
 * importKey('HKDF') + deriveBits/deriveKey. Combined extract+expand only
 * (WebCrypto does not expose the separate HKDF-Extract and HKDF-Expand
 * primitives). Opt-in alternative to the pure-JS `hkdf` module.
 *
 * Supported hashes: 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'.
 * SHA-3 and other hashes are not supported by WebCrypto.
 *
 * @module webcryptoHkdf
 */

/** @typedef {'SHA-1'|'SHA-256'|'SHA-384'|'SHA-512'} HashName */

export const webcryptoHkdf = {
    name: 'webcryptoHkdf',
    version: '1.0.0',
    type: 'fw.crypto.webcrypto',
    dependencies: [],

    factory() {
        /** @type {Set<HashName>} */
        const _SUPPORTED_HASHES = new Set(['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);
        const _hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

        /**
         * Returns true if `crypto.subtle` is available in this context.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasSubtle;
        }

        /**
         * Import IKM as an HKDF base key.
         * @param {Uint8Array} ikm Input keying material.
         * @returns {Promise<CryptoKey>}
         */
        async function _importBaseKey(ikm) {
            return crypto.subtle.importKey(
                'raw',
                /** @type {BufferSource} */ (ikm),
                { name: 'HKDF' },
                false,
                ['deriveBits', 'deriveKey']
            );
        }

        /**
         * Derive raw bits using HKDF.
         * @param {Uint8Array} ikm Input keying material.
         * @param {Uint8Array} salt Salt (may be empty — zero-length is valid per RFC 5869).
         * @param {Uint8Array} info Context/application-specific information (may be empty).
         * @param {number} lengthBits Number of bits to derive (positive multiple of 8).
         * @param {HashName} [hash='SHA-256'] Hash algorithm.
         * @returns {Promise<Uint8Array|false>}
         */
        async function deriveBits(ikm, salt, info, lengthBits, hash = 'SHA-256') {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!_SUPPORTED_HASHES.has(hash)) {
                console.error(`[crypto] INVALID: webcryptoHkdf: unsupported hash '${hash}'`);
                return false;
            }
            if (typeof lengthBits !== 'number' || lengthBits <= 0 || lengthBits % 8 !== 0) {
                console.error('[crypto] INVALID: webcryptoHkdf: lengthBits must be a positive multiple of 8');
                return false;
            }
            try {
                const baseKey = await _importBaseKey(ikm);
                const buf = await crypto.subtle.deriveBits(
                    { name: 'HKDF', hash, salt: /** @type {BufferSource} */ (salt), info: /** @type {BufferSource} */ (info) },
                    baseKey,
                    lengthBits
                );
                return new Uint8Array(buf);
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoHkdf.deriveBits: ' + (e && e.message));
                return false;
            }
        }

        /**
         * Derive a `CryptoKey` using HKDF.
         * @param {Uint8Array} ikm Input keying material.
         * @param {Uint8Array} salt Salt (may be empty).
         * @param {Uint8Array} info Context information (may be empty).
         * @param {object} derivedKeyAlg Algorithm descriptor for the derived key (e.g. `{name:'AES-GCM',length:256}`).
         * @param {KeyUsage[]} usages Key usages array.
         * @param {HashName} [hash='SHA-256'] Hash algorithm.
         * @param {boolean} [extractable=false] Whether the derived key is extractable.
         * @returns {Promise<CryptoKey|false>}
         */
        async function deriveKey(ikm, salt, info, derivedKeyAlg, usages, hash = 'SHA-256', extractable = false) {
            if (!_hasSubtle) {
                console.error('[crypto] NOT READY: crypto.subtle unavailable');
                return false;
            }
            if (!_SUPPORTED_HASHES.has(hash)) {
                console.error(`[crypto] INVALID: webcryptoHkdf: unsupported hash '${hash}'`);
                return false;
            }
            try {
                const baseKey = await _importBaseKey(ikm);
                return await crypto.subtle.deriveKey(
                    { name: 'HKDF', hash, salt: /** @type {BufferSource} */ (salt), info: /** @type {BufferSource} */ (info) },
                    baseKey,
                    derivedKeyAlg,
                    extractable,
                    usages
                );
            } catch (e) {
                console.error('[crypto] FAIL: webcryptoHkdf.deriveKey: ' + (e && e.message));
                return false;
            }
        }

        return {
            isAvailable,
            deriveBits,
            deriveKey
        };
    }
};
