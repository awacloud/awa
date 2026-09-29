// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview ChaCha20 stream cipher (RFC 8439).
 *
 * IETF variant: 256-bit key, 96-bit nonce, 32-bit counter. The block function
 * runs 20 rounds (10 double-rounds) of quarter-round operations on a 4×4
 * matrix of 32-bit words. Output is XORed with the plaintext.
 *
 */

/**
 * Object returned by `chacha20.factory()`.
 * @typedef {object} ChaCha20API
 * @property {(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, initialCounter?: number) => (Uint8Array|false)} xor XOR `data` with the ChaCha20 keystream; `false` on invalid key/nonce or counter overflow.
 * @property {() => false} xchacha20 Explicit reject for the unimplemented XChaCha20 variant (always `false`).
 * @property {{ block: (key32: Int32Array, counter: number, nonce32: Int32Array, out32: Int32Array) => void }} _internal Internal block primitive (debug/introspection only).
 */

export const chacha20 = {
    name: 'chacha20',
    version: '1.0.0',
    type: 'fw.crypto.cipher',
    dependencies: [],

    /** @returns {ChaCha20API} */
    factory() {

        const _SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]; // "expand 32-byte k"

        function _rotl(v, n) { return ((v << n) | (v >>> (32 - n))) | 0; }

        function _qr(s, a, b, c, d) {
            s[a] = (s[a] + s[b]) | 0; s[d] = _rotl(s[d] ^ s[a], 16);
            s[c] = (s[c] + s[d]) | 0; s[b] = _rotl(s[b] ^ s[c], 12);
            s[a] = (s[a] + s[b]) | 0; s[d] = _rotl(s[d] ^ s[a], 8);
            s[c] = (s[c] + s[d]) | 0; s[b] = _rotl(s[b] ^ s[c], 7);
        }

        function _block(key32, counter, nonce32, out32) {
            const s = new Int32Array(16);
            s[0] = _SIGMA[0]; s[1] = _SIGMA[1]; s[2] = _SIGMA[2]; s[3] = _SIGMA[3];
            for (let i = 0; i < 8; i++) s[4 + i] = key32[i];
            s[12] = counter | 0;
            s[13] = nonce32[0]; s[14] = nonce32[1]; s[15] = nonce32[2];

            const x = new Int32Array(s);
            for (let i = 0; i < 10; i++) {
                _qr(x, 0, 4,  8, 12);
                _qr(x, 1, 5,  9, 13);
                _qr(x, 2, 6, 10, 14);
                _qr(x, 3, 7, 11, 15);
                _qr(x, 0, 5, 10, 15);
                _qr(x, 1, 6, 11, 12);
                _qr(x, 2, 7,  8, 13);
                _qr(x, 3, 4,  9, 14);
            }
            for (let i = 0; i < 16; i++) out32[i] = (x[i] + s[i]) | 0;
        }

        function _u32leFromBytes(bytes, off) {
            return (bytes[off] | (bytes[off+1] << 8) | (bytes[off+2] << 16) | (bytes[off+3] << 24)) | 0;
        }

        /**
         * XOR `data` with the ChaCha20 keystream.
         * @param {Uint8Array} key 32-byte key.
         * @param {Uint8Array} nonce 12-byte nonce.
         * @param {Uint8Array} data Plaintext or ciphertext.
         * @param {number} [initialCounter=0] Starting block counter.
         * @returns {Uint8Array|false}
         */
        function xor(key, nonce, data, initialCounter) {
            if (!(key instanceof Uint8Array) || key.length !== 32) {
                console.warn('[crypto] INVALID: chacha20: key must be 32 bytes');
                return false;
            }
            if (!(nonce instanceof Uint8Array) || nonce.length !== 12) {
                console.warn('[crypto] INVALID: chacha20: nonce must be 12 bytes');
                return false;
            }
            const key32 = new Int32Array(8);
            for (let i = 0; i < 8; i++) key32[i] = _u32leFromBytes(key, i * 4);
            const nonce32 = new Int32Array(3);
            for (let i = 0; i < 3; i++) nonce32[i] = _u32leFromBytes(nonce, i * 4);

            // ── Iteration G3 - Counter overflow guard (32-bit) ────────────
            // RFC 8439 §2.3 : ChaCha20 IETF variant uses a 32-bit block
            // counter. After 2^32 blocks (256 GiB) under a single (key, nonce)
            // the counter wraps and starts re-using keystream blocks → catastrophic
            // (XOR of two ciphertexts cancels the keystream). The XChaCha20
            // draft (`draft-irtf-cfrg-xchacha`) extends to 192-bit nonce +
            // 32-bit counter to defer the limit, but it is *not* implemented
            // here (see `xchacha20()` reject below). Active guard : refuse
            // any call that would push the counter past 2^32 - 1.
            const startCounter = (initialCounter >>> 0);  // unsigned 32-bit view
            const blocksNeeded = Math.ceil(data.length / 64);
            // (startCounter + blocksNeeded - 1) is the LAST counter value used.
            // Reject if this would overflow the 32-bit space.
            if (blocksNeeded > 0 && startCounter + blocksNeeded > 0x100000000) {
                console.warn('[crypto] LIMIT-EXCEEDED: chacha20: counter overflow (>256 GiB on this (key, nonce) pair). Rotate key or use a fresh nonce; XChaCha20 is not implemented (see xchacha20()).');
                return false;
            }

            const out = new Uint8Array(data.length);
            const block = new Int32Array(16);
            let counter = (initialCounter | 0) || 0;
            let off = 0;
            while (off < data.length) {
                _block(key32, counter, nonce32, block);
                const remaining = data.length - off;
                const n = remaining < 64 ? remaining : 64;
                for (let i = 0; i < n; i++) {
                    const w = block[i >>> 2];
                    const b = (w >>> ((i & 3) * 8)) & 0xff;
                    out[off + i] = data[off + i] ^ b;
                }
                off += n;
                counter = (counter + 1) | 0;
            }
            return out;
        }

        // ── Iteration G3 - XChaCha20 explicit reject ────────────────────
        // XChaCha20 (`draft-irtf-cfrg-xchacha-03`, expired) extends the IETF
        // ChaCha20 to 192-bit nonces via HChaCha20 sub-key derivation. It is
        // popular (libsodium, Wireguard) but NOT a finalised IETF/NIST
        // standard. Rather than ship a half-tested variant, we expose an
        // explicit reject : any caller that needs XChaCha20 should use a
        // dedicated library (e.g. libsodium-wasm) and must do so consciously.
        function xchacha20() {
            console.warn('[crypto] NOT-IMPLEMENTED: chacha20: XChaCha20 (draft-irtf-cfrg-xchacha) is not implemented. Use a fresh 12-byte nonce per message with chacha20.xor(), or an external library if 192-bit nonces are required.');
            return false;
        }

        return /** @type {ChaCha20API} */ (/** @type {any} */ ({
            xor,
            xchacha20,
            // Internal primitive - exposed for debug / introspection (public tests
            // exercise it indirectly via `xor(zero, …)`). Convention
            // `_internal.*` shared with gcm/cmac/rsa/random/etc.
            _internal: { block: _block }
        }));
    }
};
