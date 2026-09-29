// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview ML-KEM (Module-Lattice-based Key-Encapsulation Mechanism).
 *
 * Implements FIPS 203 (a.k.a. CRYSTALS-Kyber). Provides three parameter
 * sets: ML-KEM-512 / 768 / 1024.
 *
 * Public API per parameter set:
 *   keygen(seed64?)  → { publicKey, secretKey }
 *   encapsulate(pk, msg32?) → { cipherText, sharedSecret }
 *   decapsulate(ct, sk) → sharedSecret  (32 bytes)
 *   lengths              - byte sizes of every artefact
 *
 * Determinism:
 *   - keygen(seed) is deterministic for a fixed 64-byte seed (d || z).
 *   - encapsulate(pk, msg) is deterministic for a fixed 32-byte msg.
 *   - With no argument, both draw from the CSPRNG.
 *
 * Internals follow FIPS 203 directly (Algorithms 9-21 + Section 4 helpers):
 *   - NTT / NTT^-1 over Z_q[X]/(X^256 + 1) with q = 3329, ζ = 17.
 *   - K-PKE.KeyGen / Encrypt / Decrypt as the inner trapdoor scheme.
 *   - Fujisaki-Okamoto transform with implicit reject (re-encrypt + compare).
 *
 * Hash bindings:
 *   G  = SHA3-512    (FIPS 202)
 *   H  = SHA3-256
 *   J  = SHAKE256(_, 32)         - KDF for implicit reject
 *   PRF_eta(s, b)  = SHAKE256(s || b, 64*eta)
 *   XOF(rho, j, i) = SHAKE128(rho || j || i, ...)   - squeezed in bulk
 *
 */

import { sha3 } from '../hash/sha3.js';
import { bitArray } from '../utils/bitArray.js';
import { random } from '../utils/random.js';

/**
 * Byte sizes of every artefact of an ML-KEM parameter set.
 * @typedef {object} MlKemLengths
 * @property {number} publicKey Encapsulation-key length in bytes.
 * @property {number} secretKey Decapsulation-key length in bytes.
 * @property {number} cipherText Ciphertext length in bytes.
 * @property {number} sharedSecret Shared-secret length (32).
 * @property {number} seed Keygen seed length (64).
 * @property {number} msg Encapsulation message length (32).
 */

/**
 * One ML-KEM parameter-set instance (512 / 768 / 1024).
 * @typedef {object} MlKemInstance
 * @property {MlKemLengths} lengths Byte sizes of every artefact.
 * @property {(seed?: Uint8Array) => ({ publicKey: Uint8Array, secretKey: Uint8Array }|false)} keygen Generate a key pair (deterministic for a 64-byte seed).
 * @property {(publicKey: Uint8Array, msg?: Uint8Array) => ({ cipherText: Uint8Array, sharedSecret: Uint8Array }|false)} encapsulate Encapsulate to a public key.
 * @property {(cipherText: Uint8Array, secretKey: Uint8Array) => (Uint8Array|false)} decapsulate Decapsulate; 32-byte shared secret.
 * @property {{ isValidEncapsulationKey: (ek: Uint8Array) => boolean, isValidDecapsulationKey: (dk: Uint8Array) => boolean }} _internal Validation helpers.
 */

/**
 * Public API returned by `ml_kem.factory()`.
 * @typedef {object} MlKemAPI
 * @property {MlKemInstance} ml_kem512 ML-KEM-512 instance.
 * @property {MlKemInstance} ml_kem768 ML-KEM-768 instance.
 * @property {MlKemInstance} ml_kem1024 ML-KEM-1024 instance.
 * @property {(f: Uint16Array) => Uint16Array} _ntt Test-only NTT.
 * @property {(f: Uint16Array) => Uint16Array} _nttInv Test-only inverse NTT.
 * @property {(out: Uint16Array, a: Uint16Array, b: Uint16Array) => Uint16Array} _multiplyNTTs Test-only pointwise product.
 * @property {(prfBytes: Uint8Array, eta: number) => Uint16Array} _sampleCBD Test-only CBD sampler.
 * @property {(rho: Uint8Array, j: number, i: number) => Uint16Array} _sampleNTT Test-only NTT sampler.
 * @property {(poly: Uint16Array, d: number) => Uint8Array} _byteEncode Test-only encoder.
 * @property {(bytes: Uint8Array, d: number) => Uint16Array} _byteDecode Test-only decoder.
 * @property {(x: number, d: number) => number} _compress Test-only compress.
 * @property {(y: number, d: number) => number} _decompress Test-only decompress.
 */

