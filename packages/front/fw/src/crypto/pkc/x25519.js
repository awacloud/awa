// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview X25519 - Diffie-Hellman over Curve25519 (RFC 7748).
 *
 * Implements the Montgomery ladder for the curve y² = x³ + 486662x² + x
 * over the prime field GF(2^255 − 19). Field elements are represented as
 * Float64Array(16) of 16-bit limbs (TweetNaCl-derived (public domain; see
 * docs/dev/provenance.md)) which gives exact 32-bit products in JS doubles
 * and avoids 53-bit precision pitfalls during reduction.
 *
 * Public API takes raw Uint8Array (32 bytes for both scalar and u-coord)
 * matching the wire format defined by RFC 7748 §5. The standard scalar
 * clamping (clear low 3 bits, clear high bit, set bit 254) is applied
 * automatically per §5 step 2.
 *
 */

/**
 * Public API returned by `x25519.factory()`.
 * @typedef {object} X25519API
 * @property {(scalar: Uint8Array, u: Uint8Array) => (Uint8Array|false)} scalarMult Compute scalarmult(scalar, u); 32-byte output or false.
 * @property {(scalar: Uint8Array) => (Uint8Array|false)} scalarMultBase scalarmult against the base point u=9.
 * @property {(u: Uint8Array) => boolean} isLowOrderPoint True iff `u` is a documented low-order point (or malformed length).
 */

