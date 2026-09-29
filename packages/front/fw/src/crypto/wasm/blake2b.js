// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmBlake2b` — WASM-SIMD BLAKE2b (RFC 7693) accelerator.
 *
 * BLAKE2b is not in WebCrypto; this wrapper is the opt-in WASM tier for
 * the pure-JS [`blake2b`](../hash/blake2b.js) module. The binary ships both
 * SIMD and scalar variants (`blake2b.simd.wasm` / `blake2b.scalar.wasm`) and
 * is loaded BY NAME through {@link wasmRuntime} which auto-selects the fastest
 * variant the host can validate (`supportsSimd()`). No fw-local `blake2b.wasm.js`
 * is created — the bytes are colocated (`./blake2b.{simd,scalar}.wasm`), vendored from `@awacloud/fw-wasm-crypto`.
 *
 * Supports:
 *   - Unkeyed digest: `outLen ∈ [1,64]` bytes (default 64).
 *   - Keyed mode (MAC): `key.length ∈ [1,64]`.
 *   - Optional `salt` and `personalisation` (≤ 16 bytes each), per the
 *     BLAKE2 parameter block (RFC 7693 §2.8).
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `blake2b`) ───
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports:
 *
 *   blake2b(
 *     inPtr,  inLen,
 *     keyPtr, keyLen,
 *     saltPtr,
 *     personalPtr,
 *     outPtr, outLen
 *   ) -> i32    // 0 = OK, -1 = bad params (outLen out of [1,64], keyLen > 64)
 *
 * `saltPtr` / `personalPtr` may be 0 (null pointer) to use zero-filled
 * 16-byte fields (the BLAKE2 default). Each must be exactly 16 bytes when
 * supplied; the shim fills any short suffix automatically via the param block
 * copy (pointer arithmetic). The output digest is written to `outPtr` (outLen
 * bytes) in little-endian BLAKE2b byte order.
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Options for {@link WasmBlake2bAPI.hash}.
 * @typedef {object} WasmBlake2bOpts
 * @property {number}     [outLen=64]  Output digest length in bytes [1..64].
 * @property {Uint8Array} [key]        Optional key for keyed/MAC mode (0..64 bytes).
 * @property {Uint8Array} [salt]       Optional 16-byte salt (BLAKE2 param block).
 * @property {Uint8Array} [personal]   Optional 16-byte personalisation string.
 */

/**
 * Public surface of `wasmBlake2b.factory()`.
 * @typedef {object} WasmBlake2bAPI
 * @property {() => boolean} isAvailable
 *   Whether `WebAssembly` is present in this environment.
 * @property {(data: Uint8Array, opts?: WasmBlake2bOpts) => Promise<Uint8Array|false>} hash
 *   BLAKE2b digest. Resolves `false` on bad params or a WASM failure; never
 *   rejects.
 */

import { wasmRuntime } from './runtime.js';

