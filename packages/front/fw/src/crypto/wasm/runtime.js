// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `wasmRuntime` — the shared fw adapter every `crypto/wasm/*`
 * wrapper loads its binary through.
 *
 * ARCHITECTURE (2026-06-22, session decision — supersedes the BATCH_11 ERRATA's
 * "thin adapter over @awacloud/fw-wasm-crypto" model): the `.wasm` binaries are
 * **colocated assets** committed next to this module
 * (`<wasmModule>.{simd,scalar}.wasm`), copied from `@awacloud/fw-wasm-crypto`'s
 * `dist/`. fw is **self-contained at runtime** — it fetches the colocated asset
 * by name, exactly like `io/compress/brotli_dict_words.js` fetches
 * `brotli_dict.bin`. There is NO runtime dependency on `@awacloud/fw-wasm-crypto`.
 * This module owns the whole loader: lazy async `WebAssembly.compile`, runtime
 * simd-vs-scalar selection, the zero-import invariant, and the
 * `memory`/`alloc`/`free` + `expectedExports` ABI handshake — plus the fw layer:
 * the no-throw async contract, linear-memory marshalling (`withBytes`/
 * `readBytes`), module metadata, and the security invariant.
 *
 * ─── Provenance of the colocated `.wasm` ───
 *
 * The bytes are build artifacts of the `@awacloud/fw-wasm-crypto` package
 * (`dist/<wasmModule>.{simd,scalar}.wasm`, themselves emitted by
 * `tools/wasm-crypto build`). To refresh them: run `bun cli.ts wasm-crypto build`
 * against `packages/front/fw-wasm-crypto`, then copy the produced
 * `dist/*.scalar.wasm` + `dist/*.simd.wasm` next to this module. They are raw
 * `.wasm` (not base64-embedded) so the browser/worker cache can share the asset
 * across page loads — the same rationale as `brotli_dict.bin`.
 *
 * ─── Canonical WASM ABI (every colocated binary exports) ───
 *
 * Every `<wasmModule>.<variant>.wasm` is a freestanding wasm32 reactor with ZERO
 * imports that MUST export the ABI triple:
 *   - `memory` — exported `WebAssembly.Memory` (linear memory, bump-allocated);
 *   - `alloc(size: i32) -> i32` — pointer into `memory`, `0` on failure;
 *   - `free(ptr: i32) -> void` — release boundary (bump allocator may no-op).
 * …plus the per-algorithm functions named in the caller's `expectedExports`.
 * Algorithm functions operate on `(ptr, len)` pairs into `memory` and write
 * results to caller-provided output pointers; they return an `i32` status
 * (`0` = OK, non-zero = failure).
 *
 * ─── SIMD ───
 *
 * `load` fetches `<wasmModule>.simd.wasm` when the host validates simd128
 * (`hasSimd()`), else `<wasmModule>.scalar.wasm`; override per call via
 * `opts.variant`. Modules that ship only a scalar build (no `.simd.wasm`
 * colocated) MUST be loaded with `{ variant: 'scalar' }`. WASM here is
 * portable-SIMD **software** speed — NOT hardware crypto acceleration (no
 * AES-NI/SHA-NI exposure); that is WebCrypto's domain.
 *
 * Worker-safe: pure factory; `WebAssembly` exists in workers; binary bytes are
 * fetched by name (resolved from `import.meta.url`), not closed over from the
 * main thread.
 */

/**
 * Handle returned by {@link WasmRuntimeAPI.load} on success.
 * @typedef {object} WasmLoaded
 * @property {WebAssembly.Instance} instance
 * @property {WebAssembly.Memory} memory   the module's exported linear memory
 * @property {WebAssembly.Memory} mem      alias of `memory`
 * @property {(size: number) => number} alloc
 * @property {(ptr: number) => void} free
 * @property {Record<string, Function>} exports  all exports (incl. algo fns)
 * @property {"simd" | "scalar"} variant  which variant was instantiated
 */

