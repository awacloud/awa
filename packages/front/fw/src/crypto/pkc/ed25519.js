// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Ed25519 - EdDSA signature scheme over the twisted Edwards
 * curve −x² + y² = 1 − (121665/121666)·x²·y² over GF(2^255 − 19) (RFC 8032).
 *
 * Implementation derived from the TweetNaCl reference (Bernstein et al.,
 * public domain). See docs/dev/provenance.md. Field elements are 16-limb
 * Float64Arrays of 16-bit limbs;
 * the curve point format is the projective extended (X, Y, Z, T) tuple
 * where x = X/Z, y = Y/Z, T = XY/Z.
 *
 * Public API operates on `Uint8Array` per RFC 8032:
 *   - keyPair(seed?): { publicKey, privateKey }   (privateKey = seed || pubKey)
 *   - sign(privateKey, message): 64-byte signature
 *   - verify(publicKey, message, signature): boolean
 *
 * SHA-512 is required for the internal H function - the caller must
 * inject it (factory dependency `sha512`).
 *
 */

import { sha512 } from '../hash/sha512.js';
import { bitArray } from '../utils/bitArray.js';

/**
 * Ed25519 key pair (RFC 8032). `privateKey` is the 64-byte `seed || publicKey`.
 * @typedef {object} Ed25519KeyPair
 * @property {Uint8Array} publicKey 32-byte public key.
 * @property {Uint8Array} privateKey 64-byte private key (seed || pub).
 */

/**
 * Public API returned by `ed25519.factory()`.
 * @typedef {object} Ed25519API
 * @property {(seed: Uint8Array) => (Ed25519KeyPair|false)} keyPair Generate a key pair from a 32-byte seed.
 * @property {(privateKey: Uint8Array, message: Uint8Array) => (Uint8Array|false)} sign Pure Ed25519 sign (64-byte signature).
 * @property {(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array) => boolean} verify Pure Ed25519 verify (the fw order: key, signature, message).
 * @property {(privateKey: Uint8Array, message: Uint8Array, context?: Uint8Array) => (Uint8Array|false)} signPh Ed25519ph (preHash) sign.
 * @property {(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array, context?: Uint8Array) => boolean} verifyPh Ed25519ph verify.
 * @property {(privateKey: Uint8Array, message: Uint8Array, context: Uint8Array) => (Uint8Array|false)} signCtx Ed25519ctx sign.
 * @property {(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array, context: Uint8Array) => boolean} verifyCtx Ed25519ctx verify.
 */

