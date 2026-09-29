// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AES (FIPS-197) low-level block cipher.
 *
 * Schedules a key for AES-128/192/256 encryption (and optionally decryption)
 * and exposes a single-block primitive. Use a cipher mode (e.g. CTR) for
 * bulk data - this module never handles padding or IVs.
 *
 * Origin: the T-table precomputation, key schedule and T-table block path are
 * adapted from the Stanford JavaScript Crypto Library (SJCL), BSD-2-Clause
 * (SJCL is dual-licensed BSD-2-Clause OR GPL-2.0-or-later; the BSD-2-Clause
 * terms are retained, see third-party/NOTICE-sjcl); the constant-time path,
 * the ESM factory, JSDoc, tests and every later change are this project's own
 * work. See docs/dev/provenance.md.
 *
 * S-box and MixColumns tables are precomputed once at factory time.
 *
 * ⚠️ **Cache-timing caveat** - the **default** `api.fn` path is now the
 * constant-time implementation: SubBytes runs through a masked-lookup S-box
 * (256 uniform reads per byte) so the memory access pattern is independent of
 * the AES key/state. This is secure-by-default against Bernstein-style
 * cache-timing attacks (Bernstein 2005, « Cache-timing attacks on AES ») at
 * a cost of ~50-100× the throughput of the T-table path.
 *
 * The fast T-table scheduler (5 T-tables, ~5 KB, one indexed lookup per
 * SubBytes ∘ MixColumns) is **opt-in** via `aes.ttable.fn(...)`. It is
 * **NOT constant-time**: an attacker observing cache-miss latencies in a
 * shared cache (cloud VM, serverless, hyper-thread) can recover the AES key.
 * Use it only when the execution environment is not shared/hostile, or prefer
 * WebCrypto (`crypto.subtle` - hardware AES-NI when available) for bulk work.
 *
 * `aes.bitsliced.fn(...)` is retained as a **deprecated alias** of `aes.fn`
 * (both are constant-time now) for back-compat; prefer `aes.fn` directly.
 *
 * Block primitive returns `false` on invalid block length - every caller
 * mode (CBC/CTR/GCM/CMAC/KW) treats a `false` result as failure (early
 * return). Do not chain raw `crypt()` output without checking.
 *
 */

/**
 * A scheduled AES cipher instance: single-block encrypt (and optionally
 * decrypt) over a 4-word (128-bit) block. Returns `false` on invalid block
 * length.
 * @typedef {object} AesCipher
 * @property {(data: number[]) => (number[]|false)} encrypt Encrypt one 4-word block.
 * @property {(data: number[]) => (number[]|false)} [decrypt] Decrypt one 4-word block (present only when scheduled with `full=true`).
 */

/**
 * Key-schedule function producing an {@link AesCipher} (or `false` on invalid
 * key size: must be 4/6/8 32-bit words for AES-128/192/256).
 * @typedef {(input_key: number[], full?: boolean) => (AesCipher|false)} AesKeyScheduler
 */

/**
 * Object returned by `aes.factory()`.
 * @typedef {object} AesAPI
 * @property {AesKeyScheduler} fn Constant-time (masked-lookup) key scheduler — **default**.
 * @property {{ fn: AesKeyScheduler }} ttable T-table key scheduler (fast, NOT constant-time, opt-in).
 * @property {{ fn: AesKeyScheduler }} bitsliced Deprecated alias of `fn`.
 */

export const aes = {
    name: 'aes',
    version: '1.0.0',
    type: 'fw.crypto.cipher',
    dependencies: [],

    /** @returns {AesAPI} */
    factory() {

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
         * ⚠️ NOT constant-time - see module-level cache-timing caveat. Callers
         * MUST check for `false` (invalid block length) before using the
         * result.
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

        // ── Constant-time S-box (Iteration F2 of the FIPS 140-3 upgrade plan) ──
        //
        // The opt-in `crypt` (T-table) path uses 5 T-tables (~5 KB) for
        // SubBytes ∘ MixColumns. T-table lookups leak the AES state via
        // cache-timing : an attacker observing cache-miss latencies can
        // recover the key (cf. Bernstein 2005 « Cache-timing attacks on AES »).
        //
        // `_sboxCT(b, sbox)` performs a *constant-time* table read by scanning
        // all 256 entries and masking them with `b == i ? 0xFF : 0x00`. The
        // mask is derived without branching : `diff = i XOR b`, then
        // `isZero = ((diff - 1) >>> 8) & 1` returns 1 iff `diff === 0`
        // (since `diff ∈ [0, 255]` ; only `diff === 0` borrows into bit 8 of
        // `diff - 1`). Yields a uniform memory access pattern independent of `b`.
        //
        // Cost : ~1024 ops per S-box (vs 1 T-table lookup) → AES-128 block ~50×
        // slower, AES-256 block ~70× slower. Acceptable for opt-in use cases :
        // long-lived secret keys in shared-cache environments (cloud VMs,
        // serverless), low-volume cryptographic operations (key wrapping,
        // signature scheme inner blocks). This is the **default** `aes.fn`
        // path; the fast T-table path is opt-in via `aes.ttable.fn(key)`.
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

        // Inverse MixColumns column.
        function _invMixColumnCT(c0, c1, c2, c3) {
            // First apply Mixcolumns once, then forward MixColumns 3 more
            // times - equivalent to the inverse via tower-field expansion :
            //   InvMixCol(c) = MixCol(c) ⊕ xtime²(c⊕c²) ⊕ xtime(...).
            // We implement directly via the standard 0x0e/0x0b/0x0d/0x09 GF
            // multiplications.
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
            // `dir` only branches encrypt vs decrypt (cf. `if (enc)`
            // below) ; the same schedule is used for both.
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

        const api = {};

        /**
         * Schedule an AES key — **constant-time default**.
         *
         * Block encrypt/decrypt are routed through `_cryptCT`, which performs
         * SubBytes via a **masked-lookup** S-box (256 uniform reads per byte)
         * instead of T-table indexed lookups. This neutralises Bernstein-style
         * cache-timing leaks on the AES key, making this path secure by
         * default in shared-cache environments (cloud VM, serverless,
         * hyper-thread).
         *
         * Cost : ~50-100× slower than the opt-in `api.ttable.fn`. NOT a
         * substitute for AES-NI (use WebCrypto when available - see
         * aes.acvp.md F2). For high-throughput work on a trusted host, opt in
         * to the fast T-table path via `api.ttable.fn`.
         *
         * The key schedule itself uses the T-table SubBytes during expansion :
         * acceptable because key expansion runs once per session, not per
         * block, so per-block cache-timing on the schedule is irrelevant.
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
         * Schedule an AES key — **opt-in fast T-table path**.
         *
         * ⚠️ NOT constant-time. Block ops are routed through `crypt(...)` with
         * the precomputed 5 T-tables: one indexed lookup per SubBytes ∘
         * MixColumns. T-table lookups leak the AES state via cache-timing
         * (Bernstein 2005); use this only on a trusted, non-shared host or for
         * bulk work where WebCrypto is unavailable. Output is byte-identical to
         * `api.fn` on all vectors.
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

        // Deprecated alias of `api.fn` (both are constant-time now). Kept one
        // cycle for back-compat; prefer `aes.fn` directly.
        api.bitsliced = { fn: api.fn };

        return /** @type {AesAPI} */ (/** @type {any} */ (api));
    }
};
