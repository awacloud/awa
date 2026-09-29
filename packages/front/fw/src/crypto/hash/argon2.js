// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Argon2id - RFC 9106.
 *
 * Memory-hard password hashing function selected by the Password Hashing
 * Competition. Argon2id (type=2) combines the data-independent addressing
 * of Argon2i (resistant to side-channel timing attacks) for the first half
 * of the first pass with the data-dependent addressing of Argon2d (resistant
 * to GPU/ASIC tradeoffs) thereafter.
 *
 * Parameters per RFC 9106 §3.1:
 *   - p (parallelism / lanes), 1..2^24-1
 *   - τ (tag length), 4..2^32-1 bytes
 *   - m (memory in KiB), 8*p..2^32-1
 *   - t (iterations), 1..2^32-1
 *   - v (version) = 0x13 (Argon2 v1.3)
 *   - y (type) = 2 for Argon2id
 *
 * Public API:
 *   hash({ password, salt, time, memory, parallelism, tagLen,
 *          secret?, ad? }) → Uint8Array of length tagLen, or false on error.
 *
 * **Recommended parameters (RFC 9106 §4):**
 *   - First-choice profile (interactive login, RAM-rich servers):
 *       t=1, p=4, m=2^21 KiB (2 GiB), tagLen=32.
 *   - Second-choice profile (memory-constrained, embedded):
 *       t=3, p=4, m=2^16 KiB (64 MiB), tagLen=32.
 *   - Avoid `m < 2^15` (32 MiB) for password storage; below that level
 *     Argon2 loses its memory-hardness margin against GPU/ASIC attackers.
 *
 */

/**
 * Options accepted by `argon2.hash`.
 * @typedef {object} Argon2Options
 * @property {Uint8Array} password
 * @property {Uint8Array} salt Must be ≥ 8 bytes.
 * @property {number} time Iterations t (≥ 1).
 * @property {number} memory Memory cost m in KiB (≥ 8*p).
 * @property {number} parallelism Lanes p (≥ 1).
 * @property {number} tagLen Output length in bytes (≥ 4).
 * @property {Uint8Array} [secret] Optional key.
 * @property {Uint8Array} [ad] Optional associated data.
 */

/**
 * Public shape returned by `argon2.factory()`.
 * @typedef {object} Argon2API
 * @property {(opts: Argon2Options) => (Uint8Array|false)} hash
 *   Argon2id hash → tag bytes of length `tagLen`, or `false` on error.
 * @property {() => false} hashD Argon2d - explicitly rejected (warns, returns `false`).
 * @property {() => false} hashI Argon2i - explicitly rejected (warns, returns `false`).
 * @property {{ Hp: (input: Uint8Array, outLen: number) => Uint8Array, compress: (out: Uint32Array, X: Uint32Array, Y: Uint32Array) => void }} _internal
 *   Internal primitives exposed for KAT tests / debug only.
 */

import { blake2b } from './blake2b.js';

