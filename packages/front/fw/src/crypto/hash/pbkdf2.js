// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview PBKDF2 (PKCS #5 v2 / RFC 2898) password-based key derivation.
 *
 * Default iteration count is 600000 (OWASP 2023 recommendation for
 * PBKDF2-HMAC-SHA-256 password storage). A console warning is emitted when
 * an explicit count below 100000 is used, so test/KAT vectors continue to
 * work but accidentally weak production calls are flagged.
 *
 * The pseudo-random function family defaults to HMAC-SHA-256; pass any
 * module shaped like `hmac` as `Prff` for a different PRF.
 *
 * Public API: the factory returns a callable function `pbkdf2(password,
 * salt, count, length, Prff)` that also exposes `.derive(...)` (alias),
 * `.name` and `.MIN_RECOMMENDED_COUNT` so it integrates cleanly with the
 * standard `{ name, ... }` module shape used elsewhere in the framework.
 *
 */

/**
 * Single PBKDF2 derivation call signature. `bitArray` values are `number[]`.
 * @typedef {(password: (number[]|string), salt: (number[]|string), count?: number, length?: number, Prff?: {fn:Function}) => (number[]|false)} Pbkdf2Derive
 */

/**
 * Public shape returned by `pbkdf2.factory()`: a callable function carrying
 * `.derive` (alias of itself) and the recommended-count constants.
 * @typedef {Pbkdf2Derive & { derive: Pbkdf2Derive, MIN_RECOMMENDED_COUNT: number, DEFAULT_COUNT: number }} Pbkdf2API
 */

import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hmac } from './hmac.js';

export const pbkdf2 = {
    name: 'pbkdf2',
    version: '1.0.0',
    type: 'fw.crypto.hash',
    dependencies: ['bitArray', 'utf8', 'hmac'],
    deps: [bitArray, utf8, hmac],

    /** @returns {Pbkdf2API} */
    factory(bitArray, utf8, hmac) {

        const DEFAULT_COUNT = 600000;
        const MIN_RECOMMENDED_COUNT = 100000;

        /**
         * PBKDF2 key derivation (PKCS #5 v2 / RFC 2898 §5.2).
         * @param {bitArray|string} password  Password / passphrase.
         * @param {bitArray|string} salt      Salt (≥ 64 bits recommended).
         * @param {number} [count]            Iteration count
         *   (default: 600000 = OWASP-2023 for HMAC-SHA-256).
         * @param {number} [length]           Desired output length in **bits**.
         *   `0` returns `[]` (off-spec convenience); the caller is responsible
         *   for picking ≥ 128 bits for security uses.
         * @param {{fn:Function}} [Prff]      PRF module (default: hmac, i.e.
         *   HMAC-SHA-256). Must expose `.fn` constructor + `.encrypt(data)`.
         * @returns {bitArray|false}          Derived key, or `false` on invalid
         *   parameters (negative length, count below 1).
         */
        function derive(password, salt, count, length, Prff) {
            if (count === undefined) {
                count = DEFAULT_COUNT;
            } else if (count > 0 && count < MIN_RECOMMENDED_COUNT) {
                console.warn(
                    '[crypto] WEAK: pbkdf2: count=' + count +
                    ' below recommended minimum (' + MIN_RECOMMENDED_COUNT + ')'
                );
            }

            // RFC 8018 §5.2: c is a positive integer; `count < 1` (or NaN)
            // would run no iteration at all.
            if (length < 0 || !(count >= 1)) {
                console.warn('[crypto] INVALID: pbkdf2: invalid params (count must be >= 1, length >= 0)');
                return false;
            }
            // Edge case (post-upgrade audit): `length === 0` must return []
            // without entering the loop - otherwise the `length || 1` fallback
            // below would compute a phantom block. RFC 2898 §5.2 requires
            // dkLen ≥ 1 octet; this case is off-spec but we handle it cleanly
            // rather than emitting a stray block.
            if (length === 0) return [];

            if (typeof password === 'string') {
                password = bitArray.ui8_to_ba(utf8.toBytes(password));
            }
            if (typeof salt === 'string') {
                salt = bitArray.ui8_to_ba(utf8.toBytes(salt));
            }

            const Prf = Prff || hmac;
            const prf = new Prf.fn(password);
            let out = [];

            // HMAC-SHA-256, the default PRF: every iteration after the first
            // is two SHA-256 compressions of a padded 32-byte message on the
            // key's inner and outer states (what HMAC computes), without
            // allocation. Any other PRF takes the general loop.
            const inner = prf._baseHash && prf._baseHash[0] && prf._baseHash[0]._h;
            const outer = prf._baseHash && prf._baseHash[1] && prf._baseHash[1]._h;
            const compress = !Prff && prf._hash && prf._hash[Symbol.for('@awacloud/fw/internal')] && prf._hash[Symbol.for('@awacloud/fw/internal')].compress;
            const fast = typeof compress === 'function' && inner && outer && inner.length === 8 &&
                prf._hash.fn.prototype.blockSize === 512;
            const st = new Int32Array(8), blk = new Int32Array(16);

            for (let k = 1; 32 * out.length < (length || 1); k++) {
                let u = prf.encrypt(bitArray.concat(salt, [k]));
                let ui = u;
                if (fast && u.length === 8) {
                    const cur = Int32Array.from(u);
                    for (let i = 1; i < count; i++) {
                        // inner: H(ipad state, U || 0x80 || 0... || 768 bits)
                        for (let j = 0; j < 8; j++) { st[j] = inner[j]; blk[j] = cur[j]; }
                        blk[8] = 0x80000000; blk[9] = 0; blk[10] = 0; blk[11] = 0; blk[12] = 0; blk[13] = 0; blk[14] = 0; blk[15] = 768;
                        compress(st, blk);
                        // outer: H(opad state, inner || 0x80 || 0... || 768 bits)
                        for (let j = 0; j < 8; j++) { blk[j] = st[j]; st[j] = outer[j]; }
                        blk[8] = 0x80000000; blk[9] = 0; blk[10] = 0; blk[11] = 0; blk[12] = 0; blk[13] = 0; blk[14] = 0; blk[15] = 768;
                        compress(st, blk);
                        for (let j = 0; j < 8; j++) { cur[j] = st[j]; u[j] ^= st[j]; }
                    }
                } else {
                    for (let i = 1; i < count; i++) {
                        ui = prf.encrypt(ui);
                        for (let j = 0; j < ui.length; j++) {
                            u[j] ^= ui[j];
                        }
                    }
                }
                out = out.concat(u);
            }

            if (length) {
                out = bitArray.clamp(out, length);
            }
            return out;
        }

        derive.derive = derive;
        derive.MIN_RECOMMENDED_COUNT = MIN_RECOMMENDED_COUNT;
        derive.DEFAULT_COUNT = DEFAULT_COUNT;
        return derive;
    }
};
