// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AES-CBC mode of operation (NIST SP 800-38A).
 *
 * Cipher Block Chaining XORs each plaintext block with the previous
 * ciphertext block (or the IV, for the first block) before encrypting it.
 * Decryption reverses the chain. The PRF must expose **both** `encrypt` and
 * `decrypt` (i.e. an AES instance built with `full = true`).
 *
 * This module operates on 16-byte blocks (PRF block size = 128 bits) and
 * does not handle padding - callers should run `pad.pad` / `pad.strip`
 * around it (or use a higher-level wrapper) when the message length is not
 * a multiple of 16 bytes.
 *
 * **Authentication contract - encrypt-then-MAC required.**
 * CBC alone is malleable : bit-flipping attacks and padding-oracle attacks
 * (Vaudenay 2002, Lucky-13, POODLE) recover plaintext when the caller leaks
 * any signal - timing, side-channel, or distinct error codes - about pad
 * validity. **Always** compose CBC with an independent MAC over the IV ‖
 * ciphertext (encrypt-then-MAC, RFC 7366) and verify the MAC in constant
 * time **before** running `decrypt` or attempting unpad. Prefer an AEAD
 * construction (`mode/gcm`, `mode/chacha20poly1305`) for new code - CBC is
 * kept here only for protocols that mandate it.
 *
 */

import { bitArray } from '../utils/bitArray.js';

/**
 * Object returned by `cbc.factory()`. bitArrays are `number[]` (32-bit words).
 * @typedef {object} CbcAPI
 * @property {(prf: {encrypt: Function}, plaintext: number[], iv: number[]) => (number[]|false)} encrypt Encrypt in CBC mode.
 * @property {(prf: {decrypt: Function}, ciphertext: number[], iv: number[]) => (number[]|false)} decrypt Decrypt in CBC mode.
 */

export const cbc = {
    name: 'cbc',
    version: '1.0.0',
    type: 'fw.crypto.mode',
    dependencies: ['bitArray'],
    deps: [bitArray],

    /** @returns {CbcAPI} */
    factory(bitArray) {

        function _checkBlockAligned(data, label) {
            if (data.length % 4 !== 0 || bitArray.bitLength(data) !== data.length * 32) {
                console.warn(`[crypto] INVALID: cbc: ${label} must be a whole number of 16-byte blocks`);
                return false;
            }
            return true;
        }

        function _checkIv(iv) {
            if (bitArray.bitLength(iv) !== 128) {
                console.warn('[crypto] INVALID: cbc: iv must be 128 bits');
                return false;
            }
            return true;
        }

        /**
         * Encrypt in CBC mode.
         * @param {{encrypt:Function}} prf 16-byte block PRF (e.g. AES instance).
         * @param {Array} plaintext bitArray of 16-byte blocks (length multiple of 4 words).
         * @param {Array} iv 128-bit bitArray IV.
         * @returns {Array|false}
         */
        function encrypt(prf, plaintext, iv) {
            if (!_checkIv(iv)) return false;
            if (!_checkBlockAligned(plaintext, 'plaintext')) return false;

            const l = plaintext.length;
            const out = new Array(l);
            let p0 = iv[0], p1 = iv[1], p2 = iv[2], p3 = iv[3];

            for (let i = 0; i < l; i += 4) {
                const block = [
                    plaintext[i] ^ p0,
                    plaintext[i + 1] ^ p1,
                    plaintext[i + 2] ^ p2,
                    plaintext[i + 3] ^ p3
                ];
                const enc = prf.encrypt(block);
                out[i] = enc[0];
                out[i + 1] = enc[1];
                out[i + 2] = enc[2];
                out[i + 3] = enc[3];
                p0 = enc[0]; p1 = enc[1]; p2 = enc[2]; p3 = enc[3];
            }
            return out;
        }

        /**
         * Decrypt in CBC mode.
         * @param {{decrypt:Function}} prf 16-byte block PRF with decrypt support.
         * @param {Array} ciphertext bitArray of 16-byte blocks.
         * @param {Array} iv 128-bit bitArray IV.
         * @returns {Array|false}
         */
        function decrypt(prf, ciphertext, iv) {
            if (!_checkIv(iv)) return false;
            if (!_checkBlockAligned(ciphertext, 'ciphertext')) return false;
            if (typeof prf.decrypt !== 'function') {
                console.warn('[crypto] INVALID: cbc: prf does not expose decrypt (build the cipher with full=true)');
                return false;
            }

            const l = ciphertext.length;
            const out = new Array(l);
            let p0 = iv[0], p1 = iv[1], p2 = iv[2], p3 = iv[3];

            for (let i = 0; i < l; i += 4) {
                const c0 = ciphertext[i];
                const c1 = ciphertext[i + 1];
                const c2 = ciphertext[i + 2];
                const c3 = ciphertext[i + 3];
                const dec = prf.decrypt([c0, c1, c2, c3]);
                out[i] = dec[0] ^ p0;
                out[i + 1] = dec[1] ^ p1;
                out[i + 2] = dec[2] ^ p2;
                out[i + 3] = dec[3] ^ p3;
                p0 = c0; p1 = c1; p2 = c2; p3 = c3;
            }
            return out;
        }

        return {
            encrypt,
            decrypt
        };
    }
};
