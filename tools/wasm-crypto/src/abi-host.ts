// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * abi-host — minimal, dependency-free host for *.wasm.js data modules.
 *
 * Mirrors the fw `wasmRuntime` ABI (BATCH_11 task-01) without importing fw.
 * Used by the `verify` command to instantiate compiled wasm modules and run
 * KAT/ACVP/RFC test vectors byte-for-byte.
 *
 * Canonical WASM ABI (every algo binary must export):
 *   - memory          — exported WebAssembly.Memory
 *   - alloc(n: i32) -> ptr: i32
 *   - free(ptr: i32, n: i32) -> void
 *   Algorithm exports operate on (ptr, len) pairs in memory and write results
 *   to caller-provided output pointers; they return an i32 status (0 = OK).
 *
 * Data-module convention (*.wasm.js produced by tools/wasm-crypto build):
 *   export const <algo>Wasm = {
 *     name: '<algo>Wasm', type: 'fw.crypto.wasm.data',
 *     bytes: Uint8Array,   // binary WASM module bytes
 *     abi: '1',            // ABI version
 *     simd: boolean,       // true if binary requires SIMD
 *   };
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Shape of a data module exported from a `*.wasm.js` file.
 * Mirrors the fw `*.wasm.js` data-module convention.
 */
export interface WasmDataModule {
    name: string;
    type: string;
    bytes: Uint8Array;
    /** ABI version string — must equal '1'. */
    abi: string;
    /** Whether the bytes require WASM SIMD support. */
    simd: boolean;
}

/** A loaded and instantiated WASM module, ready to call. */
export interface LoadedWasm {
    instance: WebAssembly.Instance;
    exports: Record<string, unknown>;
    mem: WebAssembly.Memory;
}

// ─── AbiHost ─────────────────────────────────────────────────────────────────

/**
 * Minimal host loader that mirrors the fw `wasmRuntime` ABI.
 *
 * Does **not** import or depend on fw packages. Kept separate so it can be
 * diffed against the fw runtime's marshalling without coupling to it.
 *
 * Differences from the full fw runtime (intentional simplifications for the
 * offline verify tool):
 *   - No `isAvailable()` / `hasSimd()` guard (verify is a dev tool, not a
 *     browser runtime).
 *   - No Module-level cache across calls (each `load()` call recompiles;
 *     fine for an offline batch of KAT vectors).
 *   - Throws on ABI mismatch instead of resolving false (appropriate for a
 *     test gate, not a runtime fallback path).
 */
export class AbiHost {
    /**
     * Validate and instantiate a `*.wasm.js` data module.
     *
     * @throws {Error} if `dataModule.abi !== '1'` or bytes cannot be compiled.
     */
    async load(dataModule: WasmDataModule, imports: WebAssembly.Imports = {}): Promise<LoadedWasm> {
        if (dataModule.abi !== "1") {
            throw new Error(
                `abi-host: unsupported ABI version '${dataModule.abi}' (expected '1')`,
            );
        }

        const module = await WebAssembly.compile(dataModule.bytes);
        const instance = await WebAssembly.instantiate(module, imports);
        const exports = instance.exports as Record<string, unknown>;

        const mem = exports["memory"] as WebAssembly.Memory | undefined;
        if (!mem || !(mem instanceof WebAssembly.Memory)) {
            throw new Error("abi-host: wasm module does not export 'memory'");
        }

        const allocFn = exports["alloc"];
        if (typeof allocFn !== "function") {
            throw new Error("abi-host: wasm module does not export 'alloc'");
        }

        const freeFn = exports["free"];
        if (typeof freeFn !== "function") {
            throw new Error("abi-host: wasm module does not export 'free'");
        }

        return { instance, exports, mem };
    }

    /**
     * Copy a `Uint8Array` into wasm linear memory.
     *
     * Mirrors `wasmRuntime.withBytes()`: allocates, copies, returns ptr + a
     * `free()` thunk. The caller **must** call `free()` after use.
     *
     * @returns `{ ptr, len, free }` — ptr is the i32 pointer into linear memory.
     */
    withBytes(loaded: LoadedWasm, input: Uint8Array): { ptr: number; len: number; free: () => void } {
        const allocFn = loaded.exports["alloc"] as (n: number) => number;
        const freeFn = loaded.exports["free"] as (ptr: number, n: number) => void;

        const len = input.length;
        const ptr = allocFn(len);

        // Copy bytes into linear memory
        const view = new Uint8Array(loaded.mem.buffer, ptr, len);
        view.set(input);

        return {
            ptr,
            len,
            free: () => freeFn(ptr, len),
        };
    }

    /**
     * Copy bytes **out** of wasm linear memory into a fresh `Uint8Array`.
     *
     * Mirrors `wasmRuntime.readBytes()` — never returns a view aliasing wasm
     * memory (which may be reallocated on next grow).
     */
    readBytes(loaded: LoadedWasm, ptr: number, len: number): Uint8Array {
        const src = new Uint8Array(loaded.mem.buffer, ptr, len);
        // Copy out — never alias live wasm memory
        return new Uint8Array(src);
    }

    /**
     * Call a named wasm export with positional i32 arguments.
     *
     * Mirrors `wasmRuntime.run()` — returns the i32 status code.
     *
     * @throws {Error} if the export does not exist or throws during execution.
     */
    run(loaded: LoadedWasm, fnName: string, args: number[]): number {
        const fn = loaded.exports[fnName];
        if (typeof fn !== "function") {
            throw new Error(`abi-host: wasm export '${fnName}' not found`);
        }
        const result = (fn as (...a: number[]) => number)(...args);
        return result as number;
    }

    /**
     * High-level helper: copy inputs into wasm memory, call an export with the
     * given output-pointer arguments, read results back, and free all input
     * allocations.
     *
     * @param loaded   - Loaded wasm instance.
     * @param exportFn - Name of the wasm export to call.
     * @param inputs   - Input byte arrays to copy in; mapped to (ptr, len) pairs.
     * @param outPtrs  - Pre-allocated output pointers (ptr, len) pairs describing
     *                   where results are written by the wasm function.
     *                   Caller is responsible for allocating and freeing these.
     * @returns i32 status returned by the function (0 = OK, non-zero = error).
     */
    call(
        loaded: LoadedWasm,
        exportFn: string,
        inputs: Uint8Array[],
        outPtrs: Array<{ ptr: number; len: number }>,
    ): number {
        // Allocate and copy all inputs
        const allocs = inputs.map(buf => this.withBytes(loaded, buf));

        try {
            // Build arg list: (ptr, len) pairs for each input, then output pointers
            const args: number[] = [];
            for (const a of allocs) {
                args.push(a.ptr, a.len);
            }
            for (const out of outPtrs) {
                args.push(out.ptr, out.len);
            }

            return this.run(loaded, exportFn, args);
        } finally {
            // Free all input allocations
            for (const a of allocs) {
                a.free();
            }
        }
    }
}
