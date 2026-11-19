// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Logical reference of `chacha20.js` (RFC 8439 ChaCha20, IETF
 * variant: 256-bit key, 96-bit nonce, 32-bit counter).
 *
 * Taken from `git show 6ffb948ef^:packages/front/fw/src/crypto/cipher/chacha20.js`,
 * the form before the block function moved to locals: the state as an array
 * of 16 words, a quarter-round function, the 10 double rounds as a loop and
 * the keystream XORed byte by byte.
 *
 * Adapted: the `factory()` body is wrapped in `createChacha20Reference()`;
 * the members master removed from the contract since are dropped (the
 * `xchacha20()` reject and the `_internal` block hatch, now in the internal
 * slot), and the counter-overflow warning no longer points at `xchacha20()`.
 * The validation, the 32-bit counter guard and the `false` returns are the
 * parent's, identical to the fast module's today.
 *
 * A test oracle for its co-located differential test, kept in the git
 * repository only: excluded from the npm tarball, the exports map, the declaration tree
 * and the registry.
 */

/**
 * Build the reference ChaCha20 (the parent's `factory()` body).
 * @returns {{ xor: (key: Uint8Array, nonce: Uint8Array, data: Uint8Array, initialCounter?: number) => (Uint8Array|false) }}
 *   `xor` XORs `data` with the keystream; `false` on an invalid key or nonce
 *   or a counter overflow.
 */
export function createChacha20Reference() {

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

        // ── Counter overflow guard (32-bit) ────────────
        // RFC 8439 §2.3 : ChaCha20 IETF variant uses a 32-bit block
        // counter. After 2^32 blocks (256 GiB) under a single (key, nonce)
        // the counter wraps and starts re-using keystream blocks → catastrophic
        // (XOR of two ciphertexts cancels the keystream). The XChaCha20
        // draft (`draft-irtf-cfrg-xchacha`) extends to 192-bit nonce +
        // 32-bit counter to defer the limit, but it is *not* implemented
        // here. Active guard: refuse
        // any call that would push the counter past 2^32 - 1.
        const startCounter = (initialCounter >>> 0);  // unsigned 32-bit view
        const blocksNeeded = Math.ceil(data.length / 64);
        // (startCounter + blocksNeeded - 1) is the LAST counter value used.
        // Reject if this would overflow the 32-bit space.
        if (blocksNeeded > 0 && startCounter + blocksNeeded > 0x100000000) {
            console.warn('[crypto] LIMIT-EXCEEDED: chacha20: counter overflow (>256 GiB on this (key, nonce) pair). Rotate key or use a fresh nonce; XChaCha20 is not implemented.');
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

    return { xor };
}
