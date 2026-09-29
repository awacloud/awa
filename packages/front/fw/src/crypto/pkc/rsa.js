// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview RSA primitive + RSAES-OAEP and RSASSA-PSS schemes (RFC 8017).
 *
 * Implements the subset of PKCS #1 v2.2 used in modern protocols:
 *
 *   • RSAEP / RSADP - primitive modular exponentiation (with optional CRT).
 *   • OAEP encrypt / decrypt   (RFC 8017 §7.1).
 *   • PSS  sign    / verify    (RFC 8017 §8.1, §9.1).
 *
 * Key generation is provided by [rsaKeygen](../utils/rsaKeygen.js).
 * Keys are passed as JS objects:
 *
 *   pub  = { n: Uint8Array, e: Uint8Array }
 *   priv = { n, e, d, p?, q?, dp?, dq?, qInv? }
 *
 * If `p, q, dp, dq, qInv` are all present, decryption / signing uses the
 * CRT path (≈ 3-4× faster). Otherwise it falls back to plain `c^d mod n`.
 * Field name `qInv` follows PKCS#1 v2.2 §2 nomenclature.
 *
 * MGF1 is implemented inline, parameterised by a hash module (sha256 by
 * default). The hash module passed to `factory` is used both for MGF1 and
 * for the OAEP / PSS hash itself.
 *
 * ## OAEP decrypt timing (Manger 2001)
 *
 * `oaepDecrypt` is written to be Manger-resistant: every byte of the
 * decoded EM is examined, the padding-check accumulator (`bad`) is folded
 * by bitwise-OR without early exit, and the 0x01 separator search runs
 * the full DB length using bitmask-derived flags (no `break`). There is a
 * single failure point at the end of the routine - the success / failure
 * branch is taken **once**, and only after all data-dependent work is
 * complete. The error message is a single fixed string so no observable
 * differs between bad-version / bad-lHash / bad-padding cases.
 *
 * ## CRT fault-attack note
 *
 * `_rsadp` activates the CRT fast path (≈3-4× speedup) whenever every CRT
 * field (`p, q, dp, dq, qInv`) is present on the private key. CRT is
 * known to be vulnerable to Bellcore-style fault attacks: a single bit-flip
 * during one of the two half-exponentiations leaks the modulus
 * factorisation via `gcd(m^e - c, n)`. The implementation defends against
 * the cache-timing channel by blinding the input (`r·c mod n`) when a
 * CSPRNG-derived blinding factor is available, but it does NOT verify the
 * signature/decryption result against the public key after the fact -
 * which would be the standard FIPS 186-5 / RSA-CRT-CHECK mitigation.
 *
 * For deployments where the attacker can induce hardware faults (smart
 * cards, embedded HSM emulation), callers should perform the post-sign
 * verify themselves: `if (!pssVerify(pub, m, sig)) abort()`.
 *
 */

import { bitArray } from '../utils/bitArray.js';
import { bn } from '../utils/bn.js';
import { random } from '../utils/random.js';

/**
 * RSA public key.
 * @typedef {{ n: Uint8Array, e: Uint8Array }} RsaPublicKey
 */

/**
 * RSA private key (CRT fields optional; present → CRT fast path).
 * @typedef {{ n: Uint8Array, e?: Uint8Array, d: Uint8Array, p?: Uint8Array, q?: Uint8Array, dp?: Uint8Array, dq?: Uint8Array, qInv?: Uint8Array }} RsaPrivateKey
 */

/**
 * Public API returned by `rsa.factory()`.
 * @typedef {object} RsaAPI
 * @property {(pub: RsaPublicKey, msg: Uint8Array, hashMod: object, label?: Uint8Array, seed?: Uint8Array) => (Uint8Array|false)} oaepEncrypt RSAES-OAEP encrypt.
 * @property {(priv: RsaPrivateKey, ct: Uint8Array, hashMod: object, label?: Uint8Array) => (Uint8Array|false)} oaepDecrypt RSAES-OAEP decrypt.
 * @property {(priv: RsaPrivateKey, msg: Uint8Array, hashMod: object, sLen?: number, salt?: Uint8Array) => (Uint8Array|false)} pssSign RSASSA-PSS sign.
 * @property {(pub: RsaPublicKey, msg: Uint8Array, sig: Uint8Array, hashMod: object, sLen?: number) => boolean} pssVerify RSASSA-PSS verify.
 * @property {() => false} pkcs1v15Sign Deprecated; always rejects.
 * @property {() => false} pkcs1v15Verify Deprecated; always rejects.
 * @property {() => false} pkcs1v15Encrypt Deprecated/unsafe; always rejects.
 * @property {() => false} pkcs1v15Decrypt Deprecated/unsafe; always rejects.
 * @property {{ rsaep: Function, rsadp: Function, mgf1: Function }} _internal KAT-test-only primitives.
 */

