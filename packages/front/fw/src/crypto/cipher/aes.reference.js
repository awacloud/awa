// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Logical reference of `aes.js`: the constant-time round AES the
 * bitsliced core replaced, taken from
 * `git show 240fc703a^:packages/front/fw/src/crypto/cipher/aes.js`.
 *
 * Commit `240fc703a` ("make the constant-time AES default bitsliced") was a
 * structural change: the byte-wise constant-time AES below (masked-lookup
 * S-box scanning all 256 entries per byte, branchless xtime MixColumns) gave
 * way to a bitsliced one. This file keeps the parent's code as the readable
 * form the fast module is tested against, plus the loop form of the two
 * generated bit-plane GF(2^8) functions (`_bsMul` / `_bsSq` of `aes.js`).
 *
 * Origin: as in `aes.js`, the T-table precomputation, key schedule and
 * T-table block path are adapted from the Stanford JavaScript Crypto Library
 * (SJCL), BSD-2-Clause (see third-party/NOTICE-sjcl); the rest is this
 * project's own work.
 *
 * Adapted from the parent: the factory body is wrapped in
 * `createAesReference()`; the deprecated `bitsliced` alias, which master
 * removed, is deleted; `subBytes` / `invSubBytes` are two-line adapters over
 * the parent's own `_sboxCT`; `gfMulPlanes` / `gfSqPlanes` are new, the loop
 * form of the generated code. No loop is unrolled, nothing is optimised.
 *
 * Kept in the git repository only: excluded from the npm tarball, the
 * exports map, the declaration tree and the registry. Imported by its own
 * differential test alone.
 */

/**
 * Key scheduler of the reference (same contract as `aes.fn`).
 * @typedef {(input_key: number[], full?: boolean) => ({encrypt: Function, decrypt?: Function}|false)} AesRefScheduler
 */

/**
 * Object returned by `createAesReference()`.
 * @typedef {object} AesReference
 * @property {AesRefScheduler} fn Constant-time round AES (masked-lookup S-box).
 * @property {{ fn: AesRefScheduler }} ttable T-table key scheduler (the same code as `aes.ttable.fn`).
 * @property {(bytes: Uint8Array) => Uint8Array} subBytes Constant-time S-box of every byte.
 * @property {(bytes: Uint8Array) => Uint8Array} invSubBytes Constant-time inverse S-box of every byte.
 * @property {(a: Int32Array, b: Int32Array, out: Int32Array) => void} gfMulPlanes Bit-plane GF(2^8) product, loop form (out may alias an input).
 * @property {(a: Int32Array, out: Int32Array) => void} gfSqPlanes Bit-plane GF(2^8) square, loop form (out may alias a).
 */

/**
 * Build the logical AES reference (the parent's `aes.factory()` body).
 * @returns {AesReference}
 */
