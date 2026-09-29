// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview SHA-384 hash function (FIPS 180-4 §5.3.4 + §6.5).
 *
 * Truncated SHA-512 variant: same compression function as SHA-512
 * (cf. sha512.js) but with a distinct IV and a 384-bit digest taken
 * from the first 12 × 32-bit words of the final SHA-512 state.
 *
 * Block size: 1024 bits (identical to SHA-512, required for HMAC-SHA-384).
 *
 * **Architecture (post-upgrade audit)**: this module is now a thin wrapper
 * over `sha512._internal.makeSha(_INIT_384, 12)` - previously it duplicated
 * the 120 LOC of the compression function. Mirrors the
 * `sha512_224.js` / `sha512_256.js` pattern.
 *
 */

import { sha512 } from './sha512.js';

/**
 * Streaming SHA-384 hasher instance (truncated SHA-512; bitArray = `number[]` of 32-bit words).
 * @typedef {object} Sha384Hasher
 * @property {number} blockSize Block size in bits (1024).
 * @property {number[]} _init IV (16 × 32-bit halves = 8 × 64-bit lanes).
 * @property {number} _outWords Number of 32-bit words retained in the digest (12).
 * @property {number[]} _key Round constants.
 * @property {() => Sha384Hasher} reset Reset internal state; returns `this`.
 * @property {(data: number[]|string) => (Sha384Hasher|false)} update Absorb a bitArray or UTF-8 string; returns `this`, or `false` on > 2^53-1 bit overflow.
 * @property {() => number[]} finalize Pad and emit the 384-bit digest as a bitArray (12 words).
 * @property {(words: ArrayLike<number>) => void} _block Compress one 32-word (1024-bit) block.
 */

/**
 * Object returned by `sha384.factory()` (delegates to `sha512._internal.makeSha`).
 * @typedef {object} Sha384API
 * @property {new (hash?: Sha384Hasher) => Sha384Hasher} fn Streaming hasher constructor (optional arg clones an existing instance).
 * @property {(data: number[]|string) => number[]} hash One-shot hash; returns the 384-bit digest as a bitArray.
 */

export const sha384 = {
    name: 'sha384',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['sha512'],
    deps: [sha512],

    /** @returns {Sha384API} */
    factory(sha512) {
        // FIPS 180-4 §5.3.4 - IV for SHA-384 (8 × 64-bit, 16 × 32-bit halves).
        const _INIT_384 = [
            0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939,
            0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4
        ];

        // outWords = 12 → 12 × 32-bit = 384 bits (FIPS 180-4 §6.5 truncation).
        return sha512._internal.makeSha(_INIT_384, 12);
    }
};
