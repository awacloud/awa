// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview RSA key-pair generation per FIPS 186-5 §A.1.3
 * (Generation of Probable Primes).
 *
 * Produces an RSA key suitable for the [`rsa`](../pkc/rsa.js) module:
 * `{ publicKey: { n, e }, privateKey: { n, e, d, p, q, dp, dq, qInv } }`,
 * with every field encoded as a big-endian `Uint8Array`.
 *
 * Algorithm summary (FIPS 186-5 Appendix A.1.3 - probable-prime variant):
 *
 *   1. Validate `nlen ∈ {2048, 3072, 4096}` and that `e` is odd, in
 *      `[2^16 + 1, 2^256 - 1]` (we accept 3 ≤ e by convention with a warning).
 *   2. Generate `p`:
 *        - random `nlen/2`-bit odd candidate with the top two bits set so
 *          that `p · q` always lands in `[2^(nlen-1), 2^nlen)`,
 *        - reject if `gcd(p − 1, e) ≠ 1`  (specialised: `(p − 1) mod e ≠ 0`),
 *        - trial-divide by small primes < 2000,
 *        - confirm with Miller-Rabin (rounds per FIPS 186-5 Table B.1).
 *   3. Generate `q` under the same constraints, plus
 *      `|p − q| > 2^(nlen/2 − 100)` to thwart Fermat factoring.
 *   4. Compute `n = p · q`, `λ(n) = lcm(p − 1, q − 1)`,
 *      `d = e⁻¹ mod λ(n)` (require `d > 2^(nlen/2)`),
 *      and the CRT parameters `dp`, `dq`, `qInv`.
 *
 * Randomness comes from a SP 800-90A CTR_DRBG instance built via
 * `random.drbg()` (or a caller-supplied DRBG).
 *
 * **Performance note:** RSA-2048 keygen in pure JS is slow (typically several
 * seconds). For interactive use, run inside a Worker.
 *
 */

/**
 * RSA key pair returned by `generate`. Every field is a big-endian `Uint8Array`.
 * @typedef {object} RsaKeyPair
 * @property {{ n: Uint8Array, e: Uint8Array }} publicKey Public modulus and exponent.
 * @property {{ n: Uint8Array, e: Uint8Array, d: Uint8Array, p: Uint8Array, q: Uint8Array, dp: Uint8Array, dq: Uint8Array, qInv: Uint8Array }} privateKey Private key with CRT parameters.
 */

/**
 * Public shape returned by `rsaKeygen.factory()`.
 * @typedef {object} RsaKeygenAPI
 * @property {(options?: {bits?: number, e?: number, drbg?: object}) => (RsaKeyPair|false)} generate Generate an RSA key pair.
 * @property {(nbits: number, eBn: unknown, drbg: object) => (unknown|false)} generateProbablePrime Generate a probable prime (`bn` instance) coprime with `e`.
 * @property {{ millerRabin: Function, smallPrimes: number[], divmod: Function, lcm: Function, inverseModAny: Function }} _internal Internal primitives exposed for KAT tests only; not API.
 */

import { bitArray } from './bitArray.js';
import { bn } from './bn.js';
import { random } from './random.js';