export const rsa = {
    name: 'rsa',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: ['bitArray', 'bn', 'random'],
    deps: [bitArray, bn, random],

    /** @returns {RsaAPI} */
    factory(bitArray, bn, random) {

        // ── conversions ───────────────────────────────────────────────

        function _bytesToBn(bytes) {
            return bn.fromBits(bitArray.ui8_to_ba(bytes));
        }

        function _bnToBytes(num, len) {
            // I2OSP - len is the desired output length in bytes.
            const bits = num.toBits(len * 8);
            return bitArray.ba_to_ui8(bits);
        }

        function _modByteLen(nBytes) {
            // Highest-byte positioned modulus length in bytes.
            return nBytes.length;
        }

        // ── RSAEP / RSADP primitives ──────────────────────────────────

        function _rsaep(pub, m) {
            const n = _bytesToBn(pub.n);
            const e = _bytesToBn(pub.e);
            return m.powermod(e, n);
        }

        // ── RSA blinding (Chaum/Pollard, anti-timing) ───────────────────
        // Iteration F1 of the FIPS 140-3 upgrade plan.
        //
        // To defeat side-channel attacks against `_rsadp` (CRT modular
        // exponentiation is famously vulnerable to remote timing - Boneh
        // & Brumley 2003 against OpenSSL, Brumley & Tuveri 2011 against
        // ECDSA, etc.), we blind the input ciphertext before exponentiation
        // and unblind the result :
        //
        //   1. Pick random r ∈ (1, n).
        //   2. Compute c' = c · r^e mod n.
        //   3. Compute m' = (c')^d mod n  (= c^d · r^(e·d) = c^d · r mod n,
        //                                   since e·d ≡ 1 mod φ(n)).
        //   4. Return m = m' · r^-1 mod n  (= c^d mod n).
        //
        // The CRT inner exponentiation now operates on `r·c mod n` (uniformly
        // distributed in [0, n)) instead of the attacker-chosen `c`, which
        // randomises the input to every Montgomery step and decorrelates
        // execution time from the secret key.
        //
        // Cost: +1 modexp (`r^e`, fast since e=65537 has only 17 multiplies)
        // + 1 modular inverse + 2 modular multiplications. ~5-8 % overhead
        // on RSA-2048 ; defended by default for OAEP/PSS server-side use.
        // Caller may opt out via `_rsadp(priv, c, { blinding: false })` for
        // benchmarks or when an outer protocol already provides timing
        // protection (TLS 1.3 records, etc.).
        function _rsadp(priv, c, opts) {
            const blinding = !(opts && opts.blinding === false);
            const n = _bytesToBn(priv.n);

            let cIn = c;
            let rInv = null;
            if (blinding && priv.e) {
                const e = _bytesToBn(priv.e);
                // Random r ∈ (1, n) with gcd(r, n) = 1. Reject 0/1 (degenerate)
                // and any r with `r.inverseMod(n)` returning false (gcd != 1,
                // statistically negligible for primes p, q ≈ 2^k/2).
                let r, rInvMaybe;
                let attempt = 0;
                while (attempt < 16) {
                    r = bn.random(n, 6);   // SP 800-90A CTR_DRBG ; 6 = paranoia
                    if (r === false) { rInv = null; cIn = c; break; }
                    if (r.equals(0) || r.equals(1)) { attempt++; continue; }
                    rInvMaybe = r.inverseMod(n);
                    if (rInvMaybe === false || rInvMaybe === undefined) { attempt++; continue; }
                    rInv = rInvMaybe;
                    const rE = r.powermod(e, n);
                    cIn = c.mul(rE).mod(n).normalize();
                    break;
                }
                if (rInv === null) {
                    console.warn('[crypto] WEAK: rsa: blinding disabled (random failure or gcd(r, n) ≠ 1) - falling back to unblinded decrypt');
                    cIn = c;
                }
            }

            // CRT path: ≈ 3-4× faster than plain c^d mod n. Activated only
            // when every CRT field is present (p, q, dp, dq, qInv). The
            // (m1 - m2) step is computed without signed arithmetic by
            // adding p once when m1 < m2 mod p (guaranteed sufficient since
            // both intermediates lie in [0, p)).
            let m;
            if (priv.p && priv.q && priv.dp && priv.dq && priv.qInv) {
                const p    = _bytesToBn(priv.p);
                const q    = _bytesToBn(priv.q);
                const dp   = _bytesToBn(priv.dp);
                const dq   = _bytesToBn(priv.dq);
                const qInv = _bytesToBn(priv.qInv);
                // Reduce cIn modulo p (resp. q) before Montgomery exponentiation:
                // bn.powermod feeds `this` into the Montgomery representation
                // without reducing first, so passing cIn (≈ 2 · |p| bits) directly
                // would corrupt the result.
                const m1 = cIn.mod(p).normalize().powermod(dp, p);
                const m2 = cIn.mod(q).normalize().powermod(dq, q);
                const m2ModP = m2.mod(p).normalize();
                let diff;
                if (m1.greaterEquals(m2ModP)) {
                    diff = m1.sub(m2ModP).normalize();
                } else {
                    diff = m1.add(p).sub(m2ModP).normalize();
                }
                const h = diff.mul(qInv).mod(p).normalize();
                m = m2.add(q.mul(h)).mod(n).normalize();
            } else {
                const d = _bytesToBn(priv.d);
                m = cIn.powermod(d, n);
            }

            // Unblind : m = m' · r^-1 mod n.
            if (rInv !== null) {
                m = m.mul(rInv).mod(n).normalize();
            }
            return m;
        }

        // ── MGF1 (RFC 8017 §B.2.1) ────────────────────────────────────

        function _mgf1(hashMod, seed, maskLen) {
            const out = new Uint8Array(maskLen);
            const counter = new Uint8Array(4);
            let off = 0;
            for (let i = 0; off < maskLen; i++) {
                counter[0] = (i >>> 24) & 0xff;
                counter[1] = (i >>> 16) & 0xff;
                counter[2] = (i >>> 8) & 0xff;
                counter[3] = i & 0xff;
                const concat = new Uint8Array(seed.length + 4);
                concat.set(seed, 0);
                concat.set(counter, seed.length);
                const h = bitArray.ba_to_ui8(hashMod.hash(bitArray.ui8_to_ba(concat)));
                const take = Math.min(h.length, maskLen - off);
                out.set(h.subarray(0, take), off);
                off += take;
            }
            return out;
        }

        function _hashBytes(hashMod, msg) {
            return bitArray.ba_to_ui8(hashMod.hash(bitArray.ui8_to_ba(msg)));
        }

        function _xor(a, b) {
            const out = new Uint8Array(a.length);
            for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
            return out;
        }

        // ── OAEP (RFC 8017 §7.1) ──────────────────────────────────────

        /**
         * Encrypt a short message under an RSA public key with OAEP padding.
         * @param {{n:Uint8Array,e:Uint8Array}} pub
         * @param {Uint8Array} msg
         * @param {Object} hashMod Hash module (e.g. sha256) used for OAEP.
         * @param {Uint8Array} [label] Optional label bytes (defaults to empty).
         * @param {Uint8Array} [seed] Override seed (testing); else random hLen bytes.
         */
        function oaepEncrypt(pub, msg, hashMod, label, seed) {
            const k = _modByteLen(pub.n);
            const lHash = _hashBytes(hashMod, label || new Uint8Array(0));
            const hLen = lHash.length;
            if (msg.length > k - 2 * hLen - 2) {
                console.warn('[crypto] INVALID: rsa: message too long for OAEP');
                return false;
            }
            const psLen = k - msg.length - 2 * hLen - 2;
            const db = new Uint8Array(k - hLen - 1);
            db.set(lHash, 0);
            db[hLen + psLen] = 0x01;
            db.set(msg, hLen + psLen + 1);

            const _seed = seed || random.bytes(hLen);
            const dbMask = _mgf1(hashMod, _seed, k - hLen - 1);
            const maskedDB = _xor(db, dbMask);
            const seedMask = _mgf1(hashMod, maskedDB, hLen);
            const maskedSeed = _xor(_seed, seedMask);

            const em = new Uint8Array(k);
            em[0] = 0x00;
            em.set(maskedSeed, 1);
            em.set(maskedDB, 1 + hLen);

            const c = _rsaep(pub, _bytesToBn(em));
            return _bnToBytes(c, k);
        }

        function oaepDecrypt(priv, ct, hashMod, label) {
            const k = _modByteLen(priv.n);
            const lHash = _hashBytes(hashMod, label || new Uint8Array(0));
            const hLen = lHash.length;
            if (ct.length !== k || k < 2 * hLen + 2) {
                console.warn('[crypto] INVALID: rsa: OAEP ciphertext length wrong');
                return false;
            }
            const m = _rsadp(priv, _bytesToBn(ct));
            const em = _bnToBytes(m, k);
            // Strict constant-time: scan all bytes, never branch on data.
            let bad = em[0]; // Must be 0x00 - accumulate any non-zero.
            const maskedSeed = em.subarray(1, 1 + hLen);
            const maskedDB = em.subarray(1 + hLen);
            const seedMask = _mgf1(hashMod, maskedDB, hLen);
            const seed = _xor(maskedSeed, seedMask);
            const dbMask = _mgf1(hashMod, seed, k - hLen - 1);
            const db = _xor(maskedDB, dbMask);
            for (let i = 0; i < hLen; i++) bad |= db[i] ^ lHash[i];
            // Locate the 0x01 separator after PS, scanning the full buffer
            // without early-exit. `found` flips to 1 once seen; before that
            // every byte must be 0x00, after that anything is allowed.
            let found = 0;
            let onePos = 0;
            let badPad = 0;
            for (let i = hLen; i < db.length; i++) {
                const b = db[i];
                const isOne  = ((b ^ 0x01) - 1) >>> 31; // 1 if b == 0x01 else 0
                const isZero = ((b)        - 1) >>> 31; // 1 if b == 0x00 else 0
                // First 0x01 sets found and records position.
                onePos |= (i & -((isOne & (1 - found)) | 0));
                found  |= isOne;
                // Before the separator (found==0) every byte must be 0x00.
                badPad |= (1 - found) & (1 - isZero);
            }
            bad |= badPad | (1 - found);
            // Single failure point - no early exit on `bad` until the end.
            if (bad !== 0) {
                console.error('[crypto] CORRUPT: rsa: OAEP decryption failed');
                return false;
            }
            return new Uint8Array(db.subarray(onePos + 1));
        }

        // ── PSS (RFC 8017 §9.1) ───────────────────────────────────────

        function _pssEncode(mHash, emBits, hashMod, salt) {
            const hLen = mHash.length;
            const emLen = (emBits + 7) >>> 3;
            const sLen = salt.length;
            if (emLen < hLen + sLen + 2) {
                console.warn('[crypto] INVALID: rsa: PSS encoding too short');
                return false;
            }
            // M' = (0x00 ×8) || mHash || salt
            const mPrime = new Uint8Array(8 + hLen + sLen);
            mPrime.set(mHash, 8);
            mPrime.set(salt, 8 + hLen);
            const H = _hashBytes(hashMod, mPrime);
            // DB = PS || 0x01 || salt
            const db = new Uint8Array(emLen - hLen - 1);
            db[emLen - hLen - sLen - 2] = 0x01;
            db.set(salt, emLen - hLen - sLen - 1);
            const dbMask = _mgf1(hashMod, H, db.length);
            const maskedDB = _xor(db, dbMask);
            // Clear top (8*emLen - emBits) bits.
            const clearBits = 8 * emLen - emBits;
            if (clearBits > 0) maskedDB[0] &= 0xff >>> clearBits;
            const em = new Uint8Array(emLen);
            em.set(maskedDB, 0);
            em.set(H, emLen - hLen - 1);
            em[emLen - 1] = 0xbc;
            return em;
        }

        function _pssVerify(mHash, em, emBits, hashMod, sLen) {
            const hLen = mHash.length;
            const emLen = em.length;
            if (emLen < hLen + sLen + 2 || em[emLen - 1] !== 0xbc) return false;
            const maskedDB = new Uint8Array(em.subarray(0, emLen - hLen - 1));
            const H = em.subarray(emLen - hLen - 1, emLen - 1);
            const clearBits = 8 * emLen - emBits;
            if (clearBits > 0 && (maskedDB[0] & (0xff << (8 - clearBits) & 0xff)) !== 0) return false;
            const dbMask = _mgf1(hashMod, H, maskedDB.length);
            const db = _xor(maskedDB, dbMask);
            if (clearBits > 0) db[0] &= 0xff >>> clearBits;
            for (let i = 0; i < emLen - hLen - sLen - 2; i++) {
                if (db[i] !== 0) return false;
            }
            if (db[emLen - hLen - sLen - 2] !== 0x01) return false;
            const salt = db.subarray(db.length - sLen);
            const mPrime = new Uint8Array(8 + hLen + sLen);
            mPrime.set(mHash, 8);
            mPrime.set(salt, 8 + hLen);
            const Hp = _hashBytes(hashMod, mPrime);
            let diff = 0;
            for (let i = 0; i < hLen; i++) diff |= H[i] ^ Hp[i];
            return diff === 0;
        }

        /**
         * Sign with RSASSA-PSS.
         * @param {Object} priv Private key components.
         * @param {Uint8Array} msg Message bytes.
         * @param {Object} hashMod Hash module (e.g. sha256).
         * @param {number} [sLen] Salt length in bytes (defaults to hLen).
         * @param {Uint8Array} [salt] Override salt (testing).
         */
        function pssSign(priv, msg, hashMod, sLen, salt) {
            const k = _modByteLen(priv.n);
            const nBn = _bytesToBn(priv.n);
            const emBits = nBn.bitLength() - 1;
            const emLen = (emBits + 7) >>> 3;
            const mHash = _hashBytes(hashMod, msg);
            if (sLen === undefined) sLen = mHash.length;
            const _salt = salt || (sLen > 0 ? random.bytes(sLen) : new Uint8Array(0));
            const em = _pssEncode(mHash, emBits, hashMod, _salt);
            if (em === false) return false;
            // Pad EM to k bytes if smaller.
            let emPadded = em;
            if (emLen < k) {
                emPadded = new Uint8Array(k);
                emPadded.set(em, k - emLen);
            }
            const s = _rsadp(priv, _bytesToBn(emPadded));
            return _bnToBytes(s, k);
        }

        function pssVerify(pub, msg, sig, hashMod, sLen) {
            const k = _modByteLen(pub.n);
            if (sig.length !== k) return false;
            const nBn = _bytesToBn(pub.n);
            const emBits = nBn.bitLength() - 1;
            const emLen = (emBits + 7) >>> 3;
            const m = _rsaep(pub, _bytesToBn(sig));
            const emFull = _bnToBytes(m, k);
            // Drop leading zero byte if EM is shorter than k (when emBits & 7 == 0, EM is k bytes).
            const em = emFull.subarray(k - emLen);
            const mHash = _hashBytes(hashMod, msg);
            if (sLen === undefined) sLen = mHash.length;
            return _pssVerify(mHash, em, emBits, hashMod, sLen);
        }

        // ── Itération G1 - Secure by default ──────────────────────────────
        //
        // PKCS #1 v1.5 signature scheme (RFC 8017 §8.2) is *legacy approved*
        // but explicitly deprecated by NIST SP 800-131A Rev. 2 (Table 5,
        // November 2019) in favour of RSASSA-PSS. Vulnerable to:
        //  - Bleichenbacher 2006 (signature forgery on RSA-3 + lax parsing);
        //  - padding error oracle on v1.5 decryption (Manger 2001).
        //
        // Rather than silently offering a discouraged path, the
        // module returns `false` + typed warning. Consumers with a
        // legacy interop need must justify it via a feature request.
        function pkcs1v15Sign() {
            console.warn('[crypto] DEPRECATED: rsa: PKCS#1 v1.5 signature scheme (RFC 8017 §8.2) is deprecated by NIST SP 800-131A Rev.2 (Table 5). Use pssSign() instead.');
            return false;
        }
        function pkcs1v15Verify() {
            console.warn('[crypto] DEPRECATED: rsa: PKCS#1 v1.5 signature verification (RFC 8017 §8.2) is deprecated by NIST SP 800-131A Rev.2 (Table 5). Use pssVerify() instead.');
            return false;
        }
        // PKCS #1 v1.5 *encryption* (RFC 8017 §7.2): Manger/Bleichenbacher
        // padding oracle. Refused for the same reasons.
        function pkcs1v15Encrypt() {
            console.warn('[crypto] DEPRECATED|UNSAFE: rsa: PKCS#1 v1.5 encryption (RFC 8017 §7.2) is vulnerable to Bleichenbacher padding oracle attacks. Use oaepEncrypt() instead.');
            return false;
        }
        function pkcs1v15Decrypt() {
            console.warn('[crypto] DEPRECATED|UNSAFE: rsa: PKCS#1 v1.5 decryption (RFC 8017 §7.2) is vulnerable to Bleichenbacher padding oracle attacks. Use oaepDecrypt() instead.');
            return false;
        }

        return /** @type {RsaAPI} */ (/** @type {any} */ ({
            // OAEP
            oaepEncrypt, oaepDecrypt,
            // PSS
            pssSign, pssVerify,
            // PKCS #1 v1.5 - DEPRECATED (Itération G1) - explicit reject.
            pkcs1v15Sign, pkcs1v15Verify, pkcs1v15Encrypt, pkcs1v15Decrypt,
            // Internal primitives - exposed for KAT tests only. Not API.
            _internal: { rsaep: _rsaep, rsadp: _rsadp, mgf1: _mgf1 }
        }));
    }
};
