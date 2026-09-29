// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmMlDsa` — WASM-SIMD ML-DSA (FIPS 204) lattice signatures.
 *
 * A thin, opt-in accelerator over the colocated `ml_dsa` binary (vendored from
 * `@awacloud/fw-wasm-crypto`: PQClean ml-dsa-{44,65,87}), loaded BY NAME through the fw
 * `wasmRuntime` adapter (BATCH_11 ERRATA: no fw-local `.wasm.js`). Post-quantum
 * Module-Lattice-based Digital Signature Algorithm — the algorithm WebCrypto
 * does NOT cover. Mirrors the pure-JS `crypto/pkc/ml_dsa` surface
 * (keygen/sign/verify over `Uint8Array`), async, no-throw.
 *
 * ─── ABI (frozen by `@awacloud/fw-wasm-crypto/targets.json` `ml_dsa`) ───
 *
 *   memory / alloc(size)->ptr / free(ptr)              the canonical triple
 *   rng_reset() -> void                                clear the staged-entropy seam
 *   rng_stage(srcPtr, n) -> i32                        stage n bytes of entropy
 *   mldsa_keygen(ps, pkPtr, skPtr) -> i32              0 = OK
 *   mldsa_sign(ps, skPtr, msgPtr, msgLen, ctxPtr, ctxLen, sigPtr, sigLenPtr) -> i32
 *   mldsa_verify(ps, pkPtr, sigPtr, sigLen, msgPtr, msgLen, ctxPtr, ctxLen) -> i32
 *                                                      0 = valid signature
 *
 * The PQClean keygen/sign consume their FIPS-204 randomness through the staged
 * `rng_stage` seam: a caller stages the seed (keygen) or the per-signature `rnd`
 * (sign) right before the call. Deterministic signing = stage 32 zero bytes
 * (FIPS 204 "hedged with zero entropy"); a random keypair stages 32 bytes drawn
 * from `crypto.getRandomValues`.
 *
 * No-throw contract (crypto README §1): every async member resolves to a result
 * or `false`/`false`-equivalent, never rejects. `isAvailable()` mirrors
 * `wasmRuntime.isAvailable()`.
 *
 * Worker-safe: pure factory, no DOM; `crypto.getRandomValues` and `WebAssembly`
 * exist in workers. All constants live INSIDE `factory()` so the serialized
 * closure carries no captured binding (`fw/no-factory-capture`).
 */

import { wasmRuntime } from './runtime.js';

/**
 * Public surface of `wasmMlDsa.factory()`.
 * @typedef {object} WasmMlDsaAPI
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(paramSet?: (44|65|87)) => Promise<{publicKey: Uint8Array, secretKey: Uint8Array}|false>} keygen
 *   ML-DSA.KeyGen — fresh random key pair for the parameter set.
 * @property {(secretKey: Uint8Array, message: Uint8Array, ctx?: Uint8Array, paramSet?: (44|65|87)) => Promise<Uint8Array|false>} sign
 *   ML-DSA.Sign (hedged by default; `ctx` ≤ 255 bytes).
 * @property {(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array, ctx?: Uint8Array, paramSet?: (44|65|87)) => Promise<boolean>} verify
 *   ML-DSA.Verify.
 */

