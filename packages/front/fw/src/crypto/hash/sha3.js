// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview SHA-3 family and SHAKE XOFs (FIPS 202).
 *
 * Implements the Keccak-f[1600] permutation and exposes the four SHA-3 fixed-
 * length variants (SHA3-224/256/384/512) plus the two SHAKE extendable-output
 * functions (SHAKE128, SHAKE256) as a single sponge module.
 *
 * The state is held as a Uint32Array(50) of (lo, hi) pairs - Keccak operates
 * on 64-bit lanes but JS lacks native 64-bit integers, so each lane is split
 * into two 32-bit halves and the round transformations are unrolled
 * accordingly. Inputs are absorbed lane-by-lane (rate r = 1600 - capacity)
 * and the squeezing phase emits any number of bytes.
 *
 * Domain separation per FIPS 202 §6.1: SHA-3 appends the byte 0x06 before
 * pad10*1, SHAKE appends 0x1F. Capacity is 2× the security level (e.g. 256
 * bits for SHA3-128-equivalent, 512 bits for SHA3-256).
 *
 */

/**
 * Streaming SHA-3 / SHAKE hash instance - HMAC/HKDF/PBKDF2 compatible.
 * @typedef {object} Sha3HashInstance
 * @property {number} blockSize Block size in bits.
 * @property {(data: (string|Uint8Array|number[])) => Sha3HashInstance} update
 * @property {() => (number[]|false)} finalize Returns the digest as bitArray, or `false` on misuse.
 */

/**
 * Streaming SHA-3 / SHAKE constructor. The copy form (`new Ctor(other)`) clones
 * inner state for HMAC inner/outer caching.
 * @typedef {{ new (other?: Sha3HashInstance): Sha3HashInstance }} Sha3HashCtor
 */

/**
 * Submodule shape exposed by `sha3_*_hash` keys, compatible with
 * `hmac.js` / `hkdf.js` / `pbkdf2.js` dependency injection.
 * @typedef {object} Sha3StreamingModule
 * @property {string} name
 * @property {Sha3HashCtor} fn
 * @property {(data: (string|Uint8Array|number[])) => (number[]|false)} hash
 */

/**
 * One-shot SHA-3 hash function: data in, digest bitArray out.
 * @typedef {(data: (string|Uint8Array|number[])) => number[]} Sha3OneShot
 */

/**
 * SHAKE extendable-output function: data + requested output bit-length.
 * Returns the digest bitArray, or `false` when `outBits` is invalid.
 * @typedef {(data: (string|Uint8Array|number[]), outBits: number) => (number[]|false)} ShakeXof
 */

/**
 * Public shape returned by `sha3.factory()`.
 * @typedef {object} Sha3API
 * @property {Sha3OneShot} sha3_224 One-shot SHA3-224 (digest as bitArray).
 * @property {Sha3OneShot} sha3_256 One-shot SHA3-256 (digest as bitArray).
 * @property {Sha3OneShot} sha3_384 One-shot SHA3-384 (digest as bitArray).
 * @property {Sha3OneShot} sha3_512 One-shot SHA3-512 (digest as bitArray).
 * @property {ShakeXof} shake128 SHAKE128 XOF (variable-length output).
 * @property {ShakeXof} shake256 SHAKE256 XOF (variable-length output).
 * @property {Sha3StreamingModule} sha3_224_hash HMAC/HKDF/PBKDF2-compatible module.
 * @property {Sha3StreamingModule} sha3_256_hash HMAC/HKDF/PBKDF2-compatible module.
 * @property {Sha3StreamingModule} sha3_384_hash HMAC/HKDF/PBKDF2-compatible module.
 * @property {Sha3StreamingModule} sha3_512_hash HMAC/HKDF/PBKDF2-compatible module.
 */

import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';

