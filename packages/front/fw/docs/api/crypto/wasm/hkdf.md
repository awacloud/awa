---
module: wasmHkdf
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmHkdf

> WASM HKDF (RFC 5869), Tier-2 fallback, async, Uint8Array.

**Module** `wasmHkdf` | **Source** `packages/front/fw/src/crypto/wasm/hkdf.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

WASM-backed wrapper over the `@awacloud/fw-wasm-crypto` `hkdf` binary. Exposes
combined HKDF extract+expand (RFC 5869) over HMAC-SHA-256/384/512 as an
async, no-throw primitive over `Uint8Array`. This is the **Tier-2 fallback**
for environments where `crypto.subtle` is unavailable (non-secure contexts,
locked-down workers). In secure contexts, prefer
[`../webcrypto/hkdf.md`](../webcrypto/hkdf.md).

The binary ships as `hkdf.scalar.wasm` ONLY (`"simd": false` in
targets.json). The load explicitly passes `{ variant: 'scalar' }` because
`selectVariant` defaults to `simd` with no automatic fallback (no
`hkdf.simd.wasm` exists in dist).

## Resolve

```js
const wasmHkdf = runtime.resolve('wasmHkdf');
// Returns: { isAvailable, deriveBits }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present in this environment |
| `deriveBits` | `(ikm, salt, info, dkLen, hash?) => Promise<Uint8Array\|false>` | `dkLen` bytes of OKM, or `false` on failure |

### `deriveBits(ikm, salt, info, dkLen, hash?)`

Performs the complete RFC 5869 HKDF extract-then-expand in a single call.

| Parameter | Type | Description |
|-----------|------|-------------|
| `ikm` | `Uint8Array` | Input keying material. |
| `salt` | `Uint8Array` | Optional salt; an empty `Uint8Array` is valid (the shim substitutes `HashLen` zero bytes per RFC 5869 §2.2). |
| `info` | `Uint8Array` | Optional context/application info; an empty `Uint8Array` is valid. |
| `dkLen` | `number` | Desired output length in **bytes**; must be ≥ 1 and ≤ 255 × hashLen. |
| `hash` | `256\|384\|512` | Underlying SHA-2 hash strength (default: `256`). |

Returns `false` (never rejects) when:
- any of `ikm`, `salt`, or `info` is not a `Uint8Array`
- `hash` is not `256`, `384`, or `512`
- `dkLen < 1` or `dkLen > 255 × hashLen`
- the WASM binary fails to load (WebAssembly unavailable, fetch/compile error, ABI mismatch)
- the binary returns a non-zero status (internal error)

### Hash lengths

| `hash` | `hashLen` | Max `dkLen` |
|--------|-----------|-------------|
| `256` | 32 bytes | 8160 bytes |
| `384` | 48 bytes | 12240 bytes |
| `512` | 64 bytes | 16320 bytes |

### WASM ABI

The binary exports a single entry point:

```
hkdf(hashId, ikmPtr, ikmLen, saltPtr, saltLen,
     infoPtr, infoLen, outPtr, outLen) -> i32
```

`hashId` maps to: `256` → HMAC-SHA-256, `384` → HMAC-SHA-384,
`512` → HMAC-SHA-512. Return `0` = OK; `-1` (WC_EBADPARAM) = bad `hashId`,
`outLen ≤ 0`, or `outLen > 255×HashLen`; `-2` (WC_EFAIL) = expand error.
Zero-length `ikmLen`/`saltLen`/`infoLen` are valid.

## Examples

### One-shot key derivation (HKDF-SHA-256)

```js
const wasmHkdf = runtime.resolve('wasmHkdf');

const ikm  = crypto.getRandomValues(new Uint8Array(32));
const salt = new Uint8Array(32); // or a random salt
const info = new TextEncoder().encode('my-app/v1/aes-key');

const key = await wasmHkdf.deriveBits(ikm, salt, info, 32);
if (key === false) {
    // WebAssembly unavailable — fall back to webcrypto/hkdf or hash/hkdf.
    return;
}
console.log(key); // Uint8Array(32)
```

### With HMAC-SHA-512

```js
const okm = await wasmHkdf.deriveBits(ikm, salt, info, 64, 512);
```

### Empty salt (RFC 5869 §2.2)

```js
// Zero-length salt is valid — the shim uses HashLen zero bytes internally.
const okm = await wasmHkdf.deriveBits(ikm, new Uint8Array(0), info, 32);
```

### Feature detection

```js
if (!wasmHkdf.isAvailable()) {
    // No WebAssembly — use webcrypto/hkdf or hash/hkdf.
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        const ikm  = new Uint8Array(32);
        const salt = new Uint8Array(16);
        const info = new Uint8Array(0);
        libs.wasmHkdf.deriveBits(ikm, salt, info, 32).then((key) => {
            self.postMessage(key !== false ? Array.from(key) : null);
        });
    },
    { dependencies: ['wasmHkdf'] }
);
```

## Notes

- **Combined extract+expand**: `deriveBits` runs the full RFC 5869 pipeline
  (HKDF-Extract then HKDF-Expand) in one call. Separate extract/expand
  stages are not exposed; use [`../hash/hkdf.md`](../hash/hkdf.md) if you
  need them.
- **Scalar-only**: unlike most `crypto/wasm/` modules there is no SIMD
  variant. `{ variant: 'scalar' }` is pinned at load time.
- **No-throw contract**: all methods are `async` and resolve to a result
  or `false`; they never reject. Validation errors and load failures are
  logged to `console.error` with the `[crypto]` prefix.
- **Output is a fresh copy**: `wasmRuntime.readBytes` copies bytes OUT of
  linear memory into a new `Uint8Array` — the returned buffer never aliases
  WASM memory.
- **Parity with pure-JS**: the WASM module produces byte-for-byte identical
  output to the pure-JS [`../hash/hkdf.md`](../hash/hkdf.md) module for the
  same RFC 5869 vectors (verified by the test suite).
- **SHA-1 not supported**: only `hashId` 256/384/512 are accepted. RFC 5869
  Appendix A test cases A.4–A.7 (SHA-1) are not applicable.

## See also

- [`../webcrypto/hkdf.md`](../webcrypto/hkdf.md) — WebCrypto HKDF (preferred in secure contexts)
- [`../hash/hkdf.md`](../hash/hkdf.md) — pure-JS HKDF module (universal default, synchronous, bitArray)
- [`./runtime.md`](./runtime.md) — the shared WASM loader adapter all `crypto/wasm/*` wrappers use
