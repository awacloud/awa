// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmRsa` — WASM RSA (OAEP encrypt/decrypt, PSS &
 * RSASSA-PKCS1-v1_5 sign/verify, keygen) as a Tier-2 fallback accelerator.
 *
 * A thin, opt-in wrapper over the colocated `rsa` binary (vendored from
 * `@awacloud/fw-wasm-crypto`: BearSSL i31 + an EMSA-PSS padding layer), loaded BY
 * NAME through the fw `wasmRuntime` adapter (BATCH_11 ERRATA: no fw-local
 * `.wasm.js`, dependency on `wasmRuntime` only). WebCrypto covers RSA in
 * hardware; this module only matters where `crypto.subtle` is absent
 * (non-secure-context, locked-down workers). Pure-JS `crypto/pkc/rsa` stays
 * the universal default. Async, `Uint8Array`, no-throw.
 *
 * The `rsa` target ships **scalar only** (`simd:false`); this wrapper forces
 * `{ variant: 'scalar' }` on load (the runtime's `selectVariant` defaults to
 * simd with no fallback).
 *
 * ─── Key encoding (BearSSL wire format — the delivered ABI) ───
 *
 * The plan's pre-ERRATA wording said keys are "DER spki/pkcs8". The delivered
 * BearSSL shim has NO DER parser; its ABI consumes the BearSSL big-integer wire
 * format, which is therefore what this wrapper produces and consumes:
 *
 *   - **public key**  `u16be nLen | n | u16be eLen | e`  (minimal big-endian)
 *   - **private key** `u32be nBitLen |`
 *                     `u16be pLen | p | u16be qLen | q |`
 *                     `u16be dpLen | dp | u16be dqLen | dq | u16be iqLen | iq`
 *                     (CRT parameters; `iq = q^{-1} mod p`)
 *
 * `generateKey` returns this wire form; `encrypt`/`decrypt`/`sign`/`verify`
 * consume it. DER (spki/pkcs8) / PEM conversion is out of scope (use the
 * pure-JS `pem`/asn1 modules). This is self-consistent across the surface.
 *
 * ─── ABI (frozen by `@awacloud/fw-wasm-crypto/targets.json` `rsa`) ───
 *
 *   memory / alloc(size)->ptr / free(ptr)              the canonical triple
 *   rng_reset() -> void                                clear the entropy seam
 *   rng_stage(srcPtr, n) -> i32                        stage n bytes of entropy
 *   rsa_keygen(scheme, bits, hashId, pkPtr, pkLenPtr, skPtr, skLenPtr) -> i32
 *   rsa_oaep_enc(hashId, pkPtr, pkLen, msgPtr, msgLen, lblPtr, lblLen, outPtr, outLenPtr) -> i32
 *   rsa_oaep_dec(hashId, skPtr, skLen, ctPtr, ctLen, lblPtr, lblLen, outPtr, outLenPtr) -> i32
 *   rsa_sign(scheme, hashId, skPtr, skLen, hashPtr, hashLen, sigPtr, sigLenPtr) -> i32
 *   rsa_verify(scheme, hashId, pkPtr, pkLen, sigPtr, sigLen, hashPtr, hashLen) -> i32
 *                                                      0 = OK / valid signature
 *
 * The `scheme` enum is `PSS = 0`, `PKCS1 = 1`. The sign/verify functions
 * consume a PRE-COMPUTED message digest (`hash`); this wrapper hashes the
 * message with `crypto.subtle` (SHA-256/384/512) before the call, mirroring the
 * package shim's marshalling. Lengths are written as little-endian i32.
 *
 * Keygen and PSS signing draw their randomness (key primes / EMSA-PSS salt)
 * from the staged-entropy seam: stage bytes via `rng_reset()` + `rng_stage`
 * right before the call (production stages `crypto.getRandomValues`).
 *
 * No-throw contract (crypto README §1): every async member resolves to a result
 * or `false`, never rejects. `isAvailable()` mirrors `wasmRuntime.isAvailable()`.
 *
 * Worker-safe: pure factory, no DOM; `crypto.subtle`, `crypto.getRandomValues`
 * and `WebAssembly` exist in (secure) workers. All constants live INSIDE
 * `factory()` so the serialized closure carries no captured binding
 * (`fw/no-factory-capture`).
 */

