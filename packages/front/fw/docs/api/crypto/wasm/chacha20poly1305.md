---
module: wasmChacha20poly1305
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmChacha20poly1305

> WASM-SIMD ChaCha20-Poly1305 AEAD (RFC 8439): seal/open over Uint8Array. Async, no-throw.

**Module** `wasmChacha20poly1305` | **Source** `packages/front/fw/src/crypto/wasm/chacha20poly1305.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

ChaCha20-Poly1305 is **not** in WebCrypto, making this module the primary accelerator for the algorithm in the `crypto/wasm/*` family. The delivered [`@awacloud/fw-wasm-crypto`](https://github.com/your-org/awa) `chacha20poly1305` binary ships both `.simd.wasm` and `.scalar.wasm`; the loader auto-selects the SIMD variant when `simd128` is validated by the host engine, otherwise falls back to scalar. This provides near-native portable-SIMD software speed — **not** hardware crypto acceleration (AES-NI / SHA-NI); that is WebCrypto's domain.

The AEAD construction follows **RFC 8439 §2.8**: a 256-bit key, a 96-bit IETF nonce, and a 128-bit Poly1305 MAC over padded `AAD ‖ ciphertext` with length fields. The `seal` output layout is `ciphertext ‖ tag` (tag is always 16 bytes). The `open` path verifies the Poly1305 tag in **constant-time** (branch-free accumulator inside the binary) before releasing any plaintext.

## Resolve

```js
const wasmChacha20poly1305 = runtime.resolve('wasmChacha20poly1305');
// Returns: { isAvailable, seal, open }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present (mirrors `wasmRuntime`) |
| `seal` | `(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array) => Promise<Uint8Array\|false>` | `ciphertext ‖ tag` (16-byte tag), or `false` on failure |
| `open` | `(key: Uint8Array, nonce: Uint8Array, ctWithTag: Uint8Array, aad?: Uint8Array) => Promise<Uint8Array\|false>` | Plaintext, or `false` on auth failure or invalid params |

**Parameter constraints:**

| Param | Requirement |
|-------|-------------|
| `key` | `Uint8Array`, exactly 32 bytes |
| `nonce` | `Uint8Array`, exactly 12 bytes (96-bit IETF nonce, RFC 8439) |
| `plaintext` | `Uint8Array`, any length (including empty) |
| `ctWithTag` | `Uint8Array`, at least 16 bytes (tag-only AEAD is valid) |
| `aad` | `Uint8Array`, optional (default empty) |

`seal` and `open` resolve `false` (never throw) when:

- `key` is not a `Uint8Array` or `key.length !== 32`;
- `nonce` is not a `Uint8Array` or `nonce.length !== 12`;
- `ctWithTag.length < 16` (would not hold a full tag);
- `plaintext` is not a `Uint8Array` (`seal` only);
- `ctWithTag` is not a `Uint8Array` (`open` only);
- the binary cannot load — `WebAssembly` unavailable, fetch/compile failure, or ABI mismatch;
- `open`: the Poly1305 tag comparison fails (authentication error — no plaintext is returned).

## Examples

### Seal a message

```js
const key   = crypto.getRandomValues(new Uint8Array(32));
const nonce = crypto.getRandomValues(new Uint8Array(12));
const pt    = new TextEncoder().encode('Hello, world!');
const aad   = new TextEncoder().encode('metadata');

const sealed = await wasmChacha20poly1305.seal(key, nonce, pt, aad);
if (sealed === false) {
    // Invalid params or WASM unavailable — fall back to the pure-JS tier.
}
// sealed = Uint8Array: pt.length + 16 bytes (ciphertext ‖ Poly1305 tag)
```

### Open a sealed message

```js
const plaintext = await wasmChacha20poly1305.open(key, nonce, sealed, aad);
if (plaintext === false) {
    // Authentication failed (tampered ciphertext, tag, or AAD) — discard.
}
```

### RFC 8439 §2.8.2 test vector

```js
const key   = new Uint8Array([
    0x80,0x81,0x82,0x83,0x84,0x85,0x86,0x87,
    0x88,0x89,0x8a,0x8b,0x8c,0x8d,0x8e,0x8f,
    0x90,0x91,0x92,0x93,0x94,0x95,0x96,0x97,
    0x98,0x99,0x9a,0x9b,0x9c,0x9d,0x9e,0x9f,
]);
const nonce = new Uint8Array([0x07,0x00,0x00,0x00,0x40,0x41,0x42,0x43,0x44,0x45,0x46,0x47]);
// ... pt = 'Ladies and Gentlemen ...', aad = '50515253c0c1c2c3c4c5c6c7'
const out = await wasmChacha20poly1305.seal(key, nonce, pt, aad);
// out subarray(0, pt.length) === d31a8d34... (RFC §2.8.2 ciphertext)
// out subarray(pt.length)    === 1ae10b59... (RFC §2.8.2 Poly1305 tag)
```

## Worker Usage

```js
const worker = fw.createWorker(() => {
    const wasmChacha20poly1305 = runtime.resolve('wasmChacha20poly1305');
    // seal / open available; WASM loads via import.meta.url inside the worker.
    return { seal: wasmChacha20poly1305.seal, open: wasmChacha20poly1305.open };
});
```

## Notes

- **Not in WebCrypto.** `crypto.subtle` exposes no ChaCha20-Poly1305; this WASM module (or the pure-JS [`chacha20poly1305`](../mode/chacha20poly1305.md)) is the only path.
- **96-bit IETF nonce (RFC 8439 §2.8).** The nonce is exactly 12 bytes. XChaCha20-Poly1305 (24-byte nonce) is out of scope; use a different module for extended nonces.
- **Output is copied OUT** of WASM linear memory into a fresh `Uint8Array` on both `seal` and `open` (never a view aliasing reused memory).
- **Constant-time tag comparison.** `open` uses a branch-free accumulator (`ct_tag_diff |= ...`) inside the binary; no secret-dependent branch or early return. Partial plaintext is never released on tag mismatch.
- **No-throw contract.** Every failure path resolves to `false`; nothing rejects. Auth failures in `open` are silent (no log entry — leaking a mismatch signal is unnecessary).
- **SIMD auto-selection.** The `chacha20poly1305` binary ships both `.simd.wasm` and `.scalar.wasm`; no variant pin is needed. ChaCha20 and Poly1305 are prime simd128 beneficiaries.

## See also

- [crypto/mode/chacha20poly1305](../mode/chacha20poly1305.md) — the pure-JS ChaCha20-Poly1305 reference (universal default)
- [crypto/cipher/chacha20](../cipher/chacha20.md) — the raw ChaCha20 keystream primitive
- [crypto/wasm/runtime](./runtime.md) — the shared WASM loader adapter
