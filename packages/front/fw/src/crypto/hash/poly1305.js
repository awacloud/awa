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
 * Implemented with `BigInt` for arithmetic over GF(2^130-5) - JS doubles
 * lose precision on the 130-bit products that arise during accumulation.
 *
 * **Constant-time caveat (BigInt)**: the tag-comparison path in `verify`
 * is constant-time by construction (XOR-accumulate over all 16 tag bytes,
 * no early exit). However, the BigInt arithmetic in `mac` itself is **not**
 * guaranteed constant-time by any JS engine - V8/SpiderMonkey internals
 * may short-circuit equality checks, allocate variable-size limbs, etc.
 * Poly1305 is specified as a one-time MAC under one-time keys, so this
 * timing exposure does not threaten unforgeability for compliant use, but
 * callers MUST NOT reuse `(r, s)` keys across messages.
 *
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

        const _P = (1n << 130n) - 5n;
        const _MASK128 = (1n << 128n) - 1n;
        const _CLAMP = 0x0ffffffc0ffffffc0ffffffc0fffffffn;

        function _bytesToBigIntLE(bytes) {
            let v = 0n;
            for (let i = bytes.length - 1; i >= 0; i--) {
                v = (v << 8n) | BigInt(bytes[i]);
            }
            return v;
        }

        function _bigIntToBytesLE(v, n) {
            const out = new Uint8Array(n);
            let x = v;
            for (let i = 0; i < n; i++) {
                out[i] = Number(x & 0xffn);
                x >>= 8n;
            }
            return out;
        }

        /**
         * Compute Poly1305(key, message).
         * @param {Uint8Array} key 32-byte one-time key.
         * @param {Uint8Array} msg Message of any length.
         * @returns {Uint8Array|false} 16-byte tag, or false on invalid input.
         */
        function mac(key, msg) {
            if (!(key instanceof Uint8Array) || key.length !== 32) {
                console.warn('[crypto] INVALID: poly1305: key must be 32 bytes');
                return false;
            }

            const r = _bytesToBigIntLE(key.subarray(0, 16)) & _CLAMP;
            const s = _bytesToBigIntLE(key.subarray(16, 32));

            let acc = 0n;
            const len = msg.length;
            let off = 0;
            while (off < len) {
                const remaining = len - off;
                const n = remaining < 16 ? remaining : 16;
                const block = new Uint8Array(17);
                for (let i = 0; i < n; i++) block[i] = msg[off + i];
                block[n] = 1;
                acc = ((acc + _bytesToBigIntLE(block)) * r) % _P;
                off += n;
            }

            const tagInt = (acc + s) & _MASK128;
            return _bigIntToBytesLE(tagInt, 16);
        }

        /**
         * Constant-time tag verification. The comparison XOR-accumulates all
         * 16 bytes with no early exit, so the running time depends only on
         * the (fixed) tag length, not on which byte mismatches first.
         *
         * Note: see the module-level "Constant-time caveat" - `mac` itself is
         * not strictly constant-time at the BigInt layer.
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
