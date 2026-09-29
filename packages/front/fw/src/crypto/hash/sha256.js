// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview SHA-256 hash function (FIPS 180-4).
 *
 * Origin: adapted from the Stanford JavaScript Crypto Library (SJCL),
 * BSD-2-Clause (SJCL is dual-licensed BSD-2-Clause OR GPL-2.0-or-later; the
 * BSD-2-Clause terms are retained, see third-party/NOTICE-sjcl); the ESM
 * factory, JSDoc, tests and every later change are this project's own work.
 * See docs/dev/provenance.md.
 *
 * Exposes a constructor `fn` for streaming hashing and a static `hash(data)`
 * for one-shot hashing. Inputs may be a UTF-8 string or a `bitArray`. The
 * digest is returned as a `bitArray` of 8 32-bit words (256 bits).
 *
 * **Architecture (post-upgrade audit)**: the parametric factory
 * `_makeSha(init, outWords)` is exposed via `_internal.makeSha` - used by
 * `sha224.js` (FIPS 180-4 §5.3.2), which shares the same compression
 * function with a distinct IV and a 7-word truncation. Mirrors the pattern
 * of `sha512.js`, which serves `sha512_224.js` and `sha512_256.js`.
 *
 */

import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';

/**
 * Streaming SHA-256 hasher instance (SJCL-style; bitArray = `number[]` of 32-bit words).
 * @typedef {object} Sha256Hasher
 * @property {number} blockSize Block size in bits (512).
 * @property {number[]} _init IV (8 × 32-bit words).
 * @property {number[]} _key Round constants K[0..63].
 * @property {() => Sha256Hasher} reset Reset internal state; returns `this`.
 * @property {(data: number[]|string) => (Sha256Hasher|false)} update Absorb a bitArray or UTF-8 string; returns `this`, or `false` on > 2^53-1 bit overflow.
 * @property {() => number[]} finalize Pad and emit the digest as a bitArray (8 words for SHA-256, truncated per `outWords`).
 * @property {(words: ArrayLike<number>) => void} _block Compress one 16-word block.
 */

/**
 * Object returned by `sha256.factory()`.
 * @typedef {object} Sha256API
 * @property {new (hash?: Sha256Hasher) => Sha256Hasher} fn Streaming hasher constructor (optional arg clones an existing instance).
 * @property {(data: number[]|string) => number[]} hash One-shot hash; returns the digest as a bitArray.
 * @property {{ makeSha: (init: number[], outWords: number) => { fn: Function, hash: Function } }} _internal Escape hatch used by sha224.js to build a truncated variant.
 */

