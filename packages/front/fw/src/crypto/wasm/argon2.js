// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmArgon2` — WASM-SIMD-loaded Argon2id (RFC 9106), the
 * memory-hard password-hashing / KDF accelerator.
 *
 * Argon2id is the highest-ROI WASM target in the `crypto/wasm/*` family: it is
 * **not** in WebCrypto, and pure JS is painfully slow because the algorithm is
 * deliberately memory-hard (it fills and re-reads a large block matrix). This
 * wrapper loads the colocated `argon2` binary (vendored from `@awacloud/fw-wasm-crypto`) through
 * {@link wasmRuntime} and exposes an async, `Uint8Array`, no-throw surface that
 * mirrors the pure-JS [`argon2`](../hash/argon2.js) module's Argon2id output.
 *
 * Only **Argon2id** (RFC 9106, type=2, v=0x13) is exposed — Argon2d / Argon2i
 * are intentionally absent (the pure-JS module already refuses them). The
 * binary is **scalar** (`simd:false`): the memory-hard fill dominates, so SIMD
 * buys nothing here — the runtime still loads it by name through the same path.
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `argon2`) ───
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports:
 *
 *   argon2id_hash(
 *     pwdPtr, pwdLen, saltPtr, saltLen, secretPtr, secretLen, adPtr, adLen,
 *     t, m, p, outPtr, outLen
 *   ) -> i32        // 0 = OK, negative = bad params / internal error
 *
 * where `t` = passes (timeCost), `m` = memory in KiB, `p` = lanes
 * (parallelism). The tag is written to `outPtr` (`outLen` bytes).
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Tuning + optional-input parameters for {@link WasmArgon2API.hash}.
 * @typedef {object} WasmArgon2Options
 * @property {number} timeCost     Passes `t` (≥ 1).
 * @property {number} memoryKiB    Memory cost `m` in KiB (≥ 8·parallelism).
 * @property {number} parallelism  Lanes `p` (≥ 1).
 * @property {number} hashLen      Output tag length in bytes (4 .. 2^32-1).
 * @property {Uint8Array} [secret] Optional key `K`.
 * @property {Uint8Array} [ad]     Optional associated data `X`.
 */

/**
 * Public surface of `wasmArgon2.factory()`.
 * @typedef {object} WasmArgon2API
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(password: Uint8Array, salt: Uint8Array, opts: WasmArgon2Options) => Promise<Uint8Array|false>} hash
 *   Argon2id tag of `hashLen` bytes, or `false` on invalid params / failure.
 * @property {(password: Uint8Array, salt: Uint8Array, expected: Uint8Array, opts: WasmArgon2Options) => Promise<boolean>} verify
 *   `hash(...)` then constant-time compare against `expected`.
 */

import { wasmRuntime } from './runtime.js';

