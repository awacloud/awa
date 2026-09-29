// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Ed25519 - EdDSA signature scheme over the twisted Edwards
 * curve −x² + y² = 1 − (121665/121666)·x²·y² over GF(2^255 − 19) (RFC 8032).
 *
 * Implementation derived from the TweetNaCl reference (Bernstein et al.,
 * public domain). See docs/dev/provenance.md. Field elements are 16-limb
 * Float64Arrays of 16-bit limbs;
 * the curve point format is the projective extended (X, Y, Z, T) tuple
 * where x = X/Z, y = Y/Z, T = XY/Z.
 *
 * Public API operates on `Uint8Array` per RFC 8032:
 *   - keyPair(seed?): { publicKey, privateKey }   (privateKey = seed || pubKey)
 *   - sign(privateKey, message): 64-byte signature
 *   - verify(publicKey, message, signature): boolean
 *
 * SHA-512 is required for the internal H function - the caller must
 * inject it (factory dependency `sha512`).
 *
 */

import { sha512 } from '../hash/sha512.js';
import { bitArray } from '../utils/bitArray.js';

/**
 * Ed25519 key pair (RFC 8032). `privateKey` is the 64-byte `seed || publicKey`.
 * @typedef {object} Ed25519KeyPair
 * @property {Uint8Array} publicKey 32-byte public key.
 * @property {Uint8Array} privateKey 64-byte private key (seed || pub).
 */

/**
 * Ed448 explicit-reject stub group (NOT-IMPLEMENTED guards).
 * @typedef {object} Ed25519Ed448Reject
 * @property {() => false} keyPair
 * @property {() => false} sign
 * @property {() => false} verify
 * @property {() => false} signPh
 * @property {() => false} verifyPh
 */

/**
 * Public API returned by `ed25519.factory()`.
 * @typedef {object} Ed25519API
 * @property {(seed: Uint8Array) => (Ed25519KeyPair|false)} keyPair Generate a key pair from a 32-byte seed.
 * @property {(privateKey: Uint8Array, message: Uint8Array) => (Uint8Array|false)} sign Pure Ed25519 sign (64-byte signature).
 * @property {(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array) => boolean} verify Pure Ed25519 verify.
 * @property {(privateKey: Uint8Array, message: Uint8Array, context?: Uint8Array) => (Uint8Array|false)} signPh Ed25519ph (preHash) sign.
 * @property {(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array, context?: Uint8Array) => boolean} verifyPh Ed25519ph verify.
 * @property {(privateKey: Uint8Array, message: Uint8Array, context: Uint8Array) => (Uint8Array|false)} signCtx Ed25519ctx sign.
 * @property {(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array, context: Uint8Array) => boolean} verifyCtx Ed25519ctx verify.
 * @property {Ed25519Ed448Reject} ed448 Ed448 explicit-reject stubs.
 * @property {{ isValidPublicKey: (pk: Uint8Array) => boolean, dom2: (F: number, ctx: (Uint8Array|null)) => (Uint8Array|false) }} _internal Test-only escape hatch.
 */

