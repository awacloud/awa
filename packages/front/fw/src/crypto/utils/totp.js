// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * TOTP (RFC 6238) and HOTP (RFC 4226) - time-based one-time-password code
 * generation. Includes enrollment helpers (secret generation, `otpauth://`
 * URI) and verification with a constant-time tolerance window.
 *
 * Algorithm: HOTP(secret, T) where T = floor((now - T0) / period), T encoded
 * as 8 big-endian bytes, HMAC-SHA-1/256/512 depending on the chosen
 * algorithm, then dynamic truncation (RFC 4226 §5.3) and modulo 10^digits.
 *
 * **Recommendation**: prefer `algorithm: 'SHA-256'` for new installations.
 * SHA-1 is kept as the default for RFC 6238 compatibility and interop with
 * existing authenticators (Google Authenticator, Authy, etc.). The SHA-1
 * default is deliberate; callers that need stronger defaults must pass
 * `algorithm: 'SHA-256'` explicitly on both `enroll` and `generate`/`verify`.
 *
 * Out of scope: QR-code rendering (handled on the app side), NTP
 * synchronisation, recursive multi-hash TOTP.
 *
 * @example
 * const totp = runtime.resolve('totp');
 * const { secret, uri } = totp.enroll({ issuer: 'MyApp', account: 'user@example.com' });
 * const code = totp.generate(secret);
 * const result = totp.verify(code, secret); // { valid: true, delta: 0 }
 */
import { hmac } from '../hash/hmac.js';
import { random } from './random.js';
import { base32 } from '../../io/codec/base32.js';
import { bitArray } from './bitArray.js';
import { sha256 } from '../hash/sha256.js';
import { sha512 } from '../hash/sha512.js';

/**
 * TOTP/HOTP helper surface returned by `factory()`.
 * @typedef {object} TotpAPI
 * @property {(secret: Uint8Array|string, opts?: { algorithm?: 'SHA-1'|'SHA-256'|'SHA-512', digits?: 6|7|8, period?: number, t?: number }) => string} generate - Generate a zero-padded TOTP code for the given secret and time.
 * @property {(code: string, secret: Uint8Array|string, opts?: { algorithm?: 'SHA-1'|'SHA-256'|'SHA-512', digits?: 6|7|8, period?: number, t?: number, window?: number }) => { valid: boolean, delta?: number }} verify - Verify a TOTP code against a constant-time tolerance window.
 * @property {(opts: { issuer: string, account: string, algorithm?: 'SHA-1'|'SHA-256'|'SHA-512', digits?: 6|7|8, period?: number, secretLen?: number }) => { secret: string, secretBytes: Uint8Array, uri: string }} enroll - Generate a random secret and an otpauth:// URI for enrollment.
 * @property {(opts: { issuer: string, account: string, secret: string, algorithm?: 'SHA-1'|'SHA-256'|'SHA-512', digits?: 6|7|8, period?: number }) => string} uri - Build an otpauth://totp/ URI matching the Google Authenticator spec.
 */