/**
 * A `{ ptr, len, free }` triple describing a buffer copied into linear memory.
 * @typedef {object} WasmBuf
 * @property {number} ptr   pointer into the handle's `memory`
 * @property {number} len   byte length written
 * @property {() => void} free  releases `ptr` via the handle's `free` export
 */

/**
 * Per-call load options.
 * @typedef {object} WasmLoadOptions
 * @property {"simd" | "scalar"} [variant]  force a variant; default = runtime selection
 * @property {(wasmModule: string, variant: string) => Promise<Uint8Array>} [fetchBytes]
 *   injectable byte source (test seam); default fetches the colocated
 *   `<wasmModule>.<variant>.wasm` relative to this module.
 */

/**
 * Public surface of `wasmRuntime.factory()`.
 * @typedef {object} WasmRuntimeAPI
 * @property {() => boolean} isAvailable  Whether `WebAssembly` is present.
 * @property {() => Promise<boolean>} hasSimd  Whether the host validates simd128.
 * @property {(wasmModule: string, expectedExports?: string[], opts?: WasmLoadOptions) => Promise<WasmLoaded|false>} load
 *   Load a colocated module BY NAME; resolves a handle or `false`.
 * @property {(loaded: WasmLoaded, input: Uint8Array) => WasmBuf} withBytes
 *   Copy `input` into linear memory; returns ptr/len + a `free()` thunk.
 * @property {(loaded: WasmLoaded, ptr: number, len: number) => Uint8Array} readBytes
 *   Copy `len` bytes OUT of linear memory at `ptr` into a fresh `Uint8Array`.
 * @property {(loaded: WasmLoaded, fnName: string, args: number[]) => number} run
 *   Call an export and return its `i32` status. A throw propagates to the
 *   caller's try/catch (the per-algo wrapper's no-throw boundary).
 */

