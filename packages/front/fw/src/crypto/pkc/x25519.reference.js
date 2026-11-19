// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Logical reference of `x25519.js` - X25519 (RFC 7748) in the
 * loop form the fast module was optimised from.
 *
 * Field elements are Float64Array(16) of 16-bit limbs (TweetNaCl-derived
 * (public domain; see docs/dev/provenance.md)).
 *
 * Taken from `git show ecd1c5e7f^:packages/front/fw/src/crypto/pkc/x25519.js`
 * (the parent of "speed up ed25519 and x25519 with identical outputs"): the
 * Montgomery ladder with the TweetNaCl `M` accumulation loop, the square as
 * `M(o, a, a)`, the square-and-multiply inversion loop and the a24 step as
 * `M(a, c, _121665)`.
 *
 * Adapted: the parent's `factory()` body is wrapped in
 * `createX25519Reference`; `isLowOrderPoint` and its table (unchanged by
 * that commit) are left out. Validation and warnings are the fast module's.
 *
 * Kept in the git repository only: excluded from the npm tarball, the
 * exports map, the declaration tree and the registry. Imported by
 * its own co-located differential test alone, which compares it with `x25519.js`.
 */

/**
 * Build the reference X25519 API.
 * @returns {{ scalarMult: (scalar: Uint8Array, u: Uint8Array) => (Uint8Array|false), scalarMultBase: (scalar: Uint8Array) => (Uint8Array|false) }}
 *   The same two members as `x25519.factory()`.
 */
export function createX25519Reference() {

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

    return {
        scalarMult,
        scalarMultBase
    };
}
