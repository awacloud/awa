// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmSha2` — WASM SHA-256/384/512 (FIPS 180-4), Tier-2 fallback.
 *
 * Wraps the colocated `sha2` binary (vendored from `@awacloud/fw-wasm-crypto`) through
 * {@link wasmRuntime} to expose SHA-256, SHA-384, and SHA-512 one-shot digests
 * as async, `Uint8Array`, no-throw primitives.
 *
 * This is the **Tier-2 fallback** for environments where `crypto.subtle` is
 * unavailable (non-secure-context, locked-down workers). In secure contexts
 * prefer `webcrypto/digest` which is hardware-accelerated. The pure-JS
 * `sha256`/`sha384`/`sha512` modules remain the universal default.
 *
 * The `sha2` binary ships ONLY `sha2.scalar.wasm` (`simd: false` in
 * targets.json — SHA-2 SIMD gain is marginal). `{ variant: 'scalar' }` is
 * passed explicitly to `rt.load` because wasmRuntime's `selectVariant()`
 * defaults to simd and has no automatic scalar fallback; omitting the pin
 * would cause a load failure on the missing `sha2.simd.wasm`.
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `sha2`) ───
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports:
 *
 *   sha2(variantId: i32, inPtr: i32, inLen: i32, outPtr: i32) -> i32
 *     // 0 = OK; -1 (WC_EBADPARAM) = unknown variantId
 *
 * `variantId` selects the algorithm:
 *
 *   256 = SHA-256  (32-byte digest, FIPS 180-4)
 *   384 = SHA-384  (48-byte digest, FIPS 180-4)
 *   512 = SHA-512  (64-byte digest, FIPS 180-4)
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Public surface of `wasmSha2.factory()`.
 * @typedef {object} WasmSha2API
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha256  32-byte digest (FIPS 180-4 SHA-256).
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha384  48-byte digest (FIPS 180-4 SHA-384).
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha512  64-byte digest (FIPS 180-4 SHA-512).
 */

import { wasmRuntime } from './runtime.js';

export const wasmSha2 = {
    name: 'wasmSha2',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmSha2API}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────

        /** Module name as shipped by `@awacloud/fw-wasm-crypto`. */
        const _MODULE = 'sha2';

        /** Expected exports beyond the ABI triple (`memory`/`alloc`/`free`). */
        const _EXPECTED = ['sha2'];

        /** The single exported function name. */
        const _FN = 'sha2';

        /**
         * sha2 ships simd:false → only sha2.scalar.wasm exists.
         * Must pin variant:'scalar' explicitly because selectVariant() defaults
         * to simd and has no automatic fallback; omitting the pin causes a load
         * failure on the missing sha2.simd.wasm.
         * @type {import('./runtime.js').WasmLoadOptions}
         */
        const _LOAD_OPTS = { variant: 'scalar' };

        /** variantId constants (passed as the first argument to the sha2 export). */
        const _SHA256_ID = 256;
        const _SHA384_ID = 384;
        const _SHA512_ID = 512;

        /** Output byte lengths indexed by variantId. */
        const _DIGEST_LEN = {
            256: 32,
            384: 48,
            512: 64,
        };

        // ── helpers ──────────────────────────────────────────────────────────

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Core one-shot SHA-2 digest over the `sha2(variantId, ...)` ABI.
         * Allocates input + output buffers in linear memory, calls the WASM
         * entry, reads the output out (fresh copy), then frees both buffers.
         *
         * @param {number} variantId  256 | 384 | 512
         * @param {Uint8Array} data
         * @param {number} outLen  digest byte length for this variant
         * @returns {Promise<Uint8Array|false>}
         */
        async function _hash(variantId, data, outLen) {
            if (!(data instanceof Uint8Array)) {
                return false;
            }

            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                return false;
            }

            // alloc(0) may return 0 (null ptr); pass a 1-byte stand-in for
            // empty messages while passing the real length (0) to the shim.
            const inBuf = wasmRuntime.withBytes(loaded, data.length ? data : new Uint8Array(1));
            const outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(outLen));
            try {
                const status = wasmRuntime.run(loaded, _FN, [
                    variantId, inBuf.ptr, data.length, outBuf.ptr,
                ]);
                if (status !== 0) {
                    console.error(
                        '[crypto] FAIL: wasmSha2: sha2(variantId=' + variantId + ') status ' + status,
                    );
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, outLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmSha2: ' + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                inBuf.free();
            }
        }

        // ── SHA-2 digest variants ────────────────────────────────────────────

        /**
         * SHA-256: 32-byte digest (FIPS 180-4 §6.2).
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha256(data) {
            return _hash(_SHA256_ID, data, _DIGEST_LEN[_SHA256_ID]);
        }

        /**
         * SHA-384: 48-byte digest (FIPS 180-4 §6.5).
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha384(data) {
            return _hash(_SHA384_ID, data, _DIGEST_LEN[_SHA384_ID]);
        }

        /**
         * SHA-512: 64-byte digest (FIPS 180-4 §6.4).
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha512(data) {
            return _hash(_SHA512_ID, data, _DIGEST_LEN[_SHA512_ID]);
        }

        return { isAvailable, sha256, sha384, sha512 };
    },
};
