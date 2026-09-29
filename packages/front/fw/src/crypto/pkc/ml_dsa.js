// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview ML-DSA (Module-Lattice-based Digital Signature Algorithm).
 *
 * Implements FIPS 204 (a.k.a. CRYSTALS-Dilithium). Three parameter sets:
 * ML-DSA-44, ML-DSA-65, ML-DSA-87.
 *
 * Public API per parameter set:
 *   keygen(seed32?)            → { publicKey, secretKey }
 *   sign(msg, sk, ctx?, rnd?)  → signature  (or false on internal failure)
 *   verify(sig, msg, pk, ctx?) → boolean
 *
 * Determinism:
 *   - keygen(seed) is deterministic.
 *   - sign(msg, sk, ctx, rnd=zeros) is deterministic ("ML-DSA hedged with
 *     zero entropy", aka the FIPS 204 deterministic mode).
 *   - With no rnd, 32 random bytes are drawn from the CSPRNG.
 *
 * Hash bindings (FIPS 204 §3.7):
 *   H_eta uses SHAKE256 (CRH 64 bytes for tr / mu / rhoprime).
 *   ExpandA uses SHAKE128 reading "rho || j || i".
 *   ExpandS uses SHAKE256 reading "rhoprime || nonce".
 *   ExpandMask uses SHAKE256 reading "rhoprime || (kappa+i)".
 *   SampleInBall uses SHAKE256 reading "cTilde".
 *
 * NTT works over Z_q[X]/(X^256 + 1) with q = 8380417 (23 bits) and
 * ζ = 1753 (primitive 512-th root of unity).
 *
 */

import { sha3 } from '../hash/sha3.js';
import { bitArray } from '../utils/bitArray.js';
import { random } from '../utils/random.js';

/**
 * Byte sizes of every artefact of an ML-DSA parameter set.
 * @typedef {object} MlDsaLengths
 * @property {number} publicKey Public-key length in bytes.
 * @property {number} secretKey Secret-key length in bytes.
 * @property {number} signature Signature length in bytes.
 * @property {number} seed Keygen seed length (32).
 */

/**
 * One ML-DSA parameter-set instance (44 / 65 / 87).
 * @typedef {object} MlDsaInstance
 * @property {MlDsaLengths} lengths Byte sizes of every artefact.
 * @property {(seed?: Uint8Array) => ({ publicKey: Uint8Array, secretKey: Uint8Array }|false)} keygen Generate a key pair (deterministic for a 32-byte seed).
 * @property {(msg: Uint8Array, secretKey: Uint8Array, ctx?: Uint8Array, rnd?: Uint8Array) => (Uint8Array|false)} sign Pure ML-DSA sign.
 * @property {(sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array, ctx?: Uint8Array) => boolean} verify Pure ML-DSA verify.
 * @property {(msg: Uint8Array, secretKey: Uint8Array, hashAlg: string, hashMod: ({hash: Function, shake?: Function}|Function|null), ctx?: Uint8Array, rnd?: Uint8Array) => (Uint8Array|false)} signPh HashML-DSA sign.
 * @property {(sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array, hashAlg: string, hashMod: ({hash: Function, shake?: Function}|Function|null), ctx?: Uint8Array) => boolean} verifyPh HashML-DSA verify.
 * @property {{ signInternal: Function, verifyInternal: Function, signWithMu: Function, verifyWithMu: Function, wrapMessage: Function, wrapMessageHash: Function, computePh: Function }} _internal Test-only escape hatches.
 */

/**
 * Public API returned by `ml_dsa.factory()`.
 * @typedef {object} MlDsaAPI
 * @property {MlDsaInstance} ml_dsa44 ML-DSA-44 instance.
 * @property {MlDsaInstance} ml_dsa65 ML-DSA-65 instance.
 * @property {MlDsaInstance} ml_dsa87 ML-DSA-87 instance.
 * @property {(f: Int32Array) => Int32Array} _ntt Test-only NTT.
 * @property {(f: Int32Array) => Int32Array} _nttInv Test-only inverse NTT.
 */

export const ml_dsa = {
    name: 'ml_dsa',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: ['sha3', 'bitArray', 'random'],
    deps: [sha3, bitArray, random],

    /** @returns {MlDsaAPI} */
    factory(sha3, bitArray, random) {

        const N = 256;
        const Q = 8380417;            // 2^23 - 2^13 + 1
        // Q_HALF = (Q-1)>>>1 = 4190208 — FIPS 204 centered representation bound; unused here, kept for spec reference.
        const ROOT = 1753;
        const F_INV = 8347681;        // 256^-1 mod Q
        const D = 13;
        const GAMMA2_1 = ((Q - 1) / 88) | 0;     // 95232
        const GAMMA2_2 = ((Q - 1) / 32) | 0;     // 261888

        // ── shake / sha3 wrappers ────────────────────────────────────

        function _shake128(bytes, outBytes) {
            return bitArray.ba_to_ui8(sha3.shake128(bytes, outBytes * 8));
        }
        function _shake256(bytes, outBytes) {
            return bitArray.ba_to_ui8(sha3.shake256(bytes, outBytes * 8));
        }

        // ── modular arithmetic ───────────────────────────────────────

        function _mod(a, m) {
            m = m || Q;
            const r = a % m;
            return r < 0 ? r + m : r;
        }

        // Centered (signed) representative in [-(m-1)/2, m/2].
        function _smod(a, m) {
            m = m || Q;
            const r = _mod(a, m);
            return r > (m >>> 1) ? r - m : r;
        }

        // ── ζ table for full 256-th NTT (FIPS 204 Appendix B) ────────

        function _bitRev8(i) {
            let r = 0;
            for (let k = 0; k < 8; k++) r = (r << 1) | ((i >>> k) & 1);
            return r;
        }

        const ZETAS = (function () {
            const z = new Int32Array(256);
            for (let i = 0; i < 256; i++) {
                let acc = 1;
                const exp = _bitRev8(i);
                for (let j = 0; j < exp; j++) acc = (acc * ROOT) % Q;
                z[i] = acc;
            }
            return z;
        })();

        // ── NTT / NTT^-1 (FIPS 204 Algorithms 41 & 42) ───────────────

        function _ntt(f) {
            let k = 0;
            for (let len = 128; len >= 1; len >>>= 1) {
                for (let start = 0; start < N; start += 2 * len) {
                    k++;
                    const zeta = ZETAS[k];
                    for (let j = start; j < start + len; j++) {
                        const t = (zeta * f[j + len]) % Q;
                        f[j + len] = _mod(f[j] - t);
                        f[j]       = _mod(f[j] + t);
                    }
                }
            }
            return f;
        }

        function _nttInv(f) {
            let k = 256;
            for (let len = 1; len <= 128; len <<= 1) {
                for (let start = 0; start < N; start += 2 * len) {
                    k--;
                    const zeta = -ZETAS[k];
                    for (let j = start; j < start + len; j++) {
                        const t = f[j];
                        f[j]       = _mod(t + f[j + len]);
                        f[j + len] = (zeta * (t - f[j + len])) % Q;
                        f[j + len] = _mod(f[j + len]);
                    }
                }
            }
            for (let i = 0; i < N; i++) f[i] = _mod(F_INV * f[i]);
            return f;
        }

        // Pointwise product in NTT domain (full 256-th roots, no base case).
        function _multiplyNTTs(out, a, b) {
            for (let i = 0; i < N; i++) out[i] = _mod(a[i] * b[i]);
            return out;
        }

        function _polyAdd(a, b) {
            for (let i = 0; i < N; i++) a[i] = _mod(a[i] + b[i]);
            return a;
        }
        function _polySub(a, b) {
            for (let i = 0; i < N; i++) a[i] = _mod(a[i] - b[i]);
            return a;
        }

        // L∞-norm check on centered representatives.
        function _polyChknorm(p, B) {
            for (let i = 0; i < N; i++) {
                const v = _smod(p[i]);
                if ((v < 0 ? -v : v) >= B) return true;
            }
            return false;
        }

        // ── Power2Round / Decompose / MakeHint / UseHint ─────────────

        const D_POW = 1 << D;          // 8192
        const D_HALF = 1 << (D - 1);   // 4096

        function _power2Round(r) {
            const rPlus = _mod(r);
            const r0 = _smod(rPlus, D_POW);
            return { r1: ((rPlus - r0) / D_POW) | 0, r0 };
        }

        function _decompose(r, gamma2) {
            const rPlus = _mod(r);
            let r0 = _smod(rPlus, 2 * gamma2);
            if (rPlus - r0 === Q - 1) return { r1: 0, r0: r0 - 1 };
            return { r1: ((rPlus - r0) / (2 * gamma2)) | 0, r0 };
        }

        function _highBits(r, gamma2) { return _decompose(r, gamma2).r1; }
        function _lowBits(r, gamma2)  { return _decompose(r, gamma2).r0; }

        // FIPS 204 Algorithm 39 (Dilithium reference variant on transformed inputs).
        function _makeHint(z, r, gamma2) {
            return (z <= gamma2 || z > Q - gamma2 || (z === Q - gamma2 && r === 0)) ? 0 : 1;
        }

        function _useHint(h, r, gamma2) {
            const m = ((Q - 1) / (2 * gamma2)) | 0;
            const { r1, r0 } = _decompose(r, gamma2);
            if (h === 1) return r0 > 0 ? _mod(r1 + 1, m) : _mod(r1 - 1, m);
            return r1;
        }

        // ── bit packers ──────────────────────────────────────────────
        // Pack 256 d-bit words (LE) → 32*d bytes.

        function _packBits(values, d) {
            const out = new Uint8Array(32 * d);
            const mask = (1 << d) - 1;
            let buf = 0, bufLen = 0, pos = 0;
            for (let i = 0; i < values.length; i++) {
                buf |= (values[i] & mask) << bufLen;
                bufLen += d;
                while (bufLen >= 8) {
                    out[pos++] = buf & 0xff;
                    buf >>>= 8;
                    bufLen -= 8;
                }
            }
            return out;
        }

        function _unpackBits(bytes, d) {
            const out = new Int32Array(N);
            const mask = (1 << d) - 1;
            let buf = 0, bufLen = 0, pos = 0;
            for (let i = 0; i < bytes.length && pos < N; i++) {
                buf |= bytes[i] << bufLen;
                bufLen += 8;
                while (bufLen >= d && pos < N) {
                    out[pos++] = buf & mask;
                    buf >>>= d;
                    bufLen -= d;
                }
            }
            return out;
        }

        // SimpleBitPack / BitPack with maps (FIPS 204 §7).

        function _packETA(p, eta) {
            // map: x ∈ [-eta, eta] → eta - x ∈ [0, 2*eta]
            const tmp = new Int32Array(N);
            for (let i = 0; i < N; i++) tmp[i] = eta - _smod(p[i]);
            return _packBits(tmp, eta === 2 ? 3 : 4);
        }
        function _unpackETA(b, eta) {
            const raw = _unpackBits(b, eta === 2 ? 3 : 4);
            const out = new Int32Array(N);
            for (let i = 0; i < N; i++) out[i] = _mod(eta - raw[i]);
            return out;
        }

        function _packT0(p) {
            // map: x ∈ (-2^12, 2^12] → 2^12 - x ∈ [0, 2^13)
            const tmp = new Int32Array(N);
            for (let i = 0; i < N; i++) tmp[i] = D_HALF - _smod(p[i]);
            return _packBits(tmp, 13);
        }
        function _unpackT0(b) {
            const raw = _unpackBits(b, 13);
            const out = new Int32Array(N);
            for (let i = 0; i < N; i++) out[i] = _mod(D_HALF - raw[i]);
            return out;
        }

        function _packT1(p) { return _packBits(p, 10); }
        function _unpackT1(b) { return _unpackBits(b, 10); }

        function _packZ(p, gamma1) {
            const d = gamma1 === (1 << 17) ? 18 : 20;
            const tmp = new Int32Array(N);
            for (let i = 0; i < N; i++) tmp[i] = gamma1 - _smod(p[i]);
            return _packBits(tmp, d);
        }
        function _unpackZ(b, gamma1) {
            const d = gamma1 === (1 << 17) ? 18 : 20;
            const raw = _unpackBits(b, d);
            const out = new Int32Array(N);
            for (let i = 0; i < N; i++) out[i] = _mod(gamma1 - raw[i]);
            return out;
        }

        function _packW1(p, gamma2) {
            const d = gamma2 === GAMMA2_1 ? 6 : 4;
            return _packBits(p, d);
        }

        // ── Sampling primitives ──────────────────────────────────────

        // FIPS 204 Algorithm 14: RejNTTPoly. Read 3 bytes at a time, accept t < Q.
        const _XOF128_BYTES = 5184;   // 31 SHAKE128 blocks (168·31). Empirically safe.

        function _rejNTTPoly(rho, j, i) {
            const inp = new Uint8Array(rho.length + 2);
            inp.set(rho, 0);
            inp[rho.length]     = j;
            inp[rho.length + 1] = i;
            let buf = _shake128(inp, _XOF128_BYTES);
            const out = new Int32Array(N);
            let pos = 0;
            for (let k = 0; k + 3 <= buf.length && pos < N; k += 3) {
                const t = (buf[k] | (buf[k + 1] << 8) | (buf[k + 2] << 16)) & 0x7fffff;
                if (t < Q) out[pos++] = t;
            }
            if (pos < N) {
                buf = _shake128(inp, _XOF128_BYTES * 4);
                pos = 0;
                for (let k = 0; k + 3 <= buf.length && pos < N; k += 3) {
                    const t = (buf[k] | (buf[k + 1] << 8) | (buf[k + 2] << 16)) & 0x7fffff;
                    if (t < Q) out[pos++] = t;
                }
            }
            return out;
        }

        // FIPS 204 Algorithm 15: RejBoundedPoly using ExpandS.
        const _XOF256_BYTES = 1632;    // 12 SHAKE256 blocks.

        // Returns null on reject - a number sentinel (e.g. -1) would collide
        // with the valid η=4, nibble=5 coefficient 4-5 = -1.
        function _coefFromHalfByte(n, eta) {
            if (eta === 2) return n < 15 ? 2 - (n % 5) : null;
            return n < 9 ? 4 - n : null;
        }

        function _rejBoundedPoly(rhoPrime, nonce, eta) {
            const inp = new Uint8Array(rhoPrime.length + 2);
            inp.set(rhoPrime, 0);
            inp[rhoPrime.length]     = nonce & 0xff;
            inp[rhoPrime.length + 1] = (nonce >>> 8) & 0xff;
            let buf = _shake256(inp, _XOF256_BYTES);
            const out = new Int32Array(N);
            let pos = 0;
            for (let k = 0; k < buf.length && pos < N; k++) {
                const d1 = _coefFromHalfByte(buf[k] & 0x0f, eta);
                const d2 = _coefFromHalfByte((buf[k] >>> 4) & 0x0f, eta);
                if (d1 !== null) out[pos++] = _mod(d1);
                if (pos < N && d2 !== null) out[pos++] = _mod(d2);
            }
            if (pos < N) {
                buf = _shake256(inp, _XOF256_BYTES * 4);
                pos = 0;
                for (let k = 0; k < buf.length && pos < N; k++) {
                    const d1 = _coefFromHalfByte(buf[k] & 0x0f, eta);
                    const d2 = _coefFromHalfByte((buf[k] >>> 4) & 0x0f, eta);
                    if (d1 !== null) out[pos++] = _mod(d1);
                    if (pos < N && d2 !== null) out[pos++] = _mod(d2);
                }
            }
            return out;
        }

        // FIPS 204 Algorithm 34: ExpandMask. One ZCoder polynomial per L row.
        function _expandMask(rhoPrime, kappa_i, gamma1) {
            const d = gamma1 === (1 << 17) ? 18 : 20;
            const bytesLen = 32 * d;
            const inp = new Uint8Array(rhoPrime.length + 2);
            inp.set(rhoPrime, 0);
            inp[rhoPrime.length]     = kappa_i & 0xff;
            inp[rhoPrime.length + 1] = (kappa_i >>> 8) & 0xff;
            const buf = _shake256(inp, bytesLen);
            return _unpackZ(buf, gamma1);
        }

        // FIPS 204 Algorithm 29: SampleInBall.
        function _sampleInBall(cTilde, tau) {
            // Need first 8 bytes for sign mask, then rejection-sampled positions.
            // Worst-case bytes for tau=60, N=256 well under 4 KiB.
            const buf = _shake256(cTilde, 4096);
            const c = new Int32Array(N);
            const masks = buf.subarray(0, 8);
            let pos = 8, maskBit = 0, maskByte = 0;
            for (let i = N - tau; i < N; i++) {
                let b = i + 1;
                while (b > i) {
                    if (pos >= buf.length) {
                        console.error('[crypto] BUG: ml_dsa: SampleInBall buffer exhausted');
                        return false;
                    }
                    b = buf[pos++];
                }
                c[i] = c[b];
                c[b] = 1 - (((masks[maskByte] >>> maskBit) & 1) << 1);
                maskBit++;
                if (maskBit >= 8) { maskBit = 0; maskByte++; }
            }
            return c;
        }

        // ── ML-DSA core (parameterised) ──────────────────────────────

        function _make(P) {
            const { K, L, GAMMA1, GAMMA2, TAU, ETA, OMEGA, C_TILDE_BYTES } = P;
            const TR_BYTES  = 64;
            const CRH_BYTES = 64;
            const BETA = TAU * ETA;
            const Z_BYTES = 32 * (GAMMA1 === (1 << 17) ? 18 : 20);
            const W1_BYTES = 32 * (GAMMA2 === GAMMA2_1 ? 6 : 4);
            const ETA_D    = ETA === 2 ? 3 : 4;
            const SK_S_LEN = 32 * ETA_D;

            const PK_LEN  = 32 + K * 32 * 10;                                    // rho || pkT1
            const SK_LEN  = 32 + 32 + TR_BYTES + L * SK_S_LEN + K * SK_S_LEN + K * 32 * 13;
            const SIG_LEN = C_TILDE_BYTES + L * Z_BYTES + (OMEGA + K);

            // ── encode/decode high-level structures ──────────────────

            function _encodePK(rho, t1) {
                const out = new Uint8Array(PK_LEN);
                out.set(rho, 0);
                for (let i = 0; i < K; i++) out.set(_packT1(t1[i]), 32 + i * 320);
                return out;
            }
            function _decodePK(pk) {
                const rho = pk.subarray(0, 32);
                const t1 = new Array(K);
                for (let i = 0; i < K; i++) t1[i] = _unpackT1(pk.subarray(32 + i * 320, 32 + (i + 1) * 320));
                return { rho, t1 };
            }

            function _encodeSK(rho, K_, tr, s1, s2, t0) {
                const out = new Uint8Array(SK_LEN);
                let off = 0;
                out.set(rho, off); off += 32;
                out.set(K_, off);  off += 32;
                out.set(tr, off);  off += TR_BYTES;
                for (let i = 0; i < L; i++) { out.set(_packETA(s1[i], ETA), off); off += SK_S_LEN; }
                for (let i = 0; i < K; i++) { out.set(_packETA(s2[i], ETA), off); off += SK_S_LEN; }
                for (let i = 0; i < K; i++) { out.set(_packT0(t0[i]),       off); off += 32 * 13; }
                return out;
            }
            function _decodeSK(sk) {
                let off = 0;
                const rho = sk.subarray(off, off + 32); off += 32;
                const K_  = sk.subarray(off, off + 32); off += 32;
                const tr  = sk.subarray(off, off + TR_BYTES); off += TR_BYTES;
                const s1 = new Array(L);
                for (let i = 0; i < L; i++) { s1[i] = _unpackETA(sk.subarray(off, off + SK_S_LEN), ETA); off += SK_S_LEN; }
                const s2 = new Array(K);
                for (let i = 0; i < K; i++) { s2[i] = _unpackETA(sk.subarray(off, off + SK_S_LEN), ETA); off += SK_S_LEN; }
                const t0 = new Array(K);
                for (let i = 0; i < K; i++) { t0[i] = _unpackT0(sk.subarray(off, off + 32 * 13)); off += 32 * 13; }
                return { rho, K_, tr, s1, s2, t0 };
            }

            function _encodeHint(h) {
                const out = new Uint8Array(OMEGA + K);
                let k = 0;
                for (let i = 0; i < K; i++) {
                    for (let j = 0; j < N; j++) if (h[i][j] !== 0) out[k++] = j;
                    out[OMEGA + i] = k;
                }
                return out;
            }
            function _decodeHint(buf) {
                const h = new Array(K);
                let k = 0;
                for (let i = 0; i < K; i++) {
                    const hi = new Int32Array(N);
                    if (buf[OMEGA + i] < k || buf[OMEGA + i] > OMEGA) return false;
                    for (let j = k; j < buf[OMEGA + i]; j++) {
                        if (j > k && buf[j] <= buf[j - 1]) return false;
                        hi[buf[j]] = 1;
                    }
                    k = buf[OMEGA + i];
                    h[i] = hi;
                }
                for (let j = k; j < OMEGA; j++) if (buf[j] !== 0) return false;
                return h;
            }

            function _encodeSig(cTilde, z, h) {
                const out = new Uint8Array(SIG_LEN);
                out.set(cTilde, 0);
                let off = C_TILDE_BYTES;
                for (let i = 0; i < L; i++) { out.set(_packZ(z[i], GAMMA1), off); off += Z_BYTES; }
                out.set(_encodeHint(h), off);
                return out;
            }
            function _decodeSig(sig) {
                const cTilde = sig.subarray(0, C_TILDE_BYTES);
                const z = new Array(L);
                let off = C_TILDE_BYTES;
                for (let i = 0; i < L; i++) { z[i] = _unpackZ(sig.subarray(off, off + Z_BYTES), GAMMA1); off += Z_BYTES; }
                const h = _decodeHint(sig.subarray(off));
                return { cTilde, z, h };
            }

            // ── keygen (FIPS 204 Algorithm 1 / §6.1) ────────────────

            function keygen(seed) {
                if (seed && seed.length !== 32) {
                    console.warn('[crypto] INVALID: ml_dsa: seed must be 32 bytes');
                    return false;
                }
                const _seed = seed || random.bytes(32);
                const seedDst = new Uint8Array(34);
                seedDst.set(_seed, 0);
                seedDst[32] = K;
                seedDst[33] = L;
                const expanded = _shake256(seedDst, 128);   // (rho, rhoprime, K)
                const rho       = expanded.subarray(0, 32);
                const rhoPrime  = expanded.subarray(32, 96);
                const K_        = expanded.subarray(96, 128);

                const s1 = new Array(L);
                for (let i = 0; i < L; i++) s1[i] = _rejBoundedPoly(rhoPrime, i, ETA);
                const s2 = new Array(K);
                for (let i = 0; i < K; i++) s2[i] = _rejBoundedPoly(rhoPrime, L + i, ETA);

                const s1Hat = new Array(L);
                for (let i = 0; i < L; i++) {
                    s1Hat[i] = new Int32Array(s1[i]);
                    _ntt(s1Hat[i]);
                }

                const t0 = new Array(K);
                const t1 = new Array(K);
                const tmp = new Int32Array(N);
                for (let i = 0; i < K; i++) {
                    const t = new Int32Array(N);
                    for (let j = 0; j < L; j++) {
                        const aij = _rejNTTPoly(rho, j, i);
                        _multiplyNTTs(tmp, aij, s1Hat[j]);
                        _polyAdd(t, tmp);
                    }
                    _nttInv(t);
                    _polyAdd(t, s2[i]);
                    const r0 = new Int32Array(N), r1 = new Int32Array(N);
                    for (let k = 0; k < N; k++) {
                        const pr = _power2Round(t[k]);
                        r0[k] = pr.r0; r1[k] = pr.r1;
                    }
                    t0[i] = r0; t1[i] = r1;
                }

                const publicKey = _encodePK(rho, t1);
                const tr = _shake256(publicKey, TR_BYTES);
                const secretKey = _encodeSK(rho, K_, tr, s1, s2, t0);
                return { publicKey, secretKey };
            }

            // ── prefix message with FIPS 204 §5.4 wrapper ───────────

            function _wrapMessage(msg, ctx) {
                const _ctx = ctx || new Uint8Array(0);
                if (_ctx.length > 255) {
                    console.warn('[crypto] INVALID: ml_dsa: context too long');
                    return false;
                }
                const out = new Uint8Array(2 + _ctx.length + msg.length);
                out[0] = 0;
                out[1] = _ctx.length;
                out.set(_ctx, 2);
                out.set(msg, 2 + _ctx.length);
                return out;
            }

            // ── HashML-DSA wrapper (FIPS 204 §5.4 Algorithm 4) ──────────
            // Iteration E3 of the FIPS 140-3 upgrade plan.
            //
            //   M' = 0x01 || OctetEncode(|ctx|, 1) || ctx || OID(hashAlg) || PH(message)
            //
            // OID is the DER-encoded ASN.1 OBJECT IDENTIFIER of the hash
            // function (11 bytes : 06 09 60 86 48 01 65 03 04 02 XX).

            // Hash algorithm names match ACVP convention (mixed `SHA2-`, `SHA-`,
            // `SHA3-`, `SHAKE-` prefixes - mirror as-is for byte-exact ACVP
            // replay compatibility).
            const _HASH_OIDS = {
                'SHA2-224':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x04]),
                'SHA2-256':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x01]),
                'SHA2-384':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x02]),
                'SHA2-512':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x03]),
                'SHA2-512/224': new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x05]),
                'SHA2-512/256': new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x06]),
                'SHA3-224':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x07]),
                'SHA3-256':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x08]),
                'SHA3-384':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x09]),
                'SHA3-512':     new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x0A]),
                'SHAKE-128':    new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x0B]),
                'SHAKE-256':    new Uint8Array([0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x0C]),
            };

            // Caller provides the prehash bytes (PH(message) per FIPS 204
            // §5.4.1). The function builds the OID-prefixed wrapper M'.
            // Validation of `prehash.length` against `hashAlg` is the
            // caller's responsibility (HashML-DSA accepts variable digest
            // sizes per hashAlg).
            function _wrapMessageHash(prehash, ctx, hashAlg) {
                const _ctx = ctx || new Uint8Array(0);
                if (_ctx.length > 255) {
                    console.warn('[crypto] INVALID: ml_dsa: context too long');
                    return false;
                }
                const oid = _HASH_OIDS[hashAlg];
                if (!oid) {
                    console.warn('[crypto] INVALID: ml_dsa: unknown hashAlg "' + hashAlg + '"');
                    return false;
                }
                const out = new Uint8Array(2 + _ctx.length + oid.length + prehash.length);
                out[0] = 1;                                  // 0x01 = HashML-DSA discriminator
                out[1] = _ctx.length;
                out.set(_ctx, 2);
                out.set(oid, 2 + _ctx.length);
                out.set(prehash, 2 + _ctx.length + oid.length);
                return out;
            }

            // ── sign (FIPS 204 Algorithm 2 / §6.2) ──────────────────

            // Iteration E3 of the FIPS 140-3 upgrade plan - sign refactor:
            // extract `_signFromMu(mu, sk, rnd)` so callers may bypass the
            // §5.4 wrapping (internal interface) or supply a pre-computed mu
            // (externalMu, useful when the same key signs many messages with
            // a shared `tr`-based prefix).
            //
            // ## Rejection-loop side-channel posture (FIPS 204 §5.6 step 23+)
            //
            // The loop body performs deterministic NTT / scalar operations
            // and uses `_polyChknorm` to test whether the candidate (z, r0,
            // ct0, hint count) lies in the valid range. The `break`/`continue`
            // statements leak ONLY the rejection event itself - i.e. the
            // **number of iterations** before success - which is the
            // unavoidable timing signal inherent to FIPS 204 rejection
            // sampling. No additional secret-dependent branches happen
            // inside one iteration: every byte of the NTT polynomials is
            // touched on every loop pass, and the secret s1Hat / s2Hat / t0Hat
            // are consumed in fixed-iteration `_multiplyNTTs` calls.
            // This matches the reference implementation's posture; see
            // FIPS 204 §A.3 (informational side-channel discussion).
            function _signFromMu(mu, secretKey, rnd) {
                if (!(mu instanceof Uint8Array) || mu.length !== CRH_BYTES) {
                    console.warn('[crypto] INVALID: ml_dsa: mu must be ' + CRH_BYTES + ' bytes');
                    return false;
                }
                if (secretKey.length !== SK_LEN) {
                    console.warn('[crypto] INVALID: ml_dsa: wrong secretKey length');
                    return false;
                }
                const _rnd = rnd || new Uint8Array(32);
                if (_rnd.length !== 32) {
                    console.warn('[crypto] INVALID: ml_dsa: rnd must be 32 bytes');
                    return false;
                }

                const { rho, K_, s1, s2, t0 } = _decodeSK(secretKey);
                // Cache A in NTT.
                const A = new Array(K);
                for (let i = 0; i < K; i++) {
                    A[i] = new Array(L);
                    for (let j = 0; j < L; j++) A[i][j] = _rejNTTPoly(rho, j, i);
                }
                const s1Hat = new Array(L);
                for (let i = 0; i < L; i++) { s1Hat[i] = new Int32Array(s1[i]); _ntt(s1Hat[i]); }
                const s2Hat = new Array(K);
                for (let i = 0; i < K; i++) { s2Hat[i] = new Int32Array(s2[i]); _ntt(s2Hat[i]); }
                const t0Hat = new Array(K);
                for (let i = 0; i < K; i++) { t0Hat[i] = new Int32Array(t0[i]); _ntt(t0Hat[i]); }

                // rhoprime = SHAKE256(K || rnd || mu, 64)
                const rpIn = new Uint8Array(32 + 32 + CRH_BYTES);
                rpIn.set(K_, 0); rpIn.set(_rnd, 32); rpIn.set(mu, 64);
                const rhoPrime = _shake256(rpIn, CRH_BYTES);

                let kappa = 0;
                const tmp = new Int32Array(N);
                for (let attempt = 0; attempt < 1000; attempt++) {
                    // y = ExpandMask(rhoPrime, kappa..kappa+L-1)
                    const y = new Array(L);
                    for (let i = 0; i < L; i++) y[i] = _expandMask(rhoPrime, kappa + i, GAMMA1);
                    // z_ntt = NTT(y) - copies needed since we mutate
                    const yHat = new Array(L);
                    for (let i = 0; i < L; i++) { yHat[i] = new Int32Array(y[i]); _ntt(yHat[i]); }
                    // w = NTT^-1(A * yHat)
                    const w = new Array(K);
                    for (let i = 0; i < K; i++) {
                        const wi = new Int32Array(N);
                        for (let j = 0; j < L; j++) {
                            _multiplyNTTs(tmp, A[i][j], yHat[j]);
                            _polyAdd(wi, tmp);
                        }
                        _nttInv(wi);
                        w[i] = wi;
                    }
                    const w1 = new Array(K);
                    for (let i = 0; i < K; i++) {
                        w1[i] = new Int32Array(N);
                        for (let k = 0; k < N; k++) w1[i][k] = _highBits(w[i][k], GAMMA2);
                    }
                    // cTilde = SHAKE256(mu || w1Encode, 2λ)
                    const w1Bytes = new Uint8Array(K * W1_BYTES);
                    for (let i = 0; i < K; i++) w1Bytes.set(_packW1(w1[i], GAMMA2), i * W1_BYTES);
                    const cIn = new Uint8Array(CRH_BYTES + w1Bytes.length);
                    cIn.set(mu, 0); cIn.set(w1Bytes, CRH_BYTES);
                    const cTilde = _shake256(cIn, C_TILDE_BYTES);

                    const c = _sampleInBall(cTilde, TAU);
                    if (c === false) return false;
                    const cHat = new Int32Array(c); _ntt(cHat);

                    // z = y + NTT^-1(cHat * s1Hat)
                    const z = new Array(L);
                    let bad = false;
                    for (let i = 0; i < L; i++) {
                        const cs1 = new Int32Array(N);
                        _multiplyNTTs(cs1, cHat, s1Hat[i]);
                        _nttInv(cs1);
                        _polyAdd(cs1, y[i]);
                        if (_polyChknorm(cs1, GAMMA1 - BETA)) { bad = true; break; }
                        z[i] = cs1;
                    }
                    if (bad) { kappa += L; continue; }

                    // r0 = LowBits(w - NTT^-1(cHat * s2Hat));  ct0 = NTT^-1(cHat * t0Hat)
                    let cnt = 0;
                    const h = new Array(K);
                    let validRound = true;
                    for (let i = 0; i < K; i++) {
                        const cs2 = new Int32Array(N);
                        _multiplyNTTs(cs2, cHat, s2Hat[i]);
                        _nttInv(cs2);
                        const wMinusCs2 = new Int32Array(w[i]);
                        _polySub(wMinusCs2, cs2);
                        const r0 = new Int32Array(N);
                        for (let k = 0; k < N; k++) r0[k] = _lowBits(wMinusCs2[k], GAMMA2);
                        if (_polyChknorm(r0, GAMMA2 - BETA)) { validRound = false; break; }

                        const ct0 = new Int32Array(N);
                        _multiplyNTTs(ct0, cHat, t0Hat[i]);
                        _nttInv(ct0);
                        if (_polyChknorm(ct0, GAMMA2)) { validRound = false; break; }

                        // r0' = r0 + ct0 (mod q, signed)
                        const r0p = new Int32Array(N);
                        for (let k = 0; k < N; k++) r0p[k] = _mod(r0[k] + ct0[k]);

                        // hint at position k = MakeHint(r0p[k], w1[i][k])
                        const hi = new Int32Array(N);
                        for (let k = 0; k < N; k++) {
                            hi[k] = _makeHint(r0p[k], w1[i][k], GAMMA2);
                            cnt += hi[k];
                        }
                        h[i] = hi;
                    }
                    if (!validRound) { kappa += L; continue; }
                    if (cnt > OMEGA) { kappa += L; continue; }

                    return _encodeSig(cTilde, z, h);
                }
                console.error('[crypto] BUG: ml_dsa: signing exceeded retry budget');
                return false;
            }

            // Compute mu = SHAKE256(tr || M, CRH_BYTES) and call _signFromMu.
            // M is the (already prepared) message bytes - caller is
            // responsible for the FIPS 204 §5.4 wrapper.
            function _signInternal(M, secretKey, rnd) {
                if (secretKey.length !== SK_LEN) {
                    console.warn('[crypto] INVALID: ml_dsa: wrong secretKey length');
                    return false;
                }
                const { tr } = _decodeSK(secretKey);
                const muIn = new Uint8Array(tr.length + M.length);
                muIn.set(tr, 0); muIn.set(M, tr.length);
                const mu = _shake256(muIn, CRH_BYTES);
                return _signFromMu(mu, secretKey, rnd);
            }

            /**
             * Pure ML-DSA sign (FIPS 204 §5.4 PureML-DSA + §6.2 internal).
             * Wraps the message with the §5.4 prefix `0x00 || |ctx| || ctx ||
             * msg` then calls the internal signing path.
             */
            function sign(msg, secretKey, ctx, rnd) {
                const M = _wrapMessage(msg, ctx);
                if (M === false) return false;
                return _signInternal(M, secretKey, rnd);
            }

            /**
             * HashML-DSA sign (FIPS 204 §5.4 Algorithm 4). Caller passes the
             * **raw** message ; we compute PH(message) using the supplied hash
             * module then build the FIPS 204 OID-prefixed wrapper and sign.
             *
             * @param {Uint8Array} msg
             * @param {Uint8Array} secretKey
             * @param {string} hashAlg One of the keys of `_HASH_OIDS`.
             * @param {{hash:Function,shake?:Function}|null} hashMod hash module
             *     (sha256, sha384, ...). For SHAKE-128/-256 the module must
             *     expose `(data, outBits) => bitArray` (cf. sha3.js).
             * @param {Uint8Array} [ctx]
             * @param {Uint8Array} [rnd]
             */
            function signPh(msg, secretKey, hashAlg, hashMod, ctx, rnd) {
                const ph = _computePh(msg, hashAlg, hashMod);
                if (ph === false) return false;
                const M = _wrapMessageHash(ph, ctx, hashAlg);
                if (M === false) return false;
                return _signInternal(M, secretKey, rnd);
            }

            // Compute PH(msg) per FIPS 204 §5.4.1 - hash modules from this
            // codebase consume either a string or a bitArray (NOT Uint8Array)
            // and return a bitArray. We convert msg → bitArray, hash, then
            // bitArray → bytes. For SHAKE outputs : truncate to 256 bits
            // (SHAKE-128) or 512 bits (SHAKE-256) per FIPS 204 standard digest
            // sizes (cf. _HASH_OIDS).
            function _computePh(msg, hashAlg, hashMod) {
                if (!hashMod) {
                    console.warn('[crypto] INVALID: ml_dsa: signPh requires a hashMod');
                    return false;
                }
                const msgBa = (msg instanceof Uint8Array) ? bitArray.ui8_to_ba(msg) : msg;
                if (hashAlg === 'SHAKE-128' || hashAlg === 'SHAKE-256') {
                    if (typeof hashMod !== 'function') {
                        console.warn('[crypto] INVALID: ml_dsa: SHAKE hashMod must be a callable (data, outBits)');
                        return false;
                    }
                    const outBits = hashAlg === 'SHAKE-128' ? 256 : 512;
                    const ba = hashMod(msgBa, outBits);
                    if (ba === false) return false;
                    return _baToBytes(ba);
                }
                if (typeof hashMod.hash !== 'function') {
                    console.warn('[crypto] INVALID: ml_dsa: hashMod must expose .hash(data)');
                    return false;
                }
                return _baToBytes(hashMod.hash(msgBa));
            }
            // Best-effort bitArray → Uint8Array (lazy require to avoid cyclic
            // factory dependency : caller injects bitArray as the second
            // factory dep, already in scope).
            function _baToBytes(ba) {
                if (ba instanceof Uint8Array) return ba;
                return bitArray.ba_to_ui8(ba);
            }

            // ── verify (FIPS 204 Algorithm 3 / §6.3) ────────────────

            // Verify against a pre-computed mu (externalMu / internal path).
            function _verifyFromMu(sig, mu, publicKey) {
                if (sig.length !== SIG_LEN) return false;
                if (publicKey.length !== PK_LEN) return false;
                if (!(mu instanceof Uint8Array) || mu.length !== CRH_BYTES) return false;

                const { rho, t1 } = _decodePK(publicKey);
                const dec = _decodeSig(sig);
                if (dec.h === false) return false;
                const { cTilde, z, h } = dec;
                for (let i = 0; i < L; i++) if (_polyChknorm(z[i], GAMMA1 - BETA)) return false;

                const c = _sampleInBall(cTilde, TAU);
                if (c === false) return false;
                const cHat = new Int32Array(c); _ntt(cHat);

                // wApprox = NTT^-1(A * NTT(z) - cHat * NTT(t1 << D))
                const zHat = new Array(L);
                for (let i = 0; i < L; i++) { zHat[i] = new Int32Array(z[i]); _ntt(zHat[i]); }

                const wTick1 = new Array(K);
                const tmp = new Int32Array(N);
                for (let i = 0; i < K; i++) {
                    const t1Shift = new Int32Array(N);
                    for (let k = 0; k < N; k++) t1Shift[k] = _mod(t1[i][k] << D);
                    _ntt(t1Shift);
                    const ct12d = new Int32Array(N);
                    _multiplyNTTs(ct12d, cHat, t1Shift);
                    const Az = new Int32Array(N);
                    for (let j = 0; j < L; j++) {
                        const aij = _rejNTTPoly(rho, j, i);
                        _multiplyNTTs(tmp, aij, zHat[j]);
                        _polyAdd(Az, tmp);
                    }
                    _polySub(Az, ct12d);
                    _nttInv(Az);
                    const w = new Int32Array(N);
                    for (let k = 0; k < N; k++) w[k] = _useHint(h[i][k], Az[k], GAMMA2);
                    wTick1[i] = w;
                }

                let hCount = 0;
                for (let i = 0; i < K; i++)
                    for (let k = 0; k < N; k++) hCount += h[i][k];
                if (hCount > OMEGA) return false;

                const w1Bytes = new Uint8Array(K * W1_BYTES);
                for (let i = 0; i < K; i++) w1Bytes.set(_packW1(wTick1[i], GAMMA2), i * W1_BYTES);
                const cIn = new Uint8Array(CRH_BYTES + w1Bytes.length);
                cIn.set(mu, 0); cIn.set(w1Bytes, CRH_BYTES);
                const cTilde2 = _shake256(cIn, C_TILDE_BYTES);

                if (cTilde.length !== cTilde2.length) return false;
                let diff = 0;
                for (let i = 0; i < cTilde.length; i++) diff |= cTilde[i] ^ cTilde2[i];
                return diff === 0;
            }

            // Compute mu from (publicKey-derived tr) || M, then verify.
            function _verifyInternal(sig, M, publicKey) {
                if (publicKey.length !== PK_LEN) return false;
                const tr = _shake256(publicKey, TR_BYTES);
                const muIn = new Uint8Array(tr.length + M.length);
                muIn.set(tr, 0); muIn.set(M, tr.length);
                const mu = _shake256(muIn, CRH_BYTES);
                return _verifyFromMu(sig, mu, publicKey);
            }

            /** Pure ML-DSA verify (FIPS 204 §5.4 PureML-DSA + §6.3). */
            function verify(sig, msg, publicKey, ctx) {
                const M = _wrapMessage(msg, ctx);
                if (M === false) return false;
                return _verifyInternal(sig, M, publicKey);
            }

            /** HashML-DSA verify (FIPS 204 §5.4 Algorithm 5). */
            function verifyPh(sig, msg, publicKey, hashAlg, hashMod, ctx) {
                const ph = _computePh(msg, hashAlg, hashMod);
                if (ph === false) return false;
                const M = _wrapMessageHash(ph, ctx, hashAlg);
                if (M === false) return false;
                return _verifyInternal(sig, M, publicKey);
            }

            return {
                lengths: Object.freeze({
                    publicKey: PK_LEN, secretKey: SK_LEN, signature: SIG_LEN, seed: 32
                }),
                keygen, sign, verify,
                // Iteration E3 of the FIPS 140-3 upgrade plan - HashML-DSA
                // (FIPS 204 §5.4 Algorithms 4 + 5).
                signPh, verifyPh,
                // Internal escape hatches (test-only). signInternal and
                // verifyInternal expose the §6.2/§6.3 raw paths (no §5.4
                // wrapping). signWithMu / verifyWithMu accept a pre-computed
                // mu for the externalMu API mode.
                _internal: {
                    signInternal:    _signInternal,
                    verifyInternal:  _verifyInternal,
                    signWithMu:      _signFromMu,
                    verifyWithMu:    _verifyFromMu,
                    wrapMessage:     _wrapMessage,
                    wrapMessageHash: _wrapMessageHash,
                    computePh:       _computePh
                }
            };
        }

        const PARAMS = {
            44: { K: 4, L: 4, GAMMA1: 1 << 17, GAMMA2: GAMMA2_1, TAU: 39, ETA: 2, OMEGA: 80, C_TILDE_BYTES: 32 },
            65: { K: 6, L: 5, GAMMA1: 1 << 19, GAMMA2: GAMMA2_2, TAU: 49, ETA: 4, OMEGA: 55, C_TILDE_BYTES: 48 },
            87: { K: 8, L: 7, GAMMA1: 1 << 19, GAMMA2: GAMMA2_2, TAU: 60, ETA: 2, OMEGA: 75, C_TILDE_BYTES: 64 }
        };

        return {
            ml_dsa44: _make(PARAMS[44]),
            ml_dsa65: _make(PARAMS[65]),
            ml_dsa87: _make(PARAMS[87]),
            // exposed for testing
            _ntt, _nttInv
        };
    }
};
