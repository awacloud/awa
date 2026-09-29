// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * BigInt helpers - bytes conversions (BE/LE, signed), modular arithmetic, Miller-Rabin primality, random sampling.
 */

/**
 * Public shape returned by `bigint.factory()`.
 * @typedef {object} BigIntAPI
 * @property {(bi: bigint, opts?: { byteLength?: number, endian?: ('be'|'le'), signed?: boolean }) => Uint8Array} toBytes Serialize a BigInt to a byte array.
 * @property {(bytes: Uint8Array|number[], opts?: { endian?: ('be'|'le'), signed?: boolean }) => bigint} fromBytes Parse a byte array into a BigInt.
 * @property {(bi: bigint) => number} bitLength Number of bits needed to represent `bi` in absolute value.
 * @property {(bi: bigint) => number} byteLength Minimum byte count needed to represent `bi`.
 * @property {(base: bigint, exp: bigint, mod: bigint) => bigint} modPow Modular exponentiation `base^exp mod mod`.
 * @property {(a: bigint, mod: bigint) => bigint} modInv Modular inverse of `a` mod `mod`.
 * @property {(a: bigint, b: bigint) => bigint} gcd Greatest common divisor of `|a|` and `|b|`.
 * @property {(a: bigint, b: bigint) => bigint} lcm Least common multiple of `a` and `b`.
 * @property {(n: bigint, rounds?: number) => boolean} isPrime Miller-Rabin primality test.
 * @property {(min: bigint, max: bigint, randomBytesFn: (n: number) => Uint8Array|number[]) => bigint} randomBetween Uniform BigInt in `[min, max]`.
 * @property {(str: string, radix?: number) => bigint} parse Parse a string into a BigInt.
 * @property {(bi: bigint, radix?: number) => string} toString Convert a BigInt to a string in the given radix.
 */

