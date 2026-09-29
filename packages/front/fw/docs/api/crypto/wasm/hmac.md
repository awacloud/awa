---
module: wasmHmac
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmHmac

> WASM-loaded HMAC-SHA-256/384/512 (FIPS 198-1 / RFC 2104): MAC compute and constant-time verify. Async, `Uint8Array`, no-throw.

**Module** `wasmHmac` | **Source** `packages/front/fw/src/crypto/wasm/hmac.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

HMAC is covered by WebCrypto (`crypto.subtle.sign('HMAC', …)`); this WASM tier is the **non-secure-context fallback** for environments where `crypto.subtle` is absent (locked-down workers, non-secure origins). Prefer [`webcrypto/hmac`](../webcrypto/hmac.md) in secure contexts and the pure-JS [`hmac`](../hash/hmac.md) as the universal default.

This wrapper loads the delivered [`@awacloud/fw-wasm-crypto`](https://www.npmjs.com/package/@awacloud/fw-wasm-crypto) `hmac` binary — own C23 HMAC framing (`csrc/hmac/hmac.c`) over the own SHA-2 core (`csrc/sha2/sha2.c`) — through [`wasmRuntime`](./runtime.md) and exposes an async surface for MAC computation and constant-time verification.

The `hmac` target is **scalar-only** (`simd:false` in `targets.json` — SHA-2 + HMAC get marginal gain from simd128). There is no `hmac.simd.wasm`; `wasmHmac` forces `{ variant: 'scalar' }` when loading.

## Resolve

```js
const wasmHmac = runtime.resolve('wasmHmac');
// Returns: { isAvailable, mac, verify }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present (mirrors `wasmRuntime`) |
| `mac` | `(key: Uint8Array, data: Uint8Array, hash?: 256\|384\|512) => Promise<Uint8Array\|false>` | The HMAC tag (32/48/64 bytes), or `false` |
| `verify` | `(key: Uint8Array, tag: Uint8Array, data: Uint8Array, hash?: 256\|384\|512) => Promise<boolean>` | Recompute tag then **constant-time** compare against `tag` |

### Parameter constraints

| Parameter | Constraint |
|-----------|-----------|
| `key` | `Uint8Array`, any byte length (if > block size, hashed first per RFC 2104) |
| `data` | `Uint8Array`, any byte length including `0` |
| `hash` | `256` (default) \| `384` \| `512`; selects HMAC-SHA-256 / 384 / 512 |
| `tag` (verify) | `Uint8Array`, length must equal digest size (32/48/64 bytes) |

`mac`/`verify` resolve `false` (never throw) when:

- a parameter is invalid (`[crypto] INVALID: …` logged): `key`/`data` not a `Uint8Array`, `hash ∉ {256, 384, 512}`;
- the binary cannot load — `WebAssembly` unavailable, fetch/compile failure, or ABI mismatch (`[crypto] FAIL: …` logged by `wasmRuntime.load`);
- the WASM call returns a non-zero status (unknown `hashId`).

`verify` additionally returns `false` when `tag` is not a `Uint8Array` or when the constant-time comparison fails.

## Examples

### Compute HMAC-SHA-256

```js
const key = crypto.getRandomValues(new Uint8Array(32));
const data = new TextEncoder().encode('authenticated payload');
const tag = await wasmHmac.mac(key, data, 256);
if (tag === false) {
    // WASM unavailable or bad params — fall back to webcrypto/hmac or pure-JS hmac.
}
// tag is a 32-byte Uint8Array.
```

### Compute HMAC-SHA-512

```js
const tag512 = await wasmHmac.mac(key, data, 512);
// tag512 is a 64-byte Uint8Array.
```

### Constant-time verify

```js
const ok = await wasmHmac.verify(key, storedTag, data, 256);
// true only if the recomputed HMAC-SHA-256 tag matches storedTag byte-for-byte.
```

### RFC 4231 Test Case 1 (HMAC-SHA-256)

```js
const key = new Uint8Array(20).fill(0x0b);
const data = new TextEncoder().encode('Hi There');
const tag = await wasmHmac.mac(key, data, 256);
// hex(tag) === 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
```

### Default hash is SHA-256

```js
// These two calls are equivalent:
const a = await wasmHmac.mac(key, data);
const b = await wasmHmac.mac(key, data, 256);
```

## Worker Usage

```js
// wasmHmac is worker-safe: all constants are inside factory() and the
// binary is fetched by wasmRuntime's package loader via import.meta.url.
const worker = fw.createWorker(() => {
    const wasmHmac = runtime.resolve('wasmHmac');
    self.onmessage = async ({ data }) => {
        const { key, message } = data;
        const tag = await wasmHmac.mac(key, message, 256);
        self.postMessage(tag);
    };
});
```

## Notes

- **WebCrypto covers HMAC.** Use [`webcrypto/hmac`](../webcrypto/hmac.md) in secure contexts; this WASM tier is for non-secure-context fallback only.
- **Scalar-only binary.** The SHA-2 core has marginal simd128 gain; `wasmHmac` forces `{ variant: 'scalar' }` because there is no `hmac.simd.wasm`.
- **Key hashing.** If `key.length` exceeds the SHA-2 block size (64 bytes for SHA-256; 128 bytes for SHA-384/512), the WASM shim hashes the key first per RFC 2104 §2.
- **Empty key and empty data are valid.** A zero-length key is zero-padded to the block size; a zero-length message is a well-specified HMAC input.
- **Constant-time verify.** The byte comparison scans the full tag length without early exit; a length mismatch returns `false` immediately (tag length is not secret).
- **Output is copied OUT** of WASM linear memory into a fresh `Uint8Array` (never a view that could alias reused memory).
- **No-throw contract.** Every failure path resolves to `false` after a `console.error`; nothing rejects.
- **RFC 4231 KAT.** The WASM binary is validated against the NIST ACVP HMAC-SHA2-{256,384,512}-2.0 corpus; RFC 4231 literals are also verified.

## See also

- [crypto/webcrypto/hmac](../webcrypto/hmac.md) — the WebCrypto HMAC wrapper (preferred in secure contexts)
- [crypto/hash/hmac](../hash/hmac.md) — the pure-JS HMAC reference (universal default, bitArray API)
- [crypto/wasm/runtime](./runtime.md) — the shared WASM loader adapter
