// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SHA-1 hash function (FIPS 180-4 §6.1) — PDF-local
 * legacy module.
 *
 * **Why this lives in pdf and not fw** : SHA-1 is cryptographically
 * broken for collision resistance. It MUST NOT be used for new
 * signatures, MACs, or password hashing. The only reason this module
 * exists in the workspace is **PDF legacy compatibility** — ISO
 * 32000-2 §12.8.4.3 mandates SHA-1 of the signature value as the DSS
 * `/VRI` dict key. Keeping the implementation in `@awacloud/pdf` instead of
 * `@awacloud/fw` makes the legacy-only nature obvious to anyone reading
 * fw's hash family (sha256/384/512 only).
 *
 * Exposes the same surface as fw's hash modules (`hash(data)` one-shot
 * and `fn` constructor) so the dispatch idiom stays uniform.
 *
 * Factory descriptor — deps `['bitArray', 'utf8']`. Pattern aligned
 * on `@awacloud/fw/crypto/hash/sha256.js`.
 *
 * @module pdf/sig/sha1
 */

import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';

export const pdfSha1 = {
    name: 'pdfSha1',
    dependencies: ['bitArray', 'utf8'],
    deps: [bitArray, utf8],
    factory(bitArray, utf8) {

        const _INIT = [
            0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0
        ];

        // K[0..3] — round constants (FIPS 180-4 §4.2.1).
        const _KEY = [
            0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6
        ];

        // Closure-based constructor — worker-safe (no `this.` in factory
        // body). `fn(other?)` returns an object with `_h`/`_buffer`/
        // `_length`/`reset`/`update`/`finalize` closing over locals.
        function fn(other) {
            let h, buffer, length;
            function reset() {
                h = _INIT.slice(0);
                buffer = [];
                length = 0;
                return self;
            }
            function _block(w) {
                let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
                const W = new Array(80);
                for (let i = 0; i < 16; i++) W[i] = w[i] | 0;
                for (let i = 16; i < 80; i++) {
                    const x = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
                    W[i] = (x << 1) | (x >>> 31);
                }
                for (let i = 0; i < 80; i++) {
                    let f, kt;
                    if (i < 20)      { f = (b & c) | ((~b) & d);           kt = _KEY[0]; }
                    else if (i < 40) { f = b ^ c ^ d;                       kt = _KEY[1]; }
                    else if (i < 60) { f = (b & c) | (b & d) | (c & d);     kt = _KEY[2]; }
                    else             { f = b ^ c ^ d;                       kt = _KEY[3]; }
                    const t = (((a << 5) | (a >>> 27)) + f + e + kt + W[i]) | 0;
                    e = d;
                    d = c;
                    c = ((b << 30) | (b >>> 2)) | 0;
                    b = a;
                    a = t;
                }
                h[0] = (h[0] + a) | 0;
                h[1] = (h[1] + b) | 0;
                h[2] = (h[2] + c) | 0;
                h[3] = (h[3] + d) | 0;
                h[4] = (h[4] + e) | 0;
            }
            function update(data) {
                if (typeof data === 'string') {
                    data = bitArray.ui8_to_ba(utf8.toBytes(data));
                }
                buffer = bitArray.concat(buffer, data);
                const ol = length;
                const nl = length = ol + bitArray.bitLength(data);
                if (nl > 9007199254740991) {
                    console.warn('[crypto] INVALID: sha1: cannot hash more than 2^53 - 1 bits');
                    return false;
                }
                const c = new Uint32Array(buffer);
                let j = 0;
                for (let i = 512 + ol - ((512 + ol) & 511); i <= nl; i += 512) {
                    _block(c.subarray(16 * j, 16 * (j + 1)));
                    j += 1;
                }
                buffer.splice(0, 16 * j);
                return self;
            }
            function finalize() {
                buffer = bitArray.concat(buffer, [bitArray.partial(1, 1)]);
                for (let i = buffer.length + 2; i & 15; i++) {
                    buffer.push(0);
                }
                buffer.push(Math.floor(length / 0x100000000));
                buffer.push(length | 0);
                while (buffer.length) {
                    _block(buffer.splice(0, 16));
                }
                const out = h;
                reset();
                return out;
            }
            const self = {
                blockSize: 512,
                reset, update, finalize,
                // Expose state for clone — caller uses `fn(otherInstance)`.
                get _h()      { return h; },
                get _buffer() { return buffer; },
                get _length() { return length; }
            };
            if (other) {
                h      = other._h.slice(0);
                buffer = other._buffer.slice(0);
                length = other._length;
            } else {
                reset();
            }
            return self;
        }

        function hash(data) {
            return fn().update(data).finalize();
        }

        return { fn, hash };
    }
};
