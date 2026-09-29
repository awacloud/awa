// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AES-GCM mode of operation (NIST SP 800-38D).
 *
 * Galois/Counter Mode is an authenticated cipher that combines a 32-bit
 * counter mode (GCTR) with an authentication tag computed in GF(2^128) via
 * the GHASH function. Used by TLS (RFC 5288), IPsec (RFC 4106), JWA AES-GCM
 * key wrap (RFC 7518), and many others.
 *
 * The PRF must be a 16-byte block cipher with `encrypt(block)` (decryption
 * support is not needed - GCM only ever encrypts the counter stream and
 * the hash subkey H = E_K(0^128)).
 *
 * `encrypt` returns `{ ct, tag }`. `decrypt` returns the plaintext on
 * successful tag verification, or `false` (with a console.error) when the
 * tag is rejected - the plaintext is **never** released for a failed tag.
 *
 * IV may be any length; 96 bits is the recommended fast path (J0 is
 * built directly without GHASH per NIST §7.1).
 *
 * **GHASH timing caveat** - `_gmult` uses the bit-by-bit right-shift
 * algorithm (NIST SP 800-38D §6.3 Algorithm 1). The inner conditional XOR
 * branches on individual bits of `X` (the hash input, derived from
 * ciphertext + AAD - **not** the key directly). The side channel is
 * therefore bounded to ciphertext/AAD bits, which are typically already
 * public, but the implementation is **NOT strictly constant-time**. A
 * 4-bit table-driven variant (Algorithm 4) would be both faster and
 * branchless ; left as a future optimisation. For very large payloads
 * (multi-MB) prefer WebCrypto AES-GCM (hardware PCLMULQDQ) when available.
 *
 */

import { bitArray } from '../utils/bitArray.js';

/**
 * Process-local nonce-uniqueness guard returned by `gcm.nonceTracker()`.
 * @typedef {object} GcmNonceTracker
 * @property {Set<string>} seenNonces Set of hex-encoded IVs already used (inspectable).
 * @property {(plaintext: number[], iv: number[], adata?: number[], tlen?: number) => ({ct: number[], tag: number[]}|false)} encrypt Encrypt, rejecting reused IVs.
 * @property {(ciphertext: number[], iv: number[], adata: number[], tag: number[], tlen?: number) => (number[]|false)} decrypt Decrypt (does not consult the seen set).
 */

/**
 * Object returned by `gcm.factory()`. bitArrays are `number[]` (32-bit words).
 * @typedef {object} GcmAPI
 * @property {(prf: {encrypt: Function}, plaintext: number[], iv: number[], adata?: number[], tlen?: number) => ({ct: number[], tag: number[]}|false)} encrypt Authenticated encryption.
 * @property {(prf: {encrypt: Function}, ciphertext: number[], iv: number[], adata: number[], tag: number[], tlen?: number) => (number[]|false)} decrypt Authenticated decryption; `false` on tag mismatch.
 * @property {(prf: {encrypt: Function}, adata: number[], iv: number[], tlen?: number) => (number[]|false)} gmac GMAC tag over AAD only.
 * @property {(prf: {encrypt: Function}, adata: number[], iv: number[], tag: number[], tlen?: number) => boolean} gmacVerify Constant-time GMAC verification.
 * @property {(prf: {encrypt: Function}) => GcmNonceTracker} nonceTracker Wrap a PRF in an in-process nonce-uniqueness guard.
 * @property {{ ghash: (H: number[], data: number[]) => number[], gctr: (prf: {encrypt: Function}, icb: number[], data: number[]) => number[] }} _internal Internal primitives (KAT tests only).
 */

