// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmX25519` — WASM X25519 key agreement (RFC 7748), Tier-2
 * fallback for environments where `crypto.subtle` lacks X25519 or is
 * unavailable (non-secure-context, locked-down workers).
 *
 * A thin, opt-in accelerator over the colocated `x25519` binary (vendored from
 * `@awacloud/fw-wasm-crypto`: libsodium curve25519 ref10 closure, impl-struct-direct,
 * no runtime dispatcher), loaded BY NAME through the fw `wasmRuntime` adapter
 * (BATCH_11 ERRATA-2: no fw-local `.wasm.js`). Provides keygen + X25519 scalar
 * multiplication (shared secret derivation) over `Uint8Array`, async, no-throw.
 *
 * This is the **Tier-2 fallback** for environments where `crypto.subtle` is
 * unavailable. In secure contexts prefer `webcrypto/x25519`, which is
 * hardware-accelerated. The pure-JS `pkc/x25519` remains the universal default.
 *
 * ─── Key encodings ───
 *
 *   - `secretKey`: raw 32-byte scalar (X25519 wire format, RFC 7748 §5).
 *     The curve clamps internally — the caller-supplied scalar is passed through
 *     as-is and the binary applies the RFC 7748 clamping (clear low 3 bits,
 *     clear high bit, set bit 254) before the Montgomery ladder.
 *   - `publicKey`: raw 32-byte u-coordinate on Curve25519 (the x-coordinate in
 *     Montgomery form, little-endian, RFC 7748 §5).
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto/targets.json` target `x25519`) ───
 *
 *   memory / alloc(size)->ptr / free(ptr)         the canonical triple
 *   x25519_base(skPtr, pkPtr) -> i32              0=OK, derives pk = scalar·G
 *   x25519(skPtr, pkPtr, outPtr) -> i32           0=OK, non-zero if all-zero output
 *
 *   NO rng seam — X25519 has no keygen entropy draw in the binary; the JS layer
 *   draws entropy from `crypto.getRandomValues` and passes the scalar directly.
 *
 * The `x25519` binary ships ONLY `x25519.scalar.wasm` (`simd: false` in
 * targets.json — ref10 is scalar, no simd128 lane). `{ variant: 'scalar' }` is
 * passed explicitly to `rt.load` because `wasmRuntime.selectVariant()` defaults
 * to simd with no automatic fallback; omitting the pin would fail the load on
 * the missing `x25519.simd.wasm`.
 *
 * No-throw contract (crypto README §1): every async member resolves to a result
 * or `false`, never rejects. `deriveBits` resolves `false` (not throw) on any
 * invalid input, all-zero output (small-subgroup), or internal failure.
 *
 * Worker-safe: pure factory, no DOM; `crypto.getRandomValues` and `WebAssembly`
 * exist in workers. ALL constants live INSIDE `factory()` so the serialized
 * closure carries no captured binding (`fw/no-factory-capture`).
 */

import { wasmRuntime } from './runtime.js';

/**
 * Key pair returned by `keygen`.
 * @typedef {{ publicKey: Uint8Array, secretKey: Uint8Array }} WasmX25519KeyPair
 */

/**
 * Public surface of `wasmX25519.factory()`.
 * @typedef {object} WasmX25519API
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(secretKey?: Uint8Array) => Promise<WasmX25519KeyPair|false>} keygen
 *   Generate an X25519 key pair. Draws 32 bytes from `crypto.getRandomValues`
 *   when `secretKey` is omitted; the provided `secretKey` MUST be 32 bytes.
 *   The 32-byte public key (u-coordinate) is derived via `x25519_base(sk, pk)`.
 *   Returns the scalar as `secretKey` (clamping is applied by the binary).
 * @property {(secretKey: Uint8Array, publicKey: Uint8Array) => Promise<Uint8Array|false>} deriveBits
 *   X25519 scalar multiplication — shared secret. Returns the 32-byte output or
 *   `false` when lengths are wrong, the result is all-zero (small-subgroup /
 *   low-order public key), or any internal failure.
 */

export const wasmX25519 = {
    name: 'wasmX25519',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime  the fw WASM adapter.
     * @returns {WasmX25519API}
     */
    factory(wasmRuntime) {

        // ── constants (inside the factory; fw/no-factory-capture) ──────────

        /** Package dist module name loaded BY NAME through the runtime. */
        const _MODULE = 'x25519';

        /** Algorithm exports the wrapper requires (beyond memory/alloc/free). */
        const _EXPORTS = ['x25519_base', 'x25519'];

        /**
         * x25519 ships simd:false → only x25519.scalar.wasm exists. The variant
         * pin is mandatory: selectVariant() defaults to simd with no fallback.
         * @type {import('./runtime.js').WasmLoadOptions}
         */
        const _LOAD_OPTS = { variant: 'scalar' };

        /** Key length in bytes (RFC 7748 §5: both scalar and u-coordinate = 32). */
        const _KEY_LEN = 32;

        // ── helpers ────────────────────────────────────────────────────────

        /**
         * Load the package `x25519` module by name (scalar variant) through
         * the runtime.
         * @returns {Promise<import('./runtime.js').WasmLoaded|false>}
         */
        function _load() {
            return wasmRuntime.load(_MODULE, _EXPORTS, _LOAD_OPTS);
        }

        // ── public API ─────────────────────────────────────────────────────

        /**
         * Whether `WebAssembly` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Generate an X25519 key pair. When `secretKey` is omitted, 32 random
         * bytes are drawn from `crypto.getRandomValues`. Derives the 32-byte
         * public key (u-coordinate) by calling `x25519_base(sk, pk)` — i.e.
         * scalar-multiply against the standard basepoint (u=9).
         *
         * The secret scalar is returned as-is; the binary applies RFC 7748
         * clamping internally on each operation.
         *
         * @param {Uint8Array} [secretKey]  optional 32-byte secret scalar
         * @returns {Promise<WasmX25519KeyPair|false>}
         */
        async function keygen(secretKey) {
            let sk;
            if (secretKey === undefined) {
                sk = crypto.getRandomValues(new Uint8Array(_KEY_LEN));
            } else {
                if (!(secretKey instanceof Uint8Array) || secretKey.length !== _KEY_LEN) {
                    console.error('[crypto] INVALID: wasmX25519.keygen: secretKey must be 32 bytes');
                    return false;
                }
                sk = secretKey;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let skBuf;
            let pkBuf;
            try {
                skBuf = wasmRuntime.withBytes(loaded, sk);
                pkBuf = wasmRuntime.withBytes(loaded, new Uint8Array(_KEY_LEN));
                const rc = wasmRuntime.run(loaded, 'x25519_base', [skBuf.ptr, pkBuf.ptr]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmX25519.keygen rc=${rc}`);
                    return false;
                }
                return {
                    publicKey: wasmRuntime.readBytes(loaded, pkBuf.ptr, _KEY_LEN),
                    secretKey: new Uint8Array(sk),
                };
            } catch (e) {
                console.error('[crypto] FAIL: wasmX25519.keygen: ' + (e && e.message));
                return false;
            } finally {
                if (pkBuf) {
                    pkBuf.free();
                }
                if (skBuf) {
                    skBuf.free();
                }
            }
        }

        /**
         * X25519 scalar multiplication — derive the 32-byte shared secret from
         * this side's `secretKey` and the peer's `publicKey`. Calls
         * `x25519(sk, pk, out)` on the binary.
         *
         * Returns `false` when:
         * - either key is not a `Uint8Array` of exactly 32 bytes
         * - the WASM entry returns non-zero (all-zero shared secret, i.e. the
         *   public key is a low-order / small-subgroup point)
         * - `WebAssembly` is unavailable or the binary fails to load
         * - any internal error
         *
         * @param {Uint8Array} secretKey  32-byte secret scalar
         * @param {Uint8Array} publicKey  32-byte peer u-coordinate
         * @returns {Promise<Uint8Array|false>}
         */
        async function deriveBits(secretKey, publicKey) {
            if (!(secretKey instanceof Uint8Array) || secretKey.length !== _KEY_LEN) {
                console.error('[crypto] INVALID: wasmX25519.deriveBits: secretKey must be 32 bytes');
                return false;
            }
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== _KEY_LEN) {
                console.error('[crypto] INVALID: wasmX25519.deriveBits: publicKey must be 32 bytes');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let skBuf;
            let pkBuf;
            let outBuf;
            try {
                skBuf = wasmRuntime.withBytes(loaded, secretKey);
                pkBuf = wasmRuntime.withBytes(loaded, publicKey);
                outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(_KEY_LEN));
                const rc = wasmRuntime.run(loaded, 'x25519', [skBuf.ptr, pkBuf.ptr, outBuf.ptr]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmX25519.deriveBits rc=${rc} (all-zero / small-subgroup)`);
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, _KEY_LEN);
            } catch (e) {
                console.error('[crypto] FAIL: wasmX25519.deriveBits: ' + (e && e.message));
                return false;
            } finally {
                if (outBuf) {
                    outBuf.free();
                }
                if (pkBuf) {
                    pkBuf.free();
                }
                if (skBuf) {
                    skBuf.free();
                }
            }
        }

        return { isAvailable, keygen, deriveBits };
    },
};
