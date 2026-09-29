---
module: wasmBlake2b
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmBlake2b

> WASM-SIMD BLAKE2b (RFC 7693): fast keyed/unkeyed hash, not in WebCrypto.

**Module** `wasmBlake2b` | **Source** `packages/front/fw/src/crypto/wasm/blake2b.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

Opt-in WASM accelerator for the pure-JS [`blake2b`](../hash/blake2b.md) module. Loads `@awacloud/fw-wasm-crypto`'s `blake2b.simd.wasm` or `blake2b.scalar.wasm` (runtime auto-selection) through `wasmRuntime`. Exposes an async, `Uint8Array`, no-throw surface that supports keyed mode (MAC), variable output length, and salt / personalisation per RFC 7693 §2.8.

## Resolve

```js
const wasmBlake2b = runtime.resolve('wasmBlake2b');
// Returns: { isAvailable, hash }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present |
| `hash` | `(data: Uint8Array, opts?: WasmBlake2bOpts) => Promise<Uint8Array\|false>` | Digest bytes, or `false` on invalid params or WASM failure — never rejects |

### `WasmBlake2bOpts`

| Property | Type | Default | Constraint |
|----------|------|---------|------------|
| `outLen` | `number` | `64` | `[1, 64]` |
| `key` | `Uint8Array` | (empty) | `≤ 64` bytes — keyed/MAC mode |
| `salt` | `Uint8Array` | (null) | `≤ 16` bytes — zero-padded to 16 in the param block |
| `personal` | `Uint8Array` | (null) | `≤ 16` bytes — zero-padded to 16 in the param block |

Any parameter out of range resolves to `false` without throwing.

## Examples

### Unkeyed hash

```js
const wasmBlake2b = runtime.resolve('wasmBlake2b');
const digest = await wasmBlake2b.hash(
    new TextEncoder().encode('hello world'),
    { outLen: 32 }   // BLAKE2b-256
);
if (digest === false) {
    // WebAssembly unavailable or WASM failure; fall back to pure-JS blake2b.
}
```

### Keyed hash (MAC)

```js
const key = crypto.getRandomValues(new Uint8Array(32));
const mac = await wasmBlake2b.hash(message, { key });
// mac is a 64-byte Uint8Array (BLAKE2b-512 MAC)
```

### Variable output + salt / personalisation

```js
const salt    = new Uint8Array(16).fill(0x01);
const personal = new TextEncoder().encode('my-app-context\x00\x00'); // 16 bytes
const digest  = await wasmBlake2b.hash(data, {
    outLen: 32,
    salt,
    personal,
});
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        const wasmBlake2b = libs.wasmBlake2b;
        wasmBlake2b.hash(data).then(self.postMessage.bind(self));
    },
    { dependencies: ['wasmBlake2b'] }
);
```

## Notes

- **RFC 7693** — BLAKE2b, the 64-bit variant of BLAKE2 (compression over 128-byte blocks, 12 rounds, 64-byte digest maximum). BLAKE2s (32-bit) is a separate algorithm not covered here.
- **Keyed mode = MAC**: supplying a `key` turns BLAKE2b into a secure message authentication code, replacing HMAC-SHA-512 with a single pass. Key length ∈ [1, 64].
- **Not in WebCrypto**: `crypto.subtle` does not expose BLAKE2b. This WASM module is the primary accelerator (no hardware fallback path exists).
- **SIMD variant is auto-selected**: the package loader calls `supportsSimd()` at load time; `blake2b.simd.wasm` is fetched when the host engine validates simd128, `blake2b.scalar.wasm` otherwise.
- **No-throw contract**: `hash` always resolves to `Uint8Array | false`. Param-validation failures are logged as `[crypto] INVALID: wasmBlake2b: …` and resolve to `false`.
- **Output is a fresh copy**: `readBytes` copies the bytes out of linear WASM memory; the returned `Uint8Array` is safe to retain across multiple calls.

## See also

- [`../hash/blake2b.md`](../hash/blake2b.md) — pure-JS BLAKE2b (universal fallback, streaming API)
- [`./sha3.md`](./sha3.md) — WASM-SIMD SHA-3 / SHAKE (similarly not in WebCrypto)
- [`./runtime.md`](./runtime.md) — `wasmRuntime` — the shared loader all `crypto/wasm/*` wrappers use
