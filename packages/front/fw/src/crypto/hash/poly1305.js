// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Poly1305 one-time MAC (RFC 8439 §2.5).
 *
 * Poly1305 evaluates a polynomial over GF(2^130 − 5) with the message
 * blocks as coefficients and a 128-bit key `r` as the variable, then adds
 * a second 128-bit "pad" key `s` mod 2^128.
 *
 * The 32-byte one-time key splits as `r || s`. `r` is "clamped" before use
 * (mask 0x0FFFFFFC...0FFFFFFC0FFFFFFF...) per spec.
 *
 * Implemented on ten 13-bit limbs over GF(2^130 - 5): each product of
 * limbs stays below 2^30 and each column of ten below 2^34, so every value
 * is exact in a double. The computation is a fixed sequence of arithmetic
 * (the final reduction by mask): no branch and no index depends on the key
 * or the message. `verify` compares the tags by XOR-accumulation over all
 * 16 bytes. Callers MUST NOT reuse `(r, s)` keys across messages.
 */

/**
 * Public shape returned by `poly1305.factory()`.
 * @typedef {object} Poly1305API
 * @property {string} name Module name (`'poly1305'`).
 * @property {(key: Uint8Array, msg: Uint8Array) => (Uint8Array|false)} mac
 *   Compute the 16-byte tag, or `false` on invalid key.
 * @property {(key: Uint8Array, msg: Uint8Array, tag: Uint8Array) => boolean} verify
 *   Constant-time tag verification.
 */

