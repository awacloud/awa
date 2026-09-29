// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview SHA-512/256 (FIPS 180-4 §5.3.6.2).
 *
 * Truncated SHA-512 variant: same compression function as SHA-512 (cf. sha512.js)
 * but with a distinct initial hash value (IV) and a 256-bit final digest taken
 * from the first 32 bytes of the 64-byte SHA-512 internal state.
 *
 * Block size: 1024 bits (same as SHA-512 - required for HMAC-SHA-512/256).
 *
 * SHA-512/256 is significantly faster than SHA-256 on 64-bit platforms while
 * providing the same 256-bit security level. Recommended by NIST in
 * SP 800-185 §4 for KMAC and elsewhere when 256-bit output is needed and
 * 64-bit performance matters.
 *
 */

import { sha512 } from './sha512.js';

/**
 * Streaming SHA-512/256 hasher instance (truncated SHA-512; bitArray = `number[]` of 32-bit words).
 * @typedef {object} Sha512_256Hasher
 * @property {number} blockSize Block size in bits (1024).
 * @property {number[]} _init IV (16 × 32-bit halves = 8 × 64-bit lanes).
 * @property {number} _outWords Number of 32-bit words retained in the digest (8).
 * @property {number[]} _key Round constants.
 * @property {() => Sha512_256Hasher} reset Reset internal state; returns `this`.
 * @property {(data: number[]|string) => (Sha512_256Hasher|false)} update Absorb a bitArray or UTF-8 string; returns `this`, or `false` on > 2^53-1 bit overflow.
 * @property {() => number[]} finalize Pad and emit the 256-bit digest as a bitArray (8 words).
 * @property {(words: ArrayLike<number>) => void} _block Compress one 32-word (1024-bit) block.
 */

/**
 * Object returned by `sha512_256.factory()`.
 * @typedef {object} Sha512_256API
 * @property {new (hash?: Sha512_256Hasher) => Sha512_256Hasher} fn Streaming hasher constructor (optional arg clones an existing instance).
 * @property {(data: number[]|string) => number[]} hash One-shot hash; returns the 256-bit digest as a bitArray.
 */

export const sha512_256 = {
    name: 'sha512_256',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['sha512'],
    deps: [sha512],

    /** @returns {Sha512_256API} */
    factory(sha512) {
        // FIPS 180-4 §5.3.6.2 - IV for SHA-512/256 (8 × 64-bit, 16 × 32-bit halves).
        // H_0..H_7 = SHA-512(ASCII("SHA-512/256")) using IV = SHA-512_IV ⊕ a5...a5.
        // Derived via the spec procedure and cross-checked against OpenSSL's
        // crypto/sha/sha512.c sha512_256_init constants.
        const _INIT_512_256 = [
            0x22312194, 0xfc2bf72c,   // H_0
            0x9f555fa3, 0xc84c64c2,   // H_1
            0x2393b86b, 0x6f53b151,   // H_2
            0x96387719, 0x5940eabd,   // H_3
            0x96283ee2, 0xa88effe3,   // H_4
            0xbe5e1e25, 0x53863992,   // H_5
            0x2b0199fc, 0x2c85b8aa,   // H_6
            0x0eb72ddc, 0x81c52ca2    // H_7
        ];

        // outWords = 8 → 8 × 32-bit = 256 bits.
        const inner = sha512._internal.makeSha(_INIT_512_256, 8);

        return {
            fn: inner.fn,
            hash: inner.hash
        };
    }
};
