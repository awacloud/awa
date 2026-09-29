// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AES-CMAC (NIST SP 800-38B / RFC 4493).
 *
 * CMAC is a CBC-MAC variant that resists length-extension and avoids the
 * weaknesses of plain CBC-MAC on variable-length messages. Two subkeys
 * (K1, K2) are derived from `L = E_K(0^128)` via doubling in GF(2^128) under
 * p(x) = x^128 + x^7 + x^2 + x + 1 (constant Rb = 0x87). Each subkey is
 * XORed into the final message block - K1 if the block is complete, K2 if
 * the message was padded with `10*`.
 *
 * The PRF must be a 16-byte block cipher exposing `encrypt(block)` (AES is
 * the canonical choice and the only one specified by NIST). Output length
 * is fixed to 128 bits (truncate at the call site if needed).
 *
 */

import { bitArray } from '../utils/bitArray.js';

/**
 * Object returned by `cmac.factory()`. bitArrays are `number[]` (32-bit words).
 * @typedef {object} CmacAPI
 * @property {(prf: {encrypt: Function}, message: number[]) => (number[]|false)} mac 128-bit CMAC tag, or `false` if the PRF is rejected.
 * @property {(prf: {encrypt: Function}, message: number[], tag: number[]) => boolean} verify Constant-time tag verification.
 * @property {(prf: {encrypt: Function}, message: number[], tagLen: number) => (number[]|false)} truncatedMac Truncated MAC (tagLen 32..128 bits).
 * @property {(prf: {encrypt: Function}, message: number[], tag: number[], tagLen: number) => boolean} truncatedVerify Constant-time truncated verification.
 * @property {{ dbl: (b: number[]) => number[] }} _internal Internal primitive (KAT tests only).
 */

export const cmac = {
    name: 'cmac',
    version: '1.0.0',
    type: 'fw.crypto.mode',
    dependencies: ['bitArray'],
    deps: [bitArray],

    /** @returns {CmacAPI} */
    factory(bitArray) {

        const _RB = 0x87;

        // FIPS 140-3 upgrade plan iteration D3 - TDES rejection.
        // SP 800-131A §2.4 marks Triple-DES as deprecated since 2024 and
        // disallowed for cryptographic protection beyond 2023. SP 800-38B §5.1
        // explicitly requires AES (16-byte block). We reject any PRF that
        // advertises a non-128-bit block size. PRFs without an explicit
        // `blockSize` field are accepted (back-compat with our `aes.fn` which
        // doesn't expose the field - it is always a 128-bit AES block PRF).
        function _checkBlockSize(prf) {
            if (prf.blockSize !== undefined && prf.blockSize !== 16) {
                console.warn('[crypto] DEPRECATED: cmac: non-AES block cipher (e.g. TDES, blockSize=' + prf.blockSize + 'B) is deprecated by SP 800-131A §2.4. SP 800-38B §5.1 requires AES (16-byte blocks).');
                return false;
            }
            return true;
        }

        /** Doubling in GF(2^128): x → 2·x mod p(x). Operates on 4-word blocks. */
        function _dbl(b) {
            const msb = (b[0] >>> 31) & 1;
            const out = [
                ((b[0] << 1) | (b[1] >>> 31)) | 0,
                ((b[1] << 1) | (b[2] >>> 31)) | 0,
                ((b[2] << 1) | (b[3] >>> 31)) | 0,
                (b[3] << 1) | 0
            ];
            if (msb) out[3] ^= _RB;
            return out;
        }

        function _subkeys(prf) {
            const L = prf.encrypt([0, 0, 0, 0]);
            const K1 = _dbl(L);
            const K2 = _dbl(K1);
            return { K1, K2 };
        }

        /**
         * Compute the AES-CMAC tag of `message` under `prf`.
         * @param {{encrypt:Function}} prf 16-byte block PRF (AES).
         * @param {Array} message bitArray of any bit length.
         * @returns {Array|false} 128-bit bitArray tag, or `false` if the PRF
         *   is rejected (non-AES block size).
         */
        function mac(prf, message) {
            if (!_checkBlockSize(prf)) return false;
            const { K1, K2 } = _subkeys(prf);

            const msgBytes = bitArray.ba_to_ui8(message);
            const n = msgBytes.length;
            const complete = n > 0 && (n % 16) === 0;
            const numBlocks = complete ? n / 16 : Math.floor(n / 16) + 1;

            // Build the final padded block (with K1 or K2 XOR).
            const last = new Uint8Array(16);
            const lastOff = (numBlocks - 1) * 16;
            const lastLen = n - lastOff;
            last.set(msgBytes.subarray(lastOff, lastOff + lastLen), 0);
            if (!complete) last[lastLen] = 0x80;
            const lastBa = bitArray.ui8_to_ba(last);
            const Ksub = complete ? K1 : K2;
            const M_last = [
                lastBa[0] ^ Ksub[0],
                lastBa[1] ^ Ksub[1],
                lastBa[2] ^ Ksub[2],
                lastBa[3] ^ Ksub[3]
            ];

            // CBC-MAC over blocks 1..n-1, then the modified last block.
            let X = [0, 0, 0, 0];
            for (let b = 0; b < numBlocks - 1; b++) {
                const off = b * 16;
                const blk = bitArray.ui8_to_ba(msgBytes.subarray(off, off + 16));
                X = prf.encrypt([X[0] ^ blk[0], X[1] ^ blk[1], X[2] ^ blk[2], X[3] ^ blk[3]]);
            }
            return prf.encrypt([X[0] ^ M_last[0], X[1] ^ M_last[1], X[2] ^ M_last[2], X[3] ^ M_last[3]]);
        }

        /**
         * Constant-time tag verification. Delegates the comparison to
         * `bitArray.equal`, which XORs all words into an accumulator and
         * checks the final value - no early exit on the first differing
         * word.
         */
        function verify(prf, message, tag) {
            const expected = mac(prf, message);
            if (expected === false) return false;
            return bitArray.equal(expected, tag);
        }

        // FIPS 140-3 upgrade plan iteration D3 - truncated MAC.
        // SP 800-38B §6.4 (Length of MAC) recommends `Tlen ≥ 32 bits` for
        // applications where forgery probability of `2^-Tlen` is acceptable
        // (smaller Tlen requires a per-application risk analysis). The
        // standard explicitly permits Tlen ∈ [32, 128] in 8-bit increments.
        // `truncatedMac` enforces the 32-bit floor and the 128-bit ceiling.
        function truncatedMac(prf, message, tagLen) {
            if (typeof tagLen !== 'number' || !Number.isInteger(tagLen)) {
                console.warn('[crypto] INVALID: cmac: tagLen must be an integer (bits)');
                return false;
            }
            if (tagLen < 32) {
                console.warn('[crypto] WEAK: cmac: tagLen=' + tagLen + ' below SP 800-38B §6.4 minimum (32 bits) - refused');
                return false;
            }
            if (tagLen > 128) {
                console.warn('[crypto] INVALID: cmac: tagLen=' + tagLen + ' exceeds CMAC output (128 bits)');
                return false;
            }
            const full = mac(prf, message);
            if (full === false) return false;
            return bitArray.clamp(full, tagLen);
        }

        function truncatedVerify(prf, message, tag, tagLen) {
            const expected = truncatedMac(prf, message, tagLen);
            if (expected === false) return false;
            return bitArray.equal(expected, tag);
        }

        return {
            mac,
            verify,
            truncatedMac,
            truncatedVerify,
            // Internal primitive - exposed for KAT tests only.
            _internal: { dbl: _dbl }
        };
    }
};
