// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmCmac` — WASM-loaded AES-CMAC (NIST SP 800-38B / RFC 4493).
 *
 * AES-CMAC is **not** in WebCrypto; it is exclusively served by this WASM tier
 * (or the pure-JS [`cmac`](../mode/cmac.js) module). This wrapper loads the
 * colocated `cmac` binary (vendored from `@awacloud/fw-wasm-crypto`) — own AES-CMAC framing
 * (`csrc/cmac/cmac.c`) over the vendored constant-time BearSSL `aes_ct64`
 * block cipher — through {@link wasmRuntime} and exposes an async, `Uint8Array`,
 * no-throw surface.
 *
 * The `cmac` target is **scalar-only** (`simd:false` in `targets.json` — the
 * AES block is bitsliced ct64, not simd128); there is no `cmac.simd.wasm`.
 * `wasmCmac` therefore forces `{ variant: 'scalar' }` when loading.
 *
 * ─── WASM ABI (frozen by `@awacloud/fw-wasm-crypto`, target `cmac`) ───
 *
 * Beyond the canonical `memory`/`alloc`/`free` triple, the binary exports:
 *
 *   aes_cmac(
 *     keyPtr, keyLen,    // AES key: 16/24/32 bytes
 *     msgPtr, msgLen,    // message: any byte length (0 is valid)
 *     tagPtr, tagLen     // output buffer pointer + desired output bytes (1..16)
 *   ) -> i32             // 0 = OK, non-zero = bad params / internal error
 *
 * The full 16-byte CMAC tag is computed and then the first `tagLen` bytes are
 * written to `tagPtr`. AES-128/192/256 are all supported (`keyLen` selects the
 * variant). `msgLen` 0 is valid (empty-message vector).
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; the binary is
 * fetched by the package loader (via `import.meta.url`) inside `wasmRuntime`.
 * ALL constants live inside `factory()` so `factory.toString()` carries no
 * captured binding (`fw/no-factory-capture`).
 */

/**
 * Public surface of `wasmCmac.factory()`.
 * @typedef {object} WasmCmacAPI
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {(key: Uint8Array, message: Uint8Array, tagLen?: number) => Promise<Uint8Array|false>} mac
 *   Compute the AES-CMAC tag of `message` under `key`. `tagLen` defaults to
 *   16. Returns `false` on invalid params, load failure, or WASM error.
 * @property {(key: Uint8Array, message: Uint8Array, tag: Uint8Array) => Promise<boolean>} verify
 *   Recompute the tag and compare with `tag` in constant time.
 */

import { wasmRuntime } from './runtime.js';

