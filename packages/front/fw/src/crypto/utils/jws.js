// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview JWS / JWT compact serialisation (RFC 7515 / RFC 7519).
 *
 * Produces and verifies the three-part `header.payload.signature` form with
 * base64url (no padding) encoding per RFC 7515 §3.1. Supported algorithms:
 *
 *   HS256 / HS512 - HMAC with SHA-256 / SHA-512
 *   EdDSA         - Ed25519 over Curve25519 (RFC 8037)
 *
 * HS384 is intentionally not supported: the build does not register a
 * `sha384` dependency. To add it, declare `sha384` in the dependency list
 * and extend the `_hmacSign` dispatch.
 *
 * The signing key for HMAC is a `Uint8Array` (the raw secret). For EdDSA,
 * the signing key is the 64-byte Ed25519 private key (seed || pub) and the
 * verification key is the 32-byte public key.
 *
 * `signJwt(claims, alg, key)` is a thin convenience over `sign` that
 * stringifies the JSON payload and sets the `typ: "JWT"` header.
 *
 */

import { bitArray } from './bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { b64 } from '../../io/codec/b64.js';
import { hmac } from '../hash/hmac.js';
import { sha256 } from '../hash/sha256.js';
import { sha512 } from '../hash/sha512.js';
import { ed25519 } from '../pkc/ed25519.js';

/**
 * Public shape returned by `jws.factory()`.
 * @typedef {object} JwsAPI
 * @property {(payload: Uint8Array, alg: string, key: Uint8Array, extraHeader?: Object) => (string|false)} sign Sign a payload and return a compact JWS.
 * @property {(token: string, key: Uint8Array, opts?: {expectedAlg?: string|string[], expectedTyp?: string}) => ({header:Object, payload:Uint8Array, claims?: Object}|false)} verify Verify a compact JWS.
 * @property {(claims: Object, alg: string, key: Uint8Array) => (string|false)} signJwt Sign a JSON claim set as a JWT.
 * @property {(token: string, key: Uint8Array, opts?: {expectedAlg?: string|string[], expectedTyp?: string}) => ({header:Object, payload:Uint8Array, claims?: Object}|false)} verifyJwt Verify a JWT and parse its claims.
 * @property {(bytes: Uint8Array) => string} _b64uEnc base64url (no padding) encode.
 * @property {(s: string) => (Uint8Array|false)} _b64uDec base64url (no padding) decode.
 */