export const ed25519 = {
    name: 'ed25519',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: ['sha512', 'bitArray'],
    deps: [sha512, bitArray],

    /** @returns {Ed25519API} */
    factory(sha512, bitArray) {

        // ── Field GF(2^255-19), 16x16-bit limbs ─────────────────────────

        function _gf(init) {
            const r = new Float64Array(16);
            if (init) for (let i = 0; i < init.length; i++) r[i] = init[i];
            return r;
        }

        const _gf0 = _gf();
        const _gf1 = _gf([1]);
        const _D = _gf([0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070,
                        0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203]);
        const _D2 = _gf([0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0,
                         0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406]);
        const _X = _gf([0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c,
                        0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169]);
        const _Y = _gf([0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666,
                        0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666]);
        const _I = _gf([0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43,
                        0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83]);

        function _car25519(o) {
            for (let i = 0; i < 16; i++) {
                o[i] += 65536;
                const c = Math.floor(o[i] / 65536);
                o[(i + 1) * (i < 15 ? 1 : 0)] += c - 1 + 37 * (c - 1) * (i === 15 ? 1 : 0);
                o[i] -= c * 65536;
            }
        }

        function _sel25519(p, q, b) {
            const c = ~(b - 1);
            for (let i = 0; i < 16; i++) {
                const t = c & (p[i] ^ q[i]);
                p[i] ^= t; q[i] ^= t;
            }
        }

        function _pack25519(o, n) {
            const m = _gf(), t = _gf();
            for (let i = 0; i < 16; i++) t[i] = n[i];
            _car25519(t); _car25519(t); _car25519(t);
            for (let j = 0; j < 2; j++) {
                m[0] = t[0] - 0xffed;
                for (let i = 1; i < 15; i++) {
                    m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
                    m[i - 1] &= 0xffff;
                }
                m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
                const b = (m[15] >> 16) & 1;
                m[14] &= 0xffff;
                _sel25519(t, m, 1 - b);
            }
            for (let i = 0; i < 16; i++) {
                o[2 * i] = t[i] & 0xff;
                o[2 * i + 1] = t[i] >> 8;
            }
        }

        function _neq25519(a, b) {
            const c = new Uint8Array(32), d = new Uint8Array(32);
            _pack25519(c, a); _pack25519(d, b);
            let r = 0;
            for (let i = 0; i < 32; i++) r |= c[i] ^ d[i];
            return (1 & ((r - 1) >>> 8)) - 1;
        }

        function _par25519(a) { const d = new Uint8Array(32); _pack25519(d, a); return d[0] & 1; }

        function _unpack25519(o, n) {
            for (let i = 0; i < 16; i++) o[i] = n[2 * i] + (n[2 * i + 1] << 8);
            o[15] &= 0x7fff;
        }

        function _A(o, a, b) { for (let i = 0; i < 16; i++) o[i] = a[i] + b[i]; }
        function _Z(o, a, b) { for (let i = 0; i < 16; i++) o[i] = a[i] - b[i]; }
        /**
         * Field multiply, unrolled into locals (no allocation): o = a * b.
         * `o` may alias `a` or `b`. Exact in doubles for inputs below 2^18.
         * @param {Float64Array} o
         * @param {Float64Array} a
         * @param {Float64Array} b
         */
        function _M(o, a, b) {
            const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11], a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15];
            const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11], b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
            let t0 = a0 * b0;
            let t1 = a0 * b1 + a1 * b0;
            let t2 = a0 * b2 + a1 * b1 + a2 * b0;
            let t3 = a0 * b3 + a1 * b2 + a2 * b1 + a3 * b0;
            let t4 = a0 * b4 + a1 * b3 + a2 * b2 + a3 * b1 + a4 * b0;
            let t5 = a0 * b5 + a1 * b4 + a2 * b3 + a3 * b2 + a4 * b1 + a5 * b0;
            let t6 = a0 * b6 + a1 * b5 + a2 * b4 + a3 * b3 + a4 * b2 + a5 * b1 + a6 * b0;
            let t7 = a0 * b7 + a1 * b6 + a2 * b5 + a3 * b4 + a4 * b3 + a5 * b2 + a6 * b1 + a7 * b0;
            let t8 = a0 * b8 + a1 * b7 + a2 * b6 + a3 * b5 + a4 * b4 + a5 * b3 + a6 * b2 + a7 * b1 + a8 * b0;
            let t9 = a0 * b9 + a1 * b8 + a2 * b7 + a3 * b6 + a4 * b5 + a5 * b4 + a6 * b3 + a7 * b2 + a8 * b1 + a9 * b0;
            let t10 = a0 * b10 + a1 * b9 + a2 * b8 + a3 * b7 + a4 * b6 + a5 * b5 + a6 * b4 + a7 * b3 + a8 * b2 + a9 * b1 + a10 * b0;
            let t11 = a0 * b11 + a1 * b10 + a2 * b9 + a3 * b8 + a4 * b7 + a5 * b6 + a6 * b5 + a7 * b4 + a8 * b3 + a9 * b2 + a10 * b1 + a11 * b0;
            let t12 = a0 * b12 + a1 * b11 + a2 * b10 + a3 * b9 + a4 * b8 + a5 * b7 + a6 * b6 + a7 * b5 + a8 * b4 + a9 * b3 + a10 * b2 + a11 * b1 + a12 * b0;
            let t13 = a0 * b13 + a1 * b12 + a2 * b11 + a3 * b10 + a4 * b9 + a5 * b8 + a6 * b7 + a7 * b6 + a8 * b5 + a9 * b4 + a10 * b3 + a11 * b2 + a12 * b1 + a13 * b0;
            let t14 = a0 * b14 + a1 * b13 + a2 * b12 + a3 * b11 + a4 * b10 + a5 * b9 + a6 * b8 + a7 * b7 + a8 * b6 + a9 * b5 + a10 * b4 + a11 * b3 + a12 * b2 + a13 * b1 + a14 * b0;
            let t15 = a0 * b15 + a1 * b14 + a2 * b13 + a3 * b12 + a4 * b11 + a5 * b10 + a6 * b9 + a7 * b8 + a8 * b7 + a9 * b6 + a10 * b5 + a11 * b4 + a12 * b3 + a13 * b2 + a14 * b1 + a15 * b0;
            let t16 = a1 * b15 + a2 * b14 + a3 * b13 + a4 * b12 + a5 * b11 + a6 * b10 + a7 * b9 + a8 * b8 + a9 * b7 + a10 * b6 + a11 * b5 + a12 * b4 + a13 * b3 + a14 * b2 + a15 * b1;
            let t17 = a2 * b15 + a3 * b14 + a4 * b13 + a5 * b12 + a6 * b11 + a7 * b10 + a8 * b9 + a9 * b8 + a10 * b7 + a11 * b6 + a12 * b5 + a13 * b4 + a14 * b3 + a15 * b2;
            let t18 = a3 * b15 + a4 * b14 + a5 * b13 + a6 * b12 + a7 * b11 + a8 * b10 + a9 * b9 + a10 * b8 + a11 * b7 + a12 * b6 + a13 * b5 + a14 * b4 + a15 * b3;
            let t19 = a4 * b15 + a5 * b14 + a6 * b13 + a7 * b12 + a8 * b11 + a9 * b10 + a10 * b9 + a11 * b8 + a12 * b7 + a13 * b6 + a14 * b5 + a15 * b4;
            let t20 = a5 * b15 + a6 * b14 + a7 * b13 + a8 * b12 + a9 * b11 + a10 * b10 + a11 * b9 + a12 * b8 + a13 * b7 + a14 * b6 + a15 * b5;
            let t21 = a6 * b15 + a7 * b14 + a8 * b13 + a9 * b12 + a10 * b11 + a11 * b10 + a12 * b9 + a13 * b8 + a14 * b7 + a15 * b6;
            let t22 = a7 * b15 + a8 * b14 + a9 * b13 + a10 * b12 + a11 * b11 + a12 * b10 + a13 * b9 + a14 * b8 + a15 * b7;
            let t23 = a8 * b15 + a9 * b14 + a10 * b13 + a11 * b12 + a12 * b11 + a13 * b10 + a14 * b9 + a15 * b8;
            let t24 = a9 * b15 + a10 * b14 + a11 * b13 + a12 * b12 + a13 * b11 + a14 * b10 + a15 * b9;
            let t25 = a10 * b15 + a11 * b14 + a12 * b13 + a13 * b12 + a14 * b11 + a15 * b10;
            let t26 = a11 * b15 + a12 * b14 + a13 * b13 + a14 * b12 + a15 * b11;
            let t27 = a12 * b15 + a13 * b14 + a14 * b13 + a15 * b12;
            let t28 = a13 * b15 + a14 * b14 + a15 * b13;
            let t29 = a14 * b15 + a15 * b14;
            let t30 = a15 * b15;
            t0 += 38 * t16;
            t1 += 38 * t17;
            t2 += 38 * t18;
            t3 += 38 * t19;
            t4 += 38 * t20;
            t5 += 38 * t21;
            t6 += 38 * t22;
            t7 += 38 * t23;
            t8 += 38 * t24;
            t9 += 38 * t25;
            t10 += 38 * t26;
            t11 += 38 * t27;
            t12 += 38 * t28;
            t13 += 38 * t29;
            t14 += 38 * t30;
            let c = 0, v;
            v = t0 + c; c = Math.floor(v / 65536); t0 = v - c * 65536;
            v = t1 + c; c = Math.floor(v / 65536); t1 = v - c * 65536;
            v = t2 + c; c = Math.floor(v / 65536); t2 = v - c * 65536;
            v = t3 + c; c = Math.floor(v / 65536); t3 = v - c * 65536;
            v = t4 + c; c = Math.floor(v / 65536); t4 = v - c * 65536;
            v = t5 + c; c = Math.floor(v / 65536); t5 = v - c * 65536;
            v = t6 + c; c = Math.floor(v / 65536); t6 = v - c * 65536;
            v = t7 + c; c = Math.floor(v / 65536); t7 = v - c * 65536;
            v = t8 + c; c = Math.floor(v / 65536); t8 = v - c * 65536;
            v = t9 + c; c = Math.floor(v / 65536); t9 = v - c * 65536;
            v = t10 + c; c = Math.floor(v / 65536); t10 = v - c * 65536;
            v = t11 + c; c = Math.floor(v / 65536); t11 = v - c * 65536;
            v = t12 + c; c = Math.floor(v / 65536); t12 = v - c * 65536;
            v = t13 + c; c = Math.floor(v / 65536); t13 = v - c * 65536;
            v = t14 + c; c = Math.floor(v / 65536); t14 = v - c * 65536;
            v = t15 + c; c = Math.floor(v / 65536); t15 = v - c * 65536;
            t0 += 38 * c; c = 0;
            v = t0 + c; c = Math.floor(v / 65536); t0 = v - c * 65536;
            v = t1 + c; c = Math.floor(v / 65536); t1 = v - c * 65536;
            v = t2 + c; c = Math.floor(v / 65536); t2 = v - c * 65536;
            v = t3 + c; c = Math.floor(v / 65536); t3 = v - c * 65536;
            v = t4 + c; c = Math.floor(v / 65536); t4 = v - c * 65536;
            v = t5 + c; c = Math.floor(v / 65536); t5 = v - c * 65536;
            v = t6 + c; c = Math.floor(v / 65536); t6 = v - c * 65536;
            v = t7 + c; c = Math.floor(v / 65536); t7 = v - c * 65536;
            v = t8 + c; c = Math.floor(v / 65536); t8 = v - c * 65536;
            v = t9 + c; c = Math.floor(v / 65536); t9 = v - c * 65536;
            v = t10 + c; c = Math.floor(v / 65536); t10 = v - c * 65536;
            v = t11 + c; c = Math.floor(v / 65536); t11 = v - c * 65536;
            v = t12 + c; c = Math.floor(v / 65536); t12 = v - c * 65536;
            v = t13 + c; c = Math.floor(v / 65536); t13 = v - c * 65536;
            v = t14 + c; c = Math.floor(v / 65536); t14 = v - c * 65536;
            v = t15 + c; c = Math.floor(v / 65536); t15 = v - c * 65536;
            t0 += 38 * c;
            o[0] = t0;
            o[1] = t1;
            o[2] = t2;
            o[3] = t3;
            o[4] = t4;
            o[5] = t5;
            o[6] = t6;
            o[7] = t7;
            o[8] = t8;
            o[9] = t9;
            o[10] = t10;
            o[11] = t11;
            o[12] = t12;
            o[13] = t13;
            o[14] = t14;
            o[15] = t15;
        }

        /**
         * Field square by the symmetry of the products (136 instead of 256):
         * o = a * a; `o` may alias `a`.
         * @param {Float64Array} o
         * @param {Float64Array} a
         */
        function _S(o, a) {
            const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11], a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15];
            const d0 = 2 * a0, d1 = 2 * a1, d2 = 2 * a2, d3 = 2 * a3, d4 = 2 * a4, d5 = 2 * a5, d6 = 2 * a6, d7 = 2 * a7, d8 = 2 * a8, d9 = 2 * a9, d10 = 2 * a10, d11 = 2 * a11, d12 = 2 * a12, d13 = 2 * a13, d14 = 2 * a14;
            let t0 = a0 * a0;
            let t1 = d0 * a1;
            let t2 = d0 * a2 + a1 * a1;
            let t3 = d0 * a3 + d1 * a2;
            let t4 = d0 * a4 + d1 * a3 + a2 * a2;
            let t5 = d0 * a5 + d1 * a4 + d2 * a3;
            let t6 = d0 * a6 + d1 * a5 + d2 * a4 + a3 * a3;
            let t7 = d0 * a7 + d1 * a6 + d2 * a5 + d3 * a4;
            let t8 = d0 * a8 + d1 * a7 + d2 * a6 + d3 * a5 + a4 * a4;
            let t9 = d0 * a9 + d1 * a8 + d2 * a7 + d3 * a6 + d4 * a5;
            let t10 = d0 * a10 + d1 * a9 + d2 * a8 + d3 * a7 + d4 * a6 + a5 * a5;
            let t11 = d0 * a11 + d1 * a10 + d2 * a9 + d3 * a8 + d4 * a7 + d5 * a6;
            let t12 = d0 * a12 + d1 * a11 + d2 * a10 + d3 * a9 + d4 * a8 + d5 * a7 + a6 * a6;
            let t13 = d0 * a13 + d1 * a12 + d2 * a11 + d3 * a10 + d4 * a9 + d5 * a8 + d6 * a7;
            let t14 = d0 * a14 + d1 * a13 + d2 * a12 + d3 * a11 + d4 * a10 + d5 * a9 + d6 * a8 + a7 * a7;
            let t15 = d0 * a15 + d1 * a14 + d2 * a13 + d3 * a12 + d4 * a11 + d5 * a10 + d6 * a9 + d7 * a8;
            let t16 = d1 * a15 + d2 * a14 + d3 * a13 + d4 * a12 + d5 * a11 + d6 * a10 + d7 * a9 + a8 * a8;
            let t17 = d2 * a15 + d3 * a14 + d4 * a13 + d5 * a12 + d6 * a11 + d7 * a10 + d8 * a9;
            let t18 = d3 * a15 + d4 * a14 + d5 * a13 + d6 * a12 + d7 * a11 + d8 * a10 + a9 * a9;
            let t19 = d4 * a15 + d5 * a14 + d6 * a13 + d7 * a12 + d8 * a11 + d9 * a10;
            let t20 = d5 * a15 + d6 * a14 + d7 * a13 + d8 * a12 + d9 * a11 + a10 * a10;
            let t21 = d6 * a15 + d7 * a14 + d8 * a13 + d9 * a12 + d10 * a11;
            let t22 = d7 * a15 + d8 * a14 + d9 * a13 + d10 * a12 + a11 * a11;
            let t23 = d8 * a15 + d9 * a14 + d10 * a13 + d11 * a12;
            let t24 = d9 * a15 + d10 * a14 + d11 * a13 + a12 * a12;
            let t25 = d10 * a15 + d11 * a14 + d12 * a13;
            let t26 = d11 * a15 + d12 * a14 + a13 * a13;
            let t27 = d12 * a15 + d13 * a14;
            let t28 = d13 * a15 + a14 * a14;
            let t29 = d14 * a15;
            let t30 = a15 * a15;
            t0 += 38 * t16;
            t1 += 38 * t17;
            t2 += 38 * t18;
            t3 += 38 * t19;
            t4 += 38 * t20;
            t5 += 38 * t21;
            t6 += 38 * t22;
            t7 += 38 * t23;
            t8 += 38 * t24;
            t9 += 38 * t25;
            t10 += 38 * t26;
            t11 += 38 * t27;
            t12 += 38 * t28;
            t13 += 38 * t29;
            t14 += 38 * t30;
            let c = 0, v;
            v = t0 + c; c = Math.floor(v / 65536); t0 = v - c * 65536;
            v = t1 + c; c = Math.floor(v / 65536); t1 = v - c * 65536;
            v = t2 + c; c = Math.floor(v / 65536); t2 = v - c * 65536;
            v = t3 + c; c = Math.floor(v / 65536); t3 = v - c * 65536;
            v = t4 + c; c = Math.floor(v / 65536); t4 = v - c * 65536;
            v = t5 + c; c = Math.floor(v / 65536); t5 = v - c * 65536;
            v = t6 + c; c = Math.floor(v / 65536); t6 = v - c * 65536;
            v = t7 + c; c = Math.floor(v / 65536); t7 = v - c * 65536;
            v = t8 + c; c = Math.floor(v / 65536); t8 = v - c * 65536;
            v = t9 + c; c = Math.floor(v / 65536); t9 = v - c * 65536;
            v = t10 + c; c = Math.floor(v / 65536); t10 = v - c * 65536;
            v = t11 + c; c = Math.floor(v / 65536); t11 = v - c * 65536;
            v = t12 + c; c = Math.floor(v / 65536); t12 = v - c * 65536;
            v = t13 + c; c = Math.floor(v / 65536); t13 = v - c * 65536;
            v = t14 + c; c = Math.floor(v / 65536); t14 = v - c * 65536;
            v = t15 + c; c = Math.floor(v / 65536); t15 = v - c * 65536;
            t0 += 38 * c; c = 0;
            v = t0 + c; c = Math.floor(v / 65536); t0 = v - c * 65536;
            v = t1 + c; c = Math.floor(v / 65536); t1 = v - c * 65536;
            v = t2 + c; c = Math.floor(v / 65536); t2 = v - c * 65536;
            v = t3 + c; c = Math.floor(v / 65536); t3 = v - c * 65536;
            v = t4 + c; c = Math.floor(v / 65536); t4 = v - c * 65536;
            v = t5 + c; c = Math.floor(v / 65536); t5 = v - c * 65536;
            v = t6 + c; c = Math.floor(v / 65536); t6 = v - c * 65536;
            v = t7 + c; c = Math.floor(v / 65536); t7 = v - c * 65536;
            v = t8 + c; c = Math.floor(v / 65536); t8 = v - c * 65536;
            v = t9 + c; c = Math.floor(v / 65536); t9 = v - c * 65536;
            v = t10 + c; c = Math.floor(v / 65536); t10 = v - c * 65536;
            v = t11 + c; c = Math.floor(v / 65536); t11 = v - c * 65536;
            v = t12 + c; c = Math.floor(v / 65536); t12 = v - c * 65536;
            v = t13 + c; c = Math.floor(v / 65536); t13 = v - c * 65536;
            v = t14 + c; c = Math.floor(v / 65536); t14 = v - c * 65536;
            v = t15 + c; c = Math.floor(v / 65536); t15 = v - c * 65536;
            t0 += 38 * c;
            o[0] = t0;
            o[1] = t1;
            o[2] = t2;
            o[3] = t3;
            o[4] = t4;
            o[5] = t5;
            o[6] = t6;
            o[7] = t7;
            o[8] = t8;
            o[9] = t9;
            o[10] = t10;
            o[11] = t11;
            o[12] = t12;
            o[13] = t13;
            o[14] = t14;
            o[15] = t15;
        }

        /**
         * o = z^(2^250 - 1) and, on the way, z11 = z^11 — the common prefix of
         * the inversion and square-root exponents. 249 squarings and 10
         * multiplies (the loop form multiplied at almost every bit).
         * @param {Float64Array} z
         * @param {Float64Array} o z^(2^250 - 1)
         * @param {Float64Array} z11 z^11
         */
        function _pow22501(z, o, z11) {
            const t0 = _gf(), t1 = _gf(), t2 = _gf();
            _S(t0, z);                                   // z^2
            _S(t1, t0); _S(t1, t1);                      // z^8
            _M(t1, t1, z);                               // z^9
            _M(z11, t1, t0);                             // z^11
            _S(t0, z11);                                 // z^22
            _M(t0, t0, t1);                              // z^(2^5 - 1)
            _S(t1, t0); for (let i = 1; i < 5; i++) _S(t1, t1);
            _M(t0, t1, t0);                              // z^(2^10 - 1)
            _S(t1, t0); for (let i = 1; i < 10; i++) _S(t1, t1);
            _M(t1, t1, t0);                              // z^(2^20 - 1)
            _S(t2, t1); for (let i = 1; i < 20; i++) _S(t2, t2);
            _M(t1, t2, t1);                              // z^(2^40 - 1)
            for (let i = 0; i < 10; i++) _S(t1, t1);
            _M(t0, t1, t0);                              // z^(2^50 - 1)
            _S(t1, t0); for (let i = 1; i < 50; i++) _S(t1, t1);
            _M(t1, t1, t0);                              // z^(2^100 - 1)
            _S(t2, t1); for (let i = 1; i < 100; i++) _S(t2, t2);
            _M(t1, t2, t1);                              // z^(2^200 - 1)
            for (let i = 0; i < 50; i++) _S(t1, t1);
            _M(o, t1, t0);                               // z^(2^250 - 1)
        }

        /** o = i^(p - 2) = i^(2^255 - 21), the inverse (0 for 0). */
        function _inv25519(o, i) {
            const t = _gf(), z11 = _gf();
            _pow22501(i, t, z11);
            for (let k = 0; k < 5; k++) _S(t, t);       // z^(2^255 - 32)
            _M(o, t, z11);                               // z^(2^255 - 21)
        }

        /** o = i^((p - 5) / 8) = i^(2^252 - 3), for the square root in `_unpackneg`; o may be i. */
        function _pow2523(o, i) {
            const t = _gf(), z11 = _gf();
            _pow22501(i, t, z11);
            _S(t, t); _S(t, t);                          // z^(2^252 - 4)
            _M(o, t, i);                                 // z^(2^252 - 3)
        }

        // ── Group operations on extended Edwards points (P, Q): [4]gf ───

        function _set25519(r, a) { for (let i = 0; i < 16; i++) r[i] = a[i]; }

        // Scratch field elements of the group operations (no allocation per
        // call; nothing here re-enters).
        const _ga = _gf(), _gb = _gf(), _gc = _gf(), _gd = _gf(), _ge = _gf(),
              _gff = _gf(), _gg = _gf(), _gh = _gf(), _gt = _gf();

        /** p = p + q (RFC 8032 §5.1.4 addition; complete; q may be p). */
        function _add(p, q) {
            const a = _ga, b = _gb, c = _gc, d = _gd, e = _ge, f = _gff, g = _gg, h = _gh, t = _gt;
            _Z(a, p[1], p[0]); _Z(t, q[1], q[0]); _M(a, a, t);
            _A(b, p[0], p[1]); _A(t, q[0], q[1]); _M(b, b, t);
            _M(c, p[3], q[3]); _M(c, c, _D2);
            _M(d, p[2], q[2]); _A(d, d, d);
            _Z(e, b, a);
            _Z(f, d, c);
            _A(g, d, c);
            _A(h, b, a);
            _M(p[0], e, f);
            _M(p[1], h, g);
            _M(p[2], g, f);
            _M(p[3], e, h);
        }

        /** p = 2p (RFC 8032 §5.1.4 doubling: 4 multiplies, 4 squares). */
        function _dbl(p) {
            const a = _ga, b = _gb, c = _gc, e = _ge, f = _gff, g = _gg, h = _gh, t = _gt;
            _S(a, p[0]);                 // A = X^2
            _S(b, p[1]);                 // B = Y^2
            _S(c, p[2]); _A(c, c, c);    // C = 2 Z^2
            _A(h, a, b);                 // H = A + B
            _A(t, p[0], p[1]); _S(t, t);
            _Z(e, h, t);                 // E = H - (X + Y)^2
            _Z(g, a, b);                 // G = A - B
            _A(f, c, g);                 // F = C + G
            _M(p[0], e, f);
            _M(p[1], g, h);
            _M(p[2], f, g);
            _M(p[3], e, h);
        }

        /**
         * p = p + n, n an affine point in the form (y + x, y - x, 2d·x·y)
         * (the base table's entries): the addition with Z2 = 1, 7 multiplies.
         */
        function _addNiels(p, n) {
            const a = _ga, b = _gb, c = _gc, d = _gd, e = _ge, f = _gff, g = _gg, h = _gh;
            _Z(a, p[1], p[0]); _M(a, a, n[1]);
            _A(b, p[0], p[1]); _M(b, b, n[0]);
            _M(c, p[3], n[2]);
            _A(d, p[2], p[2]);
            _Z(e, b, a);
            _Z(f, d, c);
            _A(g, d, c);
            _A(h, b, a);
            _M(p[0], e, f);
            _M(p[1], h, g);
            _M(p[2], g, f);
            _M(p[3], e, h);
        }

        function _pack(r, p) {
            const tx = _gf(), ty = _gf(), zi = _gf();
            _inv25519(zi, p[2]);
            _M(tx, p[0], zi);
            _M(ty, p[1], zi);
            _pack25519(r, ty);
            r[31] ^= _par25519(tx) << 7;
        }

        /** A field element brought to its canonical 16-bit limbs (0..65535). */
        function _canon(o, a) {
            const bytes = new Uint8Array(32);
            _pack25519(bytes, a);
            for (let i = 0; i < 16; i++) o[i] = bytes[2 * i] + (bytes[2 * i + 1] << 8);
        }

        /**
         * The base table: entry [i][j - 1] = j · 256^i · B (i < 32, j = 1..8) as
         * (y + x, y - x, 2d·x·y), canonical limbs. Built once per factory on
         * first use: 224 additions, 248 doublings and one inversion shared by
         * all 256 points (prefix products).
         * @type {Float64Array[][][]|null}
         */
        let _baseTable = null;

        function _buildBaseTable() {
            const points = [];
            const P = [_gf(), _gf(), _gf(), _gf()];
            _set25519(P[0], _X); _set25519(P[1], _Y); _set25519(P[2], _gf1); _M(P[3], _X, _Y);
            for (let i = 0; i < 32; i++) {
                const Q = P.map((c) => Float64Array.from(c));
                for (let j = 1; j <= 8; j++) {
                    points.push(Q.map((c) => Float64Array.from(c)));
                    if (j < 8) _add(Q, P);
                }
                if (i < 31) for (let k = 0; k < 8; k++) _dbl(P);
            }
            // One inversion for every Z: prefix products, then back.
            const n = points.length;
            const prefix = new Array(n);
            prefix[0] = Float64Array.from(points[0][2]);
            for (let k = 1; k < n; k++) { prefix[k] = _gf(); _M(prefix[k], prefix[k - 1], points[k][2]); }
            const inv = _gf();
            _inv25519(inv, prefix[n - 1]);
            const table = [];
            for (let i = 0; i < 32; i++) table.push(new Array(8));
            const zi = _gf(), x = _gf(), y = _gf(), t = _gf();
            for (let k = n - 1; k >= 0; k--) {
                if (k > 0) { _M(zi, inv, prefix[k - 1]); _M(inv, inv, points[k][2]); } else _set25519(zi, inv);
                _M(x, points[k][0], zi);
                _M(y, points[k][1], zi);
                const yPx = _gf(), yMx = _gf(), xy2d = _gf();
                _A(t, y, x); _canon(yPx, t);
                _Z(t, y, x); _canon(yMx, t);
                _M(t, x, y); _M(t, t, _D2); _canon(xy2d, t);
                table[k >> 3][k & 7] = [yPx, yMx, xy2d];
            }
            return table;
        }

        /** a = bit ? b : a, by mask (bit is 0 or 1; limbs are 32-bit integers). */
        function _cmov(a, b, bit) {
            const m = -bit;
            for (let i = 0; i < 16; i++) a[i] ^= m & (a[i] ^ b[i]);
        }

        const _sel = [_gf(), _gf(), _gf()], _negXy2d = _gf();

        /**
         * _sel = digit · 256^i · B in (y + x, y - x, 2d·x·y) form, digit in
         * [-8, 8], in constant time: all eight entries are read and merged by
         * mask, then the result is negated by mask (swap the first two, negate
         * the third). The digit selects no branch and no index.
         */
        function _selectBase(i, digit) {
            const row = _baseTable[i];
            const negMask = digit >> 31;                 // -1 for a negative digit, else 0
            const abs = (digit ^ negMask) - negMask;
            const s0 = _sel[0], s1 = _sel[1], s2 = _sel[2];
            for (let k = 0; k < 16; k++) { s0[k] = 0; s1[k] = 0; s2[k] = 0; }
            s0[0] = 1; s1[0] = 1;                        // the identity: (1, 1, 0)
            for (let j = 1; j <= 8; j++) {
                const eq = ((abs ^ j) - 1) >>> 31;       // 1 iff abs === j
                const e = row[j - 1];
                _cmov(s0, e[0], eq); _cmov(s1, e[1], eq); _cmov(s2, e[2], eq);
            }
            const neg = negMask & 1;
            _sel25519(s0, s1, neg);
            _Z(_negXy2d, _gf0, s2);
            _cmov(s2, _negXy2d, neg);
            return _sel;
        }

        const _digits = new Int32Array(64);

        /**
         * p = s · B (s: 32 little-endian bytes below 2^255) in constant time:
         * s as 64 signed radix-16 digits in [-8, 8]; the odd digits through the
         * table, four doublings, then the even digits (h = Σ e_i 16^i B with
         * entry [i >> 1] holding 256^(i >> 1) B = 16^(i - 1) B for odd i).
         */
        function _scalarbase(p, s) {
            if (_baseTable === null) _baseTable = _buildBaseTable();
            const e = _digits;
            for (let i = 0; i < 32; i++) { e[2 * i] = s[i] & 15; e[2 * i + 1] = (s[i] >> 4) & 15; }
            let carry = 0;
            for (let i = 0; i < 63; i++) {
                e[i] += carry;
                carry = (e[i] + 8) >> 4;
                e[i] -= carry << 4;
            }
            e[63] += carry;
            _set25519(p[0], _gf0); _set25519(p[1], _gf1); _set25519(p[2], _gf1); _set25519(p[3], _gf0);
            for (let i = 1; i < 64; i += 2) _addNiels(p, _selectBase(i >> 1, e[i]));
            _dbl(p); _dbl(p); _dbl(p); _dbl(p);
            for (let i = 0; i < 64; i += 2) _addNiels(p, _selectBase(i >> 1, e[i]));
            for (let i = 0; i < 64; i++) e[i] = 0;
        }

        /**
         * p = s · q for PUBLIC s and q only (`verify`): a 4-bit fixed window,
         * 4 doublings and one addition per nibble. Variable time: the nibbles
         * index the window table.
         */
        function _scalarmultPublic(p, q, s) {
            const win = [[_gf(), _gf1.slice(), _gf1.slice(), _gf()]];
            for (let j = 1; j < 16; j++) {
                const w = win[j - 1].map((c) => Float64Array.from(c));
                _add(w, q);
                win.push(w);
            }
            _set25519(p[0], _gf0); _set25519(p[1], _gf1); _set25519(p[2], _gf1); _set25519(p[3], _gf0);
            for (let i = 63; i >= 0; i--) {
                if (i < 63) { _dbl(p); _dbl(p); _dbl(p); _dbl(p); }
                _add(p, win[(s[i >> 1] >> ((i & 1) << 2)) & 15]);
            }
        }

        // ── L = 2^252 + 27742317777372353535851937790883648493 ──────────

        const _L = new Float64Array([
            0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58,
            0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14,
            0,    0,    0,    0,    0,    0,    0,    0,
            0,    0,    0,    0,    0,    0,    0,    0x10
        ]);

        function _modL(r, x) {
            let carry, i, j;
            for (i = 63; i >= 32; --i) {
                carry = 0;
                for (j = i - 32; j < i - 12; j++) {
                    x[j] += carry - 16 * x[i] * _L[j - (i - 32)];
                    carry = Math.floor((x[j] + 128) / 256);
                    x[j] -= carry * 256;
                }
                x[j] += carry;
                x[i] = 0;
            }
            carry = 0;
            for (j = 0; j < 32; j++) {
                x[j] += carry - (x[31] >> 4) * _L[j];
                carry = x[j] >> 8;
                x[j] &= 255;
            }
            for (j = 0; j < 32; j++) x[j] -= carry * _L[j];
            for (i = 0; i < 32; i++) {
                x[i + 1] += x[i] >> 8;
                r[i] = x[i] & 255;
            }
        }

        function _reduce(r) {
            const x = new Float64Array(64);
            for (let i = 0; i < 64; i++) x[i] = r[i];
            for (let i = 0; i < 64; i++) r[i] = 0;
            _modL(r, x);
        }

        // ── SHA-512 wrapper returning 64 raw bytes ──────────────────────

        function _h(...parts) {
            // Concatenate parts (Uint8Arrays) and SHA-512.
            let total = 0;
            for (const p of parts) total += p.length;
            const buf = new Uint8Array(total);
            let off = 0;
            for (const p of parts) { buf.set(p, off); off += p.length; }
            const ba = bitArray.ui8_to_ba(buf);
            return bitArray.ba_to_ui8(sha512.hash(ba));
        }

        // ── RFC 8032 §5.1 dom2 prefix (Ed25519ph + Ed25519ctx) ─────────
        // FIPS 186-5 §7.6.
        //
        // dom2(F, C) = "SigEd25519 no Ed25519 collisions" (32 ASCII bytes)
        //              || octet(F)          // 1=ph, 0=ctx
        //              || octet(OLEN(C))    // context length 0..255
        //              || C                 // context bytes
        //
        // For pure Ed25519 (default, RFC 8032 §5.1.6 step 2 "absent"),
        // dom2 is NOT prepended - preserved by passing `null` as dom.

        const _DOM2_PREFIX = new Uint8Array([
            // ASCII "SigEd25519 no Ed25519 collisions" (32 bytes)
            0x53, 0x69, 0x67, 0x45, 0x64, 0x32, 0x35, 0x35, 0x31, 0x39, 0x20,
            0x6e, 0x6f, 0x20, 0x45, 0x64, 0x32, 0x35, 0x35, 0x31, 0x39, 0x20,
            0x63, 0x6f, 0x6c, 0x6c, 0x69, 0x73, 0x69, 0x6f, 0x6e, 0x73
        ]);

        function _dom2(F, ctx) {
            const ctxLen = ctx ? ctx.length : 0;
            if (ctxLen > 255) {
                console.warn('[crypto] INVALID: ed25519: context must be ≤ 255 bytes');
                return false;
            }
            const out = new Uint8Array(32 + 2 + ctxLen);
            out.set(_DOM2_PREFIX, 0);
            out[32] = F & 0xff;
            out[33] = ctxLen & 0xff;
            if (ctxLen > 0) out.set(ctx, 34);
            return out;
        }

        // ── Public API ─────────────────────────────────────────────────

        function _seedToKeyPair(seed) {
            const d = _h(seed);
            d[0] &= 248; d[31] &= 127; d[31] |= 64;
            const p = [_gf(), _gf(), _gf(), _gf()];
            const pk = new Uint8Array(32);
            _scalarbase(p, d);
            _pack(pk, p);
            const sk = new Uint8Array(64);
            sk.set(seed, 0);
            sk.set(pk, 32);
            return { publicKey: pk, privateKey: sk };
        }

        /**
         * Generate a key pair from a 32-byte seed (or fail if seed is missing).
         */
        function keyPair(seed) {
            if (!(seed instanceof Uint8Array) || seed.length !== 32) {
                console.warn('[crypto] INVALID: ed25519: seed must be 32 bytes');
                return false;
            }
            return _seedToKeyPair(seed);
        }

        // Internal sign - `dom` is `null` for pure Ed25519, or a Uint8Array
        // dom2 prefix for Ed25519ph (F=1) / Ed25519ctx (F=0).
        function _signCore(privateKey, message, dom) {
            if (!(privateKey instanceof Uint8Array) || privateKey.length !== 64) {
                console.warn('[crypto] INVALID: ed25519: privateKey must be 64 bytes (seed || pub)');
                return false;
            }
            const seed = privateKey.subarray(0, 32);
            const pk = privateKey.subarray(32, 64);

            const d = _h(seed);
            d[0] &= 248; d[31] &= 127; d[31] |= 64;
            const prefix = d.subarray(32, 64);

            // RFC 8032 §5.1.6 step 2 : r = SHA-512(dom2(F,C) || prefix || PH(M))
            const r = dom ? _h(dom, prefix, message) : _h(prefix, message);
            _reduce(r);
            const p = [_gf(), _gf(), _gf(), _gf()];
            _scalarbase(p, r);
            const R = new Uint8Array(32);
            _pack(R, p);

            // RFC 8032 §5.1.6 step 4 : k = SHA-512(dom2(F,C) || R || A || PH(M))
            const k = dom ? _h(dom, R, pk, message) : _h(R, pk, message);
            _reduce(k);

            const S = new Uint8Array(32);
            const x = new Float64Array(64);
            for (let i = 0; i < 32; i++) x[i] = r[i];
            for (let i = 0; i < 32; i++) {
                for (let j = 0; j < 32; j++) x[i + j] += k[i] * d[j];
            }
            _modL(S, x);

            const sig = new Uint8Array(64);
            sig.set(R, 0);
            sig.set(S, 32);
            return sig;
        }

        /**
         * Pure Ed25519 sign (RFC 8032 §5.1, FIPS 186-5 §7.6).
         * @param {Uint8Array} privateKey 64 bytes (seed || pub).
         * @param {Uint8Array} message
         * @returns {Uint8Array|false} 64-byte signature.
         */
        function sign(privateKey, message) {
            return _signCore(privateKey, message, null);
        }

        /**
         * Ed25519ph (preHash) sign (RFC 8032 §5.1.1 / FIPS 186-5 §7.6.2).
         * The IUT applies SHA-512 internally to the message before signing,
         * per the standard preHash convention. Pass the **raw** message (the
         * function does NOT accept a pre-hashed digest).
         * @param {Uint8Array} privateKey 64 bytes.
         * @param {Uint8Array} message Raw message (will be SHA-512'd internally).
         * @param {Uint8Array} [context] Optional context (≤ 255 bytes).
         * @returns {Uint8Array|false} 64-byte signature.
         */
        function signPh(privateKey, message, context) {
            const dom = _dom2(1, context);
            if (dom === false) return false;
            const ph = _h(message);   // SHA-512(message), 64 bytes
            return _signCore(privateKey, ph, dom);
        }

        /**
         * Ed25519ctx sign (RFC 8032 §5.1 with F=0 + non-empty context, FIPS
         * 186-5 §7.6.1). Note: pure Ed25519 differs from Ed25519ctx with
         * empty context - the standards explicitly distinguish them.
         * @param {Uint8Array} privateKey 64 bytes.
         * @param {Uint8Array} message
         * @param {Uint8Array} context Required (≥ 1 byte, ≤ 255 bytes).
         * @returns {Uint8Array|false} 64-byte signature.
         */
        function signCtx(privateKey, message, context) {
            if (!(context instanceof Uint8Array) || context.length === 0 || context.length > 255) {
                console.warn('[crypto] INVALID: ed25519: signCtx context must be 1..255 bytes (use sign() for empty context)');
                return false;
            }
            const dom = _dom2(0, context);
            if (dom === false) return false;
            return _signCore(privateKey, message, dom);
        }

        function _unpackneg(r, p) {
            const t = _gf(), chk = _gf(), num = _gf(), den = _gf(), den2 = _gf(), den4 = _gf(), den6 = _gf();
            _set25519(r[2], _gf1);
            _unpack25519(r[1], p);
            _S(num, r[1]);
            _M(den, num, _D);
            _Z(num, num, r[2]);
            _A(den, r[2], den);
            _S(den2, den); _S(den4, den2); _M(den6, den4, den2);
            _M(t, den6, num); _M(t, t, den);
            _pow2523(t, t);
            _M(t, t, num); _M(t, t, den); _M(t, t, den);
            _M(r[0], t, den);
            _S(chk, r[0]); _M(chk, chk, den);
            if (_neq25519(chk, num)) _M(r[0], r[0], _I);
            _S(chk, r[0]); _M(chk, chk, den);
            if (_neq25519(chk, num)) return -1;
            if (_par25519(r[0]) === (p[31] >> 7)) _Z(r[0], _gf0, r[0]);
            _M(r[3], r[0], r[1]);
            return 0;
        }

        // Group order L = 2^252 + 27742317777372353535851937790883648493
        // (RFC 8032 §5.1, little-endian). The canonical-form check
        // `s < L` (RFC 8032 §5.1.7 step 2) rejects malleable signatures
        // where s has been replaced by s + k·L for some k>0; without it,
        // an attacker can produce multiple valid signatures for the same
        // (pk, m) pair, breaking any protocol that uses signature bytes
        // as a unique handle (e.g. transaction IDs).
        const _ED25519_L = new Uint8Array([
            0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58,
            0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10
        ]);

        // Constant-time test: returns true iff s (32 bytes, little-endian)
        // is strictly less than L. Walks from the most-significant byte
        // down and folds the comparison through a borrow accumulator so
        // every byte is touched regardless of the result.
        function _sLessThanL(s) {
            let lt = 0, gt = 0;
            for (let i = 31; i >= 0; i--) {
                const a = s[i] | 0, b = _ED25519_L[i] | 0;
                // lt becomes 1 once a<b is seen at a higher byte; gt for a>b.
                const ltHere = ((a - b) >>> 31) & 1;
                const gtHere = ((b - a) >>> 31) & 1;
                lt |= ltHere & (1 - gt);
                gt |= gtHere & (1 - lt);
            }
            return lt === 1;
        }

        function _verifyCore(publicKey, message, signature, dom) {
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return false;
            if (!(signature instanceof Uint8Array) || signature.length !== 64) return false;

            // RFC 8032 §5.1.7 step 2: reject if s is not in canonical form.
            // Signature layout is R (32 bytes) || s (32 bytes, little-endian).
            if (!_sLessThanL(signature.subarray(32, 64))) return false;

            const q = [_gf(), _gf(), _gf(), _gf()];
            if (_unpackneg(q, publicKey) !== 0) return false;

            const R = signature.subarray(0, 32);
            const k = dom ? _h(dom, R, publicKey, message) : _h(R, publicKey, message);
            _reduce(k);

            const p = [_gf(), _gf(), _gf(), _gf()];
            _scalarmultPublic(p, q, k);

            const Rcheck = [_gf(), _gf(), _gf(), _gf()];
            _scalarbase(Rcheck, signature.subarray(32, 64));
            _add(p, Rcheck);

            const t = new Uint8Array(32);
            _pack(t, p);
            // Constant-time compare: accumulate XOR diffs across all 32 bytes.
            let diff = 0;
            for (let i = 0; i < 32; i++) diff |= signature[i] ^ t[i];
            return diff === 0;
        }

        /** Pure Ed25519 verify (RFC 8032 §5.1.7). */
        function verify(publicKey, signature, message) {
            return _verifyCore(publicKey, message, signature, null);
        }

        /** Ed25519ph verify (RFC 8032 §5.1.1 / FIPS 186-5 §7.6.2). */
        function verifyPh(publicKey, signature, message, context) {
            const dom = _dom2(1, context);
            if (dom === false) return false;
            const ph = _h(message);
            return _verifyCore(publicKey, ph, signature, dom);
        }

        /** Ed25519ctx verify (RFC 8032 §5.1 with F=0). */
        function verifyCtx(publicKey, signature, message, context) {
            if (!(context instanceof Uint8Array) || context.length === 0 || context.length > 255) {
                console.warn('[crypto] INVALID: ed25519: verifyCtx context must be 1..255 bytes');
                return false;
            }
            const dom = _dom2(0, context);
            if (dom === false) return false;
            return _verifyCore(publicKey, message, signature, dom);
        }

        return /** @type {Ed25519API} */ (/** @type {any} */ (Object.defineProperty({
            keyPair,
            sign, verify,
            // Ed25519ph variants
            // (preHash, RFC 8032 §5.1.1) and Ed25519ctx (context bytes,
            // RFC 8032 §5.1).
            signPh, verifyPh,
            signCtx, verifyCtx
        }, Symbol.for('@awacloud/fw/internal'), {
            // Test-only escape hatch: ACVP EDDSA-KeyVer-1.0 needs a way to
            // probe public-key validity (point decompression + on-curve check)
            // independently of signature verification. Not part of the public
            // API contract; do not call from production code.
            value: {
                isValidPublicKey(pk) {
                    if (!(pk instanceof Uint8Array) || pk.length !== 32) return false;
                    const q = [_gf(), _gf(), _gf(), _gf()];
                    return _unpackneg(q, pk) === 0;
                },
                dom2: _dom2,
                // s · B through the constant-time base table and through the
                // public 4-bit window: two independent paths, for tests.
                baseMulBoth(sc) {
                    const B = [_gf(), _gf(), _gf(), _gf()];
                    _set25519(B[0], _X); _set25519(B[1], _Y); _set25519(B[2], _gf1); _M(B[3], _X, _Y);
                    const p1 = [_gf(), _gf(), _gf(), _gf()], p2 = [_gf(), _gf(), _gf(), _gf()];
                    _scalarbase(p1, sc);
                    _scalarmultPublic(p2, B, sc);
                    const t = new Uint8Array(32), w = new Uint8Array(32);
                    _pack(t, p1); _pack(w, p2);
                    return { table: t, window: w };
                },
                /** The source of the base multiplication, for the structural constant-time test. */
                baseMulSource: () => String(_selectBase) + String(_scalarbase),
            }
        })));
    }
};
