// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview X25519 - Diffie-Hellman over Curve25519 (RFC 7748).
 *
 * Implements the Montgomery ladder for the curve y² = x³ + 486662x² + x
 * over the prime field GF(2^255 − 19). Field elements are represented as
 * Float64Array(16) of 16-bit limbs (TweetNaCl-derived (public domain; see
 * docs/dev/provenance.md)) which gives exact 32-bit products in JS doubles
 * and avoids 53-bit precision pitfalls during reduction.
 *
 * Public API takes raw Uint8Array (32 bytes for both scalar and u-coord)
 * matching the wire format defined by RFC 7748 §5. The standard scalar
 * clamping (clear low 3 bits, clear high bit, set bit 254) is applied
 * automatically per §5 step 2.
 *
 */

/**
 * Public API returned by `x25519.factory()`.
 * @typedef {object} X25519API
 * @property {(scalar: Uint8Array, u: Uint8Array) => (Uint8Array|false)} scalarMult Compute scalarmult(scalar, u); 32-byte output or false.
 * @property {(scalar: Uint8Array) => (Uint8Array|false)} scalarMultBase scalarmult against the base point u=9.
 * @property {(u: Uint8Array) => boolean} isLowOrderPoint True iff `u` is a documented low-order point (or malformed length).
 * @property {{ lowOrderPoints: Uint8Array[] }} _internal Embedded low-order point table.
 */

