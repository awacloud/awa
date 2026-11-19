// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview BLAKE2b - RFC 7693.
 *
 * 64-bit-word variant of BLAKE2; output length 1..64 bytes, optional key
 * (0..64 bytes), salt and personalisation (16 bytes each). The compression
 * function operates on a 128-byte block with 12 rounds of the G mixing
 * function over a 16-word working vector.
 *
 * 64-bit arithmetic runs on pairs of int32 halves held in locals (16 words
 * × {hi, lo}) - JS lacks native uint64 outside of `BigInt`, far too slow in
 * the inner loop. Additions wrap the low half and take the carry from bit
 * operations; rotations use the standard 32/24/16/63 decompositions. Every
 * value stays an int32: an unsigned half above 2^31 makes JavaScriptCore
 * compute in doubles (measured 7x slower).
 *
 * Public API:
 *   blake2b(message, outLen=64, key?)              - one-shot hash → Uint8Array
 *   blake2b.create(outLen=64, key?, salt?, person?) - streaming context with
 *                                                     update(chunk) / digest()
 *
 */

/**
 * Streaming BLAKE2b context returned by `create`.
 * @typedef {object} Blake2bContext
 * @property {(chunk: Uint8Array) => boolean} update Absorb a chunk; `false` if already finalised.
 * @property {() => (Uint8Array|false)} digest Finalise and return the digest bytes, or `false`.
 */

/**
 * Public shape returned by `blake2b.factory()`.
 * @typedef {object} Blake2bAPI
 * @property {(msg: Uint8Array, outLen?: number, key?: Uint8Array) => (Uint8Array|false)} hash
 *   One-shot BLAKE2b hash (digest bytes, or `false` on invalid params).
 * @property {(outLen?: number, key?: Uint8Array, salt?: Uint8Array, person?: Uint8Array) => (Blake2bContext|false)} create
 *   Create a streaming context, or `false` on invalid params.
 */

