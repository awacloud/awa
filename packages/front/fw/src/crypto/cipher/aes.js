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
 * The T-table path's tables are precomputed once at factory time; the
 * constant-time path reads none of them.
 *
 * ⚠️ **Cache-timing caveat** - the **default** `api.fn` path is the
 * constant-time implementation: a bitsliced AES (8 bit-planes of 16 lanes,
 * SubBytes as the GF(2^8) inverse computed on the planes), with no table read
 * and no branch depending on the key or the state - the key expansion
 * included. This is secure-by-default against Bernstein-style cache-timing
 * attacks (Bernstein 2005, « Cache-timing attacks on AES ») at a cost of
 * about 11× the time of the T-table path (about 1.3 us a block on Bun / Node).
 *
 * The fast T-table scheduler (5 T-tables, ~5 KB, one indexed lookup per
 * SubBytes ∘ MixColumns) is **opt-in** via `aes.ttable.fn(...)`. It is
 * **NOT constant-time**: an attacker observing cache-miss latencies in a
 * shared cache (cloud VM, serverless, hyper-thread) can recover the AES key.
 * Use it only when the execution environment is not shared/hostile, or prefer
 * WebCrypto (`crypto.subtle` - hardware AES-NI when available) for bulk work.
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
 * @property {AesKeyScheduler} fn Constant-time (bitsliced) key scheduler — **default**.
 * @property {{ fn: AesKeyScheduler }} ttable T-table key scheduler (fast, NOT constant-time, opt-in).
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

        // ── Constant-time core: bitsliced AES ──
        //
        // The 16 state bytes live as 8 bit-planes: plane k holds bit k of every
        // byte, byte i (FIPS 197 column-major index, row + 4 * column) in bit i
        // of a 16-bit lane mask. Every step is a fixed sequence of bitwise
        // operations on the planes — no table read and no branch depends on a
        // key or data byte, so the memory access pattern and the instruction
        // stream are the same for every input (the property the T-table path
        // lacks, Bernstein 2005).
        //
        //   SubBytes      inverse in GF(2^8) (x^254: 4 products, 7 squares,
        //                 reduction by x^8 + x^4 + x^3 + x + 1), then the affine map
        //   ShiftRows     per row, a rotation of that row's lanes
        //   MixColumns    r = c ^ t ^ xtime(c ^ c'), c' the next row, t the column sum
        //   InvMixColumns MixColumns^3 (MixColumns has order 4)
        //
        // Derived from FIPS 197 alone; checked against the tables on every input.

        const LANES = 0xffff;

        // GF(2^8) product and square of every lane, unrolled (out may alias an input):
        // the 64 partial products, then x^k = x^(k-4) + x^(k-5) + x^(k-7) + x^(k-8)
        // folds the degrees 14..8 down. Generated, then checked on every input.
        function _bsMul(a, b, out) {
            const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7];
            const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7];
            let p0 = (a0 & b0);
            let p1 = (a0 & b1) ^ (a1 & b0);
            let p2 = (a0 & b2) ^ (a1 & b1) ^ (a2 & b0);
            let p3 = (a0 & b3) ^ (a1 & b2) ^ (a2 & b1) ^ (a3 & b0);
            let p4 = (a0 & b4) ^ (a1 & b3) ^ (a2 & b2) ^ (a3 & b1) ^ (a4 & b0);
            let p5 = (a0 & b5) ^ (a1 & b4) ^ (a2 & b3) ^ (a3 & b2) ^ (a4 & b1) ^ (a5 & b0);
            let p6 = (a0 & b6) ^ (a1 & b5) ^ (a2 & b4) ^ (a3 & b3) ^ (a4 & b2) ^ (a5 & b1) ^ (a6 & b0);
            let p7 = (a0 & b7) ^ (a1 & b6) ^ (a2 & b5) ^ (a3 & b4) ^ (a4 & b3) ^ (a5 & b2) ^ (a6 & b1) ^ (a7 & b0);
            let p8 = (a1 & b7) ^ (a2 & b6) ^ (a3 & b5) ^ (a4 & b4) ^ (a5 & b3) ^ (a6 & b2) ^ (a7 & b1);
            let p9 = (a2 & b7) ^ (a3 & b6) ^ (a4 & b5) ^ (a5 & b4) ^ (a6 & b3) ^ (a7 & b2);
            let p10 = (a3 & b7) ^ (a4 & b6) ^ (a5 & b5) ^ (a6 & b4) ^ (a7 & b3);
            let p11 = (a4 & b7) ^ (a5 & b6) ^ (a6 & b5) ^ (a7 & b4);
            let p12 = (a5 & b7) ^ (a6 & b6) ^ (a7 & b5);
            let p13 = (a6 & b7) ^ (a7 & b6);
            let p14 = (a7 & b7);
            p10 ^= p14; p9 ^= p14; p7 ^= p14; p6 ^= p14;
            p9 ^= p13; p8 ^= p13; p6 ^= p13; p5 ^= p13;
            p8 ^= p12; p7 ^= p12; p5 ^= p12; p4 ^= p12;
            p7 ^= p11; p6 ^= p11; p4 ^= p11; p3 ^= p11;
            p6 ^= p10; p5 ^= p10; p3 ^= p10; p2 ^= p10;
            p5 ^= p9; p4 ^= p9; p2 ^= p9; p1 ^= p9;
            p4 ^= p8; p3 ^= p8; p1 ^= p8; p0 ^= p8;
            out[0] = p0;
            out[1] = p1;
            out[2] = p2;
            out[3] = p3;
            out[4] = p4;
            out[5] = p5;
            out[6] = p6;
            out[7] = p7;
        }

        function _bsSq(a, out) {
            const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7];
            out[0] = a0 ^ a4 ^ a6;
            out[1] = a4 ^ a6 ^ a7;
            out[2] = a1 ^ a5;
            out[3] = a4 ^ a5 ^ a6 ^ a7;
            out[4] = a2 ^ a4 ^ a7;
            out[5] = a5 ^ a6;
            out[6] = a3 ^ a5;
            out[7] = a6 ^ a7;
        }

        const _x2 = new Int32Array(8), _x3 = new Int32Array(8), _x12 = new Int32Array(8), _acc = new Int32Array(8), _aff = new Int32Array(8);

        /** x^254 of every lane (the inverse, 0 for 0), in place. */
        function _bsInv(x) {
            _bsSq(x, _x2);                 // x^2
            _bsMul(_x2, x, _x3);           // x^3
            _bsSq(_x3, _x12);              // x^6
            _bsSq(_x12, _x12);             // x^12
            _bsMul(_x12, _x3, _acc);       // x^15
            _bsSq(_acc, _acc);             // x^30
            _bsSq(_acc, _acc);             // x^60
            _bsSq(_acc, _acc);             // x^120
            _bsSq(_acc, _acc);             // x^240
            _bsMul(_acc, _x12, _acc);      // x^252
            _bsMul(_acc, _x2, x);          // x^254
        }

        /** SubBytes on the planes, in place: inverse, then the affine map (c = 0x63). */
        function _bsSubPlanes(s) {
            _bsInv(s);
            for (let k = 0; k < 8; k++) _aff[k] = s[k];
            for (let k = 0; k < 8; k++) {
                s[k] = _aff[k] ^ _aff[(k + 4) & 7] ^ _aff[(k + 5) & 7] ^ _aff[(k + 6) & 7] ^ _aff[(k + 7) & 7]
                    ^ ((0x63 >> k) & 1 ? LANES : 0);
            }
        }

        /** InvSubBytes on the planes, in place: the inverse affine map (d = 0x05), then the inverse. */
        function _bsInvSubPlanes(s) {
            for (let k = 0; k < 8; k++) _aff[k] = s[k];
            for (let k = 0; k < 8; k++) {
                s[k] = _aff[(k + 2) & 7] ^ _aff[(k + 5) & 7] ^ _aff[(k + 7) & 7] ^ ((0x05 >> k) & 1 ? LANES : 0);
            }
            _bsInv(s);
        }

        /** ShiftRows (inv = false) or InvShiftRows: row r's lanes rotated by r columns. */
        function _bsShift(s, inv) {
            for (let k = 0; k < 8; k++) {
                const x = s[k];
                let y = x & 0x1111;
                for (let r = 1; r < 4; r++) {
                    const m = 0x1111 << r;
                    const v = x & m;
                    const n = 4 * r;
                    const rot = inv ? (v << n) | (v >>> (16 - n)) : (v >>> n) | (v << (16 - n));
                    y |= rot & m;
                }
                s[k] = y;
            }
        }

        const _c1 = new Int32Array(8), _u = new Int32Array(8);

        /** MixColumns on the planes, in place. */
        function _bsMix(s) {
            for (let k = 0; k < 8; k++) {
                const x = s[k];
                const x1 = ((x >>> 1) & 0x7777) | ((x & 0x1111) << 3);   // the next row's byte, per column
                const x2 = ((x1 >>> 1) & 0x7777) | ((x1 & 0x1111) << 3);
                const x3 = ((x2 >>> 1) & 0x7777) | ((x2 & 0x1111) << 3);
                _c1[k] = x ^ x1 ^ x2 ^ x3;                                // t: the column sum
                _u[k] = x ^ x1;
            }
            const u = _u;
            // s ^ t ^ xtime(u); xtime: shift up a bit, fold bit 8 back as 0x1b
            const xt0 = u[7], xt1 = u[0] ^ u[7], xt2 = u[1], xt3 = u[2] ^ u[7];
            const xt4 = u[3] ^ u[7], xt5 = u[4], xt6 = u[5], xt7 = u[6];
            s[0] ^= _c1[0] ^ xt0; s[1] ^= _c1[1] ^ xt1; s[2] ^= _c1[2] ^ xt2; s[3] ^= _c1[3] ^ xt3;
            s[4] ^= _c1[4] ^ xt4; s[5] ^= _c1[5] ^ xt5; s[6] ^= _c1[6] ^ xt6; s[7] ^= _c1[7] ^ xt7;
        }

        function _bsInvMix(s) { _bsMix(s); _bsMix(s); _bsMix(s); }

        /** 4 big-endian words → planes (out). */
        function _bsPack(words, out) {
            out.fill(0);
            for (let c = 0; c < 4; c++) {
                const w = words[c];
                for (let r = 0; r < 4; r++) {
                    const byte = (w >>> (24 - 8 * r)) & 0xff;
                    const lane = r + 4 * c;
                    for (let k = 0; k < 8; k++) out[k] |= ((byte >>> k) & 1) << lane;
                }
            }
        }

        /** Planes → 4 big-endian words (signed, as the T-table path returns them). */
        function _bsUnpack(s) {
            const out = [0, 0, 0, 0];
            for (let c = 0; c < 4; c++) {
                let w = 0;
                for (let r = 0; r < 4; r++) {
                    const lane = r + 4 * c;
                    let byte = 0;
                    for (let k = 0; k < 8; k++) byte |= ((s[k] >>> lane) & 1) << k;
                    w |= byte << (24 - 8 * r);
                }
                out[c] = w;
            }
            return out;
        }

        const _state = new Int32Array(8);

        /** SubWord of the key expansion, through the bitsliced S-box (column 0's lanes). */
        function _subWordCT(w) {
            _bsPack([w, 0, 0, 0], _state);
            _bsSubPlanes(_state);
            return _bsUnpack(_state)[0];
        }

        /**
         * FIPS 197 §5.2 key expansion with a constant-time SubWord.
         * @param {number[]} key 4/6/8 words
         * @returns {number[]} 4 * (Nr + 1) words
         */
        function _expandKeyCT(key) {
            const n = key.length;
            const w = key.slice(0);
            let rcon = 1;   // public: the round constants depend on nothing secret
            for (let i = n; i < 4 * n + 28; i++) {
                let tmp = w[i - 1];
                if (i % n === 0) {
                    tmp = _subWordCT(tmp << 8 | tmp >>> 24) ^ rcon << 24;
                    rcon = rcon << 1 ^ (rcon >> 7) * 283;
                } else if (n === 8 && i % n === 4) {
                    tmp = _subWordCT(tmp);
                }
                w[i] = w[i - n] ^ tmp;
            }
            return w;
        }

        /** The table-driven expansion (`ttable`'s), kept for the equality test. */
        function _expandKeyTable(key) {
            const sbox = tables[0][4];
            const n = key.length;
            const w = key.slice(0);
            let rcon = 1;
            for (let i = n; i < 4 * n + 28; i++) {
                let tmp = w[i - 1];
                if (i % n === 0 || (n === 8 && i % n === 4)) {
                    tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16 ^ sbox[tmp >> 8 & 255] << 8 ^ sbox[tmp & 255];
                    if (i % n === 0) { tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24; rcon = rcon << 1 ^ (rcon >> 7) * 283; }
                }
                w[i] = w[i - n] ^ tmp;
            }
            return w;
        }

        /** Round keys as planes: Nr + 1 arrays of 8. */
        function _bsRoundKeys(words) {
            const rk = [];
            for (let r = 0; r < words.length / 4; r++) {
                const p = new Int32Array(8);
                _bsPack(words.slice(4 * r, 4 * r + 4), p);
                rk.push(p);
            }
            return rk;
        }

        const _addKey = (s, k) => { for (let i = 0; i < 8; i++) s[i] ^= k[i]; };

        /** One block, encrypt (dir 0) or decrypt (dir 1), on bitsliced round keys. */
        function _bsCrypt(input, dir, rk) {
            if (!input || input.length !== 4) {
                console.warn('[crypto] INVALID: aes: invalid block size');
                return false;
            }
            const s = _state;
            const nr = rk.length - 1;
            _bsPack(input, s);
            if (!dir) {
                _addKey(s, rk[0]);
                for (let r = 1; r < nr; r++) {
                    _bsSubPlanes(s); _bsShift(s, false); _bsMix(s); _addKey(s, rk[r]);
                }
                _bsSubPlanes(s); _bsShift(s, false); _addKey(s, rk[nr]);
            } else {
                _addKey(s, rk[nr]);
                for (let r = nr - 1; r >= 1; r--) {
                    _bsShift(s, true); _bsInvSubPlanes(s); _addKey(s, rk[r]); _bsInvMix(s);
                }
                _bsShift(s, true); _bsInvSubPlanes(s); _addKey(s, rk[0]);
            }
            return _bsUnpack(s);
        }

        const _bsEncrypt = (input, rk) => _bsCrypt(input, 0, rk);

        const api = {};

        /**
         * Schedule an AES key — **constant-time default**.
         *
         * Encrypt / decrypt run through the bitsliced core: no table read and
         * no branch depends on the key or the data, the key expansion
         * included (its SubWord goes through the same core). About 11x the
         * T-table path's time per block — about 1.3 us — against
         * cache-timing attacks the T-table path does not resist (shared caches:
         * cloud VM, serverless, hyper-threads). For bulk work on a trusted host,
         * `api.ttable.fn` is faster; WebCrypto (AES-NI) faster still.
         *
         * @param {Array} input_key  4/6/8 32-bit words (AES-128/192/256).
         * @param {boolean} [full=true]  If false, only `encrypt` is returned.
         * @returns {{encrypt:Function, decrypt?:Function}|false}
         */
        api.fn = function (input_key, full = true) {
            const keyLen = input_key.length;
            if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
                console.warn('[crypto] INVALID: aes: invalid key size');
                return false;
            }
            const rk = _bsRoundKeys(_expandKeyCT(input_key));
            const ret = { encrypt(data) { return _bsCrypt(data, 0, rk); } };
            if (full) ret.decrypt = (data) => _bsCrypt(data, 1, rk);
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

        // Test-only internals, in the internal slot (core/internal.js): not API.
        Object.defineProperty(api, Symbol.for('@awacloud/fw/internal'), { value: {
            sbox: tables[0][4],
            sboxInv: tables[1][4],
            /** Bitsliced SubBytes of 16 bytes (lane i = byte i). */
            bsSub(bytes) {
                const p = new Int32Array(8);
                for (let i = 0; i < 16; i++) for (let k = 0; k < 8; k++) p[k] |= ((bytes[i] >>> k) & 1) << i;
                _bsSubPlanes(p);
                return Uint8Array.from({ length: 16 }, (_, i) => { let v = 0; for (let k = 0; k < 8; k++) v |= ((p[k] >>> i) & 1) << k; return v; });
            },
            /** Bitsliced InvSubBytes of 16 bytes. */
            bsInvSub(bytes) {
                const p = new Int32Array(8);
                for (let i = 0; i < 16; i++) for (let k = 0; k < 8; k++) p[k] |= ((bytes[i] >>> k) & 1) << i;
                _bsInvSubPlanes(p);
                return Uint8Array.from({ length: 16 }, (_, i) => { let v = 0; for (let k = 0; k < 8; k++) v |= ((p[k] >>> i) & 1) << k; return v; });
            },
            expandKey: _expandKeyCT,
            expandKeyTable: _expandKeyTable,
            bsEncrypt: _bsEncrypt,
        } });

        return /** @type {AesAPI} */ (/** @type {any} */ (api));
    }
};
