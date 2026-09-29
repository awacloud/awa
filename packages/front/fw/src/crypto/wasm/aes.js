// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmAes` — WASM-loaded AES-GCM / AES-CBC / AES-CTR
 * (NIST SP 800-38D / SP 800-38A), a Tier-2 fallback for the pure-JS `aes` +
 * `mode/*` modules. Loads the colocated `aes` binary (vendored from `@awacloud/fw-wasm-crypto`)
 * through {@link wasmRuntime} and exposes an async, `Uint8Array`, no-throw
 * surface.
 *
 * **WASM has no AES-NI.** This path is portable constant-time **software**
 * (BearSSL's 64-bit bitsliced `aes_ct64` + carryless `ghash_ctmul64`), not
 * hardware crypto acceleration. In a secure context WebCrypto's `subtle`
 * (HW AES-NI / PCLMULQDQ) is faster and preferred — see
 * [`../webcrypto/aes.js`](../webcrypto/aes.js). This wrapper exists for the
 * non-secure-context fallback (workers / locked-down contexts where
 * `crypto.subtle` is absent).
 *
 * The `aes` target is **scalar-only** (`simd:false` in `fw-wasm-crypto/
 * targets.json` — the AES block and GHASH stay bitsliced/carryless, not
 * simd128); there is no `aes.simd.wasm`. `wasmAes` therefore forces
 * `{ variant: 'scalar' }` when loading (the runtime's default simd selection
 * would otherwise try to fetch a non-existent file).
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `aes`) ───
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports
 * (every algorithm fn returns `i32`: 0 = OK, non-zero = error):
 *
 *   aes_gcm_seal(keyPtr, keyLen, ivPtr,
 *                dataPtr, dataLen, aadPtr, aadLen, outPtr) -> i32
 *     // iv = 12 bytes (96-bit J0); outPtr receives ct(dataLen) || tag(16).
 *
 *   aes_gcm_open(keyPtr, keyLen, ivPtr,
 *                dataPtr, dataLen, aadPtr, aadLen, outPtr) -> i32
 *     // iv = 12 bytes; dataLen EXCLUDES the tag — the 16-byte tag MUST follow
 *     // the ciphertext contiguously at dataPtr+dataLen. Non-zero = auth fail.
 *     // outPtr receives pt(dataLen).
 *
 *   aes_cbc_enc(keyPtr, keyLen, ivPtr, dataPtr, dataLen, outPtr) -> i32
 *   aes_cbc_dec(keyPtr, keyLen, ivPtr, dataPtr, dataLen, outPtr) -> i32
 *     // iv = 16 bytes; dataLen MUST be a multiple of 16. The ABI does NO
 *     // padding — PKCS#7 framing is applied/stripped HERE in JS.
 *
 *   aes_ctr(keyPtr, keyLen, ivPtr, dataPtr, dataLen, outPtr) -> i32
 *     // CTR is its own inverse (one fn for enc and dec). The ABI reads a
 *     // 12-byte nonce from ivPtr; the 16-byte counter block is
 *     // nonce(12)||be32(0) with the block counter starting at 0 (J0-style).
 *
 * `keyLen` selects AES-128/192/256 (16/24/32 bytes).
 *
 * ─── Counter / nonce note (ABI vs. plan) ───
 *
 * The frozen binary's `aes_ctr` consumes a **12-byte nonce** (the low 32 bits
 * of the 128-bit counter block are the block index, started at 0 by the ABI),
 * matching the shim's J0-style counter and the package KAT (which references
 * WebCrypto AES-CTR with `counter = nonce(12)||be32(0)`, `length:32`). The
 * indicative "Expected ABI" in the task plan named a 16-byte full-width
 * counter; the delivered binary (targets.json + shims/aes.c) is authoritative,
 * so `encryptCtr`/`decryptCtr` take a 12-byte nonce.
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Public surface of `wasmAes.factory()`. All methods are async, operate over
 * `Uint8Array`, and resolve `false` (never throw) on invalid params, load
 * failure, WASM error, or — for `decryptGcm` — authentication failure.
 * @typedef {object} WasmAesAPI
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array) => Promise<Uint8Array|false>} encryptGcm
 *   AES-GCM seal. `iv` is 12 bytes; output is `ciphertext ‖ tag(16)`.
 * @property {(key: Uint8Array, iv: Uint8Array, ctWithTag: Uint8Array, aad?: Uint8Array) => Promise<Uint8Array|false>} decryptGcm
 *   AES-GCM open. `ctWithTag` is `ciphertext ‖ tag(16)`; auth failure → `false`.
 * @property {(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array) => Promise<Uint8Array|false>} encryptCbc
 *   AES-CBC with PKCS#7 padding. `iv` is 16 bytes.
 * @property {(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array) => Promise<Uint8Array|false>} decryptCbc
 *   AES-CBC; strips PKCS#7. Invalid padding → `false`. `iv` is 16 bytes.
 * @property {(key: Uint8Array, nonce: Uint8Array, data: Uint8Array) => Promise<Uint8Array|false>} encryptCtr
 *   AES-CTR. `nonce` is 12 bytes (block counter starts at 0).
 * @property {(key: Uint8Array, nonce: Uint8Array, data: Uint8Array) => Promise<Uint8Array|false>} decryptCtr
 *   AES-CTR (its own inverse). `nonce` is 12 bytes.
 */