export const poly1305 = {
    name: 'poly1305',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: [],

    /** @returns {Poly1305API} */
    factory() {

        // GF(2^130 - 5) on ten 13-bit limbs (RFC 8439 §2.5 arithmetic): a
        // product of limbs stays below 2^30 and a column of ten below 2^34,
        // exact in doubles; 2^130 ≡ 5 folds the high columns back. Every
        // step is a fixed sequence of arithmetic — no branch and no index
        // depends on the key or the message.

        /** Bits [13i, 13i + 13) of the little-endian bytes `b` at `o`, 19 bytes readable. */
        function _limb(b, o, i) {
            const bit = 13 * i, at = o + (bit >> 3);
            return ((b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) >>> (bit & 7)) & 0x1fff;
        }

        const _blk = new Uint8Array(19);    // one block (+ the 2^(8n) bit) and 2 spare bytes
        const _h = new Float64Array(10), _r = new Float64Array(10), _d = new Float64Array(10);   // h, r, scratch

        /** Two full carry passes: every limb below 2^13, h below 2^130. */
        function _carryFull(h) {
            for (let pass = 0; pass < 2; pass++) {
                let c = 0;
                for (let i = 0; i < 10; i++) {
                    const v = h[i] + c;
                    c = Math.floor(v / 8192);
                    h[i] = v - c * 8192;
                }
                h[0] += 5 * c;
            }
            let c = 0;
            for (let i = 0; i < 10; i++) {
                const v = h[i] + c;
                c = Math.floor(v / 8192);
                h[i] = v - c * 8192;
            }
        }

        /**
         * Compute the Poly1305 tag of `msg` under a 32-byte one-time key.
         * @param {Uint8Array} key 32-byte one-time key (`r || s`).
         * @param {Uint8Array} msg Message.
         * @returns {Uint8Array|false} 16-byte tag, or `false` on a bad key.
         */
        function mac(key, msg) {
            if (!(key instanceof Uint8Array) || key.length !== 32) {
                console.warn('[crypto] INVALID: poly1305: key must be 32 bytes');
                return false;
            }
            // r, clamped (RFC 8439 §2.5): the top 4 bits of bytes 3, 7, 11, 15
            // and the low 2 bits of bytes 4, 8, 12 cleared.
            const rb = new Uint8Array(19);
            rb.set(key.subarray(0, 16));
            rb[3] &= 15; rb[7] &= 15; rb[11] &= 15; rb[15] &= 15;
            rb[4] &= 252; rb[8] &= 252; rb[12] &= 252;
            for (let i = 0; i < 10; i++) { _r[i] = _limb(rb, 0, i); _h[i] = 0; }

            const len = msg.length;
            // h = (h + block) · r mod p per 16-byte block, unrolled on locals
            // (generated: the same integer products as a loop over the limbs).
            let h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0, h8 = 0, h9 = 0;
            const r0 = _r[0], r1 = _r[1], r2 = _r[2], r3 = _r[3], r4 = _r[4], r5 = _r[5], r6 = _r[6], r7 = _r[7], r8 = _r[8], r9 = _r[9];
            const s1 = 5 * r1, s2 = 5 * r2, s3 = 5 * r3, s4 = 5 * r4, s5 = 5 * r5, s6 = 5 * r6, s7 = 5 * r7, s8 = 5 * r8, s9 = 5 * r9;
            const full = len - (len % 16);
            for (let off = 0; off < full; off += 16) {
                // A whole block: its limbs straight from `msg`, + 2^128.
                h0 += (((msg[off + 0]) | (msg[off + 1] << 8) | (msg[off + 2] << 16)) & 0x1fff);
                h1 += ((((msg[off + 1]) | (msg[off + 2] << 8) | (msg[off + 3] << 16)) >>> 5) & 0x1fff);
                h2 += ((((msg[off + 3]) | (msg[off + 4] << 8) | (msg[off + 5] << 16)) >>> 2) & 0x1fff);
                h3 += ((((msg[off + 4]) | (msg[off + 5] << 8) | (msg[off + 6] << 16)) >>> 7) & 0x1fff);
                h4 += ((((msg[off + 6]) | (msg[off + 7] << 8) | (msg[off + 8] << 16)) >>> 4) & 0x1fff);
                h5 += ((((msg[off + 8]) | (msg[off + 9] << 8) | (msg[off + 10] << 16)) >>> 1) & 0x1fff);
                h6 += ((((msg[off + 9]) | (msg[off + 10] << 8) | (msg[off + 11] << 16)) >>> 6) & 0x1fff);
                h7 += ((((msg[off + 11]) | (msg[off + 12] << 8) | (msg[off + 13] << 16)) >>> 3) & 0x1fff);
                h8 += (((msg[off + 13]) | (msg[off + 14] << 8) | (msg[off + 15] << 16)) & 0x1fff);
                h9 += ((((msg[off + 14]) | (msg[off + 15] << 8) | (1 << 16)) >>> 5) & 0x1fff);
                const d0 = h0 * r0 + h1 * s9 + h2 * s8 + h3 * s7 + h4 * s6 + h5 * s5 + h6 * s4 + h7 * s3 + h8 * s2 + h9 * s1;
                const d1 = h0 * r1 + h1 * r0 + h2 * s9 + h3 * s8 + h4 * s7 + h5 * s6 + h6 * s5 + h7 * s4 + h8 * s3 + h9 * s2;
                const d2 = h0 * r2 + h1 * r1 + h2 * r0 + h3 * s9 + h4 * s8 + h5 * s7 + h6 * s6 + h7 * s5 + h8 * s4 + h9 * s3;
                const d3 = h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * s9 + h5 * s8 + h6 * s7 + h7 * s6 + h8 * s5 + h9 * s4;
                const d4 = h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0 + h5 * s9 + h6 * s8 + h7 * s7 + h8 * s6 + h9 * s5;
                const d5 = h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1 + h5 * r0 + h6 * s9 + h7 * s8 + h8 * s7 + h9 * s6;
                const d6 = h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2 + h5 * r1 + h6 * r0 + h7 * s9 + h8 * s8 + h9 * s7;
                const d7 = h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3 + h5 * r2 + h6 * r1 + h7 * r0 + h8 * s9 + h9 * s8;
                const d8 = h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4 + h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * s9;
                const d9 = h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5 + h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
                let c = 0, v;
                v = d0 + c; c = Math.floor(v / 8192); h0 = v - c * 8192;
                v = d1 + c; c = Math.floor(v / 8192); h1 = v - c * 8192;
                v = d2 + c; c = Math.floor(v / 8192); h2 = v - c * 8192;
                v = d3 + c; c = Math.floor(v / 8192); h3 = v - c * 8192;
                v = d4 + c; c = Math.floor(v / 8192); h4 = v - c * 8192;
                v = d5 + c; c = Math.floor(v / 8192); h5 = v - c * 8192;
                v = d6 + c; c = Math.floor(v / 8192); h6 = v - c * 8192;
                v = d7 + c; c = Math.floor(v / 8192); h7 = v - c * 8192;
                v = d8 + c; c = Math.floor(v / 8192); h8 = v - c * 8192;
                v = d9 + c; c = Math.floor(v / 8192); h9 = v - c * 8192;
                v = h0 + 5 * c; c = Math.floor(v / 8192); h0 = v - c * 8192; h1 += c;
            }
            if (full < len) {
                // The last, partial block: copied, 0x01 after it, zeros up to 17 bytes.
                const n = len - full;
                _blk.fill(0);
                for (let i = 0; i < n; i++) _blk[i] = msg[full + i];
                _blk[n] = 1;
                h0 += _limb(_blk, 0, 0);
                h1 += _limb(_blk, 0, 1);
                h2 += _limb(_blk, 0, 2);
                h3 += _limb(_blk, 0, 3);
                h4 += _limb(_blk, 0, 4);
                h5 += _limb(_blk, 0, 5);
                h6 += _limb(_blk, 0, 6);
                h7 += _limb(_blk, 0, 7);
                h8 += _limb(_blk, 0, 8);
                h9 += _limb(_blk, 0, 9);
                const d0 = h0 * r0 + h1 * s9 + h2 * s8 + h3 * s7 + h4 * s6 + h5 * s5 + h6 * s4 + h7 * s3 + h8 * s2 + h9 * s1;
                const d1 = h0 * r1 + h1 * r0 + h2 * s9 + h3 * s8 + h4 * s7 + h5 * s6 + h6 * s5 + h7 * s4 + h8 * s3 + h9 * s2;
                const d2 = h0 * r2 + h1 * r1 + h2 * r0 + h3 * s9 + h4 * s8 + h5 * s7 + h6 * s6 + h7 * s5 + h8 * s4 + h9 * s3;
                const d3 = h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * s9 + h5 * s8 + h6 * s7 + h7 * s6 + h8 * s5 + h9 * s4;
                const d4 = h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0 + h5 * s9 + h6 * s8 + h7 * s7 + h8 * s6 + h9 * s5;
                const d5 = h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1 + h5 * r0 + h6 * s9 + h7 * s8 + h8 * s7 + h9 * s6;
                const d6 = h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2 + h5 * r1 + h6 * r0 + h7 * s9 + h8 * s8 + h9 * s7;
                const d7 = h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3 + h5 * r2 + h6 * r1 + h7 * r0 + h8 * s9 + h9 * s8;
                const d8 = h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4 + h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * s9;
                const d9 = h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5 + h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
                let c = 0, v;
                v = d0 + c; c = Math.floor(v / 8192); h0 = v - c * 8192;
                v = d1 + c; c = Math.floor(v / 8192); h1 = v - c * 8192;
                v = d2 + c; c = Math.floor(v / 8192); h2 = v - c * 8192;
                v = d3 + c; c = Math.floor(v / 8192); h3 = v - c * 8192;
                v = d4 + c; c = Math.floor(v / 8192); h4 = v - c * 8192;
                v = d5 + c; c = Math.floor(v / 8192); h5 = v - c * 8192;
                v = d6 + c; c = Math.floor(v / 8192); h6 = v - c * 8192;
                v = d7 + c; c = Math.floor(v / 8192); h7 = v - c * 8192;
                v = d8 + c; c = Math.floor(v / 8192); h8 = v - c * 8192;
                v = d9 + c; c = Math.floor(v / 8192); h9 = v - c * 8192;
                v = h0 + 5 * c; c = Math.floor(v / 8192); h0 = v - c * 8192; h1 += c;
            }
            const h = _h;
            h[0] = h0;
            h[1] = h1;
            h[2] = h2;
            h[3] = h3;
            h[4] = h4;
            h[5] = h5;
            h[6] = h6;
            h[7] = h7;
            h[8] = h8;
            h[9] = h9;

            // h mod p: h < 2^130 after the carries, so h - p = h + 5 - 2^130 is
            // kept, by mask, exactly when h + 5 reaches 2^130.
            _carryFull(h);
            const g = _d;
            let c = 5;
            for (let i = 0; i < 10; i++) {
                const v = h[i] + c;
                c = v >>> 13;
                g[i] = v & 0x1fff;
            }
            const keep = -c;                   // -1: take g, 0: keep h
            for (let i = 0; i < 10; i++) h[i] = (h[i] & ~keep) | (g[i] & keep);

            // (h mod 2^128) + s, little-endian.
            const out = new Uint8Array(16);
            let acc = 0, bits = 0, k = 0;
            for (let i = 0; i < 10 && k < 16; i++) {
                acc += h[i] * Math.pow(2, bits);
                bits += 13;
                while (bits >= 8 && k < 16) {
                    out[k++] = acc & 255;
                    acc = Math.floor(acc / 256);
                    bits -= 8;
                }
            }
            let carry = 0;
            for (let i = 0; i < 16; i++) {
                const v = out[i] + key[16 + i] + carry;
                out[i] = v & 255;
                carry = v >> 8;
            }
            for (let i = 0; i < 10; i++) { _h[i] = 0; _r[i] = 0; _d[i] = 0; }
            return out;
        }

        /**
         * Constant-time tag verification. The comparison XOR-accumulates all
         * 16 bytes with no early exit, so the running time depends only on
         * the (fixed) tag length, not on which byte mismatches first.
         *
         * `mac` is itself a fixed sequence of limb arithmetic (see the
         * module header).
         *
         * @param {Uint8Array} key  32-byte one-time key.
         * @param {Uint8Array} msg  Message.
         * @param {Uint8Array} tag  Candidate 16-byte tag.
         * @returns {boolean}       true iff `tag` matches the recomputed MAC.
         */
        function verify(key, msg, tag) {
            if (!(tag instanceof Uint8Array) || tag.length !== 16) return false;
            const expected = mac(key, msg);
            if (expected === false) return false;
            let diff = 0;
            for (let i = 0; i < 16; i++) diff |= expected[i] ^ tag[i];
            return diff === 0;
        }

        return { name: 'poly1305', mac, verify };
    }
};
