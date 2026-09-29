---
module: wasmSha2
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmSha2

> WASM SHA-256/384/512 (FIPS 180-4) — Tier-2 fallback for non-secure contexts.

**Module** `wasmSha2` | **Source** `packages/front/fw/src/crypto/wasm/sha2.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

WASM-backed SHA-2 one-shot digests: SHA-256, SHA-384, SHA-512. This is the **Tier-2 fallback** for environments where `crypto.subtle` is unavailable (non-secure-context, locked-down workers). In secure contexts, prefer [`../webcrypto/digest.md`](../webcrypto/digest.md) which is hardware-accelerated. The pure-JS [`../hash/sha256.md`](../hash/sha256.md) / `sha384` / `sha512` modules remain the universal default.

The binary ships **scalar-only** (`sha2.scalar.wasm`; `simd: false` in targets.json — SHA-2 SIMD gain is marginal). The `{ variant: 'scalar' }` option is passed explicitly to `wasmRuntime.load` because the package's `selectVariant()` defaults to simd and has no automatic fallback.

## Resolve

```js
const wasmSha2 = runtime.resolve('wasmSha2');
// Returns: { isAvailable, sha256, sha384, sha512 }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present |
| `sha256` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | 32-byte digest (FIPS 180-4 SHA-256) |
| `sha384` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | 48-byte digest (FIPS 180-4 SHA-384) |
| `sha512` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | 64-byte digest (FIPS 180-4 SHA-512) |

All digest methods resolve `false` when:
- `data` is not a `Uint8Array`
- `WebAssembly` is unavailable
- The binary fails to load (fetch error, ABI mismatch)
- The WASM entry returns a non-zero status

None of them ever reject.

## Examples

```js
const wasmSha2 = runtime.resolve('wasmSha2');

// Guard: check availability before use
if (!wasmSha2.isAvailable()) {
    // Fall back to pure-JS sha256 / sha384 / sha512
}

// One-shot SHA-256 digest
const enc = new TextEncoder();
const digest = await wasmSha2.sha256(enc.encode('hello'));
if (digest === false) {
    // WebAssembly unavailable or binary load failure
} else {
    console.log(digest); // Uint8Array (32 bytes)
}

// SHA-512
const digest512 = await wasmSha2.sha512(enc.encode('hello'));
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        // wasmRuntime fetches the colocated .wasm by name inside the worker —
        // no main-thread closure is serialized.
        const enc = new TextEncoder();
        libs.wasmSha2.sha256(enc.encode('hello')).then((d) => {
            self.postMessage(d);
        });
    },
    { dependencies: ['wasmSha2'] }
);
```

## Notes

- **Prefer WebCrypto in secure contexts**: `webcrypto/digest` is hardware-accelerated for SHA-256/384/512. Use `wasmSha2` only when `crypto.subtle` is unavailable (non-secure-context, locked-down workers, test environments).
- **Scalar-only**: `sha2.simd.wasm` is not shipped — SHA-2 SIMD gains are marginal. The `{ variant: 'scalar' }` pin is mandatory; a default load would fail on the missing SIMD binary.
- **No-throw contract**: all methods resolve to `Uint8Array | false`; they never reject. Input validation (`instanceof Uint8Array`) happens before any WASM call.
- **Output is always a fresh copy**: `readBytes` copies out of WASM linear memory into a new `Uint8Array`. The caller owns the returned buffer.
- **Implements FIPS 180-4**: SHA-256 (§6.2), SHA-384 (§6.5), SHA-512 (§6.4). SHA-224, SHA-512/224, SHA-512/256 are out of scope — use the pure-JS tier.

## See also

- [wasmRuntime](./runtime.md) — shared WASM loader adapter
- [webcrypto/digest](../webcrypto/digest.md) — HW-backed SHA-2 in secure contexts (prefer this)
- [hash/sha256](../hash/sha256.md) — pure-JS SHA-256 (universal default)
