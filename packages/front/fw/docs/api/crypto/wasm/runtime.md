---
module: wasmRuntime
category: crypto/wasm
dependencies: []
returns: object
worker-safe: true
status: complete
---

# wasmRuntime

> Self-contained WASM loader: colocated-asset fetch, SIMD-selecting compile, linear-memory marshalling, the no-throw ABI handshake.

**Module** `wasmRuntime` | **Source** `packages/front/fw/src/crypto/wasm/runtime.js` | **Deps** none | **Worker-safe** yes

The keystone every `crypto/wasm/*` wrapper loads its binary through. It is a **self-contained loader** over **colocated `.wasm` assets** committed next to the module (`<wasmModule>.{simd,scalar}.wasm`) — fetched by name exactly like [`io/compress/brotli_dict_words.js`](../../io/compress/brotli_dict_words.md) fetches `brotli_dict.bin`. fw has **no runtime dependency** on any other package: `wasmRuntime` owns the lazy async `WebAssembly.compile`, the runtime simd-vs-scalar variant selection, the zero-import invariant, the `memory`/`alloc`/`free` + `expectedExports` ABI assertions, the no-throw async contract, the linear-memory marshalling helpers, module metadata, and the security invariant.

WASM here is portable-**SIMD software** speed, **not** hardware crypto acceleration — there is no AES-NI / SHA-NI exposure. That is WebCrypto's domain (see [`../webcrypto/README.md`](../webcrypto/README.md)). The WASM tier accelerates the algorithms WebCrypto does not cover (SHA-3, BLAKE2b, ChaCha20-Poly1305, CMAC, Argon2, ML-KEM/ML-DSA/SLH-DSA) and serves as a Tier-2 fallback when `crypto.subtle` is absent.

## Resolve

