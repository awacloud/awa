// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Logical reference of `sha3.js` (FIPS 202 SHA-3 and SHAKE):
 * the rolled Keccak-f[1600] - θ, ρ + π (offsets from the table `_R`), χ and ι
 * as loops over the 25 lanes held as (lo, hi) 32-bit halves - and a sponge
 * absorbing the rate byte by byte.
 *
 * Taken from `git show abf082855^:packages/front/fw/src/crypto/hash/sha3.js`
 * (the parent of "unroll keccak-f[1600] on int32 locals").
 * Adapted: the parent's `factory(bitArray, utf8)` body is wrapped in
 * `createSha3Reference(bitArray, utf8)`, unchanged otherwise. The module's
 * contract has not moved since (same keys, same `false` returns on a bad
 * SHAKE length or a second `finalize()`), so no contract adaptation was
 * needed. Its co-located differential test, the only importer, compares it
 * with the fast module.
 *
 * Kept in the git repository only: excluded from the npm tarball, the
 * exports map, the declaration tree and the registry.
 */

/**
 * Builds the reference SHA-3 family (same dependencies as `sha3.factory`).
 * @param {any} bitArray  A `bitArray.factory()` instance.
 * @param {any} utf8      A `utf8.factory()` instance.
 * @returns {import('./sha3.js').Sha3API} The same keys as the fast module.
 */
export function createSha3Reference(bitArray, utf8) {

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
