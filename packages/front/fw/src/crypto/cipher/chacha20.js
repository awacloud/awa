// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview ChaCha20 stream cipher (RFC 8439).
 *
 * IETF variant: 256-bit key, 96-bit nonce, 32-bit counter. The block function
 * runs 20 rounds (10 double-rounds) of quarter-round operations on a 4×4
 * matrix of 32-bit words. Output is XORed with the plaintext.
 *
 */

/**
 * Object returned by `chacha20.factory()`.
 * @typedef {object} ChaCha20API
 * @property {(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, initialCounter?: number) => (Uint8Array|false)} xor XOR `data` with the ChaCha20 keystream; `false` on invalid key/nonce or counter overflow.
 */

export const chacha20 = {
    name: 'chacha20',
    version: '1.0.0',
    type: 'fw.crypto.cipher',
    dependencies: [],

    /** @returns {ChaCha20API} */
    factory() {

        // The constants "expand 32-byte k" are the j0..j3 of `_blockInto`.

        /**
         * One ChaCha20 block (RFC 8439 §2.3) into `ks` (16 words): the state on
         * locals, the 20 rounds as 10 double rounds of inline quarter-rounds.
         * @param {Int32Array} k 8 key words
         * @param {number} counter
         * @param {Int32Array} n 3 nonce words
         * @param {Int32Array} ks output, 16 words
         */
        function _blockInto(k, counter, n, ks) {
            const j0 = 0x61707865, j1 = 0x3320646e, j2 = 0x79622d32, j3 = 0x6b206574;
            const j4 = k[0], j5 = k[1], j6 = k[2], j7 = k[3], j8 = k[4], j9 = k[5], j10 = k[6], j11 = k[7];
            const j12 = counter | 0, j13 = n[0], j14 = n[1], j15 = n[2];
            let x0 = j0, x1 = j1, x2 = j2, x3 = j3, x4 = j4, x5 = j5, x6 = j6, x7 = j7, x8 = j8, x9 = j9, x10 = j10, x11 = j11, x12 = j12, x13 = j13, x14 = j14, x15 = j15;
            for (let i = 0; i < 10; i++) {
                x0 = (x0 + x4) | 0; x12 ^= x0; x12 = (x12 << 16) | (x12 >>> 16);
                x8 = (x8 + x12) | 0; x4 ^= x8; x4 = (x4 << 12) | (x4 >>> 20);
                x0 = (x0 + x4) | 0; x12 ^= x0; x12 = (x12 << 8) | (x12 >>> 24);
                x8 = (x8 + x12) | 0; x4 ^= x8; x4 = (x4 << 7) | (x4 >>> 25);
                x1 = (x1 + x5) | 0; x13 ^= x1; x13 = (x13 << 16) | (x13 >>> 16);
                x9 = (x9 + x13) | 0; x5 ^= x9; x5 = (x5 << 12) | (x5 >>> 20);
                x1 = (x1 + x5) | 0; x13 ^= x1; x13 = (x13 << 8) | (x13 >>> 24);
                x9 = (x9 + x13) | 0; x5 ^= x9; x5 = (x5 << 7) | (x5 >>> 25);
                x2 = (x2 + x6) | 0; x14 ^= x2; x14 = (x14 << 16) | (x14 >>> 16);
                x10 = (x10 + x14) | 0; x6 ^= x10; x6 = (x6 << 12) | (x6 >>> 20);
                x2 = (x2 + x6) | 0; x14 ^= x2; x14 = (x14 << 8) | (x14 >>> 24);
                x10 = (x10 + x14) | 0; x6 ^= x10; x6 = (x6 << 7) | (x6 >>> 25);
                x3 = (x3 + x7) | 0; x15 ^= x3; x15 = (x15 << 16) | (x15 >>> 16);
                x11 = (x11 + x15) | 0; x7 ^= x11; x7 = (x7 << 12) | (x7 >>> 20);
                x3 = (x3 + x7) | 0; x15 ^= x3; x15 = (x15 << 8) | (x15 >>> 24);
                x11 = (x11 + x15) | 0; x7 ^= x11; x7 = (x7 << 7) | (x7 >>> 25);
                x0 = (x0 + x5) | 0; x15 ^= x0; x15 = (x15 << 16) | (x15 >>> 16);
                x10 = (x10 + x15) | 0; x5 ^= x10; x5 = (x5 << 12) | (x5 >>> 20);
                x0 = (x0 + x5) | 0; x15 ^= x0; x15 = (x15 << 8) | (x15 >>> 24);
                x10 = (x10 + x15) | 0; x5 ^= x10; x5 = (x5 << 7) | (x5 >>> 25);
                x1 = (x1 + x6) | 0; x12 ^= x1; x12 = (x12 << 16) | (x12 >>> 16);
                x11 = (x11 + x12) | 0; x6 ^= x11; x6 = (x6 << 12) | (x6 >>> 20);
                x1 = (x1 + x6) | 0; x12 ^= x1; x12 = (x12 << 8) | (x12 >>> 24);
                x11 = (x11 + x12) | 0; x6 ^= x11; x6 = (x6 << 7) | (x6 >>> 25);
                x2 = (x2 + x7) | 0; x13 ^= x2; x13 = (x13 << 16) | (x13 >>> 16);
                x8 = (x8 + x13) | 0; x7 ^= x8; x7 = (x7 << 12) | (x7 >>> 20);
                x2 = (x2 + x7) | 0; x13 ^= x2; x13 = (x13 << 8) | (x13 >>> 24);
                x8 = (x8 + x13) | 0; x7 ^= x8; x7 = (x7 << 7) | (x7 >>> 25);
                x3 = (x3 + x4) | 0; x14 ^= x3; x14 = (x14 << 16) | (x14 >>> 16);
                x9 = (x9 + x14) | 0; x4 ^= x9; x4 = (x4 << 12) | (x4 >>> 20);
                x3 = (x3 + x4) | 0; x14 ^= x3; x14 = (x14 << 8) | (x14 >>> 24);
                x9 = (x9 + x14) | 0; x4 ^= x9; x4 = (x4 << 7) | (x4 >>> 25);
            }
            ks[0] = (x0 + j0) | 0;
            ks[1] = (x1 + j1) | 0;
            ks[2] = (x2 + j2) | 0;
            ks[3] = (x3 + j3) | 0;
            ks[4] = (x4 + j4) | 0;
            ks[5] = (x5 + j5) | 0;
            ks[6] = (x6 + j6) | 0;
            ks[7] = (x7 + j7) | 0;
            ks[8] = (x8 + j8) | 0;
            ks[9] = (x9 + j9) | 0;
            ks[10] = (x10 + j10) | 0;
            ks[11] = (x11 + j11) | 0;
            ks[12] = (x12 + j12) | 0;
            ks[13] = (x13 + j13) | 0;
            ks[14] = (x14 + j14) | 0;
            ks[15] = (x15 + j15) | 0;
        }

        function _u32leFromBytes(bytes, off) {
            return (bytes[off] | (bytes[off+1] << 8) | (bytes[off+2] << 16) | (bytes[off+3] << 24)) | 0;
        }

        /**
         * XOR `data` with the ChaCha20 keystream.
         * @param {Uint8Array} key 32-byte key.
         * @param {Uint8Array} nonce 12-byte nonce.
         * @param {Uint8Array} data Plaintext or ciphertext.
         * @param {number} [initialCounter=0] Starting block counter.
         * @returns {Uint8Array|false}
         */
        function xor(key, nonce, data, initialCounter) {
            if (!(key instanceof Uint8Array) || key.length !== 32) {
                console.warn('[crypto] INVALID: chacha20: key must be 32 bytes');
                return false;
            }
            if (!(nonce instanceof Uint8Array) || nonce.length !== 12) {
                console.warn('[crypto] INVALID: chacha20: nonce must be 12 bytes');
                return false;
            }
            const key32 = new Int32Array(8);
            for (let i = 0; i < 8; i++) key32[i] = _u32leFromBytes(key, i * 4);
            const nonce32 = new Int32Array(3);
            for (let i = 0; i < 3; i++) nonce32[i] = _u32leFromBytes(nonce, i * 4);

            // ── Counter overflow guard (32-bit) ────────────
            // RFC 8439 §2.3 : ChaCha20 IETF variant uses a 32-bit block
            // counter. After 2^32 blocks (256 GiB) under a single (key, nonce)
            // the counter wraps and starts re-using keystream blocks → catastrophic
            // (XOR of two ciphertexts cancels the keystream). The XChaCha20
            // draft (`draft-irtf-cfrg-xchacha`) extends to 192-bit nonce +
            // 32-bit counter to defer the limit, but it is *not* implemented
            // here. Active guard: refuse
            // any call that would push the counter past 2^32 - 1.
            const startCounter = (initialCounter >>> 0);  // unsigned 32-bit view
            const blocksNeeded = Math.ceil(data.length / 64);
            // (startCounter + blocksNeeded - 1) is the LAST counter value used.
            // Reject if this would overflow the 32-bit space.
            if (blocksNeeded > 0 && startCounter + blocksNeeded > 0x100000000) {
                console.warn('[crypto] LIMIT-EXCEEDED: chacha20: counter overflow (>256 GiB on this (key, nonce) pair). Rotate key or use a fresh nonce; XChaCha20 is not implemented.');
                return false;
            }

            const out = new Uint8Array(data.length);
            const block = new Int32Array(16);
            let counter = (initialCounter | 0) || 0;
            let off = 0;
            const len = data.length;
            while (off < len) {
                _blockInto(key32, counter, nonce32, block);
                if (len - off >= 64) {
                    // A whole block: four bytes per keystream word (a typed-
                    // array store keeps the low 8 bits).
                    for (let w = 0, o = off; w < 16; w++, o += 4) {
                        const v = block[w];
                        out[o] = data[o] ^ v;
                        out[o + 1] = data[o + 1] ^ (v >>> 8);
                        out[o + 2] = data[o + 2] ^ (v >>> 16);
                        out[o + 3] = data[o + 3] ^ (v >>> 24);
                    }
                    off += 64;
                } else {
                    for (let i = 0; off < len; i++, off++) {
                        out[off] = data[off] ^ (block[i >>> 2] >>> ((i & 3) * 8));
                    }
                }
                counter = (counter + 1) | 0;
            }
            return out;
        }

        return /** @type {ChaCha20API} */ (/** @type {any} */ (Object.defineProperty({
            xor
        }, Symbol.for('@awacloud/fw/internal'), {
            // Internal primitive - exposed for debug / introspection (public tests
            // exercise it indirectly via `xor(zero, …)`). The internal slot
            // (core/internal.js), outside the API.
            value: { block: _blockInto }
        })));
    }
};