import { wasmRuntime } from './runtime.js';

/**
 * Public surface of `wasmRsa.factory()`.
 * @typedef {object} WasmRsaAPI
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(scheme: ('OAEP'|'PSS'|'PKCS1'), modulusBits?: (2048|3072|4096), hash?: (256|384|512)) => Promise<{publicKey: Uint8Array, privateKey: Uint8Array}|false>} generateKey
 *   Generate an RSA key pair (BearSSL wire format), or `false`.
 * @property {(publicKey: Uint8Array, data: Uint8Array, label?: Uint8Array, hash?: (256|384|512)) => Promise<Uint8Array|false>} encrypt
 *   RSA-OAEP encrypt (OAEP only), or `false`.
 * @property {(privateKey: Uint8Array, ct: Uint8Array, label?: Uint8Array, hash?: (256|384|512)) => Promise<Uint8Array|false>} decrypt
 *   RSA-OAEP decrypt (OAEP only), or `false`.
 * @property {(privateKey: Uint8Array, data: Uint8Array, scheme: ('PSS'|'PKCS1'), hash?: (256|384|512)) => Promise<Uint8Array|false>} sign
 *   RSA-PSS / RSASSA-PKCS1-v1_5 sign (PKCS1 warns DEPRECATED), or `false`.
 * @property {(publicKey: Uint8Array, signature: Uint8Array, data: Uint8Array, scheme: ('PSS'|'PKCS1'), hash?: (256|384|512)) => Promise<boolean>} verify
 *   RSA-PSS / RSASSA-PKCS1-v1_5 verify; `true` iff valid.
 */

