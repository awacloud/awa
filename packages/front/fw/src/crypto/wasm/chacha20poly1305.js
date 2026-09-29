// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmChacha20poly1305` — WASM-SIMD ChaCha20-Poly1305 AEAD
 * (RFC 8439), loaded by name through {@link wasmRuntime} from the colocated
 * `chacha20poly1305` binary (vendored from `@awacloud/fw-wasm-crypto`).
 *
 * ChaCha20-Poly1305 (RFC 8439) is **not** in WebCrypto, making this the
 * primary accelerator path. The binary ships BOTH `.simd.wasm` and
 * `.scalar.wasm`; the loader auto-selects simd when the host validates
 * `simd128`, otherwise scalar. WASM here is portable-SIMD **software** speed
 * — not hardware crypto acceleration (no AES-NI/SHA-NI).
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `chacha20poly1305`) ──
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports:
 *
 *   aead_seal(
 *     keyPtr, noncePtr, ptPtr, ptLen, aadPtr, aadLen, outPtr
 *   ) -> i32        // 0 = OK, non-zero = error
 *
 *   aead_open(
 *     keyPtr, noncePtr, ctPtr, ctLen, aadPtr, aadLen, outPtr
 *   ) -> i32        // 0 = OK, non-zero = authentication failure
 *
 * For `aead_seal`: `outPtr` receives `ptLen + TAG_BYTES` bytes (ciphertext
 * followed by the 16-byte Poly1305 tag). For `aead_open`: `ctLen` is the
 * TOTAL byte count including the tag (`ctTag.length`); the ABI splits the
 * incoming buffer into ciphertext + tag internally. The tag comparison is
 * branch-free inside the binary (`ct_tag_diff` accumulator pattern — see
 * the shim source); a non-zero return means auth failure, never a thrown
 * exception. Plaintext output on open is `ctLen - TAG_BYTES` bytes.
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Public surface of `wasmChacha20poly1305.factory()`.
 * @typedef {object} WasmChacha20Poly1305API
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array) => Promise<Uint8Array|false>} seal
 *   Encrypt + authenticate; output = ciphertext‖tag (tag is 16 bytes).
 *   Returns `false` on invalid params or load failure; never throws.
 * @property {(key: Uint8Array, nonce: Uint8Array, ctWithTag: Uint8Array, aad?: Uint8Array) => Promise<Uint8Array|false>} open
 *   Verify tag (constant-time) then decrypt; returns plaintext or `false`
 *   on authentication failure / invalid params. Never throws.
 */

import { wasmRuntime } from './runtime.js';

