// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview UUID factory module - RFC 4122 / RFC 9562 conformance.
 *
 * Generates v1 (time-based, MAC-derived) and v4 (random) identifiers
 * strictly following RFC 4122 §4 format (superseded by RFC 9562 in May
 * 2024 - identical binary format, clarified terminology).
 *
 * **Security**:
 * - Default entropy source: `crypto.getRandomValues` (Web Crypto API
 *   `RandomSource`; SP 800-90B-grade in all validated JS runtimes).
 * - The custom `prng` callback is intended for **tests / replay** only
 *   (cf. `uuid.acvp.md`). No production use should pass
 *   a `prng` other than `false`.
 *
 * **Output**:
 * - `raw=true` → `Uint8Array(16)` (raw binary, version + variant patched).
 * - `raw=false` (default) + `format='compact'` (default) → `string` 32 hex without
 *   hyphens (back-compat with the historical API).
 * - `raw=false` + `format='rfc4122'` → canonical `string`
 *   `xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx` (RFC 4122 §3).
 *
 * **Runtime requirement** : `globalThis.crypto.getRandomValues` must be
 * available. Provided in browsers (Web Crypto API), Node ≥ 19, Bun, Deno.
 * No fallback - the module throws if absent.
 *
 *
 * @typedef {Object} UuidFactoryApi
 * @property {(raw?: boolean, prng?: false | ((buf: Uint8Array) => Uint8Array|void), format?: 'compact' | 'rfc4122') => Uint8Array|string} v1
 * @property {(raw?: boolean, prng?: false | ((buf: Uint8Array) => Uint8Array|void), format?: 'compact' | 'rfc4122') => Uint8Array|string} v4
 */
import { hex } from '../../io/codec/hex.js';

export const uuid = {
    name: 'uuid',
    dependencies: ['hex'],
    deps: [hex],

    /**
     * Build the UUID API using the provided hex helper.
     * @param {{fromBytes: (bytes: Uint8Array) => string}} hex - Hex encoder.
     * @returns {UuidFactoryApi} UUID API with `v1` and `v4` generators.
     */
    factory(hex) {
        const buf = new Uint8Array(16);
        let _nodeId, _clockseq, _lastMSecs = 0, _lastNSecs = 0;

        /**
         * Format a Uint8Array(16) as a hex string.
         *  - `format='compact'` : 32 hex chars, no hyphens.
         *  - `format='rfc4122'` : `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
         *    (RFC 4122 §3 / RFC 9562 §4).
         */
        function _formatHex(bytes, format) {
            const flat = hex.fromBytes(bytes);
            if (format === 'rfc4122') {
                return flat.slice(0, 8) + '-'
                    + flat.slice(8, 12) + '-'
                    + flat.slice(12, 16) + '-'
                    + flat.slice(16, 20) + '-'
                    + flat.slice(20, 32);
            }
            return flat;
        }

        /**
         * Fill the target buffer with seed bytes from a PRNG or crypto.
         * @param {false | ((buf: Uint8Array) => Uint8Array|void)} prng
         * @param {Uint8Array} target
         * @returns {Uint8Array}
         */
        function getSeedBytes(prng, target) {
            if (prng !== false && typeof prng === 'function') {
                const before = target.slice(0);
                const out = prng(target);
                if (out instanceof Uint8Array && out.length >= 16) return out;
                if (out === undefined || out === null || out === target) {
                    for (let i = 0; i < 16; i++) {
                        if (target[i] !== before[i]) return target;
                    }
                }
            }
            return crypto.getRandomValues(target);
        }

        /**
         * Generate a UUID v1 (time-based, RFC 4122 §4.2 / RFC 9562 §5.1).
         * @param {boolean} [raw=false] When true, returns raw 16-byte `Uint8Array`.
         * @param {false | ((buf: Uint8Array) => Uint8Array|void)} [prng=false]
         *   Test-only entropy override ; production should use `false`.
         * @param {'compact'|'rfc4122'} [format='compact'] String output format
         *   (ignored if `raw=true`). `'rfc4122'` returns the canonical format
         *   with hyphens (RFC 4122 §3); `'compact'` returns 32 hex without hyphens.
         * @returns {Uint8Array|string}
         */
        const v1 = function(raw = false, prng = false, format = 'compact') {
            let i = 0, b = buf;
            let node = _nodeId, clockseq = _clockseq;

            if (node == null || clockseq == null) {
                const seedBytes = getSeedBytes(prng, buf);
                if (node == null) {
                    node = _nodeId = [
                        seedBytes[0] | 0x01, seedBytes[1], seedBytes[2],
                        seedBytes[3], seedBytes[4], seedBytes[5]
                    ];
                }
                if (clockseq == null) {
                    clockseq = _clockseq = ((seedBytes[6] << 8) | seedBytes[7]) & 0x3fff;
                }
            }

            let msecs = Date.now();
            let nsecs = _lastNSecs + 1;
            let dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 10000;

            if (dt < 0) clockseq = (clockseq + 1) & 0x3fff;
            if (dt < 0 || msecs > _lastMSecs) {
                nsecs = 0;
            } else if (nsecs >= 10000) {
                clockseq = (clockseq + 1) & 0x3fff;
                nsecs = 0;
            }

            _lastMSecs = msecs;
            _lastNSecs = nsecs;
            _clockseq = clockseq;

            msecs += 12219292800000;

            const tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
            b[i++] = (tl >>> 24) & 0xff;
            b[i++] = (tl >>> 16) & 0xff;
            b[i++] = (tl >>> 8) & 0xff;
            b[i++] = tl & 0xff;

            const tmh = ((msecs / 0x100000000) * 10000) & 0xfffffff;
            b[i++] = (tmh >>> 8) & 0xff;
            b[i++] = tmh & 0xff;
            b[i++] = ((tmh >>> 24) & 0xf) | 0x10;
            b[i++] = (tmh >>> 16) & 0xff;
            b[i++] = (clockseq >>> 8) | 0x80;
            b[i++] = clockseq & 0xff;

            for (let n = 0; n < 6; ++n) b[i + n] = node[n];

            return raw ? buf.slice(0) : _formatHex(buf, format);
        }

        /**
         * Generate a UUID v4 (random, RFC 4122 §4.4 / RFC 9562 §5.4).
         * @param {boolean} [raw=false] When true, returns raw 16-byte `Uint8Array`.
         * @param {false | ((buf: Uint8Array) => Uint8Array|void)} [prng=false]
         *   Test-only entropy override ; production should use `false`.
         * @param {'compact'|'rfc4122'} [format='compact'] String output format
         *   (ignored if `raw=true`).
         * @returns {Uint8Array|string}
         */
        const v4 = function(raw = false, prng = false, format = 'compact') {
            const seedBytes = getSeedBytes(prng, buf);

            // RFC 4122 §4.1.3: version = 4 (the top 4 bits of byte 6
            // must be 0100). RFC 9562 §5.4 identical.
            seedBytes[6] = (seedBytes[6] & 0x0f) | 0x40;
            // RFC 4122 §4.1.1: variant = 10 (the top 2 bits of byte 8
            // must be 10). RFC 9562 §4.1 identical.
            seedBytes[8] = (seedBytes[8] & 0x3f) | 0x80;

            return raw ? seedBytes.slice(0, 16) : _formatHex(seedBytes, format);
        }
        return {v1, v4}
    }
};
