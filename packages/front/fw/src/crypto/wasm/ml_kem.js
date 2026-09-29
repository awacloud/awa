// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmMlKem` — WASM-SIMD ML-KEM (FIPS 203) key encapsulation.
 *
 * Opt-in WASM accelerator for the pure-JS [`ml_kem`](../pkc/ml_kem.js) module.
 * A thin async wrapper over the colocated `ml_kem` binary (vendored from `@awacloud/fw-wasm-crypto`),
 * loaded BY NAME through {@link wasmRuntime} (BATCH_11 ERRATA: there is NO
 * fw-local `ml_kem.wasm.js`; the bytes are colocated
 * (`./ml_kem.{simd,scalar}.wasm`, vendored from the package build). Implements FIPS 203 (CRYSTALS-Kyber) for
 * the three parameter sets ML-KEM-512 / 768 / 1024.
 *
 * Post-quantum KEM — NOT covered by WebCrypto. The large lattice / NTT inner
 * loops are where WASM-SIMD beats pure JS, so this is the primary accelerator
 * for the algorithm (see the BATCH_11 priority rationale, group A).
 *
 * ─── No-throw async contract ───
 *
 * Every operation is `async` and resolves to its result or `false`; it never
 * rejects (crypto README §1). All WASM interaction is inside a `try/catch`
 * whose `catch` maps to `false`, and every linear-memory allocation is released
 * in a `finally`.
 *
 * ─── Staged-entropy ABI ───
 *
 * The package's `ml_kem` shim is built with the FIPS-203 *derandomized* API:
 * `mlkem_keygen`/`mlkem_encaps` consume their randomness from a host-staged
 * buffer (the `rng_stage`/`rng_reset` seam), not from an internal CSPRNG. The
 * wrapper therefore stages fresh `crypto.getRandomValues` bytes (64 for keygen
 * `d || z`, 32 for encaps `m`) immediately before each call. `mlkem_decaps`
 * consumes no entropy. `crypto` is a known fw global (same source used by the
 * `random` module); no `random` dependency is taken per the ERRATA.
 *
 * Worker-safe: pure factory; `WebAssembly` + `crypto` exist in workers; the
 * binary is fetched by the package loader inside `wasmRuntime`. ALL constants
 * live inside `factory()` (`fw/no-factory-capture`); the `wasmRuntime` import
 * below is referenced only by the `deps` metadata array, never by the factory
 * body (which receives it as a parameter).
 */

import { wasmRuntime } from './runtime.js';

/**
 * One of the three ML-KEM parameter sets (FIPS 203 Table 2).
 * @typedef {512 | 768 | 1024} MlKemParamSet
 */

/**
 * Public surface of `wasmMlKem.factory()`.
 * @typedef {object} WasmMlKemAPI
 * @property {() => boolean} isAvailable  Whether the WASM runtime is available.
 * @property {(paramSet?: MlKemParamSet) => Promise<{publicKey: Uint8Array, secretKey: Uint8Array}|false>} keygen
 *   ML-KEM.KeyGen → encapsulation key (`publicKey`) + decapsulation key
 *   (`secretKey`), or `false` on an invalid param set / failure.
 * @property {(publicKey: Uint8Array, paramSet?: MlKemParamSet) => Promise<{ciphertext: Uint8Array, sharedSecret: Uint8Array}|false>} encaps
 *   ML-KEM.Encaps → `ciphertext` + 32-byte `sharedSecret`, or `false`.
 * @property {(secretKey: Uint8Array, ciphertext: Uint8Array, paramSet?: MlKemParamSet) => Promise<Uint8Array|false>} decaps
 *   ML-KEM.Decaps → 32-byte shared secret (implicit reject on a tampered
 *   ciphertext: returns a pseudo-random secret, never `false`), or `false` on
 *   an invalid param set / length.
 */

export const wasmMlKem = {
    name: 'wasmMlKem',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmMlKemAPI}
     */
    factory(wasmRuntime) {

        // ── Constants (inside factory: fw/no-factory-capture) ───────────────

        /** Package dist module name, loaded BY NAME via the runtime. */
        const _WASM_MODULE = 'ml_kem';

        /** Algorithm exports this wrapper binds to (beyond memory/alloc/free). */
        const _EXPORTS = [
            'mlkem_keygen',
            'mlkem_encaps',
            'mlkem_decaps',
            'rng_stage',
            'rng_reset',
        ];

        /** Level-independent shared-secret length (FIPS 203). */
        const _SS = 32;

        /** Staged-entropy sizes (FIPS 203 derandomized API). */
        const _KEYGEN_COINS = 64; // d || z
        const _ENCAPS_COINS = 32; // m

        /**
         * Per-parameter-set frozen ABI enum + key-material byte sizes
         * (FIPS 203 Table 2/3). `ps` is the C-shim enum (0/1/2). `ek` is the
         * encapsulation key (publicKey), `dk` the full FIPS-203 decapsulation
         * key (secretKey), `ct` the ciphertext.
         */
        const _PARAMS = {
            512: { ps: 0, ek: 800, dk: 1632, ct: 768 },
            768: { ps: 1, ek: 1184, dk: 2400, ct: 1088 },
            1024: { ps: 2, ek: 1568, dk: 3168, ct: 1568 },
        };

        /** Default parameter set (NIST PQC Level 3). */
        const _DEFAULT = 768;

        // ── helpers ─────────────────────────────────────────────────────────

        /**
         * Resolve and validate a parameter set; `undefined` → default.
         * @param {MlKemParamSet|undefined} paramSet
         * @returns {{ps: number, ek: number, dk: number, ct: number}|null}
         */
        function _param(paramSet) {
            const p = paramSet === undefined ? _DEFAULT : paramSet;
            return Object.prototype.hasOwnProperty.call(_PARAMS, p)
                ? _PARAMS[p]
                : null;
        }

        /**
         * Stage `n` fresh CSPRNG bytes into the module's seam so the next
         * derandomized keygen/encaps call drains real entropy. Resets the seam
         * first so a prior staging never bleeds in.
         * @param {import('./runtime.js').WasmLoaded} h
         * @param {number} n
         * @throws if `rng_stage` reports a non-zero status.
         */
        function _stageRandom(h, n) {
            const coins = new Uint8Array(n);
            crypto.getRandomValues(coins);
            wasmRuntime.run(h, 'rng_reset', []);
            const buf = wasmRuntime.withBytes(h, coins);
            try {
                const rc = wasmRuntime.run(h, 'rng_stage', [buf.ptr, buf.len]);
                if (rc !== 0) {
                    throw new Error('wasmMlKem: rng_stage status ' + rc);
                }
            } finally {
                buf.free();
            }
        }

        /**
         * Load the `ml_kem` binary handle (by name) with the required exports.
         * @returns {Promise<import('./runtime.js').WasmLoaded|false>}
         */
        function _load() {
            return wasmRuntime.load(_WASM_MODULE, _EXPORTS);
        }

        // ── public API ──────────────────────────────────────────────────────

        /**
         * Whether the WASM runtime (and thus this accelerator) is available.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * ML-KEM.KeyGen. Stages 64 fresh CSPRNG bytes (`d || z`), then runs the
         * derandomized `mlkem_keygen`. No-throw: resolves `false` on an invalid
         * param set, an unavailable binary, or any failure.
         * @param {MlKemParamSet} [paramSet]
         * @returns {Promise<{publicKey: Uint8Array, secretKey: Uint8Array}|false>}
         */
        async function keygen(paramSet) {
            const P = _param(paramSet);
            if (!P) {
                console.warn('[crypto] INVALID: wasmMlKem.keygen: bad paramSet');
                return false;
            }
            const h = await _load();
            if (!h) {
                return false;
            }
            let ekBuf;
            let dkBuf;
            try {
                _stageRandom(h, _KEYGEN_COINS);
                ekBuf = wasmRuntime.withBytes(h, new Uint8Array(P.ek));
                dkBuf = wasmRuntime.withBytes(h, new Uint8Array(P.dk));
                const rc = wasmRuntime.run(h, 'mlkem_keygen', [P.ps, ekBuf.ptr, dkBuf.ptr]);
                if (rc !== 0) {
                    console.error('[crypto] FAIL: wasmMlKem.keygen status ' + rc);
                    return false;
                }
                return {
                    publicKey: wasmRuntime.readBytes(h, ekBuf.ptr, P.ek),
                    secretKey: wasmRuntime.readBytes(h, dkBuf.ptr, P.dk),
                };
            } catch (e) {
                console.error('[crypto] FAIL: wasmMlKem.keygen: ' + (e && e.message));
                return false;
            } finally {
                if (dkBuf) { dkBuf.free(); }
                if (ekBuf) { ekBuf.free(); }
            }
        }

        /**
         * ML-KEM.Encaps. Validates the encapsulation-key length, stages 32 fresh
         * CSPRNG bytes (`m`), then runs the derandomized `mlkem_encaps`.
         * No-throw: resolves `false` on a bad param set / key length / failure.
         * @param {Uint8Array} publicKey
         * @param {MlKemParamSet} [paramSet]
         * @returns {Promise<{ciphertext: Uint8Array, sharedSecret: Uint8Array}|false>}
         */
        async function encaps(publicKey, paramSet) {
            const P = _param(paramSet);
            if (!P) {
                console.warn('[crypto] INVALID: wasmMlKem.encaps: bad paramSet');
                return false;
            }
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== P.ek) {
                console.warn('[crypto] INVALID: wasmMlKem.encaps: wrong publicKey length');
                return false;
            }
            const h = await _load();
            if (!h) {
                return false;
            }
            let ekBuf;
            let ctBuf;
            let ssBuf;
            try {
                _stageRandom(h, _ENCAPS_COINS);
                ekBuf = wasmRuntime.withBytes(h, publicKey);
                ctBuf = wasmRuntime.withBytes(h, new Uint8Array(P.ct));
                ssBuf = wasmRuntime.withBytes(h, new Uint8Array(_SS));
                const rc = wasmRuntime.run(h, 'mlkem_encaps', [P.ps, ekBuf.ptr, ctBuf.ptr, ssBuf.ptr]);
                if (rc !== 0) {
                    console.error('[crypto] FAIL: wasmMlKem.encaps status ' + rc);
                    return false;
                }
                return {
                    ciphertext: wasmRuntime.readBytes(h, ctBuf.ptr, P.ct),
                    sharedSecret: wasmRuntime.readBytes(h, ssBuf.ptr, _SS),
                };
            } catch (e) {
                console.error('[crypto] FAIL: wasmMlKem.encaps: ' + (e && e.message));
                return false;
            } finally {
                if (ssBuf) { ssBuf.free(); }
                if (ctBuf) { ctBuf.free(); }
                if (ekBuf) { ekBuf.free(); }
            }
        }

        /**
         * ML-KEM.Decaps. Validates the decapsulation-key + ciphertext lengths,
         * then runs `mlkem_decaps` (consumes no entropy). On a tampered
         * ciphertext the FIPS-203 implicit reject returns a pseudo-random
         * 32-byte secret (NOT `false`) — the caller must not distinguish.
         * No-throw: resolves `false` only on a bad param set / length / failure.
         * @param {Uint8Array} secretKey
         * @param {Uint8Array} ciphertext
         * @param {MlKemParamSet} [paramSet]
         * @returns {Promise<Uint8Array|false>}
         */
        async function decaps(secretKey, ciphertext, paramSet) {
            const P = _param(paramSet);
            if (!P) {
                console.warn('[crypto] INVALID: wasmMlKem.decaps: bad paramSet');
                return false;
            }
            if (!(secretKey instanceof Uint8Array) || secretKey.length !== P.dk) {
                console.warn('[crypto] INVALID: wasmMlKem.decaps: wrong secretKey length');
                return false;
            }
            if (!(ciphertext instanceof Uint8Array) || ciphertext.length !== P.ct) {
                console.warn('[crypto] INVALID: wasmMlKem.decaps: wrong ciphertext length');
                return false;
            }
            const h = await _load();
            if (!h) {
                return false;
            }
            let dkBuf;
            let ctBuf;
            let ssBuf;
            try {
                dkBuf = wasmRuntime.withBytes(h, secretKey);
                ctBuf = wasmRuntime.withBytes(h, ciphertext);
                ssBuf = wasmRuntime.withBytes(h, new Uint8Array(_SS));
                const rc = wasmRuntime.run(h, 'mlkem_decaps', [P.ps, dkBuf.ptr, ctBuf.ptr, ssBuf.ptr]);
                if (rc !== 0) {
                    console.error('[crypto] FAIL: wasmMlKem.decaps status ' + rc);
                    return false;
                }
                return wasmRuntime.readBytes(h, ssBuf.ptr, _SS);
            } catch (e) {
                console.error('[crypto] FAIL: wasmMlKem.decaps: ' + (e && e.message));
                return false;
            } finally {
                if (ssBuf) { ssBuf.free(); }
                if (ctBuf) { ctBuf.free(); }
                if (dkBuf) { dkBuf.free(); }
            }
        }

        return { isAvailable, keygen, encaps, decaps };
    },
};