export const wasmCmac = {
    name: 'wasmCmac',
    version: '1.0.0',
    type: 'fw.crypto.wasm',
    dependencies: ['wasmRuntime'],
    deps: [wasmRuntime],

    /**
     * @param {import('./runtime.js').WasmRuntimeAPI} wasmRuntime
     * @returns {WasmCmacAPI}
     */
    factory(wasmRuntime) {

        // ── constants (inside factory — fw/no-factory-capture) ──────────────
        const _MODULE = 'cmac';
        const _FN = 'aes_cmac';
        const _EXPECTED = ['aes_cmac'];
        // The `cmac` target ships SCALAR ONLY (`simd:false` in
        // fw-wasm-crypto/targets.json — AES block is bitsliced ct64, not simd128).
        // There is no `cmac.simd.wasm`; force scalar or the runtime's default
        // simd selection would attempt to fetch a non-existent file.
        /** @type {import('./runtime.js').WasmLoadOptions} */
        const _LOAD_OPTS = { variant: 'scalar' };
        // Valid AES key lengths (bytes): 128/192/256 bits.
        const _VALID_KEY_LENS = [16, 24, 32];
        // Full CMAC tag is always 16 bytes; tagLen truncates it.
        const _TAG_BYTES = 16;
        // SP 800-38B §6.4 allows tagLen ∈ [1, 16] bytes.
        const _MIN_TAG_LEN = 1;
        const _MAX_TAG_LEN = 16;

        /**
         * Whether the WASM tier can run here.
         * @returns {boolean}
         */
        function isAvailable() {
            return wasmRuntime.isAvailable();
        }

        /**
         * Constant-time equality over two byte arrays. Scans the full length of
         * `a`; a length mismatch short-circuits to `false` (length is not secret)
         * without leaking index-dependent timing.
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
         * Compute the AES-CMAC tag.
         *
         * @param {Uint8Array} key     AES key: 16/24/32 bytes.
         * @param {Uint8Array} message Input message (any length, including 0).
         * @param {number} [tagLen=16] Output byte count, 1..16.
         * @returns {Promise<Uint8Array|false>}
         */
        async function mac(key, message, tagLen) {
            // ── parameter validation ─────────────────────────────────────────
            if (!(key instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmCmac: key must be a Uint8Array');
                return false;
            }
            if (!_VALID_KEY_LENS.includes(key.length)) {
                console.error('[crypto] INVALID: wasmCmac: key.length must be 16, 24, or 32');
                return false;
            }
            if (!(message instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmCmac: message must be a Uint8Array');
                return false;
            }
            const tLen = (tagLen === undefined || tagLen === null) ? _TAG_BYTES : tagLen;
            if (
                typeof tLen !== 'number' ||
                !Number.isInteger(tLen) ||
                tLen < _MIN_TAG_LEN ||
                tLen > _MAX_TAG_LEN
            ) {
                console.error('[crypto] INVALID: wasmCmac: tagLen must be an integer in [1, 16]');
                return false;
            }

            const loaded = await wasmRuntime.load(_MODULE, _EXPECTED, _LOAD_OPTS);
            if (loaded === false) {
                // load() already logged the cause.
                return false;
            }

            // alloc(0) may return 0; pass a 1-byte stand-in for zero-length
            // messages so the pointer is non-null while the WASM side honors the
            // real msgLen=0.
            const keyIn = wasmRuntime.withBytes(loaded, key);
            const msgIn = wasmRuntime.withBytes(
                loaded,
                message.length ? message : new Uint8Array(1),
            );
            // Allocate the full 16-byte tag buffer; the WASM fills `tLen` bytes.
            const tagOut = wasmRuntime.withBytes(loaded, new Uint8Array(_TAG_BYTES));
            try {
                const status = wasmRuntime.run(loaded, _FN, [
                    keyIn.ptr, key.length,
                    msgIn.ptr, message.length,
                    tagOut.ptr, tLen,
                ]);
                if (status !== 0) {
                    console.error('[crypto] FAIL: wasmCmac.mac: aes_cmac status ' + status);
                    return false;
                }
                // Copy the tag OUT of linear memory (never alias reused WASM memory).
                return wasmRuntime.readBytes(loaded, tagOut.ptr, tLen);
            } catch (e) {
                console.error('[crypto] FAIL: wasmCmac.mac: ' + (e && e.message));
                return false;
            } finally {
                tagOut.free();
                msgIn.free();
                keyIn.free();
            }
        }

        /**
         * Constant-time AES-CMAC verification.
         *
         * Recomputes the full-length tag from `key`/`message`, then compares it
         * with `tag` in constant time. Returns `false` when params are invalid,
         * the binary cannot load, or the tags differ.
         *
         * @param {Uint8Array} key     AES key: 16/24/32 bytes.
         * @param {Uint8Array} message Input message.
         * @param {Uint8Array} tag     Expected tag (1..16 bytes).
         * @returns {Promise<boolean>}
         */
        async function verify(key, message, tag) {
            if (!(tag instanceof Uint8Array)) {
                console.error('[crypto] INVALID: wasmCmac: tag must be a Uint8Array');
                return false;
            }
            const computed = await mac(key, message, tag.length);
            if (computed === false) {
                return false;
            }
            return _ctEqual(computed, tag);
        }

        return { isAvailable, mac, verify };
    },
};
