// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview ChaCha20-Poly1305 AEAD construction (RFC 8439 §2.8).
 *
 * The Poly1305 one-time key is derived from `ChaCha20(key, nonce, counter=0)`
 * (the first 32 bytes of the keystream block). Encryption uses
 * `counter=1..` for the actual data. The MAC input is constructed as:
 *
 *   pad16(AAD) || pad16(ciphertext) || len64_le(AAD) || len64_le(ciphertext)
 *
 * Decryption verifies the tag in constant time and never releases the
 * plaintext on failure (returns `false`).
 *
 */

import { chacha20 } from '../cipher/chacha20.js';
import { poly1305 } from '../hash/poly1305.js';

/**
 * Process-local nonce-uniqueness guard returned by `chacha20poly1305.nonceTracker()`.
 * @typedef {object} ChaCha20Poly1305NonceTracker
 * @property {Set<string>} seenNonces Set of hex-encoded nonces already used (inspectable).
 * @property {(nonce: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array) => ({ct: Uint8Array, tag: Uint8Array}|false)} encrypt Encrypt, rejecting reused nonces.
 * @property {(nonce: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array, aad?: Uint8Array) => (Uint8Array|false)} decrypt Decrypt (does not consult the seen set).
 */

/**
 * Object returned by `chacha20poly1305.factory()`.
 * @typedef {object} ChaCha20Poly1305API
 * @property {string} name Module name (`'chacha20poly1305'`).
 * @property {(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array) => ({ct: Uint8Array, tag: Uint8Array}|false)} encrypt AEAD encrypt.
 * @property {(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array, aad?: Uint8Array) => (Uint8Array|false)} decrypt AEAD decrypt; `false` on tag mismatch.
 * @property {(key: Uint8Array) => ChaCha20Poly1305NonceTracker} nonceTracker Wrap key in an in-process nonce-uniqueness guard.
 */