export const wasmBlake2b = {
    name: 'wasmBlake2b',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmBlake2bAPI}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────
        const _MODULE = 'blake2b';
        const _FN = 'blake2b';
        const _EXPECTED = ['blake2b'];
        // `blake2b` ships BOTH simd and scalar (simd:true in targets.json).
        // Use the DEFAULT load — the loader auto-selects simd when available.
        const _LOAD_OPTS = undefined;

        // Digest length ∈ [1, 64] per RFC 7693 §2.
        const _MIN_OUT = 1;
        const _MAX_OUT = 64;
        // Key length ∈ [0, 64] per RFC 7693 §2.
        const _MAX_KEY = 64;
        // Salt and personalisation fields are exactly 16 bytes each (RFC 7693 §2.8).
        const _PARAM_FIELD = 16;

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Compute a BLAKE2b digest.
         *
         * @param {Uint8Array} data   Message to hash.
         * @param {WasmBlake2bOpts}  [opts]  Digest options.
         * @returns {Promise<Uint8Array|false>}
         */
        async function hash(data, opts) {
            if (!(data instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmBlake2b: data must be a Uint8Array');
                return false;
            }

            // ── param validation ──────────────────────────────────────────────
            const outLen = (opts && opts.outLen != null) ? opts.outLen : _MAX_OUT;
            const key    = (opts && opts.key) ? opts.key : new Uint8Array(0);
            const salt   = (opts && opts.salt) ? opts.salt : null;
            const personal = (opts && opts.personal) ? opts.personal : null;

            if (!(outLen >= _MIN_OUT && outLen <= _MAX_OUT)) {
                console.error('[crypto] INVALID: wasmBlake2b: outLen must be in [1,64], got ' + outLen);
                return false;
            }
            if (!(key instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmBlake2b: key must be a Uint8Array');
                return false;
            }
            if (key.length > _MAX_KEY) {
                console.error('[crypto] INVALID: wasmBlake2b: key.length must be ≤ 64');
                return false;
            }
            if (salt != null) {
                if (!(salt instanceof Uint8Array)) {
                    console.error('[crypto] INVALID: wasmBlake2b: salt must be a Uint8Array');
                    return false;
                }
                if (salt.length > _PARAM_FIELD) {
                    console.error('[crypto] INVALID: wasmBlake2b: salt.length must be ≤ 16');
                    return false;
                }
            }
            if (personal != null) {
                if (!(personal instanceof Uint8Array)) {
                    console.error('[crypto] INVALID: wasmBlake2b: personal must be a Uint8Array');
                    return false;
                }
                if (personal.length > _PARAM_FIELD) {
                    console.error('[crypto] INVALID: wasmBlake2b: personal.length must be ≤ 16');
                    return false;
                }
            }

            // ── load binary ──────────────────────────────────────────────────
            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                // load() already logged the cause.
                return false;
            }

            // ── marshal inputs ───────────────────────────────────────────────
            // alloc(0) may return 0; pass a 1-byte stand-in so the pointer is
            // non-null while the WASM side honours the real length (0).
            const dataIn  = wasmRuntime.withBytes(loaded, data.length  ? data  : new Uint8Array(1));
            const keyIn   = wasmRuntime.withBytes(loaded, key.length   ? key   : new Uint8Array(1));

            // Salt / personal: 16-byte param-block fields. Pad short values
            // with zero bytes; use a null pointer (0) when absent (the shim
            // keeps the zero-initialised field from blake2b_param_init).
            let saltBuf = null;
            let persBuf = null;
            if (salt != null) {
                const padded = new Uint8Array(_PARAM_FIELD);
                padded.set(salt);
                saltBuf = wasmRuntime.withBytes(loaded, padded);
            }
            if (personal != null) {
                const padded = new Uint8Array(_PARAM_FIELD);
                padded.set(personal);
                persBuf = wasmRuntime.withBytes(loaded, padded);
            }

            const out = wasmRuntime.withBytes(loaded, new Uint8Array(outLen));
            try {
                const status = wasmRuntime.run(loaded, _FN, [
                    dataIn.ptr,  data.length,
                    keyIn.ptr,   key.length,
                    saltBuf  ? saltBuf.ptr  : 0,
                    persBuf  ? persBuf.ptr  : 0,
                    out.ptr, outLen,
                ]);
                if (status !== 0) {
                    console.error('[crypto] FAIL: wasmBlake2b.hash: blake2b status ' + status);
                    return false;
                }
                // Copy the digest OUT of linear memory (never alias reused memory).
                return wasmRuntime.readBytes(loaded, out.ptr, outLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmBlake2b.hash: ' + (e && e.message));
                return false;
            } finally {
                out.free();
                if (persBuf) persBuf.free();
                if (saltBuf) saltBuf.free();
                keyIn.free();
                dataIn.free();
            }
        }

        return { isAvailable, hash };
    },
};