export const wasmRsa = {
    name: 'wasmRsa',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').wasmRuntime} wasmRuntime  the fw WASM adapter.
     * @returns {WasmRsaAPI}
     */
    factory(wasmRuntime) {

        // ── constants (inside the factory; fw/no-factory-capture) ──────────

        /** Package dist module name loaded BY NAME through the runtime. */
        const _MODULE = 'rsa';

        /**
         * `rsa` ships scalar only (`simd:false`); force the scalar variant.
         * @type {import('./runtime.js').WasmLoadOptions}
         */
        const _LOAD_OPTS = { variant: 'scalar' };

        /** Algorithm exports the wrapper requires (beyond memory/alloc/free). */
        const _EXPORTS = [
            'rsa_keygen',
            'rsa_oaep_enc',
            'rsa_oaep_dec',
            'rsa_sign',
            'rsa_verify',
            'rng_stage',
            'rng_reset',
        ];

        /** Frozen scheme enum (targets.json `rsa` / shims/rsa.c). */
        const _SCHEME = { PSS: 0, PKCS1: 1 };

        /** Supported SHA-2 digest sizes → WebCrypto algorithm name. */
        const _HASH = { 256: 'SHA-256', 384: 'SHA-384', 512: 'SHA-512' };

        /** Default digest (plan). */
        const _DEFAULT_HASH = 256;

        /** Supported modulus sizes (bits). */
        const _MODULI = { 2048: true, 3072: true, 4096: true };

        /** Default modulus (plan). */
        const _DEFAULT_BITS = 2048;

        /** Public exponent the keygen ABI uses (fixed F4). */
        const _PUB_EXP = 65537;

        /** Output-buffer caps for keygen (bytes); generous for 4096-bit keys. */
        const _PK_CAP = 2048;
        const _SK_CAP = 4096;

        /** Bytes of entropy staged for keygen / PSS salt. */
        const _ENTROPY_BYTES = 64;

        // ── helpers ────────────────────────────────────────────────────────

        /**
         * Load the package `rsa` module by name through the runtime (scalar).
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

        /**
         * Digest `message` with the named SHA-2 hash via `crypto.subtle`.
         * @param {number} hashId  256 | 384 | 512
         * @param {Uint8Array} message
         * @returns {Promise<Uint8Array>}
         */
        async function _digest(hashId, message) {
            // `crypto.subtle.digest`'s BufferSource wants Uint8Array<ArrayBuffer>;
            // `message` is the plain Uint8Array<ArrayBufferLike> ABI type used
            // throughout this module's public surface — cast locally, no behavior change.
            const buf = await crypto.subtle.digest(
                _HASH[hashId],
                /** @type {Uint8Array<ArrayBuffer>} */ (message),
            );
            return new Uint8Array(buf);
        }

        /**
         * The modulus byte length `k` of a public key in the BearSSL wire
         * format (`u16be nLen | n | …`): `nLen` is the first big-endian u16.
         * @param {Uint8Array} publicKey
         * @returns {number}  `k` in bytes, or `0` when the wire form is too short.
         */
        function _modulusBytes(publicKey) {
            if (publicKey.length < 2) {
                return 0;
            }
            return (publicKey[0] << 8) | publicKey[1];
        }

        /**
         * Resolve and validate a `hash` argument → 256|384|512 or `null`.
         * @param {number|undefined} hash
         * @returns {number|null}
         */
        function _resolveHash(hash) {
            const h = hash === undefined ? _DEFAULT_HASH : hash;
            return Object.prototype.hasOwnProperty.call(_HASH, h) ? h : null;
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
         * Generate an RSA key pair in the BearSSL wire format. `scheme` selects
         * the keygen padding hint (`'OAEP'` keys use the PSS/PKCS1 enum
         * interchangeably here — RSA keys are scheme-agnostic; the argument is
         * kept for API symmetry and validation). `modulusBits` ∈ {2048,3072,4096}
         * (default 2048); `hash` ∈ {256,384,512} (default 256); public exponent
         * is fixed at 65537. Entropy is drawn from `crypto.getRandomValues`.
         * @param {'OAEP'|'PSS'|'PKCS1'} scheme
         * @param {2048|3072|4096} [modulusBits]
         * @param {256|384|512} [hash]
         * @returns {Promise<{publicKey: Uint8Array, privateKey: Uint8Array}|false>}
         */
        async function generateKey(scheme, modulusBits, hash) {
            if (scheme !== 'OAEP' && scheme !== 'PSS' && scheme !== 'PKCS1') {
                console.error('[crypto] INVALID: wasmRsa.generateKey: bad scheme');
                return false;
            }
            const bits = modulusBits === undefined ? _DEFAULT_BITS : modulusBits;
            if (!Object.prototype.hasOwnProperty.call(_MODULI, bits)) {
                console.error('[crypto] INVALID: wasmRsa.generateKey: bad modulusBits');
                return false;
            }
            const hashId = _resolveHash(hash);
            if (hashId === null) {
                console.error('[crypto] INVALID: wasmRsa.generateKey: bad hash');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            // The keygen ABI takes the scheme enum; OAEP maps to PKCS1 here
            // (the keygen path is identical — the padding scheme is applied at
            // sign/encrypt time, not at key generation).
            const schemeEnum = scheme === 'PSS' ? _SCHEME.PSS : _SCHEME.PKCS1;
            let pkOut;
            let skOut;
            let pkLen;
            let skLen;
            try {
                const seed = crypto.getRandomValues(new Uint8Array(_ENTROPY_BYTES));
                _stageEntropy(loaded, seed);
                pkOut = wasmRuntime.withBytes(loaded, new Uint8Array(_PK_CAP));
                skOut = wasmRuntime.withBytes(loaded, new Uint8Array(_SK_CAP));
                pkLen = wasmRuntime.withBytes(loaded, new Uint8Array(4));
                skLen = wasmRuntime.withBytes(loaded, new Uint8Array(4));
                const rc = wasmRuntime.run(loaded, 'rsa_keygen', [
                    schemeEnum,
                    bits,
                    hashId,
                    pkOut.ptr,
                    pkLen.ptr,
                    skOut.ptr,
                    skLen.ptr,
                ]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmRsa.generateKey rc=${rc}`);
                    return false;
                }
                const pl = _readI32(loaded, pkLen.ptr);
                const sl = _readI32(loaded, skLen.ptr);
                if (pl <= 0 || pl > _PK_CAP || sl <= 0 || sl > _SK_CAP) {
                    console.error('[crypto] FAIL: wasmRsa.generateKey: bad key lengths');
                    return false;
                }
                return {
                    publicKey: wasmRuntime.readBytes(loaded, pkOut.ptr, pl),
                    privateKey: wasmRuntime.readBytes(loaded, skOut.ptr, sl),
                };
            } catch (e) {
                console.error('[crypto] FAIL: wasmRsa.generateKey: ' + (e && e.message));
                return false;
            } finally {
                if (skLen) {
                    skLen.free();
                }
                if (pkLen) {
                    pkLen.free();
                }
                if (skOut) {
                    skOut.free();
                }
                if (pkOut) {
                    pkOut.free();
                }
            }
        }

        /**
         * RSA-OAEP encrypt `data` under `publicKey` (BearSSL wire format).
         * `label` is the optional OAEP label (default empty). The OAEP seed is
         * drawn from `crypto.getRandomValues`.
         * @param {Uint8Array} publicKey
         * @param {Uint8Array} data
         * @param {Uint8Array} [label]
         * @param {256|384|512} [hash]
         * @returns {Promise<Uint8Array|false>}
         */
        async function encrypt(publicKey, data, label, hash) {
            if (!(publicKey instanceof Uint8Array) || publicKey.length < 4) {
                console.error('[crypto] INVALID: wasmRsa.encrypt: bad publicKey');
                return false;
            }
            if (!(data instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmRsa.encrypt: data must be a Uint8Array');
                return false;
            }
            const _label = label || new Uint8Array(0);
            if (!(_label instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmRsa.encrypt: label must be a Uint8Array');
                return false;
            }
            const hashId = _resolveHash(hash);
            if (hashId === null) {
                console.error('[crypto] INVALID: wasmRsa.encrypt: bad hash');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            const k = _modulusBytes(publicKey);
            let pkBuf;
            let msgBuf;
            let lblBuf;
            let outBuf;
            let lenBuf;
            try {
                // The shim draws the OAEP seed from the entropy seam.
                _stageEntropy(loaded, crypto.getRandomValues(new Uint8Array(_ENTROPY_BYTES)));
                pkBuf = wasmRuntime.withBytes(loaded, publicKey);
                // withBytes needs a non-empty buffer for a valid ptr; pass a
                // 1-byte scratch with len 0 when the input is empty.
                msgBuf = wasmRuntime.withBytes(loaded, data.length ? data : new Uint8Array(1));
                lblBuf = wasmRuntime.withBytes(loaded, _label.length ? _label : new Uint8Array(1));
                outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(k || 1));
                lenBuf = wasmRuntime.withBytes(loaded, new Uint8Array(4));
                const rc = wasmRuntime.run(loaded, 'rsa_oaep_enc', [
                    hashId,
                    pkBuf.ptr,
                    publicKey.length,
                    msgBuf.ptr,
                    data.length,
                    lblBuf.ptr,
                    _label.length,
                    outBuf.ptr,
                    lenBuf.ptr,
                ]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmRsa.encrypt rc=${rc}`);
                    return false;
                }
                const ctLen = _readI32(loaded, lenBuf.ptr);
                const len = ctLen > 0 ? ctLen : k;
                if (len <= 0) {
                    console.error('[crypto] FAIL: wasmRsa.encrypt: bad ct length');
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, len);
            } catch (e) {
                console.error('[crypto] FAIL: wasmRsa.encrypt: ' + (e && e.message));
                return false;
            } finally {
                if (lenBuf) {
                    lenBuf.free();
                }
                if (outBuf) {
                    outBuf.free();
                }
                if (lblBuf) {
                    lblBuf.free();
                }
                if (msgBuf) {
                    msgBuf.free();
                }
                if (pkBuf) {
                    pkBuf.free();
                }
            }
        }

        /**
         * RSA-OAEP decrypt `ct` under `privateKey` (BearSSL wire format).
         * @param {Uint8Array} privateKey
         * @param {Uint8Array} ct
         * @param {Uint8Array} [label]
         * @param {256|384|512} [hash]
         * @returns {Promise<Uint8Array|false>}
         */
        async function decrypt(privateKey, ct, label, hash) {
            if (!(privateKey instanceof Uint8Array) || privateKey.length < 4) {
                console.error('[crypto] INVALID: wasmRsa.decrypt: bad privateKey');
                return false;
            }
            if (!(ct instanceof Uint8Array) || ct.length === 0) {
                console.error('[crypto] INVALID: wasmRsa.decrypt: bad ct');
                return false;
            }
            const _label = label || new Uint8Array(0);
            if (!(_label instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmRsa.decrypt: label must be a Uint8Array');
                return false;
            }
            const hashId = _resolveHash(hash);
            if (hashId === null) {
                console.error('[crypto] INVALID: wasmRsa.decrypt: bad hash');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            let skBuf;
            let ctBuf;
            let lblBuf;
            let outBuf;
            let lenBuf;
            try {
                skBuf = wasmRuntime.withBytes(loaded, privateKey);
                ctBuf = wasmRuntime.withBytes(loaded, ct);
                lblBuf = wasmRuntime.withBytes(loaded, _label.length ? _label : new Uint8Array(1));
                outBuf = wasmRuntime.withBytes(loaded, new Uint8Array(ct.length));
                lenBuf = wasmRuntime.withBytes(loaded, new Uint8Array(4));
                const rc = wasmRuntime.run(loaded, 'rsa_oaep_dec', [
                    hashId,
                    skBuf.ptr,
                    privateKey.length,
                    ctBuf.ptr,
                    ct.length,
                    lblBuf.ptr,
                    _label.length,
                    outBuf.ptr,
                    lenBuf.ptr,
                ]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmRsa.decrypt rc=${rc}`);
                    return false;
                }
                const ptLen = _readI32(loaded, lenBuf.ptr);
                if (ptLen < 0 || ptLen > ct.length) {
                    console.error('[crypto] FAIL: wasmRsa.decrypt: bad pt length');
                    return false;
                }
                return wasmRuntime.readBytes(loaded, outBuf.ptr, ptLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmRsa.decrypt: ' + (e && e.message));
                return false;
            } finally {
                if (lenBuf) {
                    lenBuf.free();
                }
                if (outBuf) {
                    outBuf.free();
                }
                if (lblBuf) {
                    lblBuf.free();
                }
                if (ctBuf) {
                    ctBuf.free();
                }
                if (skBuf) {
                    skBuf.free();
                }
            }
        }

        /**
         * Sign `data` with `privateKey` (BearSSL wire format) using RSA-PSS
         * (`scheme: 'PSS'`) or RSASSA-PKCS1-v1_5 (`scheme: 'PKCS1'`, legacy —
         * emits a DEPRECATED warning). The message is hashed with the named
         * SHA-2 internally. The PSS salt is drawn from `crypto.getRandomValues`.
         * @param {Uint8Array} privateKey
         * @param {Uint8Array} data
         * @param {'PSS'|'PKCS1'} scheme
         * @param {256|384|512} [hash]
         * @returns {Promise<Uint8Array|false>}
         */
        async function sign(privateKey, data, scheme, hash) {
            if (!(privateKey instanceof Uint8Array) || privateKey.length < 4) {
                console.error('[crypto] INVALID: wasmRsa.sign: bad privateKey');
                return false;
            }
            if (!(data instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmRsa.sign: data must be a Uint8Array');
                return false;
            }
            if (scheme !== 'PSS' && scheme !== 'PKCS1') {
                console.error('[crypto] INVALID: wasmRsa.sign: scheme must be PSS or PKCS1');
                return false;
            }
            const hashId = _resolveHash(hash);
            if (hashId === null) {
                console.error('[crypto] INVALID: wasmRsa.sign: bad hash');
                return false;
            }
            if (scheme === 'PKCS1') {
                console.warn(
                    '[crypto] DEPRECATED: wasmRsa.sign PKCS1 (RSASSA-PKCS1-v1_5); prefer PSS',
                );
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            const schemeEnum = _SCHEME[scheme];
            // sig output cap: the modulus size. We don't have the public key
            // here, but the signature is exactly k bytes; cap generously at the
            // largest supported modulus (4096-bit = 512 bytes).
            const SIG_CAP = 512;
            let skBuf;
            let hashBuf;
            let sigBuf;
            let lenBuf;
            try {
                const digest = await _digest(hashId, data);
                if (scheme === 'PSS') {
                    // EMSA-PSS salt (sLen = hLen) drawn from the entropy seam.
                    _stageEntropy(loaded, crypto.getRandomValues(new Uint8Array(_ENTROPY_BYTES)));
                }
                skBuf = wasmRuntime.withBytes(loaded, privateKey);
                hashBuf = wasmRuntime.withBytes(loaded, digest);
                sigBuf = wasmRuntime.withBytes(loaded, new Uint8Array(SIG_CAP));
                lenBuf = wasmRuntime.withBytes(loaded, new Uint8Array(4));
                const rc = wasmRuntime.run(loaded, 'rsa_sign', [
                    schemeEnum,
                    hashId,
                    skBuf.ptr,
                    privateKey.length,
                    hashBuf.ptr,
                    digest.length,
                    sigBuf.ptr,
                    lenBuf.ptr,
                ]);
                if (rc !== 0) {
                    console.error(`[crypto] FAIL: wasmRsa.sign rc=${rc}`);
                    return false;
                }
                const sigLen = _readI32(loaded, lenBuf.ptr);
                if (sigLen <= 0 || sigLen > SIG_CAP) {
                    console.error('[crypto] FAIL: wasmRsa.sign: bad sig length');
                    return false;
                }
                return wasmRuntime.readBytes(loaded, sigBuf.ptr, sigLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmRsa.sign: ' + (e && e.message));
                return false;
            } finally {
                if (lenBuf) {
                    lenBuf.free();
                }
                if (sigBuf) {
                    sigBuf.free();
                }
                if (hashBuf) {
                    hashBuf.free();
                }
                if (skBuf) {
                    skBuf.free();
                }
            }
        }

        /**
         * Verify `signature` over `data` against `publicKey` (BearSSL wire
         * format) using RSA-PSS or RSASSA-PKCS1-v1_5. The message is hashed with
         * the named SHA-2 internally. Resolves `false` on any invalid input,
         * tampered material, or internal failure (no-throw).
         * @param {Uint8Array} publicKey
         * @param {Uint8Array} signature
         * @param {Uint8Array} data
         * @param {'PSS'|'PKCS1'} scheme
         * @param {256|384|512} [hash]
         * @returns {Promise<boolean>}
         */
        async function verify(publicKey, signature, data, scheme, hash) {
            if (!(publicKey instanceof Uint8Array) || publicKey.length < 4) {
                console.error('[crypto] INVALID: wasmRsa.verify: bad publicKey');
                return false;
            }
            if (!(signature instanceof Uint8Array) || signature.length === 0) {
                console.error('[crypto] INVALID: wasmRsa.verify: bad signature');
                return false;
            }
            if (!(data instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmRsa.verify: data must be a Uint8Array');
                return false;
            }
            if (scheme !== 'PSS' && scheme !== 'PKCS1') {
                console.error('[crypto] INVALID: wasmRsa.verify: scheme must be PSS or PKCS1');
                return false;
            }
            const hashId = _resolveHash(hash);
            if (hashId === null) {
                console.error('[crypto] INVALID: wasmRsa.verify: bad hash');
                return false;
            }
            const loaded = await _load();
            if (!loaded) {
                return false;
            }
            const schemeEnum = _SCHEME[scheme];
            let pkBuf;
            let sigBuf;
            let hashBuf;
            try {
                const digest = await _digest(hashId, data);
                pkBuf = wasmRuntime.withBytes(loaded, publicKey);
                sigBuf = wasmRuntime.withBytes(loaded, signature);
                hashBuf = wasmRuntime.withBytes(loaded, digest);
                const rc = wasmRuntime.run(loaded, 'rsa_verify', [
                    schemeEnum,
                    hashId,
                    pkBuf.ptr,
                    publicKey.length,
                    sigBuf.ptr,
                    signature.length,
                    hashBuf.ptr,
                    digest.length,
                ]);
                return rc === 0;
            } catch (e) {
                console.error('[crypto] FAIL: wasmRsa.verify: ' + (e && e.message));
                return false;
            } finally {
                if (hashBuf) {
                    hashBuf.free();
                }
                if (sigBuf) {
                    sigBuf.free();
                }
                if (pkBuf) {
                    pkBuf.free();
                }
            }
        }

        return { isAvailable, generateKey, encrypt, decrypt, sign, verify };
    },
};
