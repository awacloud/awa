// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmPbkdf2` — WASM PBKDF2 (RFC 8018 §5.2 / RFC 2898), Tier-2 fallback.
 *
 * Wraps the colocated `pbkdf2` binary (vendored from `@awacloud/fw-wasm-crypto`) through
 * {@link wasmRuntime} to expose PBKDF2-HMAC-SHA-256/384/512 key derivation as
 * an async, `Uint8Array`, no-throw primitive.
 *
 * This is the **Tier-2 fallback** for PBKDF2: the primary path is
 * `crypto/webcrypto/pbkdf2` (WebCrypto `deriveBits`, hardware-backed in secure
 * contexts). This module is useful when `crypto.subtle` is unavailable
 * (non-secure-context, locked-down workers) or when higher throughput is needed
 * at large iteration counts (WASM C23 inner loop).
 *
 * The `pbkdf2` target is **scalar-only** (`simd:false` in targets.json — PBKDF2
 * has no SIMD benefit: its inner loop is sequential HMAC compression passes).
 * There is no `pbkdf2.simd.wasm`; `wasmPbkdf2` forces `{ variant: 'scalar' }`
 * to prevent the runtime's default simd selection from attempting to fetch a
 * non-existent file.
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `pbkdf2`) ───
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports one
 * entry point:
 *
 *   pbkdf2(
 *     hashId: i32,         // 256 = HMAC-SHA-256 | 384 = HMAC-SHA-384 | 512 = HMAC-SHA-512
 *     pwdPtr: i32, pwdLen: i32,    // password bytes in linear memory
 *     saltPtr: i32, saltLen: i32,  // salt bytes in linear memory
 *     iters: i32,          // iteration count (must be ≥ 1)
 *     outPtr: i32, outLen: i32     // caller-allocated output buffer + dkLen
 *   ) -> i32               // 0 = OK; -1 (WC_EBADPARAM) = bad hashId / iters ≤ 0 / outLen ≤ 0
 *
 * The output buffer is pre-allocated by the caller; the shim writes exactly
 * `outLen` bytes to `outPtr`. `pwdLen` may be 0 (empty password is valid per
 * RFC 8018); `saltLen` may be 0 (not recommended but not rejected by the ABI).
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Public surface of `wasmPbkdf2.factory()`.
 * @typedef {object} WasmPbkdf2API
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(password: Uint8Array, salt: Uint8Array, dkLen: number, iterations?: number, hash?: 256|384|512) => Promise<Uint8Array|false>} deriveBits
 *   Derive `dkLen` bytes via PBKDF2-HMAC-SHA-{256|384|512}. Resolves
 *   `false` on invalid params, load failure, or WASM error — never rejects.
 */

import { wasmRuntime } from './runtime.js';

