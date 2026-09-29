---
module: wasmAes
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmAes

> WASM-loaded AES-GCM / AES-CBC / AES-CTR (SP 800-38D / SP 800-38A) for AES-128/192/256. Async, `Uint8Array`, no-throw. Constant-time **software** fallback — WebCrypto AES-NI is faster.

**Module** `wasmAes` | **Source** `packages/front/fw/src/crypto/wasm/aes.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

A WASM-backed AES surface — GCM (AEAD), CBC (PKCS#7), and CTR for 128/192/256-bit keys — that loads the delivered [`@awacloud/fw-wasm-crypto`](https://www.npmjs.com/package/@awacloud/fw-wasm-crypto) `aes` binary through [`wasmRuntime`](./runtime.md). The binary is BearSSL's 64-bit bitsliced `aes_ct64` block cipher with the carryless `ghash_ctmul64` GHASH — **constant-time software**.

> **WASM has no AES-NI.** This path does **not** use CPU AES instructions; it is portable constant-time software, slower than hardware-backed AES. In a secure context prefer [`webcrypto/aes`](../webcrypto/aes.md), which uses `crypto.subtle` (HW AES-NI / PCLMULQDQ). `wasmAes` exists as a **Tier-2 fallback** for non-secure contexts and locked-down workers where `crypto.subtle` is absent. The pure-JS [`cipher/aes`](../cipher/aes.md) + `mode/*` modules remain the universal default.

The `aes` target is **scalar-only** (`simd:false` in `targets.json` — the AES block and GHASH stay bitsliced/carryless, not simd128). There is no `aes.simd.wasm`; `wasmAes` forces `{ variant: 'scalar' }` when loading.

## Resolve

```js
const wasmAes = runtime.resolve('wasmAes');
// Returns: { isAvailable, encryptGcm, decryptGcm, encryptCbc, decryptCbc, encryptCtr, decryptCtr }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present (mirrors `wasmRuntime`) |
| `encryptGcm` | `(key, iv, plaintext, aad?) => Promise<Uint8Array\|false>` | `ciphertext ‖ tag(16)`; `iv` is **12 bytes** |
| `decryptGcm` | `(key, iv, ctWithTag, aad?) => Promise<Uint8Array\|false>` | Plaintext, or `false` on authentication failure |
| `encryptCbc` | `(key, iv, plaintext) => Promise<Uint8Array\|false>` | CBC ciphertext with **PKCS#7** padding; `iv` is 16 bytes |
| `decryptCbc` | `(key, iv, ciphertext) => Promise<Uint8Array\|false>` | Plaintext with PKCS#7 stripped; invalid padding → `false` |
| `encryptCtr` | `(key, nonce, data) => Promise<Uint8Array\|false>` | CTR keystream XOR; `nonce` is **12 bytes** |
| `decryptCtr` | `(key, nonce, data) => Promise<Uint8Array\|false>` | CTR is its own inverse; `nonce` is 12 bytes |

### Parameter constraints

| Parameter | Constraint |
|-----------|-----------|
| `key` | `Uint8Array`, length `16` / `24` / `32` (AES-128 / 192 / 256) |
| `iv` (GCM) | `Uint8Array`, exactly `12` bytes (96-bit, SP 800-38D §8.2.1) |
| `iv` (CBC) | `Uint8Array`, exactly `16` bytes |
| `nonce` (CTR) | `Uint8Array`, exactly `12` bytes (see the counter note below) |
| `plaintext` / `data` | `Uint8Array`, any length (including `0`) |
| `aad` (GCM) | optional `Uint8Array` (default empty) |
| `ctWithTag` (GCM) | `Uint8Array`, `≥ 16` bytes (`ciphertext ‖ tag(16)`) |
| `ciphertext` (CBC) | `Uint8Array`, non-empty, whole 16-byte blocks |

All methods resolve `false` (never throw) when a parameter is invalid (`[crypto] INVALID: …` logged), the binary cannot load (`WebAssembly` unavailable, fetch/compile failure, or ABI mismatch — `[crypto] FAIL: …` logged by `wasmRuntime.load`), or the WASM call returns a non-zero status. `decryptGcm` resolves `false` on **authentication failure** without logging or releasing partial plaintext. `decryptCbc` resolves `false` on invalid PKCS#7 padding.

### GCM tag layout

`encryptGcm` appends the full 16-byte tag after the ciphertext (`ciphertext ‖ tag`). `decryptGcm` expects the same layout. This matches WebCrypto AES-GCM with `tagLength: 128`.

### CTR counter / nonce note

The frozen `aes_ctr` ABI consumes a **12-byte nonce**: the 16-byte counter block is `nonce(12) ‖ be32(0)` with the 32-bit block counter starting at `0` (J0-style). This matches the package KAT, which cross-checks against WebCrypto AES-CTR configured with `counter = nonce ‖ be32(0)`, `length: 32`. (The task plan's indicative ABI named a 16-byte full-width counter; the delivered binary — `targets.json` + `shims/aes.c` — is authoritative.)

## Examples

### AES-GCM seal / open

```js
const key = crypto.getRandomValues(new Uint8Array(32)); // AES-256
const iv = crypto.getRandomValues(new Uint8Array(12));  // 96-bit, unique per message
const aad = new TextEncoder().encode('header');

const sealed = await wasmAes.encryptGcm(key, iv, plaintext, aad); // ct ‖ tag(16)
if (sealed === false) { /* fall back to webcrypto/aes or pure-JS */ }

