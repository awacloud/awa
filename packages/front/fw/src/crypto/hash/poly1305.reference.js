// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Logical reference of `poly1305.js` (RFC 8439 §2.5 Poly1305
 * one-time MAC).
 *
 * Taken from `git show 6ffb948ef^:packages/front/fw/src/crypto/hash/poly1305.js`,
 * the `BigInt` evaluation of RFC 8439 §2.5.1: `r` clamped,
 * `acc = ((acc + block) * r) % (2^130 - 5)` per 16-byte block with the `0x01`
 * byte appended, `tag = (acc + s) mod 2^128`, little-endian. `verify`
 * recomputes the tag and compares the 16 bytes.
 *
 * **Not constant-time**: `BigInt` arithmetic runs in value-dependent time in
 * every JS engine (variable-size limbs, short-circuits). This file is the
 * logical form, a test oracle for its co-located differential test, never shipped;
 * the fast module computes on fixed-size limbs instead.
 *
 * Adapted: the `factory()` body is wrapped in `createPoly1305Reference()`, and
 * the returned object carries `mac` and `verify` only (the parent's
 * `name: 'poly1305'` member is not a descriptor this file may carry). The
 * validation (a key other than 32 bytes or a tag other than 16 bytes gives
 * `false`) is the parent's, identical to the fast module's today.
 *
 * Kept in the git repository only: excluded from the npm tarball, the exports
 * map, the declaration tree and the registry.
 */

/**
 * Build the reference Poly1305 (the parent's `factory()` body).
 * @returns {{
 *   mac: (key: Uint8Array, msg: Uint8Array) => (Uint8Array|false),
 *   verify: (key: Uint8Array, msg: Uint8Array, tag: Uint8Array) => boolean
 * }} `mac` gives the 16-byte tag (`false` on a bad key); `verify` recomputes
 *   and compares it.
 */
export function createPoly1305Reference() {

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
     * Tag verification: recompute the tag and XOR-accumulate the 16 bytes,
     * no early exit (the `BigInt` `mac` itself is not constant-time).
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

    return { mac, verify };
}
