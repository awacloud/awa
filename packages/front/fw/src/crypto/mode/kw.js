// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AES Key Wrap (KW) and Key Wrap with Padding (KWP).
 *
 * Implements NIST SP 800-38F §6.2/§6.3:
 *   - KW  (RFC 3394): wraps an integer number of 64-bit semi-blocks, n ≥ 2.
 *   - KWP (RFC 5649): extends KW to arbitrary byte lengths by encoding the
 *                     plaintext length into the IV and zero-padding to the
 *                     next 64-bit boundary.
 *
 * Both modes authenticate the plaintext via a fixed IV check after unwrap
 * (A6A6A6A6A6A6A6A6 for KW, 0xA65959A6 || len32 for KWP). On mismatch the
 * plaintext is **not** released; unwrap returns `false` with a console
 * error. The PRF is a 16-byte block cipher exposing `encrypt` and
 * `decrypt` (i.e. an AES instance built with `full=true`).
 *
 */

import { bitArray } from '../utils/bitArray.js';

/**
 * Object returned by `kw.factory()`.
 * @typedef {object} KwAPI
 * @property {(prf: {encrypt: Function}, plaintext: (Uint8Array|number[])) => (Uint8Array|false)} wrap KW-wrap (RFC 3394).
 * @property {(prf: {encrypt: Function, decrypt: Function}, ciphertext: (Uint8Array|number[])) => (Uint8Array|false)} unwrap KW-unwrap (RFC 3394).
 * @property {(prf: {encrypt: Function}, plaintext: (Uint8Array|number[])) => (Uint8Array|false)} wrapPad KWP-wrap (RFC 5649).
 * @property {(prf: {encrypt: Function, decrypt: Function}, ciphertext: (Uint8Array|number[])) => (Uint8Array|false)} unwrapPad KWP-unwrap (RFC 5649).
 * @property {() => false} wrapInverseCipher Explicit reject for the unimplemented KW-AE inverse-cipher variant.
 * @property {() => false} unwrapInverseCipher Explicit reject for the unimplemented KW-AD inverse-cipher variant.
 */