export const wasmRuntime = {
    name: 'wasmRuntime',
    version: '2.0.0',
    type: 'fw.crypto.wasm',
    dependencies: [],

    /** @returns {WasmRuntimeAPI} */
    factory() {

        // Availability guard + all constants live INSIDE the factory so the
        // closure is serializable to a Worker (fw/no-factory-capture).
        const _hasWasm = typeof WebAssembly !== 'undefined';

        // Minimal simd128 probe: one function pushing a `v128.const` and
        // dropping it. `WebAssembly.validate` is true iff the host accepts the
        // simd128 proposal — no crypto code is instantiated.
        const SIMD_PROBE = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
            0x03, 0x02, 0x01, 0x00,
            0x0a, 0x17, 0x01, 0x15, 0x00,
            0xfd, 0x0c,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x1a,
            0x0b,
        ]);

        /** @type {boolean|undefined} memoized simd128 support. */
        let _simd;

        /**
         * Lazy, memoised handle to the fw wasm capability seam
         * (`sanity/wasm-gate.js`). A dynamic `import()` INSIDE the factory
         * keeps the closure worker-serializable (`fw/no-factory-capture`) — a
         * module-scope static import would be a capture and defeat that.
         * @type {Promise<{gate: object, cap: object}>|undefined}
         */
        let _gateHandle;

        /**
         * Resolve (once, memoised) the `{ gate, cap }` pair every
         * compile/instantiate/module-reflection call routes through. Calling
         * `captureRealEvaluators()` here is safe whether `lockdown()` has run
         * yet or not, and whether it has already run once — it is idempotent
         * and always keeps the first (guaranteed pre-poison) capture.
         * @returns {Promise<{gate: object, cap: object}>}
         */
        function _loadGate() {
            if (!_gateHandle) {
                _gateHandle = import('../../sanity/wasm-gate.js').then((gate) => {
                    gate.captureRealEvaluators();
                    return { gate, cap: gate.issueCapability() };
                });
            }
            return _gateHandle;
        }

        /**
         * Whether `WebAssembly` is available in this environment.
         * @returns {boolean}
         */
        function isAvailable() {
            return _hasWasm;
        }

        /** Synchronous memoized simd128 probe. @returns {boolean} */
        function _supportsSimd() {
            if (_simd === undefined) {
                try {
                    _simd = WebAssembly.validate(SIMD_PROBE);
                } catch {
                    _simd = false;
                }
            }
            return _simd;
        }

        /**
         * Whether the host engine validates a minimal simd128 module. Async to
         * honor the prescriptive contract (callers may `await` it uniformly
         * with `load`).
         * @returns {Promise<boolean>}
         */
        async function hasSimd() {
            if (!_hasWasm) {
                return false;
            }
            try {
                return _supportsSimd();
            } catch {
                return false;
            }
        }

        /**
         * Resolve the variant: `opts.variant` if given, else `"simd"` when the
         * host supports it, else `"scalar"`.
         * @param {WasmLoadOptions} [opts]
         * @returns {"simd" | "scalar"}
         */
        function _selectVariant(opts) {
            if (opts && opts.variant) {
                return opts.variant;
            }
            return _supportsSimd() ? 'simd' : 'scalar';
        }

        /**
         * Fetch the colocated `<wasmModule>.<variant>.wasm` next to this module
         * (resolved via `import.meta.url`, like `brotli_dict_words.js`). Pure
         * `URL` build — browser/worker safe, no `node:*`.
         * @param {string} wasmModule
         * @param {string} variant
         * @returns {Promise<Uint8Array>}
         */
        async function _fetchBytes(wasmModule, variant) {
            const url = new URL(
                './' + wasmModule + '.' + variant + '.wasm',
                import.meta.url,
            );
            const res = await fetch(url);
            if (!res || !res.ok) {
                const status = res ? res.status : 'no-response';
                throw new Error(
                    'fetch ' + wasmModule + '.' + variant + '.wasm failed: ' + status,
                );
            }
            return new Uint8Array(await res.arrayBuffer());
        }

        /**
         * Load a colocated crypto module BY NAME: fetch its `.wasm` bytes, lazy
         * async compile, assert the zero-import invariant + the
         * `memory`/`alloc`/`free` + `expectedExports` ABI, and instantiate.
         * No-throw: any failure (fetch/compile/instantiate/ABI miss) is caught
         * and surfaced as `false`.
         *
         * SECURITY INVARIANT: `wasmModule` is a NAME selecting one of the
         * colocated, build-time-vendored binaries — never caller-supplied bytes.
         * There is deliberately no public method that compiles arbitrary input.
         * Compile / instantiate / module-reflection are routed through the fw
         * wasm capability seam (`sanity/wasm-gate.js`) — the only path left open
         * once `lockdown()` poisons the ambient `WebAssembly` evaluators (the
         * async four, and, since fw-sanity W0, the synchronous `Module`/
         * `Instance` constructors too), so this loader keeps working under
         * lockdown while caller-supplied bytes still have no route in.
         * `opts.fetchBytes` is a documented test seam before `lockdown()`; the
         * gate neutralises it once armed (`assertByteSource`), so it can never
         * become a byte-injection channel into the one call site that holds the
         * capability. A Worker or an alternate origin threads an absolute base
         * URL instead (mirroring this module's own `import.meta.url`) — never
         * `fetchBytes`.
         *
         * @param {string} wasmModule        e.g. `"sha2"` (no extension/path)
         * @param {string[]} [expectedExports]  algo fns the caller requires
         * @param {WasmLoadOptions} [opts]
         * @returns {Promise<WasmLoaded|false>}
         */
        async function load(wasmModule, expectedExports, opts) {
            if (!_hasWasm) {
                console.error('[crypto] NOT READY: WebAssembly unavailable');
                return false;
            }
            try {
                const { gate, cap } = await _loadGate();
                gate.assertByteSource(opts);

                const variant = _selectVariant(opts);
                const read = opts && opts.fetchBytes ? opts.fetchBytes : _fetchBytes;
                const bytes = await read(wasmModule, variant);

                const module = await gate.compile(cap, bytes);

                const imports = gate.moduleImports(cap, module);
                if (imports.length !== 0) {
                    const names = imports.map((i) => i.module + '.' + i.name).join(', ');
                    throw new Error(
                        wasmModule + '.' + variant + '.wasm violates the zero-import '
                        + 'invariant: ' + imports.length + ' import(s) (' + names + ')',
                    );
                }

                const result = await gate.instantiate(cap, module, {});
                // Post-lockdown, the global `WebAssembly.Instance` is a throwing
                // shim (`poisonSyncConstructors`), so `instanceof` would silently
                // return false rather than throw (ORCHESTRATOR RULING, task 03: the
                // gate exposes no captured `Instance` — the export surface is
                // frozen at 8, FINDINGS §d.3). Test the SHAPE instead: a
                // `{module, instance}` source carries a truthy `.instance`; a bare
                // `Instance` does not.
                const instance = result.instance ? result.instance : result;
                const ex = instance.exports;

                if (!(ex.memory instanceof WebAssembly.Memory)) {
                    throw new Error(
                        wasmModule + '.' + variant + ".wasm missing 'memory' ABI export",
                    );
                }
                for (const abi of ['alloc', 'free']) {
                    if (typeof ex[abi] !== 'function') {
                        throw new Error(
                            wasmModule + '.' + variant + ".wasm missing '" + abi + "' ABI export",
                        );
                    }
                }
                for (const name of expectedExports || []) {
                    if (typeof ex[name] !== 'function') {
                        throw new Error(
                            wasmModule + '.' + variant + ".wasm missing expected export '" + name + "'",
                        );
                    }
                }

                return {
                    instance,
                    memory: ex.memory,
                    mem: ex.memory,
                    alloc: ex.alloc,
                    free: ex.free,
                    exports: ex,
                    variant,
                };
            } catch (e) {
                console.error(
                    '[crypto] FAIL: wasmRuntime.load: ' + (e && e.message),
                );
                return false;
            }
        }

        /**
         * Copy `input` into the handle's linear memory: `alloc(len)`, write the
         * bytes, return the pointer, length, and a `free()` thunk the caller
         * MUST invoke (typically in a `finally`).
         *
         * @param {WasmLoaded} loaded
         * @param {Uint8Array} input
         * @returns {WasmBuf}
         * @throws {TypeError} if `input` is not a `Uint8Array`.
         * @throws {Error} if `alloc` returns `0` (allocation failure).
         */
        function withBytes(loaded, input) {
            if (!(input instanceof Uint8Array)) {
                throw new TypeError('wasmRuntime.withBytes: input must be a Uint8Array');
            }
            const len = input.length;
            const ptr = loaded.alloc(len);
            if (ptr === 0 && len !== 0) {
                throw new Error(`wasmRuntime.withBytes: alloc(${len}) failed`);
            }
            new Uint8Array(loaded.memory.buffer, ptr, len).set(input);
            return {
                ptr,
                len,
                free() {
                    loaded.free(ptr);
                },
            };
        }

        /**
         * Copy `len` bytes OUT of the handle's linear memory at `ptr` into a
         * fresh `Uint8Array` (never a view aliasing reused WASM memory).
         *
         * @param {WasmLoaded} loaded
         * @param {number} ptr
         * @param {number} len
         * @returns {Uint8Array}
         */
        function readBytes(loaded, ptr, len) {
            const view = new Uint8Array(loaded.memory.buffer, ptr, len);
            return new Uint8Array(view);
        }

        /**
         * Call an exported function and return its `i32` status. A throw from
         * the export (e.g. trap) is NOT swallowed here — it propagates to the
         * calling wrapper's try/catch, which is the no-throw boundary that maps
         * it to `false`.
         *
         * @param {WasmLoaded} loaded
         * @param {string} fnName
         * @param {number[]} args
         * @returns {number}  the export's `i32` return (status, ptr, or len)
         * @throws {TypeError} if `fnName` is not an exported function.
         */
        function run(loaded, fnName, args) {
            const fn = loaded.exports[fnName];
            if (typeof fn !== 'function') {
                throw new TypeError(`wasmRuntime.run: '${fnName}' is not an exported function`);
            }
            return fn(...(args || []));
        }

        return { isAvailable, hasSimd, load, withBytes, readBytes, run };
    },
};
