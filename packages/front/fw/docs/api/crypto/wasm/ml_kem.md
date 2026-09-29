---
module: wasmMlKem
category: crypto/wasm
returns: object
worker-safe: true
status: complete
---

# wasmMlKem

> WASM-SIMD ML-KEM (FIPS 203) post-quantum key encapsulation — 512 / 768 / 1024.

**Module** `wasmMlKem` | **Source** `packages/front/fw/src/crypto/wasm/ml_kem.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

Opt-in WASM accelerator for the pure-JS [`ml_kem`](../pkc/ml_kem.md) module. A thin async wrapper over the `@awacloud/fw-wasm-crypto` `ml_kem` binary, loaded **by name** through [`wasmRuntime`](./runtime.md) — there is no fw-local `ml_kem.wasm.js`; the bytes ship in the package's `dist/ml_kem.{simd,scalar}.wasm`. The large lattice / NTT inner loops are where WASM-SIMD beats pure JS, so this is the primary accelerator for ML-KEM.

Post-quantum KEM — **not** part of WebCrypto. Use it to replace ECDH where quantum resistance is required (hybrid PQ + classical recommended).

## Resolve

```js
const wasmMlKem = runtime.resolve('wasmMlKem');
// Returns: { isAvailable, keygen, encaps, decaps }
```

## API

| ParamSet | Security (PQ) | publicKey (ek) | secretKey (dk) | ciphertext | sharedSecret |
|----------|---------------|----------------|----------------|------------|--------------|
| `512` | NIST PQC Level 1 (≈ AES-128) | 800 B | 1632 B | 768 B | 32 B |
| `768` (default) | NIST PQC Level 3 (≈ AES-192) | 1184 B | 2400 B | 1088 B | 32 B |
| `1024` | NIST PQC Level 5 (≈ AES-256) | 1568 B | 3168 B | 1568 B | 32 B |

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when the WASM runtime is present |
| `keygen` | `(paramSet?: 512\|768\|1024) => Promise<{publicKey, secretKey}\|false>` | ML-KEM.KeyGen (CSPRNG); `false` on bad param set / failure |
| `encaps` | `(publicKey: Uint8Array, paramSet?) => Promise<{ciphertext, sharedSecret}\|false>` | ML-KEM.Encaps; `false` on bad param set / key length |
| `decaps` | `(secretKey: Uint8Array, ciphertext: Uint8Array, paramSet?) => Promise<Uint8Array\|false>` | 32-byte shared secret (implicit reject); `false` on bad param set / length |

`paramSet` defaults to `768`. All inputs and outputs are `Uint8Array`.

## Examples

### KEM end-to-end

```js
// Receiver
const { publicKey, secretKey } = await wasmMlKem.keygen(768);
if (publicKey === undefined) { /* keygen returned false — fall back */ }

// Sender (has publicKey)
const enc = await wasmMlKem.encaps(publicKey, 768);
// enc.ciphertext → wire ; enc.sharedSecret → symmetric key

// Receiver (has ciphertext)
const sharedSecret = await wasmMlKem.decaps(secretKey, enc.ciphertext, 768);
// sharedSecret equals enc.sharedSecret (32 bytes)
```

### Hybrid PQ + classical (TLS-style)

```js
const Z = await wasmMlKem.decaps(secretKey, ciphertext, 768); // post-quantum
const T = ecdh.derive(...);                                    // classical ECDH
const ikm = bitArray.concat(Z, T);                            // SP 800-56C Cr2
const okm = hkdf.derive(salt, ikm, info, 256);
```

### Feature detection / fallback

```js
if (!wasmMlKem.isAvailable()) {
    // WebAssembly unavailable — use the pure-JS ml_kem (crypto/pkc) tier.
}
```

## Notes

- **FIPS 203** (CRYSTALS-Kyber), August 2024 final. Validated byte-for-byte against the published ML-KEM-768 KAT (and the pure-JS `ml_kem` module — both deterministic for a fixed seed, so they agree exactly).
- **Post-quantum**; **not** in WebCrypto. The WASM tier is the accelerator for the algorithms `crypto.subtle` does not cover.
- **Implicit reject** (FIPS 203 §6.3): `decaps` of a tampered ciphertext returns a pseudo-random 32-byte secret — **not** `false`. The caller must not branch on this; only a higher-level protocol detects the mismatch (the secrets simply will not agree).
- **No-throw**: every method is `async` and resolves to its result or `false`; it never rejects. `false` means an invalid param set, a wrong key/ciphertext length, an unavailable binary, or an internal failure.
- **Entropy**: `keygen` / `encaps` stage fresh `crypto.getRandomValues` bytes into the binary's derandomized seam (64 bytes `d || z` for keygen, 32 bytes `m` for encaps) before each call; `decaps` consumes none.
- **Software, not hardware**: portable SIMD speeds the software implementation; it exposes no CPU crypto instructions.

## See also

- [crypto/pkc/ml_kem](../pkc/ml_kem.md) — the pure-JS ML-KEM (universal default)
- [crypto/wasm/ml_dsa](./ml_dsa.md) — WASM ML-DSA post-quantum signatures
- [crypto/wasm/runtime](./runtime.md) — the shared WASM loader adapter