export const argon2 = {
    name: 'argon2',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['blake2b'],
    deps: [blake2b],

    /** @returns {Argon2API} */
    factory(blake2b) {

        // Argon2 type IDs (RFC 9106 §3.1): d=0, i=1 — both intentionally rejected; only Argon2id is implemented. Kept for spec reference.
        const TYPE_ARGON2ID = 2;
        const VERSION = 0x13;
        const SYNC_POINTS = 4; // 4 segments per lane per pass.
        const BLOCK_SIZE = 1024; // bytes
        // QWORDS_PER_BLOCK = 128 (1024-byte block / 8, RFC 9106) — unused here, kept for spec reference.

        // ── 32-bit LE writers ────────────────────────────────────────

        function _u32le(out, off, v) {
            out[off]     = v & 0xff;
            out[off + 1] = (v >>> 8) & 0xff;
            out[off + 2] = (v >>> 16) & 0xff;
            out[off + 3] = (v >>> 24) & 0xff;
        }

        // ── BLAKE2b helpers ──────────────────────────────────────────

        function _blake2b(msg, outLen) {
            return blake2b.hash(msg, outLen);
        }

        // RFC 9106 §3.3 - variable-length BLAKE2b H'.
        //   if T <= 64: H'_T(A) = BLAKE2b(LE32(T) || A, T)
        //   else:
        //     V_1 = BLAKE2b(LE32(T) || A, 64)
        //     V_{i+1} = BLAKE2b(V_i, 64)  for i = 1..r-2 where r = ceil(T/32) - 2
        //     V_r = BLAKE2b(V_{r-1}, T - 32*r) where r = ceil(T/32) - 2 + 1
        //   Actually simpler: out = first 32 bytes of V_1, V_2, ..., V_{r-1}
        //   then V_r is full last chunk.
        function _Hp(input, outLen) {
            const lenBytes = new Uint8Array(4);
            _u32le(lenBytes, 0, outLen);
            const seed = new Uint8Array(4 + input.length);
            seed.set(lenBytes, 0);
            seed.set(input, 4);

            if (outLen <= 64) {
                return _blake2b(seed, outLen);
            }
            // RFC 9106 §3.3: r = ceil(T/32) - 2 hashes contribute first 32 bytes,
            // then V_{r+1} of size T-32r bytes is appended in full.
            const out = new Uint8Array(outLen);
            const r = Math.ceil(outLen / 32) - 2;
            let v = _blake2b(seed, 64);
            out.set(v.subarray(0, 32), 0);
            for (let i = 1; i < r; i++) {
                v = _blake2b(v, 64);
                out.set(v.subarray(0, 32), i * 32);
            }
            const lastLen = outLen - 32 * r;
            const last = _blake2b(v, lastLen);
            out.set(last, 32 * r);
            return out;
        }

        // ── 64-bit (hi, lo) helpers in pairs (Uint32Array layout) ────

        // Convention: arr[ai] = LOW 32 bits, arr[ai+1] = HIGH 32 bits.
        // This matches the little-endian byte layout of Argon2 blocks.
        function _add64Inline(arr, ai, bLo, bHi) {
            const lo = (arr[ai] + bLo) >>> 0;
            const carry = lo < arr[ai] ? 1 : 0;
            arr[ai]     = lo;
            arr[ai + 1] = (arr[ai + 1] + bHi + carry) >>> 0;
        }

        function _ror64InPlace(arr, ai, n) {
            const lo = arr[ai];
            const hi = arr[ai + 1];
            let nl, nh;
            if (n === 32) { nl = hi; nh = lo; }
            else if (n < 32) {
                nl = (lo >>> n) | (hi << (32 - n));
                nh = (hi >>> n) | (lo << (32 - n));
            } else {
                const m = n - 32;
                nl = (hi >>> m) | (lo << (32 - m));
                nh = (lo >>> m) | (hi << (32 - m));
            }
            arr[ai]     = nl >>> 0;
            arr[ai + 1] = nh >>> 0;
        }

        // Argon2 fBlaMka G mixing (RFC 9106 §3.5):
        //   a = a + b + 2 * trunc32(a) * trunc32(b)
        //   d = ROTR64(d ^ a, 32)
        //   c = c + d + 2 * trunc32(c) * trunc32(d)
        //   b = ROTR64(b ^ c, 24)
        //   a = a + b + 2 * trunc32(a) * trunc32(b)
        //   d = ROTR64(d ^ a, 16)
        //   c = c + d + 2 * trunc32(c) * trunc32(d)
        //   b = ROTR64(b ^ c, 63)
        function _fBla(arr, a, b) {
            // Layout: arr[i] = LO, arr[i+1] = HI.
            const aLo = arr[a];
            const bLo = arr[b];
            const prod = BigInt(aLo) * BigInt(bLo) * 2n;
            const pLo = Number(prod & 0xffffffffn);
            const pHi = Number((prod >> 32n) & 0xffffffffn);
            // a += b
            _add64Inline(arr, a, arr[b], arr[b + 1]);
            // a += prod
            _add64Inline(arr, a, pLo, pHi);
        }

        function _GArgon(arr, a, b, c, d) {
            _fBla(arr, a, b);
            // d = ROTR64(d ^ a, 32)
            arr[d]     ^= arr[a];
            arr[d + 1] ^= arr[a + 1];
            _ror64InPlace(arr, d, 32);
            _fBla(arr, c, d);
            // b = ROTR64(b ^ c, 24)
            arr[b]     ^= arr[c];
            arr[b + 1] ^= arr[c + 1];
            _ror64InPlace(arr, b, 24);
            _fBla(arr, a, b);
            // d = ROTR64(d ^ a, 16)
            arr[d]     ^= arr[a];
            arr[d + 1] ^= arr[a + 1];
            _ror64InPlace(arr, d, 16);
            _fBla(arr, c, d);
            // b = ROTR64(b ^ c, 63)
            arr[b]     ^= arr[c];
            arr[b + 1] ^= arr[c + 1];
            _ror64InPlace(arr, b, 63);
        }

        // P permutation: 8 calls to G on 16 64-bit words.
        // Indices in (hi,lo) pairs are: word i → arr[i*2..i*2+1].
        function _P(arr, off) {
            const o = off;
            // Columns
            _GArgon(arr, o + 0,  o + 8,  o + 16, o + 24);
            _GArgon(arr, o + 2,  o + 10, o + 18, o + 26);
            _GArgon(arr, o + 4,  o + 12, o + 20, o + 28);
            _GArgon(arr, o + 6,  o + 14, o + 22, o + 30);
            // Diagonals
            _GArgon(arr, o + 0,  o + 10, o + 20, o + 30);
            _GArgon(arr, o + 2,  o + 12, o + 22, o + 24);
            _GArgon(arr, o + 4,  o + 14, o + 16, o + 26);
            _GArgon(arr, o + 6,  o + 8,  o + 18, o + 28);
        }

        // Compression G(X, Y):
        //   R = X XOR Y
        //   Q = P over each row (8 rows × 16 words)
        //   Z = P over each column (8 cols × 16 words)
        //   out = Z XOR R
        // Each block is 1024 bytes = 128 64-bit words = 256 32-bit halves.
        // Layout as 8x8 matrix of 16-byte cells = 8 rows × 16 64-bit words.
        function _compress(out, X, Y) {
            // R = X XOR Y, in 32-bit half view.
            const R = new Uint32Array(256);
            for (let i = 0; i < 256; i++) R[i] = X[i] ^ Y[i];
            const Q = new Uint32Array(256);
            Q.set(R);
            // Apply P to each of 8 rows. Each row = 16 64-bit words = 32 halves.
            for (let i = 0; i < 8; i++) _P(Q, i * 32);
            // Apply P to each of 8 columns. Column j = words j, j+8, j+16, ...
            // We need to gather them, run P, scatter back.
            const col = new Uint32Array(32);
            for (let j = 0; j < 8; j++) {
                // Gather: for k in 0..7, take 2 words (4 halves) from row k, columns 2j..2j+1.
                // Actually: column j (in the 8-cell row) means words 2j and 2j+1 (a 16-byte cell).
                for (let k = 0; k < 8; k++) {
                    const src = k * 32 + 2 * j * 2; // start of cell (k, j) in halves
                    col[k * 4]     = Q[src];
                    col[k * 4 + 1] = Q[src + 1];
                    col[k * 4 + 2] = Q[src + 2];
                    col[k * 4 + 3] = Q[src + 3];
                }
                _P(col, 0);
                for (let k = 0; k < 8; k++) {
                    const dst = k * 32 + 2 * j * 2;
                    Q[dst]     = col[k * 4];
                    Q[dst + 1] = col[k * 4 + 1];
                    Q[dst + 2] = col[k * 4 + 2];
                    Q[dst + 3] = col[k * 4 + 3];
                }
            }
            for (let i = 0; i < 256; i++) out[i] = Q[i] ^ R[i];
        }

        // ── block / view helpers ─────────────────────────────────────

        function _blockView(B, idx) {
            // Returns a Uint32Array view (256 halves) over block idx of B.
            return new Uint32Array(B.buffer, B.byteOffset + idx * BLOCK_SIZE, 256);
        }

        function _blockBytes(B, idx) {
            return new Uint8Array(B.buffer, B.byteOffset + idx * BLOCK_SIZE, BLOCK_SIZE);
        }

        // Argon2i index generator - produces JI1 || JI2 for 128 references in
        // a single segment. RFC 9106 §3.4.1.2.
        function _genIndexBlock(pass, lane, slice, m_, t_, type, segment, idxInSeg) {
            // Build "input" block (1024 bytes):
            //   pass||lane||slice||m||t||type||counter, padded with zeros.
            const inBlock = new Uint8Array(BLOCK_SIZE);
            const view = new DataView(inBlock.buffer);
            view.setUint32(0,  pass,    true);
            view.setUint32(8,  lane,    true);
            view.setUint32(16, slice,   true);
            view.setUint32(24, m_,      true);
            view.setUint32(32, t_,      true);
            view.setUint32(40, type,    true);
            view.setUint32(48, idxInSeg, true);
            // Compress G(zero, G(zero, inBlock)) → addresses block.
            const zero = new Uint32Array(256);
            const tmp1 = new Uint32Array(256);
            const tmp2 = new Uint32Array(256);
            const inView = new Uint32Array(inBlock.buffer);
            _compress(tmp1, zero, inView);
            _compress(tmp2, zero, tmp1);
            return tmp2; // Uint32Array(256) of addresses (128 64-bit pseudo-rands).
        }

        // ── main hash ─────────────────────────────────────────────────

        /**
         * @param {Object} opts
         * @param {Uint8Array} opts.password
         * @param {Uint8Array} opts.salt - must be ≥ 8 bytes.
         * @param {number} opts.time - iterations t (≥ 1).
         * @param {number} opts.memory - memory cost m in KiB (≥ 8*p).
         * @param {number} opts.parallelism - lanes p (≥ 1).
         * @param {number} opts.tagLen - output length in bytes (≥ 4).
         * @param {Uint8Array} [opts.secret] - optional 0..2^32-1 byte key.
         * @param {Uint8Array} [opts.ad] - optional associated data.
         * @returns {Uint8Array|false}
         */
        function hash(opts) {
            const password = opts.password;
            const salt     = opts.salt;
            const t_       = opts.time;
            const p        = opts.parallelism;
            const tagLen   = opts.tagLen;
            const secret   = opts.secret || new Uint8Array(0);
            const ad       = opts.ad || new Uint8Array(0);
            let m_         = opts.memory;

            if (!password || !salt || salt.length < 8) {
                console.warn('[crypto] INVALID: argon2: password and ≥8-byte salt required');
                return false;
            }
            if (t_ < 1 || p < 1 || tagLen < 4) {
                console.warn('[crypto] INVALID: argon2: invalid t/p/tagLen');
                return false;
            }
            if (m_ < 8 * p) m_ = 8 * p;

            // m' = floor(m / (4*p)) * (4*p)
            const mPrime = Math.floor(m_ / (4 * p)) * (4 * p);
            const q      = mPrime / p;          // blocks per lane
            const segLen = q / SYNC_POINTS;     // blocks per segment (must be int)

            // ── H0 (RFC 9106 §3.2) ───────────────────────────────────
            // H0 = BLAKE2b(LE32(p) || LE32(τ) || LE32(m) || LE32(t) ||
            //              LE32(v) || LE32(y) || LE32(|P|) || P ||
            //              LE32(|S|) || S || LE32(|K|) || K ||
            //              LE32(|X|) || X, 64)
            const parts = [
                _le32(p), _le32(tagLen), _le32(m_), _le32(t_),
                _le32(VERSION), _le32(TYPE_ARGON2ID),
                _le32(password.length), password,
                _le32(salt.length), salt,
                _le32(secret.length), secret,
                _le32(ad.length), ad
            ];
            const cleanHeader = _concat(parts);
            const H0 = _blake2b(cleanHeader, 64);

            // ── allocate memory matrix B ─────────────────────────────
            const B = new Uint8Array(mPrime * BLOCK_SIZE);

            // Initial blocks: B[i][0] and B[i][1] for each lane i.
            const seedExt = new Uint8Array(64 + 8);
            seedExt.set(H0, 0);
            for (let i = 0; i < p; i++) {
                _u32le(seedExt, 64, 0);
                _u32le(seedExt, 68, i);
                _blockBytes(B, i * q + 0).set(_Hp(seedExt, BLOCK_SIZE));
                _u32le(seedExt, 64, 1);
                _blockBytes(B, i * q + 1).set(_Hp(seedExt, BLOCK_SIZE));
            }

            // ── fill remaining blocks ────────────────────────────────
            const tmpOut = new Uint32Array(256);
            for (let pass = 0; pass < t_; pass++) {
                for (let slice = 0; slice < SYNC_POINTS; slice++) {
                    // Argon2id uses data-INDEPENDENT addressing in pass=0, slice=0,1.
                    const dataIndep = (TYPE_ARGON2ID === TYPE_ARGON2ID)
                        && pass === 0 && slice < 2;

                    for (let lane = 0; lane < p; lane++) {
                        // Index lookup state.
                        let addrBlock = null;
                        let addrCounter = 0;
                        if (dataIndep) {
                            addrCounter = 1;
                            addrBlock = _genIndexBlock(pass, lane, slice, m_, t_, TYPE_ARGON2ID, segLen, addrCounter);
                        }

                        // Starting offset within this segment.
                        let startOff = (pass === 0 && slice === 0) ? 2 : 0;

                        for (let i = startOff; i < segLen; i++) {
                            const curIdxInLane = slice * segLen + i;
                            const curIdx = lane * q + curIdxInLane;
                            const prevIdx = lane * q + ((curIdxInLane === 0) ? (q - 1) : (curIdxInLane - 1));

                            // Pseudo-random for index selection.
                            let pr1, pr2;
                            if (dataIndep) {
                                if (i !== startOff && (i % 128) === 0) {
                                    addrCounter++;
                                    addrBlock = _genIndexBlock(pass, lane, slice, m_, t_, TYPE_ARGON2ID, segLen, addrCounter);
                                }
                                const k = (i % 128) * 2; // 64-bit word index → 2 halves
                                pr1 = addrBlock[k] >>> 0;     // low 32 = J1
                                pr2 = addrBlock[k + 1] >>> 0; // high 32 = J2
                            } else {
                                const prevView = _blockView(B, prevIdx);
                                pr1 = prevView[0] >>> 0; // low 32 of word 0
                                pr2 = prevView[1] >>> 0; // high 32 of word 0
                            }

                            // Determine reference set size.
                            const refLane = (pass === 0 && slice === 0) ? lane : (pr2 % p);

                            // Reference area size W (RFC 9106 §3.4.1.1).
                            let refAreaSize;
                            if (pass === 0) {
                                if (slice === 0) {
                                    refAreaSize = i - 1;
                                } else if (refLane === lane) {
                                    refAreaSize = slice * segLen + i - 1;
                                } else {
                                    refAreaSize = slice * segLen - (i === 0 ? 1 : 0);
                                }
                            } else {
                                if (refLane === lane) {
                                    refAreaSize = q - segLen + i - 1;
                                } else {
                                    refAreaSize = q - segLen - (i === 0 ? 1 : 0);
                                }
                            }
                            // Compute relative offset (RFC 9106 §3.4.1.2.2).
                            // x = (J1^2) >> 32; y = (refAreaSize * x) >> 32; relPos = refAreaSize - 1 - y.
                            const x = Number((BigInt(pr1) * BigInt(pr1)) >> 32n);
                            const y = Number((BigInt(refAreaSize) * BigInt(x)) >> 32n);
                            const relPos = refAreaSize - 1 - y;

                            // Starting position of reference area.
                            let startPos;
                            if (pass !== 0) {
                                startPos = (slice === SYNC_POINTS - 1) ? 0 : ((slice + 1) * segLen);
                            } else {
                                startPos = 0;
                            }
                            const absPosInLane = (startPos + relPos) % q;
                            const refIdx = refLane * q + absPosInLane;

                            // Compute new block.
                            const prevView = _blockView(B, prevIdx);
                            const refView  = _blockView(B, refIdx);
                            _compress(tmpOut, prevView, refView);

                            const curView = _blockView(B, curIdx);
                            if (pass === 0) {
                                curView.set(tmpOut);
                            } else {
                                // Subsequent passes XOR into existing block.
                                for (let k = 0; k < 256; k++) curView[k] ^= tmpOut[k];
                            }
                        }
                    }
                }
            }

            // ── final tag ────────────────────────────────────────────
            // C = B[0][q-1] XOR B[1][q-1] XOR ... XOR B[p-1][q-1]
            const C = new Uint8Array(BLOCK_SIZE);
            C.set(_blockBytes(B, 0 * q + (q - 1)));
            for (let lane = 1; lane < p; lane++) {
                const last = _blockBytes(B, lane * q + (q - 1));
                for (let k = 0; k < BLOCK_SIZE; k++) C[k] ^= last[k];
            }
            return _Hp(C, tagLen);
        }

        function _le32(n) {
            const b = new Uint8Array(4);
            _u32le(b, 0, n);
            return b;
        }

        function _concat(parts) {
            let total = 0;
            for (const p of parts) total += p.length;
            const out = new Uint8Array(total);
            let o = 0;
            for (const p of parts) { out.set(p, o); o += p.length; }
            return out;
        }

        // ── Iteration G4 - Argon2d / Argon2i explicit reject ─────────────
        //
        // RFC 9106 §4 distinguishes three variants:
        //  - Argon2d  : data-dependent addressing → vulnerable to cache-timing
        //               (a local attacker on the same machine can recover
        //               the password by observing memory access patterns).
        //               Avoid for password hashing in multi-tenant environments
        //               (cloud, containers, browsers).
        //  - Argon2i  : data-independent addressing → resists cache-timing
        //               but offers less GPU/ASIC resistance. Considered
        //               sub-optimal alone (cf. Alwen-Blocki 2016 attacks).
        //  - Argon2id : hybrid (pass 1 = Argon2i, passes 2+ = Argon2d).
        //               This is the recommended choice per RFC 9106 §4 and
        //               OWASP / IETF for general password hashing.
        //
        // This module only exposes `hash()` (Argon2id, type=2). To pre-empt
        // any confusion, two exports `hashD` and `hashI` are added that
        // explicitly refuse.
        function hashD() {
            console.warn('[crypto] UNSAFE: argon2: Argon2d is vulnerable to cache-timing attacks (data-dependent addressing). Use hash() (Argon2id) per RFC 9106 §4.');
            return false;
        }
        function hashI() {
            console.warn('[crypto] DEPRECATED: argon2: Argon2i alone is sub-optimal (Alwen-Blocki 2016 - reduced GPU/ASIC resistance). Use hash() (Argon2id) per RFC 9106 §4.');
            return false;
        }

        return /** @type {Argon2API} */ (/** @type {any} */ ({
            hash,
            // Argon2d / Argon2i - explicit reject (cf. RFC 9106 §4).
            hashD, hashI,
            // Internal primitives - exposed for KAT tests / debug only.
            // `_internal.*` convention shared with gcm/cmac/rsa/random/etc.
            _internal: { Hp: _Hp, compress: _compress }
        }));
    }
};