export const wasmPbkdf2 = {
    name: 'wasmPbkdf2',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmPbkdf2API}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────

        /** Module name as shipped by `@awacloud/fw-wasm-crypto`. */
        const _MODULE = 'pbkdf2';

        /** Expected exports beyond the ABI triple (`memory`/`alloc`/`free`). */
        const _EXPECTED = ['pbkdf2'];

        /** The single exported function name. */
        const _FN = 'pbkdf2';

        /**
         * The `pbkdf2` target is SCALAR-ONLY (`simd:false` in targets.json).
         * There is no `pbkdf2.simd.wasm`; force scalar variant to avoid the
         * runtime's default simd selection fetching a non-existent file.
         * @type {import('./runtime.js').WasmLoadOptions}
         */
        const _LOAD_OPTS = { variant: 'scalar' };

        /**
         * Default iteration count (OWASP 2023 recommendation for PBKDF2-HMAC-SHA-256
         * password storage). SP 800-132 §5.3 minimum is 1000.
         */
        const _DEFAULT_ITERATIONS = 600000;

        /** Supported hashId values (correspond to HMAC-SHA-N for N-bit SHA-2). */
        const _VALID_HASH_IDS = [256, 384, 512];

        // ── helpers ──────────────────────────────────────────────────────────

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * PBKDF2 key derivation via the colocated `pbkdf2` binary.
         *
         * Implements RFC 8018 §5.2 PBKDF2 with the HMAC-SHA-{256|384|512} PRF.
         * The inner HMAC loop runs in the WASM C23 reactor — near-native speed
         * at large iteration counts, with no heap allocation on the JS side.
         *
         * No-throw: any failure (invalid params, binary unavailable, WASM error)
         * resolves to `false` with a `console.error` log entry.
         *
         * @param {Uint8Array} password   Passphrase bytes (empty is valid).
         * @param {Uint8Array} salt       Salt bytes (empty is valid; ≥ 16 recommended).
         * @param {number} dkLen          Desired derived key length in bytes (≥ 1).
         * @param {number} [iterations]   Iteration count ≥ 1 (default: 600000).
         * @param {256|384|512} [hash]    PRF selector (default: 256 = HMAC-SHA-256).
         * @returns {Promise<Uint8Array|false>}
         */
        async function deriveBits(password, salt, dkLen, iterations, hash) {

            // ── parameter validation ─────────────────────────────────────────
            if (!(password instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmPbkdf2: password must be a Uint8Array');
                return false;
            }
            if (!(salt instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmPbkdf2: salt must be a Uint8Array');
                return false;
            }

            const iters = (iterations === undefined || iterations === null)
                ? _DEFAULT_ITERATIONS
                : iterations;
            if (typeof iters !== 'number' || !Number.isInteger(iters) || iters < 1) {
                console.error('[crypto] INVALID: wasmPbkdf2: iterations must be an integer ≥ 1');
                return false;
            }

            if (typeof dkLen !== 'number' || !Number.isInteger(dkLen) || dkLen < 1) {
                console.error('[crypto] INVALID: wasmPbkdf2: dkLen must be an integer ≥ 1');
                return false;
            }

            const hashId = (hash === undefined || hash === null) ? 256 : hash;
            if (!_VALID_HASH_IDS.includes(hashId)) {
                console.error('[crypto] INVALID: wasmPbkdf2: hash must be 256, 384, or 512');
                return false;
            }

            // ── load binary ──────────────────────────────────────────────────
            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                // load() already logged the cause.
                return false;
            }

            // ── marshal inputs into WASM linear memory ───────────────────────
            //
            // alloc(0) may return 0 (null ptr) in the bump allocator; pass a
            // 1-byte stand-in for empty password/salt so the pointer is non-null,
            // while handing the real length (0) to the shim.
            const pwdIn  = wasmRuntime.withBytes(loaded, password.length ? password : new Uint8Array(1));
            const saltIn = wasmRuntime.withBytes(loaded, salt.length ? salt : new Uint8Array(1));
            // Pre-allocate the output buffer inside WASM memory.
            const outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(dkLen));

            try {
                const status = wasmRuntime.run(loaded, _FN, [
                    hashId,
                    pwdIn.ptr,  password.length,
                    saltIn.ptr, salt.length,
                    iters,
                    outBuf.ptr, dkLen,
                ]);
                if (status !== 0) {
                    console.error(
                        '[crypto] FAIL: wasmPbkdf2.deriveBits: pbkdf2(hashId=' +
                        hashId + ') status ' + status,
                    );
                    return false;
                }
                // Copy the derived key OUT of linear memory into a fresh Uint8Array.
                // Never return a view aliasing reused WASM memory.
                return wasmRuntime.readBytes(loaded, outBuf.ptr, dkLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmPbkdf2.deriveBits: ' + (e && e.message));
                return false;
            } finally {
                // Free in reverse allocation order.
                outBuf.free();
                saltIn.free();
                pwdIn.free();
            }
        }

        return { isAvailable, deriveBits };
    },
};