export const x25519 = {
    name: 'x25519',
    version: '1.0.0',
    type: 'fw.crypto.pkc',
    dependencies: [],

    /** @returns {X25519API} */
    factory() {

        // Standard curve constant a24 = (486662 - 2) / 4 = 121665.
        const _121665 = new Float64Array(16);
        _121665[0] = 0xDB41; _121665[1] = 1;

        function _gf(init) {
            const r = new Float64Array(16);
            if (init) for (let i = 0; i < init.length; i++) r[i] = init[i];
            return r;
        }

        function _car25519(o) {
            for (let i = 0; i < 16; i++) {
                o[i] += 65536;
                const c = Math.floor(o[i] / 65536);
                o[(i + 1) * (i < 15 ? 1 : 0)] += c - 1 + 37 * (c - 1) * (i === 15 ? 1 : 0);
                o[i] -= c * 65536;
            }
        }

        // Constant-time conditional swap (TweetNaCl `sel25519`). The mask `c`
        // is derived from `b` via bitwise arithmetic only - no data-dependent
        // branch - so every iteration performs identical memory writes
        // regardless of whether the swap actually happens. This is the
        // primitive that keeps the Montgomery ladder side-channel free.
        function _sel25519(p, q, b) {
            const c = ~(b - 1);
            for (let i = 0; i < 16; i++) {
                const t = c & (p[i] ^ q[i]);
                p[i] ^= t;
                q[i] ^= t;
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

        function _unpack25519(o, n) {
            for (let i = 0; i < 16; i++) o[i] = n[2 * i] + (n[2 * i + 1] << 8);
            o[15] &= 0x7fff;
        }

        function _A(o, a, b) { for (let i = 0; i < 16; i++) o[i] = a[i] + b[i]; }
        function _Z(o, a, b) { for (let i = 0; i < 16; i++) o[i] = a[i] - b[i]; }

        function _M(o, a, b) {
            const t = new Float64Array(31);
            for (let i = 0; i < 16; i++) {
                for (let j = 0; j < 16; j++) {
                    t[i + j] += a[i] * b[j];
                }
            }
            for (let i = 0; i < 15; i++) t[i] += 38 * t[i + 16];
            for (let i = 0; i < 16; i++) o[i] = t[i];
            _car25519(o); _car25519(o);
        }

        function _S(o, a) { _M(o, a, a); }

        function _inv25519(o, i) {
            const c = _gf();
            for (let a = 0; a < 16; a++) c[a] = i[a];
            for (let a = 253; a >= 0; a--) {
                _S(c, c);
                if (a !== 2 && a !== 4) _M(c, c, i);
            }
            for (let a = 0; a < 16; a++) o[a] = c[a];
        }

        function _scalarmult(q, n, p) {
            const z = new Uint8Array(32);
            const x = _gf(), a = _gf(), b = _gf(), c = _gf(), d = _gf(), e = _gf(), f = _gf();
            for (let i = 0; i < 31; i++) z[i] = n[i];
            z[31] = (n[31] & 127) | 64;
            z[0] &= 248;
            _unpack25519(x, p);
            for (let i = 0; i < 16; i++) { b[i] = x[i]; d[i] = a[i] = c[i] = 0; }
            a[0] = d[0] = 1;
            for (let i = 254; i >= 0; --i) {
                const r = (z[i >>> 3] >>> (i & 7)) & 1;
                _sel25519(a, b, r);
                _sel25519(c, d, r);
                _A(e, a, c);
                _Z(a, a, c);
                _A(c, b, d);
                _Z(b, b, d);
                _S(d, e);
                _S(f, a);
                _M(a, c, a);
                _M(c, b, e);
                _A(e, a, c);
                _Z(a, a, c);
                _S(b, a);
                _Z(c, d, f);
                _M(a, c, _121665);
                _A(a, a, d);
                _M(c, c, a);
                _M(a, d, f);
                _M(d, b, x);
                _S(b, e);
                _sel25519(a, b, r);
                _sel25519(c, d, r);
            }
            _inv25519(c, c);
            _M(a, a, c);
            _pack25519(q, a);
            return 0;
        }

        const _BASE = new Uint8Array(32);
        _BASE[0] = 9;

        /**
         * Compute scalarmult(scalar, u).
         * @param {Uint8Array} scalar 32-byte scalar (will be clamped).
         * @param {Uint8Array} u 32-byte u-coordinate.
         * @returns {Uint8Array|false} 32-byte shared secret / output u-coordinate, or false on invalid input.
         */
        function scalarMult(scalar, u) {
            if (!(scalar instanceof Uint8Array) || scalar.length !== 32) {
                console.warn('[crypto] INVALID: x25519: scalar must be 32 bytes');
                return false;
            }
            if (!(u instanceof Uint8Array) || u.length !== 32) {
                console.warn('[crypto] INVALID: x25519: u must be 32 bytes');
                return false;
            }
            const out = new Uint8Array(32);
            _scalarmult(out, scalar, u);
            return out;
        }

        /** scalarmult of `scalar` against the standard base point u=9. */
        function scalarMultBase(scalar) {
            return scalarMult(scalar, _BASE);
        }

        // ── Iteration G5 - Low-order point detection helper ──────────────
        //
        // Curve25519 has cofactor 8; some u-coords generate a subgroup
        // of small order (1, 2, 4, 8). If Alice uses such a u
        // as Bob's public key, the product `scalarMult(scalar, u)` is
        // **always zero** or takes one of a few predictable values -
        // which allows an active attacker (substituting the public key
        // in a Diffie-Hellman exchange) to force a known shared secret.
        //
        // RFC 7748 §6.1 recommends either (a) accepting small-order
        // points and letting the `result === 00…00` check filter downstream,
        // or (b) explicitly rejecting before `scalarMult`. This helper offers
        // option (b), explicit on the caller side.
        //
        // List: 7 unique u-coordinates documented (Bernstein 2006,
        // Wycheproof project, libsodium `crypto_scalarmult_curve25519_ref10`
        // table `crypto_scalarmult_curve25519_ref10_is_canonical`).
        //
        // - 0x00…00 : order-4 point (≈ point at infinity)
        // - 0x01…00 : order-1 point (trivial generator)
        // - 0xe0eb7a…85a800 : order 8 (on the main curve)
        // - 0x5f9c95…1f1157 : order 8 (on the twist)
        // - 0xec…7f, 0xed…7f, 0xee…7f : equivalents mod p of the three above.
        //
        // Constant-time comparison to avoid timing leak on `u` (even
        // if `u` is public, the pattern remains best practice).
        const _LOW_ORDER_POINTS = [
            // 7 unique low-order u-coordinates on Curve25519 (cofactor 8).
            new Uint8Array([
                0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
            ]),
            new Uint8Array([
                0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
            ]),
            new Uint8Array([
                0xe0,0xeb,0x7a,0x7c,0x3b,0x41,0xb8,0xae,0x16,0x56,0xe3,0xfa,0xf1,0x9f,0xc4,0x6a,
                0xda,0x09,0x8d,0xeb,0x9c,0x32,0xb1,0xfd,0x86,0x62,0x05,0x16,0x5f,0x49,0xb8,0x00,
            ]),
            new Uint8Array([
                0x5f,0x9c,0x95,0xbc,0xa3,0x50,0x8c,0x24,0xb1,0xd0,0xb1,0x55,0x9c,0x83,0xef,0x5b,
                0x04,0x44,0x5c,0xc4,0x58,0x1c,0x8e,0x86,0xd8,0x22,0x4e,0xdd,0xd0,0x9f,0x11,0x57,
            ]),
            new Uint8Array([
                0xec,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,
                0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x7f,
            ]),
            new Uint8Array([
                0xed,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,
                0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x7f,
            ]),
            new Uint8Array([
                0xee,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,
                0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x7f,
            ]),
        ];

        /**
         * Test whether `u` is one of the documented low-order u-coordinates
         * on Curve25519 (cofactor-8 subgroup elements). RFC 7748 §6.1.
         *
         * Constant-time comparison vs the embedded table.
         *
         * @param {Uint8Array} u 32-byte u-coordinate.
         * @returns {boolean} true iff `u` is low-order (or a malformed length).
         */
        function isLowOrderPoint(u) {
            if (!(u instanceof Uint8Array) || u.length !== 32) {
                console.warn('[crypto] INVALID: x25519: u must be 32 bytes');
                return false;
            }
            // Mask the high bit per RFC 7748 §5 (`u_255 = 0`) to canonicalise.
            const norm = new Uint8Array(u);
            norm[31] &= 0x7f;
            // Constant-time : OR-accumulate `(norm == lop)` over all entries.
            // We aggregate `equal_i` into a flag then return `flag !== 0`.
            let anyMatch = 0;
            for (let p = 0; p < _LOW_ORDER_POINTS.length; p++) {
                const lop = _LOW_ORDER_POINTS[p];
                let diff = 0;
                for (let i = 0; i < 32; i++) diff |= (norm[i] ^ lop[i]);
                // diff === 0  ⇒ match. Convert to {0, 1} branchless :
                //   ((diff - 1) >>> 31) returns 1 only when diff === 0.
                anyMatch |= ((diff - 1) >>> 31) & 1;
            }
            return anyMatch === 1;
        }

        return {
            scalarMult,
            scalarMultBase,
            // Iteration G5 - opt-in defensive helper.
            isLowOrderPoint,
            _internal: { lowOrderPoints: _LOW_ORDER_POINTS }
        };
    }
};
