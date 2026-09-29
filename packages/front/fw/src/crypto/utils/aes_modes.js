// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview High-level AES wrapper exposing all standard modes through a
 * uniform Uint8Array-friendly API.
 *
 * Generalises the earlier `aes_ctr` helper to cover:
 *   - CBC (NIST SP 800-38A) with PKCS#7 padding handled internally
 *   - CTR (NIST SP 800-38A) - stream, no padding
 *   - GCM (NIST SP 800-38D) - AEAD with AAD support
 *   - KW / KWP (NIST SP 800-38F) - key wrap
 *
 * All inputs and outputs are `Uint8Array`. Errors are reported via
 * `console.warn` / `console.error` and surfaced as `false` returns.
 *
 */

/**
 * Common `(key, iv, data) => bytes` encrypt/decrypt pair over `Uint8Array`.
 * @typedef {object} AesModeOps
 * @property {(key: Uint8Array, iv: Uint8Array, data: Uint8Array) => (Uint8Array|false)} encrypt
 * @property {(key: Uint8Array, iv: Uint8Array, data: Uint8Array) => (Uint8Array|false)} decrypt
 */

/**
 * Public shape returned by `aes_modes.factory()`.
 * @typedef {object} AesModesAPI
 * @property {AesModeOps & { raw: AesModeOps }} cbc CBC with PKCS#7 padding, plus a `raw` no-padding variant.
 * @property {AesModeOps} ctr CTR stream mode (no padding).
 * @property {{
 *   encrypt: (key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array, tlen?: number) => ({ct:Uint8Array, tag:Uint8Array}|false),
 *   decrypt: (key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array, aad?: Uint8Array, tlen?: number) => (Uint8Array|false),
 *   seal: (key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array) => (Uint8Array|false),
 *   open: (key: Uint8Array, sealed: Uint8Array, aad?: Uint8Array) => (Uint8Array|false)
 * }} gcm GCM AEAD mode.
 * @property {{
 *   wrap: (kek: Uint8Array, key: Uint8Array) => (Uint8Array|false),
 *   unwrap: (kek: Uint8Array, wrapped: Uint8Array) => (Uint8Array|false),
 *   wrapPad: (kek: Uint8Array, key: Uint8Array) => (Uint8Array|false),
 *   unwrapPad: (kek: Uint8Array, wrapped: Uint8Array) => (Uint8Array|false)
 * }} kw AES-KW / AES-KWP key wrapping.
 */

import { bitArray } from './bitArray.js';
import { aes } from '../cipher/aes.js';
import { cbc } from '../mode/cbc.js';
import { ctr } from '../mode/ctr.js';
import { gcm } from '../mode/gcm.js';
import { kw } from '../mode/kw.js';
import { pad } from './pad.js';

