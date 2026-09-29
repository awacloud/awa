---
module: wasmPbkdf2
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmPbkdf2

> WASM PBKDF2-HMAC-SHA-{256|384|512} (RFC 8018 §5.2): async key derivation over `Uint8Array`, no-throw.

**Module** `wasmPbkdf2` | **Source** `packages/front/fw/src/crypto/wasm/pbkdf2.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

PBKDF2 is available in WebCrypto (`crypto.subtle.deriveBits`); this WASM tier is the **Tier-2 fallback** for non-secure-context environments (locked-down workers, `http://` pages) where `crypto.subtle` is absent. At large iteration counts (≥ 600 000) the C23 WASM inner loop also out-performs a pure-JS HMAC chain. For password hashing in new code, prefer [`wasmArgon2`](./argon2.md) (memory-hard, quantum-resistant). For general PBKDF2 in secure contexts, prefer [`webcrypto/pbkdf2`](../webcrypto/pbkdf2.md).

The `pbkdf2` target is **scalar-only** (`simd:false` in `targets.json` — PBKDF2's sequential HMAC compression loop has no SIMD parallelism). There is no `pbkdf2.simd.wasm`; `wasmPbkdf2` forces `{ variant: 'scalar' }` to avoid the runtime fetching a non-existent file.

## Resolve

```js
const wasmPbkdf2 = runtime.resolve('wasmPbkdf2');
// Returns: { isAvailable, deriveBits }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present (mirrors `wasmRuntime`) |
| `deriveBits` | `(password: Uint8Array, salt: Uint8Array, dkLen: number, iterations?: number, hash?: 256\|384\|512) => Promise<Uint8Array\|false>` | `dkLen`-byte derived key, or `false` on any failure |

### Parameter constraints

| Parameter | Default | Constraint |
|-----------|---------|-----------|
| `password` | — | `Uint8Array`; any byte length including `0` (empty password is valid per RFC 8018) |
| `salt` | — | `Uint8Array`; any byte length (≥ 16 bytes recommended by SP 800-132) |
| `dkLen` | — | Integer ≥ 1 (bytes) |
| `iterations` | `600000` | Integer ≥ 1 (OWASP 2023 default for PBKDF2-HMAC-SHA-256) |
| `hash` | `256` | One of `256` / `384` / `512` (selects HMAC-SHA-2 PRF) |

`deriveBits` resolves `false` (never rejects) when:

- a parameter is invalid: `password` or `salt` not a `Uint8Array`; `iterations < 1` or non-integer; `dkLen < 1` or non-integer; `hash ∉ {256, 384, 512}` — logged as `[crypto] INVALID: …`;
- the binary cannot load — `WebAssembly` unavailable, fetch/compile failure, or ABI mismatch — logged as `[crypto] FAIL: …` by `wasmRuntime.load`;
- the WASM call returns a non-zero status (`WC_EBADPARAM = -1`).

## Examples

### Basic key derivation (PBKDF2-HMAC-SHA-256)

```js
const wasmPbkdf2 = runtime.resolve('wasmPbkdf2');

const password = new TextEncoder().encode('my-passphrase');
const salt = crypto.getRandomValues(new Uint8Array(16));
const dk = await wasmPbkdf2.deriveBits(password, salt, 32);
// dk is a 32-byte Uint8Array, or false on failure.
if (dk === false) {
    // WASM unavailable — fall back to webcrypto/pbkdf2 or hash/pbkdf2.
}
```

### Explicit iteration count and PRF

```js
// 100 000 iterations, HMAC-SHA-512, 64-byte output.
const dk = await wasmPbkdf2.deriveBits(password, salt, 64, 100_000, 512);
```

### RFC 7914 §11 published vector (c=1, SHA-256)

```js
const pw   = new TextEncoder().encode('password');
const salt = new TextEncoder().encode('salt');
const dk   = await wasmPbkdf2.deriveBits(pw, salt, 32, 1, 256);
// hex(dk) === '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'
```

## Worker Usage

```js
// wasmPbkdf2 is worker-safe: all constants are inside factory() and the
// binary is fetched by wasmRuntime's package loader via import.meta.url.
const worker = fw.createWorker(() => {
    const wasmPbkdf2 = runtime.resolve('wasmPbkdf2');
    self.onmessage = async ({ data }) => {
        const { password, salt, dkLen } = data;
        const dk = await wasmPbkdf2.deriveBits(password, salt, dkLen);
        self.postMessage(dk);
    };
});
```

## Notes

- **Default 600 000 iterations** (OWASP 2023 recommendation for PBKDF2-HMAC-SHA-256 password storage). SP 800-132 §5.3 sets the minimum at 1 000.
- **Scalar-only binary.** PBKDF2's inner loop is sequential HMAC passes — no block-level SIMD parallelism is possible. The scalar WASM binary is still faster than pure-JS at high iteration counts due to the compiled C23 HMAC inner loop.
- **Supports SHA-256, SHA-384, and SHA-512 PRFs.** SHA-1 and SHA-3 variants are out of scope for this binary (`hash ∉ {256, 384, 512}` → `false`).
- **Output is copied OUT** of WASM linear memory into a fresh `Uint8Array` (never a view aliasing reused WASM memory).
- **No-throw contract.** Every failure path resolves to `false` after a `console.error`; the promise never rejects.
- **Prefer `wasmArgon2` for new password hashing.** Argon2id (memory-hard) provides better resistance to brute-force and GPU attacks than PBKDF2 at equivalent wall-clock cost.

## See also

- [crypto/webcrypto/pbkdf2](../webcrypto/pbkdf2.md) — the primary WebCrypto PBKDF2 path (prefer in secure contexts)
- [crypto/hash/pbkdf2](../hash/pbkdf2.md) — the pure-JS PBKDF2 reference (universal default, no WASM)
- [crypto/wasm/argon2](./argon2.md) — memory-hard password hashing (recommended for new code)
- [crypto/wasm/runtime](./runtime.md) — the shared WASM loader adapter