export const ed25519 = {
    name: 'ed25519',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: ['sha512', 'bitArray'],
    deps: [sha512, bitArray],

    /** @returns {Ed25519API} */
    factory(sha512, bitArray) {

        // ── Field GF(2^255-19), 16x16-bit limbs ─────────────────────────

        function _gf(init) {
            const r = new Float64Array(16);
            if (init) for (let i = 0; i < init.length; i++) r[i] = init[i];
            return r;
        }

        const _gf0 = _gf();
        const _gf1 = _gf([1]);
        const _D = _gf([0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070,
                        0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203]);
        const _D2 = _gf([0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0,
                         0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406]);
        const _X = _gf([0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c,
                        0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169]);
        const _Y = _gf([0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666,
                        0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666]);
        const _I = _gf([0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43,
                        0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83]);

        function _car25519(o) {
            for (let i = 0; i < 16; i++) {
                o[i] += 65536;
                const c = Math.floor(o[i] / 65536);
                o[(i + 1) * (i < 15 ? 1 : 0)] += c - 1 + 37 * (c - 1) * (i === 15 ? 1 : 0);
                o[i] -= c * 65536;
            }
        }

        function _sel25519(p, q, b) {
            const c = ~(b - 1);
            for (let i = 0; i < 16; i++) {
                const t = c & (p[i] ^ q[i]);
                p[i] ^= t; q[i] ^= t;
            }
        }

        function _pack25519(o, n) {
            const m = _gf(), t = _gf();
            for (let i = 0; i < 16; i++) t[i] = n[i];
            _car25519(t); _car25519(t); _car25519(t);
            for (let j = 0; j < 2; j++) {
                m[0] = t[0] - 0xffed;
                for (let i = 1; i < 15; i++) {
                    m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
                    m[i - 1] &= 0xffff;
                }
                m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
                const b = (m[15] >> 16) & 1;
                m[14] &= 0xffff;
                _sel25519(t, m, 1 - b);
            }
            for (let i = 0; i < 16; i++) {
                o[2 * i] = t[i] & 0xff;
                o[2 * i + 1] = t[i] >> 8;
            }
        }

        function _neq25519(a, b) {
            const c = new Uint8Array(32), d = new Uint8Array(32);
            _pack25519(c, a); _pack25519(d, b);
            let r = 0;
            for (let i = 0; i < 32; i++) r |= c[i] ^ d[i];
            return (1 & ((r - 1) >>> 8)) - 1;
        }

        function _par25519(a) { const d = new Uint8Array(32); _pack25519(d, a); return d[0] & 1; }

        function _unpack25519(o, n) {
            for (let i = 0; i < 16; i++) o[i] = n[2 * i] + (n[2 * i + 1] << 8);
            o[15] &= 0x7fff;
        }

        function _A(o, a, b) { for (let i = 0; i < 16; i++) o[i] = a[i] + b[i]; }
        function _Z(o, a, b) { for (let i = 0; i < 16; i++) o[i] = a[i] - b[i]; }
        function _M(o, a, b) {
            const t = new Float64Array(31);
            for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) t[i + j] += a[i] * b[j];
            for (let i = 0; i < 15; i++) t[i] += 38 * t[i + 16];
            for (let i = 0; i < 16; i++) o[i] = t[i];
            _car25519(o); _car25519(o);
        }
        function _S(o, a) { _M(o, a, a); }
        function _inv25519(o, i) {
            const c = _gf();
            for (let a = 0; a < 16; a++) c[a] = i[a];
            for (let a = 253; a >= 0; a--) { _S(c, c); if (a !== 2 && a !== 4) _M(c, c, i); }
            for (let a = 0; a < 16; a++) o[a] = c[a];
        }
        function _pow2523(o, i) {
            const c = _gf();
            for (let a = 0; a < 16; a++) c[a] = i[a];
            for (let a = 250; a >= 0; a--) { _S(c, c); if (a !== 1) _M(c, c, i); }
            for (let a = 0; a < 16; a++) o[a] = c[a];
        }

        // ── Group operations on extended Edwards points (P, Q): [4]gf ───

        function _set25519(r, a) { for (let i = 0; i < 16; i++) r[i] = a[i]; }

        function _add(p, q) {
            const a = _gf(), b = _gf(), c = _gf(), d = _gf(), e = _gf(),
                  f = _gf(), g = _gf(), h = _gf(), t = _gf();
            _Z(a, p[1], p[0]); _Z(t, q[1], q[0]); _M(a, a, t);
            _A(b, p[0], p[1]); _A(t, q[0], q[1]); _M(b, b, t);
            _M(c, p[3], q[3]); _M(c, c, _D2);
            _M(d, p[2], q[2]); _A(d, d, d);
            _Z(e, b, a);
            _Z(f, d, c);
            _A(g, d, c);
            _A(h, b, a);
            _M(p[0], e, f);
            _M(p[1], h, g);
            _M(p[2], g, f);
            _M(p[3], e, h);
        }

        function _cswap(p, q, b) {
            for (let i = 0; i < 4; i++) _sel25519(p[i], q[i], b);
        }

        function _pack(r, p) {
            const tx = _gf(), ty = _gf(), zi = _gf();
            _inv25519(zi, p[2]);
            _M(tx, p[0], zi);
            _M(ty, p[1], zi);
            _pack25519(r, ty);
            r[31] ^= _par25519(tx) << 7;
        }

        // Constant-time scalar multiplication: fixed-iteration double-and-add
        // with conditional swap on each scalar bit. The swap is implemented
        // via `_sel25519` (bitmask only - no data-dependent branch), so the
        // memory access pattern is independent of the secret scalar. This is
        // the side-channel guarantee that EdDSA signing relies on.
        function _scalarmult(p, q, s) {
            _set25519(p[0], _gf0);
            _set25519(p[1], _gf1);
            _set25519(p[2], _gf1);
            _set25519(p[3], _gf0);
            for (let i = 255; i >= 0; --i) {
                const b = (s[(i / 8) | 0] >> (i & 7)) & 1;
                _cswap(p, q, b);
                _add(q, p);
                _add(p, p);
                _cswap(p, q, b);
            }
        }

        function _scalarbase(p, s) {
            const q = [_gf(), _gf(), _gf(), _gf()];
            _set25519(q[0], _X);
            _set25519(q[1], _Y);
            _set25519(q[2], _gf1);
            _M(q[3], _X, _Y);
            _scalarmult(p, q, s);
        }

        // ── L = 2^252 + 27742317777372353535851937790883648493 ──────────

        const _L = new Float64Array([
            0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58,
            0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14,
            0,    0,    0,    0,    0,    0,    0,    0,
            0,    0,    0,    0,    0,    0,    0,    0x10
        ]);

        function _modL(r, x) {
            let carry, i, j;
            for (i = 63; i >= 32; --i) {
                carry = 0;
                for (j = i - 32; j < i - 12; j++) {
                    x[j] += carry - 16 * x[i] * _L[j - (i - 32)];
                    carry = Math.floor((x[j] + 128) / 256);
                    x[j] -= carry * 256;
                }
                x[j] += carry;
                x[i] = 0;
            }
            carry = 0;
            for (j = 0; j < 32; j++) {
                x[j] += carry - (x[31] >> 4) * _L[j];
                carry = x[j] >> 8;
                x[j] &= 255;
            }
            for (j = 0; j < 32; j++) x[j] -= carry * _L[j];
            for (i = 0; i < 32; i++) {
                x[i + 1] += x[i] >> 8;
                r[i] = x[i] & 255;
            }
        }

        function _reduce(r) {
            const x = new Float64Array(64);
            for (let i = 0; i < 64; i++) x[i] = r[i];
            for (let i = 0; i < 64; i++) r[i] = 0;
            _modL(r, x);
        }

        // ── SHA-512 wrapper returning 64 raw bytes ──────────────────────

        function _h(...parts) {
            // Concatenate parts (Uint8Arrays) and SHA-512.
            let total = 0;
            for (const p of parts) total += p.length;
            const buf = new Uint8Array(total);
            let off = 0;
            for (const p of parts) { buf.set(p, off); off += p.length; }
            const ba = bitArray.ui8_to_ba(buf);
            return bitArray.ba_to_ui8(sha512.hash(ba));
        }

        // ── RFC 8032 §5.1 dom2 prefix (Ed25519ph + Ed25519ctx) ─────────
        // Iteration E1 of the FIPS 140-3 upgrade plan / FIPS 186-5 §7.6.
        //
        // dom2(F, C) = "SigEd25519 no Ed25519 collisions" (32 ASCII bytes)
        //              || octet(F)          // 1=ph, 0=ctx
        //              || octet(OLEN(C))    // context length 0..255
        //              || C                 // context bytes
        //
        // For pure Ed25519 (default, RFC 8032 §5.1.6 step 2 "absent"),
        // dom2 is NOT prepended - preserved by passing `null` as dom.

        const _DOM2_PREFIX = new Uint8Array([
            // ASCII "SigEd25519 no Ed25519 collisions" (32 bytes)
            0x53, 0x69, 0x67, 0x45, 0x64, 0x32, 0x35, 0x35, 0x31, 0x39, 0x20,
            0x6e, 0x6f, 0x20, 0x45, 0x64, 0x32, 0x35, 0x35, 0x31, 0x39, 0x20,
            0x63, 0x6f, 0x6c, 0x6c, 0x69, 0x73, 0x69, 0x6f, 0x6e, 0x73
        ]);

        function _dom2(F, ctx) {
            const ctxLen = ctx ? ctx.length : 0;
            if (ctxLen > 255) {
                console.warn('[crypto] INVALID: ed25519: context must be ≤ 255 bytes');
                return false;
            }
            const out = new Uint8Array(32 + 2 + ctxLen);
            out.set(_DOM2_PREFIX, 0);
            out[32] = F & 0xff;
            out[33] = ctxLen & 0xff;
            if (ctxLen > 0) out.set(ctx, 34);
            return out;
        }

        // ── Public API ─────────────────────────────────────────────────

        function _seedToKeyPair(seed) {
            const d = _h(seed);
            d[0] &= 248; d[31] &= 127; d[31] |= 64;
            const p = [_gf(), _gf(), _gf(), _gf()];
            const pk = new Uint8Array(32);
            _scalarbase(p, d);
            _pack(pk, p);
            const sk = new Uint8Array(64);
            sk.set(seed, 0);
            sk.set(pk, 32);
            return { publicKey: pk, privateKey: sk };
        }

        /**
         * Generate a key pair from a 32-byte seed (or fail if seed is missing).
         */
        function keyPair(seed) {
            if (!(seed instanceof Uint8Array) || seed.length !== 32) {
                console.warn('[crypto] INVALID: ed25519: seed must be 32 bytes');
                return false;
            }
            return _seedToKeyPair(seed);
        }

        // Internal sign - `dom` is `null` for pure Ed25519, or a Uint8Array
        // dom2 prefix for Ed25519ph (F=1) / Ed25519ctx (F=0).
        function _signCore(privateKey, message, dom) {
            if (!(privateKey instanceof Uint8Array) || privateKey.length !== 64) {
                console.warn('[crypto] INVALID: ed25519: privateKey must be 64 bytes (seed || pub)');
                return false;
            }
            const seed = privateKey.subarray(0, 32);
            const pk = privateKey.subarray(32, 64);

            const d = _h(seed);
            d[0] &= 248; d[31] &= 127; d[31] |= 64;
            const prefix = d.subarray(32, 64);

            // RFC 8032 §5.1.6 step 2 : r = SHA-512(dom2(F,C) || prefix || PH(M))
            const r = dom ? _h(dom, prefix, message) : _h(prefix, message);
            _reduce(r);
            const p = [_gf(), _gf(), _gf(), _gf()];
            _scalarbase(p, r);
            const R = new Uint8Array(32);
            _pack(R, p);

            // RFC 8032 §5.1.6 step 4 : k = SHA-512(dom2(F,C) || R || A || PH(M))
            const k = dom ? _h(dom, R, pk, message) : _h(R, pk, message);
            _reduce(k);

            const S = new Uint8Array(32);
            const x = new Float64Array(64);
            for (let i = 0; i < 32; i++) x[i] = r[i];
            for (let i = 0; i < 32; i++) {
                for (let j = 0; j < 32; j++) x[i + j] += k[i] * d[j];
            }
            _modL(S, x);

            const sig = new Uint8Array(64);
            sig.set(R, 0);
            sig.set(S, 32);
            return sig;
        }

        /**
         * Pure Ed25519 sign (RFC 8032 §5.1, FIPS 186-5 §7.6).
         * @param {Uint8Array} privateKey 64 bytes (seed || pub).
         * @param {Uint8Array} message
         * @returns {Uint8Array|false} 64-byte signature.
         */
        function sign(privateKey, message) {
            return _signCore(privateKey, message, null);
        }

        /**
         * Ed25519ph (preHash) sign (RFC 8032 §5.1.1 / FIPS 186-5 §7.6.2).
         * The IUT applies SHA-512 internally to the message before signing,
         * per the standard preHash convention. Pass the **raw** message (the
         * function does NOT accept a pre-hashed digest).
         * @param {Uint8Array} privateKey 64 bytes.
         * @param {Uint8Array} message Raw message (will be SHA-512'd internally).
         * @param {Uint8Array} [context] Optional context (≤ 255 bytes).
         * @returns {Uint8Array|false} 64-byte signature.
         */
        function signPh(privateKey, message, context) {
            const dom = _dom2(1, context);
            if (dom === false) return false;
            const ph = _h(message);   // SHA-512(message), 64 bytes
            return _signCore(privateKey, ph, dom);
        }

        /**
         * Ed25519ctx sign (RFC 8032 §5.1 with F=0 + non-empty context, FIPS
         * 186-5 §7.6.1). Note: pure Ed25519 differs from Ed25519ctx with
         * empty context - the standards explicitly distinguish them.
         * @param {Uint8Array} privateKey 64 bytes.
         * @param {Uint8Array} message
         * @param {Uint8Array} context Required (≥ 1 byte, ≤ 255 bytes).
         * @returns {Uint8Array|false} 64-byte signature.
         */
        function signCtx(privateKey, message, context) {
            if (!(context instanceof Uint8Array) || context.length === 0 || context.length > 255) {
                console.warn('[crypto] INVALID: ed25519: signCtx context must be 1..255 bytes (use sign() for empty context)');
                return false;
            }
            const dom = _dom2(0, context);
            if (dom === false) return false;
            return _signCore(privateKey, message, dom);
        }

        function _unpackneg(r, p) {
            const t = _gf(), chk = _gf(), num = _gf(), den = _gf(), den2 = _gf(), den4 = _gf(), den6 = _gf();
            _set25519(r[2], _gf1);
            _unpack25519(r[1], p);
            _S(num, r[1]);
            _M(den, num, _D);
            _Z(num, num, r[2]);
            _A(den, r[2], den);
            _S(den2, den); _S(den4, den2); _M(den6, den4, den2);
            _M(t, den6, num); _M(t, t, den);
            _pow2523(t, t);
            _M(t, t, num); _M(t, t, den); _M(t, t, den);
            _M(r[0], t, den);
            _S(chk, r[0]); _M(chk, chk, den);
            if (_neq25519(chk, num)) _M(r[0], r[0], _I);
            _S(chk, r[0]); _M(chk, chk, den);
            if (_neq25519(chk, num)) return -1;
            if (_par25519(r[0]) === (p[31] >> 7)) _Z(r[0], _gf0, r[0]);
            _M(r[3], r[0], r[1]);
            return 0;
        }

        // Group order L = 2^252 + 27742317777372353535851937790883648493
        // (RFC 8032 §5.1, little-endian). The canonical-form check
        // `s < L` (RFC 8032 §5.1.7 step 2) rejects malleable signatures
        // where s has been replaced by s + k·L for some k>0; without it,
        // an attacker can produce multiple valid signatures for the same
        // (pk, m) pair, breaking any protocol that uses signature bytes
        // as a unique handle (e.g. transaction IDs).
        const _ED25519_L = new Uint8Array([
            0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58,
            0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10
        ]);

        // Constant-time test: returns true iff s (32 bytes, little-endian)
        // is strictly less than L. Walks from the most-significant byte
        // down and folds the comparison through a borrow accumulator so
        // every byte is touched regardless of the result.
        function _sLessThanL(s) {
            let lt = 0, gt = 0;
            for (let i = 31; i >= 0; i--) {
                const a = s[i] | 0, b = _ED25519_L[i] | 0;
                // lt becomes 1 once a<b is seen at a higher byte; gt for a>b.
                const ltHere = ((a - b) >>> 31) & 1;
                const gtHere = ((b - a) >>> 31) & 1;
                lt |= ltHere & (1 - gt);
                gt |= gtHere & (1 - lt);
            }
            return lt === 1;
        }

        function _verifyCore(publicKey, message, signature, dom) {
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return false;
            if (!(signature instanceof Uint8Array) || signature.length !== 64) return false;

            // RFC 8032 §5.1.7 step 2: reject if s is not in canonical form.
            // Signature layout is R (32 bytes) || s (32 bytes, little-endian).
            if (!_sLessThanL(signature.subarray(32, 64))) return false;

            const q = [_gf(), _gf(), _gf(), _gf()];
            if (_unpackneg(q, publicKey) !== 0) return false;

            const R = signature.subarray(0, 32);
            const k = dom ? _h(dom, R, publicKey, message) : _h(R, publicKey, message);
            _reduce(k);

            const p = [_gf(), _gf(), _gf(), _gf()];
            _scalarmult(p, q, k);

            const Rcheck = [_gf(), _gf(), _gf(), _gf()];
            _scalarbase(Rcheck, signature.subarray(32, 64));
            _add(p, Rcheck);

            const t = new Uint8Array(32);
            _pack(t, p);
            // Constant-time compare: accumulate XOR diffs across all 32 bytes.
            let diff = 0;
            for (let i = 0; i < 32; i++) diff |= signature[i] ^ t[i];
            return diff === 0;
        }

        /** Pure Ed25519 verify (RFC 8032 §5.1.7). */
        function verify(publicKey, message, signature) {
            return _verifyCore(publicKey, message, signature, null);
        }

        /** Ed25519ph verify (RFC 8032 §5.1.1 / FIPS 186-5 §7.6.2). */
        function verifyPh(publicKey, message, signature, context) {
            const dom = _dom2(1, context);
            if (dom === false) return false;
            const ph = _h(message);
            return _verifyCore(publicKey, ph, signature, dom);
        }

        /** Ed25519ctx verify (RFC 8032 §5.1 with F=0). */
        function verifyCtx(publicKey, message, signature, context) {
            if (!(context instanceof Uint8Array) || context.length === 0 || context.length > 255) {
                console.warn('[crypto] INVALID: ed25519: verifyCtx context must be 1..255 bytes');
                return false;
            }
            const dom = _dom2(0, context);
            if (dom === false) return false;
            return _verifyCore(publicKey, message, signature, dom);
        }

        // ── Ed448 explicit reject (Iteration E2 of the FIPS 140-3 upgrade plan)
        //
        // FIPS 186-5 §7.7 admits Ed448 (edwards448 curve + SHAKE-256, output
        // pk 57 bytes, sig 114 bytes). This module only implements
        // Ed25519/edwards25519 (RFC 8032 §5.1). To prevent any silent use
        // of an Ed448 function by a consumer that has confused the two
        // variants, explicit stubs are exposed returning `false` +
        // typed warning `NOT-IMPLEMENTED`.
        //
        // If Ed448 becomes necessary (CMVP lab, specific interop), create
        // a separate module `ed448.js` (distinct curve + hash; does NOT share
        // the Ed25519 compression function). Implementation to derive
        // directly from RFC 8032 §5.2 (Edwards448 + SHAKE-256).
        function _ed448Reject(method) {
            console.warn('[crypto] NOT-IMPLEMENTED: ed25519: Ed448 (FIPS 186-5 §7.7 / RFC 8032 §5.2) is a separate curve (edwards448 + SHAKE-256, 57-byte pk / 114-byte sig) and is NOT implemented in this module. Use Ed25519 (' + method + '() instead) or implement a separate ed448.js module if Ed448 is required for CMVP / interop.');
            return false;
        }
        const ed448 = {
            keyPair: () => _ed448Reject('keyPair'),
            sign:    () => _ed448Reject('sign'),
            verify:  () => _ed448Reject('verify'),
            signPh:  () => _ed448Reject('signPh'),
            verifyPh: () => _ed448Reject('verifyPh')
        };

        return /** @type {Ed25519API} */ (/** @type {any} */ ({
            keyPair,
            sign, verify,
            // Iteration E1 of the FIPS 140-3 upgrade plan - Ed25519ph variants
            // (preHash, RFC 8032 §5.1.1) and Ed25519ctx (context bytes,
            // RFC 8032 §5.1).
            signPh, verifyPh,
            signCtx, verifyCtx,
            // Iteration E2 - Ed448 explicit reject (NOT-IMPLEMENTED guards).
            ed448,
            // Test-only escape hatch: ACVP EDDSA-KeyVer-1.0 needs a way to
            // probe public-key validity (point decompression + on-curve check)
            // independently of signature verification. Not part of the public
            // API contract; do not call from production code.
            _internal: {
                isValidPublicKey(pk) {
                    if (!(pk instanceof Uint8Array) || pk.length !== 32) return false;
                    const q = [_gf(), _gf(), _gf(), _gf()];
                    return _unpackneg(q, pk) === 0;
                },
                dom2: _dom2
            }
        }));
    }
};