export const jws = {
    name: 'jws',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['bitArray', 'utf8', 'b64', 'hmac', 'sha256', 'sha512', 'ed25519'],
    deps: [bitArray, utf8, b64, hmac, sha256, sha512, ed25519],

    /** @returns {JwsAPI} */
    factory(bitArray, utf8, b64, hmac, sha256, sha512, ed25519) {

        // ── base64url codec (no padding) - wraps the standard b64 codec ──

        function _b64uEnc(bytes) {
            return b64.fromBytes(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }

        function _b64uDec(s) {
            if (!/^[A-Za-z0-9\-_]*$/.test(s)) {
                console.warn('[crypto] INVALID: jws: malformed base64url');
                return false;
            }
            const std = s.replace(/-/g, '+').replace(/_/g, '/');
            const pad = (4 - (std.length % 4)) % 4;
            return b64.toBytes(std + '='.repeat(pad));
        }

        // ── string helpers ──────────────────────────────────────────────

        function _strBytes(s) { return utf8.toBytes(s); }
        function _bytesStr(b) {
            // Use TextDecoder if available, fallback otherwise.
            return typeof TextDecoder !== 'undefined'
                ? new TextDecoder().decode(b)
                : String.fromCharCode.apply(null, Array.from(b));
        }

        // ── HMAC by alg ─────────────────────────────────────────────────

        function _hmacSign(alg, key, signingInput) {
            const Hash = alg === 'HS256' ? sha256
                       : alg === 'HS512' ? sha512
                       : null;
            if (Hash === null) {
                console.warn('[crypto] INVALID: jws: unsupported HMAC alg ' + alg);
                return false;
            }
            const keyBa = bitArray.ui8_to_ba(key);
            const m = new hmac.fn(keyBa, Hash);
            return bitArray.ba_to_ui8(m.encrypt(bitArray.ui8_to_ba(_strBytes(signingInput))));
        }

        function _ctEq(a, b) {
            if (a.length !== b.length) return false;
            let d = 0;
            for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
            return d === 0;
        }

        // ── public API ──────────────────────────────────────────────────

        /**
         * Sign an arbitrary payload (Uint8Array) and return the compact JWS.
         */
        function sign(payload, alg, key, extraHeader) {
            const header = Object.assign({ alg, typ: 'JWS' }, extraHeader || {});
            const headerJson = JSON.stringify(header);
            const headerB64 = _b64uEnc(_strBytes(headerJson));
            const payloadB64 = _b64uEnc(payload);
            const signingInput = headerB64 + '.' + payloadB64;

            let sig;
            if (alg === 'HS256' || alg === 'HS512') {
                sig = _hmacSign(alg, key, signingInput);
            } else if (alg === 'EdDSA') {
                sig = ed25519.sign(key, _strBytes(signingInput));
            } else {
                console.warn('[crypto] INVALID: jws: unsupported alg ' + alg);
                return false;
            }
            if (sig === false) return false;
            return signingInput + '.' + _b64uEnc(sig);
        }

        /**
         * Verify a compact JWS. `key` is the HMAC secret (Uint8Array) for
         * HS*, or the Ed25519 public key (32 bytes) for EdDSA.
         *
         * Algorithm pinning: if `expectedAlg` is provided (string or array
         * of acceptable algs), the header `alg` field MUST be in the
         * allowlist - this prevents alg-confusion / alg-downgrade attacks
         * where an attacker substitutes the header to flip HS512 → HS256.
         *
         * `typ` pinning: if `expectedTyp` is provided, the header `typ`
         * field MUST equal it (defends against cross-protocol confusion).
         *
         * @param {string} token
         * @param {Uint8Array} key
         * @param {{expectedAlg?: string|string[], expectedTyp?: string}} [opts]
         * @returns {{header:Object, payload:Uint8Array, claims?: Object}|false}
         */
        function verify(token, key, opts) {
            const o = opts || {};
            const parts = String(token).split('.');
            if (parts.length !== 3) {
                console.warn('[crypto] INVALID: jws: token must have 3 parts');
                return false;
            }
            const [h64, p64, s64] = parts;
            const headerBytes = _b64uDec(h64);
            const payloadBytes = _b64uDec(p64);
            const sig = _b64uDec(s64);
            if (headerBytes === false || payloadBytes === false || sig === false) return false;

            let header;
            try { header = JSON.parse(_bytesStr(headerBytes)); }
            catch { console.warn('[crypto] INVALID: jws: malformed header JSON'); return false; }

            const alg = header.alg;
            if (o.expectedAlg !== undefined) {
                const allowed = Array.isArray(o.expectedAlg) ? o.expectedAlg : [o.expectedAlg];
                if (!allowed.includes(alg)) {
                    console.warn('[crypto] INVALID: jws: alg ' + alg + ' not in expectedAlg allowlist');
                    return false;
                }
            }
            if (o.expectedTyp !== undefined && header.typ !== o.expectedTyp) {
                console.warn('[crypto] INVALID: jws: typ ' + header.typ + ' does not match expectedTyp ' + o.expectedTyp);
                return false;
            }

            const signingInput = h64 + '.' + p64;
            let ok;
            if (alg === 'HS256' || alg === 'HS512') {
                const expected = _hmacSign(alg, key, signingInput);
                if (expected === false) return false;
                ok = _ctEq(expected, sig);
            } else if (alg === 'EdDSA') {
                ok = ed25519.verify(key, _strBytes(signingInput), sig);
            } else {
                console.warn('[crypto] INVALID: jws: unsupported alg ' + alg);
                return false;
            }
            if (!ok) {
                console.error('[crypto] CORRUPT: jws: signature verification failed');
                return false;
            }
            return { header, payload: payloadBytes };
        }

        /** Convenience: sign a JSON claim set as a JWT (RFC 7519). */
        function signJwt(claims, alg, key) {
            const payload = _strBytes(JSON.stringify(claims));
            const tok = sign(payload, alg, key, { typ: 'JWT' });
            return tok;
        }

        /**
         * Convenience: verify a JWT and parse the claims. Supports the same
         * `expectedAlg` / `expectedTyp` pinning as {@link verify}.
         * @param {string} token
         * @param {Uint8Array} key
         * @param {{expectedAlg?: string|string[], expectedTyp?: string}} [opts]
         */
        function verifyJwt(token, key, opts) {
            const r = verify(token, key, opts);
            if (r === false) return false;
            try { r.claims = JSON.parse(_bytesStr(r.payload)); }
            catch { console.warn('[crypto] INVALID: jwt: malformed claims JSON'); return false; }
            return r;
        }

        return {
            sign, verify, signJwt, verifyJwt,
            _b64uEnc, _b64uDec
        };
    }
};
