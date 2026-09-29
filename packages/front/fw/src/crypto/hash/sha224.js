// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview SHA-224 hash function (FIPS 180-4 §5.3.2 + §6.3).
 *
 * Truncated SHA-256 variant: same compression function as SHA-256
 * (cf. sha256.js) but with a distinct IV and a 224-bit digest taken
 * from the first 7 × 32-bit words of the final SHA-256 state.
 *
 * Block size: 512 bits (identical to SHA-256, required for HMAC-SHA-224).
 *
 * **Architecture (post-upgrade audit)**: this module is now a thin wrapper
 * over `sha256._internal.makeSha(_INIT_224, 7)` - previously it duplicated
 * the 80 LOC of the compression function. Mirrors the
 * `sha512_224.js` / `sha512_256.js` pattern.
 *
 */

import { sha256 } from './sha256.js';

/**
 * Streaming SHA-224 hasher instance (truncated SHA-256; bitArray = `number[]` of 32-bit words).
 * @typedef {object} Sha224Hasher
 * @property {number} blockSize Block size in bits (512).
 * @property {number[]} _init IV (8 × 32-bit words).
 * @property {number[]} _key Round constants K[0..63].
 * @property {() => Sha224Hasher} reset Reset internal state; returns `this`.
 * @property {(data: number[]|string) => (Sha224Hasher|false)} update Absorb a bitArray or UTF-8 string; returns `this`, or `false` on > 2^53-1 bit overflow.
 * @property {() => number[]} finalize Pad and emit the 224-bit digest as a bitArray (7 words).
 * @property {(words: ArrayLike<number>) => void} _block Compress one 16-word block.
 */

/**
 * Object returned by `sha224.factory()` (delegates to `sha256._internal.makeSha`).
 * @typedef {object} Sha224API
 * @property {new (hash?: Sha224Hasher) => Sha224Hasher} fn Streaming hasher constructor (optional arg clones an existing instance).
 * @property {(data: number[]|string) => number[]} hash One-shot hash; returns the 224-bit digest as a bitArray.
 */

export const sha224 = {
    name: 'sha224',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['sha256'],
    deps: [sha256],

    /** @returns {Sha224API} */
    factory(sha256) {
        // FIPS 180-4 §5.3.2 - IV for SHA-224 (8 × 32-bit).
        const _INIT_224 = [
            0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,
            0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4
        ];

        // outWords = 7 → 7 × 32-bit = 224 bits (FIPS 180-4 §6.3 truncation).
        return sha256._internal.makeSha(_INIT_224, 7);
    }
};
