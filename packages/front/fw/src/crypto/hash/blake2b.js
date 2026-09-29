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
 * 64-bit arithmetic is implemented over pairs of 32-bit halves carried in
 * a `Uint32Array(32)` (16 words × {hi, lo}) - JS lacks native uint64 outside
 * of `BigInt`, which is far too slow inside the inner loop. All mix-step
 * additions use carry-aware pairs; rotations use the standard 32/24/16/63
 * decompositions.
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

        // ── 64-bit primitive ops on (hi, lo) pairs ────────────────────

        // v[2i] = hi, v[2i+1] = lo. All ops are written inline in _compress
        // for speed; helpers here are reference implementations / clarity.

        function _add64(v, ai, bi) {
            // v[ai..ai+1] += v[bi..bi+1] (carry from lo to hi)
            const lo = (v[ai + 1] + v[bi + 1]) >>> 0;
            const carry = lo < v[ai + 1] ? 1 : 0;
            v[ai] = (v[ai] + v[bi] + carry) >>> 0;
            v[ai + 1] = lo;
        }

        function _xor64(v, ai, bi) {
            v[ai]     ^= v[bi];
            v[ai + 1] ^= v[bi + 1];
        }

        // Rotate 64-bit value (hi, lo) right by n bits (1..63).
        function _ror64(v, ai, n) {
            const hi = v[ai];
            const lo = v[ai + 1];
            let nh, nl;
            if (n === 32) {
                nh = lo; nl = hi;
            } else if (n < 32) {
                nh = (hi >>> n) | (lo << (32 - n));
                nl = (lo >>> n) | (hi << (32 - n));
            } else {
                const m = n - 32;
                nh = (lo >>> m) | (hi << (32 - m));
                nl = (hi >>> m) | (lo << (32 - m));
            }
            v[ai]     = nh >>> 0;
            v[ai + 1] = nl >>> 0;
        }

        // ── compression ───────────────────────────────────────────────

        function _G(v, a, b, c, d, mxHi, mxLo, myHi, myLo) {
            // v[a] += v[b] + (mxHi, mxLo)
            let lo = (v[a + 1] + v[b + 1]) >>> 0;
            let carry = lo < v[a + 1] ? 1 : 0;
            v[a]     = (v[a] + v[b] + carry) >>> 0;
            v[a + 1] = lo;
            lo = (v[a + 1] + mxLo) >>> 0;
            carry = lo < v[a + 1] ? 1 : 0;
            v[a]     = (v[a] + mxHi + carry) >>> 0;
            v[a + 1] = lo;

            // v[d] = ROTR64(v[d] ^ v[a], 32)
            _xor64(v, d, a);
            _ror64(v, d, 32);

            // v[c] += v[d]
            _add64(v, c, d);

            // v[b] = ROTR64(v[b] ^ v[c], 24)
            _xor64(v, b, c);
            _ror64(v, b, 24);

            // v[a] += v[b] + (myHi, myLo)
            lo = (v[a + 1] + v[b + 1]) >>> 0;
            carry = lo < v[a + 1] ? 1 : 0;
            v[a]     = (v[a] + v[b] + carry) >>> 0;
            v[a + 1] = lo;
            lo = (v[a + 1] + myLo) >>> 0;
            carry = lo < v[a + 1] ? 1 : 0;
            v[a]     = (v[a] + myHi + carry) >>> 0;
            v[a + 1] = lo;

            // v[d] = ROTR64(v[d] ^ v[a], 16)
            _xor64(v, d, a);
            _ror64(v, d, 16);

            // v[c] += v[d]
            _add64(v, c, d);

            // v[b] = ROTR64(v[b] ^ v[c], 63)
            _xor64(v, b, c);
            _ror64(v, b, 63);
        }

        const _v = new Uint32Array(32); // 16 words × (hi, lo)
        const _m = new Uint32Array(32); // 16 message words × (hi, lo)

        function _compress(ctx, last) {
            // Load message block as 16 little-endian 64-bit words from ctx.buf.
            const buf = ctx.buf;
            for (let i = 0; i < 16; i++) {
                const o = i * 8;
                _m[i * 2 + 1] = (buf[o]       | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
                _m[i * 2]     = (buf[o + 4]   | (buf[o + 5] << 8) | (buf[o + 6] << 16) | (buf[o + 7] << 24)) >>> 0;
            }
            // Initialise working vector.
            for (let i = 0; i < 16; i++) {
                _v[i * 2]     = ctx.h[i * 2];
                _v[i * 2 + 1] = ctx.h[i * 2 + 1];
            }
            for (let i = 0; i < 8; i++) {
                _v[16 + i * 2]     = IV[i * 2];
                _v[16 + i * 2 + 1] = IV[i * 2 + 1];
            }
            // XOR counter (t) into v[12..13].
            _v[24]     ^= ctx.tHi;
            _v[25]     ^= ctx.tLo;
            // (high counter half v[14..15] stays zero - t fits in 64 bits here).
            if (last) {
                // Invert v[14] (RFC 7693 §3.2). v[14] sits at _v[28..29].
                _v[28] = ~_v[28] >>> 0;
                _v[29] = ~_v[29] >>> 0;
            }

            for (let r = 0; r < 12; r++) {
                const s = SIGMA[r];
                _G(_v, 0,  8,  16, 24, _m[s[0]*2],  _m[s[0]*2+1],  _m[s[1]*2],  _m[s[1]*2+1]);
                _G(_v, 2,  10, 18, 26, _m[s[2]*2],  _m[s[2]*2+1],  _m[s[3]*2],  _m[s[3]*2+1]);
                _G(_v, 4,  12, 20, 28, _m[s[4]*2],  _m[s[4]*2+1],  _m[s[5]*2],  _m[s[5]*2+1]);
                _G(_v, 6,  14, 22, 30, _m[s[6]*2],  _m[s[6]*2+1],  _m[s[7]*2],  _m[s[7]*2+1]);
                _G(_v, 0,  10, 20, 30, _m[s[8]*2],  _m[s[8]*2+1],  _m[s[9]*2],  _m[s[9]*2+1]);
                _G(_v, 2,  12, 22, 24, _m[s[10]*2], _m[s[10]*2+1], _m[s[11]*2], _m[s[11]*2+1]);
                _G(_v, 4,  14, 16, 26, _m[s[12]*2], _m[s[12]*2+1], _m[s[13]*2], _m[s[13]*2+1]);
                _G(_v, 6,  8,  18, 28, _m[s[14]*2], _m[s[14]*2+1], _m[s[15]*2], _m[s[15]*2+1]);
            }

            for (let i = 0; i < 8; i++) {
                ctx.h[i * 2]     ^= _v[i * 2]     ^ _v[16 + i * 2];
                ctx.h[i * 2 + 1] ^= _v[i * 2 + 1] ^ _v[16 + i * 2 + 1];
            }
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
