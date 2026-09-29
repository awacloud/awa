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

        function _keccakF1600(s) {
            const C = new Uint32Array(10);
            const D = new Uint32Array(10);
            const B = new Uint32Array(50);

            for (let round = 0; round < 24; round++) {
                // θ
                for (let x = 0; x < 5; x++) {
                    C[2*x]   = s[2*x] ^ s[2*x + 10] ^ s[2*x + 20] ^ s[2*x + 30] ^ s[2*x + 40];
                    C[2*x+1] = s[2*x+1] ^ s[2*x + 11] ^ s[2*x + 21] ^ s[2*x + 31] ^ s[2*x + 41];
                }
                for (let x = 0; x < 5; x++) {
                    const xm1 = (x + 4) % 5;
                    const xp1 = (x + 1) % 5;
                    // D[x] = C[x-1] xor rot(C[x+1], 1)
                    const lo = C[2*xp1];
                    const hi = C[2*xp1 + 1];
                    D[2*x]   = C[2*xm1]     ^ ((lo << 1) | (hi >>> 31));
                    D[2*x+1] = C[2*xm1 + 1] ^ ((hi << 1) | (lo >>> 31));
                }
                for (let i = 0; i < 25; i++) {
                    const x = i % 5;
                    s[2*i]     ^= D[2*x];
                    s[2*i + 1] ^= D[2*x + 1];
                }

                // ρ + π
                for (let x = 0; x < 5; x++) {
                    for (let y = 0; y < 5; y++) {
                        const i = x + 5 * y;
                        const ni = y + 5 * ((2 * x + 3 * y) % 5);
                        const r = _R[i];
                        const lo = s[2*i];
                        const hi = s[2*i + 1];
                        let nlo, nhi;
                        if (r === 0) {
                            nlo = lo; nhi = hi;
                        } else if (r < 32) {
                            nlo = (lo << r) | (hi >>> (32 - r));
                            nhi = (hi << r) | (lo >>> (32 - r));
                        } else if (r === 32) {
                            nlo = hi; nhi = lo;
                        } else {
                            const r2 = r - 32;
                            nlo = (hi << r2) | (lo >>> (32 - r2));
                            nhi = (lo << r2) | (hi >>> (32 - r2));
                        }
                        B[2*ni]     = nlo;
                        B[2*ni + 1] = nhi;
                    }
                }

                // χ
                for (let y = 0; y < 5; y++) {
                    for (let x = 0; x < 5; x++) {
                        const i = x + 5 * y;
                        const i1 = ((x + 1) % 5) + 5 * y;
                        const i2 = ((x + 2) % 5) + 5 * y;
                        s[2*i]     = B[2*i]     ^ ((~B[2*i1])     & B[2*i2]);
                        s[2*i + 1] = B[2*i + 1] ^ ((~B[2*i1 + 1]) & B[2*i2 + 1]);
                    }
                }

                // ι
                s[0] ^= _RC_LO[round];
                s[1] ^= _RC_HI[round];
            }
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
            for (let i = 0; i < rateBytes; i++) {
                const lane = i >>> 3;
                const byteInLane = i & 7;
                const wordIdx = 2 * lane + (byteInLane < 4 ? 0 : 1);
                const shift = (byteInLane & 3) * 8;
                s[wordIdx] ^= (block[i] & 0xff) << shift;
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