export const aes_modes = {
    name: 'aes_modes',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['bitArray', 'aes', 'cbc', 'ctr', 'gcm', 'kw', 'pad'],
    deps: [bitArray, aes, cbc, ctr, gcm, kw, pad],

    /** @returns {AesModesAPI} */
    factory(bitArray, aes, cbc, ctr, gcm, kw, pad) {

        function _toBa(u8) {
            return bitArray.ui8_to_ba(u8 instanceof Uint8Array ? u8 : new Uint8Array(u8));
        }
        function _toU8(ba) {
            return bitArray.ba_to_ui8(ba);
        }

        function _cipher(key, full) {
            return aes.fn(_toBa(key), full);
        }

        // ── CBC ─────────────────────────────────────────────────────────

        const cbcApi = {
            /**
             * Encrypt with PKCS#7 padding.
             * @param {Uint8Array} key
             * @param {Uint8Array} iv
             * @param {Uint8Array} plaintext
             * @returns {Uint8Array|false}
             */
            encrypt(key, iv, plaintext) {
                const c = _cipher(key, false);
                if (c === false) return false;
                const padded = pad.pad(plaintext);
                if (padded === false) return false;
                const out = cbc.encrypt(c, _toBa(padded), _toBa(iv));
                return out === false ? false : _toU8(out);
            },
            /**
             * Decrypt and strip PKCS#7 padding.
             * @param {Uint8Array} key
             * @param {Uint8Array} iv
             * @param {Uint8Array} ciphertext
             * @returns {Uint8Array|false}
             */
            decrypt(key, iv, ciphertext) {
                const c = _cipher(key, true);
                if (c === false) return false;
                const out = cbc.decrypt(c, _toBa(ciphertext), _toBa(iv));
                if (out === false) return false;
                return pad.strip(_toU8(out));
            },
            /** Raw CBC without padding (input length must be a multiple of 16). */
            raw: {
                /**
                 * Raw CBC encrypt with no padding.
                 * @param {Uint8Array} key
                 * @param {Uint8Array} iv
                 * @param {Uint8Array} plaintext
                 * @returns {Uint8Array|false}
                 */
                encrypt(key, iv, plaintext) {
                    const c = _cipher(key, false);
                    if (c === false) return false;
                    const out = cbc.encrypt(c, _toBa(plaintext), _toBa(iv));
                    return out === false ? false : _toU8(out);
                },
                /**
                 * Raw CBC decrypt with no padding strip.
                 * @param {Uint8Array} key
                 * @param {Uint8Array} iv
                 * @param {Uint8Array} ciphertext
                 * @returns {Uint8Array|false}
                 */
                decrypt(key, iv, ciphertext) {
                    const c = _cipher(key, true);
                    if (c === false) return false;
                    const out = cbc.decrypt(c, _toBa(ciphertext), _toBa(iv));
                    return out === false ? false : _toU8(out);
                }
            }
        };

        // ── CTR ─────────────────────────────────────────────────────────

        const ctrApi = {
            encrypt(key, iv, data) {
                const c = _cipher(key, false);
                if (c === false) return false;
                const out = ctr.encrypt(c, _toBa(data), _toBa(iv));
                return out === false ? false : _toU8(out);
            },
            decrypt(key, iv, data) {
                return ctrApi.encrypt(key, iv, data); // CTR is symmetric
            }
        };

        // ── GCM (AEAD) ──────────────────────────────────────────────────

        const gcmApi = {
            /**
             * @returns {{ct:Uint8Array, tag:Uint8Array}|false}
             */
            encrypt(key, iv, plaintext, aad, tlen) {
                const c = _cipher(key, false);
                if (c === false) return false;
                const r = gcm.encrypt(c, _toBa(plaintext), _toBa(iv), _toBa(aad || new Uint8Array(0)), tlen);
                if (r === false) return false;
                return { ct: _toU8(r.ct), tag: _toU8(r.tag) };
            },
            decrypt(key, iv, ciphertext, tag, aad, tlen) {
                const c = _cipher(key, false);
                if (c === false) return false;
                const r = gcm.decrypt(c, _toBa(ciphertext), _toBa(iv), _toBa(aad || new Uint8Array(0)), _toBa(tag), tlen);
                return r === false ? false : _toU8(r);
            },
            /**
             * Convenience: produce a single buffer `iv (12B) || ct || tag (16B)`
             * that is self-describing and easy to store/transmit.
             */
            seal(key, iv, plaintext, aad) {
                if (!(iv instanceof Uint8Array) || iv.length !== 12) {
                    console.warn('[crypto] INVALID: aes_modes.gcm.seal: iv must be 12 bytes for the canonical layout');
                    return false;
                }
                const r = gcmApi.encrypt(key, iv, plaintext, aad);
                if (r === false) return false;
                const out = new Uint8Array(12 + r.ct.length + 16);
                out.set(iv, 0);
                out.set(r.ct, 12);
                out.set(r.tag, 12 + r.ct.length);
                return out;
            },
            open(key, sealed, aad) {
                if (!(sealed instanceof Uint8Array) || sealed.length < 28) {
                    console.warn('[crypto] INVALID: aes_modes.gcm.open: sealed buffer too short');
                    return false;
                }
                const iv = sealed.subarray(0, 12);
                const tag = sealed.subarray(sealed.length - 16);
                const ct = sealed.subarray(12, sealed.length - 16);
                return gcmApi.decrypt(key, iv, ct, tag, aad);
            }
        };

        // ── KW / KWP ────────────────────────────────────────────────────

        const kwApi = {
            /**
             * AES-KW wrap a key (RFC 3394 / NIST SP 800-38F §6.2).
             * @param {Uint8Array} kek Key-encryption key (16/24/32 bytes).
             * @param {Uint8Array} key Key material (multiple of 8 bytes, ≥ 16).
             * @returns {Uint8Array|false}
             */
            wrap(kek, key)         { const c = _cipher(kek, true); return c === false ? false : kw.wrap(c, key); },
            /**
             * AES-KW unwrap a wrapped key.
             * @param {Uint8Array} kek
             * @param {Uint8Array} wrapped
             * @returns {Uint8Array|false}
             */
            unwrap(kek, wrapped)   { const c = _cipher(kek, true); return c === false ? false : kw.unwrap(c, wrapped); },
            /**
             * AES-KWP wrap a key with padding (RFC 5649 / SP 800-38F §6.3).
             * Accepts any byte length ≥ 1.
             * @param {Uint8Array} kek
             * @param {Uint8Array} key
             * @returns {Uint8Array|false}
             */
            wrapPad(kek, key)      { const c = _cipher(kek, true); return c === false ? false : kw.wrapPad(c, key); },
            /**
             * AES-KWP unwrap a padded wrapped key.
             * @param {Uint8Array} kek
             * @param {Uint8Array} wrapped
             * @returns {Uint8Array|false}
             */
            unwrapPad(kek, wrapped){ const c = _cipher(kek, true); return c === false ? false : kw.unwrapPad(c, wrapped); }
        };

        return {
            cbc: cbcApi,
            ctr: ctrApi,
            gcm: gcmApi,
            kw: kwApi
        };
    }
};