export const wasmArgon2 = {
    name: 'wasmArgon2',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmArgon2API}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────
        const _MODULE = 'argon2';
        const _FN = 'argon2id_hash';
        const _EXPECTED = ['argon2id_hash'];
        // The `argon2` target ships SCALAR ONLY (`simd:false` in
        // fw-wasm-crypto/targets.json — the memory-hard fill dominates, so SIMD
        // buys nothing, OQ-3). There is no `argon2.simd.wasm`, so the binary is
        // loaded with the variant forced to scalar; the runtime's default
        // simd-vs-scalar selection would otherwise fetch a non-existent file.
        /** @type {import('./runtime.js').WasmLoadOptions} */
        const _LOAD_OPTS = { variant: 'scalar' };
        // hashLen ∈ [4, 2^32-1] per RFC 9106 §3.1.
        const _MIN_HASH_LEN = 4;
        const _MAX_HASH_LEN = 0xffffffff;

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Validate the tuning parameters against RFC 9106 §3.1. Logs
         * `[crypto] INVALID` and returns `false` on the first violation.
         * @param {WasmArgon2Options} opts
         * @returns {boolean}
         */
        function _validate(opts) {
            if (!opts) {
                console.error('[crypto] INVALID: wasmArgon2: options required');
                return false;
            }
            const { timeCost, memoryKiB, parallelism, hashLen } = opts;
            if (!(timeCost >= 1)) {
                console.error('[crypto] INVALID: wasmArgon2: timeCost must be ≥ 1');
                return false;
            }
            if (!(parallelism >= 1)) {
                console.error('[crypto] INVALID: wasmArgon2: parallelism must be ≥ 1');
                return false;
            }
            if (!(memoryKiB >= 8 * parallelism)) {
                console.error('[crypto] INVALID: wasmArgon2: memoryKiB must be ≥ 8·parallelism');
                return false;
            }
            if (!(hashLen >= _MIN_HASH_LEN && hashLen <= _MAX_HASH_LEN)) {
                console.error('[crypto] INVALID: wasmArgon2: hashLen must be in [4, 2^32-1]');
                return false;
            }
            return true;
        }

        /**
         * Compute an Argon2id tag.
         *
         * @param {Uint8Array} password
         * @param {Uint8Array} salt
         * @param {WasmArgon2Options} opts
         * @returns {Promise<Uint8Array|false>}
         */
        async function hash(password, salt, opts) {
            if (!(password instanceof Uint8Array) || !(salt instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmArgon2: password and salt must be Uint8Array');
                return false;
            }
            if (!_validate(opts)) {
                return false;
            }

            const secret = opts.secret || new Uint8Array(0);
            const ad = opts.ad || new Uint8Array(0);
            if (!(secret instanceof Uint8Array) || !(ad instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmArgon2: secret and ad must be Uint8Array');
                return false;
            }
            const hashLen = opts.hashLen;

            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                // load() already logged the cause.
                return false;
            }

            // alloc(0) may return 0; pass a 1-byte stand-in so the pointer is
            // non-null while the WASM side honors the real length (0).
            const pwdIn = wasmRuntime.withBytes(loaded, password.length ? password : new Uint8Array(1));
            const saltIn = wasmRuntime.withBytes(loaded, salt.length ? salt : new Uint8Array(1));
            const secIn = wasmRuntime.withBytes(loaded, secret.length ? secret : new Uint8Array(1));
            const adIn = wasmRuntime.withBytes(loaded, ad.length ? ad : new Uint8Array(1));
            const out = wasmRuntime.withBytes(loaded, new Uint8Array(hashLen));
            try {
                const status = wasmRuntime.run(loaded, _FN, [
                    pwdIn.ptr, password.length,
                    saltIn.ptr, salt.length,
                    secIn.ptr, secret.length,
                    adIn.ptr, ad.length,
                    opts.timeCost, opts.memoryKiB, opts.parallelism,
                    out.ptr, hashLen,
                ]);
                if (status !== 0) {
                    console.error('[crypto] FAIL: wasmArgon2.hash: argon2id_hash status ' + status);
                    return false;
                }
                // Copy the tag OUT of linear memory (never alias reused memory).
                return wasmRuntime.readBytes(loaded, out.ptr, hashLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmArgon2.hash: ' + (e && e.message));
                return false;
            } finally {
                out.free();
                adIn.free();
                secIn.free();
                saltIn.free();
                pwdIn.free();
            }
        }

        /**
         * Constant-time equality over two byte arrays. Always scans the full
         * length of `a`; a length mismatch short-circuits to `false` (length is
         * not secret) but still ORs a sentinel so the result is unambiguous.
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
         * Verify a password against an expected Argon2id tag.
         *
         * @param {Uint8Array} password
         * @param {Uint8Array} salt
         * @param {Uint8Array} expected
         * @param {WasmArgon2Options} opts
         * @returns {Promise<boolean>}
         */
        async function verify(password, salt, expected, opts) {
            if (!(expected instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmArgon2: expected must be Uint8Array');
                return false;
            }
            const tag = await hash(password, salt, opts);
            if (tag === false) {
                return false;
            }
            return _ctEqual(tag, expected);
        }

        return { isAvailable, hash, verify };
    },
};