export const chacha20poly1305 = {
    name: 'chacha20poly1305',
    version: '1.0.0',
    type: 'fw.crypto.mode',
    dependencies: ['chacha20', 'poly1305'],
    deps: [chacha20, poly1305],

    /** @returns {ChaCha20Poly1305API} */
    factory(chacha20, poly1305) {

        function _padTo16(len) {
            return (16 - (len % 16)) % 16;
        }

        // RFC 8439 §2.8 mandates a 64-bit little-endian length field for
        // both AAD and ciphertext. `n` is a JS Number here ; for values up
        // to 2^53 (≈ 9 PiB) the `Math.floor(v / 256)` chain is exact. We
        // would lose precision only for payloads ≥ 2^53 bytes, far beyond
        // any realistic in-process buffer, so a BigInt path is unnecessary
        // in practice. The 2^53 boundary is documented here for future
        // hardening if a streaming AEAD ever exceeds it.
        function _len64le(n) {
            const out = new Uint8Array(8);
            let v = n;
            for (let i = 0; i < 8; i++) {
                out[i] = v & 0xff;
                v = Math.floor(v / 256);
            }
            return out;
        }

        function _polyKey(key, nonce) {
            // First 32 bytes of ChaCha20 keystream at counter=0.
            const zero = new Uint8Array(32);
            return chacha20.xor(key, nonce, zero, 0);
        }

        function _macInput(aad, ct) {
            const aadPad = _padTo16(aad.length);
            const ctPad  = _padTo16(ct.length);
            const total = aad.length + aadPad + ct.length + ctPad + 16;
            const buf = new Uint8Array(total);
            let off = 0;
            buf.set(aad, off); off += aad.length + aadPad;
            buf.set(ct, off);  off += ct.length + ctPad;
            buf.set(_len64le(aad.length), off); off += 8;
            buf.set(_len64le(ct.length), off);
            return buf;
        }

        /**
         * AEAD encrypt.
         * @param {Uint8Array} key 32 bytes.
         * @param {Uint8Array} nonce 12 bytes.
         * @param {Uint8Array} plaintext
         * @param {Uint8Array} [aad] Additional authenticated data (default empty).
         * @returns {{ct:Uint8Array, tag:Uint8Array}|false}
         */
        function encrypt(key, nonce, plaintext, aad) {
            aad = aad || new Uint8Array(0);
            const polyKey = _polyKey(key, nonce);
            if (polyKey === false) return false;
            const ct = chacha20.xor(key, nonce, plaintext, 1);
            if (ct === false) return false;
            const tag = poly1305.mac(polyKey, _macInput(aad, ct));
            return { ct, tag };
        }

        /**
         * AEAD decrypt.
         * @returns {Uint8Array|false} Plaintext on success, `false` on tag mismatch.
         */
        function decrypt(key, nonce, ciphertext, tag, aad) {
            aad = aad || new Uint8Array(0);
            const polyKey = _polyKey(key, nonce);
            if (polyKey === false) return false;
            if (!poly1305.verify(polyKey, _macInput(aad, ciphertext), tag)) {
                console.error('[crypto] CORRUPT: chacha20poly1305: authentication tag mismatch');
                return false;
            }
            return chacha20.xor(key, nonce, ciphertext, 1);
        }

        // ── Iteration G2 - Nonce-uniqueness tracker (opt-in) ─────────────
        //
        // ChaCha20-Poly1305 (RFC 8439) requires the (key, nonce) pair to be
        // unique : reuse leaks the Poly1305 key (forgery + plaintext recovery
        // via two-time pad). Unlike GCM nonce reuse, Poly1305's tag will
        // *still validate* on the second message - there is no cryptographic
        // canary. The application must enforce uniqueness.
        //
        // `nonceTracker(key)` wraps `encrypt`/`decrypt` with an in-process
        // Set of seen nonces (per-wrapper, not global). Mirrors the GCM
        // pattern (`mode/gcm.js:258`). Process-local only - distributed or
        // persistent uniqueness must be enforced upstream.
        //
        // Not enabled by default (no breaking change). Use this to harden
        // long-lived sessions where the caller can't reason about nonce
        // collisions.
        function nonceTracker(key) {
            const seen = new Set();
            const k2s = (nonce) => {
                let s = '';
                for (let i = 0; i < nonce.length; i++) {
                    s += (nonce[i] < 16 ? '0' : '') + nonce[i].toString(16);
                }
                return s;
            };
            return {
                seenNonces: seen,
                encrypt(nonce, plaintext, aad) {
                    const s = k2s(nonce);
                    if (seen.has(s)) {
                        console.error('[crypto] CORRUPT: chacha20poly1305: nonce reuse rejected by tracker');
                        return false;
                    }
                    seen.add(s);
                    return encrypt(key, nonce, plaintext, aad);
                },
                // ── Decrypt policy ───────────────────────────────────────
                // `decrypt` deliberately does NOT consult or mutate the
                // `seen` Set. Rationale :
                //
                //  • Decryption with the right key + tag proves the message
                //    was produced by someone holding the key - replaying a
                //    valid (nonce, ct, tag) tuple is harmless at the AEAD
                //    layer (it yields the same plaintext, no key/MAC
                //    leakage). Anti-replay is the application's job (e.g.
                //    sequence numbers in TLS, packet IDs in Noise).
                //
                //  • Forbidding decrypt-replay would break legitimate
                //    use cases : verifying a long-lived stored ciphertext
                //    on every load, idempotent retries over an unreliable
                //    transport, multiple readers of the same blob.
                //
                //  • The catastrophic failure ChaCha20-Poly1305 guards
                //    against is **encrypt** nonce reuse (two-time pad on
                //    the Poly1305 key). The encrypt path is where the
                //    tracker matters.
                //
                // If your protocol needs replay protection at this layer,
                // wrap `decrypt` upstream with a windowed sequence-number
                // check rather than enabling it here.
                decrypt(nonce, ciphertext, tag, aad) {
                    return decrypt(key, nonce, ciphertext, tag, aad);
                }
            };
        }

        return { name: 'chacha20poly1305', encrypt, decrypt, nonceTracker };
    }
};
