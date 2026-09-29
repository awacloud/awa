---
module: wasmSha3
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmSha3

> WASM-SIMD-accelerated SHA-3 / SHAKE (FIPS 202), async, Uint8Array.

**Module** `wasmSha3` | **Source** `packages/front/fw/src/crypto/wasm/sha3.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

WASM-backed wrapper over the `@awacloud/fw-wasm-crypto` `sha3` binary. Exposes
SHA3-224/256/384/512 (fixed-length digests) and SHAKE128/256 (XOF) as
async, no-throw primitives over `Uint8Array`. The Keccak permutation is
**not** in WebCrypto; this module is the WASM-tier primary accelerator for it
(alongside the pure-JS [`../hash/sha3.md`](../hash/sha3.md) universal default).

The binary ships as both `sha3.simd.wasm` and `sha3.scalar.wasm`
(`"simd": true` in targets.json). `wasmRuntime.load` auto-selects the SIMD
variant when the host engine validates simd128, otherwise the scalar variant
— no explicit pin needed.

## Resolve

```js
const wasmSha3 = runtime.resolve('wasmSha3');
// Returns: { isAvailable, sha3_224, sha3_256, sha3_384, sha3_512, shake128, shake256 }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present in this environment |
| `sha3_224` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | 28-byte SHA3-224 digest, or `false` on failure |
| `sha3_256` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | 32-byte SHA3-256 digest, or `false` on failure |
| `sha3_384` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | 48-byte SHA3-384 digest, or `false` on failure |
| `sha3_512` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | 64-byte SHA3-512 digest, or `false` on failure |
| `shake128` | `(data: Uint8Array, outLen: number) => Promise<Uint8Array\|false>` | XOF, exactly `outLen` bytes, or `false` on failure |
| `shake256` | `(data: Uint8Array, outLen: number) => Promise<Uint8Array\|false>` | XOF, exactly `outLen` bytes, or `false` on failure |

All operations resolve `false` (never reject) when:
- `data` is not a `Uint8Array`
- `outLen ≤ 0` for SHAKE variants
- the WASM binary fails to load (WebAssembly unavailable, fetch/compile error, or ABI mismatch)
- the binary returns a non-zero status (invalid `variantId` — an internal guard)

### WASM ABI

The binary exports a single entry point used for all six variants:

```
sha3(variantId: i32, inPtr: i32, inLen: i32, outPtr: i32, outLen: i32) -> i32
```

`variantId` maps to: `0`=SHA3-224, `1`=SHA3-256, `2`=SHA3-384, `3`=SHA3-512,
`4`=SHAKE128, `5`=SHAKE256. Return value `0` = OK; `-1` = unknown variantId.
For fixed-digest SHA3 variants, the shim ignores `outLen` and writes the implied
digest size. For SHAKE, the caller supplies `outLen` and the shim squeezes exactly
that many bytes.

## Examples

### One-shot SHA3-256 digest

```js
const wasmSha3 = runtime.resolve('wasmSha3');

const data = new TextEncoder().encode('Hello, world!');
const digest = await wasmSha3.sha3_256(data);
if (digest === false) {
    // WebAssembly unavailable or binary load failure — fall back to pure-JS sha3.
    return;
}
console.log(digest); // Uint8Array(32)
```

### SHAKE128 XOF (variable output length)

```js
const key = await wasmSha3.shake128(seed, 32);  // 32-byte key
const iv  = await wasmSha3.shake128(seed, 16);  // 16-byte IV (prefix of the 32-byte output)
```

### Feature detection + SIMD reporting

```js
if (!wasmSha3.isAvailable()) {
    // No WebAssembly — use pure-JS sha3.
}
const fast = await runtime.resolve('wasmRuntime').hasSimd();
// fast === true → sha3.simd.wasm loaded (Keccak SIMD permutation)
// fast === false → sha3.scalar.wasm loaded (identical correctness, less throughput)
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        const data = new Uint8Array(32);
        libs.wasmSha3.sha3_256(data).then((digest) => {
            self.postMessage(digest !== false ? Array.from(digest) : null);
        });
    },
    { dependencies: ['wasmSha3'] }
);
```

## Notes

- **FIPS 202**: all six variants (SHA3-224/256/384/512, SHAKE128/256) implement FIPS 202 exactly — same domain suffix (SHA3: `0x06`, SHAKE: `0x1F`) and pad10*1 as the pure-JS module.
- **Not in WebCrypto**: `crypto.subtle` does not expose SHA-3 or Keccak; this module is the framework's primary accelerator for the Keccak family. When WebAssembly is unavailable, fall back to [`../hash/sha3.md`](../hash/sha3.md).
- **SIMD auto-selection**: the loader fetches `sha3.simd.wasm` when `supportsSimd()` is true (no explicit `{ variant }` pin needed); scalar fallback is automatic.
- **No-throw contract**: all methods are `async` and resolve to a result or `false`; they never reject. Validation errors are logged to `console.error` with the `[crypto]` prefix.
- **Output is a fresh copy**: `wasmRuntime.readBytes` copies bytes OUT of linear memory into a new `Uint8Array` — the returned buffer never aliases WASM memory.
- **Parity with pure-JS**: the WASM and pure-JS modules produce identical byte-for-byte output on the same input (verified by the test suite for all six variants).

## See also

- [`../hash/sha3.md`](../hash/sha3.md) — pure-JS SHA-3 / SHAKE module (universal default, no async)
- [`./blake2b.md`](./blake2b.md) — WASM-accelerated BLAKE2b (another non-WebCrypto hash)
- [`./runtime.md`](./runtime.md) — the shared WASM loader adapter all `crypto/wasm/*` wrappers use