export const rsaKeygen = {
    name: 'rsaKeygen',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['bitArray', 'bn', 'random'],
    deps: [bitArray, bn, random],

    /** @returns {RsaKeygenAPI} */
    factory(bitArray, bn, random) {

        // ── small-prime sieve (primes < 2000) ───────────────────────────
        const _SMALL_PRIMES = (() => {
            const N = 2000;
            const sieve = new Uint8Array(N).fill(1);
            sieve[0] = sieve[1] = 0;
            for (let i = 2; i * i < N; i++) {
                if (sieve[i]) for (let j = i * i; j < N; j += i) sieve[j] = 0;
            }
            const out = [];
            for (let i = 2; i < N; i++) if (sieve[i]) out.push(i);
            return out;
        })();

        // ── Miller-Rabin round counts (FIPS 186-5 Table B.1) ────────────
        // Auditor profile (kAuditor) is the conservative count expected by a
        // FIPS validator. Actual cap (k) adds defence-in-depth headroom.
        function _mrRounds(primeBits) {
            if (primeBits >= 1536) return { kAuditor: 4,  k: 5  };  // nlen ≥ 3072
            if (primeBits >= 1024) return { kAuditor: 5,  k: 7  };  // nlen 2048
            if (primeBits >= 512)  return { kAuditor: 7,  k: 10 };
            return { kAuditor: 28, k: 40 };
        }

        // ── byte / bn conversions ───────────────────────────────────────
        function _bnToBytes(num, len) {
            return bitArray.ba_to_ui8(num.toBits(len * 8));
        }
        function _bytesToBn(b) {
            return bn.fromBits(bitArray.ui8_to_ba(b));
        }
        function _bnFromUint8(buf) {
            return bn.fromBits(bitArray.ui8_to_ba(buf));
        }

        // ── small-int helpers on bn ─────────────────────────────────────
        function _modSmall(num, m) {
            // Returns (num mod m) as a JS number, m fitting in 24 bits.
            // Uses Horner over the bn limbs in big-endian order.
            const radixMod = num.placeVal % m;
            let r = 0;
            for (let i = num.limbs.length - 1; i >= 0; i--) {
                r = (r * radixMod + num.getLimb(i)) % m;
            }
            return r;
        }

        function _isDivisibleBySmall(candidate) {
            for (let i = 0; i < _SMALL_PRIMES.length; i++) {
                if (_modSmall(candidate, _SMALL_PRIMES[i]) === 0) return true;
            }
            return false;
        }

        // ── Miller-Rabin (probable-prime test) ──────────────────────────
        // n: bn instance, n odd and > 3.
        function _millerRabin(n, k, drbg) {
            const ONE = new bn.bn(1);
            const TWO = new bn.bn(2);
            const nMinus1 = n.sub(ONE).normalize();
            const nMinus3 = n.sub(new bn.bn(3)).normalize();

            // n - 1 = 2^s · d, d odd
            let d = nMinus1.copy();
            let s = 0;
            while ((d.getLimb(0) & 1) === 0) {
                d.halveM();
                s++;
            }
            d.normalize();

            const nlen = n.bitLength();
            const aBytes = ((nlen + 7) >>> 3);

            outer: for (let r = 0; r < k; r++) {
                // Pick random a in [2, n-2]: random ∈ [0, n-3] then +2.
                let a;
                while (true) {
                    const buf = drbg.generate(aBytes);
                    if (buf === false) return false;
                    a = _bnFromUint8(buf).mod(nMinus3).normalize();
                    a.addM(TWO);
                    a.normalize();
                    if (a.greaterEquals(TWO) && nMinus1.greaterEquals(a)) break;
                }

                let x = a.powermod(d, n);
                if (x.equals(ONE) || x.equals(nMinus1)) continue;
                for (let i = 0; i < s - 1; i++) {
                    x = x.mulmod(x, n);
                    if (x.equals(nMinus1)) continue outer;
                    if (x.equals(ONE))     return false;
                }
                return false;
            }
            return true;
        }

        // ── prime-candidate generator ───────────────────────────────────
        // Generates an `nbits`-bit odd integer with the top two bits set.
        function _randCandidate(nbits, drbg) {
            const nbytes = (nbits + 7) >>> 3;
            const buf = drbg.generate(nbytes);
            if (buf === false) return false;
            // Top two bits of the most-significant byte.
            const topBitInByte = ((nbits - 1) & 7);
            const topMask = 1 << topBitInByte;
            const next   = topBitInByte === 0 ? 0x80 : (1 << (topBitInByte - 1));
            // Clear bits above the desired length, then set top two and odd.
            const keepMask = (topMask << 1) - 1;
            buf[0] = (buf[0] & keepMask) | topMask | next;
            buf[buf.length - 1] |= 1;
            return _bnFromUint8(buf);
        }

        /**
         * Generate a probable prime of the requested bit length, coprime with `e`.
         *
         * @param {number}        nbits  Bit length of the prime (e.g. 1024 for RSA-2048).
         * @param {bn}            eBn    Public exponent as a `bn` instance.
         * @param {object}        drbg   DRBG instance (`random.drbg()` or compatible).
         * @returns {bn|false}
         */
        function generateProbablePrime(nbits, eBn, drbg) {
            if (!Number.isInteger(nbits) || nbits < 256) {
                console.warn('[crypto] INVALID: rsaKeygen: prime bit length must be ≥ 256');
                return false;
            }
            const eIsSmall = eBn.bitLength() <= 24;
            const eSmall   = eIsSmall ? eBn.getLimb(0) : 0;
            const ONE      = new bn.bn(1);
            const { k }    = _mrRounds(nbits);

            const MAX_ATTEMPTS = nbits * 5;
            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                const cand = _randCandidate(nbits, drbg);
                if (cand === false) return false;
                // gcd(cand - 1, e) == 1 - for prime e (e.g. 65537), reduces to (cand-1) mod e != 0.
                const candMinus1 = cand.sub(ONE).normalize();
                if (eIsSmall) {
                    if (_modSmall(candMinus1, eSmall) === 0) continue;
                } else {
                    // Generic gcd via inverseMod (returns false on non-coprime).
                    if (eBn.inverseMod(candMinus1) === false) continue;
                }
                if (_isDivisibleBySmall(cand)) continue;
                if (!_millerRabin(cand, k, drbg)) continue;
                return cand;
            }
            console.error('[crypto] BUG: rsaKeygen: exceeded prime search budget');
            return false;
        }

        // ── modular inverse for arbitrary (incl. even) modulus ──────────
        // bn.inverseMod requires an odd modulus (binary-GCD halving variant).
        // λ(n) is always even, so we split m = 2^k · u (u odd) and combine
        // via CRT. The 2^k inverse is obtained by Hensel lifting (a odd).
        function _modPow2(k) {
            const out = new bn.bn(1);
            for (let i = 0; i < k; i++) out.doubleM();
            return out.normalize();
        }
        function _hensel2adic(a, k) {
            // Given odd `a` and a power-of-two precision target `k`, returns
            // x such that a · x ≡ 1 (mod 2^k). Doubles precision each step.
            const TWO = new bn.bn(2);
            let x = new bn.bn(1);            // a · 1 ≡ 1 (mod 2) since a odd
            let prec = 1;
            while (prec < k) {
                prec = Math.min(prec * 2, k);
                const modP = _modPow2(prec);
                const axMod = a.mul(x).mod(modP).normalize();
                let twoMinus;
                if (TWO.greaterEquals(axMod)) {
                    twoMinus = TWO.sub(axMod).normalize();
                } else {
                    twoMinus = modP.add(TWO).sub(axMod).normalize();
                }
                x = x.mul(twoMinus).mod(modP).normalize();
            }
            return x;
        }
        function _inverseModAny(a, m) {
            if (m.equals(0)) return false;
            // Strip factors of 2 from m: m = 2^k · u.
            let u = m.copy();
            let k = 0;
            while (u.limbs.length && (u.getLimb(0) & 1) === 0) {
                u.halveM(); k++;
            }
            u.normalize();
            if (k === 0) return a.copy().mod(m).normalize().inverseMod(m);
            // Inverse mod u (odd).
            let dU;
            if (u.equals(1)) {
                dU = new bn.bn(0);
            } else {
                const aModU = a.copy().mod(u).normalize();
                dU = aModU.inverseMod(u);
                if (dU === false) return false;
            }
            // Inverse mod 2^k requires a to be odd.
            if ((a.getLimb(0) & 1) === 0) return false;
            const modK = _modPow2(k);
            const d2 = _hensel2adic(a, k).mod(modK).normalize();
            // CRT: d = dU + u · (((d2 - dU) · u^(-1)) mod 2^k)
            const uInv = _hensel2adic(u, k).mod(modK).normalize();
            const dUmod = dU.mod(modK).normalize();
            let diff;
            if (d2.greaterEquals(dUmod)) diff = d2.sub(dUmod).normalize();
            else diff = modK.add(d2).sub(dUmod).normalize();
            const t = diff.mul(uInv).mod(modK).normalize();
            const d = dU.add(u.mul(t)).normalize();
            return d.mod(m).normalize();
        }

        // ── integer division (binary long division) ─────────────────────
        // Returns { q, r } such that a = q · b + r and 0 ≤ r < b.
        // Used by _lcm and by rsa CRT. b must be > 0.
        function _bitAt(x, i) {
            const limbIdx = (i / 24) | 0;
            const off = i % 24;
            return (x.getLimb(limbIdx) >>> off) & 1;
        }
        function _setBit(x, i) {
            const limbIdx = (i / 24) | 0;
            const off = i % 24;
            while (x.limbs.length <= limbIdx) x.limbs.push(0);
            x.limbs[limbIdx] |= (1 << off);
        }
        function _divmod(a, b) {
            if (b.equals(0)) {
                console.error('[crypto] BUG: rsaKeygen: division by zero');
                return false;
            }
            if (!a.greaterEquals(b)) return { q: new bn.bn(0), r: a.copy().normalize() };
            const aLen = a.bitLength();
            const q = new bn.bn(0);
            const r = new bn.bn(0);
            for (let i = aLen - 1; i >= 0; i--) {
                r.doubleM();
                if (_bitAt(a, i)) {
                    if (r.limbs.length === 0) r.limbs.push(0);
                    r.limbs[0] |= 1;
                }
                r.normalize();
                if (r.greaterEquals(b)) {
                    r.subM(b); r.normalize();
                    _setBit(q, i);
                }
            }
            return { q: q.normalize(), r: r.normalize() };
        }

        // ── lcm via gcd (Euclidean over bn) ─────────────────────────────
        function _gcd(a, b) {
            a = a.copy(); b = b.copy();
            while (!b.equals(0)) {
                const t = a.mod(b);
                a = b; b = t;
            }
            return a;
        }
        function _lcm(a, b) {
            // Exact: lcm(a, b) = (a / gcd(a, b)) · b.
            const g = _gcd(a, b);
            if (g.equals(0)) return new bn.bn(0);
            // @ts-ignore - _divmod(a,g) is safe here: g.equals(0) is guarded above, so result is always {q,r}
            const { q: aOverG } = _divmod(a, g);
            return aOverG.mul(b).normalize();
        }

        /**
         * Generate an RSA key pair.
         *
         * @param {object}   [options]
         * @param {number}   [options.bits=2048]  Modulus length: 2048, 3072 or 4096.
         * @param {number}   [options.e=65537]    Public exponent (must be odd, ≥ 3).
         * @param {object}   [options.drbg]       SP 800-90A DRBG instance; defaults
         *                                        to `random.drbg()`.
         * @returns {{
         *   publicKey:  { n: Uint8Array, e: Uint8Array },
         *   privateKey: { n: Uint8Array, e: Uint8Array, d: Uint8Array,
         *                 p: Uint8Array, q: Uint8Array,
         *                 dp: Uint8Array, dq: Uint8Array, qInv: Uint8Array }
         * } | false}
         */
        function generate(options = {}) {
            const nlen = options.bits ?? 2048;
            const eVal = options.e    ?? 65537;
            if (![2048, 3072, 4096].includes(nlen)) {
                console.warn('[crypto] INVALID: rsaKeygen: bits must be 2048, 3072 or 4096');
                return false;
            }
            if (!Number.isInteger(eVal) || eVal < 3 || (eVal & 1) === 0) {
                console.warn('[crypto] INVALID: rsaKeygen: e must be an odd integer ≥ 3');
                return false;
            }
            const drbg = options.drbg ?? random.drbg();
            if (!drbg) return false;

            const eBn = new bn.bn(eVal);
            const ONE = new bn.bn(1);
            const halfBits = nlen >>> 1;

            const p = generateProbablePrime(halfBits, eBn, drbg);
            if (p === false) return false;

            // |p - q| > 2^(halfBits - 100) - enforce by retry.
            const minDeltaBits = halfBits - 100;
            let q;
            for (let attempt = 0; attempt < 100; attempt++) {
                q = generateProbablePrime(halfBits, eBn, drbg);
                if (q === false) return false;
                const diff = p.greaterEquals(q) ? p.sub(q).normalize() : q.sub(p).normalize();
                if (diff.bitLength() > minDeltaBits && !p.equals(q)) break;
                q = false;
            }
            if (q === false) {
                console.error('[crypto] BUG: rsaKeygen: could not satisfy |p-q| constraint');
                return false;
            }

            const n      = p.mul(q).normalize();
            const pMinus = p.sub(ONE).normalize();
            const qMinus = q.sub(ONE).normalize();
            const lambda = _lcm(pMinus, qMinus);

            const d = _inverseModAny(eBn, lambda);
            if (d === false) {
                console.error('[crypto] BUG: rsaKeygen: failed to invert e mod λ(n)');
                return false;
            }
            // FIPS 186-5 §A.1.1: require d > 2^(nlen/2).
            if (d.bitLength() <= halfBits) {
                console.warn('[crypto] rsaKeygen: d too small, retrying');
                return generate(options);
            }

            const dp   = d.mod(pMinus).normalize();
            const dq   = d.mod(qMinus).normalize();
            const qInv = q.inverseMod(p);
            if (qInv === false) {
                console.error('[crypto] BUG: rsaKeygen: failed to compute qInv');
                return false;
            }

            const nByteLen     = nlen >>> 3;
            const halfByteLen  = halfBits >>> 3;
            const eByteLen     = (eBn.bitLength() + 7) >>> 3;

            const nBytes  = _bnToBytes(n,    nByteLen);
            const eBytes  = _bnToBytes(eBn,  eByteLen);
            const dBytes  = _bnToBytes(d,    nByteLen);
            const pBytes  = _bnToBytes(p,    halfByteLen);
            const qBytes  = _bnToBytes(q,    halfByteLen);
            const dpBytes = _bnToBytes(dp,   halfByteLen);
            const dqBytes = _bnToBytes(dq,   halfByteLen);
            const qiBytes = _bnToBytes(qInv, halfByteLen);

            return {
                publicKey:  { n: nBytes, e: eBytes },
                privateKey: {
                    n: nBytes, e: eBytes, d: dBytes,
                    p: pBytes, q: qBytes,
                    dp: dpBytes, dq: dqBytes, qInv: qiBytes
                }
            };
        }

        return {
            generate,
            generateProbablePrime,
            // Internal primitives - exposed for KAT tests only. Not API.
            _internal: {
                millerRabin: _millerRabin,
                smallPrimes: _SMALL_PRIMES,
                divmod: _divmod,
                lcm: _lcm,
                inverseModAny: _inverseModAny
            }
        };
    }
};
