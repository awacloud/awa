// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmSha3` — WASM-SIMD SHA-3 / SHAKE (FIPS 202) accelerator.
 *
 * Wraps the colocated `sha3` binary (vendored from `@awacloud/fw-wasm-crypto`) through
 * {@link wasmRuntime} to expose SHA3-224/256/384/512 and SHAKE128/256
 * (XOF) as async, `Uint8Array`, no-throw primitives. This is the
 * WASM-accelerated tier for algorithms WebCrypto does not cover (Keccak
 * permutation); the pure-JS {@link sha3} module stays the universal default.
 *
 * The binary ships BOTH `sha3.simd.wasm` and `sha3.scalar.wasm` (targets.json
 * `"simd": true`). The runtime auto-selects the SIMD variant when the host
 * validates simd128, scalar otherwise — no `{ variant }` pin is needed here.
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `sha3`) ───
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports one
 * entry point:
 *
 *   sha3(variantId: i32, inPtr: i32, inLen: i32, outPtr: i32, outLen: i32)
 *     -> i32   // 0 = OK; -1 (WC_EBADPARAM) = unknown variantId
 *
 * `variantId` selects the hash function and its rate/capacity/domain suffix:
 *
 *   0 = SHA3-224  (28-byte digest, rate 144, domain 0x06)
 *   1 = SHA3-256  (32-byte digest, rate 136, domain 0x06)
 *   2 = SHA3-384  (48-byte digest, rate 104, domain 0x06)
 *   3 = SHA3-512  (64-byte digest, rate  72, domain 0x06)
 *   4 = SHAKE128  (XOF,           rate 168, domain 0x1F)
 *   5 = SHAKE256  (XOF,           rate 136, domain 0x1F)
 *
 * For SHA3 (fixed-digest) the shim ignores `outLen` and writes the implied
 * digest size. For SHAKE, the caller supplies `outLen` and the shim squeezes
 * exactly that many bytes.
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Public surface of `wasmSha3.factory()`.
 * @typedef {object} WasmSha3API
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha3_224  28-byte digest.
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha3_256  32-byte digest.
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha3_384  48-byte digest.
 * @property {(data: Uint8Array) => Promise<Uint8Array|false>} sha3_512  64-byte digest.
 * @property {(data: Uint8Array, outLen: number) => Promise<Uint8Array|false>} shake128  XOF; `outLen` bytes.
 * @property {(data: Uint8Array, outLen: number) => Promise<Uint8Array|false>} shake256  XOF; `outLen` bytes.
 */

import { wasmRuntime } from './runtime.js';

export const wasmSha3 = {
    name: 'wasmSha3',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmSha3API}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────

        /** Module name as shipped by `@awacloud/fw-wasm-crypto`. */
        const _MODULE = 'sha3';

        /** Expected exports beyond the ABI triple (`memory`/`alloc`/`free`). */
        const _EXPECTED = ['sha3'];

        /** The single exported function name. */
        const _FN = 'sha3';

        /**
         * variantId → fixed output length in bytes (SHA3 only).
         * SHAKE variants use caller-supplied `outLen`.
         */
        const _DIGEST = [28, 32, 48, 64, 0, 0]; // indices 0-5

        /** variantId constants. */
        const _SHA3_224 = 0;
        const _SHA3_256 = 1;
        const _SHA3_384 = 2;
        const _SHA3_512 = 3;
        const _SHAKE128 = 4;
        const _SHAKE256 = 5;

        // sha3 ships simd:true → both sha3.simd.wasm and sha3.scalar.wasm exist.
        // The default load (no variant pin) auto-selects simd when the host
        // validates simd128, scalar otherwise.
        const _LOAD_OPTS = undefined;

        // ── helpers ──────────────────────────────────────────────────────────

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Core one-shot hash over the `sha3(variantId, ...)` ABI.
         * Allocates input + output buffers in linear memory, calls the WASM
         * entry, reads the output out (fresh copy), then frees both buffers.
         *
         * @param {number} variantId
         * @param {Uint8Array} data
         * @param {number} outLen
         * @returns {Promise<Uint8Array|false>}
         */
        async function _hash(variantId, data, outLen) {
            if (!(data instanceof Uint8Array)) {
                return false;
            }
            if (!(outLen > 0)) {
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
                    variantId, inBuf.ptr, data.length, outBuf.ptr, outLen,
                ]);
                if (status !== 0) {
                    console.error(
                        '[crypto] FAIL: wasmSha3: sha3(variantId=' + variantId + ') status ' + status,
                    );
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, outLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmSha3: ' + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                inBuf.free();
            }
        }

        // ── SHA3 fixed-digest variants ────────────────────────────────────────

        /**
         * SHA3-224: 28-byte digest (FIPS 202 §6.1).
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha3_224(data) {
            return _hash(_SHA3_224, data, _DIGEST[_SHA3_224]);
        }

        /**
         * SHA3-256: 32-byte digest (FIPS 202 §6.1).
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha3_256(data) {
            return _hash(_SHA3_256, data, _DIGEST[_SHA3_256]);
        }

        /**
         * SHA3-384: 48-byte digest (FIPS 202 §6.1).
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha3_384(data) {
            return _hash(_SHA3_384, data, _DIGEST[_SHA3_384]);
        }

        /**
         * SHA3-512: 64-byte digest (FIPS 202 §6.1).
         * @param {Uint8Array} data
         * @returns {Promise<Uint8Array|false>}
         */
        function sha3_512(data) {
            return _hash(_SHA3_512, data, _DIGEST[_SHA3_512]);
        }

        // ── SHAKE XOF variants ────────────────────────────────────────────────

        /**
         * SHAKE128 XOF: exactly `outLen` output bytes (FIPS 202 §6.2).
         * @param {Uint8Array} data
         * @param {number} outLen  must be > 0
         * @returns {Promise<Uint8Array|false>}
         */
        function shake128(data, outLen) {
            return _hash(_SHAKE128, data, outLen);
        }

        /**
         * SHAKE256 XOF: exactly `outLen` output bytes (FIPS 202 §6.2).
         * @param {Uint8Array} data
         * @param {number} outLen  must be > 0
         * @returns {Promise<Uint8Array|false>}
         */
        function shake256(data, outLen) {
            return _hash(_SHAKE256, data, outLen);
        }

        return { isAvailable, sha3_224, sha3_256, sha3_384, sha3_512, shake128, shake256 };
    },
};