export const sha256 = {
    name: 'sha256',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['bitArray', 'utf8'],
    deps: [bitArray, utf8],

    /** @returns {Sha256API} */
    factory(bitArray, utf8) {

        const _INIT = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ];

        const _KEY = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];

        // Parametric factory shared with sha224.js. `init` is the IV
        // (8 × 32-bit words) and `outWords` is the digest size in words
        // (8 for SHA-256, 7 for SHA-224 - FIPS 180-4 §5.3.2). `_KEY`
        // (constants K[0..63]) is identical for SHA-224 and SHA-256
        // (FIPS 180-4 §4.2.2).
        /**
         * Parametric SHA-256/224 compression factory.
         * @param {number[]} init  8 × 32-bit IV.
         * @param {number} outWords  Number of 32-bit words in the digest
         *   (8 for SHA-256, 7 for SHA-224).
         * @returns {{fn: Function, hash: Function}}
         */
        function _makeSha(init, outWords) {
            const sha = {};

            sha.fn = function (hash) {
                if (hash) {
                    this._h = hash._h.slice(0);
                    this._buffer = hash._buffer.slice(0);
                    this._length = hash._length;
                } else {
                    this.reset();
                }
            };

            sha.hash = function (data) {
                // @ts-ignore - update() returns false only on overflow; for a fresh instance it always returns this
                return (new sha.fn()).update(data).finalize();
            };

            sha.fn.prototype = {
                blockSize: 512,
                _init: init,
                _key: _KEY,

                reset() {
                    this._h = this._init.slice(0);
                    this._buffer = [];
                    this._length = 0;
                    return this;
                },

                update(data) {
                    if (typeof data === 'string') {
                        data = bitArray.ui8_to_ba(utf8.toBytes(data));
                    }
                    const b = this._buffer = bitArray.concat(this._buffer, data);
                    const ol = this._length;
                    const nl = this._length = ol + bitArray.bitLength(data);
                    if (nl > 9007199254740991) {
                        console.warn('[crypto] INVALID: sha256: cannot hash more than 2^53 - 1 bits');
                        return false;
                    }
                    const c = new Uint32Array(b);
                    let j = 0;
                    for (let i = 512 + ol - ((512 + ol) & 511); i <= nl; i += 512) {
                        this._block(c.subarray(16 * j, 16 * (j + 1)));
                        j += 1;
                    }
                    b.splice(0, 16 * j);
                    return this;
                },

                finalize() {
                    let b = this._buffer;
                    const h = this._h;

                    b = bitArray.concat(b, [bitArray.partial(1, 1)]);
                    for (let i = b.length + 2; i & 15; i++) {
                        b.push(0);
                    }
                    b.push(Math.floor(this._length / 0x100000000));
                    b.push(this._length | 0);

                    while (b.length) {
                        this._block(b.splice(0, 16));
                    }

                    this.reset();
                    return outWords < 8 ? h.slice(0, outWords) : h;
                },

                _block(w) {
                    const h = this._h;
                    const k = this._key;
                    let h0 = h[0], h1 = h[1], h2 = h[2], h3 = h[3];
                    let h4 = h[4], h5 = h[5], h6 = h[6], h7 = h[7];
                    let tmp;
                    let a;
                    let b;

                    for (let i = 0; i < 64; i++) {
                        if (i < 16) {
                            tmp = w[i];
                        } else {
                            a = w[(i + 1) & 15];
                            b = w[(i + 14) & 15];
                            tmp = w[i & 15] = ((a >>> 7 ^ a >>> 18 ^ a >>> 3 ^ a << 25 ^ a << 14) +
                                (b >>> 17 ^ b >>> 19 ^ b >>> 10 ^ b << 15 ^ b << 13) +
                                w[i & 15] + w[(i + 9) & 15]) | 0;
                        }

                        tmp = (tmp + h7 + (h4 >>> 6 ^ h4 >>> 11 ^ h4 >>> 25 ^ h4 << 26 ^ h4 << 21 ^ h4 << 7) + (h6 ^ h4 & (h5 ^ h6)) + k[i]);

                        h7 = h6;
                        h6 = h5;
                        h5 = h4;
                        h4 = h3 + tmp | 0;
                        h3 = h2;
                        h2 = h1;
                        h1 = h0;
                        h0 = (tmp + ((h1 & h2) ^ (h3 & (h1 ^ h2))) + (h1 >>> 2 ^ h1 >>> 13 ^ h1 >>> 22 ^ h1 << 30 ^ h1 << 19 ^ h1 << 10)) | 0;
                    }

                    h[0] = h[0] + h0 | 0;
                    h[1] = h[1] + h1 | 0;
                    h[2] = h[2] + h2 | 0;
                    h[3] = h[3] + h3 | 0;
                    h[4] = h[4] + h4 | 0;
                    h[5] = h[5] + h5 | 0;
                    h[6] = h[6] + h6 | 0;
                    h[7] = h[7] + h7 | 0;
                }
            };

            return sha;
        }

        // Default = SHA-256 (FIPS 180-4 §6.2, full 256-bit digest = 8 words).
        const _sha256 = _makeSha(_INIT, 8);

        return /** @type {Sha256API} */ (/** @type {any} */ ({
            // Public API (unchanged).
            fn: _sha256.fn,
            hash: _sha256.hash,

            // Internal escape hatch - used by sha224.js (FIPS 180-4 §5.3.2)
            // to share the SHA-256 compression function with a custom IV
            // and a 7-word truncated output.
            _internal: { makeSha: _makeSha }
        }));
    }
};