const opened = await wasmAes.decryptGcm(key, iv, sealed, aad);
// opened === false on any tampering (ciphertext, tag, or AAD).
```

### AES-CBC with PKCS#7

```js
const iv = crypto.getRandomValues(new Uint8Array(16));
const ct = await wasmAes.encryptCbc(key, iv, plaintext); // PKCS#7 added
const pt = await wasmAes.decryptCbc(key, iv, ct);        // PKCS#7 stripped
// CBC is malleable — compose with a MAC (encrypt-then-MAC) or prefer GCM.
```

### AES-CTR

```js
const nonce = crypto.getRandomValues(new Uint8Array(12));
const ct = await wasmAes.encryptCtr(key, nonce, plaintext);
const pt = await wasmAes.decryptCtr(key, nonce, ct); // CTR is its own inverse
```

## Worker Usage

```js
// wasmAes is worker-safe: all constants live inside factory() and the binary
// is fetched by wasmRuntime's package loader via import.meta.url.
const worker = fw.createWorker(() => {
    const wasmAes = runtime.resolve('wasmAes');
    self.onmessage = async ({ data }) => {
        const { key, iv, plaintext } = data;
        const sealed = await wasmAes.encryptGcm(key, iv, plaintext);
        self.postMessage(sealed);
    };
});
```

## Notes

- **No AES-NI.** Constant-time bitsliced software (`aes_ct64` + carryless GHASH); slower than hardware AES. Prefer [`webcrypto/aes`](../webcrypto/aes.md) when `crypto.subtle` is available.
- **Scalar-only binary.** No `aes.simd.wasm`; `wasmAes` forces `{ variant: 'scalar' }`.
- **AES-128 / 192 / 256.** Key length selects the variant; one binary covers all three.
- **GCM auth failure → `false`.** The tag check is inside the binary; a non-zero return maps to `false` with no partial plaintext, no exception.
- **CBC padding is JS-side.** The ABI does only raw 16-byte blocks; `wasmAes` applies PKCS#7 on encrypt and strips it on decrypt (full-block pad scan, no early-exit oracle on byte position). Invalid padding → `false`.
- **CTR is its own inverse.** `encryptCtr` and `decryptCtr` call the same primitive.
- **Output is copied OUT** of WASM linear memory into a fresh `Uint8Array` (never a view aliasing reused memory).
- **No-throw contract.** Every failure path resolves to `false`; nothing rejects.

## See also

- [crypto/webcrypto/aes](../webcrypto/aes.md) — the HW-backed `crypto.subtle` AES tier (faster, preferred in secure contexts)
- [crypto/cipher/aes](../cipher/aes.md) — the pure-JS AES block cipher (universal default)
- [crypto/mode/gcm](../mode/gcm.md) — the pure-JS AES-GCM mode
- [crypto/wasm/runtime](./runtime.md) — the shared WASM loader adapter