export const bigint = {
    name: 'bigint',
    version: '1.0.0',
    type: 'fw.io.calc',
    dependencies: [],

    /** @returns {BigIntAPI} */
    factory() {
        /**
         * Number of bits needed to represent `bi` in absolute value
         * (0n → 0).
         * @param {bigint} bi
         * @returns {number}
         */
        function bitLength(bi) {
            if (bi === 0n) return 0;
            let n = bi < 0n ? -bi : bi;
            let len = 0;
            while (n > 0n) { n >>= 1n; len++; }
            return len;
        }

        /**
         * Minimum byte count needed to represent `bi` (unsigned magnitude
         * for non-negative values; two's complement size for negatives).
         * @param {bigint} bi
         * @returns {number}
         */
        function byteLength(bi) {
            const bits = bitLength(bi < 0n ? -bi - 1n : bi);
            return Math.max(1, Math.ceil(bits / 8));
        }

        /**
         * Serialize a BigInt to a byte array.
         * @param {bigint} bi
         * @param {{ byteLength?: number, endian?: 'be'|'le', signed?: boolean }} [opts]
         * @returns {Uint8Array}
         */
        function toBytes(bi, { byteLength: len, endian = 'be', signed = false } = {}) {
            if (!signed && bi < 0n) throw new Error('bigint: negative value requires signed=true');
            let needed;
            if (signed) {
                // minimum bytes for two's complement
                const bits = bitLength(bi < 0n ? -bi - 1n : bi);
                needed = Math.max(1, Math.ceil((bits + 1) / 8));
            } else {
                needed = byteLength(bi);
            }
            const size = len !== undefined ? len : needed;
            if (len !== undefined && len < needed) throw new Error(`bigint: byteLength ${len} insufficient (need ${needed})`);
            const buf = new Uint8Array(size);
            let val = signed && bi < 0n ? ((1n << BigInt(size * 8)) + bi) : bi;
            for (let i = size - 1; i >= 0; i--) {
                buf[endian === 'be' ? i : (size - 1 - i)] = Number(val & 0xffn);
                val >>= 8n;
            }
            return buf;
        }

        /**
         * Parse a byte array into a BigInt.
         * @param {Uint8Array|number[]} bytes
         * @param {{ endian?: 'be'|'le', signed?: boolean }} [opts]
         * @returns {bigint}
         */
        function fromBytes(bytes, { endian = 'be', signed = false } = {}) {
            let result = 0n;
            const len = bytes.length;
            for (let i = 0; i < len; i++) {
                const byte = BigInt(bytes[endian === 'be' ? i : (len - 1 - i)]);
                result = (result << 8n) | byte;
            }
            if (signed && len > 0 && (bytes[endian === 'be' ? 0 : len - 1] & 0x80)) {
                result -= (1n << BigInt(len * 8));
            }
            return result;
        }

        /**
         * Modular exponentiation: `base^exp mod mod`.
         * @param {bigint} base
         * @param {bigint} exp  must be >= 0
         * @param {bigint} mod  must be > 0
         * @returns {bigint}
         */
        function modPow(base, exp, mod) {
            if (exp < 0n) throw new Error('bigint: exp must be >= 0');
            if (mod <= 0n) throw new Error('bigint: mod must be > 0');
            if (mod === 1n) return 0n;
            let result = 1n;
            base = base % mod;
            if (base < 0n) base += mod;
            while (exp > 0n) {
                if (exp & 1n) result = result * base % mod;
                exp >>= 1n;
                base = base * base % mod;
            }
            return result;
        }

        /**
         * Greatest common divisor of `|a|` and `|b|`.
         * @param {bigint} a
         * @param {bigint} b
         * @returns {bigint}
         */
        function gcd(a, b) {
            a = a < 0n ? -a : a;
            b = b < 0n ? -b : b;
            while (b) { const t = b; b = a % b; a = t; }
            return a;
        }

        /**
         * Least common multiple of `a` and `b`.
         * @param {bigint} a
         * @param {bigint} b
         * @returns {bigint}
         */
        function lcm(a, b) {
            return (a / gcd(a, b)) * b;
        }

        /**
         * Modular inverse: returns `x` such that `a * x ≡ 1 (mod mod)`.
         * Throws if no inverse exists.
         * @param {bigint} a
         * @param {bigint} mod must be > 0
         * @returns {bigint}
         */
        function modInv(a, mod) {
            if (mod <= 0n) throw new Error('bigint: mod must be > 0');
            let [old_r, r] = [a % mod, mod];
            let [old_s, s] = [1n, 0n];
            while (r !== 0n) {
                const q = old_r / r;
                [old_r, r] = [r, old_r - q * r];
                [old_s, s] = [s, old_s - q * s];
            }
            if (old_r !== 1n) throw new Error('bigint: no modular inverse');
            return ((old_s % mod) + mod) % mod;
        }

        /**
         * Miller-Rabin primality test using a deterministic small-bases
         * witness sequence (2, 3, 5, 7, 11, 13, …, capped at `n - 2`).
         *
         * NOT cryptographically suitable for unknown-distribution inputs:
         * the witness set is deterministic, not randomized. For values
         * `n < 3.3 × 10^14` the first 12 prime bases are known to be
         * exhaustive, so this implementation is correct for typical
         * 53-bit ranges. For arbitrary-precision security, pass a CSPRNG
         * to a randomized variant (not provided here).
         *
         * @param {bigint} n      candidate value
         * @param {number} [rounds=20] number of witnesses to try
         * @returns {boolean}
         */
        function isPrime(n, rounds = 20) {
            if (n < 2n) return false;
            if (n === 2n || n === 3n) return true;
            if (n % 2n === 0n) return false;
            // Write n-1 as 2^r * d
            let d = n - 1n, r = 0;
            while (d % 2n === 0n) { d /= 2n; r++; }
            // Deterministic small-bases witness sequence (Miller test).
            const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n,
                                   31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n];
            const witnessCount = Math.min(rounds, SMALL_PRIMES.length);
            outer: for (let i = 0; i < witnessCount; i++) {
                // Witness must be in [2, n-2].
                let a = SMALL_PRIMES[i];
                if (a >= n - 1n) continue;
                let x = modPow(a, d, n);
                if (x === 1n || x === n - 1n) continue;
                for (let j = 0; j < r - 1; j++) {
                    x = x * x % n;
                    if (x === n - 1n) continue outer;
                }
                return false;
            }
            return true;
        }

        /**
         * Return a uniformly distributed BigInt in `[min, max]` using the
         * provided random-bytes function. Rejection-samples until the
         * value lies inside the range.
         * @param {bigint} min
         * @param {bigint} max
         * @param {(n: number) => Uint8Array|number[]} randomBytesFn
         * @returns {bigint}
         */
        function randomBetween(min, max, randomBytesFn) {
            if (min > max) throw new Error('bigint: min > max');
            const range = max - min + 1n;
            const bits = bitLength(range - 1n);
            const bytes = Math.ceil(bits / 8);
            while (true) {
                const raw = randomBytesFn(bytes);
                let val = 0n;
                for (let i = 0; i < raw.length; i++) val = (val << 8n) | BigInt(raw[i]);
                // Mask to required bits
                const mask = (1n << BigInt(bits)) - 1n;
                val &= mask;
                if (val < range) return min + val;
            }
        }

        /**
         * Parse a string into a BigInt. Supports radix 10 and 16 losslessly;
         * other radices fall back to a `parseInt` round-trip and are limited
         * to 2^53.
         * @param {string} str
         * @param {number} [radix=10]
         * @returns {bigint}
         */
        function parse(str, radix = 10) {
            str = str.trim();
            if (radix === 16) {
                let neg = false;
                if (str.startsWith('-')) { neg = true; str = str.slice(1); }
                if (str.startsWith('0x') || str.startsWith('0X')) str = str.slice(2);
                return neg ? -BigInt('0x' + str) : BigInt('0x' + str);
            }
            if (radix === 10) return BigInt(str);
            // Generic fallback (lossy beyond 2^53)
            return BigInt(parseInt(str, radix));
        }

        /**
         * Convert a BigInt to a string in the given radix.
         * @param {bigint} bi
         * @param {number} [radix=10]
         * @returns {string}
         */
        function toString(bi, radix = 10) {
            if (radix === 10) return bi.toString();
            if (radix === 16) {
                const neg = bi < 0n;
                const abs = neg ? -bi : bi;
                return (neg ? '-' : '') + abs.toString(16);
            }
            return bi.toString(radix);
        }

        return { toBytes, fromBytes, bitLength, byteLength, modPow, modInv, gcd, lcm, isPrime, randomBetween, parse, toString };
    },
};
