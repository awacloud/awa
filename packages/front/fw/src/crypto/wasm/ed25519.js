// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmEd25519` — WASM Ed25519 (RFC 8032), Tier-2 fallback for
 * WebCrypto-covered Ed25519 in environments where `crypto.subtle` lacks it.
 *
 * A thin, opt-in accelerator over the colocated `ed25519` binary (vendored from
 * `@awacloud/fw-wasm-crypto`: libsodium ref10 framed by the package's arena + SHA-512
 * seam + staged-entropy rng seam), loaded BY NAME through the fw `wasmRuntime`
 * adapter (BATCH_11 ERRATA-2: no fw-local `.wasm.js`). Mirrors the pure-JS
 * `crypto/pkc/ed25519` surface for the Ed25519 signature scheme — keygen / sign
 * / verify — over `Uint8Array`, async, no-throw.
 *
 * This is the **Tier-2 fallback** for environments where `crypto.subtle` is
 * unavailable (non-secure-context, locked-down workers). In secure contexts
 * prefer `webcrypto/ed25519`, which is hardware-accelerated. The pure-JS
 * `pkc/ed25519` remains the universal default.
 *
 * ─── Key & signature encodings ───
 *
 *   - Seed: 32-byte raw secret; if omitted, drawn from `crypto.getRandomValues`.
 *   - Public key (`publicKey`): 32-byte Ed25519 public key (compressed point).
 *   - Private key (`privateKey`): 64-byte libsodium **expanded sk** = seed || pk.
 *     This matches the `pkc/ed25519` format exactly (seed ‖ publicKey).
 *   - Signature: 64-byte detached Ed25519 signature (R || s).
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto/targets.json` target `ed25519`) ─
 *
 *   memory / alloc(size)->ptr / free(ptr)              the canonical triple
 *   rng_stage(srcPtr, n) -> i32                        stage n bytes of entropy
 *   rng_reset() -> void                                clear the staged-entropy seam
 *   ed25519_keypair(seedPtr, pkPtr, skPtr) -> i32      0 = OK; SEED-EXPLICIT
 *   ed25519_sign(skPtr, msgPtr, msgLen, sigPtr) -> i32  0 = OK; 64-byte detached sig
 *   ed25519_verify(pkPtr, sigPtr, msgPtr, msgLen) -> i32  0 = valid; frozen order sig BEFORE msg
 *
 * `ed25519_keypair` is SEED-EXPLICIT: it calls `crypto_sign_ed25519_seed_keypair`
 * and writes a 32-byte public key at `pkPtr` and a 64-byte expanded sk (seed ‖ pk)
 * at `skPtr`. The rng seam (rng_stage / rng_reset) exists in the ABI but is NOT
 * used for keygen — keygen always takes a caller-supplied seed. When no seed is
 * provided, 32 bytes are drawn from `crypto.getRandomValues` in JS.
 *
 * The `ed25519` binary ships ONLY `ed25519.scalar.wasm` (`simd: false` in
 * targets.json; ref10 has no simd128 lane). `{ variant: 'scalar' }` is passed
 * explicitly to `rt.load` because wasmRuntime's `selectVariant()` defaults to simd
 * with no automatic fallback; omitting the pin would fail the load on the missing
 * `ed25519.simd.wasm`.
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
 * Public surface of `wasmEd25519.factory()`.
 * @typedef {object} WasmEd25519API
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(seed?: Uint8Array) => Promise<{publicKey: Uint8Array, privateKey: Uint8Array}|false>} keygen
 *   Generate an Ed25519 key pair. If `seed` is given it must be 32 bytes;
 *   otherwise 32 random bytes are drawn from `crypto.getRandomValues`.
 *   Returns `{ publicKey: Uint8Array(32), privateKey: Uint8Array(64) }` or `false`.
 * @property {(privateKey: Uint8Array, message: Uint8Array) => Promise<Uint8Array|false>} sign
 *   Sign `message` with the 64-byte expanded `privateKey`. Returns the 64-byte
 *   detached signature, or `false` on any failure.
 * @property {(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array) => Promise<boolean>} verify
 *   Verify a detached Ed25519 signature. Resolves `false` on invalid input,
 *   tampered material, or any internal failure (no-throw).
 */

export const wasmEd25519 = {
    name: 'wasmEd25519',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime  the fw WASM adapter.
     * @returns {WasmEd25519API}
     */
    factory(wasmRuntime) {

        // ── constants (inside the factory; fw/no-factory-capture) ──────────

        /** Package dist module name loaded BY NAME through the runtime. */
        const _MODULE = 'ed25519';

        /** Algorithm exports the wrapper requires (beyond memory/alloc/free). */
        const _EXPORTS = [
            'ed25519_keypair',
            'ed25519_sign',
            'ed25519_verify',
        ];

        /**
         * ed25519 ships simd:false → only ed25519.scalar.wasm exists. The variant
         * pin is mandatory: selectVariant() defaults to simd with no fallback.
         * @type {import('./runtime.js').WasmLoadOptions}
         */
        const _LOAD_OPTS = { variant: 'scalar' };

        /** Byte length of a seed / public key. */
        const _PK_LEN = 32;

        /** Byte length of the expanded secret key (seed || pubkey). */
        const _SK_LEN = 64;

        /** Byte length of a detached signature. */
        const _SIG_LEN = 64;

        // ── helpers ────────────────────────────────────────────────────────

        /**
         * Load the `ed25519` scalar module by name through the runtime.
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
         * Generate an Ed25519 key pair. If `seed` is supplied it must be exactly
         * 32 bytes; if omitted, 32 bytes are drawn from `crypto.getRandomValues`.
         * Returns `{ publicKey: Uint8Array(32), privateKey: Uint8Array(64) }` or
         * `false` on any failure.
         * @param {Uint8Array} [seed]  optional 32-byte seed
         * @returns {Promise<{publicKey: Uint8Array, privateKey: Uint8Array}|false>}
         */
        async function keygen(seed) {
            if (seed !== undefined) {
                if (!(seed instanceof Uint8Array) || seed.length !== _PK_LEN) {
                    console.error('[crypto] INVALID: wasmEd25519.keygen: seed must be 32 bytes');
                    return false;
                }
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let seedBuf;
            let pkBuf;
            let skBuf;
            try {
                const actualSeed = seed !== undefined
                    ? seed
                    : crypto.getRandomValues(new Uint8Array(_PK_LEN));
                seedBuf = wasmRuntime.withBytes(loaded, actualSeed);
                pkBuf = wasmRuntime.withBytes(loaded, new Uint8Array(_PK_LEN));
                skBuf = wasmRuntime.withBytes(loaded, new Uint8Array(_SK_LEN));
                const rc = wasmRuntime.run(loaded, 'ed25519_keypair', [
                    seedBuf.ptr, pkBuf.ptr, skBuf.ptr,
                ]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmEd25519.keygen rc=${rc}`);
                    return false;
                }
                return {
                    publicKey: wasmRuntime.readBytes(loaded, pkBuf.ptr, _PK_LEN),
                    privateKey: wasmRuntime.readBytes(loaded, skBuf.ptr, _SK_LEN),
                };
            } catch (e) {
                console.error('[crypto] FAIL: wasmEd25519.keygen: ' + (e && e.message));
                return false;
            } finally {
                if (skBuf) {
                    skBuf.free();
                }
                if (pkBuf) {
                    pkBuf.free();
                }
                if (seedBuf) {
                    seedBuf.free();
                }
            }
        }

        /**
         * Sign `message` with the 64-byte expanded `privateKey` (seed || pubkey).
         * Returns the 64-byte detached signature, or `false` on any failure.
         * @param {Uint8Array} privateKey  64-byte expanded sk (seed || pubkey)
         * @param {Uint8Array} message
         * @returns {Promise<Uint8Array|false>}
         */
        async function sign(privateKey, message) {
            if (!(privateKey instanceof Uint8Array) || privateKey.length !== _SK_LEN) {
                console.error('[crypto] INVALID: wasmEd25519.sign: privateKey must be 64 bytes');
                return false;
            }
            if (!(message instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmEd25519.sign: message must be a Uint8Array');
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
                msgBuf = wasmRuntime.withBytes(loaded, message.length ? message : new Uint8Array(1));
                sigBuf = wasmRuntime.withBytes(loaded, new Uint8Array(_SIG_LEN));
                const rc = wasmRuntime.run(loaded, 'ed25519_sign', [
                    skBuf.ptr, msgBuf.ptr, message.length, sigBuf.ptr,
                ]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmEd25519.sign rc=${rc}`);
                    return false;
                }
                return wasmRuntime.readBytes(loaded, sigBuf.ptr, _SIG_LEN);
            } catch (e) {
                console.error('[crypto] FAIL: wasmEd25519.sign: ' + (e && e.message));
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
         * Verify a detached Ed25519 signature. Resolves `false` on invalid input,
         * tampered material, or any internal failure (no-throw).
         *
         * NOTE: The frozen WASM ABI arg order is `ed25519_verify(pkPtr, sigPtr,
         * msgPtr, msgLen)` — signature BEFORE message (verbatim from shims/sodium.c).
         *
         * @param {Uint8Array} publicKey  32-byte Ed25519 public key
         * @param {Uint8Array} signature  64-byte detached signature
         * @param {Uint8Array} message
         * @returns {Promise<boolean>}
         */
        async function verify(publicKey, signature, message) {
            if (!(publicKey instanceof Uint8Array) || publicKey.length !== _PK_LEN) {
                console.error('[crypto] INVALID: wasmEd25519.verify: publicKey must be 32 bytes');
                return false;
            }
            if (!(signature instanceof Uint8Array) || signature.length !== _SIG_LEN) {
                console.error('[crypto] INVALID: wasmEd25519.verify: signature must be 64 bytes');
                return false;
            }
            if (!(message instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmEd25519.verify: message must be a Uint8Array');
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
                msgBuf = wasmRuntime.withBytes(loaded, message.length ? message : new Uint8Array(1));
                // Frozen ABI: ed25519_verify(pkPtr, sigPtr, msgPtr, msgLen)
                // — signature BEFORE message.
                const rc = wasmRuntime.run(loaded, 'ed25519_verify', [
                    pkBuf.ptr, sigBuf.ptr, msgBuf.ptr, message.length,
                ]);
                return rc === 0;
            } catch (e) {
                console.error('[crypto] FAIL: wasmEd25519.verify: ' + (e && e.message));
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

        return { isAvailable, keygen, sign, verify };
    },
};
