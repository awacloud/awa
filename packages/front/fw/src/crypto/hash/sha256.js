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
 * `_makeSha(init, outWords)` is exposed in the internal slot (`makeSha`) - used by
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
 * @property {(data: number[]|string|Uint8Array) => (Sha256Hasher|false)} update Absorb a bitArray, a UTF-8 string or bytes (`Uint8Array`, hashed as its bytes); returns `this`, or `false` on > 2^53-1 bit overflow.
 * @property {() => number[]} finalize Pad and emit the digest as a bitArray (8 words for SHA-256, truncated per `outWords`).
 * @property {(words: ArrayLike<number>) => void} _block Compress one 16-word block.
 */

/**
 * Object returned by `sha256.factory()`.
 * @typedef {object} Sha256API
 * @property {new (hash?: Sha256Hasher) => Sha256Hasher} fn Streaming hasher constructor (optional arg clones an existing instance).
 * @property {(data: number[]|string|Uint8Array) => number[]} hash One-shot hash of a bitArray, a UTF-8 string or bytes; returns the digest as a bitArray.
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
        // The round constants as int32 (a plain array holds the values above
        // 2^31 as doubles, which JavaScriptCore then computes with).
        const _K32 = Int32Array.from(_KEY);
        /** One block's 16 words, read from bytes by the `update` fast path. */
        const _BW = new Int32Array(16);
        /** The message schedule, shared by every compression. */
        const _W64 = new Int32Array(64);

        /**
         * The SHA-256 compression of one 16-word block `w` into the 8-word
         * state `h` (FIPS 180-4 §6.2.2): the schedule in `_W64`, the 64 rounds
         * unrolled (generated) with the registers renamed rather than moved,
         * every addition wrapped to int32. `w` is not modified.
         * @param {Int32Array|number[]} h
         * @param {Int32Array|Uint32Array|number[]} w
         */
        function _compress(h, w) {
            const k = _K32, W = _W64;
            for (let i = 0; i < 16; i++) W[i] = w[i] | 0;
            for (let i = 16; i < 64; i++) {
                const a = W[i - 15], b = W[i - 2];
                const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
                const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
                W[i] = (((s0 + W[i - 16]) | 0) + ((s1 + W[i - 7]) | 0)) | 0;
            }
            let a = h[0] | 0, b = h[1] | 0, c = h[2] | 0, d = h[3] | 0, e = h[4] | 0, f = h[5] | 0, g = h[6] | 0, hh = h[7] | 0;
            let t1, t2, s0, s1, ch, mj;
            s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            ch = g ^ (e & (f ^ g));
            t1 = ((((((hh + s1) | 0) + ch) | 0) + ((k[0] + W[0]) | 0)) | 0);
            s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            mj = (a & b) ^ (c & (a ^ b));
            t2 = (s0 + mj) | 0;
            d = (d + t1) | 0; hh = (t1 + t2) | 0;
            s1 = ((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7));
            ch = f ^ (d & (e ^ f));
            t1 = ((((((g + s1) | 0) + ch) | 0) + ((k[1] + W[1]) | 0)) | 0);
            s0 = ((hh >>> 2) | (hh << 30)) ^ ((hh >>> 13) | (hh << 19)) ^ ((hh >>> 22) | (hh << 10));
            mj = (hh & a) ^ (b & (hh ^ a));
            t2 = (s0 + mj) | 0;
            c = (c + t1) | 0; g = (t1 + t2) | 0;
            s1 = ((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7));
            ch = e ^ (c & (d ^ e));
            t1 = ((((((f + s1) | 0) + ch) | 0) + ((k[2] + W[2]) | 0)) | 0);
            s0 = ((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10));
            mj = (g & hh) ^ (a & (g ^ hh));
            t2 = (s0 + mj) | 0;
            b = (b + t1) | 0; f = (t1 + t2) | 0;
            s1 = ((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7));
            ch = d ^ (b & (c ^ d));
            t1 = ((((((e + s1) | 0) + ch) | 0) + ((k[3] + W[3]) | 0)) | 0);
            s0 = ((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10));
            mj = (f & g) ^ (hh & (f ^ g));
            t2 = (s0 + mj) | 0;
            a = (a + t1) | 0; e = (t1 + t2) | 0;
            s1 = ((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7));
            ch = c ^ (a & (b ^ c));
            t1 = ((((((d + s1) | 0) + ch) | 0) + ((k[4] + W[4]) | 0)) | 0);
            s0 = ((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10));
            mj = (e & f) ^ (g & (e ^ f));
            t2 = (s0 + mj) | 0;
            hh = (hh + t1) | 0; d = (t1 + t2) | 0;
            s1 = ((hh >>> 6) | (hh << 26)) ^ ((hh >>> 11) | (hh << 21)) ^ ((hh >>> 25) | (hh << 7));
            ch = b ^ (hh & (a ^ b));
            t1 = ((((((c + s1) | 0) + ch) | 0) + ((k[5] + W[5]) | 0)) | 0);
            s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
            mj = (d & e) ^ (f & (d ^ e));
            t2 = (s0 + mj) | 0;
            g = (g + t1) | 0; c = (t1 + t2) | 0;
            s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
            ch = a ^ (g & (hh ^ a));
            t1 = ((((((b + s1) | 0) + ch) | 0) + ((k[6] + W[6]) | 0)) | 0);
            s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
            mj = (c & d) ^ (e & (c ^ d));
            t2 = (s0 + mj) | 0;
            f = (f + t1) | 0; b = (t1 + t2) | 0;
            s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
            ch = hh ^ (f & (g ^ hh));
            t1 = ((((((a + s1) | 0) + ch) | 0) + ((k[7] + W[7]) | 0)) | 0);
            s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
            mj = (b & c) ^ (d & (b ^ c));
            t2 = (s0 + mj) | 0;
            e = (e + t1) | 0; a = (t1 + t2) | 0;
            s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            ch = g ^ (e & (f ^ g));
            t1 = ((((((hh + s1) | 0) + ch) | 0) + ((k[8] + W[8]) | 0)) | 0);
            s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            mj = (a & b) ^ (c & (a ^ b));
            t2 = (s0 + mj) | 0;
            d = (d + t1) | 0; hh = (t1 + t2) | 0;
            s1 = ((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7));
            ch = f ^ (d & (e ^ f));
            t1 = ((((((g + s1) | 0) + ch) | 0) + ((k[9] + W[9]) | 0)) | 0);
            s0 = ((hh >>> 2) | (hh << 30)) ^ ((hh >>> 13) | (hh << 19)) ^ ((hh >>> 22) | (hh << 10));
            mj = (hh & a) ^ (b & (hh ^ a));
            t2 = (s0 + mj) | 0;
            c = (c + t1) | 0; g = (t1 + t2) | 0;
            s1 = ((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7));
            ch = e ^ (c & (d ^ e));
            t1 = ((((((f + s1) | 0) + ch) | 0) + ((k[10] + W[10]) | 0)) | 0);
            s0 = ((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10));
            mj = (g & hh) ^ (a & (g ^ hh));
            t2 = (s0 + mj) | 0;
            b = (b + t1) | 0; f = (t1 + t2) | 0;
            s1 = ((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7));
            ch = d ^ (b & (c ^ d));
            t1 = ((((((e + s1) | 0) + ch) | 0) + ((k[11] + W[11]) | 0)) | 0);
            s0 = ((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10));
            mj = (f & g) ^ (hh & (f ^ g));
            t2 = (s0 + mj) | 0;
            a = (a + t1) | 0; e = (t1 + t2) | 0;
            s1 = ((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7));
            ch = c ^ (a & (b ^ c));
            t1 = ((((((d + s1) | 0) + ch) | 0) + ((k[12] + W[12]) | 0)) | 0);
            s0 = ((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10));
            mj = (e & f) ^ (g & (e ^ f));
            t2 = (s0 + mj) | 0;
            hh = (hh + t1) | 0; d = (t1 + t2) | 0;
            s1 = ((hh >>> 6) | (hh << 26)) ^ ((hh >>> 11) | (hh << 21)) ^ ((hh >>> 25) | (hh << 7));
            ch = b ^ (hh & (a ^ b));
            t1 = ((((((c + s1) | 0) + ch) | 0) + ((k[13] + W[13]) | 0)) | 0);
            s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
            mj = (d & e) ^ (f & (d ^ e));
            t2 = (s0 + mj) | 0;
            g = (g + t1) | 0; c = (t1 + t2) | 0;
            s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
            ch = a ^ (g & (hh ^ a));
            t1 = ((((((b + s1) | 0) + ch) | 0) + ((k[14] + W[14]) | 0)) | 0);
            s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
            mj = (c & d) ^ (e & (c ^ d));
            t2 = (s0 + mj) | 0;
            f = (f + t1) | 0; b = (t1 + t2) | 0;
            s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
            ch = hh ^ (f & (g ^ hh));
            t1 = ((((((a + s1) | 0) + ch) | 0) + ((k[15] + W[15]) | 0)) | 0);
            s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
            mj = (b & c) ^ (d & (b ^ c));
            t2 = (s0 + mj) | 0;
            e = (e + t1) | 0; a = (t1 + t2) | 0;
            s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            ch = g ^ (e & (f ^ g));
            t1 = ((((((hh + s1) | 0) + ch) | 0) + ((k[16] + W[16]) | 0)) | 0);
            s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            mj = (a & b) ^ (c & (a ^ b));
            t2 = (s0 + mj) | 0;
            d = (d + t1) | 0; hh = (t1 + t2) | 0;
            s1 = ((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7));
            ch = f ^ (d & (e ^ f));
            t1 = ((((((g + s1) | 0) + ch) | 0) + ((k[17] + W[17]) | 0)) | 0);
            s0 = ((hh >>> 2) | (hh << 30)) ^ ((hh >>> 13) | (hh << 19)) ^ ((hh >>> 22) | (hh << 10));
            mj = (hh & a) ^ (b & (hh ^ a));
            t2 = (s0 + mj) | 0;
            c = (c + t1) | 0; g = (t1 + t2) | 0;
            s1 = ((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7));
            ch = e ^ (c & (d ^ e));
            t1 = ((((((f + s1) | 0) + ch) | 0) + ((k[18] + W[18]) | 0)) | 0);
            s0 = ((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10));
            mj = (g & hh) ^ (a & (g ^ hh));
            t2 = (s0 + mj) | 0;
            b = (b + t1) | 0; f = (t1 + t2) | 0;
            s1 = ((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7));
            ch = d ^ (b & (c ^ d));
            t1 = ((((((e + s1) | 0) + ch) | 0) + ((k[19] + W[19]) | 0)) | 0);
            s0 = ((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10));
            mj = (f & g) ^ (hh & (f ^ g));
            t2 = (s0 + mj) | 0;
            a = (a + t1) | 0; e = (t1 + t2) | 0;
            s1 = ((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7));
            ch = c ^ (a & (b ^ c));
            t1 = ((((((d + s1) | 0) + ch) | 0) + ((k[20] + W[20]) | 0)) | 0);
            s0 = ((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10));
            mj = (e & f) ^ (g & (e ^ f));
            t2 = (s0 + mj) | 0;
            hh = (hh + t1) | 0; d = (t1 + t2) | 0;
            s1 = ((hh >>> 6) | (hh << 26)) ^ ((hh >>> 11) | (hh << 21)) ^ ((hh >>> 25) | (hh << 7));
            ch = b ^ (hh & (a ^ b));
            t1 = ((((((c + s1) | 0) + ch) | 0) + ((k[21] + W[21]) | 0)) | 0);
            s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
            mj = (d & e) ^ (f & (d ^ e));
            t2 = (s0 + mj) | 0;
            g = (g + t1) | 0; c = (t1 + t2) | 0;
            s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
            ch = a ^ (g & (hh ^ a));
            t1 = ((((((b + s1) | 0) + ch) | 0) + ((k[22] + W[22]) | 0)) | 0);
            s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
            mj = (c & d) ^ (e & (c ^ d));
            t2 = (s0 + mj) | 0;
            f = (f + t1) | 0; b = (t1 + t2) | 0;
            s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
            ch = hh ^ (f & (g ^ hh));
            t1 = ((((((a + s1) | 0) + ch) | 0) + ((k[23] + W[23]) | 0)) | 0);
            s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
            mj = (b & c) ^ (d & (b ^ c));
            t2 = (s0 + mj) | 0;
            e = (e + t1) | 0; a = (t1 + t2) | 0;
            s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            ch = g ^ (e & (f ^ g));
            t1 = ((((((hh + s1) | 0) + ch) | 0) + ((k[24] + W[24]) | 0)) | 0);
            s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            mj = (a & b) ^ (c & (a ^ b));
            t2 = (s0 + mj) | 0;
            d = (d + t1) | 0; hh = (t1 + t2) | 0;
            s1 = ((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7));
            ch = f ^ (d & (e ^ f));
            t1 = ((((((g + s1) | 0) + ch) | 0) + ((k[25] + W[25]) | 0)) | 0);
            s0 = ((hh >>> 2) | (hh << 30)) ^ ((hh >>> 13) | (hh << 19)) ^ ((hh >>> 22) | (hh << 10));
            mj = (hh & a) ^ (b & (hh ^ a));
            t2 = (s0 + mj) | 0;
            c = (c + t1) | 0; g = (t1 + t2) | 0;
            s1 = ((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7));
            ch = e ^ (c & (d ^ e));
            t1 = ((((((f + s1) | 0) + ch) | 0) + ((k[26] + W[26]) | 0)) | 0);
            s0 = ((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10));
            mj = (g & hh) ^ (a & (g ^ hh));
            t2 = (s0 + mj) | 0;
            b = (b + t1) | 0; f = (t1 + t2) | 0;
            s1 = ((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7));
            ch = d ^ (b & (c ^ d));
            t1 = ((((((e + s1) | 0) + ch) | 0) + ((k[27] + W[27]) | 0)) | 0);
            s0 = ((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10));
            mj = (f & g) ^ (hh & (f ^ g));
            t2 = (s0 + mj) | 0;
            a = (a + t1) | 0; e = (t1 + t2) | 0;
            s1 = ((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7));
            ch = c ^ (a & (b ^ c));
            t1 = ((((((d + s1) | 0) + ch) | 0) + ((k[28] + W[28]) | 0)) | 0);
            s0 = ((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10));
            mj = (e & f) ^ (g & (e ^ f));
            t2 = (s0 + mj) | 0;
            hh = (hh + t1) | 0; d = (t1 + t2) | 0;
            s1 = ((hh >>> 6) | (hh << 26)) ^ ((hh >>> 11) | (hh << 21)) ^ ((hh >>> 25) | (hh << 7));
            ch = b ^ (hh & (a ^ b));
            t1 = ((((((c + s1) | 0) + ch) | 0) + ((k[29] + W[29]) | 0)) | 0);
            s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
            mj = (d & e) ^ (f & (d ^ e));
            t2 = (s0 + mj) | 0;
            g = (g + t1) | 0; c = (t1 + t2) | 0;
            s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
            ch = a ^ (g & (hh ^ a));
            t1 = ((((((b + s1) | 0) + ch) | 0) + ((k[30] + W[30]) | 0)) | 0);
            s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
            mj = (c & d) ^ (e & (c ^ d));
            t2 = (s0 + mj) | 0;
            f = (f + t1) | 0; b = (t1 + t2) | 0;
            s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
            ch = hh ^ (f & (g ^ hh));
            t1 = ((((((a + s1) | 0) + ch) | 0) + ((k[31] + W[31]) | 0)) | 0);
            s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
            mj = (b & c) ^ (d & (b ^ c));
            t2 = (s0 + mj) | 0;
            e = (e + t1) | 0; a = (t1 + t2) | 0;
            s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            ch = g ^ (e & (f ^ g));
            t1 = ((((((hh + s1) | 0) + ch) | 0) + ((k[32] + W[32]) | 0)) | 0);
            s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            mj = (a & b) ^ (c & (a ^ b));
            t2 = (s0 + mj) | 0;
            d = (d + t1) | 0; hh = (t1 + t2) | 0;
            s1 = ((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7));
            ch = f ^ (d & (e ^ f));
            t1 = ((((((g + s1) | 0) + ch) | 0) + ((k[33] + W[33]) | 0)) | 0);
            s0 = ((hh >>> 2) | (hh << 30)) ^ ((hh >>> 13) | (hh << 19)) ^ ((hh >>> 22) | (hh << 10));
            mj = (hh & a) ^ (b & (hh ^ a));
            t2 = (s0 + mj) | 0;
            c = (c + t1) | 0; g = (t1 + t2) | 0;
            s1 = ((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7));
            ch = e ^ (c & (d ^ e));
            t1 = ((((((f + s1) | 0) + ch) | 0) + ((k[34] + W[34]) | 0)) | 0);
            s0 = ((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10));
            mj = (g & hh) ^ (a & (g ^ hh));
            t2 = (s0 + mj) | 0;
            b = (b + t1) | 0; f = (t1 + t2) | 0;
            s1 = ((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7));
            ch = d ^ (b & (c ^ d));
            t1 = ((((((e + s1) | 0) + ch) | 0) + ((k[35] + W[35]) | 0)) | 0);
            s0 = ((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10));
            mj = (f & g) ^ (hh & (f ^ g));
            t2 = (s0 + mj) | 0;
            a = (a + t1) | 0; e = (t1 + t2) | 0;
            s1 = ((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7));
            ch = c ^ (a & (b ^ c));
            t1 = ((((((d + s1) | 0) + ch) | 0) + ((k[36] + W[36]) | 0)) | 0);
            s0 = ((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10));
            mj = (e & f) ^ (g & (e ^ f));
            t2 = (s0 + mj) | 0;
            hh = (hh + t1) | 0; d = (t1 + t2) | 0;
            s1 = ((hh >>> 6) | (hh << 26)) ^ ((hh >>> 11) | (hh << 21)) ^ ((hh >>> 25) | (hh << 7));
            ch = b ^ (hh & (a ^ b));
            t1 = ((((((c + s1) | 0) + ch) | 0) + ((k[37] + W[37]) | 0)) | 0);
            s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
            mj = (d & e) ^ (f & (d ^ e));
            t2 = (s0 + mj) | 0;
            g = (g + t1) | 0; c = (t1 + t2) | 0;
            s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
            ch = a ^ (g & (hh ^ a));
            t1 = ((((((b + s1) | 0) + ch) | 0) + ((k[38] + W[38]) | 0)) | 0);
            s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
            mj = (c & d) ^ (e & (c ^ d));
            t2 = (s0 + mj) | 0;
            f = (f + t1) | 0; b = (t1 + t2) | 0;
            s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
            ch = hh ^ (f & (g ^ hh));
            t1 = ((((((a + s1) | 0) + ch) | 0) + ((k[39] + W[39]) | 0)) | 0);
            s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
            mj = (b & c) ^ (d & (b ^ c));
            t2 = (s0 + mj) | 0;
            e = (e + t1) | 0; a = (t1 + t2) | 0;
            s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            ch = g ^ (e & (f ^ g));
            t1 = ((((((hh + s1) | 0) + ch) | 0) + ((k[40] + W[40]) | 0)) | 0);
            s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            mj = (a & b) ^ (c & (a ^ b));
            t2 = (s0 + mj) | 0;
            d = (d + t1) | 0; hh = (t1 + t2) | 0;
            s1 = ((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7));
            ch = f ^ (d & (e ^ f));
            t1 = ((((((g + s1) | 0) + ch) | 0) + ((k[41] + W[41]) | 0)) | 0);
            s0 = ((hh >>> 2) | (hh << 30)) ^ ((hh >>> 13) | (hh << 19)) ^ ((hh >>> 22) | (hh << 10));
            mj = (hh & a) ^ (b & (hh ^ a));
            t2 = (s0 + mj) | 0;
            c = (c + t1) | 0; g = (t1 + t2) | 0;
            s1 = ((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7));
            ch = e ^ (c & (d ^ e));
            t1 = ((((((f + s1) | 0) + ch) | 0) + ((k[42] + W[42]) | 0)) | 0);
            s0 = ((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10));
            mj = (g & hh) ^ (a & (g ^ hh));
            t2 = (s0 + mj) | 0;
            b = (b + t1) | 0; f = (t1 + t2) | 0;
            s1 = ((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7));
            ch = d ^ (b & (c ^ d));
            t1 = ((((((e + s1) | 0) + ch) | 0) + ((k[43] + W[43]) | 0)) | 0);
            s0 = ((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10));
            mj = (f & g) ^ (hh & (f ^ g));
            t2 = (s0 + mj) | 0;
            a = (a + t1) | 0; e = (t1 + t2) | 0;
            s1 = ((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7));
            ch = c ^ (a & (b ^ c));
            t1 = ((((((d + s1) | 0) + ch) | 0) + ((k[44] + W[44]) | 0)) | 0);
            s0 = ((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10));
            mj = (e & f) ^ (g & (e ^ f));
            t2 = (s0 + mj) | 0;
            hh = (hh + t1) | 0; d = (t1 + t2) | 0;
            s1 = ((hh >>> 6) | (hh << 26)) ^ ((hh >>> 11) | (hh << 21)) ^ ((hh >>> 25) | (hh << 7));
            ch = b ^ (hh & (a ^ b));
            t1 = ((((((c + s1) | 0) + ch) | 0) + ((k[45] + W[45]) | 0)) | 0);
            s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
            mj = (d & e) ^ (f & (d ^ e));
            t2 = (s0 + mj) | 0;
            g = (g + t1) | 0; c = (t1 + t2) | 0;
            s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
            ch = a ^ (g & (hh ^ a));
            t1 = ((((((b + s1) | 0) + ch) | 0) + ((k[46] + W[46]) | 0)) | 0);
            s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
            mj = (c & d) ^ (e & (c ^ d));
            t2 = (s0 + mj) | 0;
            f = (f + t1) | 0; b = (t1 + t2) | 0;
            s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
            ch = hh ^ (f & (g ^ hh));
            t1 = ((((((a + s1) | 0) + ch) | 0) + ((k[47] + W[47]) | 0)) | 0);
            s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
            mj = (b & c) ^ (d & (b ^ c));
            t2 = (s0 + mj) | 0;
            e = (e + t1) | 0; a = (t1 + t2) | 0;
            s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            ch = g ^ (e & (f ^ g));
            t1 = ((((((hh + s1) | 0) + ch) | 0) + ((k[48] + W[48]) | 0)) | 0);
            s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            mj = (a & b) ^ (c & (a ^ b));
            t2 = (s0 + mj) | 0;
            d = (d + t1) | 0; hh = (t1 + t2) | 0;
            s1 = ((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7));
            ch = f ^ (d & (e ^ f));
            t1 = ((((((g + s1) | 0) + ch) | 0) + ((k[49] + W[49]) | 0)) | 0);
            s0 = ((hh >>> 2) | (hh << 30)) ^ ((hh >>> 13) | (hh << 19)) ^ ((hh >>> 22) | (hh << 10));
            mj = (hh & a) ^ (b & (hh ^ a));
            t2 = (s0 + mj) | 0;
            c = (c + t1) | 0; g = (t1 + t2) | 0;
            s1 = ((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7));
            ch = e ^ (c & (d ^ e));
            t1 = ((((((f + s1) | 0) + ch) | 0) + ((k[50] + W[50]) | 0)) | 0);
            s0 = ((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10));
            mj = (g & hh) ^ (a & (g ^ hh));
            t2 = (s0 + mj) | 0;
            b = (b + t1) | 0; f = (t1 + t2) | 0;
            s1 = ((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7));
            ch = d ^ (b & (c ^ d));
            t1 = ((((((e + s1) | 0) + ch) | 0) + ((k[51] + W[51]) | 0)) | 0);
            s0 = ((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10));
            mj = (f & g) ^ (hh & (f ^ g));
            t2 = (s0 + mj) | 0;
            a = (a + t1) | 0; e = (t1 + t2) | 0;
            s1 = ((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7));
            ch = c ^ (a & (b ^ c));
            t1 = ((((((d + s1) | 0) + ch) | 0) + ((k[52] + W[52]) | 0)) | 0);
            s0 = ((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10));
            mj = (e & f) ^ (g & (e ^ f));
            t2 = (s0 + mj) | 0;
            hh = (hh + t1) | 0; d = (t1 + t2) | 0;
            s1 = ((hh >>> 6) | (hh << 26)) ^ ((hh >>> 11) | (hh << 21)) ^ ((hh >>> 25) | (hh << 7));
            ch = b ^ (hh & (a ^ b));
            t1 = ((((((c + s1) | 0) + ch) | 0) + ((k[53] + W[53]) | 0)) | 0);
            s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
            mj = (d & e) ^ (f & (d ^ e));
            t2 = (s0 + mj) | 0;
            g = (g + t1) | 0; c = (t1 + t2) | 0;
            s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
            ch = a ^ (g & (hh ^ a));
            t1 = ((((((b + s1) | 0) + ch) | 0) + ((k[54] + W[54]) | 0)) | 0);
            s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
            mj = (c & d) ^ (e & (c ^ d));
            t2 = (s0 + mj) | 0;
            f = (f + t1) | 0; b = (t1 + t2) | 0;
            s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
            ch = hh ^ (f & (g ^ hh));
            t1 = ((((((a + s1) | 0) + ch) | 0) + ((k[55] + W[55]) | 0)) | 0);
            s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
            mj = (b & c) ^ (d & (b ^ c));
            t2 = (s0 + mj) | 0;
            e = (e + t1) | 0; a = (t1 + t2) | 0;
            s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            ch = g ^ (e & (f ^ g));
            t1 = ((((((hh + s1) | 0) + ch) | 0) + ((k[56] + W[56]) | 0)) | 0);
            s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            mj = (a & b) ^ (c & (a ^ b));
            t2 = (s0 + mj) | 0;
            d = (d + t1) | 0; hh = (t1 + t2) | 0;
            s1 = ((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7));
            ch = f ^ (d & (e ^ f));
            t1 = ((((((g + s1) | 0) + ch) | 0) + ((k[57] + W[57]) | 0)) | 0);
            s0 = ((hh >>> 2) | (hh << 30)) ^ ((hh >>> 13) | (hh << 19)) ^ ((hh >>> 22) | (hh << 10));
            mj = (hh & a) ^ (b & (hh ^ a));
            t2 = (s0 + mj) | 0;
            c = (c + t1) | 0; g = (t1 + t2) | 0;
            s1 = ((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7));
            ch = e ^ (c & (d ^ e));
            t1 = ((((((f + s1) | 0) + ch) | 0) + ((k[58] + W[58]) | 0)) | 0);
            s0 = ((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10));
            mj = (g & hh) ^ (a & (g ^ hh));
            t2 = (s0 + mj) | 0;
            b = (b + t1) | 0; f = (t1 + t2) | 0;
            s1 = ((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7));
            ch = d ^ (b & (c ^ d));
            t1 = ((((((e + s1) | 0) + ch) | 0) + ((k[59] + W[59]) | 0)) | 0);
            s0 = ((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10));
            mj = (f & g) ^ (hh & (f ^ g));
            t2 = (s0 + mj) | 0;
            a = (a + t1) | 0; e = (t1 + t2) | 0;
            s1 = ((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7));
            ch = c ^ (a & (b ^ c));
            t1 = ((((((d + s1) | 0) + ch) | 0) + ((k[60] + W[60]) | 0)) | 0);
            s0 = ((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10));
            mj = (e & f) ^ (g & (e ^ f));
            t2 = (s0 + mj) | 0;
            hh = (hh + t1) | 0; d = (t1 + t2) | 0;
            s1 = ((hh >>> 6) | (hh << 26)) ^ ((hh >>> 11) | (hh << 21)) ^ ((hh >>> 25) | (hh << 7));
            ch = b ^ (hh & (a ^ b));
            t1 = ((((((c + s1) | 0) + ch) | 0) + ((k[61] + W[61]) | 0)) | 0);
            s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
            mj = (d & e) ^ (f & (d ^ e));
            t2 = (s0 + mj) | 0;
            g = (g + t1) | 0; c = (t1 + t2) | 0;
            s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
            ch = a ^ (g & (hh ^ a));
            t1 = ((((((b + s1) | 0) + ch) | 0) + ((k[62] + W[62]) | 0)) | 0);
            s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
            mj = (c & d) ^ (e & (c ^ d));
            t2 = (s0 + mj) | 0;
            f = (f + t1) | 0; b = (t1 + t2) | 0;
            s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
            ch = hh ^ (f & (g ^ hh));
            t1 = ((((((a + s1) | 0) + ch) | 0) + ((k[63] + W[63]) | 0)) | 0);
            s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
            mj = (b & c) ^ (d & (b ^ c));
            t2 = (s0 + mj) | 0;
            e = (e + t1) | 0; a = (t1 + t2) | 0;
            h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
            h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
        }

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
                    if (data instanceof Uint8Array && this._buffer.length === 0 && data.length >= 64) {
                        // Bytes onto an empty buffer: the whole 64-byte blocks
                        // straight from the bytes (big-endian words), only the
                        // tail through the bitArray path below.
                        const whole = data.length - (data.length & 63);
                        if (this._length + whole * 8 > 9007199254740991) {
                            console.warn('[crypto] INVALID: sha256: cannot hash more than 2^53 - 1 bits');
                            return false;
                        }
                        const words = _BW;
                        for (let off = 0; off < whole; off += 64) {
                            for (let j = 0, o = off; j < 16; j++, o += 4) {
                                words[j] = (data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3];
                            }
                            _compress(this._h, words);
                        }
                        this._length += whole * 8;
                        if (whole === data.length) return this;
                        data = data.subarray(whole);
                    }
                    if (typeof data === 'string') {
                        data = bitArray.ui8_to_ba(utf8.toBytes(data));
                    } else if (data instanceof Uint8Array) {
                        // Bytes are hashed as bytes: without this branch a
                        // Uint8Array was read as a bitArray of 32-bit words.
                        data = bitArray.ui8_to_ba(data);
                    }
                    const b = this._buffer = bitArray.concat(this._buffer, data);
                    const ol = this._length;
                    const nl = this._length = ol + bitArray.bitLength(data);
                    if (nl > 9007199254740991) {
                        console.warn('[crypto] INVALID: sha256: cannot hash more than 2^53 - 1 bits');
                        return false;
                    }
                    const c = new Int32Array(b);
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
                    _compress(this._h, w);
                }
            };

            return sha;
        }

        // Default = SHA-256 (FIPS 180-4 §6.2, full 256-bit digest = 8 words).
        const _sha256 = _makeSha(_INIT, 8);

        return /** @type {Sha256API} */ (/** @type {any} */ (Object.defineProperty({
            // Public API (unchanged).
            fn: _sha256.fn,
            hash: _sha256.hash
        }, Symbol.for('@awacloud/fw/internal'), {
            // Internal escape hatch - used by sha224.js (FIPS 180-4 §5.3.2)
            // to share the SHA-256 compression function with a custom IV
            // and a 7-word truncated output.
            value: { makeSha: _makeSha, compress: _compress }
        })));
    }
};