export const gcm = {
    name: 'gcm',
    version: '1.0.0',
    type: 'fw.crypto.mode',
    dependencies: ['bitArray'],
    deps: [bitArray],

    /** @returns {GcmAPI} */
    factory(bitArray) {

        const _R0 = 0xE1000000 | 0;

        /**
         * Multiply two 128-bit elements in GF(2^128) under the GCM reduction
         * polynomial p(x) = x^128 + x^7 + x^2 + x + 1, using the right-shift
         * algorithm (NIST SP 800-38D §6.3, Algorithm 1).
         */
        function _gmult(X, Y) {
            const Z = [0, 0, 0, 0];
            const V = [Y[0], Y[1], Y[2], Y[3]];
            for (let i = 0; i < 128; i++) {
                const w = i >>> 5;
                const b = 31 - (i & 31);
                if ((X[w] >>> b) & 1) {
                    Z[0] ^= V[0]; Z[1] ^= V[1]; Z[2] ^= V[2]; Z[3] ^= V[3];
                }
                const lsb = V[3] & 1;
                V[3] = (V[3] >>> 1) | ((V[2] & 1) << 31);
                V[2] = (V[2] >>> 1) | ((V[1] & 1) << 31);
                V[1] = (V[1] >>> 1) | ((V[0] & 1) << 31);
                V[0] = V[0] >>> 1;
                if (lsb) V[0] ^= _R0;
            }
            return Z;
        }

        /**
         * GHASH_H(data) where `data` length must be a multiple of 128 bits.
         * NIST SP 800-38D §6.4.
         */
        function _ghash(H, data) {
            let Y0 = 0, Y1 = 0, Y2 = 0, Y3 = 0;
            for (let i = 0; i < data.length; i += 4) {
                Y0 ^= data[i];
                Y1 ^= data[i + 1];
                Y2 ^= data[i + 2];
                Y3 ^= data[i + 3];
                const out = _gmult([Y0, Y1, Y2, Y3], H);
                Y0 = out[0]; Y1 = out[1]; Y2 = out[2]; Y3 = out[3];
            }
            return [Y0, Y1, Y2, Y3];
        }

        /** Zero-pad a bitArray (right) to the next 128-bit block boundary. */
        function _zpad128(data) {
            const u8 = bitArray.ba_to_ui8(data);
            const padBytes = (16 - (u8.length % 16)) % 16;
            if (padBytes === 0) return bitArray.ui8_to_ba(u8);
            const padded = new Uint8Array(u8.length + padBytes);
            padded.set(u8, 0);
            return bitArray.ui8_to_ba(padded);
        }

        /** Encode a non-negative integer as a 64-bit big-endian length (2 words). */
        function _len64(bits) {
            const lo = bits | 0;
            const hi = Math.floor(bits / 0x100000000) | 0;
            return [hi, lo];
        }

        /**
         * GCTR_K(ICB, X) - counter mode where `inc` increments only the
         * rightmost 32 bits modulo 2^32. NIST SP 800-38D §6.5.
         */
        function _gctr(prf, icb, data) {
            const dataBits = bitArray.bitLength(data);
            if (dataBits === 0) return [];

            const u8 = bitArray.ba_to_ui8(data);
            const padBytes = (16 - (u8.length % 16)) % 16;
            let buf;
            if (padBytes === 0) {
                buf = bitArray.ui8_to_ba(u8);
            } else {
                const padded = new Uint8Array(u8.length + padBytes);
                padded.set(u8, 0);
                buf = bitArray.ui8_to_ba(padded);
            }

            const cb = [icb[0], icb[1], icb[2], icb[3]];
            for (let i = 0; i < buf.length; i += 4) {
                const e = prf.encrypt(cb);
                buf[i]     = (buf[i]     ^ e[0]) | 0;
                buf[i + 1] = (buf[i + 1] ^ e[1]) | 0;
                buf[i + 2] = (buf[i + 2] ^ e[2]) | 0;
                buf[i + 3] = (buf[i + 3] ^ e[3]) | 0;
                cb[3] = (cb[3] + 1) | 0;
            }
            return bitArray.clamp(buf, dataBits);
        }

        /**
         * Compute J0 (the pre-counter block) per NIST SP 800-38D §7.1.
         */
        function _j0(H, iv) {
            const ivBits = bitArray.bitLength(iv);
            if (ivBits === 96) {
                const ivBytes = bitArray.ba_to_ui8(iv);
                const out = new Uint8Array(16);
                out.set(ivBytes, 0);
                out[15] = 1;
                return bitArray.ui8_to_ba(out);
            }
            const padded = _zpad128(iv);
            const tail = [0, 0].concat(_len64(ivBits));
            return _ghash(H, padded.concat(tail));
        }

        function _incCb(cb) {
            return [cb[0], cb[1], cb[2], (cb[3] + 1) | 0];
        }

        function _authTag(prf, H, J0, adata, ciphertext, tlen) {
            const aBits = bitArray.bitLength(adata);
            const cBits = bitArray.bitLength(ciphertext);
            const ghashInput = _zpad128(adata)
                .concat(_zpad128(ciphertext))
                .concat(_len64(aBits))
                .concat(_len64(cBits));
            const S = _ghash(H, ghashInput);
            return bitArray.clamp(_gctr(prf, J0, S), tlen);
        }

        function _validateInputs(iv, tlen) {
            if (bitArray.bitLength(iv) === 0) {
                console.warn('[crypto] INVALID: gcm: iv must not be empty');
                return false;
            }
            if (tlen < 32 || tlen > 128) {
                console.warn('[crypto] INVALID: gcm: tag length must be 32..128 bits');
                return false;
            }
            return true;
        }

        /**
         * Authenticated encryption.
         *
         * 🚨 NONCE REUSE IS CATASTROPHIC. Encrypting two distinct messages
         * with the same `(prf, iv)` pair leaks the GHASH authentication key
         * H, allowing forgery of arbitrary ciphertexts under the same key,
         * and reveals the XOR of the two plaintexts. The CALLER MUST
         * guarantee `iv` uniqueness for every `encrypt` invocation under a
         * given key - typically via a 96-bit random IV (≥ 2^32 messages
         * require deterministic counter discipline) or a deterministic
         * counter. See `gcm.nonceTracker(prf)` for an in-process duplicate
         * detector that wraps `encrypt`/`decrypt`.
         *
         * @param {{encrypt:Function}} prf 16-byte block PRF.
         * @param {Array} plaintext bitArray of any bit length.
         * @param {Array} iv bitArray IV (any length, 96 bits is the fast path).
         * @param {Array} [adata=[]] Additional authenticated data (bitArray).
         * @param {number} [tlen=128] Tag length in bits (32..128).
         * @returns {{ct:Array, tag:Array} | false}
         */
        function encrypt(prf, plaintext, iv, adata, tlen) {
            adata = adata || [];
            tlen = tlen === undefined ? 128 : tlen;
            if (!_validateInputs(iv, tlen)) return false;

            const H = prf.encrypt([0, 0, 0, 0]);
            const J0 = _j0(H, iv);
            const ct = _gctr(prf, _incCb(J0), plaintext);
            const tag = _authTag(prf, H, J0, adata, ct, tlen);
            return { ct, tag };
        }

        /**
         * Authenticated decryption.
         * @param {{encrypt:Function}} prf 16-byte block PRF.
         * @param {Array} ciphertext bitArray.
         * @param {Array} iv bitArray IV.
         * @param {Array} adata Additional authenticated data (may be empty array).
         * @param {Array} tag Authentication tag (bitArray).
         * @param {number} [tlen] Tag length in bits (32..128). Defaults to bitLength(tag).
         * @returns {Array|false} The plaintext, or `false` on tag mismatch.
         */
        function decrypt(prf, ciphertext, iv, adata, tag, tlen) {
            adata = adata || [];
            tlen = tlen === undefined ? bitArray.bitLength(tag) : tlen;
            if (!_validateInputs(iv, tlen)) return false;

            const H = prf.encrypt([0, 0, 0, 0]);
            const J0 = _j0(H, iv);
            const expected = _authTag(prf, H, J0, adata, ciphertext, tlen);

            if (!bitArray.equal(bitArray.clamp(tag, tlen), expected)) {
                console.error('[crypto] CORRUPT: gcm: authentication tag mismatch');
                return false;
            }
            return _gctr(prf, _incCb(J0), ciphertext);
        }

        /**
         * GMAC - authenticate `adata` only (empty plaintext).
         * GMAC is the special case of GCM where the plaintext is empty and
         * only the additional authenticated data is bound to the tag
         * (NIST SP 800-38D §3, RFC 4543).
         * @param {{encrypt:Function}} prf
         * @param {Array} adata bitArray data to authenticate.
         * @param {Array} iv bitArray IV.
         * @param {number} [tlen=128] Tag length in bits.
         * @returns {Array|false} Authentication tag.
         */
        function gmac(prf, adata, iv, tlen) {
            const r = encrypt(prf, [], iv, adata, tlen);
            return r === false ? false : r.tag;
        }

        function gmacVerify(prf, adata, iv, tag, tlen) {
            tlen = tlen === undefined ? bitArray.bitLength(tag) : tlen;
            const expected = gmac(prf, adata, iv, tlen);
            if (expected === false) return false;
            return bitArray.equal(bitArray.clamp(tag, tlen), expected);
        }

        /**
         * Wrap a PRF in an in-process nonce-uniqueness guard. The returned
         * `{ encrypt, decrypt, seenNonces }` rejects any `encrypt` call
         * whose IV has already been used with this wrapper (including
         * across encrypt+decrypt). `seenNonces` is exposed for inspection;
         * mutate it only if you understand the consequences.
         *
         * Note: this is a process-local check only. Persistent or
         * distributed nonce uniqueness must be enforced by the caller.
         *
         * @param {{encrypt:Function}} prf
         * @returns {{encrypt:Function, decrypt:Function, seenNonces:Set<string>}}
         */
        function nonceTracker(prf) {
            const seen = new Set();
            const key = (iv) => {
                const u8 = bitArray.ba_to_ui8(iv);
                let s = '';
                for (let i = 0; i < u8.length; i++) {
                    s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16);
                }
                return s;
            };
            return {
                seenNonces: seen,
                encrypt(plaintext, iv, adata, tlen) {
                    const k = key(iv);
                    if (seen.has(k)) {
                        console.error('[crypto] CORRUPT: gcm: nonce reuse rejected by tracker');
                        return false;
                    }
                    seen.add(k);
                    return encrypt(prf, plaintext, iv, adata, tlen);
                },
                decrypt(ciphertext, iv, adata, tag, tlen) {
                    return decrypt(prf, ciphertext, iv, adata, tag, tlen);
                }
            };
        }

        return /** @type {GcmAPI} */ (/** @type {any} */ ({
            encrypt,
            decrypt,
            gmac,
            gmacVerify,
            nonceTracker,
            // Internal primitives - exposed for KAT tests only. Not API.
            _internal: { ghash: _ghash, gctr: _gctr }
        }));
    }
};