export const kw = {
    name: 'kw',
    version: '1.0.0',
    type: 'fw.crypto.mode',
    dependencies: ['bitArray'],
    deps: [bitArray],

    /** @returns {KwAPI} */
    factory(bitArray) {

        const _IV_KW_HI = 0xA6A6A6A6 | 0;
        const _IV_KW_LO = 0xA6A6A6A6 | 0;
        const _IV_KWP   = 0xA65959A6 | 0;

        /** u32 big-endian read from a Uint8Array at offset. */
        function _rd32(u8, off) {
            return ((u8[off] << 24) | (u8[off+1] << 16) | (u8[off+2] << 8) | u8[off+3]) | 0;
        }
        function _wr32(u8, off, v) {
            u8[off]   = (v >>> 24) & 0xff;
            u8[off+1] = (v >>> 16) & 0xff;
            u8[off+2] = (v >>> 8)  & 0xff;
            u8[off+3] =  v         & 0xff;
        }

        /**
         * RFC 3394 wrap / unwrap core. Operates on a Uint8Array whose length
         * is a multiple of 8. `initHi`/`initLo` seed the A register at wrap,
         * and are the expected value after unwrap.
         */
        function _wrapCore(prf, plaintext8, initHi, initLo) {
            const n = plaintext8.length / 8; // number of 64-bit blocks
            const R = new Uint8Array(plaintext8.length);
            R.set(plaintext8);
            let aHi = initHi | 0, aLo = initLo | 0;

            for (let j = 0; j < 6; j++) {
                for (let i = 0; i < n; i++) {
                    const rOff = i * 8;
                    const bHi = _rd32(R, rOff);
                    const bLo = _rd32(R, rOff + 4);
                    const block = [aHi, aLo, bHi, bLo];
                    const e = prf.encrypt(block);

                    // t = (n*j) + i + 1
                    const t = n * j + i + 1;
                    const tHi = Math.floor(t / 0x100000000) | 0;
                    const tLo = t | 0;
                    aHi = (e[0] ^ tHi) | 0;
                    aLo = (e[1] ^ tLo) | 0;
                    _wr32(R, rOff,     e[2]);
                    _wr32(R, rOff + 4, e[3]);
                }
            }
            return { aHi, aLo, R };
        }

        function _unwrapCore(prf, ciphertext8) {
            const n = ciphertext8.length / 8 - 1;
            const R = new Uint8Array(n * 8);
            R.set(ciphertext8.subarray(8));
            let aHi = _rd32(ciphertext8, 0);
            let aLo = _rd32(ciphertext8, 4);

            for (let j = 5; j >= 0; j--) {
                for (let i = n - 1; i >= 0; i--) {
                    const t = n * j + i + 1;
                    const tHi = Math.floor(t / 0x100000000) | 0;
                    const tLo = t | 0;
                    const rOff = i * 8;
                    const bHi = _rd32(R, rOff);
                    const bLo = _rd32(R, rOff + 4);
                    const block = [(aHi ^ tHi) | 0, (aLo ^ tLo) | 0, bHi, bLo];
                    const d = prf.decrypt(block);
                    aHi = d[0] | 0;
                    aLo = d[1] | 0;
                    _wr32(R, rOff,     d[2]);
                    _wr32(R, rOff + 4, d[3]);
                }
            }
            return { aHi, aLo, R };
        }

        // Iteration D2 of the FIPS 140-3 upgrade plan - TDES rejection.
        // SP 800-131A §2.4 marks Triple-DES as deprecated since 2024 and
        // disallowed for cryptographic protection beyond 2023. SP 800-38F
        // §6.2 explicitly requires a 128-bit block cipher (AES-128/192/256).
        // We reject any PRF that advertises a non-128-bit block size.
        function _checkBlockSize(prf) {
            if (prf.blockSize !== undefined && prf.blockSize !== 16) {
                console.warn('[crypto] DEPRECATED: kw: non-AES block cipher (e.g. TDES, blockSize=' + prf.blockSize + 'B) is deprecated by SP 800-131A §2.4. SP 800-38F §6.2 requires AES (16-byte blocks).');
                return false;
            }
            return true;
        }

        function _checkPrf(prf) {
            if (typeof prf.encrypt !== 'function' || typeof prf.decrypt !== 'function') {
                console.warn('[crypto] INVALID: kw: prf must expose encrypt and decrypt (build cipher with full=true)');
                return false;
            }
            return _checkBlockSize(prf);
        }

        function _checkPrfEncryptOnly(prf) {
            if (typeof prf.encrypt !== 'function') {
                console.warn('[crypto] INVALID: kw: prf must expose encrypt');
                return false;
            }
            return _checkBlockSize(prf);
        }

        /**
         * KW-wrap (RFC 3394). Input length must be a positive multiple of 8
         * bytes (n ≥ 2 semi-blocks per RFC 3394; n = 1 is the degenerate
         * single-block case and is rejected here for strictness).
         * @param {{encrypt:Function}} prf AES cipher.
         * @param {Uint8Array|Array} plaintext Raw key to wrap.
         * @returns {Uint8Array|false}
         */
        function wrap(prf, plaintext) {
            if (!_checkPrfEncryptOnly(prf)) return false;
            const p8 = plaintext instanceof Uint8Array
                ? plaintext
                : bitArray.ba_to_ui8(plaintext);
            if (p8.length === 0 || (p8.length % 8) !== 0) {
                console.warn('[crypto] INVALID: kw: plaintext length must be a positive multiple of 8 bytes');
                return false;
            }
            if (p8.length < 16) {
                console.warn('[crypto] INVALID: kw: RFC 3394 requires at least 2 semi-blocks (16 bytes) - use KWP for shorter keys');
                return false;
            }
            const { aHi, aLo, R } = _wrapCore(prf, p8, _IV_KW_HI, _IV_KW_LO);
            const out = new Uint8Array(p8.length + 8);
            _wr32(out, 0, aHi);
            _wr32(out, 4, aLo);
            out.set(R, 8);
            return out;
        }

        /**
         * KW-unwrap (RFC 3394).
         * @returns {Uint8Array|false}
         */
        function unwrap(prf, ciphertext) {
            if (!_checkPrf(prf)) return false;
            const c8 = ciphertext instanceof Uint8Array
                ? ciphertext
                : bitArray.ba_to_ui8(ciphertext);
            if (c8.length < 24 || (c8.length % 8) !== 0) {
                console.warn('[crypto] INVALID: kw: ciphertext must be ≥ 24 bytes and a multiple of 8');
                return false;
            }
            const { aHi, aLo, R } = _unwrapCore(prf, c8);
            // Constant-time IV check : accumulate both halves into one
            // value, branch only on the OR of the two XORs. Avoids leaking
            // *which* half mismatched (and short-circuits would let `||`
            // skip the second XOR depending on the first).
            const diff = ((aHi ^ _IV_KW_HI) | (aLo ^ _IV_KW_LO)) >>> 0;
            if (diff !== 0) {
                console.error('[crypto] CORRUPT: kw: integrity check failed');
                return false;
            }
            return R;
        }

        /**
         * KWP-wrap (RFC 5649). Accepts any plaintext length ≥ 1 byte.
         * @returns {Uint8Array|false}
         */
        function wrapPad(prf, plaintext) {
            if (!_checkPrfEncryptOnly(prf)) return false;
            const p8 = plaintext instanceof Uint8Array
                ? plaintext
                : bitArray.ba_to_ui8(plaintext);
            if (p8.length === 0) {
                console.warn('[crypto] INVALID: kwp: plaintext must not be empty');
                return false;
            }
            if (p8.length > 0xFFFFFFFF) {
                console.warn('[crypto] INVALID: kwp: plaintext length exceeds 2^32 - 1');
                return false;
            }
            const padLen = (8 - (p8.length % 8)) % 8;
            const padded = new Uint8Array(p8.length + padLen);
            padded.set(p8, 0);

            // Single-semiblock fast path (RFC 5649 §4.1): one AES encryption.
            if (padded.length === 8) {
                const block = [_IV_KWP, p8.length | 0, _rd32(padded, 0), _rd32(padded, 4)];
                const e = prf.encrypt(block);
                const out = new Uint8Array(16);
                _wr32(out, 0, e[0]);
                _wr32(out, 4, e[1]);
                _wr32(out, 8, e[2]);
                _wr32(out, 12, e[3]);
                return out;
            }

            const { aHi, aLo, R } = _wrapCore(prf, padded, _IV_KWP, p8.length | 0);
            const out = new Uint8Array(padded.length + 8);
            _wr32(out, 0, aHi);
            _wr32(out, 4, aLo);
            out.set(R, 8);
            return out;
        }

        /**
         * KWP-unwrap (RFC 5649).
         * @returns {Uint8Array|false}
         */
        function unwrapPad(prf, ciphertext) {
            if (!_checkPrf(prf)) return false;
            const c8 = ciphertext instanceof Uint8Array
                ? ciphertext
                : bitArray.ba_to_ui8(ciphertext);
            if (c8.length < 16 || (c8.length % 8) !== 0) {
                console.warn('[crypto] INVALID: kwp: ciphertext must be ≥ 16 bytes and a multiple of 8');
                return false;
            }

            let aHi, aLo, padded;
            if (c8.length === 16) {
                // Single-semiblock fast path: one AES decryption.
                const d = prf.decrypt([_rd32(c8, 0), _rd32(c8, 4), _rd32(c8, 8), _rd32(c8, 12)]);
                aHi = d[0]; aLo = d[1];
                padded = new Uint8Array(8);
                _wr32(padded, 0, d[2]);
                _wr32(padded, 4, d[3]);
            } else {
                const r = _unwrapCore(prf, c8);
                aHi = r.aHi; aLo = r.aLo; padded = r.R;
            }

            // Constant-time validation: accumulate every check into `bad`
            // and only branch at the very end. Refuses to leak which check
            // failed (IV vs length vs padding).
            let bad = (aHi ^ _IV_KWP) >>> 0;
            const mli = aLo >>> 0;
            const maxLen = padded.length;
            const minLen = maxLen - 7;
            // Length-out-of-range bit (1 if mli < minLen or mli > maxLen).
            const lenLow  = ((mli - minLen) >>> 31) & 1;        // 1 if mli < minLen
            const lenHigh = ((maxLen - mli) >>> 31) & 1;        // 1 if mli > maxLen
            bad |= (lenLow | lenHigh);
            // Clamp the scan range to a constant: walk the full last block
            // (8 bytes) and only count bytes whose index is ≥ mli.
            const scanStart = maxLen - 8 < 0 ? 0 : maxLen - 8;
            for (let i = scanStart; i < maxLen; i++) {
                // inPad = 1 if i >= mli (i.e. this byte is part of padding).
                const inPad = ((mli - i - 1) >>> 31) & 1;
                bad |= padded[i] & (-inPad);
            }
            if (bad !== 0) {
                console.error('[crypto] CORRUPT: kwp: integrity check failed');
                return false;
            }
            return padded.subarray(0, mli);
        }

        // SP 800-38F §6.3 defines a "KW-AE inverse cipher" variant that
        // applies CIPH_K⁻¹ (decrypt) in the wrap direction. ACVP includes
        // about 50 % of its KW vectors with this variant for completeness,
        // but it is rare in practice (legacy embedded TPM only). Iteration
        // D2 of the FIPS 140-3 upgrade plan - explicit reject with a typed
        // export to prevent any silent use. If a consumer has a
        // documented need, the implementation must be added separately
        // and audited.
        function wrapInverseCipher() {
            console.warn('[crypto] NOT-IMPLEMENTED: kw: KW-AE inverse-cipher variant (SP 800-38F §6.3) is not exposed. Use wrap() (forward W transform per RFC 3394) instead.');
            return false;
        }

        function unwrapInverseCipher() {
            console.warn('[crypto] NOT-IMPLEMENTED: kw: KW-AD inverse-cipher variant (SP 800-38F §6.3) is not exposed. Use unwrap() (forward W⁻¹ transform per RFC 3394) instead.');
            return false;
        }

        return /** @type {KwAPI} */ (/** @type {any} */ ({
            wrap,
            unwrap,
            wrapPad,
            unwrapPad,
            wrapInverseCipher,
            unwrapInverseCipher
        }));
    }
};
