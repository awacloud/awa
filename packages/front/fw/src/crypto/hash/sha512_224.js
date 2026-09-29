// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview SHA-512/224 (FIPS 180-4 §5.3.6.1).
 *
 * Truncated SHA-512 variant: same compression function as SHA-512 (cf. sha512.js)
 * but with a distinct initial hash value (IV) and a 224-bit final digest taken
 * from the first 28 bytes of the 64-byte SHA-512 internal state.
 *
 * Per FIPS 180-4 §5.3.6, the IV is computed as SHA-512 with the IV
 * `H_0 = 6a09e667f3bcc908 ⊕ a5a5a5a5a5a5a5a5 || ...` applied to the input
 * `"SHA-512/224"` (ASCII), then taking the resulting 8 × 64-bit state. The
 * resulting fixed IV is hard-coded below per the standard.
 *
 * Block size: 1024 bits (same as SHA-512 - required for HMAC-SHA-512/224).
 *
 */

import { sha512 } from './sha512.js';

/**
 * Streaming SHA-512/224 hasher instance (truncated SHA-512; bitArray = `number[]` of 32-bit words).
 * @typedef {object} Sha512_224Hasher
 * @property {number} blockSize Block size in bits (1024).
 * @property {number[]} _init IV (16 × 32-bit halves = 8 × 64-bit lanes).
 * @property {number} _outWords Number of 32-bit words retained in the digest (7).
 * @property {number[]} _key Round constants.
 * @property {() => Sha512_224Hasher} reset Reset internal state; returns `this`.
 * @property {(data: number[]|string) => (Sha512_224Hasher|false)} update Absorb a bitArray or UTF-8 string; returns `this`, or `false` on > 2^53-1 bit overflow.
 * @property {() => number[]} finalize Pad and emit the 224-bit digest as a bitArray (7 words).
 * @property {(words: ArrayLike<number>) => void} _block Compress one 32-word (1024-bit) block.
 */

/**
 * Object returned by `sha512_224.factory()`.
 * @typedef {object} Sha512_224API
 * @property {new (hash?: Sha512_224Hasher) => Sha512_224Hasher} fn Streaming hasher constructor (optional arg clones an existing instance).
 * @property {(data: number[]|string) => number[]} hash One-shot hash; returns the 224-bit digest as a bitArray.
 */

export const sha512_224 = {
    name: 'sha512_224',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['sha512'],
    deps: [sha512],

    /** @returns {Sha512_224API} */
    factory(sha512) {
        // FIPS 180-4 §5.3.6.1 - IV for SHA-512/224 (8 × 64-bit, 16 × 32-bit halves).
        const _INIT_512_224 = [
            0x8c3d37c8, 0x19544da2, 0x73e19966, 0x89dcd4d6, 0x1dfab7ae, 0x32ff9c82, 0x679dd514, 0x582f9fcf,
            0x0f6d2b69, 0x7bd44da8, 0x77e36f73, 0x04c48942, 0x3f9d85a8, 0x6a1d36c8, 0x1112e6ad, 0x91d692a1
        ];

        // outWords = 7 → 7 × 32-bit = 224 bits.
        const inner = sha512._internal.makeSha(_INIT_512_224, 7);

        return {
            fn: inner.fn,
            hash: inner.hash
        };
    }
};