export const wasmChacha20poly1305 = {
    name: 'wasmChacha20poly1305',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmChacha20Poly1305API}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────
        const _MODULE = 'chacha20poly1305';
        const _EXPECTED = ['aead_seal', 'aead_open'];
        // No variant pin: chacha20poly1305 ships BOTH .simd.wasm and .scalar.wasm;
        // the loader auto-selects simd when the host validates simd128 (the point
        // of this wrapper). Do NOT force scalar.
        const _LOAD_OPTS = undefined;
        const _KEY_LEN = 32;          // 256-bit key (RFC 8439 §2.8)
        const _NONCE_LEN = 12;        // 96-bit IETF nonce (RFC 8439 §2.8)
        const _TAG_BYTES = 16;        // Poly1305 tag length

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Validate key / nonce / minimum ciphertext+tag length.
         * @param {Uint8Array} key
         * @param {Uint8Array} nonce
         * @param {number} [ctTagLen] Supply for `open` validation (must be ≥ 16).
         * @returns {boolean}
         */
        function _validate(key, nonce, ctTagLen) {
            if (!(key instanceof Uint8Array) || key.length !== _KEY_LEN) {
                console.error('[crypto] INVALID: wasmChacha20poly1305: key must be a 32-byte Uint8Array');
                return false;
            }
            if (!(nonce instanceof Uint8Array) || nonce.length !== _NONCE_LEN) {
                console.error('[crypto] INVALID: wasmChacha20poly1305: nonce must be a 12-byte Uint8Array');
                return false;
            }
            if (ctTagLen !== undefined && ctTagLen < _TAG_BYTES) {
                console.error('[crypto] INVALID: wasmChacha20poly1305: ctWithTag must be at least 16 bytes');
                return false;
            }
            return true;
        }

        /**
         * Encrypt + authenticate with ChaCha20-Poly1305.
         *
         * Output layout: `ciphertext ‖ tag` where tag is always 16 bytes.
         *
         * @param {Uint8Array} key        32-byte key.
         * @param {Uint8Array} nonce      12-byte IETF nonce.
         * @param {Uint8Array} plaintext  Plaintext bytes (may be empty).
         * @param {Uint8Array} [aad]      Additional authenticated data (default empty).
         * @returns {Promise<Uint8Array|false>}
         */
        async function seal(key, nonce, plaintext, aad) {
            if (!_validate(key, nonce)) {
                return false;
            }
            if (!(plaintext instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmChacha20poly1305: plaintext must be a Uint8Array');
                return false;
            }
            const _aad = (aad instanceof Uint8Array) ? aad : new Uint8Array(0);

            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                return false;
            }

            const ptLen = plaintext.length;
            const aadLen = _aad.length;
            const outLen = ptLen + _TAG_BYTES;

            // alloc(0) may return 0; pass a 1-byte stand-in for zero-length inputs.
            const keyIn = wasmRuntime.withBytes(loaded, key);
            const nonceIn = wasmRuntime.withBytes(loaded, nonce);
            const ptIn = wasmRuntime.withBytes(loaded, ptLen ? plaintext : new Uint8Array(1));
            const aadIn = wasmRuntime.withBytes(loaded, aadLen ? _aad : new Uint8Array(1));
            const outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(outLen));

            try {
                const status = wasmRuntime.run(loaded, 'aead_seal', [
                    keyIn.ptr, nonceIn.ptr,
                    ptIn.ptr, ptLen,
                    aadIn.ptr, aadLen,
                    outBuf.ptr,
                ]);
                if (status !== 0) {
                    console.error('[crypto] FAIL: wasmChacha20poly1305.seal: aead_seal status ' + status);
                    return false;
                }
                // Copy OUT of linear memory (never alias reused WASM memory).
                return wasmRuntime.readBytes(loaded, outBuf.ptr, outLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmChacha20poly1305.seal: ' + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                aadIn.free();
                ptIn.free();
                nonceIn.free();
                keyIn.free();
            }
        }

        /**
         * Verify + decrypt with ChaCha20-Poly1305.
         *
         * The Poly1305 tag comparison in the binary is branch-free (constant-
         * time). A non-zero return from `aead_open` means authentication failure
         * — no exception is raised and no partial plaintext is returned.
         *
         * @param {Uint8Array} key        32-byte key.
         * @param {Uint8Array} nonce      12-byte IETF nonce.
         * @param {Uint8Array} ctWithTag  Ciphertext ‖ tag (≥ 16 bytes).
         * @param {Uint8Array} [aad]      Additional authenticated data (default empty).
         * @returns {Promise<Uint8Array|false>}  Plaintext or `false` on failure.
         */
        async function open(key, nonce, ctWithTag, aad) {
            if (!(ctWithTag instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmChacha20poly1305: ctWithTag must be a Uint8Array');
                return false;
            }
            if (!_validate(key, nonce, ctWithTag.length)) {
                return false;
            }
            const _aad = (aad instanceof Uint8Array) ? aad : new Uint8Array(0);

            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                return false;
            }

            const ctLen = ctWithTag.length;   // INCLUDES the 16-byte tag
            const msgLen = ctLen - _TAG_BYTES;
            const aadLen = _aad.length;

            const keyIn = wasmRuntime.withBytes(loaded, key);
            const nonceIn = wasmRuntime.withBytes(loaded, nonce);
            // The ABI receives ct‖tag contiguously; ctLen tells the binary where tag starts.
            const dataIn = wasmRuntime.withBytes(loaded, ctWithTag);
            const aadIn = wasmRuntime.withBytes(loaded, aadLen ? _aad : new Uint8Array(1));
            const outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(msgLen || 1));

            try {
                const status = wasmRuntime.run(loaded, 'aead_open', [
                    keyIn.ptr, nonceIn.ptr,
                    dataIn.ptr, ctLen,
                    aadIn.ptr, aadLen,
                    outBuf.ptr,
                ]);
                if (status !== 0) {
                    // Authentication failure — do NOT log or return partial plaintext.
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, msgLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmChacha20poly1305.open: ' + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                aadIn.free();
                dataIn.free();
                nonceIn.free();
                keyIn.free();
            }
        }

        return { isAvailable, seal, open };
    },
};
