// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @awacloud/fw-wasm-crypto — WASM module loader seam.
 *
 * This module is the single seam by which `@awacloud/fw` consumes the freestanding
 * crypto modules emitted into `dist/<module>.{simd,scalar}.wasm` by
 * `tools/wasm-crypto build`. It is ESM, JSDoc-typed, has ZERO npm runtime
 * dependencies, and performs NO work at import time (no top-level await, no
 * side effects): a module is instantiated only on an explicit async call.
 *
 * ─── Frozen ABI contract (memory / alloc / free + per-target exports) ───
 *
 * Every `dist/<module>.<variant>.wasm` is a freestanding wasm32 reactor with
 * ZERO imports that MUST export the ABI triple:
 *   - `memory` — the module's `WebAssembly.Memory` (linear memory, bump-allocated).
 *   - `alloc(size: i32) -> i32` — pointer into `memory`, or `0` on failure.
 *   - `free(ptr: i32) -> void`  — release boundary (the bump allocator from the
 *     shim's `_arena.h` may no-op; the export MUST still exist).
 * …plus the per-target algorithm functions named in the matching
 * `targets.json` entry's `exports[]` (e.g. `aead_seal`/`aead_open`, `sha2`,
 * `mlkem_keygen`, …). The loader does NOT hard-code algorithm names: callers
 * declare the algorithm exports they require via `expectedExports`.
 *
 * This is the SAME triple `tools/wasm-crypto build` asserts post-link
 * (`memory`/`alloc`/`free` + target exports) and the same triple that
 * fw/BATCH_11's 18 wrappers import. The loader reconciles them: the wrappers
 * MUST bind to `alloc`/`free`/`memory` + the named exports EXACTLY as frozen
 * here. The fw-side consumption point stays
 * `packages/front/fw/src/crypto/wasm/` (preserving the ACVP `*.wasm.js` gate);
 * this loader does not move it.
 *
 * Variant selection is runtime simd-vs-scalar (`supportsSimd()`), overridable
 * per call via `opts.variant`.
 */

/**
 * @typedef {"simd" | "scalar"} WasmVariant
 */

/**
 * @typedef {object} WasmModuleHandle
 * @property {WebAssembly.Instance} instance
 * @property {WebAssembly.Memory} memory     the module's exported memory
 * @property {(size: number) => number} alloc
 * @property {(ptr: number) => void} free
 * @property {Record<string, Function>} exports  all exported functions (incl. algo fns)
 * @property {WasmVariant} variant            which variant was instantiated
 */

/**
 * @typedef {object} LoadOptions
 * @property {WasmVariant} [variant]   force a variant; default = runtime selection
 * @property {(name: string) => Promise<Uint8Array>} [fetchBytes]
 *   injectable byte source (test seam); default reads
 *   `<module>.<variant>.wasm` from `dist/` via {@link resolveDistUrl}.
 */

/**
 * The canonical minimal simd128 probe module: a single function body that
 * pushes a `v128.const` and drops it. `WebAssembly.validate` returns true iff
 * the host engine accepts the simd128 proposal — no crypto code instantiated.
 */
const SIMD_PROBE = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // header
    0x01, 0x04, 0x01, 0x60, 0x00, 0x00, // type: () -> ()
    0x03, 0x02, 0x01, 0x00, // func: one, type 0
    0x0a, 0x17, 0x01, 0x15, 0x00, // code section, one body
    0xfd, 0x0c, // v128.const
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x1a, // drop
    0x0b, // end
]);

/** @type {boolean | undefined} memoized result of {@link supportsSimd}. */
let simdSupport;

/**
 * True when the host engine validates a minimal simd128 module. Uses
 * `WebAssembly.validate` (no instantiation of crypto code). Memoized after the
 * first call.
 * @returns {boolean}
 */
export function supportsSimd() {
    if (simdSupport === undefined) {
        try {
            simdSupport = WebAssembly.validate(SIMD_PROBE);
        } catch {
            simdSupport = false;
        }
    }
    return simdSupport;
}

/**
 * Resolve the variant to load: `opts.variant` if given, else `"simd"` when
 * {@link supportsSimd} is true, else `"scalar"`.
 * @param {LoadOptions} [opts]
 * @returns {WasmVariant}
 */
export function selectVariant(opts) {
    if (opts && opts.variant) {
        return opts.variant;
    }
    return supportsSimd() ? 'simd' : 'scalar';
}