export const totp = {
    name: 'totp',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['hmac', 'random', 'base32', 'bitArray', 'sha256', 'sha512'],
    deps: [hmac, random, base32, bitArray, sha256, sha512],

    /**
     * @param {Object} hmac     HMAC module (RFC 2104) - used for SHA-256 and SHA-512.
     * @param {Object} random   CSPRNG module.
     * @param {Object} base32   Base32 module (RFC 4648).
     * @param {Object} bitArray bitArray module (Uint8Array ↔ bitArray conversion).
     * @param {Object} sha256   SHA-256 module (used via hmac for 'SHA-256').
     * @param {Object} sha512   SHA-512 module (used via hmac for 'SHA-512').
     * @returns {TotpAPI}
     */
    factory(hmac, random, base32, bitArray, sha256, sha512) {

        // ── Inline SHA-1 (RFC 3174 / FIPS 180-4) ────────────────────────────────
        // Kept inline because sha1 does not exist as a separate fw module.
        // SHA-256 and SHA-512 use the fw hmac module via a bitArray bridge.

        function _sha1(data) {
            const len = data.length;
            const bitLen = len * 8;
            const padLen = ((55 - len) % 64 + 64) % 64 + 1;
            const total = len + padLen + 8;
            const msg = new Uint8Array(total);
            msg.set(data);
            msg[len] = 0x80;
            msg[total - 4] = (bitLen >>> 24) & 0xff;
            msg[total - 3] = (bitLen >>> 16) & 0xff;
            msg[total - 2] = (bitLen >>>  8) & 0xff;
            msg[total - 1] =  bitLen         & 0xff;

            let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe,
                h3 = 0x10325476, h4 = 0xc3d2e1f0;

            const w = new Int32Array(80);

            for (let i = 0; i < total; i += 64) {
                for (let j = 0; j < 16; j++) {
                    const off = i + j * 4;
                    w[j] = ((msg[off] << 24) | (msg[off + 1] << 16) |
                            (msg[off + 2] << 8) | msg[off + 3]) | 0;
                }
                for (let j = 16; j < 80; j++) {
                    const x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
                    w[j] = (x << 1) | (x >>> 31);
                }
                let a = h0, b = h1, c = h2, d = h3, e = h4;
                for (let j = 0; j < 80; j++) {
                    let f, k;
                    if (j < 20) {
                        f = (b & c) | (~b & d);
                        k = 0x5a827999;
                    } else if (j < 40) {
                        f = b ^ c ^ d;
                        k = 0x6ed9eba1;
                    } else if (j < 60) {
                        f = (b & c) | (b & d) | (c & d);
                        k = 0x8f1bbcdc;
                    } else {
                        f = b ^ c ^ d;
                        k = 0xca62c1d6;
                    }
                    const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
                    e = d; d = c;
                    c = (b << 30) | (b >>> 2);
                    b = a; a = temp;
                }
                h0 = (h0 + a) | 0;
                h1 = (h1 + b) | 0;
                h2 = (h2 + c) | 0;
                h3 = (h3 + d) | 0;
                h4 = (h4 + e) | 0;
            }

            const digest = new Uint8Array(20);
            const dv = new DataView(digest.buffer);
            dv.setInt32(0,  h0, false);
            dv.setInt32(4,  h1, false);
            dv.setInt32(8,  h2, false);
            dv.setInt32(12, h3, false);
            dv.setInt32(16, h4, false);
            return digest;
        }

        // ── HMAC via the fw module (SHA-256 and SHA-512) ─────────────────────────
        // The fw hmac module operates on bitArray (SJCL format).
        // Bridge: Uint8Array → bitArray (via bitArray.ui8_to_ba) and
        //         bitArray  → Uint8Array (via bitArray.ba_to_ui8).

        /**
         * Compute HMAC using the fw hmac module.
         * @param {object} HashModule - sha256 or sha512 (resolved fw module).
         * @param {Uint8Array} keyBytes
         * @param {Uint8Array} dataBytes
         * @returns {Uint8Array}
         */
        function _hmacFw(HashModule, keyBytes, dataBytes) {
            const keyBa  = bitArray.ui8_to_ba(keyBytes);
            const dataBa = bitArray.ui8_to_ba(dataBytes);
            const macBa  = new hmac.fn(keyBa, HashModule).encrypt(dataBa);
            return bitArray.ba_to_ui8(macBa);
        }

        /**
         * Inline HMAC-SHA-1 (RFC 2104 + RFC 3174).
         * Kept inline because sha1 does not exist as a separate fw module.
         * @param {Uint8Array} keyBytes
         * @param {Uint8Array} dataBytes
         * @returns {Uint8Array}
         */
        function _hmacSha1(keyBytes, dataBytes) {
            const blockSize = 64;
            const k = keyBytes.length > blockSize ? _sha1(keyBytes) : keyBytes;
            const keyPad = new Uint8Array(blockSize);
            keyPad.set(k);

            const ipad = new Uint8Array(blockSize);
            const opad = new Uint8Array(blockSize);
            for (let i = 0; i < blockSize; i++) {
                ipad[i] = keyPad[i] ^ 0x36;
                opad[i] = keyPad[i] ^ 0x5c;
            }

            const inner = new Uint8Array(blockSize + dataBytes.length);
            inner.set(ipad);
            inner.set(dataBytes, blockSize);
            const innerHash = _sha1(inner);

            const outer = new Uint8Array(blockSize + innerHash.length);
            outer.set(opad);
            outer.set(innerHash, blockSize);
            return _sha1(outer);
        }

        /**
         * Dispatch HMAC according to the algorithm.
         * @param {string} algorithm - 'SHA-1'|'SHA-256'|'SHA-512'
         * @param {Uint8Array} keyBytes
         * @param {Uint8Array} dataBytes
         * @returns {Uint8Array}
         */
        function _hmacCompute(algorithm, keyBytes, dataBytes) {
            if (algorithm === 'SHA-1')   return _hmacSha1(keyBytes, dataBytes);
            if (algorithm === 'SHA-256') return _hmacFw(sha256, keyBytes, dataBytes);
            if (algorithm === 'SHA-512') return _hmacFw(sha512, keyBytes, dataBytes);
            throw new Error('totp: unsupported algorithm: ' + algorithm);
        }

        // ── Internal helpers ─────────────────────────────────────────────────────

        /**
         * Encode counter T as 8 big-endian bytes (RFC 6238).
         * @param {number} t
         * @returns {Uint8Array}
         */
        function _counterToBytes(t) {
            const buf = new Uint8Array(8);
            const hi = Math.floor(t / 0x100000000);
            const lo = t >>> 0;
            buf[0] = (hi >>> 24) & 0xff;
            buf[1] = (hi >>> 16) & 0xff;
            buf[2] = (hi >>>  8) & 0xff;
            buf[3] =  hi         & 0xff;
            buf[4] = (lo >>> 24) & 0xff;
            buf[5] = (lo >>> 16) & 0xff;
            buf[6] = (lo >>>  8) & 0xff;
            buf[7] =  lo         & 0xff;
            return buf;
        }

        /**
         * Decode a secret given as Uint8Array or base32 string.
         * @param {Uint8Array|string} secret
         * @returns {Uint8Array}
         */
        function _decodeSecret(secret) {
            if (secret instanceof Uint8Array) return secret;
            if (typeof secret === 'string') return base32.toBytes(secret);
            throw new TypeError('totp: secret must be Uint8Array or base32 string');
        }

        // ── HOTP (RFC 4226 §5) ───────────────────────────────────────────────────

        /**
         * Compute HOTP(secret, counter).
         * @param {Uint8Array} secretBytes
         * @param {number} counter
         * @param {string} algorithm
         * @param {number} digits
         * @returns {string}
         */
        function _hotp(secretBytes, counter, algorithm, digits) {
            const msgBytes = _counterToBytes(counter);
            const macBytes = _hmacCompute(algorithm, secretBytes, msgBytes);

            // Dynamic truncation (RFC 4226 §5.3)
            const offset = macBytes[macBytes.length - 1] & 0x0f;
            const binCode = (
                ((macBytes[offset]     & 0x7f) * 0x1000000) +
                ((macBytes[offset + 1] & 0xff) * 0x10000)   +
                ((macBytes[offset + 2] & 0xff) * 0x100)     +
                 (macBytes[offset + 3] & 0xff)
            );

            const otp = binCode % Math.pow(10, digits);
            return String(otp).padStart(digits, '0');
        }

        // ── Constant-time comparison ─────────────────────────────────────────────

        /**
         * Constant-time string comparison (no short-circuit).
         * @param {string} a
         * @param {string} b
         * @returns {boolean}
         */
        function _ctEqual(a, b) {
            if (a.length !== b.length) return false;
            let diff = 0;
            for (let i = 0; i < a.length; i++) {
                diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
            }
            return diff === 0;
        }

        // ── Public API ───────────────────────────────────────────────────────────

        /**
         * Generate a TOTP code for the given secret and time.
         *
         * @param {Uint8Array|string} secret - Secret key (Uint8Array or base32).
         * @param {object} [opts]
         * @param {'SHA-1'|'SHA-256'|'SHA-512'} [opts.algorithm='SHA-1'] - HMAC algorithm.
         * @param {6|7|8} [opts.digits=6] - Number of digits.
         * @param {number} [opts.period=30] - Period in seconds.
         * @param {number} [opts.t] - Epoch in seconds (default: now).
         * @returns {string} Zero-padded OTP code.
         */
        function generate(secret, opts) {
            const o = opts || {};
            const algorithm = o.algorithm || 'SHA-1';
            const digits    = o.digits    || 6;
            const period    = o.period    || 30;
            const now       = (o.t !== undefined) ? o.t : Math.floor(Date.now() / 1000);

            const secretBytes = _decodeSecret(secret);
            const T = Math.floor(now / period);
            return _hotp(secretBytes, T, algorithm, digits);
        }

        /**
         * Verify a TOTP code against a tolerance window.
         *
         * The comparison is constant-time: every step in the window is
         * always evaluated, with no short-circuit on the first match.
         * Both `_ctEqual` and the window walk avoid early-return paths
         * that would leak the matching delta via timing.
         *
         * @param {string} code - OTP code to verify.
         * @param {Uint8Array|string} secret - Secret key.
         * @param {object} [opts]
         * @param {'SHA-1'|'SHA-256'|'SHA-512'} [opts.algorithm='SHA-1']
         * @param {6|7|8} [opts.digits=6]
         * @param {number} [opts.period=30]
         * @param {number} [opts.t] - Epoch in seconds (default: now).
         * @param {number} [opts.window=1] - Tolerance window (steps before/after).
         * @returns {{ valid: boolean, delta?: number }}
         */
        function verify(code, secret, opts) {
            const o = opts || {};
            const algorithm = o.algorithm || 'SHA-1';
            const digits    = o.digits    || 6;
            const period    = o.period    || 30;
            const now       = (o.t !== undefined) ? o.t : Math.floor(Date.now() / 1000);
            const window    = (o.window  !== undefined) ? o.window : 1;

            const secretBytes = _decodeSecret(secret);
            const T = Math.floor(now / period);

            let matchDelta = null;

            // Full window walk with no short-circuit: every candidate is
            // computed and compared even after a match is found, so the
            // total work (and timing) is constant across success/failure.
            for (let delta = -window; delta <= window; delta++) {
                const candidate = _hotp(secretBytes, T + delta, algorithm, digits);
                if (_ctEqual(candidate, code)) {
                    if (matchDelta === null) matchDelta = delta;
                }
            }

            if (matchDelta !== null) {
                return { valid: true, delta: matchDelta };
            }
            return { valid: false };
        }

        /**
         * Generate a random secret and an otpauth:// URI for enrollment.
         *
         * @param {{issuer: string, account: string, algorithm?: 'SHA-1'|'SHA-256'|'SHA-512', digits?: 6|7|8, period?: number, secretLen?: number}} opts
         * @returns {{ secret: string, secretBytes: Uint8Array, uri: string }}
         */
        function enroll(opts) {
            const algorithm = (opts && opts.algorithm) || 'SHA-1';
            const digits    = (opts && opts.digits)    || 6;
            const period    = (opts && opts.period)    || 30;
            const secretLen = (opts && opts.secretLen) || 20;

            const secretBytes = random.bytes(secretLen);
            if (secretBytes === false) {
                throw new Error('totp.enroll: failed to generate secret (random.bytes returned false)');
            }

            // Base32 without padding (authenticator compatibility).
            const secretB32 = base32.fromBytes(secretBytes).replace(/=+$/, '');

            const otpUri = uri({
                issuer: opts.issuer,
                account: opts.account,
                secret: secretB32,
                algorithm,
                digits,
                period
            });

            return { secret: secretB32, secretBytes, uri: otpUri };
        }

        /**
         * Build an otpauth://totp/ URI matching the Google Authenticator spec.
         *
         * Format: `otpauth://totp/<issuer>:<account>?secret=...&issuer=...&algorithm=...&digits=...&period=...`
         *
         * @param {{issuer: string, account: string, secret: string, algorithm?: 'SHA-1'|'SHA-256'|'SHA-512', digits?: 6|7|8, period?: number}} opts
         * @returns {string}
         */
        function uri(opts) {
            const issuer    = (opts && opts.issuer)    || '';
            const account   = (opts && opts.account)   || '';
            const secret    = (opts && opts.secret)    || '';
            const algorithm = (opts && opts.algorithm) || 'SHA-1';
            const digits    = (opts && opts.digits)    || 6;
            const period    = (opts && opts.period)    || 30;

            const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(account);
            const params = [
                'secret='    + encodeURIComponent(secret),
                'issuer='    + encodeURIComponent(issuer),
                'algorithm=' + encodeURIComponent(algorithm),
                'digits='    + digits,
                'period='    + period
            ].join('&');

            return 'otpauth://totp/' + label + '?' + params;
        }

        return { generate, verify, enroll, uri };
    }
};
