// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmSlhDsa` — WASM-backed SLH-DSA (FIPS 205) stateless
 * hash-based signatures, loaded through {@link module:wasmRuntime}.
 *
 * Opt-in accelerator for the pure-JS `slh_dsa` module: SLH-DSA is hashing-heavy
 * (deep WOTS/FORS/Merkle/hypertree recursion), so a near-native WASM core is a
 * large speedup over the JS reference. The 12 FIPS-205 parameter sets are
 * exposed by the SAME identifiers the pure-JS `slh_dsa` module uses
 * (`slh_dsa_{sha2,shake}_{128,192,256}{f,s}`) so the two surfaces are
 * interchangeable — see {@link SUPPORTED}.
 *
 * RE-SCOPED (BATCH_11 ERRATA-2, 2026-06-22): the binary is the colocated
 * `./slh_dsa.scalar.wasm` (vendored from `@awacloud/fw-wasm-crypto`), loaded BY NAME via
 * `wasmRuntime.load('slh_dsa', …)`. There is NO fw-local `slh_dsa.wasm.js`.
 * SLH-DSA is hash-bound (`simd:false` in the package manifest), so only the
 * scalar variant ships; the wrapper pins `{ variant: 'scalar' }`.
 *
 * ─── Frozen WASM ABI (from `@awacloud/fw-wasm-crypto` `targets.json` `slh_dsa`) ───
 *
 *   memory / alloc / free  — the canonical marshalling triple.
 *   rng_stage(srcPtr, n) -> i32   — stage the explicit entropy the OpenSSL core
 *                                   consumes (keygen: skSeed‖skPrf‖pkSeed = 3n;
 *                                   sign: addrnd = n bytes); 0 on success.
 *   rng_reset() -> void           — clear the staged-entropy seam.
 *   slhdsa_keygen(psId, pkPtr, skPtr) -> i32           — 0 = OK.
 *   slhdsa_sign(psId, skPtr, msgPtr, msgLen, ctxPtr, ctxLen, sigPtr, sigLenPtr)
 *       -> i32                                          — 0 = OK; sigLen (i32 LE)
 *                                                         written at sigLenPtr.
 *   slhdsa_verify(psId, pkPtr, sigPtr, sigLen, msgPtr, msgLen, ctxPtr, ctxLen)
 *       -> i32                                          — 0 = valid.
 *
 * `psId` is the small integer enum frozen by the package (SHA2 sets 0..5, SHAKE
 * sets 6..11; within each family the order is 128s,128f,192s,192f,256s,256f) —
 * mapped from the `paramSet` string by {@link SUPPORTED}. FIPS-205 context
 * wrapping (M' = 0x00 ‖ |ctx| ‖ ctx ‖ M, §10.2.1) is done INSIDE the shim, so
 * the wrapper passes `(msg, ctx)` straight through.
 *
 * Entropy seam: the OpenSSL FIPS-205 core takes keygen entropy / sign addrnd as
 * explicit arguments; the freestanding shim DRAINS the host-staged `rng_stage`
 * seam to obtain them. `keygen` cannot accept a seed argument under the
 * prescriptive API, so it stages fresh CSPRNG entropy; `sign` is deterministic
 * (addrnd = PK.seed = sk[2n..3n)), mirroring the pure-JS `extraEntropy:false`
 * path, which makes signatures byte-for-byte reproducible (KAT-checkable).
 *
 * No-throw contract: every async op resolves to a result or `false`, never
 * rejects (crypto README §1). Bytes are always copied OUT of linear memory.
 *
 * Worker-safe: pure factory; binary fetched by the package loader via the
 * runtime; ALL constants live INSIDE `factory()` so `factory.toString()`
 * captures no module-scope binding (`fw/no-factory-capture`).
 */

import { wasmRuntime } from './runtime.js';

/**
 * One artefact-size record for a parameter set.
 * @typedef {object} SlhDsaSizes
 * @property {number} psId   frozen ABI enum (0..11)
 * @property {number} n      security parameter (16 / 24 / 32)
 * @property {number} publicKey  public-key length (2n)
 * @property {number} secretKey  secret-key length (4n)
 * @property {number} signature  signature length
 */

/**
 * Public surface of `wasmSlhDsa.factory()`.
 * @typedef {object} WasmSlhDsaAPI
 * @property {() => boolean} isAvailable
 * @property {(paramSet: string) =>
 *   Promise<{publicKey: Uint8Array, secretKey: Uint8Array}|false>} keygen
 * @property {(secretKey: Uint8Array, message: Uint8Array, ctx?: Uint8Array,
 *   paramSet?: string) => Promise<Uint8Array|false>} sign
 * @property {(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array,
 *   ctx?: Uint8Array, paramSet?: string) => Promise<boolean>} verify
 */

export const wasmSlhDsa = {
    name: 'wasmSlhDsa',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').wasmRuntime} wasmRuntime  resolved runtime
     *   module instance (its factory's API).
     * @returns {WasmSlhDsaAPI}
     */
    factory(wasmRuntime) {

        // ── constants (inside the factory: fw/no-factory-capture) ──

        /** Package dist module name loaded BY NAME (no extension/path). */
        const MODULE = 'slh_dsa';

        /** SLH-DSA is hash-bound → scalar-only dist; pin the variant. */
        const VARIANT = 'scalar';

        /** Algo exports the runtime asserts on the frozen ABI handshake. */
        const EXPECTED = [
            'slhdsa_keygen',
            'slhdsa_sign',
            'slhdsa_verify',
            'rng_stage',
            'rng_reset',
        ];

        /** A `paramSet` string ctx must not exceed 255 bytes (FIPS 205 §10.2). */
        const MAX_CTX = 255;

        /** Default parameter set when `sign`/`verify` omit it (matches keygen). */
        const DEFAULT_PARAM_SET = 'slh_dsa_shake_128f';

        /**
         * Supported parameter sets, keyed by the SAME identifiers the pure-JS
         * `slh_dsa` module exposes. `psId` is the frozen ABI enum; sizes are
         * FIPS-205 (pk=2n, sk=4n; seed staged for keygen = 3n).
         * @type {Record<string, SlhDsaSizes>}
         */
        const SUPPORTED = {
            slh_dsa_sha2_128s:  { psId: 0,  n: 16, publicKey: 32, secretKey: 64,  signature: 7856  },
            slh_dsa_sha2_128f:  { psId: 1,  n: 16, publicKey: 32, secretKey: 64,  signature: 17088 },
            slh_dsa_sha2_192s:  { psId: 2,  n: 24, publicKey: 48, secretKey: 96,  signature: 16224 },
            slh_dsa_sha2_192f:  { psId: 3,  n: 24, publicKey: 48, secretKey: 96,  signature: 35664 },
            slh_dsa_sha2_256s:  { psId: 4,  n: 32, publicKey: 64, secretKey: 128, signature: 29792 },
            slh_dsa_sha2_256f:  { psId: 5,  n: 32, publicKey: 64, secretKey: 128, signature: 49856 },
            slh_dsa_shake_128s: { psId: 6,  n: 16, publicKey: 32, secretKey: 64,  signature: 7856  },
            slh_dsa_shake_128f: { psId: 7,  n: 16, publicKey: 32, secretKey: 64,  signature: 17088 },
            slh_dsa_shake_192s: { psId: 8,  n: 24, publicKey: 48, secretKey: 96,  signature: 16224 },
            slh_dsa_shake_192f: { psId: 9,  n: 24, publicKey: 48, secretKey: 96,  signature: 35664 },
            slh_dsa_shake_256s: { psId: 10, n: 32, publicKey: 64, secretKey: 128, signature: 29792 },
            slh_dsa_shake_256f: { psId: 11, n: 32, publicKey: 64, secretKey: 128, signature: 49856 },
        };

        /**
         * Whether the WASM tier is usable (delegates to the runtime).
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Load the SLH-DSA module handle (scalar). No-throw: `false` on failure.
         * @returns {Promise<import('./runtime.js').WasmLoaded|false>}
         */
        async function _load() {
            return wasmRuntime.load(MODULE, EXPECTED, { variant: VARIANT });
        }

        /**
         * Fill `len` bytes of fresh CSPRNG entropy. Uses the global Web Crypto
         * `getRandomValues` (the only entropy source available to a worker-safe
         * primitive without capturing an fw module).
         * @param {number} len
         * @returns {Uint8Array}
         */
        function _entropy(len) {
            const out = new Uint8Array(len);
            crypto.getRandomValues(out);
            return out;
        }

        /**
         * Stage `bytes` into the WASM entropy seam via `rng_stage`. Throws on a
         * non-zero status (caught by the caller's no-throw boundary).
         * @param {import('./runtime.js').WasmLoaded} h
         * @param {Uint8Array} bytes
         */
        function _stage(h, bytes) {
            const buf = wasmRuntime.withBytes(h, bytes);
            try {
                const rc = wasmRuntime.run(h, 'rng_stage', [buf.ptr, bytes.length]);
                if (rc !== 0) {
                    throw new Error(`rng_stage rc=${rc}`);
                }
            } finally {
                buf.free();
            }
        }

        /**
         * SLH-DSA.KeyGen. Stages fresh entropy (the prescriptive API exposes no
         * seed), then drives `slhdsa_keygen`. Copies pk/sk OUT.
         *
         * @param {string} paramSet  one of {@link SUPPORTED}'s identifiers.
         * @returns {Promise<{publicKey: Uint8Array, secretKey: Uint8Array}|false>}
         */
        async function keygen(paramSet) {
            const p = SUPPORTED[paramSet];
            if (!p) {
                return false;
            }
            const h = await _load();
            if (!h) {
                return false;
            }
            let pkOut;
            let skOut;
            try {
                wasmRuntime.run(h, 'rng_reset', []);
                _stage(h, _entropy(3 * p.n)); // skSeed ‖ skPrf ‖ pkSeed
                pkOut = wasmRuntime.withBytes(h, new Uint8Array(p.publicKey));
                skOut = wasmRuntime.withBytes(h, new Uint8Array(p.secretKey));
                const rc = wasmRuntime.run(h, 'slhdsa_keygen', [p.psId, pkOut.ptr, skOut.ptr]);
                if (rc !== 0) {
                    return false;
                }
                return {
                    publicKey: wasmRuntime.readBytes(h, pkOut.ptr, p.publicKey),
                    secretKey: wasmRuntime.readBytes(h, skOut.ptr, p.secretKey),
                };
            } catch (e) {
                console.error('[crypto] FAIL: wasmSlhDsa.keygen: ' + (e && e.message));
                return false;
            } finally {
                if (skOut) {
                    skOut.free();
                }
                if (pkOut) {
                    pkOut.free();
                }
            }
        }

        /**
         * SLH-DSA.Sign (deterministic: addrnd = PK.seed = sk[2n..3n), matching
         * the pure-JS `extraEntropy:false` path). Validates inputs, drives
         * `slhdsa_sign`, copies the signature OUT.
         *
         * @param {Uint8Array} secretKey
         * @param {Uint8Array} message
         * @param {Uint8Array} [ctx]  context string, ≤ 255 bytes (default empty).
         * @param {string} [paramSet]  default `slh_dsa_shake_128f`.
         * @returns {Promise<Uint8Array|false>}
         */
        async function sign(secretKey, message, ctx, paramSet) {
            const ps = paramSet || DEFAULT_PARAM_SET;
            const p = SUPPORTED[ps];
            if (!p) {
                return false;
            }
            if (!(secretKey instanceof Uint8Array) || secretKey.length !== p.secretKey) {
                return false;
            }
            if (!(message instanceof Uint8Array)) {
                return false;
            }
            const context = ctx || new Uint8Array(0);
            if (!(context instanceof Uint8Array) || context.length > MAX_CTX) {
                return false;
            }
            const h = await _load();
            if (!h) {
                return false;
            }
            let skIn;
            let msgIn;
            let ctxIn;
            let sigOut;
            let sigLenOut;
            try {
                // Deterministic addrnd = PK.seed = sk[2n .. 3n).
                const addrnd = secretKey.slice(2 * p.n, 3 * p.n);
                wasmRuntime.run(h, 'rng_reset', []);
                _stage(h, addrnd);

                skIn = wasmRuntime.withBytes(h, secretKey);
                // alloc(0) may return 0; pass a 1-byte placeholder for empty
                // inputs and a len of 0 so the shim reads nothing.
                msgIn = wasmRuntime.withBytes(h, message.length > 0 ? message : new Uint8Array(1));
                ctxIn = wasmRuntime.withBytes(h, context.length > 0 ? context : new Uint8Array(1));
                sigOut = wasmRuntime.withBytes(h, new Uint8Array(p.signature));
                sigLenOut = wasmRuntime.withBytes(h, new Uint8Array(4));

                const rc = wasmRuntime.run(h, 'slhdsa_sign', [
                    p.psId,
                    skIn.ptr,
                    msgIn.ptr,
                    message.length,
                    ctxIn.ptr,
                    context.length,
                    sigOut.ptr,
                    sigLenOut.ptr,
                ]);
                if (rc !== 0) {
                    return false;
                }
                const sigLen = new DataView(
                    wasmRuntime.readBytes(h, sigLenOut.ptr, 4).buffer,
                ).getInt32(0, true);
                if (sigLen !== p.signature) {
                    return false;
                }
                return wasmRuntime.readBytes(h, sigOut.ptr, p.signature);
            } catch (e) {
                console.error('[crypto] FAIL: wasmSlhDsa.sign: ' + (e && e.message));
                return false;
            } finally {
                if (sigLenOut) {
                    sigLenOut.free();
                }
                if (sigOut) {
                    sigOut.free();
                }
                if (ctxIn) {
                    ctxIn.free();
                }
                if (msgIn) {
                    msgIn.free();
                }
                if (skIn) {
                    skIn.free();
                }
            }
        }

        /**
         * SLH-DSA.Verify. Returns `true` only when the WASM core reports a valid
         * signature (status 0); any validation failure / error → `false`.
         *
         * @param {Uint8Array} publicKey
         * @param {Uint8Array} signature
         * @param {Uint8Array} message
         * @param {Uint8Array} [ctx]  context string, ≤ 255 bytes (default empty).
         * @param {string} [paramSet]  default `slh_dsa_shake_128f`.
         * @returns {Promise<boolean>}
         */
        async function verify(publicKey, signature, message, ctx, paramSet) {
            const ps = paramSet || DEFAULT_PARAM_SET;
            const p = SUPPORTED[ps];
            if (!p) {
                return false;
            }
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== p.publicKey) {
                return false;
            }
            if (!(signature instanceof Uint8Array) || signature.length !== p.signature) {
                return false;
            }
            if (!(message instanceof Uint8Array)) {
                return false;
            }
            const context = ctx || new Uint8Array(0);
            if (!(context instanceof Uint8Array) || context.length > MAX_CTX) {
                return false;
            }
            const h = await _load();
            if (!h) {
                return false;
            }
            let pkIn;
            let sigIn;
            let msgIn;
            let ctxIn;
            try {
                pkIn = wasmRuntime.withBytes(h, publicKey);
                sigIn = wasmRuntime.withBytes(h, signature);
                msgIn = wasmRuntime.withBytes(h, message.length > 0 ? message : new Uint8Array(1));
                ctxIn = wasmRuntime.withBytes(h, context.length > 0 ? context : new Uint8Array(1));
                const rc = wasmRuntime.run(h, 'slhdsa_verify', [
                    p.psId,
                    pkIn.ptr,
                    sigIn.ptr,
                    signature.length,
                    msgIn.ptr,
                    message.length,
                    ctxIn.ptr,
                    context.length,
                ]);
                return rc === 0;
            } catch (e) {
                console.error('[crypto] FAIL: wasmSlhDsa.verify: ' + (e && e.message));
                return false;
            } finally {
                if (ctxIn) {
                    ctxIn.free();
                }
                if (msgIn) {
                    msgIn.free();
                }
                if (sigIn) {
                    sigIn.free();
                }
                if (pkIn) {
                    pkIn.free();
                }
            }
        }

        return { isAvailable, keygen, sign, verify };
    },
};
