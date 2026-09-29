# dist-to-fw loader seam

How `dist/*.wasm` artifacts reach `@awacloud/fw` through the package loader.

## Artifact layout

`tools/wasm-crypto build --pkg packages/front/fw-wasm-crypto` emits, for
each module listed in `targets.json`:

```
dist/<module>.simd.wasm
dist/<module>.scalar.wasm
```

Seventeen modules, two variants each, produce 34 `.wasm` files. The
companion `.wasm.js` gate files (ACVP provenance markers) are emitted
alongside by `tools/wasm-crypto verify`.

## Package exports

`package.json` exposes two relevant export conditions:

```json
"./dist/*": { "default": "./dist/*" },
"./loader":  { "default": "./src/loader.js" }
```

The `"."` (package root) export also resolves to `./src/loader.js`. These
three conditions together mean:

- `import { loadWasmModule } from "@awacloud/fw-wasm-crypto"` resolves the
  loader module.
- `import { loadWasmModule } from "@awacloud/fw-wasm-crypto/loader"` is an
  explicit alias to the same loader module.
- `import url from "@awacloud/fw-wasm-crypto/dist/chacha20poly1305.simd.wasm"`
  (or `fetch` via an import-map entry) resolves the `.wasm` artifact
  directly through the `"./dist/*"` wildcard export.

## src/loader.js

`src/loader.js` is the single seam that `@awacloud/fw` uses to instantiate
crypto modules at runtime. Its public API:

| Export | Kind | Purpose |
|---|---|---|
| `supportsSimd()` | sync function | Validates a minimal `v128.const` probe via `WebAssembly.validate`; memoized |
| `selectVariant(opts?)` | sync function | Returns `"simd"` or `"scalar"` based on `supportsSimd()` or `opts.variant` override |
| `resolveDistUrl(wasmModule, variant)` | sync function | Returns a `URL` pointing to `dist/<module>.<variant>.wasm` relative to the loader module |
| `loadWasmModule(wasmModule, expectedExports, opts?)` | async function | Fetches, compiles, instantiates, and validates one crypto module; returns a `WasmModuleHandle` |

`loadWasmModule` enforces the ABI contract on instantiation:

1. The compiled module must declare zero imports (zero-import invariant).
2. The instance must export `memory` as a `WebAssembly.Memory`.
3. The instance must export `alloc` and `free` as functions.
4. Every name in `expectedExports` must be an exported function.

These assertions mirror what `tools/wasm-crypto build` checks post-link,
so any ABI drift is caught at load time, not silently at call time.

The loader is ESM, JSDoc-typed, has zero npm runtime dependencies, and
performs no work at import time (no top-level `await`, no side effects).
It is browser-safe: `resolveDistUrl` builds a relative `URL` from
`import.meta.url` (no `node:fs`, no `node:path`).

## @awacloud/fw consumption point

`@awacloud/fw` consumes the loader through the JS modules under
`packages/front/fw/src/crypto/`. The fw-side wasm wrappers bind to
`alloc`/`free`/`memory` plus the named algorithm exports exactly as frozen
in the `targets.json` `exports[]` arrays. The consumption point is
`packages/front/fw/src/crypto/wasm/` (preserving the ACVP `*.wasm.js`
gate); the loader does not move it.

## G2 gate

This loader seam is what satisfies the campaign G2 gate: `@awacloud/fw-wasm-crypto`
can be imported, `loadWasmModule` can be called, the zero-import invariant is
enforced, and the ABI triple is validated at instantiation time. Full handoff
detail (integration checklist, migration steps, rollout plan) is in
`docs/guide/handoff.md` (task 04).
