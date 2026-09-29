// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmHmac` — WASM-loaded HMAC-SHA2 (FIPS 198-1 / RFC 2104).
 *
 * HMAC over SHA-256/384/512 is in WebCrypto; this WASM tier is the
 * **non-secure-context fallback** for environments where `crypto.subtle` is
 * absent (locked-down workers, non-secure origins). The pure-JS
 * {@link hmac} module stays the universal default. Prefer
 * `webcrypto/hmac` in secure contexts.
 *
 * This wrapper loads the colocated `hmac` binary (vendored from `@awacloud/fw-wasm-crypto`) — own
 * C23 HMAC framing (`csrc/hmac/hmac.c`) over the own SHA-2 core
 * (`csrc/sha2/sha2.c`) — through {@link wasmRuntime} and exposes an async,
 * `Uint8Array`, no-throw surface.
 *
 * The `hmac` target is **scalar-only** (`simd:false` in `targets.json` —
 * SHA-2 + HMAC get marginal gain from simd128); there is no
 * `hmac.simd.wasm`. `wasmHmac` therefore forces `{ variant: 'scalar' }`
 * when loading.
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `hmac`) ───
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports:
 *
 *   hmac(
 *     hashId: i32,           // 256 = SHA-256, 384 = SHA-384, 512 = SHA-512
 *     keyPtr: i32, keyLen: i32,
 *     msgPtr: i32, msgLen: i32,
 *     outPtr: i32            // caller-allocated output buffer
 *   ) -> i32                 // 0 = OK; -1 (WC_EBADPARAM) = unknown hashId
 *
 * The output buffer must be at least `outLen` bytes (32 / 48 / 64 for
 * SHA-256 / 384 / 512). A non-zero status indicates an invalid `hashId`;
 * the canonical valid values are 256, 384, 512.
 *
 * When `keyLen` > blockSize (64 for SHA-256, 128 for SHA-384/512), the key
 * is first hashed by the WASM shim before being used in the HMAC
 * construction (RFC 2104 §2, mandatory).
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Public surface of `wasmHmac.factory()`.
 * @typedef {object} WasmHmacAPI
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(key: Uint8Array, data: Uint8Array, hash?: 256|384|512) => Promise<Uint8Array|false>} mac
 *   Compute the HMAC tag. Returns a `Uint8Array` (32/48/64 bytes) or `false`
 *   on invalid params, load failure, or WASM error.
 * @property {(key: Uint8Array, tag: Uint8Array, data: Uint8Array, hash?: 256|384|512) => Promise<boolean>} verify
 *   Recompute the HMAC tag and compare with `tag` in constant time.
 */

import { wasmRuntime } from './runtime.js';

export const wasmHmac = {
    name: 'wasmHmac',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmHmacAPI}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────

        /** Module name as shipped by `@awacloud/fw-wasm-crypto`. */
        const _MODULE = 'hmac';

        /** The single exported WASM function name. */
        const _FN = 'hmac';

        /** Expected exports beyond the ABI triple (`memory`/`alloc`/`free`). */
        const _EXPECTED = ['hmac'];

        // The `hmac` target ships SCALAR ONLY (`simd:false` in
        // fw-wasm-crypto/targets.json — SHA-2 HMAC gets marginal simd gain).
        // There is no `hmac.simd.wasm`; force scalar or the runtime's default
        // simd selection would attempt to fetch a non-existent file.
        /** @type {import('./runtime.js').WasmLoadOptions} */
        const _LOAD_OPTS = { variant: 'scalar' };

        /** Valid hashId values → full digest byte length. */
        const _HASH_LENS = { 256: 32, 384: 48, 512: 64 };

        /** Default hash (HMAC-SHA-256). */
        const _DEFAULT_HASH = 256;

        // ── helpers ──────────────────────────────────────────────────────────

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Constant-time equality over two byte arrays. Scans the full length of
         * `a`; a length mismatch short-circuits to `false` (length is not secret)
         * without leaking index-dependent timing.
         * @param {Uint8Array} a
         * @param {Uint8Array} b
         * @returns {boolean}
         */
        function _ctEqual(a, b) {
            if (a.length !== b.length) {
                return false;
            }
            let diff = 0;
            for (let i = 0; i < a.length; i++) {
                diff |= a[i] ^ b[i];
            }
            return diff === 0;
        }

        /**
         * Compute the HMAC tag for `data` under `key` using the given `hashId`.
         *
         * @param {Uint8Array} key   Secret key (any byte length; if > block size,
         *   it is hashed by the WASM shim per RFC 2104).
         * @param {Uint8Array} data  Input message (any byte length).
         * @param {256|384|512} [hash=256]  SHA-2 variant.
         * @returns {Promise<Uint8Array|false>}
         */
        async function mac(key, data, hash) {
            // ── parameter validation ─────────────────────────────────────────
            if (!(key instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmHmac: key must be a Uint8Array');
                return false;
            }
            if (!(data instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmHmac: data must be a Uint8Array');
                return false;
            }
            const hashId = (hash === undefined || hash === null) ? _DEFAULT_HASH : hash;
            const outLen = _HASH_LENS[hashId];
            if (outLen === undefined) {
                console.error('[crypto] INVALID: wasmHmac: hash must be 256, 384, or 512');
                return false;
            }

            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                // load() already logged the cause.
                return false;
            }

            // alloc(0) may return 0 (null ptr); pass a 1-byte stand-in for
            // empty key/data while passing the real length to the WASM shim.
            const keyIn = wasmRuntime.withBytes(loaded, key.length ? key : new Uint8Array(1));
            const dataIn = wasmRuntime.withBytes(loaded, data.length ? data : new Uint8Array(1));
            const outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(outLen));
            try {
                const status = wasmRuntime.run(loaded, _FN, [
                    hashId,
                    keyIn.ptr, key.length,
                    dataIn.ptr, data.length,
                    outBuf.ptr,
                ]);
                if (status !== 0) {
                    console.error('[crypto] FAIL: wasmHmac.mac: hmac status ' + status);
                    return false;
                }
                // Copy the tag OUT of linear memory (never alias reused WASM memory).
                return wasmRuntime.readBytes(loaded, outBuf.ptr, outLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmHmac.mac: ' + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                dataIn.free();
                keyIn.free();
            }
        }

        /**
         * Constant-time HMAC verification.
         *
         * Recomputes the HMAC tag from `key`/`data` under the given `hash`,
         * then compares the result with `tag` in constant time. Returns `false`
         * when params are invalid, the binary cannot load, or the tags differ.
         *
         * @param {Uint8Array} key   Secret key.
         * @param {Uint8Array} tag   Expected HMAC tag.
         * @param {Uint8Array} data  Input message.
         * @param {256|384|512} [hash=256]  SHA-2 variant.
         * @returns {Promise<boolean>}
         */
        async function verify(key, tag, data, hash) {
            if (!(tag instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmHmac: tag must be a Uint8Array');
                return false;
            }
            const computed = await mac(key, data, hash);
            if (computed === false) {
                return false;
            }
            return _ctEqual(computed, tag);
        }

        return { isAvailable, mac, verify };
    },
};