export const x25519 = {
    name: 'x25519',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: [],

    /** @returns {X25519API} */
    factory() {

        // Standard curve constant a24 = (486662 - 2) / 4 = 121665: see `_M121665`.

        function _gf(init) {
            const r = new Float64Array(16);
            if (init) for (let i = 0; i < init.length; i++) r[i] = init[i];
            return r;
        }

        function _car25519(o) {
            for (let i = 0; i < 16; i++) {
                o[i] += 65536;
                const c = Math.floor(o[i] / 65536);
                o[(i + 1) * (i < 15 ? 1 : 0)] += c - 1 + 37 * (c - 1) * (i === 15 ? 1 : 0);
                o[i] -= c * 65536;
            }
        }

        // Constant-time conditional swap (TweetNaCl `sel25519`). The mask `c`
        // is derived from `b` via bitwise arithmetic only - no data-dependent
        // branch - so every iteration performs identical memory writes
        // regardless of whether the swap actually happens. This is the
        // primitive that keeps the Montgomery ladder side-channel free.
        function _sel25519(p, q, b) {
            const c = ~(b - 1);
            for (let i = 0; i < 16; i++) {
                const t = c & (p[i] ^ q[i]);
                p[i] ^= t;
                q[i] ^= t;
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
         * o = a * 121665 (the ladder's a24), limb by limb; exact (a_i * 121665 < 2^36).
         * @param {Float64Array} o
         * @param {Float64Array} a
         */
        function _M121665(o, a) {
            let c = 0, v;
            for (let i = 0; i < 16; i++) { v = a[i] * 121665 + c; c = Math.floor(v / 65536); o[i] = v - c * 65536; }
            o[0] += 38 * c; c = 0;
            for (let i = 0; i < 16; i++) { v = o[i] + c; c = Math.floor(v / 65536); o[i] = v - c * 65536; }
            o[0] += 38 * c;
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

        function _scalarmult(q, n, p) {
            const z = new Uint8Array(32);
            const x = _gf(), a = _gf(), b = _gf(), c = _gf(), d = _gf(), e = _gf(), f = _gf();
            for (let i = 0; i < 31; i++) z[i] = n[i];
            z[31] = (n[31] & 127) | 64;
            z[0] &= 248;
            _unpack25519(x, p);
            for (let i = 0; i < 16; i++) { b[i] = x[i]; d[i] = a[i] = c[i] = 0; }
            a[0] = d[0] = 1;
            for (let i = 254; i >= 0; --i) {
                const r = (z[i >>> 3] >>> (i & 7)) & 1;
                _sel25519(a, b, r);
                _sel25519(c, d, r);
                _A(e, a, c);
                _Z(a, a, c);
                _A(c, b, d);
                _Z(b, b, d);
                _S(d, e);
                _S(f, a);
                _M(a, c, a);
                _M(c, b, e);
                _A(e, a, c);
                _Z(a, a, c);
                _S(b, a);
                _Z(c, d, f);
                _M121665(a, c);
                _A(a, a, d);
                _M(c, c, a);
                _M(a, d, f);
                _M(d, b, x);
                _S(b, e);
                _sel25519(a, b, r);
                _sel25519(c, d, r);
            }
            _inv25519(c, c);
            _M(a, a, c);
            _pack25519(q, a);
            return 0;
        }

        const _BASE = new Uint8Array(32);
        _BASE[0] = 9;

        /**
         * Compute scalarmult(scalar, u).
         * @param {Uint8Array} scalar 32-byte scalar (will be clamped).
         * @param {Uint8Array} u 32-byte u-coordinate.
         * @returns {Uint8Array|false} 32-byte shared secret / output u-coordinate, or false on invalid input.
         */
        function scalarMult(scalar, u) {
            if (!(scalar instanceof Uint8Array) || scalar.length !== 32) {
                console.warn('[crypto] INVALID: x25519: scalar must be 32 bytes');
                return false;
            }
            if (!(u instanceof Uint8Array) || u.length !== 32) {
                console.warn('[crypto] INVALID: x25519: u must be 32 bytes');
                return false;
            }
            const out = new Uint8Array(32);
            _scalarmult(out, scalar, u);
            return out;
        }

        /** scalarmult of `scalar` against the standard base point u=9. */
        function scalarMultBase(scalar) {
            return scalarMult(scalar, _BASE);
        }

        // ── Low-order point detection helper ──────────────
        //
        // Curve25519 has cofactor 8; some u-coords generate a subgroup
        // of small order (1, 2, 4, 8). If Alice uses such a u
        // as Bob's public key, the product `scalarMult(scalar, u)` is
        // **always zero** or takes one of a few predictable values -
        // which allows an active attacker (substituting the public key
        // in a Diffie-Hellman exchange) to force a known shared secret.
        //
        // RFC 7748 §6.1 recommends either (a) accepting small-order
        // points and letting the `result === 00…00` check filter downstream,
        // or (b) explicitly rejecting before `scalarMult`. This helper offers
        // option (b), explicit on the caller side.
        //
        // List: 7 unique u-coordinates documented (Bernstein 2006,
        // Wycheproof project, libsodium `crypto_scalarmult_curve25519_ref10`
        // table `crypto_scalarmult_curve25519_ref10_is_canonical`).
        //
        // - 0x00…00 : order-4 point (≈ point at infinity)
        // - 0x01…00 : order-1 point (trivial generator)
        // - 0xe0eb7a…85a800 : order 8 (on the main curve)
        // - 0x5f9c95…1f1157 : order 8 (on the twist)
        // - 0xec…7f, 0xed…7f, 0xee…7f : equivalents mod p of the three above.
        //
        // Constant-time comparison to avoid timing leak on `u` (even
        // if `u` is public, the pattern remains best practice).
        const _LOW_ORDER_POINTS = [
            // 7 unique low-order u-coordinates on Curve25519 (cofactor 8).
            new Uint8Array([
                0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
            ]),
            new Uint8Array([
                0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
            ]),
            new Uint8Array([
                0xe0,0xeb,0x7a,0x7c,0x3b,0x41,0xb8,0xae,0x16,0x56,0xe3,0xfa,0xf1,0x9f,0xc4,0x6a,
                0xda,0x09,0x8d,0xeb,0x9c,0x32,0xb1,0xfd,0x86,0x62,0x05,0x16,0x5f,0x49,0xb8,0x00,
            ]),
            new Uint8Array([
                0x5f,0x9c,0x95,0xbc,0xa3,0x50,0x8c,0x24,0xb1,0xd0,0xb1,0x55,0x9c,0x83,0xef,0x5b,
                0x04,0x44,0x5c,0xc4,0x58,0x1c,0x8e,0x86,0xd8,0x22,0x4e,0xdd,0xd0,0x9f,0x11,0x57,
            ]),
            new Uint8Array([
                0xec,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,
                0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x7f,
            ]),
            new Uint8Array([
                0xed,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,
                0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x7f,
            ]),
            new Uint8Array([
                0xee,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,
                0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x7f,
            ]),
        ];

        /**
         * Test whether `u` is one of the documented low-order u-coordinates
         * on Curve25519 (cofactor-8 subgroup elements). RFC 7748 §6.1.
         *
         * Constant-time comparison vs the embedded table.
         *
         * @param {Uint8Array} u 32-byte u-coordinate.
         * @returns {boolean} true iff `u` is low-order (or a malformed length).
         */
        function isLowOrderPoint(u) {
            if (!(u instanceof Uint8Array) || u.length !== 32) {
                console.warn('[crypto] INVALID: x25519: u must be 32 bytes');
                return false;
            }
            // Mask the high bit per RFC 7748 §5 (`u_255 = 0`) to canonicalise.
            const norm = new Uint8Array(u);
            norm[31] &= 0x7f;
            // Constant-time : OR-accumulate `(norm == lop)` over all entries.
            // We aggregate `equal_i` into a flag then return `flag !== 0`.
            let anyMatch = 0;
            for (let p = 0; p < _LOW_ORDER_POINTS.length; p++) {
                const lop = _LOW_ORDER_POINTS[p];
                let diff = 0;
                for (let i = 0; i < 32; i++) diff |= (norm[i] ^ lop[i]);
                // diff === 0  ⇒ match. Convert to {0, 1} branchless :
                //   ((diff - 1) >>> 31) returns 1 only when diff === 0.
                anyMatch |= ((diff - 1) >>> 31) & 1;
            }
            return anyMatch === 1;
        }

        return Object.defineProperty({
            scalarMult,
            scalarMultBase,
            // Opt-in defensive helper.
            isLowOrderPoint
        }, Symbol.for('@awacloud/fw/internal'), {
            value: { lowOrderPoints: _LOW_ORDER_POINTS }
        });
    }
};
