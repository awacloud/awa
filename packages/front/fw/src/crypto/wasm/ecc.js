// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmEcc` — WASM ECDSA + ECDH on NIST P-256/384/521, Tier-2
 * fallback for the WebCrypto-covered prime curves.
 *
 * A thin, opt-in accelerator over the colocated `ecc` binary (vendored from
 * `@awacloud/fw-wasm-crypto`: fiat-crypto machine-verified field arithmetic framed by
 * BearSSL's EC layer), loaded BY NAME through the fw `wasmRuntime` adapter
 * (BATCH_11 ERRATA: no fw-local `.wasm.js`). Mirrors the pure-JS `crypto/pkc/ecc`
 * surface for the recommended prime curves — keygen / ECDSA sign+verify / ECDH —
 * over `Uint8Array`, async, no-throw.
 *
 * This is the **Tier-2 fallback** for environments where `crypto.subtle` is
 * unavailable (non-secure-context, locked-down workers). In secure contexts
 * prefer `webcrypto/ecc`, which is hardware-accelerated. The pure-JS `pkc/ecc`
 * remains the universal default.
 *
 * ─── Key & signature encodings ───
 *
 *   - Private key (`privateKey`): raw big-endian scalar `d`, exactly `flen`
 *     bytes for the curve (P-256 → 32, P-384 → 48, P-521 → 66).
 *   - Public key (`publicKey`): SEC1 **uncompressed** point `0x04 || X || Y`,
 *     `1 + 2·flen` bytes.
 *   - Signature: raw `r || s`, `2·flen` bytes (NOT DER).
 *   - ECDSA is **deterministic** (RFC 6979) — the BearSSL signer reproduces the
 *     FIPS 186-5 *deterministic* / RFC 6979 vectors byte-for-byte.
 *   - `deriveBits` (ECDH) returns the raw shared X-coordinate `Z = X(d·Q)`,
 *     `flen` bytes (no KDF applied).
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto/targets.json` target `ecc`) ───
 *
 *   memory / alloc(size)->ptr / free(ptr)              the canonical triple
 *   rng_reset() -> void                                clear the staged-entropy seam
 *   rng_stage(srcPtr, n) -> i32                        stage n bytes of entropy
 *   ecdsa_keygen(curveId, pkPtr, skPtr) -> i32         0 = OK (writes SEC1 pk + raw sk)
 *   ecdsa_sign(curveId, hashId, skPtr, msgPtr, msgLen, sigPtr) -> i32   0 = OK (raw r||s)
 *   ecdsa_verify(curveId, hashId, pkPtr, sigPtr, msgPtr, msgLen) -> i32  0 = valid
 *   ecdh(curveId, skPtr, pkPtr, outPtr) -> i32         0 = OK (writes raw Z)
 *
 * `curveId`: P-256 = 0, P-384 = 1, P-521 = 2. `hashId`: 256 | 384 | 512 (the
 * SHA-2 family the shim supports). `ecdsa_keygen` draws its scalar through the
 * `rng_stage` seam (rejection sampling), so a fresh random key stages entropy
 * from `crypto.getRandomValues`; signing is deterministic and needs no entropy.
 *
 * The `ecc` binary ships ONLY `ecc.scalar.wasm` (`simd: false` in targets.json).
 * `{ variant: 'scalar' }` is passed explicitly to `rt.load` because
 * wasmRuntime's `selectVariant()` defaults to simd with no automatic fallback;
 * omitting the pin would fail the load on the missing `ecc.simd.wasm`.
 *
 * No-throw contract (crypto README §1): every async member resolves to a result
 * or `false`/`false`-equivalent, never rejects. `verify` resolves `false` (not
 * throw) on any invalid input, tampered material, or internal failure.
 *
 * Worker-safe: pure factory, no DOM; `crypto.getRandomValues` and `WebAssembly`
 * exist in workers. ALL constants live INSIDE `factory()` so the serialized
 * closure carries no captured binding (`fw/no-factory-capture`).
 */

import { wasmRuntime } from './runtime.js';

/**
 * Supported NIST prime curve names.
 * @typedef {('P-256'|'P-384'|'P-521')} WasmEccCurve
 */

/**
 * Public surface of `wasmEcc.factory()`.
 * @typedef {object} WasmEccAPI
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(curve?: WasmEccCurve) => Promise<{publicKey: Uint8Array, privateKey: Uint8Array}|false>} generateKey
 *   Fresh random key pair — SEC1 uncompressed `publicKey` + raw scalar `privateKey`.
 * @property {(privateKey: Uint8Array, data: Uint8Array, curve?: WasmEccCurve, hash?: (256|384|512)) => Promise<Uint8Array|false>} sign
 *   Deterministic (RFC 6979) ECDSA — raw `r||s` signature.
 * @property {(publicKey: Uint8Array, signature: Uint8Array, data: Uint8Array, curve?: WasmEccCurve, hash?: (256|384|512)) => Promise<boolean>} verify
 *   ECDSA verify — `false` on any failure (no-throw).
 * @property {(privateKey: Uint8Array, publicKey: Uint8Array, curve?: WasmEccCurve) => Promise<Uint8Array|false>} deriveBits
 *   ECDH shared X-coordinate `Z` (raw, no KDF).
 */

export const wasmEcc = {
    name: 'wasmEcc',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime  the fw WASM adapter.
     * @returns {WasmEccAPI}
     */
    factory(wasmRuntime) {

        // ── constants (inside the factory; fw/no-factory-capture) ──────────

        /** Package dist module name loaded BY NAME through the runtime. */
        const _MODULE = 'ecc';

        /** Algorithm exports the wrapper requires (beyond memory/alloc/free). */
        const _EXPORTS = [
            'ecdsa_keygen',
            'ecdsa_sign',
            'ecdsa_verify',
            'ecdh',
            'rng_stage',
            'rng_reset',
        ];

        /**
         * ecc ships simd:false → only ecc.scalar.wasm exists. The variant pin is
         * mandatory: selectVariant() defaults to simd with no fallback.
         * @type {import('./runtime.js').WasmLoadOptions}
         */
        const _LOAD_OPTS = { variant: 'scalar' };

        /**
         * Per-curve descriptor: the frozen `curveId` ABI enum + field/order byte
         * length (`flen`). Public key = `1 + 2·flen` (SEC1), signature = `2·flen`
         * (raw r||s), private key & ECDH output = `flen`.
         */
        const _CURVES = {
            'P-256': { id: 0, flen: 32 },
            'P-384': { id: 1, flen: 48 },
            'P-521': { id: 2, flen: 66 },
        };

        /** Default curve (plan: P-256). */
        const _DEFAULT_CURVE = 'P-256';

        /** Allowed ECDSA hash sizes (SHA-2 family the shim supports). */
        const _HASHES = { 256: true, 384: true, 512: true };

        /** Default hash size (plan: SHA-256). */
        const _DEFAULT_HASH = 256;

        /** Entropy staged for `ecdsa_keygen` rejection sampling (generous). */
        const _KEYGEN_ENTROPY = 256;

        // ── helpers ────────────────────────────────────────────────────────

        /**
         * Resolve a curve descriptor, or `null` when invalid.
         * @param {WasmEccCurve} curve
         * @returns {{id:number, flen:number}|null}
         */
        function _resolveCurve(curve) {
            const c = curve === undefined ? _DEFAULT_CURVE : curve;
            return Object.prototype.hasOwnProperty.call(_CURVES, c)
                ? _CURVES[c]
                : null;
        }

        /**
         * Resolve a hash id, or `null` when invalid.
         * @param {number} hash
         * @returns {number|null}
         */
        function _resolveHash(hash) {
            const h = hash === undefined ? _DEFAULT_HASH : hash;
            return Object.prototype.hasOwnProperty.call(_HASHES, h) ? h : null;
        }

        /**
         * Load the package `ecc` module by name (scalar variant) through the
         * runtime.
         * @returns {Promise<import('./runtime.js').WasmLoaded|false>}
         */
        function _load() {
            return wasmRuntime.load(_MODULE, _EXPORTS, _LOAD_OPTS);
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

        // ── public API ─────────────────────────────────────────────────────

        /**
         * Whether `WebAssembly` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Generate a fresh random key pair for `curve`. Stages entropy from
         * `crypto.getRandomValues` for the shim's rejection-sampling scalar
         * draw, then calls `ecdsa_keygen`.
         * @param {WasmEccCurve} [curve]
         * @returns {Promise<{publicKey: Uint8Array, privateKey: Uint8Array}|false>}
         */
        async function generateKey(curve) {
            const C = _resolveCurve(curve);
            if (!C) {
                console.error('[crypto] INVALID: wasmEcc.generateKey: bad curve');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let pkBuf;
            let skBuf;
            try {
                const seed = crypto.getRandomValues(new Uint8Array(_KEYGEN_ENTROPY));
                _stageEntropy(loaded, seed);
                pkBuf = wasmRuntime.withBytes(loaded, new Uint8Array(1 + 2 * C.flen));
                skBuf = wasmRuntime.withBytes(loaded, new Uint8Array(C.flen));
                const rc = wasmRuntime.run(loaded, 'ecdsa_keygen', [C.id, pkBuf.ptr, skBuf.ptr]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmEcc.generateKey rc=${rc}`);
                    return false;
                }
                return {
                    publicKey: wasmRuntime.readBytes(loaded, pkBuf.ptr, 1 + 2 * C.flen),
                    privateKey: wasmRuntime.readBytes(loaded, skBuf.ptr, C.flen),
                };
            } catch (e) {
                console.error('[crypto] FAIL: wasmEcc.generateKey: ' + (e && e.message));
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
         * Deterministic (RFC 6979) ECDSA signature over `data`. Returns the raw
         * `r || s` (`2·flen` bytes). Signing needs no entropy.
         * @param {Uint8Array} privateKey  raw scalar, `flen` bytes
         * @param {Uint8Array} data        message to sign (hashed by the shim)
         * @param {WasmEccCurve} [curve]
         * @param {256|384|512} [hash]
         * @returns {Promise<Uint8Array|false>}
         */
        async function sign(privateKey, data, curve, hash) {
            const C = _resolveCurve(curve);
            if (!C) {
                console.error('[crypto] INVALID: wasmEcc.sign: bad curve');
                return false;
            }
            const hashId = _resolveHash(hash);
            if (hashId === null) {
                console.error('[crypto] INVALID: wasmEcc.sign: bad hash');
                return false;
            }
            if (!(privateKey instanceof Uint8Array) || privateKey.length !== C.flen) {
                console.error('[crypto] INVALID: wasmEcc.sign: wrong privateKey length');
                return false;
            }
            if (!(data instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmEcc.sign: data must be a Uint8Array');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let skBuf;
            let msgBuf;
            let sigBuf;
            try {
                skBuf = wasmRuntime.withBytes(loaded, privateKey);
                // alloc(0) may return a null ptr; pass a 1-byte stand-in for an
                // empty message while still passing the real length (0) to the shim.
                msgBuf = wasmRuntime.withBytes(loaded, data.length ? data : new Uint8Array(1));
                sigBuf = wasmRuntime.withBytes(loaded, new Uint8Array(2 * C.flen));
                const rc = wasmRuntime.run(loaded, 'ecdsa_sign', [
                    C.id, hashId, skBuf.ptr, msgBuf.ptr, data.length, sigBuf.ptr,
                ]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmEcc.sign rc=${rc}`);
                    return false;
                }
                return wasmRuntime.readBytes(loaded, sigBuf.ptr, 2 * C.flen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmEcc.sign: ' + (e && e.message));
                return false;
            } finally {
                if (sigBuf) {
                    sigBuf.free();
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
         * Verify a raw `r || s` ECDSA signature over `data`. Resolves `false`
         * on any invalid input, tampered material, or internal failure
         * (no-throw).
         * @param {Uint8Array} publicKey  SEC1 uncompressed point, `1 + 2·flen` bytes
         * @param {Uint8Array} signature  raw r||s, `2·flen` bytes
         * @param {Uint8Array} data
         * @param {WasmEccCurve} [curve]
         * @param {256|384|512} [hash]
         * @returns {Promise<boolean>}
         */
        async function verify(publicKey, signature, data, curve, hash) {
            const C = _resolveCurve(curve);
            if (!C) {
                console.error('[crypto] INVALID: wasmEcc.verify: bad curve');
                return false;
            }
            const hashId = _resolveHash(hash);
            if (hashId === null) {
                console.error('[crypto] INVALID: wasmEcc.verify: bad hash');
                return false;
            }
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== 1 + 2 * C.flen) {
                console.error('[crypto] INVALID: wasmEcc.verify: wrong publicKey length');
                return false;
            }
            if (!(signature instanceof Uint8Array) || signature.length !== 2 * C.flen) {
                console.error('[crypto] INVALID: wasmEcc.verify: wrong signature length');
                return false;
            }
            if (!(data instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmEcc.verify: data must be a Uint8Array');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let pkBuf;
            let sigBuf;
            let msgBuf;
            try {
                pkBuf = wasmRuntime.withBytes(loaded, publicKey);
                sigBuf = wasmRuntime.withBytes(loaded, signature);
                msgBuf = wasmRuntime.withBytes(loaded, data.length ? data : new Uint8Array(1));
                const rc = wasmRuntime.run(loaded, 'ecdsa_verify', [
                    C.id, hashId, pkBuf.ptr, sigBuf.ptr, msgBuf.ptr, data.length,
                ]);
                return rc === 0;
            } catch (e) {
                console.error('[crypto] FAIL: wasmEcc.verify: ' + (e && e.message));
                return false;
            } finally {
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

        /**
         * ECDH — derive the raw shared X-coordinate `Z = X(d·Q)` (`flen` bytes,
         * no KDF) from this side's `privateKey` and the peer's `publicKey`.
         * @param {Uint8Array} privateKey  raw scalar, `flen` bytes
         * @param {Uint8Array} publicKey   peer SEC1 uncompressed point, `1 + 2·flen` bytes
         * @param {WasmEccCurve} [curve]
         * @returns {Promise<Uint8Array|false>}
         */
        async function deriveBits(privateKey, publicKey, curve) {
            const C = _resolveCurve(curve);
            if (!C) {
                console.error('[crypto] INVALID: wasmEcc.deriveBits: bad curve');
                return false;
            }
            if (!(privateKey instanceof Uint8Array) || privateKey.length !== C.flen) {
                console.error('[crypto] INVALID: wasmEcc.deriveBits: wrong privateKey length');
                return false;
            }
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== 1 + 2 * C.flen) {
                console.error('[crypto] INVALID: wasmEcc.deriveBits: wrong publicKey length');
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
                skBuf = wasmRuntime.withBytes(loaded, privateKey);
                pkBuf = wasmRuntime.withBytes(loaded, publicKey);
                outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(C.flen));
                const rc = wasmRuntime.run(loaded, 'ecdh', [C.id, skBuf.ptr, pkBuf.ptr, outBuf.ptr]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmEcc.deriveBits rc=${rc}`);
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, C.flen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmEcc.deriveBits: ' + (e && e.message));
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

        return { isAvailable, generateKey, sign, verify, deriveBits };
    },
};