export const wasmMlDsa = {
    name: 'wasmMlDsa',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').wasmRuntime} wasmRuntime  the fw WASM adapter.
     * @returns {WasmMlDsaAPI}
     */
    factory(wasmRuntime) {

        // ── constants (inside the factory; fw/no-factory-capture) ──────────

        /** Package dist module name loaded BY NAME through the runtime. */
        const _MODULE = 'ml_dsa';

        /** Algorithm exports the wrapper requires (beyond memory/alloc/free). */
        const _EXPORTS = [
            'mldsa_keygen',
            'mldsa_sign',
            'mldsa_verify',
            'rng_stage',
            'rng_reset',
        ];

        /** FIPS-204 per-call randomness length (seed for keygen, rnd for sign). */
        const _RND_BYTES = 32;

        /** Max ML-DSA context-string length (FIPS 204 §5.2 / §5.4). */
        const _MAX_CTX = 255;

        /**
         * Per-parameter-set ABI enum + FIPS-204 key-material sizes (bytes).
         * `ps` is the frozen `mldsa_*` enum argument (0/1/2).
         */
        const _PARAMS = {
            44: { ps: 0, pk: 1312, sk: 2560, sig: 2420 },
            65: { ps: 1, pk: 1952, sk: 4032, sig: 3309 },
            87: { ps: 2, pk: 2592, sk: 4896, sig: 4627 },
        };

        /** Default parameter set (plan: ML-DSA-65). */
        const _DEFAULT = 65;

        // ── helpers ────────────────────────────────────────────────────────

        /**
         * Resolve a parameter-set descriptor, or `null` when invalid.
         * @param {number} paramSet
         * @returns {{ps:number, pk:number, sk:number, sig:number}|null}
         */
        function _resolveParams(paramSet) {
            const p = paramSet === undefined ? _DEFAULT : paramSet;
            return Object.prototype.hasOwnProperty.call(_PARAMS, p)
                ? _PARAMS[p]
                : null;
        }

        /**
         * Load the package `ml_dsa` module by name through the runtime.
         * @returns {Promise<import('./runtime.js').WasmLoaded|false>}
         */
        function _load() {
            return wasmRuntime.load(_MODULE, _EXPORTS);
        }

        /**
         * Stage `bytes` of entropy into the binary's seam: `rng_reset()` then
         * `rng_stage(ptr, len)`. Throws on a non-zero `rng_stage` status (the
         * caller's try/catch maps it to the no-throw `false`).
         * @param {import('./runtime.js').WasmLoaded} loaded
         * @param {Uint8Array} bytes
         */
        function _stageEntropy(loaded, bytes) {
            wasmRuntime.run(loaded, 'rng_reset', []);
            const buf = wasmRuntime.withBytes(loaded, bytes);
            try {
                const rc = wasmRuntime.run(loaded, 'rng_stage', [buf.ptr, bytes.length]);
                if (rc !== 0) {
                    throw new Error(`rng_stage failed (rc=${rc})`);
                }
            } finally {
                buf.free();
            }
        }

        /**
         * Read a little-endian i32 written by the binary at `ptr`.
         * @param {import('./runtime.js').WasmLoaded} loaded
         * @param {number} ptr
         * @returns {number}
         */
        function _readI32(loaded, ptr) {
            const bytes = wasmRuntime.readBytes(loaded, ptr, 4);
            return new DataView(bytes.buffer).getInt32(0, true);
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
         * ML-DSA.KeyGen — generate a fresh random key pair. Stages 32 bytes
         * from `crypto.getRandomValues` as the FIPS-204 keygen seed.
         * @param {44|65|87} [paramSet]
         * @returns {Promise<{publicKey: Uint8Array, secretKey: Uint8Array}|false>}
         */
        async function keygen(paramSet) {
            const P = _resolveParams(paramSet);
            if (!P) {
                console.error('[crypto] INVALID: wasmMlDsa.keygen: bad paramSet');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let pkBuf;
            let skBuf;
            try {
                const seed = crypto.getRandomValues(new Uint8Array(_RND_BYTES));
                _stageEntropy(loaded, seed);
                pkBuf = wasmRuntime.withBytes(loaded, new Uint8Array(P.pk));
                skBuf = wasmRuntime.withBytes(loaded, new Uint8Array(P.sk));
                const rc = wasmRuntime.run(loaded, 'mldsa_keygen', [P.ps, pkBuf.ptr, skBuf.ptr]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmMlDsa.keygen rc=${rc}`);
                    return false;
                }
                return {
                    publicKey: wasmRuntime.readBytes(loaded, pkBuf.ptr, P.pk),
                    secretKey: wasmRuntime.readBytes(loaded, skBuf.ptr, P.sk),
                };
            } catch (e) {
                console.error('[crypto] FAIL: wasmMlDsa.keygen: ' + (e && e.message));
                return false;
            } finally {
                if (skBuf) {
                    skBuf.free();
                }
                if (pkBuf) {
                    pkBuf.free();
                }
            }
        }

        /**
         * ML-DSA.Sign — hedged by default (32 random bytes staged as the
         * per-signature `rnd`). `ctx` ≤ 255 bytes.
         * @param {Uint8Array} secretKey
         * @param {Uint8Array} message
         * @param {Uint8Array} [ctx]
         * @param {44|65|87} [paramSet]
         * @returns {Promise<Uint8Array|false>}
         */
        async function sign(secretKey, message, ctx, paramSet) {
            const P = _resolveParams(paramSet);
            if (!P) {
                console.error('[crypto] INVALID: wasmMlDsa.sign: bad paramSet');
                return false;
            }
            if (!(secretKey instanceof Uint8Array) || secretKey.length !== P.sk) {
                console.error('[crypto] INVALID: wasmMlDsa.sign: wrong secretKey length');
                return false;
            }
            if (!(message instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmMlDsa.sign: message must be a Uint8Array');
                return false;
            }
            const _ctx = ctx || new Uint8Array(0);
            if (!(_ctx instanceof Uint8Array) || _ctx.length > _MAX_CTX) {
                console.error('[crypto] INVALID: wasmMlDsa.sign: ctx must be ≤ 255 bytes');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let skBuf;
            let msgBuf;
            let ctxBuf;
            let sigBuf;
            let sigLenBuf;
            try {
                const rnd = crypto.getRandomValues(new Uint8Array(_RND_BYTES));
                _stageEntropy(loaded, rnd);
                skBuf = wasmRuntime.withBytes(loaded, secretKey);
                msgBuf = wasmRuntime.withBytes(loaded, message);
                // `withBytes` needs a non-empty buffer to return a valid ptr; pass
                // a 1-byte scratch with len 0 when ctx is empty.
                ctxBuf = wasmRuntime.withBytes(loaded, _ctx.length > 0 ? _ctx : new Uint8Array(1));
                sigBuf = wasmRuntime.withBytes(loaded, new Uint8Array(P.sig));
                sigLenBuf = wasmRuntime.withBytes(loaded, new Uint8Array(4));
                const rc = wasmRuntime.run(loaded, 'mldsa_sign', [
                    P.ps,
                    skBuf.ptr,
                    msgBuf.ptr,
                    message.length,
                    ctxBuf.ptr,
                    _ctx.length,
                    sigBuf.ptr,
                    sigLenBuf.ptr,
                ]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmMlDsa.sign rc=${rc}`);
                    return false;
                }
                const sigLen = _readI32(loaded, sigLenBuf.ptr);
                if (sigLen !== P.sig) {
                    console.error(`[crypto] FAIL: wasmMlDsa.sign: unexpected sigLen=${sigLen}`);
                    return false;
                }
                return wasmRuntime.readBytes(loaded, sigBuf.ptr, P.sig);
            } catch (e) {
                console.error('[crypto] FAIL: wasmMlDsa.sign: ' + (e && e.message));
                return false;
            } finally {
                if (sigLenBuf) {
                    sigLenBuf.free();
                }
                if (sigBuf) {
                    sigBuf.free();
                }
                if (ctxBuf) {
                    ctxBuf.free();
                }
                if (msgBuf) {
                    msgBuf.free();
                }
                if (skBuf) {
                    skBuf.free();
                }
            }
        }

        /**
         * ML-DSA.Verify. `ctx` ≤ 255 bytes. Resolves `false` on any invalid
         * input, tampered material, or internal failure (no-throw).
         * @param {Uint8Array} publicKey
         * @param {Uint8Array} signature
         * @param {Uint8Array} message
         * @param {Uint8Array} [ctx]
         * @param {44|65|87} [paramSet]
         * @returns {Promise<boolean>}
         */
        async function verify(publicKey, signature, message, ctx, paramSet) {
            const P = _resolveParams(paramSet);
            if (!P) {
                console.error('[crypto] INVALID: wasmMlDsa.verify: bad paramSet');
                return false;
            }
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== P.pk) {
                console.error('[crypto] INVALID: wasmMlDsa.verify: wrong publicKey length');
                return false;
            }
            if (!(signature instanceof Uint8Array) || signature.length !== P.sig) {
                console.error('[crypto] INVALID: wasmMlDsa.verify: wrong signature length');
                return false;
            }
            if (!(message instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmMlDsa.verify: message must be a Uint8Array');
                return false;
            }
            const _ctx = ctx || new Uint8Array(0);
            if (!(_ctx instanceof Uint8Array) || _ctx.length > _MAX_CTX) {
                console.error('[crypto] INVALID: wasmMlDsa.verify: ctx must be ≤ 255 bytes');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let pkBuf;
            let sigBuf;
            let msgBuf;
            let ctxBuf;
            try {
                pkBuf = wasmRuntime.withBytes(loaded, publicKey);
                sigBuf = wasmRuntime.withBytes(loaded, signature);
                msgBuf = wasmRuntime.withBytes(loaded, message);
                ctxBuf = wasmRuntime.withBytes(loaded, _ctx.length > 0 ? _ctx : new Uint8Array(1));
                const rc = wasmRuntime.run(loaded, 'mldsa_verify', [
                    P.ps,
                    pkBuf.ptr,
                    sigBuf.ptr,
                    signature.length,
                    msgBuf.ptr,
                    message.length,
                    ctxBuf.ptr,
                    _ctx.length,
                ]);
                return rc === 0;
            } catch (e) {
                console.error('[crypto] FAIL: wasmMlDsa.verify: ' + (e && e.message));
                return false;
            } finally {
                if (ctxBuf) {
                    ctxBuf.free();
                }
                if (msgBuf) {
                    msgBuf.free();
                }
                if (sigBuf) {
                    sigBuf.free();
                }
                if (pkBuf) {
                    pkBuf.free();
                }
            }
        }

        return { isAvailable, keygen, sign, verify };
    },
};
