---
module: loader
category: (root)
dependencies: []
returns: object
worker-safe: true
status: complete
---

# loader — load a crypto .wasm module from dist/

> Instantiate a `dist/<module>.<variant>.wasm` crypto module and validate its ABI.

**Module** `loader` | **Source** `packages/front/fw-wasm-crypto/src/loader.js` | **Deps** none | **Worker-safe** yes — the module touches only `WebAssembly`, `fetch` and `URL` resolution (built from `import.meta.url`); no `document`/`window` reference exists in the source.

## Resolve

```js
import { loadWasmModule, selectVariant, resolveDistUrl, supportsSimd } from '@awacloud/fw-wasm-crypto';
// or the explicit alias:
import { loadWasmModule, selectVariant, resolveDistUrl, supportsSimd } from '@awacloud/fw-wasm-crypto/loader';
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `supportsSimd` | `() => boolean` | `true` iff the host engine validates a minimal simd128 probe module (memoized after the first call) |
| `selectVariant` | `(opts?: LoadOptions) => "simd" \| "scalar"` | `opts.variant` if given, else `"simd"` when `supportsSimd()` is true, else `"scalar"` |
| `resolveDistUrl` | `(wasmModule: string, variant: "simd" \| "scalar") => URL` | `<pkg>/dist/<wasmModule>.<variant>.wasm`, resolved relative to `import.meta.url` |
| `loadWasmModule` | `(wasmModule: string, expectedExports: string[], opts?: LoadOptions) => Promise<WasmModuleHandle>` | fetches, compiles, instantiates and ABI-validates one crypto module |

### `supportsSimd()`

Validates the canonical minimal simd128 probe (`WebAssembly.validate`, no crypto code instantiated) via `WebAssembly.validate(SIMD_PROBE)`. Any thrown validation error is caught and treated as unsupported (`false`). Result is memoized in the module-scope `simdSupport` variable.

### `selectVariant(opts?)`

`LoadOptions.variant`, when set, wins outright. Otherwise defers to `supportsSimd()`.

### `resolveDistUrl(wasmModule, variant)`

Pure; builds `new URL(\`../dist/${wasmModule}.${variant}.wasm\`, import.meta.url)`. No `node:fs`/`node:path`, so no Windows absolute-path doubling is possible — browser-safe by construction.

### `loadWasmModule(wasmModule, expectedExports, opts?)`

Async, opt-in — never runs at import time. Steps and throw conditions, in order:

1. Selects the variant (`selectVariant(opts)`), then reads bytes via `opts.fetchBytes` if supplied, else the default `fetchDistBytes` (a `fetch()` of `resolveDistUrl(...)`). On a failed or non-ok response:
   `` `[fw-wasm-crypto] failed to fetch ${wasmModule}.${variant}.wasm (${url.href}): ${status}` ``
2. `WebAssembly.compile(bytes)`, then asserts zero declared imports (freestanding invariant). On any import present:
   `` `[fw-wasm-crypto] ${wasmModule}.${variant}.wasm violates the zero-import invariant: ${imports.length} import(s) declared (${names}). Freestanding crypto modules must import nothing.` ``
3. `WebAssembly.instantiate(module, {})`, then asserts the instance exports `memory` as a `WebAssembly.Memory`. On miss:
   `` `[fw-wasm-crypto] ${wasmModule}.${variant}.wasm is missing the 'memory' ABI export (WebAssembly.Memory).` ``
4. Asserts `alloc` and `free` are exported functions. On miss (per missing name `${abi}`):
   `` `[fw-wasm-crypto] ${wasmModule}.${variant}.wasm is missing the '${abi}' ABI export (must be an exported function).` ``
5. Asserts every name in `expectedExports` is an exported function. On miss (per missing name `${name}`):
   `` `[fw-wasm-crypto] ${wasmModule}.${variant}.wasm is missing the expected export '${name}' (must be an exported function).` ``
6. Returns a `WasmModuleHandle`: `{ instance, memory, alloc, free, exports, variant }`.

These assertions mirror what `tools/wasm-crypto build` checks post-link, so ABI drift is caught at load time rather than at call time.

## Variants

Every `dist/<module>.<variant>.wasm` ships as a `simd` and a `scalar` build. `selectVariant()`/`loadWasmModule()` pick `simd` only when `supportsSimd()` passes (or the caller forces `opts.variant`); five of the 17 modules gain `simd: true` in `targets.json`, the other twelve are scalar-only for algorithmic reasons (memory-hard, hash-bound or scalar-sequential). See [simd128 + scalar dual-build](../guide/simd-scalar.md) for the full per-module rationale and the parity guarantee.

## Worker Usage

`loader.js` performs no DOM/window access and no work at import time, so it instantiates identically inside a Worker:

```js
const worker = fw.createWorker(
    async function ({ libs, args }) {
        const handle = await libs.loader.loadWasmModule(args[0], args[1]);
        self.postMessage({ variant: handle.variant });
    },
    { dependencies: ['loader'], args: ['sha2', ['sha2']] }
);
```

## Notes

- `loadWasmModule` is async and opt-in only — no top-level `await`, no side effects at import, matching the "zero work at import time" contract stated in the module header.
- `resolveDistUrl` is exported specifically for test and wrapper reuse; it never touches the filesystem, only `URL` math against `import.meta.url`.

## See also

- [dist-to-fw loader seam](../guide/loader-seam.md) — how `dist/*.wasm` reaches `@awacloud/fw`
- [provenance](./provenance.md) — the package's other public module