export const blake2b = {
    name: 'blake2b',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: [],

    /** @returns {Blake2bAPI} */
    factory() {

        // ── IV (same as SHA-512) ──────────────────────────────────────

        // 64-bit IV split into [hi, lo] 32-bit halves.
        const IV = new Uint32Array([
            0x6a09e667, 0xf3bcc908,
            0xbb67ae85, 0x84caa73b,
            0x3c6ef372, 0xfe94f82b,
            0xa54ff53a, 0x5f1d36f1,
            0x510e527f, 0xade682d1,
            0x9b05688c, 0x2b3e6c1f,
            0x1f83d9ab, 0xfb41bd6b,
            0x5be0cd19, 0x137e2179
        ]);

        // SIGMA permutations (10 unique, repeated for rounds 10/11).
        const SIGMA = [
            [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
            [14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],
            [11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4],
            [7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],
            [9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13],
            [2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],
            [12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11],
            [13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],
            [6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5],
            [10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0],
            [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
            [14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3]
        ];

        // ── compression ───────────────────────────────────────────────

        const _m = new Int32Array(32); // 16 message words × (hi, lo), int32

        /**
         * BLAKE2b compression F (RFC 7693 §3.2) on locals: the 16 working words
         * as (h, l) int32 pairs, the 12 rounds of generated inline mixing.
         * @param {{h: Uint32Array, buf: Uint8Array, tHi: number, tLo: number}} ctx
         * @param {boolean} last
         */
        function _compress(ctx, last) {
            const buf = ctx.buf, h = ctx.h, m = _m;
            for (let i = 0; i < 16; i++) {
                const o = i * 8;
                m[i * 2 + 1] = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);
                m[i * 2] = buf[o + 4] | (buf[o + 5] << 8) | (buf[o + 6] << 16) | (buf[o + 7] << 24);
            }
            let v0h = h[0] | 0, v0l = h[1] | 0, v1h = h[2] | 0, v1l = h[3] | 0, v2h = h[4] | 0, v2l = h[5] | 0, v3h = h[6] | 0, v3l = h[7] | 0, v4h = h[8] | 0, v4l = h[9] | 0, v5h = h[10] | 0, v5l = h[11] | 0, v6h = h[12] | 0, v6l = h[13] | 0, v7h = h[14] | 0, v7l = h[15] | 0, v8h = IV[0] | 0, v8l = IV[1] | 0, v9h = IV[2] | 0, v9l = IV[3] | 0, v10h = IV[4] | 0, v10l = IV[5] | 0, v11h = IV[6] | 0, v11l = IV[7] | 0, v12h = IV[8] | 0, v12l = IV[9] | 0, v13h = IV[10] | 0, v13l = IV[11] | 0, v14h = IV[12] | 0, v14l = IV[13] | 0, v15h = IV[14] | 0, v15l = IV[15] | 0;
            let l, th, tl;
            v12h ^= ctx.tHi; v12l ^= ctx.tLo;
            if (last) { v14h = ~v14h; v14l = ~v14l; }
            for (let r = 0; r < 12; r++) {
                const s = SIGMA[r];
                const x0h = m[s[0] * 2], x0l = m[s[0] * 2 + 1];
                const x1h = m[s[1] * 2], x1l = m[s[1] * 2 + 1];
                const x2h = m[s[2] * 2], x2l = m[s[2] * 2 + 1];
                const x3h = m[s[3] * 2], x3l = m[s[3] * 2 + 1];
                const x4h = m[s[4] * 2], x4l = m[s[4] * 2 + 1];
                const x5h = m[s[5] * 2], x5l = m[s[5] * 2 + 1];
                const x6h = m[s[6] * 2], x6l = m[s[6] * 2 + 1];
                const x7h = m[s[7] * 2], x7l = m[s[7] * 2 + 1];
                const x8h = m[s[8] * 2], x8l = m[s[8] * 2 + 1];
                const x9h = m[s[9] * 2], x9l = m[s[9] * 2 + 1];
                const x10h = m[s[10] * 2], x10l = m[s[10] * 2 + 1];
                const x11h = m[s[11] * 2], x11l = m[s[11] * 2 + 1];
                const x12h = m[s[12] * 2], x12l = m[s[12] * 2 + 1];
                const x13h = m[s[13] * 2], x13l = m[s[13] * 2 + 1];
                const x14h = m[s[14] * 2], x14l = m[s[14] * 2 + 1];
                const x15h = m[s[15] * 2], x15l = m[s[15] * 2 + 1];
                l = (v0l + v4l) | 0; v0h = (v0h + v4h + ((((v0l & v4l) | ((v0l | v4l) & ~l)) >>> 31))) | 0; v0l = l;
                l = (v0l + x0l) | 0; v0h = (v0h + x0h + ((((v0l & x0l) | ((v0l | x0l) & ~l)) >>> 31))) | 0; v0l = l;
                th = v12h ^ v0h; tl = v12l ^ v0l;
                v12h = tl; v12l = th;
                l = (v8l + v12l) | 0; v8h = (v8h + v12h + ((((v8l & v12l) | ((v8l | v12l) & ~l)) >>> 31))) | 0; v8l = l;
                th = v4h ^ v8h; tl = v4l ^ v8l;
                v4h = (th >>> 24) | (tl << 8); v4l = (tl >>> 24) | (th << 8);
                l = (v0l + v4l) | 0; v0h = (v0h + v4h + ((((v0l & v4l) | ((v0l | v4l) & ~l)) >>> 31))) | 0; v0l = l;
                l = (v0l + x1l) | 0; v0h = (v0h + x1h + ((((v0l & x1l) | ((v0l | x1l) & ~l)) >>> 31))) | 0; v0l = l;
                th = v12h ^ v0h; tl = v12l ^ v0l;
                v12h = (th >>> 16) | (tl << 16); v12l = (tl >>> 16) | (th << 16);
                l = (v8l + v12l) | 0; v8h = (v8h + v12h + ((((v8l & v12l) | ((v8l | v12l) & ~l)) >>> 31))) | 0; v8l = l;
                th = v4h ^ v8h; tl = v4l ^ v8l;
                v4h = (tl >>> 31) | (th << 1); v4l = (th >>> 31) | (tl << 1);
                l = (v1l + v5l) | 0; v1h = (v1h + v5h + ((((v1l & v5l) | ((v1l | v5l) & ~l)) >>> 31))) | 0; v1l = l;
                l = (v1l + x2l) | 0; v1h = (v1h + x2h + ((((v1l & x2l) | ((v1l | x2l) & ~l)) >>> 31))) | 0; v1l = l;
                th = v13h ^ v1h; tl = v13l ^ v1l;
                v13h = tl; v13l = th;
                l = (v9l + v13l) | 0; v9h = (v9h + v13h + ((((v9l & v13l) | ((v9l | v13l) & ~l)) >>> 31))) | 0; v9l = l;
                th = v5h ^ v9h; tl = v5l ^ v9l;
                v5h = (th >>> 24) | (tl << 8); v5l = (tl >>> 24) | (th << 8);
                l = (v1l + v5l) | 0; v1h = (v1h + v5h + ((((v1l & v5l) | ((v1l | v5l) & ~l)) >>> 31))) | 0; v1l = l;
                l = (v1l + x3l) | 0; v1h = (v1h + x3h + ((((v1l & x3l) | ((v1l | x3l) & ~l)) >>> 31))) | 0; v1l = l;
                th = v13h ^ v1h; tl = v13l ^ v1l;
                v13h = (th >>> 16) | (tl << 16); v13l = (tl >>> 16) | (th << 16);
                l = (v9l + v13l) | 0; v9h = (v9h + v13h + ((((v9l & v13l) | ((v9l | v13l) & ~l)) >>> 31))) | 0; v9l = l;
                th = v5h ^ v9h; tl = v5l ^ v9l;
                v5h = (tl >>> 31) | (th << 1); v5l = (th >>> 31) | (tl << 1);
                l = (v2l + v6l) | 0; v2h = (v2h + v6h + ((((v2l & v6l) | ((v2l | v6l) & ~l)) >>> 31))) | 0; v2l = l;
                l = (v2l + x4l) | 0; v2h = (v2h + x4h + ((((v2l & x4l) | ((v2l | x4l) & ~l)) >>> 31))) | 0; v2l = l;
                th = v14h ^ v2h; tl = v14l ^ v2l;
                v14h = tl; v14l = th;
                l = (v10l + v14l) | 0; v10h = (v10h + v14h + ((((v10l & v14l) | ((v10l | v14l) & ~l)) >>> 31))) | 0; v10l = l;
                th = v6h ^ v10h; tl = v6l ^ v10l;
                v6h = (th >>> 24) | (tl << 8); v6l = (tl >>> 24) | (th << 8);
                l = (v2l + v6l) | 0; v2h = (v2h + v6h + ((((v2l & v6l) | ((v2l | v6l) & ~l)) >>> 31))) | 0; v2l = l;
                l = (v2l + x5l) | 0; v2h = (v2h + x5h + ((((v2l & x5l) | ((v2l | x5l) & ~l)) >>> 31))) | 0; v2l = l;
                th = v14h ^ v2h; tl = v14l ^ v2l;
                v14h = (th >>> 16) | (tl << 16); v14l = (tl >>> 16) | (th << 16);
                l = (v10l + v14l) | 0; v10h = (v10h + v14h + ((((v10l & v14l) | ((v10l | v14l) & ~l)) >>> 31))) | 0; v10l = l;
                th = v6h ^ v10h; tl = v6l ^ v10l;
                v6h = (tl >>> 31) | (th << 1); v6l = (th >>> 31) | (tl << 1);
                l = (v3l + v7l) | 0; v3h = (v3h + v7h + ((((v3l & v7l) | ((v3l | v7l) & ~l)) >>> 31))) | 0; v3l = l;
                l = (v3l + x6l) | 0; v3h = (v3h + x6h + ((((v3l & x6l) | ((v3l | x6l) & ~l)) >>> 31))) | 0; v3l = l;
                th = v15h ^ v3h; tl = v15l ^ v3l;
                v15h = tl; v15l = th;
                l = (v11l + v15l) | 0; v11h = (v11h + v15h + ((((v11l & v15l) | ((v11l | v15l) & ~l)) >>> 31))) | 0; v11l = l;
                th = v7h ^ v11h; tl = v7l ^ v11l;
                v7h = (th >>> 24) | (tl << 8); v7l = (tl >>> 24) | (th << 8);
                l = (v3l + v7l) | 0; v3h = (v3h + v7h + ((((v3l & v7l) | ((v3l | v7l) & ~l)) >>> 31))) | 0; v3l = l;
                l = (v3l + x7l) | 0; v3h = (v3h + x7h + ((((v3l & x7l) | ((v3l | x7l) & ~l)) >>> 31))) | 0; v3l = l;
                th = v15h ^ v3h; tl = v15l ^ v3l;
                v15h = (th >>> 16) | (tl << 16); v15l = (tl >>> 16) | (th << 16);
                l = (v11l + v15l) | 0; v11h = (v11h + v15h + ((((v11l & v15l) | ((v11l | v15l) & ~l)) >>> 31))) | 0; v11l = l;
                th = v7h ^ v11h; tl = v7l ^ v11l;
                v7h = (tl >>> 31) | (th << 1); v7l = (th >>> 31) | (tl << 1);
                l = (v0l + v5l) | 0; v0h = (v0h + v5h + ((((v0l & v5l) | ((v0l | v5l) & ~l)) >>> 31))) | 0; v0l = l;
                l = (v0l + x8l) | 0; v0h = (v0h + x8h + ((((v0l & x8l) | ((v0l | x8l) & ~l)) >>> 31))) | 0; v0l = l;
                th = v15h ^ v0h; tl = v15l ^ v0l;
                v15h = tl; v15l = th;
                l = (v10l + v15l) | 0; v10h = (v10h + v15h + ((((v10l & v15l) | ((v10l | v15l) & ~l)) >>> 31))) | 0; v10l = l;
                th = v5h ^ v10h; tl = v5l ^ v10l;
                v5h = (th >>> 24) | (tl << 8); v5l = (tl >>> 24) | (th << 8);
                l = (v0l + v5l) | 0; v0h = (v0h + v5h + ((((v0l & v5l) | ((v0l | v5l) & ~l)) >>> 31))) | 0; v0l = l;
                l = (v0l + x9l) | 0; v0h = (v0h + x9h + ((((v0l & x9l) | ((v0l | x9l) & ~l)) >>> 31))) | 0; v0l = l;
                th = v15h ^ v0h; tl = v15l ^ v0l;
                v15h = (th >>> 16) | (tl << 16); v15l = (tl >>> 16) | (th << 16);
                l = (v10l + v15l) | 0; v10h = (v10h + v15h + ((((v10l & v15l) | ((v10l | v15l) & ~l)) >>> 31))) | 0; v10l = l;
                th = v5h ^ v10h; tl = v5l ^ v10l;
                v5h = (tl >>> 31) | (th << 1); v5l = (th >>> 31) | (tl << 1);
                l = (v1l + v6l) | 0; v1h = (v1h + v6h + ((((v1l & v6l) | ((v1l | v6l) & ~l)) >>> 31))) | 0; v1l = l;
                l = (v1l + x10l) | 0; v1h = (v1h + x10h + ((((v1l & x10l) | ((v1l | x10l) & ~l)) >>> 31))) | 0; v1l = l;
                th = v12h ^ v1h; tl = v12l ^ v1l;
                v12h = tl; v12l = th;
                l = (v11l + v12l) | 0; v11h = (v11h + v12h + ((((v11l & v12l) | ((v11l | v12l) & ~l)) >>> 31))) | 0; v11l = l;
                th = v6h ^ v11h; tl = v6l ^ v11l;
                v6h = (th >>> 24) | (tl << 8); v6l = (tl >>> 24) | (th << 8);
                l = (v1l + v6l) | 0; v1h = (v1h + v6h + ((((v1l & v6l) | ((v1l | v6l) & ~l)) >>> 31))) | 0; v1l = l;
                l = (v1l + x11l) | 0; v1h = (v1h + x11h + ((((v1l & x11l) | ((v1l | x11l) & ~l)) >>> 31))) | 0; v1l = l;
                th = v12h ^ v1h; tl = v12l ^ v1l;
                v12h = (th >>> 16) | (tl << 16); v12l = (tl >>> 16) | (th << 16);
                l = (v11l + v12l) | 0; v11h = (v11h + v12h + ((((v11l & v12l) | ((v11l | v12l) & ~l)) >>> 31))) | 0; v11l = l;
                th = v6h ^ v11h; tl = v6l ^ v11l;
                v6h = (tl >>> 31) | (th << 1); v6l = (th >>> 31) | (tl << 1);
                l = (v2l + v7l) | 0; v2h = (v2h + v7h + ((((v2l & v7l) | ((v2l | v7l) & ~l)) >>> 31))) | 0; v2l = l;
                l = (v2l + x12l) | 0; v2h = (v2h + x12h + ((((v2l & x12l) | ((v2l | x12l) & ~l)) >>> 31))) | 0; v2l = l;
                th = v13h ^ v2h; tl = v13l ^ v2l;
                v13h = tl; v13l = th;
                l = (v8l + v13l) | 0; v8h = (v8h + v13h + ((((v8l & v13l) | ((v8l | v13l) & ~l)) >>> 31))) | 0; v8l = l;
                th = v7h ^ v8h; tl = v7l ^ v8l;
                v7h = (th >>> 24) | (tl << 8); v7l = (tl >>> 24) | (th << 8);
                l = (v2l + v7l) | 0; v2h = (v2h + v7h + ((((v2l & v7l) | ((v2l | v7l) & ~l)) >>> 31))) | 0; v2l = l;
                l = (v2l + x13l) | 0; v2h = (v2h + x13h + ((((v2l & x13l) | ((v2l | x13l) & ~l)) >>> 31))) | 0; v2l = l;
                th = v13h ^ v2h; tl = v13l ^ v2l;
                v13h = (th >>> 16) | (tl << 16); v13l = (tl >>> 16) | (th << 16);
                l = (v8l + v13l) | 0; v8h = (v8h + v13h + ((((v8l & v13l) | ((v8l | v13l) & ~l)) >>> 31))) | 0; v8l = l;
                th = v7h ^ v8h; tl = v7l ^ v8l;
                v7h = (tl >>> 31) | (th << 1); v7l = (th >>> 31) | (tl << 1);
                l = (v3l + v4l) | 0; v3h = (v3h + v4h + ((((v3l & v4l) | ((v3l | v4l) & ~l)) >>> 31))) | 0; v3l = l;
                l = (v3l + x14l) | 0; v3h = (v3h + x14h + ((((v3l & x14l) | ((v3l | x14l) & ~l)) >>> 31))) | 0; v3l = l;
                th = v14h ^ v3h; tl = v14l ^ v3l;
                v14h = tl; v14l = th;
                l = (v9l + v14l) | 0; v9h = (v9h + v14h + ((((v9l & v14l) | ((v9l | v14l) & ~l)) >>> 31))) | 0; v9l = l;
                th = v4h ^ v9h; tl = v4l ^ v9l;
                v4h = (th >>> 24) | (tl << 8); v4l = (tl >>> 24) | (th << 8);
                l = (v3l + v4l) | 0; v3h = (v3h + v4h + ((((v3l & v4l) | ((v3l | v4l) & ~l)) >>> 31))) | 0; v3l = l;
                l = (v3l + x15l) | 0; v3h = (v3h + x15h + ((((v3l & x15l) | ((v3l | x15l) & ~l)) >>> 31))) | 0; v3l = l;
                th = v14h ^ v3h; tl = v14l ^ v3l;
                v14h = (th >>> 16) | (tl << 16); v14l = (tl >>> 16) | (th << 16);
                l = (v9l + v14l) | 0; v9h = (v9h + v14h + ((((v9l & v14l) | ((v9l | v14l) & ~l)) >>> 31))) | 0; v9l = l;
                th = v4h ^ v9h; tl = v4l ^ v9l;
                v4h = (tl >>> 31) | (th << 1); v4l = (th >>> 31) | (tl << 1);
            }
            h[0] ^= v0h ^ v8h; h[1] ^= v0l ^ v8l;
            h[2] ^= v1h ^ v9h; h[3] ^= v1l ^ v9l;
            h[4] ^= v2h ^ v10h; h[5] ^= v2l ^ v10l;
            h[6] ^= v3h ^ v11h; h[7] ^= v3l ^ v11l;
            h[8] ^= v4h ^ v12h; h[9] ^= v4l ^ v12l;
            h[10] ^= v5h ^ v13h; h[11] ^= v5l ^ v13l;
            h[12] ^= v6h ^ v14h; h[13] ^= v6l ^ v14l;
            h[14] ^= v7h ^ v15h; h[15] ^= v7l ^ v15l;
        }

        // ── ctx + counter helpers ─────────────────────────────────────

        function _addCounter(ctx, n) {
            const lo = (ctx.tLo + n) >>> 0;
            if (lo < ctx.tLo) ctx.tHi = (ctx.tHi + 1) >>> 0;
            ctx.tLo = lo;
        }

        // ── public init / update / digest ─────────────────────────────

        /**
         * Create a streaming BLAKE2b context.
         * @param {number} [outLen=64] Desired digest length in bytes (1..64).
         * @param {Uint8Array} [key] Optional MAC key (0..64 bytes).
         * @param {Uint8Array} [salt] Optional 16-byte salt.
         * @param {Uint8Array} [person] Optional 16-byte personalisation.
         */
        function create(outLen, key, salt, person) {
            outLen = outLen == null ? 64 : outLen;
            if (outLen < 1 || outLen > 64) {
                console.warn('[crypto] INVALID: blake2b: outLen out of range');
                return false;
            }
            const keyLen = key ? key.length : 0;
            if (keyLen > 64) {
                console.warn('[crypto] INVALID: blake2b: key too long');
                return false;
            }
            if (salt && salt.length !== 16) {
                console.warn('[crypto] INVALID: blake2b: salt must be 16 bytes');
                return false;
            }
            if (person && person.length !== 16) {
                console.warn('[crypto] INVALID: blake2b: person must be 16 bytes');
                return false;
            }

            const h = new Uint32Array(16);
            for (let i = 0; i < 16; i++) h[i] = IV[i];

            // Parameter block XOR into h[0..7] (h[0..1] holds first 64-bit word).
            // Param byte layout: digest_length || key_length || fanout || depth ||
            //   leaf_length(4) || node_offset(8) || node_depth || inner_length ||
            //   reserved(14) || salt(16) || personal(16)
            //
            // For sequential mode: fanout=1, depth=1, leaf=0, node_offset=0,
            //                       node_depth=0, inner_length=0.
            const p0Lo = (outLen | (keyLen << 8) | (1 << 16) | (1 << 24)) >>> 0;
            h[1] ^= p0Lo;
            // h[0] (high half of first word) stays - leaf_length is 0.
            // node_offset is 0 → h[2..3] unchanged.
            // node_depth/inner_length 0 → h[4..5] unchanged.

            if (salt) {
                // salt occupies bytes 32..47 → words h[8..11] (LE per 64-bit word).
                h[9]  ^= (salt[0]  | (salt[1] << 8) | (salt[2] << 16) | (salt[3] << 24)) >>> 0;
                h[8]  ^= (salt[4]  | (salt[5] << 8) | (salt[6] << 16) | (salt[7] << 24)) >>> 0;
                h[11] ^= (salt[8]  | (salt[9] << 8) | (salt[10] << 16) | (salt[11] << 24)) >>> 0;
                h[10] ^= (salt[12] | (salt[13] << 8) | (salt[14] << 16) | (salt[15] << 24)) >>> 0;
            }
            if (person) {
                h[13] ^= (person[0]  | (person[1] << 8) | (person[2] << 16) | (person[3] << 24)) >>> 0;
                h[12] ^= (person[4]  | (person[5] << 8) | (person[6] << 16) | (person[7] << 24)) >>> 0;
                h[15] ^= (person[8]  | (person[9] << 8) | (person[10] << 16) | (person[11] << 24)) >>> 0;
                h[14] ^= (person[12] | (person[13] << 8) | (person[14] << 16) | (person[15] << 24)) >>> 0;
            }

            const ctx = {
                h,
                buf: new Uint8Array(128),
                bufLen: 0,
                tHi: 0,
                tLo: 0,
                outLen,
                done: false
            };

            if (keyLen > 0) {
                // First block: zero-padded key.
                ctx.buf.set(key, 0);
                ctx.bufLen = 128;
            }
            return _wrap(ctx);
        }

        function _wrap(ctx) {
            return {
                update(chunk) { return _update(ctx, chunk); },
                digest() { return _digest(ctx); }
            };
        }

        function _update(ctx, chunk) {
            if (ctx.done) {
                console.warn('[crypto] INVALID: blake2b: context already finalised');
                return false;
            }
            let off = 0;
            const len = chunk.length;
            while (off < len) {
                if (ctx.bufLen === 128) {
                    // Compress full block before consuming more (not yet last).
                    _addCounter(ctx, 128);
                    _compress(ctx, false);
                    ctx.bufLen = 0;
                }
                const take = Math.min(128 - ctx.bufLen, len - off);
                ctx.buf.set(chunk.subarray(off, off + take), ctx.bufLen);
                ctx.bufLen += take;
                off += take;
            }
            return true;
        }

        function _digest(ctx) {
            if (ctx.done) {
                console.warn('[crypto] INVALID: blake2b: context already finalised');
                return false;
            }
            // Pad final block with zeros and compress with last=true.
            for (let i = ctx.bufLen; i < 128; i++) ctx.buf[i] = 0;
            _addCounter(ctx, ctx.bufLen);
            _compress(ctx, true);
            ctx.done = true;

            const out = new Uint8Array(ctx.outLen);
            for (let i = 0; i < ctx.outLen; i++) {
                // h[i*2] is hi, h[i*2+1] is lo for 64-bit word i ÷ 8 (8 bytes per word).
                const word = (i >>> 3);
                const byte = i & 7;
                const half = byte < 4 ? ctx.h[word * 2 + 1] : ctx.h[word * 2];
                out[i] = (half >>> ((byte & 3) * 8)) & 0xff;
            }
            return out;
        }

        /**
         * One-shot BLAKE2b hash.
         * @param {Uint8Array} msg
         * @param {number} [outLen=64] 1..64
         * @param {Uint8Array} [key] 0..64 bytes
         * @returns {Uint8Array|false}
         */
        function hash(msg, outLen, key) {
            const c = create(outLen, key);
            if (c === false) return false;
            c.update(msg);
            return c.digest();
        }

        return {
            hash,
            create
        };
    }
};