/**
 * Compute the dist URL for a module variant, relative to this module
 * (`import.meta.url`). Pure; exported for test + wrapper reuse. Stays
 * browser-safe by building a `URL` (no `node:fs`/`node:path`, no path math —
 * so no Windows absolute-path doubling is possible).
 * @param {string} wasmModule  e.g. `"chacha20poly1305"` (no extension)
 * @param {WasmVariant} variant
 * @returns {URL}  `<pkg>/dist/<wasmModule>.<variant>.wasm`
 */
export function resolveDistUrl(wasmModule, variant) {
    return new URL(`../dist/${wasmModule}.${variant}.wasm`, import.meta.url);
}

/**
 * Default byte reader: fetch the resolved dist URL and return its bytes.
 * @param {string} wasmModule
 * @param {WasmVariant} variant
 * @returns {Promise<Uint8Array>}
 */
async function fetchDistBytes(wasmModule, variant) {
    const url = resolveDistUrl(wasmModule, variant);
    const res = await fetch(url);
    if (!res || !res.ok) {
        const status = res ? res.status : 'no-response';
        throw new Error(
            `[fw-wasm-crypto] failed to fetch ${wasmModule}.${variant}.wasm ` +
            `(${url.href}): ${status}`,
        );
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
}

/**
 * Instantiate one crypto module. ASYNC and OPT-IN (never auto-runs at import).
 * Uses `WebAssembly.instantiate` (the synchronous constructors are banned).
 *
 * After instantiation it asserts, throwing a descriptive error on any miss:
 *   (a) the module declares ZERO imports
 *       (`WebAssembly.Module.imports(mod).length === 0`),
 *   (b) the instance exports `memory` (a `WebAssembly.Memory`),
 *   (c) the instance exports `alloc` and `free` as functions,
 *   (d) every entry of `expectedExports` is an exported function.
 * This mirrors the builder's post-link assertions so the seam catches ABI
 * drift at load time.
 *
 * @param {string} wasmModule        e.g. `"chacha20poly1305"` (no extension)
 * @param {string[]} expectedExports algo fns the caller requires, beyond memory/alloc/free
 * @param {LoadOptions} [opts]
 * @returns {Promise<WasmModuleHandle>}
 * @throws {Error} on missing ABI export, present import, or fetch failure.
 */
export async function loadWasmModule(wasmModule, expectedExports, opts) {
    const variant = selectVariant(opts);
    const read = opts && opts.fetchBytes ? opts.fetchBytes : fetchDistBytes;
    const bytes = await read(wasmModule, variant);

    const module = await WebAssembly.compile(bytes);

    const imports = WebAssembly.Module.imports(module);
    if (imports.length !== 0) {
        const names = imports.map((i) => `${i.module}.${i.name}`).join(', ');
        throw new Error(
            `[fw-wasm-crypto] ${wasmModule}.${variant}.wasm violates the ` +
            `zero-import invariant: ${imports.length} import(s) declared ` +
            `(${names}). Freestanding crypto modules must import nothing.`,
        );
    }

    const result = await WebAssembly.instantiate(module, {});
    const instance = result instanceof WebAssembly.Instance ? result : result.instance;
    const exports = instance.exports;

    if (!(exports.memory instanceof WebAssembly.Memory)) {
        throw new Error(
            `[fw-wasm-crypto] ${wasmModule}.${variant}.wasm is missing the ` +
            `'memory' ABI export (WebAssembly.Memory).`,
        );
    }
    for (const abi of ['alloc', 'free']) {
        if (typeof exports[abi] !== 'function') {
            throw new Error(
                `[fw-wasm-crypto] ${wasmModule}.${variant}.wasm is missing the ` +
                `'${abi}' ABI export (must be an exported function).`,
            );
        }
    }
    for (const name of expectedExports || []) {
        if (typeof exports[name] !== 'function') {
            throw new Error(
                `[fw-wasm-crypto] ${wasmModule}.${variant}.wasm is missing the ` +
                `expected export '${name}' (must be an exported function).`,
            );
        }
    }

    return {
        instance,
        memory: /** @type {WebAssembly.Memory} */ (exports.memory),
        alloc: /** @type {(size: number) => number} */ (exports.alloc),
        free: /** @type {(ptr: number) => void} */ (exports.free),
        exports: /** @type {Record<string, Function>} */ (exports),
        variant,
    };
}