import { wasmRuntime } from './runtime.js';

export const wasmAes = {
    name: 'wasmAes',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmAesAPI}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────
        const _MODULE = 'aes';
        const _EXPECTED = [
            'aes_gcm_seal',
            'aes_gcm_open',
            'aes_cbc_enc',
            'aes_cbc_dec',
            'aes_ctr',
        ];
        // The `aes` target ships SCALAR ONLY (`simd:false` in
        // fw-wasm-crypto/targets.json — AES block is bitsliced ct64 + carryless
        // GHASH, not simd128). There is no `aes.simd.wasm`; force scalar or the
        // runtime's default simd selection would fetch a non-existent file.
        /** @type {import('./runtime.js').WasmLoadOptions} */
        const _LOAD_OPTS = { variant: 'scalar' };

        const _VALID_KEY_LENS = [16, 24, 32]; // AES-128/192/256
        const _GCM_IV_LEN = 12;               // 96-bit IV (SP 800-38D §8.2.1)
        const _GCM_TAG_BYTES = 16;            // full 16-byte tag (ABI-fixed)
        const _CBC_IV_LEN = 16;               // 128-bit IV
        const _CTR_NONCE_LEN = 12;            // 12-byte J0-style nonce
        const _BLOCK = 16;                    // AES block size

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Validate the AES key (16/24/32-byte Uint8Array).
         * @param {Uint8Array} key
         * @returns {boolean}
         */
        function _validKey(key) {
            if (!(key instanceof Uint8Array) || !_VALID_KEY_LENS.includes(key.length)) {
                console.error('[crypto] INVALID: wasmAes: key must be a 16/24/32-byte Uint8Array');
                return false;
            }
            return true;
        }

        /**
         * Validate a Uint8Array IV/nonce of an exact byte length.
         * @param {Uint8Array} iv
         * @param {number} len
         * @param {string} label
         * @returns {boolean}
         */
        function _validIv(iv, len, label) {
            if (!(iv instanceof Uint8Array) || iv.length !== len) {
                console.error(`[crypto] INVALID: wasmAes: ${label} must be a ${len}-byte Uint8Array`);
                return false;
            }
            return true;
        }

        /**
         * Append PKCS#7 padding so the result is a whole number of 16-byte
         * blocks. A full padding block is appended when the input is already
         * block-aligned (RFC 5652 §6.3).
         * @param {Uint8Array} data
         * @returns {Uint8Array}
         */
        function _pkcs7Pad(data) {
            const padLen = _BLOCK - (data.length % _BLOCK); // 1.._BLOCK
            const out = new Uint8Array(data.length + padLen);
            out.set(data);
            out.fill(padLen, data.length);
            return out;
        }

        /**
         * Strip PKCS#7 padding in a length-and-content-checked manner. Returns
         * `false` (never throws) when the padding is malformed.
         * @param {Uint8Array} data  Block-aligned, non-empty.
         * @returns {Uint8Array|false}
         */
        function _pkcs7Strip(data) {
            if (data.length === 0 || data.length % _BLOCK !== 0) {
                return false;
            }
            const padLen = data[data.length - 1];
            if (padLen < 1 || padLen > _BLOCK || padLen > data.length) {
                return false;
            }
            // Verify every padding byte equals padLen (scan the full block to
            // avoid an early-exit padding oracle on byte position).
            let bad = 0;
            for (let i = data.length - padLen; i < data.length; i++) {
                bad |= data[i] ^ padLen;
            }
            if (bad !== 0) {
                return false;
            }
            return data.subarray(0, data.length - padLen);
        }

        /**
         * AES-GCM authenticated encryption.
         *
         * Output layout: `ciphertext ‖ tag` where the tag is 16 bytes.
         *
         * @param {Uint8Array} key        16/24/32-byte key.
         * @param {Uint8Array} iv         12-byte IV.
         * @param {Uint8Array} plaintext  Plaintext bytes (may be empty).
         * @param {Uint8Array} [aad]      Additional authenticated data (default empty).
         * @returns {Promise<Uint8Array|false>}
         */
        async function encryptGcm(key, iv, plaintext, aad) {
            if (!_validKey(key) || !_validIv(iv, _GCM_IV_LEN, 'gcm iv')) {
                return false;
            }
            if (!(plaintext instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmAes: plaintext must be a Uint8Array');
                return false;
            }
            const _aad = (aad instanceof Uint8Array) ? aad : new Uint8Array(0);

            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                return false;
            }

            const ptLen = plaintext.length;
            const aadLen = _aad.length;
            const outLen = ptLen + _GCM_TAG_BYTES;

            // alloc(0) may return 0; pass a 1-byte stand-in for zero-length inputs.
            const keyIn = wasmRuntime.withBytes(loaded, key);
            const ivIn = wasmRuntime.withBytes(loaded, iv);
            const ptIn = wasmRuntime.withBytes(loaded, ptLen ? plaintext : new Uint8Array(1));
            const aadIn = wasmRuntime.withBytes(loaded, aadLen ? _aad : new Uint8Array(1));
            const outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(outLen));

            try {
                const status = wasmRuntime.run(loaded, 'aes_gcm_seal', [
                    keyIn.ptr, key.length, ivIn.ptr,
                    ptIn.ptr, ptLen, aadIn.ptr, aadLen, outBuf.ptr,
                ]);
                if (status !== 0) {
                    console.error('[crypto] FAIL: wasmAes.encryptGcm: aes_gcm_seal status ' + status);
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, outLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmAes.encryptGcm: ' + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                aadIn.free();
                ptIn.free();
                ivIn.free();
                keyIn.free();
            }
        }

        /**
         * AES-GCM authenticated decryption.
         *
         * `ctWithTag` is `ciphertext ‖ tag(16)`. The tag comparison happens
         * inside the binary; a non-zero return means authentication failure —
         * no exception, no partial plaintext.
         *
         * @param {Uint8Array} key        16/24/32-byte key.
         * @param {Uint8Array} iv         12-byte IV.
         * @param {Uint8Array} ctWithTag  Ciphertext ‖ tag (≥ 16 bytes).
         * @param {Uint8Array} [aad]      Additional authenticated data (default empty).
         * @returns {Promise<Uint8Array|false>}  Plaintext or `false`.
         */
        async function decryptGcm(key, iv, ctWithTag, aad) {
            if (!_validKey(key) || !_validIv(iv, _GCM_IV_LEN, 'gcm iv')) {
                return false;
            }
            if (!(ctWithTag instanceof Uint8Array) || ctWithTag.length < _GCM_TAG_BYTES) {
                console.error('[crypto] INVALID: wasmAes: ctWithTag must be a Uint8Array of at least 16 bytes');
                return false;
            }
            const _aad = (aad instanceof Uint8Array) ? aad : new Uint8Array(0);

            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                return false;
            }

            const ctLen = ctWithTag.length - _GCM_TAG_BYTES; // dataLen EXCLUDES tag
            const aadLen = _aad.length;

            const keyIn = wasmRuntime.withBytes(loaded, key);
            const ivIn = wasmRuntime.withBytes(loaded, iv);
            // ct‖tag laid out contiguously; the ABI reads the tag at dataPtr+ctLen.
            const dataIn = wasmRuntime.withBytes(loaded, ctWithTag);
            const aadIn = wasmRuntime.withBytes(loaded, aadLen ? _aad : new Uint8Array(1));
            const outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(ctLen || 1));

            try {
                const status = wasmRuntime.run(loaded, 'aes_gcm_open', [
                    keyIn.ptr, key.length, ivIn.ptr,
                    dataIn.ptr, ctLen, aadIn.ptr, aadLen, outBuf.ptr,
                ]);
                if (status !== 0) {
                    // Authentication failure — do NOT log or return partial plaintext.
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, ctLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmAes.decryptGcm: ' + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                aadIn.free();
                dataIn.free();
                ivIn.free();
                keyIn.free();
            }
        }

        /**
         * Drive one of the raw block-aligned ABI fns (`aes_cbc_enc` /
         * `aes_cbc_dec`) over an already-padded / ciphertext buffer.
         * @param {string} fn   'aes_cbc_enc' | 'aes_cbc_dec'
         * @param {Uint8Array} key
         * @param {Uint8Array} iv   16 bytes
         * @param {Uint8Array} data block-aligned (length % 16 === 0)
         * @returns {Promise<Uint8Array|false>}
         */
        async function _cbcRun(fn, key, iv, data) {
            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                return false;
            }
            const keyIn = wasmRuntime.withBytes(loaded, key);
            const ivIn = wasmRuntime.withBytes(loaded, iv);
            const dataIn = wasmRuntime.withBytes(loaded, data.length ? data : new Uint8Array(1));
            const outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(data.length || 1));
            try {
                const status = wasmRuntime.run(loaded, fn, [
                    keyIn.ptr, key.length, ivIn.ptr, dataIn.ptr, data.length, outBuf.ptr,
                ]);
                if (status !== 0) {
                    console.error(`[crypto] FAIL: wasmAes.${fn}: status ` + status);
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, data.length);
            } catch (e) {
                console.error(`[crypto] FAIL: wasmAes.${fn}: ` + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                dataIn.free();
                ivIn.free();
                keyIn.free();
            }
        }

        /**
         * AES-CBC encryption with PKCS#7 padding (the ABI does only raw blocks;
         * padding is applied here).
         *
         * @param {Uint8Array} key        16/24/32-byte key.
         * @param {Uint8Array} iv         16-byte IV.
         * @param {Uint8Array} plaintext  Plaintext bytes (any length).
         * @returns {Promise<Uint8Array|false>}
         */
        async function encryptCbc(key, iv, plaintext) {
            if (!_validKey(key) || !_validIv(iv, _CBC_IV_LEN, 'cbc iv')) {
                return false;
            }
            if (!(plaintext instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmAes: plaintext must be a Uint8Array');
                return false;
            }
            const padded = _pkcs7Pad(plaintext);
            return _cbcRun('aes_cbc_enc', key, iv, padded);
        }

        /**
         * AES-CBC decryption + PKCS#7 strip. Invalid padding → `false`.
         *
         * @param {Uint8Array} key        16/24/32-byte key.
         * @param {Uint8Array} iv         16-byte IV.
         * @param {Uint8Array} ciphertext Block-aligned ciphertext (non-empty).
         * @returns {Promise<Uint8Array|false>}
         */
        async function decryptCbc(key, iv, ciphertext) {
            if (!_validKey(key) || !_validIv(iv, _CBC_IV_LEN, 'cbc iv')) {
                return false;
            }
            if (
                !(ciphertext instanceof Uint8Array) ||
                ciphertext.length === 0 ||
                ciphertext.length % _BLOCK !== 0
            ) {
                console.error('[crypto] INVALID: wasmAes: ciphertext must be a non-empty Uint8Array of whole 16-byte blocks');
                return false;
            }
            const out = await _cbcRun('aes_cbc_dec', key, iv, ciphertext);
            if (out === false) {
                return false;
            }
            const stripped = _pkcs7Strip(out);
            if (stripped === false) {
                console.error('[crypto] FAIL: wasmAes.decryptCbc: invalid PKCS#7 padding');
                return false;
            }
            // Copy out of the subarray view into a standalone array.
            return new Uint8Array(stripped);
        }

        /**
         * Drive the CTR ABI fn (its own inverse) over `data`.
         * @param {string} who   'encryptCtr' | 'decryptCtr' (for diagnostics)
         * @param {Uint8Array} key
         * @param {Uint8Array} nonce 12 bytes
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        async function _ctrRun(who, key, nonce, data) {
            if (!_validKey(key) || !_validIv(nonce, _CTR_NONCE_LEN, 'ctr nonce')) {
                return false;
            }
            if (!(data instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmAes: data must be a Uint8Array');
                return false;
            }
            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                return false;
            }
            const keyIn = wasmRuntime.withBytes(loaded, key);
            const ivIn = wasmRuntime.withBytes(loaded, nonce);
            const dataIn = wasmRuntime.withBytes(loaded, data.length ? data : new Uint8Array(1));
            const outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(data.length || 1));
            try {
                const status = wasmRuntime.run(loaded, 'aes_ctr', [
                    keyIn.ptr, key.length, ivIn.ptr, dataIn.ptr, data.length, outBuf.ptr,
                ]);
                if (status !== 0) {
                    console.error(`[crypto] FAIL: wasmAes.${who}: aes_ctr status ` + status);
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, data.length);
            } catch (e) {
                console.error(`[crypto] FAIL: wasmAes.${who}: ` + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                dataIn.free();
                ivIn.free();
                keyIn.free();
            }
        }

        /**
         * AES-CTR encryption. `nonce` is 12 bytes; the 16-byte counter block is
         * `nonce(12)||be32(0)` with the block counter starting at 0.
         *
         * @param {Uint8Array} key   16/24/32-byte key.
         * @param {Uint8Array} nonce 12-byte nonce.
         * @param {Uint8Array} data  Plaintext bytes (any length).
         * @returns {Promise<Uint8Array|false>}
         */
        function encryptCtr(key, nonce, data) {
            return _ctrRun('encryptCtr', key, nonce, data);
        }

        /**
         * AES-CTR decryption (CTR is its own inverse).
         *
         * @param {Uint8Array} key   16/24/32-byte key.
         * @param {Uint8Array} nonce 12-byte nonce.
         * @param {Uint8Array} data  Ciphertext bytes (any length).
         * @returns {Promise<Uint8Array|false>}
         */
        function decryptCtr(key, nonce, data) {
            return _ctrRun('decryptCtr', key, nonce, data);
        }

        return {
            isAvailable,
            encryptGcm,
            decryptGcm,
            encryptCbc,
            decryptCbc,
            encryptCtr,
            decryptCtr,
        };
    },
};