export const sha3 = {
    name: 'sha3',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['bitArray', 'utf8'],
    deps: [bitArray, utf8],

    /** @returns {Sha3API} */
    factory(bitArray, utf8) {

        // Round constants (split into lo, hi 32-bit halves).
        const _RC_LO = new Uint32Array([
            0x00000001, 0x00008082, 0x0000808a, 0x80008000,
            0x0000808b, 0x80000001, 0x80008081, 0x00008009,
            0x0000008a, 0x00000088, 0x80008009, 0x8000000a,
            0x8000808b, 0x0000008b, 0x00008089, 0x00008003,
            0x00008002, 0x00000080, 0x0000800a, 0x8000000a,
            0x80008081, 0x00008080, 0x80000001, 0x80008008
        ]);
        const _RC_HI = new Uint32Array([
            0x00000000, 0x00000000, 0x80000000, 0x80000000,
            0x00000000, 0x00000000, 0x80000000, 0x80000000,
            0x00000000, 0x00000000, 0x00000000, 0x00000000,
            0x00000000, 0x80000000, 0x80000000, 0x80000000,
            0x80000000, 0x80000000, 0x00000000, 0x80000000,
            0x80000000, 0x80000000, 0x00000000, 0x80000000
        ]);

        // ρ rotation offsets (in bits) for each lane, flattened as i = x + 5*y
        // (row-major, x ∈ rows of 5). Values per FIPS 202 Table 2.
        const _R = [
             0,  1, 62, 28, 27,
            36, 44,  6, 55, 20,
             3, 10, 43, 25, 39,
            41, 45, 15, 21,  8,
            18,  2, 61, 56, 14
        ];

        // The round constants as int32 (a Uint32Array read returns the
        // halves above 2^31 as doubles under JavaScriptCore).
        const _RC_LO32 = Int32Array.from(_RC_LO), _RC_HI32 = Int32Array.from(_RC_HI);

        /**
         * Keccak-f[1600] (FIPS 202 §3.2) on int32 locals: 25 lanes as (lo, hi)
         * halves, every step of the 24 rounds unrolled (generated), the
         * rotation offsets and the π permutation resolved at generation.
         * @param {Uint32Array} s 50 words, lane i at [2i] (lo) and [2i + 1] (hi)
         */
        function _keccakF1600(s) {
            let a0l = s[0] | 0, a0h = s[1] | 0, a1l = s[2] | 0, a1h = s[3] | 0, a2l = s[4] | 0, a2h = s[5] | 0, a3l = s[6] | 0, a3h = s[7] | 0, a4l = s[8] | 0, a4h = s[9] | 0, a5l = s[10] | 0, a5h = s[11] | 0, a6l = s[12] | 0, a6h = s[13] | 0, a7l = s[14] | 0, a7h = s[15] | 0, a8l = s[16] | 0, a8h = s[17] | 0, a9l = s[18] | 0, a9h = s[19] | 0, a10l = s[20] | 0, a10h = s[21] | 0, a11l = s[22] | 0, a11h = s[23] | 0, a12l = s[24] | 0, a12h = s[25] | 0, a13l = s[26] | 0, a13h = s[27] | 0, a14l = s[28] | 0, a14h = s[29] | 0, a15l = s[30] | 0, a15h = s[31] | 0, a16l = s[32] | 0, a16h = s[33] | 0, a17l = s[34] | 0, a17h = s[35] | 0, a18l = s[36] | 0, a18h = s[37] | 0, a19l = s[38] | 0, a19h = s[39] | 0, a20l = s[40] | 0, a20h = s[41] | 0, a21l = s[42] | 0, a21h = s[43] | 0, a22l = s[44] | 0, a22h = s[45] | 0, a23l = s[46] | 0, a23h = s[47] | 0, a24l = s[48] | 0, a24h = s[49] | 0;
            let b0l, b0h, b1l, b1h, b2l, b2h, b3l, b3h, b4l, b4h, b5l, b5h, b6l, b6h, b7l, b7h, b8l, b8h, b9l, b9h, b10l, b10h, b11l, b11h, b12l, b12h, b13l, b13h, b14l, b14h, b15l, b15h, b16l, b16h, b17l, b17h, b18l, b18h, b19l, b19h, b20l, b20h, b21l, b21h, b22l, b22h, b23l, b23h, b24l, b24h;
            for (let round = 0; round < 24; round++) {
                const c0l = a0l ^ a5l ^ a10l ^ a15l ^ a20l, c0h = a0h ^ a5h ^ a10h ^ a15h ^ a20h;
                const c1l = a1l ^ a6l ^ a11l ^ a16l ^ a21l, c1h = a1h ^ a6h ^ a11h ^ a16h ^ a21h;
                const c2l = a2l ^ a7l ^ a12l ^ a17l ^ a22l, c2h = a2h ^ a7h ^ a12h ^ a17h ^ a22h;
                const c3l = a3l ^ a8l ^ a13l ^ a18l ^ a23l, c3h = a3h ^ a8h ^ a13h ^ a18h ^ a23h;
                const c4l = a4l ^ a9l ^ a14l ^ a19l ^ a24l, c4h = a4h ^ a9h ^ a14h ^ a19h ^ a24h;
                const d0l = c4l ^ ((c1l << 1) | (c1h >>> 31)), d0h = c4h ^ ((c1h << 1) | (c1l >>> 31));
                const d1l = c0l ^ ((c2l << 1) | (c2h >>> 31)), d1h = c0h ^ ((c2h << 1) | (c2l >>> 31));
                const d2l = c1l ^ ((c3l << 1) | (c3h >>> 31)), d2h = c1h ^ ((c3h << 1) | (c3l >>> 31));
                const d3l = c2l ^ ((c4l << 1) | (c4h >>> 31)), d3h = c2h ^ ((c4h << 1) | (c4l >>> 31));
                const d4l = c3l ^ ((c0l << 1) | (c0h >>> 31)), d4h = c3h ^ ((c0h << 1) | (c0l >>> 31));
                a0l ^= d0l; a0h ^= d0h;
                a1l ^= d1l; a1h ^= d1h;
                a2l ^= d2l; a2h ^= d2h;
                a3l ^= d3l; a3h ^= d3h;
                a4l ^= d4l; a4h ^= d4h;
                a5l ^= d0l; a5h ^= d0h;
                a6l ^= d1l; a6h ^= d1h;
                a7l ^= d2l; a7h ^= d2h;
                a8l ^= d3l; a8h ^= d3h;
                a9l ^= d4l; a9h ^= d4h;
                a10l ^= d0l; a10h ^= d0h;
                a11l ^= d1l; a11h ^= d1h;
                a12l ^= d2l; a12h ^= d2h;
                a13l ^= d3l; a13h ^= d3h;
                a14l ^= d4l; a14h ^= d4h;
                a15l ^= d0l; a15h ^= d0h;
                a16l ^= d1l; a16h ^= d1h;
                a17l ^= d2l; a17h ^= d2h;
                a18l ^= d3l; a18h ^= d3h;
                a19l ^= d4l; a19h ^= d4h;
                a20l ^= d0l; a20h ^= d0h;
                a21l ^= d1l; a21h ^= d1h;
                a22l ^= d2l; a22h ^= d2h;
                a23l ^= d3l; a23h ^= d3h;
                a24l ^= d4l; a24h ^= d4h;
                b0l = a0l; b0h = a0h;
                b16l = (a5h << 4) | (a5l >>> 28); b16h = (a5l << 4) | (a5h >>> 28);
                b7l = (a10l << 3) | (a10h >>> 29); b7h = (a10h << 3) | (a10l >>> 29);
                b23l = (a15h << 9) | (a15l >>> 23); b23h = (a15l << 9) | (a15h >>> 23);
                b14l = (a20l << 18) | (a20h >>> 14); b14h = (a20h << 18) | (a20l >>> 14);
                b10l = (a1l << 1) | (a1h >>> 31); b10h = (a1h << 1) | (a1l >>> 31);
                b1l = (a6h << 12) | (a6l >>> 20); b1h = (a6l << 12) | (a6h >>> 20);
                b17l = (a11l << 10) | (a11h >>> 22); b17h = (a11h << 10) | (a11l >>> 22);
                b8l = (a16h << 13) | (a16l >>> 19); b8h = (a16l << 13) | (a16h >>> 19);
                b24l = (a21l << 2) | (a21h >>> 30); b24h = (a21h << 2) | (a21l >>> 30);
                b20l = (a2h << 30) | (a2l >>> 2); b20h = (a2l << 30) | (a2h >>> 2);
                b11l = (a7l << 6) | (a7h >>> 26); b11h = (a7h << 6) | (a7l >>> 26);
                b2l = (a12h << 11) | (a12l >>> 21); b2h = (a12l << 11) | (a12h >>> 21);
                b18l = (a17l << 15) | (a17h >>> 17); b18h = (a17h << 15) | (a17l >>> 17);
                b9l = (a22h << 29) | (a22l >>> 3); b9h = (a22l << 29) | (a22h >>> 3);
                b5l = (a3l << 28) | (a3h >>> 4); b5h = (a3h << 28) | (a3l >>> 4);
                b21l = (a8h << 23) | (a8l >>> 9); b21h = (a8l << 23) | (a8h >>> 9);
                b12l = (a13l << 25) | (a13h >>> 7); b12h = (a13h << 25) | (a13l >>> 7);
                b3l = (a18l << 21) | (a18h >>> 11); b3h = (a18h << 21) | (a18l >>> 11);
                b19l = (a23h << 24) | (a23l >>> 8); b19h = (a23l << 24) | (a23h >>> 8);
                b15l = (a4l << 27) | (a4h >>> 5); b15h = (a4h << 27) | (a4l >>> 5);
                b6l = (a9l << 20) | (a9h >>> 12); b6h = (a9h << 20) | (a9l >>> 12);
                b22l = (a14h << 7) | (a14l >>> 25); b22h = (a14l << 7) | (a14h >>> 25);
                b13l = (a19l << 8) | (a19h >>> 24); b13h = (a19h << 8) | (a19l >>> 24);
                b4l = (a24l << 14) | (a24h >>> 18); b4h = (a24h << 14) | (a24l >>> 18);
                a0l = b0l ^ (~b1l & b2l); a0h = b0h ^ (~b1h & b2h);
                a1l = b1l ^ (~b2l & b3l); a1h = b1h ^ (~b2h & b3h);
                a2l = b2l ^ (~b3l & b4l); a2h = b2h ^ (~b3h & b4h);
                a3l = b3l ^ (~b4l & b0l); a3h = b3h ^ (~b4h & b0h);
                a4l = b4l ^ (~b0l & b1l); a4h = b4h ^ (~b0h & b1h);
                a5l = b5l ^ (~b6l & b7l); a5h = b5h ^ (~b6h & b7h);
                a6l = b6l ^ (~b7l & b8l); a6h = b6h ^ (~b7h & b8h);
                a7l = b7l ^ (~b8l & b9l); a7h = b7h ^ (~b8h & b9h);
                a8l = b8l ^ (~b9l & b5l); a8h = b8h ^ (~b9h & b5h);
                a9l = b9l ^ (~b5l & b6l); a9h = b9h ^ (~b5h & b6h);
                a10l = b10l ^ (~b11l & b12l); a10h = b10h ^ (~b11h & b12h);
                a11l = b11l ^ (~b12l & b13l); a11h = b11h ^ (~b12h & b13h);
                a12l = b12l ^ (~b13l & b14l); a12h = b12h ^ (~b13h & b14h);
                a13l = b13l ^ (~b14l & b10l); a13h = b13h ^ (~b14h & b10h);
                a14l = b14l ^ (~b10l & b11l); a14h = b14h ^ (~b10h & b11h);
                a15l = b15l ^ (~b16l & b17l); a15h = b15h ^ (~b16h & b17h);
                a16l = b16l ^ (~b17l & b18l); a16h = b16h ^ (~b17h & b18h);
                a17l = b17l ^ (~b18l & b19l); a17h = b17h ^ (~b18h & b19h);
                a18l = b18l ^ (~b19l & b15l); a18h = b18h ^ (~b19h & b15h);
                a19l = b19l ^ (~b15l & b16l); a19h = b19h ^ (~b15h & b16h);
                a20l = b20l ^ (~b21l & b22l); a20h = b20h ^ (~b21h & b22h);
                a21l = b21l ^ (~b22l & b23l); a21h = b21h ^ (~b22h & b23h);
                a22l = b22l ^ (~b23l & b24l); a22h = b22h ^ (~b23h & b24h);
                a23l = b23l ^ (~b24l & b20l); a23h = b23h ^ (~b24h & b20h);
                a24l = b24l ^ (~b20l & b21l); a24h = b24h ^ (~b20h & b21h);
                a0l ^= _RC_LO32[round]; a0h ^= _RC_HI32[round];
            }
            s[0] = a0l; s[1] = a0h;
            s[2] = a1l; s[3] = a1h;
            s[4] = a2l; s[5] = a2h;
            s[6] = a3l; s[7] = a3h;
            s[8] = a4l; s[9] = a4h;
            s[10] = a5l; s[11] = a5h;
            s[12] = a6l; s[13] = a6h;
            s[14] = a7l; s[15] = a7h;
            s[16] = a8l; s[17] = a8h;
            s[18] = a9l; s[19] = a9h;
            s[20] = a10l; s[21] = a10h;
            s[22] = a11l; s[23] = a11h;
            s[24] = a12l; s[25] = a12h;
            s[26] = a13l; s[27] = a13h;
            s[28] = a14l; s[29] = a14h;
            s[30] = a15l; s[31] = a15h;
            s[32] = a16l; s[33] = a16h;
            s[34] = a17l; s[35] = a17h;
            s[36] = a18l; s[37] = a18h;
            s[38] = a19l; s[39] = a19h;
            s[40] = a20l; s[41] = a20h;
            s[42] = a21l; s[43] = a21h;
            s[44] = a22l; s[45] = a22h;
            s[46] = a23l; s[47] = a23h;
            s[48] = a24l; s[49] = a24h;
        }

        function _toBytes(data) {
            if (typeof data === 'string') return utf8.toBytes(data);
            if (data instanceof Uint8Array) return data;
            // assume bitArray
            return bitArray.ba_to_ui8(data);
        }

        /**
         * XOR a full rate-sized block of bytes into the sponge state and apply
         * Keccak-f[1600]. Helper shared by `_sponge` (one-shot) and the streaming
         * `_absorbInto` (incremental).
         */
        function _absorbFullBlock(s, block, rateBytes) {
            // The rate is a whole number of 8-byte lanes: four bytes per word.
            for (let i = 0, w = 0; i < rateBytes; i += 4, w++) {
                s[w] ^= block[i] | (block[i + 1] << 8) | (block[i + 2] << 16) | (block[i + 3] << 24);
            }
            _keccakF1600(s);
        }

        /**
         * Sponge construction.
         * @param {Uint8Array} input
         * @param {number} rateBytes Bitrate in bytes (200 - capacity/8).
         * @param {number} domain Domain-separation byte (0x06 SHA-3, 0x1F SHAKE).
         * @param {number} outBytes Desired output length in bytes.
         * @returns {Uint8Array}
         */
        function _sponge(input, rateBytes, domain, outBytes) {
            const s = new Uint32Array(50);
            const blocks = Math.floor(input.length / rateBytes);

            // Absorb full blocks.
            for (let b = 0; b < blocks; b++) {
                _absorbFullBlock(s, input.subarray(b * rateBytes, (b + 1) * rateBytes), rateBytes);
            }

            // Absorb final (possibly partial) block + pad10*1.
            const tail = new Uint8Array(rateBytes);
            const remaining = input.length - blocks * rateBytes;
            tail.set(input.subarray(blocks * rateBytes), 0);
            tail[remaining] = domain;
            tail[rateBytes - 1] |= 0x80;
            _absorbFullBlock(s, tail, rateBytes);

            // Squeeze.
            const out = new Uint8Array(outBytes);
            let produced = 0;
            while (produced < outBytes) {
                const take = Math.min(rateBytes, outBytes - produced);
                for (let i = 0; i < take; i++) {
                    const lane = i >>> 3;
                    const byteInLane = i & 7;
                    const wordIdx = 2 * lane + (byteInLane < 4 ? 0 : 1);
                    const shift = (byteInLane & 3) * 8;
                    out[produced + i] = (s[wordIdx] >>> shift) & 0xff;
                }
                produced += take;
                if (produced < outBytes) _keccakF1600(s);
            }
            return out;
        }

        function _make(outBits, capacityBits, domain) {
            const rateBytes = (1600 - capacityBits) / 8;
            const outBytes = outBits / 8;
            return function (data) {
                return bitArray.ui8_to_ba(_sponge(_toBytes(data), rateBytes, domain, outBytes));
            };
        }

        function _makeXof(capacityBits, domain) {
            const rateBytes = (1600 - capacityBits) / 8;
            return function (data, outBits) {
                if (outBits < 0 || (outBits & 7) !== 0) {
                    console.warn('[crypto] INVALID: sha3: SHAKE output must be a non-negative multiple of 8 bits');
                    return false;
                }
                return bitArray.ui8_to_ba(_sponge(_toBytes(data), rateBytes, domain, outBits / 8));
            };
        }

        // ── Streaming sponge constructor (HMAC/HKDF/PBKDF2-compatible) ─────
        //
        // Exposes the `{ fn, hash, fn.prototype.{blockSize, update, finalize} }`
        // contract that `hash/hmac.js` requires (cf. hmac.js:22-45). One module
        // per SHA-3 variant + per SHAKE rate. Output length is fixed at the
        // standard digest size (FIPS 202) for SHA-3; for SHAKE the streaming
        // wrapper takes `outBits` at construction time.
        //
        // State is fully cloneable via the copy constructor `new H(other)`,
        // which HMAC uses to cache the inner/outer hash state after key
        // absorption (hmac.js:31, 44, 59, 71).

        /**
         * @returns {Sha3HashCtor}
         */
        function _makeStreamingHash(outBits, capacityBits, domain) {
            const rateBytes = (1600 - capacityBits) / 8;
            const outBytes  = outBits / 8;

            function H(other) {
                if (other) {
                    // Clone constructor - used by HMAC for inner/outer state caching.
                    this._state = new Uint32Array(other._state);
                    this._buf = new Uint8Array(other._buf);
                    this._bufLen = other._bufLen;
                    this._finalized = other._finalized;
                } else {
                    this._state = new Uint32Array(50);
                    this._buf = new Uint8Array(rateBytes);
                    this._bufLen = 0;
                    this._finalized = false;
                }
            }

            // Block size in **bits** - `hmac.js:30` reads this as `blockSize / 32`.
            H.prototype.blockSize = rateBytes * 8;

            H.prototype.update = function (data) {
                if (this._finalized) {
                    console.warn('[crypto] INVALID: sha3: update after finalize');
                    return this;
                }
                const bytes = _toBytes(data);
                let off = 0;
                while (off < bytes.length) {
                    const take = Math.min(rateBytes - this._bufLen, bytes.length - off);
                    this._buf.set(bytes.subarray(off, off + take), this._bufLen);
                    this._bufLen += take;
                    off += take;
                    if (this._bufLen === rateBytes) {
                        _absorbFullBlock(this._state, this._buf, rateBytes);
                        this._bufLen = 0;
                    }
                }
                return this;
            };

            H.prototype.finalize = function () {
                if (this._finalized) {
                    console.warn('[crypto] INVALID: sha3: finalize called twice');
                    return false;
                }
                // Pad10*1 + domain
                for (let i = this._bufLen; i < rateBytes; i++) this._buf[i] = 0;
                this._buf[this._bufLen] = domain;
                this._buf[rateBytes - 1] |= 0x80;
                _absorbFullBlock(this._state, this._buf, rateBytes);
                this._finalized = true;

                // Squeeze
                const out = new Uint8Array(outBytes);
                let produced = 0;
                while (produced < outBytes) {
                    const take = Math.min(rateBytes, outBytes - produced);
                    for (let i = 0; i < take; i++) {
                        const lane = i >>> 3;
                        const byteInLane = i & 7;
                        const wordIdx = 2 * lane + (byteInLane < 4 ? 0 : 1);
                        const shift = (byteInLane & 3) * 8;
                        out[produced + i] = (this._state[wordIdx] >>> shift) & 0xff;
                    }
                    produced += take;
                    if (produced < outBytes) _keccakF1600(this._state);
                }
                return bitArray.ui8_to_ba(out);
            };

            return H;
        }

        // Submodule wrappers exposing `{ name, fn, hash }` shape compatible
        // with hmac.js / hkdf.js / pbkdf2.js dependency injection.
        /** @returns {Sha3StreamingModule} */
        function _streamingModule(name, outBits, capacityBits, domain, oneShot) {
            const fn = _makeStreamingHash(outBits, capacityBits, domain);
            return { name, fn, hash: oneShot };
        }

        const _sha3_224 = _make(224, 448, 0x06);
        const _sha3_256 = _make(256, 512, 0x06);
        const _sha3_384 = _make(384, 768, 0x06);
        const _sha3_512 = _make(512, 1024, 0x06);
        const _shake128 = _makeXof(256, 0x1F);
        const _shake256 = _makeXof(512, 0x1F);

        return {
            // Existing one-shot callable API (unchanged).
            sha3_224: _sha3_224,
            sha3_256: _sha3_256,
            sha3_384: _sha3_384,
            sha3_512: _sha3_512,
            shake128: _shake128,
            shake256: _shake256,

            // NEW: HMAC/HKDF/PBKDF2-compatible Hash modules with `{ fn, hash }`.
            // Each `fn` is a constructor exposing prototype.{blockSize, update, finalize}
            // and a copy constructor `new fn(other)`.
            sha3_224_hash: _streamingModule('sha3_224', 224, 448, 0x06, _sha3_224),
            sha3_256_hash: _streamingModule('sha3_256', 256, 512, 0x06, _sha3_256),
            sha3_384_hash: _streamingModule('sha3_384', 384, 768, 0x06, _sha3_384),
            sha3_512_hash: _streamingModule('sha3_512', 512, 1024, 0x06, _sha3_512)
        };
    }
};
