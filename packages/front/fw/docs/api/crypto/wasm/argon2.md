---
module: wasmArgon2
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmArgon2

> WASM-loaded Argon2id (RFC 9106): the memory-hard password-hashing / KDF accelerator. Async, `Uint8Array`, no-throw.

**Module** `wasmArgon2` | **Source** `packages/front/fw/src/crypto/wasm/argon2.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

Argon2id is the **highest-ROI** WASM target. It is **not** in WebCrypto, and pure JS is painfully slow because the algorithm is deliberately **memory-hard** — it fills and re-reads a large block matrix, which is exactly where native WASM speed pays off. This module loads the delivered [`@awacloud/fw-wasm-crypto`](https://www.npmjs.com/package/@awacloud/fw-wasm-crypto) `argon2` binary through [`wasmRuntime`](./runtime.md) and exposes an async surface that reproduces the pure-JS [`argon2`](../hash/argon2.md) module's Argon2id output, faster.

Only **Argon2id** (RFC 9106, type=2, v=0x13) is exposed — Argon2d / Argon2i are intentionally absent (the pure-JS module already refuses them: data-dependent addressing alone is cache-timing-vulnerable, and Argon2i alone is sub-optimal). The `argon2` binary is **scalar-only** (`simd:false`): the memory-hard fill dominates, so SIMD buys nothing — `wasmArgon2` therefore loads it with the variant forced to scalar.

## Resolve

```js
const wasmArgon2 = runtime.resolve('wasmArgon2');
// Returns: { isAvailable, hash, verify }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present (mirrors `wasmRuntime`) |
| `hash` | `(password: Uint8Array, salt: Uint8Array, opts: Argon2Options) => Promise<Uint8Array\|false>` | The Argon2id tag (`opts.hashLen` bytes), or `false` |
| `verify` | `(password: Uint8Array, salt: Uint8Array, expected: Uint8Array, opts: Argon2Options) => Promise<boolean>` | `hash(...)` then **constant-time** compare against `expected` |

### `Argon2Options`

| Field | Type | Meaning |
|-------|------|---------|
| `timeCost` | `number` | Passes `t` (≥ 1) |
| `memoryKiB` | `number` | Memory cost `m` in KiB (≥ 8·`parallelism`, ≤ `1048576` — the 1 GiB ceiling) |
| `parallelism` | `number` | Lanes `p` (≥ 1) |
| `hashLen` | `number` | Output tag length in bytes (`4` .. `2^32-1`) |
| `secret` | `Uint8Array` *(optional)* | Key `K` |
| `ad` | `Uint8Array` *(optional)* | Associated data `X` |

`hash`/`verify` resolve `false` (never throw) when:

- a parameter is invalid (`[crypto] INVALID: …` logged): `timeCost < 1`, `parallelism < 1`, `memoryKiB < 8·parallelism`, `memoryKiB > 1048576` (`[crypto] INVALID: wasmArgon2: memoryKiB above the ceiling of 1048576 KiB (1 GiB)`), `hashLen ∉ [4, 2^32-1]`, or `password`/`salt`/`secret`/`ad` not a `Uint8Array`;
- the binary cannot load — `WebAssembly` unavailable, fetch/compile failure, or ABI mismatch (`[crypto] FAIL: …` logged by `wasmRuntime.load`);
- the WASM call returns a non-zero status (`[crypto] FAIL: wasmArgon2.hash: argon2id_hash status <n>`) — `-2` when the engine refuses to grow linear memory for the matrix (the page is out of memory below the ceiling).

`verify` additionally returns `false` when `expected` is not a `Uint8Array`, when its length differs from the produced tag, or when the bytes differ.

## Examples

### Hash a password

```js
const enc = new TextEncoder();
const tag = await wasmArgon2.hash(
    enc.encode('correct horse battery staple'),
    crypto.getRandomValues(new Uint8Array(16)),
    { timeCost: 3, memoryKiB: 65536, parallelism: 4, hashLen: 32 },
);
if (tag === false) {
    // Invalid params or WASM unavailable — fall back to the pure-JS tier.
}
```

### Verify a stored tag (constant-time)

```js
const ok = await wasmArgon2.verify(
    enc.encode(attempt),
    storedSalt,
    storedTag,
    { timeCost: 3, memoryKiB: 65536, parallelism: 4, hashLen: 32 },
);
```

### RFC 9106 §5.3 test vector

```js
// t=3, m=32 KiB, p=4 lanes, 32-byte tag.
const tag = await wasmArgon2.hash(
    new Uint8Array(32).fill(0x01),  // password
    new Uint8Array(16).fill(0x02),  // salt
    {
        timeCost: 3, memoryKiB: 32, parallelism: 4, hashLen: 32,
        secret: new Uint8Array(8).fill(0x03),
        ad: new Uint8Array(12).fill(0x04),
    },
);
// hex(tag) === '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659'
```

## Notes

- **Memory-hard ⇒ the prime reason to reach for WASM here.** Choose `memoryKiB` as large as your environment allows (RFC 9106 §4 suggests `m = 2^16` KiB / 64 MiB when constrained; the OWASP Password Storage Cheat Sheet's floor is `m = 19456` KiB (19 MiB) with `t = 2`, `p = 1`, or `m = 47104` KiB (47 MiB) with `t = 1`, `p = 1` — both run here and match the pure-JS module byte for byte).
- **Accepted range and ceiling.** `8·parallelism ≤ memoryKiB ≤ 1048576` (1 GiB). The ceiling sits under the 4 GiB wasm32 limit and the browsers' practical per-page limit; RFC 9106's 2 GiB server profile is therefore out of reach of this binary (use a native implementation server-side). Above the ceiling `hash` refuses up front with the named `INVALID` error above, before touching the binary.
- **Linear memory grows and is not returned.** The block matrix (`m'` KiB) is not taken from the binary's 16 MiB scratch arena: the first call that needs it grows the module's linear memory, and a later, larger call extends it. WebAssembly memory never shrinks, so that memory stays allocated for the life of the loaded module (a later, smaller call reuses it); the matrix is zeroed after every call. A page that never hashes pays nothing.
- **Not in WebCrypto.** `crypto.subtle` has no Argon2; this WASM tier (or the pure-JS [`argon2`](../hash/argon2.md)) is the only path.
- **Scalar-only binary.** `wasmArgon2` forces `{ variant: 'scalar' }` when loading because the `argon2` target ships no SIMD build. Other `crypto/wasm/*` modules with a SIMD variant load it automatically via `wasmRuntime`.
- **Output is copied OUT** of WASM linear memory into a fresh `Uint8Array` (never a view that could alias reused memory).
- **Constant-time `verify`.** The byte comparison scans the full tag without early exit; a length mismatch short-circuits to `false` (length is not secret).
- **No-throw contract.** Every failure path resolves to `false` after a `console.error`; nothing rejects.

## See also

- [crypto/hash/argon2](../hash/argon2.md) — the pure-JS Argon2id reference (same algorithm, universal default)
- [crypto/wasm/runtime](./runtime.md) — the shared WASM loader adapter
- [crypto/wasm README](./README.md) — the WASM primitive family overview
