// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AES-Derivation Function (ADF) - KeePass-style key derivation.
 *
 * Derives a key by repeatedly encrypting a hashed composite under AES with a
 * transform seed, then mixing the result with the master seed via SHA-256.
 *
 * **Use case (legacy)**: this KDF exists for back-compatibility with KeePass
 * v3 database files (.kdbx) that pre-date Argon2 adoption. For new
 * password-based key derivation, prefer `argon2` (memory-hard, RFC 9106) or
 * `pbkdf2` with a high iteration count. Use `adf` only when interoperating
 * with KeePass artifacts.
 *
 */

/**
 * ADF derivation call signature. `bitArray` values are `number[]`.
 * @typedef {(master: number[], transform: number[], rounds: number, composite: number[]) => (number[]|false)} AdfDerive
 */

/**
 * Public shape returned by `adf.factory()`.
 * @typedef {object} AdfAPI
 * @property {AdfDerive} fn Full derivation (`adf_partial` result hashed once more).
 * @property {AdfDerive} partial Partial derivation (master ‖ SHA-256(transformed)).
 * @property {number} MIN_RECOMMENDED_ROUNDS KeePass recommended minimum round count.
 * @property {number} MAX_ROUNDS Upper bound on rounds.
 */

import { sha256 } from './sha256.js';
import { aes } from '../cipher/aes.js';

export const adf = {
    name: 'adf',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['sha256', 'aes'],
    deps: [sha256, aes],

    /** @returns {AdfAPI} */
    factory(sha256, aes) {

        // KeePass profile recommends ≥ 60k rounds. Warn below this so weak
        // configurations are flagged in production logs (mirrors the
        // `pbkdf2.MIN_RECOMMENDED_COUNT` pattern).
        const MIN_RECOMMENDED_ROUNDS = 60000;
        // Cap rounds to a sane upper bound - beyond this is almost certainly
        // a bug (overflow, runaway loop) rather than a real configuration.
        const MAX_ROUNDS = 1 << 30; // ~10^9; KeePass tops out far below this.

        function _isWordArray(x) {
            if (!Array.isArray(x)) return false;
            for (let i = 0; i < x.length; i++) {
                if (typeof x[i] !== 'number') return false;
            }
            return true;
        }

        /**
         * @param {Array} master    Master seed (128–256 bits).
         * @param {Array} transform Transform seed (256 bits = 8 words, AES key).
         * @param {number} rounds   Iteration count (≥ 60000 recommended).
         * @param {Array} composite Composite credentials hash input.
         * @returns {Array|false}   Derived key (master ‖ SHA-256(transformed)),
         *   or `false` on invalid input.
         */
        function adf_partial(master, transform, rounds, composite) {
            if (!_isWordArray(master)) {
                console.warn('[crypto] INVALID: adf: master must be a bitArray (word[])');
                return false;
            }
            if (!_isWordArray(transform) || transform.length !== 8) {
                console.warn('[crypto] INVALID: adf: transform must be a 256-bit AES key (8 × 32-bit words)');
                return false;
            }
            if (!_isWordArray(composite)) {
                console.warn('[crypto] INVALID: adf: composite must be a bitArray (word[])');
                return false;
            }
            if (typeof rounds !== 'number' || !Number.isFinite(rounds) || rounds < 0) {
                console.warn('[crypto] INVALID: adf: rounds must be a non-negative finite number');
                return false;
            }
            if (rounds > MAX_ROUNDS) {
                console.warn('[crypto] INVALID: adf: rounds exceeds MAX_ROUNDS (' + MAX_ROUNDS + ')');
                return false;
            }
            if (rounds > 0 && rounds < MIN_RECOMMENDED_ROUNDS) {
                console.warn(
                    '[crypto] WEAK: adf: rounds=' + rounds +
                    ' below KeePass recommended minimum (' + MIN_RECOMMENDED_ROUNDS + ')'
                );
            }

            const cipher = aes.fn(transform, false);
            const transformed_key = sha256.hash(composite);
            const transformed = [transformed_key.slice(0, 4), transformed_key.slice(4, 8)];
            for (let i = 0; i < rounds; i++) {
                transformed[0] = cipher.encrypt(transformed[0]);
                transformed[1] = cipher.encrypt(transformed[1]);
            }
            return master.concat(
                sha256.hash(transformed[0].concat(transformed[1]))
            );
        }

        /**
         * Same as {@link adf_partial} but applies a final SHA-256 over the result.
         * Returns `false` (and warns) when `adf_partial` rejects the inputs.
         */
        function adf_full(master, transform, rounds, composite) {
            const inner = adf_partial(master, transform, rounds, composite);
            if (inner === false) return false;
            return sha256.hash(inner);
        }

        return {
            fn: adf_full,
            partial: adf_partial,
            MIN_RECOMMENDED_ROUNDS,
            MAX_ROUNDS
        };
    }
};
