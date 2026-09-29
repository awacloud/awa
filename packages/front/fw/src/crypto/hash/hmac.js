// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview HMAC (RFC 2104) keyed-hash construction.
 *
 * Defaults to SHA-256 but accepts any hash module exposing the same shape
 * (`{ fn, hash, fn.prototype.blockSize }`) as `Hash` in the constructor -
 * e.g. `sha512` for HMAC-SHA-512.
 *
 * Streaming usage: `new hmac.fn(key).update(chunk).update(chunk).digest()`.
 * One-shot:        `new hmac.fn(key).encrypt(data)` (alias: `.mac(data)`).
 *
 * **Mutual exclusion**: `encrypt`/`mac` and the `update`+`digest` streaming
 * path are mutually exclusive on a single instance. Once `update` has been
 * called, `encrypt` rejects with a warning (the `_updated` guard) - use
 * `reset()` to reuse the instance, or call `digest()` to consume the stream.
 *
 */

/**
 * Public shape of a constructed HMAC instance (prototype methods).
 * `bitArray` values are represented as `number[]`.
 * @typedef {object} HmacInstance
 * @property {(data: (number[]|Uint8Array|string)) => HmacInstance} update Streaming absorb; returns `this`.
 * @property {() => number[]} digest Finalize and return the MAC tag (bitArray); resets the instance.
 * @property {(data: (number[]|Uint8Array|string)) => (number[]|false)} encrypt One-shot MAC; `false` if already updated.
 * @property {(data: (number[]|Uint8Array|string)) => (number[]|false)} mac Alias for `encrypt`.
 * @property {() => void} reset Reset streaming state (key schedule preserved).
 */

/**
 * Public shape returned by `hmac.factory()`.
 * @typedef {object} HmacAPI
 * @property {new (key: (number[]|Uint8Array|string), Hash?: object) => HmacInstance} fn
 *   HMAC constructor bound to `key` under the (optional) hash module.
 * @property {(key: (number[]|Uint8Array|string), data: (number[]|Uint8Array|string), tag: number[], Hash?: object) => boolean} verify
 *   Constant-time MAC verification.
 */

import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { sha256 } from './sha256.js';

export const hmac = {
    name: 'hmac',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['bitArray', 'utf8', 'sha256'],
    deps: [bitArray, utf8, sha256],

    /** @returns {HmacAPI} */
    factory(bitArray, utf8, sha256) {

        const api = {};

        /**
         * Construct an HMAC instance bound to `key` under hash module `Hash`.
         * @param {bitArray|Uint8Array|string} key  Secret key.
         * @param {Object} [Hash]  Hash module (default: sha256). Must expose
         *   `{ fn, hash, fn.prototype.blockSize }`.
         */
        api.fn = function (key, Hash) {
            /** @type {boolean} */
            this._updated = false;
            this._hash = Hash || sha256;

            if (typeof key === 'string') {
                key = bitArray.ui8_to_ba(utf8.toBytes(key));
            }

            const exKey = [[], []];
            // `bs` is the block size expressed in 32-bit words (e.g. 16 for
            // SHA-256's 512-bit block). `key.length` is the count of words
            // in the bitArray representation, so the comparison is in the
            // same unit on both sides.
            const bs = this._hash.fn.prototype.blockSize / 32;
            this._baseHash = [new this._hash.fn(), new this._hash.fn()];

            if (key.length > bs) {
                key = this._hash.hash(key);
            }

            // By this point `key` is a bitArray (32-bit words) : the string
            // branch above converted it via `bitArray.ui8_to_ba`, and
            // `hash()` always returns a bitArray. The declared union type
            // still allows `string`, so we narrow locally for the bitwise
            // loop below.
            const k = /** @type {number[]} */ (/** @type {any} */ (key));
            for (let i = 0; i < bs; i++) {
                exKey[0][i] = (k[i] | 0) ^ 0x36363636;
                exKey[1][i] = (k[i] | 0) ^ 0x5C5C5C5C;
            }

            this._baseHash[0].update(exKey[0]);
            this._baseHash[1].update(exKey[1]);
            this._resultHash = new this._hash.fn(this._baseHash[0]);
        };

        /**
         * One-shot MAC: feed `data` and return the digest. Rejects (returns
         * `false`) if `update` has already been called on this instance -
         * use `reset()` to recycle the instance for another one-shot call.
         * @param {bitArray|Uint8Array|string} data
         * @returns {bitArray|false} MAC tag, or `false` on misuse.
         */
        api.fn.prototype.encrypt = function (data) {
            if (this._updated) {
                console.warn('[crypto] INVALID: hmac: encrypt called on already-updated instance');
                return false;
            }
            this.update(data);
            return this.digest();
        };

        /**
         * Alias for {@link encrypt} - preferred name when the semantic is a
         * Message Authentication Code rather than encryption. Same behaviour
         * and same mutual-exclusion contract as `encrypt`.
         */
        api.fn.prototype.mac = api.fn.prototype.encrypt;

        /**
         * Reset internal streaming state so the instance can be reused for a
         * fresh `update`/`digest` cycle or a new `encrypt`/`mac` call. The
         * key schedule (`_baseHash`) is preserved.
         */
        api.fn.prototype.reset = function () {
            this._resultHash = new this._hash.fn(this._baseHash[0]);
            this._updated = false;
        };

        /**
         * Streaming update: absorb `data` into the inner hash.
         * @param {bitArray|Uint8Array|string} data
         * @returns {this} For chaining.
         */
        api.fn.prototype.update = function (data) {
            this._updated = true;
            this._resultHash.update(data);
            // @ts-ignore - TS2719: constructor-function 'this' return type narrowing limitation
            return this;
        };

        /**
         * Finalize the streaming computation and return the MAC tag. Resets
         * the instance afterwards so it can be reused.
         * @returns {bitArray} MAC tag.
         */
        api.fn.prototype.digest = function () {
            const w = this._resultHash.finalize();
            const result = new this._hash.fn(this._baseHash[1]).update(w).finalize();
            this.reset();
            return result;
        };

        /**
         * Constant-time MAC verification. Computes HMAC(key, data) under the
         * same hash family and compares against `tag` using `bitArray.equal`
         * (XOR-accumulated, no early exit).
         *
         * @param {bitArray|Uint8Array|string} key
         * @param {bitArray|Uint8Array|string} data
         * @param {bitArray} tag  Expected MAC as a bitArray.
         * @param {Object} [Hash] Optional hash module (defaults to sha256).
         * @returns {boolean} true iff the recomputed MAC matches `tag`.
         */
        api.verify = function (key, data, tag, Hash) {
            const expected = new api.fn(key, Hash).encrypt(data);
            if (expected === false) return false;
            return bitArray.equal(expected, tag);
        };

        return api;
    }
};