export function createAesReference() {

    const tables = [[[], [], [], [], []], [[], [], [], [], []]];

    (function precompute() {
        const encTable = tables[0];
        const decTable = tables[1];
        const sbox = encTable[4];
        const sboxInv = decTable[4];
        const d = [];
        const th = [];
        let x, xInv, x2, x4, x8, s, tEnc, tDec, i;

        for (i = 0; i < 256; i++) {
            th[(d[i] = i << 1 ^ (i >> 7) * 283) ^ i] = i;
        }

        for (x = xInv = 0; !sbox[x]; x ^= x2 || 1, xInv = th[xInv] || 1) {
            s = xInv ^ xInv << 1 ^ xInv << 2 ^ xInv << 3 ^ xInv << 4;
            s = s >> 8 ^ s & 255 ^ 99;
            sbox[x] = s;
            sboxInv[s] = x;

            x8 = d[x4 = d[x2 = d[x]]];
            tDec = x8 * 0x1010101 ^ x4 * 0x10001 ^ x2 * 0x101 ^ x * 0x1010100;
            tEnc = d[s] * 0x101 ^ s * 0x1010100;

            for (i = 0; i < 4; i++) {
                encTable[i][x] = tEnc = tEnc << 24 ^ tEnc >>> 8;
                decTable[i][s] = tDec = tDec << 24 ^ tDec >>> 8;
            }
        }

        for (i = 0; i < 5; i++) {
            encTable[i] = encTable[i].slice(0);
            decTable[i] = decTable[i].slice(0);
        }
    })();

    /**
     * Single-block AES encrypt/decrypt (T-table path).
     *
     * NOT constant-time. Callers MUST check for `false` (invalid block
     * length) before using the result.
     *
     * @param {number[]} input 4 × 32-bit words (16 bytes).
     * @param {0|1} dir 0 = encrypt, 1 = decrypt.
     * @param {Array} keys [encKey, decKey] schedule pair.
     * @param {Array} _tables Precomputed T-tables (encTable, decTable).
     * @returns {number[]|false} 4-word block or `false` on bad input length.
     */
    function crypt(input, dir, keys, _tables) {
        if (input.length !== 4) {
            console.warn('[crypto] INVALID: aes: invalid block size');
            return false;
        }

        const key = keys[dir];
        let a = input[0] ^ key[0];
        let b = input[dir ? 3 : 1] ^ key[1];
        let c = input[2] ^ key[2];
        let d = input[dir ? 1 : 3] ^ key[3];
        let a2, b2, c2;

        const nInnerRounds = key.length / 4 - 2;
        let kIndex = 4;
        const out = [0, 0, 0, 0];
        const table = _tables[dir];

        const t0 = table[0];
        const t1 = table[1];
        const t2 = table[2];
        const t3 = table[3];
        const sbox = table[4];

        for (let i = 0; i < nInnerRounds; i++) {
            a2 = t0[a >>> 24] ^ t1[b >> 16 & 255] ^ t2[c >> 8 & 255] ^ t3[d & 255] ^ key[kIndex];
            b2 = t0[b >>> 24] ^ t1[c >> 16 & 255] ^ t2[d >> 8 & 255] ^ t3[a & 255] ^ key[kIndex + 1];
            c2 = t0[c >>> 24] ^ t1[d >> 16 & 255] ^ t2[a >> 8 & 255] ^ t3[b & 255] ^ key[kIndex + 2];
            d = t0[d >>> 24] ^ t1[a >> 16 & 255] ^ t2[b >> 8 & 255] ^ t3[c & 255] ^ key[kIndex + 3];
            kIndex += 4;
            a = a2;
            b = b2;
            c = c2;
        }

        for (let i = 0; i < 4; i++) {
            out[dir ? 3 & -i : i] =
                sbox[a >>> 24] << 24 ^
                sbox[b >> 16 & 255] << 16 ^
                sbox[c >> 8 & 255] << 8 ^
                sbox[d & 255] ^
                key[kIndex++];
            a2 = a;
            a = b;
            b = c;
            c = d;
            d = a2;
        }

        return out;
    }

    // ── Constant-time S-box ──
    //
    // `_sboxCT(b, sbox)` performs a *constant-time* table read by scanning
    // all 256 entries and masking them with `b == i ? 0xFF : 0x00`. The
    // mask is derived without branching : `diff = i XOR b`, then
    // `isZero = ((diff - 1) >>> 8) & 1` returns 1 iff `diff === 0`
    // (since `diff ∈ [0, 255]` ; only `diff === 0` borrows into bit 8 of
    // `diff - 1`). Yields a uniform memory access pattern independent of `b`.
    function _sboxCT(b, sbox) {
        let result = 0;
        const bx = b & 0xff;
        for (let i = 0; i < 256; i++) {
            // mask = 0xFF if i == bx, else 0x00 - branchless.
            // ((diff - 1) >>> 8) & 1 == 1 iff diff == 0 (since diff in [0, 255]).
            const diff = (i ^ bx) >>> 0;
            const isZero = ((diff - 1) >>> 8) & 1;
            const mask = (-isZero) & 0xff;
            result |= sbox[i] & mask;
        }
        return result & 0xff;
    }

    // GF(2^8) multiplication-by-2 (xtime) - already constant-time
    // (bitwise ops only ; `(b >> 7) * 283` produces 0 or 283 without
    // branching since `b >> 7` is 0 or 1).
    function _xtime(b) {
        return ((b << 1) ^ ((b >> 7) * 0x1b)) & 0xff;
    }

    // MixColumns on a single column (4 bytes), constant-time.
    function _mixColumnCT(c0, c1, c2, c3) {
        const t = c0 ^ c1 ^ c2 ^ c3;
        const r0 = c0 ^ t ^ _xtime(c0 ^ c1);
        const r1 = c1 ^ t ^ _xtime(c1 ^ c2);
        const r2 = c2 ^ t ^ _xtime(c2 ^ c3);
        const r3 = c3 ^ t ^ _xtime(c3 ^ c0);
        return [r0, r1, r2, r3];
    }

    // Inverse MixColumns column, through the standard 0x0e/0x0b/0x0d/0x09
    // GF multiplications.
    function _invMixColumnCT(c0, c1, c2, c3) {
        const m02 = _xtime;
        const m04 = (b) => m02(m02(b));
        const m08 = (b) => m02(m04(b));
        const m09 = (b) => m08(b) ^ b;
        const m0b = (b) => m08(b) ^ m02(b) ^ b;
        const m0d = (b) => m08(b) ^ m04(b) ^ b;
        const m0e = (b) => m08(b) ^ m04(b) ^ m02(b);
        return [
            (m0e(c0) ^ m0b(c1) ^ m0d(c2) ^ m09(c3)) & 0xff,
            (m09(c0) ^ m0e(c1) ^ m0b(c2) ^ m0d(c3)) & 0xff,
            (m0d(c0) ^ m09(c1) ^ m0e(c2) ^ m0b(c3)) & 0xff,
            (m0b(c0) ^ m0d(c1) ^ m09(c2) ^ m0e(c3)) & 0xff,
        ];
    }

    // Constant-time AES encrypt/decrypt over a 4-word (16-byte) block.
    // Operates byte-per-byte through the standard FIPS 197 algorithm using
    // `_sboxCT` for SubBytes ; ShiftRows is a permutation, MixColumns uses
    // `_xtime` (branchless), AddRoundKey is XOR.
    function _cryptCT(input, dir, keys) {
        if (input.length !== 4) {
            console.warn('[crypto] INVALID: aes: invalid block size');
            return false;
        }
        const sbox    = tables[0][4];
        const sboxInv = tables[1][4];
        const sb = dir ? sboxInv : sbox;
        const enc = !dir;

        // Unpack input (4 × 32-bit big-endian words) → 16 bytes (column-major).
        // Per FIPS 197 §3.4 : state[i, j] = input[i + 4*j].
        const state = new Uint8Array(16);
        for (let j = 0; j < 4; j++) {
            const w = input[j];
            state[j * 4    ] = (w >>> 24) & 0xff;
            state[j * 4 + 1] = (w >>> 16) & 0xff;
            state[j * 4 + 2] = (w >>>  8) & 0xff;
            state[j * 4 + 3] =  w         & 0xff;
        }

        // Build a byte-level **straight** FIPS 197 §5.3 key schedule from
        // `keys[0]` (the encryption schedule). The decrypt path uses the
        // standard straight-inverse algorithm (InvShiftRows / InvSubBytes
        // / AddRoundKey / InvMixColumns) per FIPS 197 §5.3 - no need for
        // the `decKey` pre-processed by InvMixColumns⁻¹ via T-tables.
        const encWords = keys[0];
        const Nr = encWords.length / 4 - 1;   // 10/12/14 for AES-128/192/256
        const ks = new Uint8Array(encWords.length * 4);
        for (let i = 0; i < encWords.length; i++) {
            ks[i * 4    ] = (encWords[i] >>> 24) & 0xff;
            ks[i * 4 + 1] = (encWords[i] >>> 16) & 0xff;
            ks[i * 4 + 2] = (encWords[i] >>>  8) & 0xff;
            ks[i * 4 + 3] =  encWords[i]         & 0xff;
        }

        if (enc) {
            // AddRoundKey(0)
            for (let i = 0; i < 16; i++) state[i] ^= ks[i];
            // Rounds 1..Nr-1
            for (let r = 1; r < Nr; r++) {
                // SubBytes
                for (let i = 0; i < 16; i++) state[i] = _sboxCT(state[i], sb);
                // ShiftRows : row k cyclic-shift by k positions.
                const tmp = new Uint8Array(state);
                for (let row = 0; row < 4; row++) {
                    for (let col = 0; col < 4; col++) {
                        state[col * 4 + row] = tmp[((col + row) & 3) * 4 + row];
                    }
                }
                // MixColumns
                for (let col = 0; col < 4; col++) {
                    const o = col * 4;
                    const m = _mixColumnCT(state[o], state[o + 1], state[o + 2], state[o + 3]);
                    state[o    ] = m[0];
                    state[o + 1] = m[1];
                    state[o + 2] = m[2];
                    state[o + 3] = m[3];
                }
                // AddRoundKey(r)
                for (let i = 0; i < 16; i++) state[i] ^= ks[r * 16 + i];
            }
            // Final round (no MixColumns)
            for (let i = 0; i < 16; i++) state[i] = _sboxCT(state[i], sb);
            {
                const tmp = new Uint8Array(state);
                for (let row = 0; row < 4; row++) {
                    for (let col = 0; col < 4; col++) {
                        state[col * 4 + row] = tmp[((col + row) & 3) * 4 + row];
                    }
                }
            }
            for (let i = 0; i < 16; i++) state[i] ^= ks[Nr * 16 + i];
        } else {
            // AddRoundKey(Nr)
            for (let i = 0; i < 16; i++) state[i] ^= ks[Nr * 16 + i];
            // Rounds Nr-1..1
            for (let r = Nr - 1; r >= 1; r--) {
                // InvShiftRows : row k cyclic-shift by -k positions.
                const tmp = new Uint8Array(state);
                for (let row = 0; row < 4; row++) {
                    for (let col = 0; col < 4; col++) {
                        state[col * 4 + row] = tmp[((col - row + 4) & 3) * 4 + row];
                    }
                }
                // InvSubBytes
                for (let i = 0; i < 16; i++) state[i] = _sboxCT(state[i], sb);
                // AddRoundKey(r)
                for (let i = 0; i < 16; i++) state[i] ^= ks[r * 16 + i];
                // InvMixColumns
                for (let col = 0; col < 4; col++) {
                    const o = col * 4;
                    const m = _invMixColumnCT(state[o], state[o + 1], state[o + 2], state[o + 3]);
                    state[o    ] = m[0];
                    state[o + 1] = m[1];
                    state[o + 2] = m[2];
                    state[o + 3] = m[3];
                }
            }
            // Final inverse round (no InvMixColumns)
            {
                const tmp = new Uint8Array(state);
                for (let row = 0; row < 4; row++) {
                    for (let col = 0; col < 4; col++) {
                        state[col * 4 + row] = tmp[((col - row + 4) & 3) * 4 + row];
                    }
                }
            }
            for (let i = 0; i < 16; i++) state[i] = _sboxCT(state[i], sb);
            for (let i = 0; i < 16; i++) state[i] ^= ks[i];
        }

        // Pack 16 bytes back to 4 × 32-bit words.
        const out = [0, 0, 0, 0];
        for (let j = 0; j < 4; j++) {
            out[j] = (state[j * 4] << 24) | (state[j * 4 + 1] << 16) |
                     (state[j * 4 + 2] << 8) | state[j * 4 + 3];
        }
        return out;
    }

    // ── Bit-plane GF(2^8), loop form ──
    //
    // The logical form of the generated `_bsMul` / `_bsSq` of `aes.js`: plane
    // k holds bit k of every lane. The 64 partial products a_i·b_j land on
    // plane i + j (15 planes), then x^k = x^(k-4) + x^(k-5) + x^(k-7) + x^(k-8)
    // (reduction by x^8 + x^4 + x^3 + x + 1) folds the degrees 14..8 down.
    // Both inputs are read in full before `out` is written, so `out` may
    // alias an input.
    function _gfMulPlanes(a, b, out) {
        const p = new Int32Array(15);
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) p[i + j] ^= a[i] & b[j];
        }
        for (let k = 14; k >= 8; k--) {
            p[k - 4] ^= p[k];
            p[k - 5] ^= p[k];
            p[k - 7] ^= p[k];
            p[k - 8] ^= p[k];
        }
        for (let k = 0; k < 8; k++) out[k] = p[k];
    }

    const api = {};

    /**
     * Schedule an AES key — the parent's constant-time default.
     *
     * Block encrypt/decrypt are routed through `_cryptCT`, which performs
     * SubBytes via a **masked-lookup** S-box (256 uniform reads per byte).
     * The key schedule itself uses the table SubBytes during expansion, as
     * in the parent.
     *
     * @param {Array} input_key  4/6/8 32-bit words (AES-128/192/256).
     * @param {boolean} [full=true]  If false, only the encryption schedule is built.
     * @returns {{encrypt:Function, decrypt?:Function}|false}
     */
    api.fn = function (input_key, full = true) {
        const keyLen = input_key.length;
        if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
            console.warn('[crypto] INVALID: aes: invalid key size');
            return false;
        }
        // Build the standard FIPS 197 §5.2 key schedule. `_cryptCT`
        // only reads `keys[0]` (straight encKey) - no `decKey`
        // pre-processed by InvMixColumns⁻¹, so the inverse T-table
        // step present in `api.ttable.fn` is not needed.
        const sbox = tables[0][4];
        const encKey = input_key.slice(0);
        let rcon = 1, i, tmp;
        for (i = keyLen; i < 4 * keyLen + 28; i++) {
            tmp = encKey[i - 1];
            if (i % keyLen === 0 || (keyLen === 8 && i % keyLen === 4)) {
                tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16
                    ^ sbox[tmp >>  8 & 255] <<  8 ^ sbox[tmp        & 255];
                if (i % keyLen === 0) {
                    tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24;
                    rcon = rcon << 1 ^ (rcon >> 7) * 283;
                }
            }
            encKey[i] = encKey[i - keyLen] ^ tmp;
        }
        const key = [encKey];
        const ret = { encrypt(data) { return _cryptCT(data, 0, key); } };
        if (full) ret.decrypt = (data) => _cryptCT(data, 1, key);
        return ret;
    };

    /**
     * Schedule an AES key — the T-table path (NOT constant-time), the same
     * code as `aes.ttable.fn`.
     *
     * @param {Array} input_key  Key as 4, 6 or 8 32-bit words (AES-128/192/256).
     * @param {boolean} [full=true]  If false, only the encryption schedule is built.
     * @returns {{encrypt:Function, decrypt?:Function}|false}
     */
    api.ttable = {
        fn(input_key, full = true) {
            const _tables = tables.slice();

            const sbox = _tables[0][4];
            const decTable = _tables[1];
            const keyLen = input_key.length;
            let rcon = 1;
            let i, j, tmp;

            if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
                console.warn('[crypto] INVALID: aes: invalid key size');
                return false;
            }

            const encKey = input_key.slice(0);
            const decKey = [];
            const key = [encKey, decKey];

            for (i = keyLen; i < 4 * keyLen + 28; i++) {
                tmp = encKey[i - 1];

                if (i % keyLen === 0 || (keyLen === 8 && i % keyLen === 4)) {
                    tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16 ^ sbox[tmp >> 8 & 255] << 8 ^ sbox[tmp & 255];

                    if (i % keyLen === 0) {
                        tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24;
                        rcon = rcon << 1 ^ (rcon >> 7) * 283;
                    }
                }

                encKey[i] = encKey[i - keyLen] ^ tmp;
            }

            if (full) {
                for (j = 0; i; j++, i--) {
                    tmp = encKey[j & 3 ? i : i - 4];
                    if (i <= 4 || j < 4) {
                        decKey[j] = tmp;
                    } else {
                        decKey[j] = decTable[0][sbox[tmp >>> 24]] ^
                            decTable[1][sbox[tmp >> 16 & 255]] ^
                            decTable[2][sbox[tmp >> 8 & 255]] ^
                            decTable[3][sbox[tmp & 255]];
                    }
                }
            }

            const ret = {
                encrypt(data) { return crypt(data, 0, key, _tables); }
            };
            if (full) {
                ret.decrypt = function (data) { return crypt(data, 1, key, _tables); };
            }
            return ret;
        }
    };

    // Adapters over the parent's own constant-time S-box read.
    api.subBytes = (bytes) => Uint8Array.from(bytes, (b) => _sboxCT(b, tables[0][4]));
    api.invSubBytes = (bytes) => Uint8Array.from(bytes, (b) => _sboxCT(b, tables[1][4]));

    api.gfMulPlanes = _gfMulPlanes;
    api.gfSqPlanes = (a, out) => _gfMulPlanes(a, a, out);

    return /** @type {AesReference} */ (/** @type {any} */ (api));
}
