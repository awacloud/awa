// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AES-CTR mode of operation (NIST SP 800-38A).
 *
 * Counter mode XORs a stream of encrypted IV-derived counter blocks against
 * the plaintext. Encryption and decryption are the same operation. This
 * module operates on 16-byte blocks (PRF block size = 128 bits) and exposes
 * additional `_increase` helpers for callers that maintain their own counter
 * state in `Uint8Array` form (16 or 48 bytes).
 *
 * **Counter wrap behaviour** (NIST SP 800-38A §6.5) - the internal counter
 * is the full 128-bit IV interpreted big-endian. Increment is byte-wise from
 * the low end and silently wraps at 2^128. For a uniformly random 128-bit
 * IV the probability of wrapping during a single message is negligible
 * (would require ≥ 2^128 blocks). Callers that reuse an IV across messages
 * MUST not let the per-message block counts overlap : repeated counter
 * blocks under the same (key, IV) reveal the XOR of plaintexts.
 *
 * **Authentication** - CTR is malleable. Pair with a MAC (encrypt-then-MAC)
 * or use an AEAD construction (`mode/gcm`, `mode/chacha20poly1305`).
 *
 */

import { bitArray } from '../utils/bitArray.js';

/**
 * Object returned by `ctr.factory()`. bitArrays are `number[]` (32-bit words).
 * @typedef {object} CtrAPI
 * @property {(prf: {encrypt: Function}, plaintext: number[], iv: number[]) => (number[]|false)} encrypt Encrypt in CTR mode.
 * @property {(prf: {encrypt: Function}, ciphertext: number[], iv: number[]) => (number[]|false)} decrypt Decrypt in CTR mode (identical to encrypt).
 * @property {(prf: {encrypt: Function}, data: number[], iv: number[]) => (number[]|false)} _calculate Internal CTR core.
 * @property {(ui8a: (Uint8Array|number[]), pos: number) => (Uint8Array|number[])} ui8_increase Advance a 16-byte counter by ⌊pos/16⌋ blocks.
 * @property {(ui8a: (Uint8Array|number[]), pos: number) => (Uint8Array|number[])} ui8_increase_384 As `ui8_increase` over the last 16 bytes of a 48-byte buffer.
 */

export const ctr = {
    name: 'ctr',
    version: '1.0.0',
    type: 'fw.crypto.mode',
    dependencies: ['bitArray'],
    deps: [bitArray],

    /** @returns {CtrAPI} */
    factory(bitArray) {

        function _calculate(prf, data, iv) {
            if (bitArray.bitLength(iv) !== 128) {
                console.warn('[crypto] INVALID: ctr: iv must be 128 bits');
                return false;
            }
            const l = data.length;
            if (!l) return [];

            const c = iv.slice(0);
            const d = data.slice(0);
            const bl = bitArray.bitLength(d);
            for (let i = 0; i < l; i += 4) {
                const e = prf.encrypt(c);
                // PRF block-size guard : ctr assumes a 128-bit (4-word) PRF.
                // A non-conforming PRF would silently corrupt the keystream.
                if (e === false || !e || e.length !== 4) {
                    console.warn('[crypto] INVALID: ctr: prf.encrypt must return a 4-word (128-bit) block');
                    return false;
                }
                d[i] ^= e[0];
                d[i + 1] ^= e[1];
                d[i + 2] ^= e[2];
                d[i + 3] ^= e[3];
                // Increment the 128-bit counter byte-wise from the low end.
                // Wraps silently at 2^128 (see module-level note).
                for (let carry = 3; carry >= 0; carry--) {
                    if (++c[carry]) break;
                }
            }
            return bitArray.clamp(d, bl);
        }

        /**
         * Returns a new 16-byte counter advanced by ⌊pos / 16⌋ blocks.
         * @param {Uint8Array|number[]} ui8a 16-byte IV/counter.
         * @param {number} pos Byte offset into the keystream.
         */
        function ui8_increase(ui8a, pos) {
            const iv = ui8a.slice(0);
            let inc = (pos >> 4) >> 0;
            let rel = inc + iv[15];
            if (rel > 255) {
                iv[15] = rel & 0xff;
                for (let i = 0; i < 15; i++) {
                    inc = rel >> 8;
                    rel = inc + iv[14 - i];
                    if (rel > 255) {
                        iv[14 - i] = rel & 0xff;
                    } else {
                        iv[14 - i] = rel;
                        return iv;
                    }
                }
                return iv;
            }
            iv[15] = rel;
            return iv;
        }

        /**
         * Same as {@link ui8_increase} but operating on the last 16 bytes of a
         * 48-byte buffer (used for AES-256 derivation contexts).
         *
         * Iteration bounds : after handling byte 47 (the LSB) the carry loop
         * walks bytes 46 → 32 (i.e. `i > 31`, 15 iterations) - together with
         * byte 47 this covers the full 16-byte counter region (bytes 32..47)
         * while leaving the high 32-byte derivation prefix untouched.
         */
        function ui8_increase_384(ui8a, pos) {
            const k_iv = ui8a.slice(0);
            let inc = (pos >> 4) >> 0;
            let rel = inc + k_iv[47];
            if (rel > 255) {
                k_iv[47] = rel & 0xff;
                // Bytes 46..32 inclusive (15 iterations) - the remaining 15
                // bytes of the 16-byte counter region [32..47].
                for (let i = 46; i > 31; i--) {
                    inc = rel >> 8;
                    rel = inc + k_iv[i];
                    if (rel > 255) {
                        k_iv[i] = rel & 0xff;
                    } else {
                        k_iv[i] = rel;
                        return k_iv;
                    }
                }
                return k_iv;
            }
            k_iv[47] = rel;
            return k_iv;
        }

        return {

            /**
             * Encrypt in CTR mode.
             *
             * Any extra positional arguments after `iv` are accepted (and
             * ignored) for back-compat with legacy callers (e.g.
             * `aes_modes.ctrApi.encrypt` passed a trailing `''` placeholder).
             * New code should pass exactly `(prf, plaintext, iv)`.
             *
             * @param {{encrypt:Function}} prf 16-byte block PRF (e.g. AES instance).
             * @param {Array} plaintext bitArray plaintext.
             * @param {Array} iv 128-bit bitArray initial counter.
             */
            encrypt(prf, plaintext, iv /* , ...legacyIgnored */) {
                return _calculate(prf, plaintext, iv);
            },

            /**
             * Decrypt in CTR mode (identical to encrypt).
             *
             * Extra trailing arguments are ignored (legacy callers). New code
             * should pass exactly `(prf, ciphertext, iv)`.
             */
            decrypt(prf, ciphertext, iv /* , ...legacyIgnored */) {
                return _calculate(prf, ciphertext, iv);
            },

            _calculate,
            ui8_increase,
            ui8_increase_384
        };
    }
};