```js
const wasmRuntime = runtime.resolve('wasmRuntime');
// Returns: { isAvailable, hasSimd, load, withBytes, readBytes, run }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present |
| `hasSimd` | `() => Promise<boolean>` | Whether the host validates a minimal simd128 module (memoized) |
| `load` | `(wasmModule: string, expectedExports?: string[], opts?: object) => Promise<Handle\|false>` | A handle or `false` — never rejects |
| `withBytes` | `(loaded: Handle, input: Uint8Array) => { ptr, len, free }` | Copies `input` INTO linear memory; returns ptr/len + a `free()` thunk |
| `readBytes` | `(loaded: Handle, ptr: number, len: number) => Uint8Array` | Copies `len` bytes OUT of linear memory into a fresh `Uint8Array` |
| `run` | `(loaded: Handle, fnName: string, args: number[]) => number` | Calls an export, returns its `i32` status; a trap throws to the caller's try/catch |

`load` options (`opts`): `variant` (`'simd' | 'scalar'`) forces a variant (default = runtime selection); `fetchBytes(wasmModule, variant) => Promise<Uint8Array>` is a documented **test seam** overriding the colocated fetch. The success handle exposes: `instance`, `memory` (and a `mem` alias), `alloc`, `free`, `exports`, and `variant`.

`load` resolves `false` when:
- `WebAssembly` is unavailable (`[crypto] NOT READY: WebAssembly unavailable` logged)
- the fetch/compile/instantiate fails, or the zero-import invariant or a `memory`/`alloc`/`free`/`expectedExports` entry is missing (`[crypto] FAIL: wasmRuntime.load: <message>` logged)

## Canonical WASM ABI

Every colocated `<wasmModule>.<variant>.wasm` is a freestanding wasm32 reactor with **zero imports** that MUST export the ABI triple:

- `memory` — exported `WebAssembly.Memory` (linear memory, bump-allocated).
- `alloc(size: i32) -> i32` — pointer into `memory`, or `0` on allocation failure.
- `free(ptr: i32) -> void` — release boundary (the shim's bump allocator may no-op; the export MUST still exist).

…plus the per-algorithm functions named in the caller's `expectedExports`. Algorithm functions operate on `(ptr, len)` pairs into `memory` and write results to caller-provided output pointers; they return an `i32` status (`0` = OK, non-zero = failure). `load` asserts the triple + `expectedExports` at load time, so ABI drift fails fast as a `load(...) === false`.

## Colocated assets & provenance

The binaries are **committed assets** next to this module:
`packages/front/fw/src/crypto/wasm/<wasmModule>.scalar.wasm` (always) and
`<wasmModule>.simd.wasm` (for the SIMD-capable targets: `sha3`, `blake2b`,
`chacha20poly1305`, `ml_kem`, `ml_dsa`). They are raw `.wasm` (not base64-embedded)
so the browser/worker cache can share the asset across page loads — the same
rationale as `brotli_dict.bin`.

`load` resolves `new URL('./<wasmModule>.<variant>.wasm', import.meta.url)` and
`fetch`es it. The **SIMD win** comes from `load` fetching `<wasmModule>.simd.wasm`
when `hasSimd()` is true; scalar-only targets (no `.simd.wasm` colocated) must be
loaded with `{ variant: 'scalar' }`. Wrappers always **load by name** — they never
import a binary directly.

### Variant matrix

| Targets | Colocated builds | How to call `load` |
|---|---|---|
| `blake2b`, `chacha20poly1305`, `ml_dsa`, `ml_kem`, `sha3` | `.scalar.wasm` + `.simd.wasm` | default — let the runtime select |
| `aes`, `argon2`, `cmac`, `ecc`, `ed25519`, `hkdf`, `hmac`, `pbkdf2`, `rsa`, `sha2`, `slh_dsa`, `x25519` | `.scalar.wasm` only | **must** pass `{ variant: 'scalar' }` |

Variant selection has **no fallback**. With no `variant` option it returns
`'simd'` whenever the host validates a simd128 module, and the colocated fetch
for a scalar-only target then fails — `load` resolves `false` per its no-throw
contract rather than retrying scalar. Passing `{ variant: 'scalar' }` is part of
a scalar-only wrapper's contract, not an optimisation.

### Asset resolution binds to this module's own URL

The colocated fetch is `new URL('./<wasmModule>.<variant>.wasm',
import.meta.url)` evaluated **inside `factory()`**, so the base is wherever
`runtime.js` itself was loaded from. A build step that inlines a descriptor by
stringifying its factory (`factory.toString()`) re-binds `import.meta.url` to
the *generated* file, and every wasm-tier path in that artifact then fails to
fetch its binary while a tier-audit surface may still report the tier as
effective. Ship `wasmRuntime` as a real module file, or supply
`opts.fetchBytes`, when a bundler re-hosts factory source.

**Provenance.** The bytes are build artifacts of the `@awacloud/fw-wasm-crypto` package
(`dist/<wasmModule>.{simd,scalar}.wasm`, emitted by `tools/wasm-crypto build`),
copied here as vendored source. To refresh: run `wasm-crypto build`
against `packages/front/fw-wasm-crypto`, then copy the produced `dist/*.wasm` next
to this module. The matching ABI (export names per target) is recorded in that
package's `targets.json`.

## Security invariant

`load` selects a binary by its **module name** — one of the colocated,
build-vendored binaries. There is **no** public API that accepts caller-supplied
bytes to compile or instantiate; such an overload would be an `eval`-class
injection vector. (`opts.fetchBytes` is a documented test seam, not a public
method.) A module instantiates only the bytes vendored at build time.

## Examples

### Load a module and round-trip bytes

```js
// expectedExports declares the algo functions this caller binds to.
const h = await wasmRuntime.load('sha3', ['sha3_256']);
if (h === false) {
    // WebAssembly unavailable, fetch/compile failure, or ABI mismatch.
    return false;
}

const buf = wasmRuntime.withBytes(h, message);   // copy IN
try {
    const outPtr = h.alloc(32);
    const status = wasmRuntime.run(h, 'sha3_256', [buf.ptr, buf.len, outPtr]);
    if (status !== 0) {
        return false;
    }
    const digest = wasmRuntime.readBytes(h, outPtr, 32); // copy OUT (fresh array)
    h.free(outPtr);
    return digest;
} finally {
    buf.free();   // always release the input buffer
}
```

### Feature detection

```js
if (!wasmRuntime.isAvailable()) {
    // Fall back to the pure-JS or WebCrypto tier.
}
const fast = await wasmRuntime.hasSimd(); // true ⇒ load() picks the SIMD variant
```

### Worker usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        // The colocated .wasm is fetched by name (resolved from import.meta.url)
        // inside the worker — no main-thread closure is serialized.
        libs.wasmRuntime.load('blake2b', ['blake2b']).then((h) => {
            self.postMessage(h !== false);
        });
    },
    { dependencies: ['wasmRuntime'] }
);
```

## Notes

- **No-throw contract**: `load` and `hasSimd` are `async` and resolve to a value or `false`; they never reject. `run` deliberately lets an export trap propagate so the calling wrapper's `try/catch` is the single no-throw boundary.
- **`readBytes` never aliases**: it copies out of linear memory into a fresh `Uint8Array`. WASM memory may be reused or grow (detaching the buffer) on the next call, so returning a view would be unsound.
- **`withBytes` ownership**: the caller MUST invoke the returned `free()` (typically in a `finally`). `withBytes` throws `TypeError` on a non-`Uint8Array` input.
- **Async compile only**: `load` uses `WebAssembly.compile` / `instantiate`; the synchronous `new WebAssembly.Module()` constructor (banned for bodies > 4 KB on the main thread) is never used.
- **Worker-safe**: pure factory; `WebAssembly` exists in Web Workers; binary bytes are fetched by name (resolved from `import.meta.url`), so `factory.toString()` carries no captured binding.
- **Software, not hardware**: portable SIMD speeds the software implementations; it exposes no CPU crypto instructions. For HW-backed AES/SHA/ECDSA prefer the WebCrypto tier when `crypto.subtle` is available.

## See also

- [crypto/wasm README](./README.md) — the WASM primitive family overview
- [crypto/webcrypto README](../webcrypto/README.md) — the HW-backed `crypto.subtle` tier
- [crypto README](../README.md) — all three crypto tiers (pure-JS, WebCrypto, WASM)
