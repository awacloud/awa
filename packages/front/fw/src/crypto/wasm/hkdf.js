// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmHkdf` — WASM HKDF (RFC 5869), Tier-2 fallback.
 *
 * Wraps the colocated `hkdf` binary (vendored from `@awacloud/fw-wasm-crypto`) through
 * {@link wasmRuntime} to expose combined HKDF extract+expand over
 * HMAC-SHA-256/384/512 as an async, `Uint8Array`, no-throw primitive.
 * This is the WASM-tier Tier-2 fallback for environments where
 * `crypto.subtle` is unavailable (non-secure contexts, locked-down workers);
 * prefer the WebCrypto module ({@link webcryptoHkdf}) in secure contexts.
 *
 * The binary ships as `hkdf.scalar.wasm` ONLY (`"simd": false` in
 * targets.json). `{ variant: 'scalar' }` is passed explicitly to
 * `wasmRuntime.load` because `selectVariant` defaults to `simd` with no
 * automatic scalar fallback.
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `hkdf`) ───
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports:
 *
 *   hkdf(hashId, ikmPtr, ikmLen, saltPtr, saltLen,
 *        infoPtr, infoLen, outPtr, outLen) -> i32
 *     hashId: 256 → HKDF-SHA-256, 384 → HKDF-SHA-384, 512 → HKDF-SHA-512.
 *     Returns 0 on success; -1 (WC_EBADPARAM) for bad hashId, outLen ≤ 0,
 *     or outLen > 255*HashLen; -2 (WC_EFAIL) for internal expand failure.
 *     ikmLen/saltLen/infoLen == 0 are valid (RFC 5869 §2.2 / §2.3 allow them).
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Public surface of `wasmHkdf.factory()`.
 * @typedef {object} WasmHkdfAPI
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, dkLen: number, hash?: 256|384|512) => Promise<Uint8Array|false>} deriveBits
 *   Derive `dkLen` bytes of output keying material (combined extract+expand,
 *   RFC 5869). `hash` defaults to `256`. Empty `salt`/`info` are allowed.
 *   Returns `false` if WebAssembly is unavailable, the binary fails to load,
 *   or any argument is invalid.
 */

import { wasmRuntime } from './runtime.js';

export const wasmHkdf = {
    name: 'wasmHkdf',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmHkdfAPI}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────

        /** Module name as shipped by `@awacloud/fw-wasm-crypto`. */
        const _MODULE = 'hkdf';

        /** Expected exports beyond the ABI triple (`memory`/`alloc`/`free`). */
        const _EXPECTED = ['hkdf'];

        /** The single exported function name. */
        const _FN = 'hkdf';

        /**
         * hkdf is scalar-only (`"simd": false` in targets.json).
         * Explicitly pin `{ variant: 'scalar' }` — `selectVariant` defaults to
         * `simd` with no automatic fallback, so omitting this would cause
         * `load` to reject (no `hkdf.simd.wasm` in dist).
         * @type {import('./runtime.js').WasmLoadOptions}
         */
        const _LOAD_OPTS = { variant: 'scalar' };

        /**
         * Supported hash ID → hash output length in bytes.
         * Only SHA-2 variants are supported (SHA-1 / SHA-3 are not).
         */
        const _HASH_LEN = { 256: 32, 384: 48, 512: 64 };

        // ── API ──────────────────────────────────────────────────────────────

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Derive `dkLen` bytes of output keying material using HKDF
         * (RFC 5869 combined extract+expand) over HMAC-SHA-{hash}.
         *
         * Empty `salt` is valid: RFC 5869 §2.2 specifies that a zero-length
         * salt is replaced by a string of `HashLen` zero bytes inside the
         * WASM shim. Empty `info` is valid per RFC 5869 §2.3.
         *
         * @param {Uint8Array} ikm     Input keying material.
         * @param {Uint8Array} salt    Optional salt (empty Uint8Array allowed).
         * @param {Uint8Array} info    Optional context/application info (empty allowed).
         * @param {number}     dkLen  Desired output length in bytes; must be ≥ 1
         *                             and ≤ 255 * hashLen.
         * @param {256|384|512} [hash=256]  Underlying SHA-2 hash strength.
         * @returns {Promise<Uint8Array|false>}
         */
        async function deriveBits(ikm, salt, info, dkLen, hash) {
            const hashId = hash !== undefined ? hash : 256;

            // ── input validation (resolve false, not throw) ──────────────────
            if (!(ikm instanceof Uint8Array)) {
                return false;
            }
            if (!(salt instanceof Uint8Array)) {
                return false;
            }
            if (!(info instanceof Uint8Array)) {
                return false;
            }

            const hashLen = _HASH_LEN[hashId];
            if (hashLen === undefined) {
                return false;
            }

            if (!(dkLen >= 1)) {
                return false;
            }
            if (dkLen > 255 * hashLen) {
                return false;
            }

            // ── load the WASM binary ──────────────────────────────────────────
            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                return false;
            }

            // ── marshal inputs + output into linear memory ────────────────────
            // For zero-length inputs the shim still expects a valid pointer;
            // pass a 1-byte stand-in while sending the true length (0) to the
            // ABI — the shim treats it as empty per RFC 5869.
            const ikmBuf  = wasmRuntime.withBytes(loaded, ikm.length  ? ikm  : new Uint8Array(1));
            const saltBuf = wasmRuntime.withBytes(loaded, salt.length ? salt : new Uint8Array(1));
            const infoBuf = wasmRuntime.withBytes(loaded, info.length ? info : new Uint8Array(1));
            const outBuf  = wasmRuntime.withBytes(loaded, new Uint8Array(dkLen));
            try {
                const status = wasmRuntime.run(loaded, _FN, [
                    hashId,
                    ikmBuf.ptr,  ikm.length,
                    saltBuf.ptr, salt.length,
                    infoBuf.ptr, info.length,
                    outBuf.ptr,  dkLen,
                ]);
                if (status !== 0) {
                    console.error(
                        '[crypto] FAIL: wasmHkdf: hkdf(hashId=' + hashId + ') status ' + status,
                    );
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, dkLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmHkdf: ' + (e && e.message));
                return false;
            } finally {
                outBuf.free();
                infoBuf.free();
                saltBuf.free();
                ikmBuf.free();
            }
        }

        return { isAvailable, deriveBits };
    },
};
