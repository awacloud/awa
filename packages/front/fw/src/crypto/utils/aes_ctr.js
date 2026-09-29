// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AES-CTR convenience wrapper that combines `aes`, `ctr` and
 * PKCS#7 padding for byte-array (Uint8Array) input/output.
 *
 * @deprecated Iteration I1 of the FIPS 140-3 upgrade plan: this module is
 * kept for back-compat only; new code MUST use `utils/aes_modes.js`
 * (`aes_modes.ctr.{encrypt,decrypt}`) which provides a uniform Uint8Array
 * API across every mode (CBC/CTR/GCM/KW/KWP). See `aes_ctr.acvp.md` for
 * details. Planned removal once consumers have migrated.
 *
 * Note: AES-CTR is malleable; this wrapper provides confidentiality only.
 * If you need authenticated encryption, layer an HMAC over the ciphertext
 * (encrypt-then-MAC) or switch to an AEAD construction (`aes_modes.gcm`).
 *
 */

/**
 * Public shape of an AES-CTR instance returned by `ui8()`.
 * @typedef {object} AesCtrInstance
 * @property {(iv: Uint8Array) => void} update Replace the IV (Uint8Array form).
 * @property {(arr: Uint8Array) => (Uint8Array|false)} pad PKCS#7-pad then CTR-encrypt.
 * @property {(arr: Uint8Array) => (Uint8Array|false)} strip CTR-decrypt then strip PKCS#7 padding.
 * @property {(arr: Uint8Array) => (Uint8Array|false)} raw Raw CTR encrypt/decrypt (no padding).
 * @property {(ba_iv: number[]) => void} ba_update Replace the IV (bitArray form).
 * @property {(b_arr: number[]) => (number[]|false)} ba_raw Raw CTR over bitArray input/output.
 */

/**
 * Public surface of `aes_ctr.factory(...)`.
 * @typedef {object} AesCtrApi
 * @property {(key: Uint8Array, iv: Uint8Array) => AesCtrInstance} ui8 Build an instance from Uint8Array key/IV.
 */

import { bitArray } from './bitArray.js';
import { aes } from '../cipher/aes.js';
import { ctr } from '../mode/ctr.js';
import { pad } from './pad.js';

export const aes_ctr = {
    name: 'aes_ctr',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: ['bitArray', 'aes', 'ctr', 'pad'],
    deps: [bitArray, aes, ctr, pad],

    /** @returns {AesCtrApi} */
    factory(bitArray, aes, ctr, pad) {

        const _Encrypt = function (k, iv) {
            this.k = bitArray.ui8_to_ba(k);
            this.iv = bitArray.ui8_to_ba(iv);
            this.cipher = aes.fn(this.k, false);
            if (this.cipher === false) {
                console.warn('[crypto] INVALID: aes_ctr: invalid key - cipher init failed');
                this._dead = true;
            }
        };

        /**
         * Replace the counter / IV used by this instance (Uint8Array form).
         * @param {Uint8Array} iv
         */
        _Encrypt.prototype.update = function (iv) {
            this.iv = bitArray.ui8_to_ba(iv);
        };

        /**
         * Encrypt arbitrary-length plaintext with PKCS#7 padding applied
         * before CTR-mode encryption.
         * @param {Uint8Array} arr
         * @returns {Uint8Array|false}
         */
        _Encrypt.prototype.pad = function (arr) {
            if (this._dead) return false;
            const padded = pad.pad(arr);
            if (padded === false) return false;
            return bitArray.ba_to_ui8(
                ctr.encrypt(this.cipher, bitArray.ui8_to_ba(padded), this.iv, '')
            );
        };

        /**
         * Decrypt CTR-ciphertext and strip PKCS#7 padding.
         * @param {Uint8Array} arr
         * @returns {Uint8Array|false}
         */
        _Encrypt.prototype.strip = function (arr) {
            if (this._dead) return false;
            return pad.strip(bitArray.ba_to_ui8(
                ctr.encrypt(this.cipher, bitArray.ui8_to_ba(arr), this.iv, '')
            ));
        };

        /**
         * Raw CTR encrypt/decrypt with no padding (CTR is its own inverse).
         * @param {Uint8Array} arr
         * @returns {Uint8Array|false}
         */
        _Encrypt.prototype.raw = function (arr) {
            if (this._dead) return false;
            return bitArray.ba_to_ui8(
                ctr.encrypt(this.cipher, bitArray.ui8_to_ba(arr), this.iv, '')
            );
        };

        /**
         * Replace the counter / IV used by this instance (bitArray form).
         * @param {number[]} ba_iv
         */
        _Encrypt.prototype.ba_update = function (ba_iv) {
            this.iv = ba_iv;
        };

        /**
         * Raw CTR encrypt/decrypt on bitArray-form input/output.
         * @param {number[]} b_arr
         * @returns {number[]|false}
         */
        _Encrypt.prototype.ba_raw = function (b_arr) {
            if (this._dead) return false;
            return ctr.encrypt(this.cipher, b_arr, this.iv, '');
        };

        return {
            ui8(key, iv) {
                return new _Encrypt(key, iv);
            }
        };
    }
};
