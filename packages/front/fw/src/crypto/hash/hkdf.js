// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview HKDF - HMAC-based Extract-and-Expand Key Derivation Function
 * (RFC 5869).
 *
 * HKDF derives one or more cryptographically strong secret keys from a high-
 * entropy but possibly non-uniform input keying material (IKM), an optional
 * salt, and an optional context/info string. It follows the two-stage
 * "extract-then-expand" paradigm:
 *
 *   PRK = HMAC-Hash(salt, IKM)
 *   OKM = T(1) || T(2) || ... || T(N)   (truncated to L bytes)
 *     where T(i) = HMAC-Hash(PRK, T(i-1) || info || i)
 *
 * The PRF defaults to HMAC-SHA-256; pass any module shaped like `hmac` as
 * the trailing `Prff` argument for a different underlying hash (e.g. an
 * `hmac` instance built over `sha512`).
 *
 */

/**
 * Public shape returned by `hkdf.factory()`. `bitArray` values are `number[]`.
 * @typedef {object} HkdfAPI
 * @property {(salt: (number[]|string), ikm: (number[]|string), Prff?: {fn:Function}) => number[]} extract
 *   HKDF-Extract: PRK = HMAC-Hash(salt, IKM).
 * @property {(prk: number[], info: (number[]|string), length: number, Prff?: {fn:Function}) => (number[]|false)} expand
 *   HKDF-Expand: derive `length` bits of OKM, or `false` on invalid length.
 * @property {(salt: (number[]|string), ikm: (number[]|string), info: (number[]|string), length: number, Prff?: {fn:Function}) => (number[]|false)} derive
 *   One-shot extract-then-expand.
 */

import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hmac } from './hmac.js';

export const hkdf = {
    name: 'hkdf',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['bitArray', 'utf8', 'hmac'],
    deps: [bitArray, utf8, hmac],

    /** @returns {HkdfAPI} */
    factory(bitArray, utf8, hmac) {

        function _toBa(x) {
            if (x === undefined || x === null) return [];
            if (typeof x === 'string') return bitArray.ui8_to_ba(utf8.toBytes(x));
            return x;
        }

        // Cache HashLen-in-bits per PRF module reference. Each lookup
        // otherwise allocates a throwaway HMAC instance and runs a full
        // compression, which is wasteful when `extract`/`expand`/`derive`
        // get called repeatedly with the same PRF.
        const _hashLenCache = new WeakMap();
        function _hashLenBits(Prf) {
            const cached = _hashLenCache.get(Prf);
            if (cached !== undefined) return cached;
            const bits = bitArray.bitLength(new Prf.fn([]).encrypt([]));
            _hashLenCache.set(Prf, bits);
            return bits;
        }

        /**
         * HKDF-Extract: PRK = HMAC-Hash(salt, IKM).
         * @param {Array|string} salt Optional salt; if empty/null, a string
         *   of HashLen zero bytes is used (RFC 5869 §2.2).
         * @param {Array|string} ikm Input keying material.
         * @param {{fn:Function}} [Prff] HMAC module (default: HMAC-SHA-256).
         * @returns {Array} PRK as bitArray (HashLen bits).
         */
        function extract(salt, ikm, Prff) {
            const Prf = Prff || hmac;
            const ikmBa = _toBa(ikm);
            // RFC 5869 §2.2 requires non-empty IKM. Warn so callers passing
            // null/undefined/empty material notice - the math still runs.
            if (bitArray.bitLength(ikmBa) === 0) {
                console.warn('[crypto] WEAK: hkdf: empty IKM (RFC 5869 §2.2 requires non-empty input keying material)');
            }
            let saltBa = _toBa(salt);
            if (bitArray.bitLength(saltBa) === 0) {
                const zeros = new Uint8Array(_hashLenBits(Prf) / 8);
                saltBa = bitArray.ui8_to_ba(zeros);
            }
            return new Prf.fn(saltBa).encrypt(ikmBa);
        }

        /**
         * HKDF-Expand: derive `length` bits of OKM from a PRK and an info
         * string. Throws (returns false) if `length > 255 * HashLen`.
         * @param {Array} prk Pseudo-random key (typically the output of `extract`).
         * @param {Array|string} info Optional context/application-specific info.
         * @param {number} length Desired output length in **bits**.
         * @param {{fn:Function}} [Prff] HMAC module.
         * @returns {Array|false}
         */
        function expand(prk, info, length, Prff) {
            const Prf = Prff || hmac;
            const hashBits = _hashLenBits(Prf);
            if (length < 0) {
                console.warn('[crypto] INVALID: hkdf: length must be non-negative');
                return false;
            }
            const N = Math.ceil(length / hashBits);
            if (N > 255) {
                console.warn('[crypto] INVALID: hkdf: length exceeds 255 * HashLen');
                return false;
            }
            const infoBa = _toBa(info);
            let T = [];
            let okm = [];
            for (let i = 1; i <= N; i++) {
                const counter = bitArray.ui8_to_ba(new Uint8Array([i]));
                const input = bitArray.concat(bitArray.concat(T, infoBa), counter);
                T = new Prf.fn(prk).encrypt(input);
                okm = okm.concat(T);
            }
            return bitArray.clamp(okm, length);
        }

        /**
         * One-shot HKDF: extract then expand.
         * @param {Array|string} salt
         * @param {Array|string} ikm
         * @param {Array|string} info
         * @param {number} length Desired output length in **bits**.
         * @param {{fn:Function}} [Prff] HMAC module.
         * @returns {Array|false}
         */
        function derive(salt, ikm, info, length, Prff) {
            const prk = extract(salt, ikm, Prff);
            return expand(prk, info, length, Prff);
        }

        return {
            extract,
            expand,
            derive
        };
    }
};