export const ml_kem = {
    name: 'ml_kem',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: ['sha3', 'bitArray', 'random'],
    deps: [sha3, bitArray, random],

    /** @returns {MlKemAPI} */
    factory(sha3, bitArray, random) {

        const N = 256;
        const Q = 3329;
        const F_INV = 3303;          // 128^-1 mod Q
        const ROOT = 17;             // ζ, primitive 256-th root of unity mod Q
        const Q_HALF = (Q >>> 1);    // 1664

        // ── shake / sha3 wrappers (return Uint8Array) ────────────────

        function _sha3_256(bytes) { return bitArray.ba_to_ui8(sha3.sha3_256(bytes)); }
        function _sha3_512(bytes) { return bitArray.ba_to_ui8(sha3.sha3_512(bytes)); }
        function _shake128(bytes, outBytes) {
            return bitArray.ba_to_ui8(sha3.shake128(bytes, outBytes * 8));
        }
        function _shake256(bytes, outBytes) {
            return bitArray.ba_to_ui8(sha3.shake256(bytes, outBytes * 8));
        }

        // ── modular arithmetic ───────────────────────────────────────

        function _mod(a) {
            const r = a % Q;
            return r < 0 ? r + Q : r;
        }

        // ── precomputed ζ table (FIPS 203 §4.3.2 / Appendix) ─────────

        function _bitRev7(i) {
            let r = 0;
            for (let k = 0; k < 7; k++) r = (r << 1) | ((i >>> k) & 1);
            return r;
        }

        const ZETAS = (function () {
            const z = new Uint16Array(128);
            for (let i = 0; i < 128; i++) {
                let acc = 1;
                const exp = _bitRev7(i);
                for (let j = 0; j < exp; j++) acc = (acc * ROOT) % Q;
                z[i] = acc;
            }
            return z;
        })();

        // ── NTT / NTT^-1 (FIPS 203 Algorithms 9 & 10) ────────────────

        function _ntt(f) {
            let k = 1;
            for (let len = 128; len >= 2; len >>>= 1) {
                for (let start = 0; start < N; start += 2 * len) {
                    const zeta = ZETAS[k++];
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
            let k = 127;
            for (let len = 2; len <= 128; len <<= 1) {
                for (let start = 0; start < N; start += 2 * len) {
                    const zeta = ZETAS[k--];
                    for (let j = start; j < start + len; j++) {
                        const t = f[j];
                        f[j]       = _mod(t + f[j + len]);
                        f[j + len] = (zeta * _mod(f[j + len] - t)) % Q;
                    }
                }
            }
            for (let i = 0; i < N; i++) f[i] = (f[i] * F_INV) % Q;
            return f;
        }

        // FIPS 203 Algorithm 11: pointwise product in NTT domain.
        function _multiplyNTTs(out, a, b) {
            for (let i = 0; i < 128; i++) {
                let z = ZETAS[64 + (i >>> 1)];
                if (i & 1) z = Q - z;
                const a0 = a[2*i], a1 = a[2*i + 1];
                const b0 = b[2*i], b1 = b[2*i + 1];
                out[2*i]     = _mod(a1 * b1 % Q * z + a0 * b0);
                out[2*i + 1] = _mod(a0 * b1 + a1 * b0);
            }
            return out;
        }

        function _polyAdd(a, b) {
            for (let i = 0; i < N; i++) a[i] = _mod(a[i] + b[i]);
        }
        function _polySub(a, b) {
            for (let i = 0; i < N; i++) a[i] = _mod(a[i] - b[i]);
        }

        // ── Compress / Decompress (FIPS 203 §4.2.1) ──────────────────

        function _compress(x, d) {
            // round((2^d / Q) * x) mod 2^d
            const mask = (1 << d) - 1;
            return (((x << d) + Q_HALF) / Q | 0) & mask;
        }
        function _decompress(y, d) {
            // round((Q / 2^d) * y)
            return ((y * Q + (1 << (d - 1))) >>> d);
        }

        // ── ByteEncode_d / ByteDecode_d (FIPS 203 Algorithms 5 & 6) ──

        function _byteEncode(poly, d) {
            // Pack 256 d-bit words little-endian into 32*d bytes.
            const out = new Uint8Array(32 * d);
            let buf = 0, bufLen = 0, pos = 0;
            const mask = d === 12 ? 0xfff : ((1 << d) - 1);
            for (let i = 0; i < N; i++) {
                let v = poly[i];
                if (d < 12) v = _compress(v, d);
                buf |= (v & mask) << bufLen;
                bufLen += d;
                while (bufLen >= 8) {
                    out[pos++] = buf & 0xff;
                    buf >>>= 8;
                    bufLen -= 8;
                }
            }
            return out;
        }

        function _byteDecode(bytes, d) {
            const out = new Uint16Array(N);
            const mask = (1 << d) - 1;
            let buf = 0, bufLen = 0, pos = 0;
            for (let i = 0; i < bytes.length && pos < N; i++) {
                buf |= bytes[i] << bufLen;
                bufLen += 8;
                while (bufLen >= d && pos < N) {
                    let v = buf & mask;
                    buf >>>= d;
                    bufLen -= d;
                    if (d === 12) v = v >= Q ? v - Q : v;          // mod-q reduction
                    else          v = _decompress(v, d);
                    out[pos++] = v;
                }
            }
            return out;
        }

        // ── SampleNTT (FIPS 203 Algorithm 7) ─────────────────────────
        // Rejection-sampling 12-bit values < Q from SHAKE128(seed||j||i).
        // We squeeze a generous block in one call (no streaming SHAKE).

        const _XOF_BYTES = 4032; // 24 SHAKE128 blocks; > expected ~474 bytes.

        function _sampleNTT(rho, j, i) {
            const inp = new Uint8Array(rho.length + 2);
            inp.set(rho, 0);
            inp[rho.length]     = j;
            inp[rho.length + 1] = i;
            let bytes = _shake128(inp, _XOF_BYTES);
            const out = new Uint16Array(N);
            let pos = 0;
            for (let k = 0; k + 3 <= bytes.length && pos < N; k += 3) {
                const d1 = ((bytes[k] | (bytes[k + 1] << 8)) & 0xfff);
                const d2 = ((bytes[k + 1] >>> 4) | (bytes[k + 2] << 4)) & 0xfff;
                if (d1 < Q)             out[pos++] = d1;
                if (pos < N && d2 < Q)  out[pos++] = d2;
            }
            if (pos < N) {
                // Astronomically unlikely fallback: re-squeeze a larger block.
                bytes = _shake128(inp, _XOF_BYTES * 4);
                pos = 0;
                for (let k = 0; k + 3 <= bytes.length && pos < N; k += 3) {
                    const d1 = ((bytes[k] | (bytes[k + 1] << 8)) & 0xfff);
                    const d2 = ((bytes[k + 1] >>> 4) | (bytes[k + 2] << 4)) & 0xfff;
                    if (d1 < Q)             out[pos++] = d1;
                    if (pos < N && d2 < Q)  out[pos++] = d2;
                }
            }
            return out;
        }

        // ── SamplePolyCBD_eta (FIPS 203 Algorithm 8) ─────────────────

        function _sampleCBD(prfBytes, eta) {
            const out = new Uint16Array(N);
            // Read 2*eta bits per coefficient from the byte stream LSB-first.
            let bitBuf = 0, bitLen = 0, bytePos = 0;
            for (let i = 0; i < N; i++) {
                while (bitLen < 2 * eta) {
                    bitBuf |= prfBytes[bytePos++] << bitLen;
                    bitLen += 8;
                }
                let a = 0, b = 0;
                for (let k = 0; k < eta; k++) a += (bitBuf >>> k) & 1;
                for (let k = 0; k < eta; k++) b += (bitBuf >>> (eta + k)) & 1;
                bitBuf >>>= 2 * eta;
                bitLen  -= 2 * eta;
                out[i] = _mod(a - b);
            }
            return out;
        }

        function _prf(eta, seed, nonce) {
            const inp = new Uint8Array(seed.length + 1);
            inp.set(seed, 0);
            inp[seed.length] = nonce;
            return _shake256(inp, 64 * eta);
        }

        // ── vector / matrix helpers ──────────────────────────────────

        function _vecZero(K) {
            const v = new Array(K);
            for (let i = 0; i < K; i++) v[i] = new Uint16Array(N);
            return v;
        }

        function _encodeVec(vec, d) {
            const K = vec.length;
            const chunk = 32 * d;
            const out = new Uint8Array(K * chunk);
            for (let i = 0; i < K; i++) out.set(_byteEncode(vec[i], d), i * chunk);
            return out;
        }

        function _decodeVec(bytes, K, d) {
            const chunk = 32 * d;
            const vec = new Array(K);
            for (let i = 0; i < K; i++) vec[i] = _byteDecode(bytes.subarray(i * chunk, (i + 1) * chunk), d);
            return vec;
        }

        // ── K-PKE (FIPS 203 §5) ──────────────────────────────────────

        function _genKpke(P) {
            const { K, ETA1, ETA2, du, dv } = P;
            const pkSize = 384 * K + 32;
            const skSize = 384 * K;
            const ctSize = 32 * (du * K + dv);

            // K-PKE.KeyGen - input: 32-byte d. (Outer ML-KEM appends the K byte.)
            function keygen(d_seed) {
                // (rho, sigma) = G(d || K)
                const gInput = new Uint8Array(33);
                gInput.set(d_seed, 0);
                gInput[32] = K;
                const g = _sha3_512(gInput);
                const rho   = g.subarray(0, 32);
                const sigma = g.subarray(32, 64);

                // s = vector of K polys CBD_ETA1
                const sHat = _vecZero(K);
                for (let i = 0; i < K; i++) sHat[i] = _ntt(_sampleCBD(_prf(ETA1, sigma, i), ETA1));

                // e = vector of K polys CBD_ETA1 with offset K
                const eHat = _vecZero(K);
                for (let i = 0; i < K; i++) eHat[i] = _ntt(_sampleCBD(_prf(ETA1, sigma, K + i), ETA1));

                // t_hat = A_hat ∘ s_hat + e_hat,  where A_hat[i][j] = SampleNTT(rho || j || i)
                const tHat = _vecZero(K);
                const tmp  = new Uint16Array(N);
                for (let i = 0; i < K; i++) {
                    const acc = new Uint16Array(N);
                    for (let j = 0; j < K; j++) {
                        const aij = _sampleNTT(rho, j, i);
                        _multiplyNTTs(tmp, aij, sHat[j]);
                        _polyAdd(acc, tmp);
                    }
                    _polyAdd(acc, eHat[i]);
                    tHat[i] = acc;
                }

                // ek = ByteEncode_12(tHat) || rho
                const ek = new Uint8Array(pkSize);
                ek.set(_encodeVec(tHat, 12), 0);
                ek.set(rho, 384 * K);
                // dk = ByteEncode_12(sHat)
                const dk = _encodeVec(sHat, 12);
                return { publicKey: ek, secretKey: dk };
            }

            function encrypt(ek, msg, randomness) {
                const tHat = _decodeVec(ek.subarray(0, 384 * K), K, 12);
                const rho  = ek.subarray(384 * K);

                const rHat = _vecZero(K);
                for (let i = 0; i < K; i++) rHat[i] = _ntt(_sampleCBD(_prf(ETA1, randomness, i), ETA1));
                const e1 = _vecZero(K);
                for (let i = 0; i < K; i++) e1[i] = _sampleCBD(_prf(ETA2, randomness, K + i), ETA2);
                const e2 = _sampleCBD(_prf(ETA2, randomness, 2 * K), ETA2);

                // u = NTT^-1(A_hat^T ∘ r_hat) + e1
                const u = _vecZero(K);
                const tmp = new Uint16Array(N);
                for (let i = 0; i < K; i++) {
                    const acc = new Uint16Array(N);
                    for (let j = 0; j < K; j++) {
                        const aji = _sampleNTT(rho, i, j);            // transposed
                        _multiplyNTTs(tmp, aji, rHat[j]);
                        _polyAdd(acc, tmp);
                    }
                    _nttInv(acc);
                    _polyAdd(acc, e1[i]);
                    u[i] = acc;
                }

                // v = NTT^-1(t_hat^T ∘ r_hat) + e2 + Decompress_1(msg)
                const vAcc = new Uint16Array(N);
                for (let i = 0; i < K; i++) {
                    _multiplyNTTs(tmp, tHat[i], rHat[i]);
                    _polyAdd(vAcc, tmp);
                }
                _nttInv(vAcc);
                _polyAdd(vAcc, e2);
                const mu = _byteDecode(msg, 1);
                _polyAdd(vAcc, mu);

                // c = (Compress+Encode)_du(u) || (Compress+Encode)_dv(v)
                const ct = new Uint8Array(ctSize);
                ct.set(_encodeVec(u, du), 0);
                ct.set(_byteEncode(vAcc, dv), 32 * du * K);
                return ct;
            }

            function decrypt(dk, ct) {
                const u = _decodeVec(ct.subarray(0, 32 * du * K), K, du);
                const v = _byteDecode(ct.subarray(32 * du * K), dv);
                const sHat = _decodeVec(dk, K, 12);

                // w = v - NTT^-1(s_hat^T ∘ NTT(u))
                const acc = new Uint16Array(N);
                const tmp = new Uint16Array(N);
                for (let i = 0; i < K; i++) {
                    const uHat = _ntt(u[i]);
                    _multiplyNTTs(tmp, sHat[i], uHat);
                    _polyAdd(acc, tmp);
                }
                _nttInv(acc);
                _polySub(v, acc);
                return _byteEncode(v, 1);
            }

            return {
                keygen, encrypt, decrypt,
                lengths: { publicKey: pkSize, secretKey: skSize, cipherText: ctSize }
            };
        }

        // ── ML-KEM wrapper (FIPS 203 §6) ─────────────────────────────

        function _ctEqual(a, b) {
            if (a.length !== b.length) return false;
            let diff = 0;
            for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
            return diff === 0;
        }

        function _make(P) {
            const KPKE = _genKpke(P);
            const skSize = KPKE.lengths.secretKey + KPKE.lengths.publicKey + 32 + 32;
            const lengths = Object.freeze({
                publicKey:    KPKE.lengths.publicKey,
                secretKey:    skSize,
                cipherText:   KPKE.lengths.cipherText,
                sharedSecret: 32,
                seed:         64,
                msg:          32
            });

            function keygen(seed) {
                if (seed && seed.length !== 64) {
                    console.warn('[crypto] INVALID: ml_kem: seed must be 64 bytes');
                    return false;
                }
                const _seed = seed || random.bytes(64);
                const d = _seed.subarray(0, 32);
                const z = _seed.subarray(32, 64);
                const { publicKey, secretKey: dkPke } = KPKE.keygen(d);
                const ekHash = _sha3_256(publicKey);
                const sk = new Uint8Array(skSize);
                sk.set(dkPke, 0);
                sk.set(publicKey, KPKE.lengths.secretKey);
                sk.set(ekHash, KPKE.lengths.secretKey + KPKE.lengths.publicKey);
                sk.set(z, KPKE.lengths.secretKey + KPKE.lengths.publicKey + 32);
                return { publicKey, secretKey: sk };
            }

            function encapsulate(publicKey, msg) {
                if (publicKey.length !== KPKE.lengths.publicKey) {
                    console.warn('[crypto] INVALID: ml_kem: wrong publicKey length');
                    return false;
                }
                if (msg && msg.length !== 32) {
                    console.warn('[crypto] INVALID: ml_kem: msg must be 32 bytes');
                    return false;
                }
                // Modulus check: ek = ByteEncode_12(ByteDecode_12(ek_polys)) must round-trip.
                const tBytes = publicKey.subarray(0, 384 * P.K);
                const reEnc = _encodeVec(_decodeVec(tBytes, P.K, 12), 12);
                if (!_ctEqual(reEnc, tBytes)) {
                    console.error('[crypto] CORRUPT: ml_kem: publicKey modulus check failed');
                    return false;
                }
                const _msg = msg || random.bytes(32);
                const ekHash = _sha3_256(publicKey);
                const gInp = new Uint8Array(64);
                gInp.set(_msg, 0);
                gInp.set(ekHash, 32);
                const kr = _sha3_512(gInp);
                const K_  = kr.subarray(0, 32);
                const r_  = kr.subarray(32, 64);
                const ct  = KPKE.encrypt(publicKey, _msg, r_);
                return { cipherText: ct, sharedSecret: new Uint8Array(K_) };
            }

            function decapsulate(cipherText, secretKey) {
                if (secretKey.length !== skSize) {
                    console.warn('[crypto] INVALID: ml_kem: wrong secretKey length');
                    return false;
                }
                if (cipherText.length !== KPKE.lengths.cipherText) {
                    console.warn('[crypto] INVALID: ml_kem: wrong cipherText length');
                    return false;
                }
                const dkPke   = secretKey.subarray(0, KPKE.lengths.secretKey);
                const ek      = secretKey.subarray(KPKE.lengths.secretKey,
                                                   KPKE.lengths.secretKey + KPKE.lengths.publicKey);
                const ekHash  = secretKey.subarray(KPKE.lengths.secretKey + KPKE.lengths.publicKey,
                                                   KPKE.lengths.secretKey + KPKE.lengths.publicKey + 32);
                const z       = secretKey.subarray(KPKE.lengths.secretKey + KPKE.lengths.publicKey + 32);

                const mPrime = KPKE.decrypt(dkPke, cipherText);
                const gInp = new Uint8Array(64);
                gInp.set(mPrime, 0);
                gInp.set(ekHash, 32);
                const kr = _sha3_512(gInp);
                const Khat = kr.subarray(0, 32);
                const rHat = kr.subarray(32, 64);
                const ctRe = KPKE.encrypt(ek, mPrime, rHat);

                // Implicit reject: K_bar = J(z || c)
                const jInp = new Uint8Array(z.length + cipherText.length);
                jInp.set(z, 0);
                jInp.set(cipherText, z.length);
                const Kbar = _shake256(jInp, 32);

                // Constant-time FO decapsulation (FIPS 203 §7.3 step 7).
                // Both branches of the implicit reject are computed
                // unconditionally - the success-path K_hat AND the reject
                // K_bar are derived before any comparison happens. The final
                // selection uses a byte-mask derived from `_ctEqual(ctRe, ct)`
                // so the timing and memory access pattern are identical
                // whether the re-encryption succeeded or failed.
                // Constant-time selection: avoid the JS ternary, which a JIT
                // could speculate per-iteration on `ok`. Use a byte mask
                // derived from the boolean: 0xff if ok, 0x00 otherwise.
                // @ts-ignore - TS2362: boolean|0 bitwise coercion to int is intentional for constant-time mask
                const okMask = (-(_ctEqual(ctRe, cipherText) | 0)) & 0xff;
                const out = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    out[i] = Kbar[i] ^ ((Khat[i] ^ Kbar[i]) & okMask);
                }
                return out;
            }

            // FIPS 203 §7.2 input validation: ek length + modulus check
            // (each 12-bit coeff < q=3329, exposed via ByteEncode round-trip).
            function isValidEncapsulationKey(ek) {
                if (!(ek instanceof Uint8Array) || ek.length !== KPKE.lengths.publicKey) return false;
                const tBytes = ek.subarray(0, 384 * P.K);
                const reEnc = _encodeVec(_decodeVec(tBytes, P.K, 12), 12);
                return _ctEqual(reEnc, tBytes);
            }

            // FIPS 203 §7.3 input validation: dk length + hash consistency
            // H(ek_embedded) == ek_hash_embedded (detects corrupted or mismatched dk).
            function isValidDecapsulationKey(dk) {
                if (!(dk instanceof Uint8Array) || dk.length !== skSize) return false;
                const ek     = dk.subarray(KPKE.lengths.secretKey,
                                           KPKE.lengths.secretKey + KPKE.lengths.publicKey);
                const ekHash = dk.subarray(KPKE.lengths.secretKey + KPKE.lengths.publicKey,
                                           KPKE.lengths.secretKey + KPKE.lengths.publicKey + 32);
                const h = _sha3_256(ek);
                return _ctEqual(h, ekHash);
            }

            return {
                lengths, keygen, encapsulate, decapsulate,
                _internal: { isValidEncapsulationKey, isValidDecapsulationKey }
            };
        }

        const PARAMS = {
            512:  { K: 2, ETA1: 3, ETA2: 2, du: 10, dv: 4 },
            768:  { K: 3, ETA1: 2, ETA2: 2, du: 10, dv: 4 },
            1024: { K: 4, ETA1: 2, ETA2: 2, du: 11, dv: 5 }
        };

        return {
            ml_kem512:  _make(PARAMS[512]),
            ml_kem768:  _make(PARAMS[768]),
            ml_kem1024: _make(PARAMS[1024]),
            // exposed for testing
            _ntt, _nttInv, _multiplyNTTs, _sampleCBD, _sampleNTT,
            _byteEncode, _byteDecode, _compress, _decompress
        };
    }
};
