# Crypto / WASM

WASM-SIMD-backed primitive modules — fast portable **software** crypto, loaded by
name through [`wasmRuntime`](./runtime.md) from `.wasm` assets **colocated** in
`crypto/wasm/` (vendored from the `@awacloud/fw-wasm-crypto` build). fw has **no runtime
dependency** on the package. They are an **opt-in, async** accelerator tier;
pure-JS stays the universal default and WebCrypto remains the hardware path.

WASM is **not** hardware crypto acceleration (no AES-NI / SHA-NI exposure) — it
provides near-native + SIMD software speed. Two roles:

- **Group A — sole/primary accelerator** (no WebCrypto equivalent): Argon2id,
  ML-KEM/ML-DSA/SLH-DSA (post-quantum), SHA-3, BLAKE2b, ChaCha20-Poly1305, CMAC.
- **Group B — Tier-2 fallback** for the WebCrypto-covered algorithms (only wins
  when `crypto.subtle` is unavailable — non-secure-context, locked-down workers):
  SHA-2, HMAC, PBKDF2, HKDF, AES, RSA, ECC, Ed25519, X25519.

**Contract:** every operation is `async` and resolves to `Promise<Result | false>`
over `Uint8Array` (not the pure-JS `bitArray`). No exception is ever thrown: on an
unavailable `WebAssembly`, an invalid argument, or a failed compile/run, the module
logs (`console.error`) and resolves `false`. Each module exposes
`isAvailable(): boolean`. All factories are pure and **worker-safe**.

Tier-selection / fallback chaining is intentionally **not** here — that
orchestration belongs to consumers (`sd-common`, runtimes). `fw` ships primitives.

| Module | Returns | Deps | Description |
|--------|---------|------|-------------|
| [runtime](./runtime.md) | `object` | none | Shared loader/marshalling adapter over `@awacloud/fw-wasm-crypto` (lazy compile, SIMD select, ABI handshake, no-throw, load-by-name security invariant) |
| [argon2](./argon2.md) | `object` | `wasmRuntime` | Argon2id memory-hard KDF (RFC 9106) — highest-ROI WASM-only accelerator |
| [ml_kem](./ml_kem.md) | `object` | `wasmRuntime` | ML-KEM keygen/encaps/decaps (FIPS 203), ML-KEM-512/768/1024 |
| [ml_dsa](./ml_dsa.md) | `object` | `wasmRuntime` | ML-DSA keygen/sign/verify (FIPS 204), ML-DSA-44/65/87 |
| [slh_dsa](./slh_dsa.md) | `object` | `wasmRuntime` | SLH-DSA keygen/sign/verify (FIPS 205), hash-based signatures |
| [sha3](./sha3.md) | `object` | `wasmRuntime` | SHA-3 / SHAKE (FIPS 202) |
| [blake2b](./blake2b.md) | `object` | `wasmRuntime` | BLAKE2b keyed/unkeyed, variable output (RFC 7693) |
| [chacha20poly1305](./chacha20poly1305.md) | `object` | `wasmRuntime` | ChaCha20-Poly1305 AEAD seal/open (RFC 8439) |
| [cmac](./cmac.md) | `object` | `wasmRuntime` | AES-CMAC (SP 800-38B / RFC 4493) |
| [sha2](./sha2.md) | `object` | `wasmRuntime` | SHA-2 family digests (FIPS 180-4) — Tier-2 fallback |
| [hmac](./hmac.md) | `object` | `wasmRuntime` | HMAC over SHA-2 (FIPS 198-1 / RFC 2104) — Tier-2 fallback |
| [pbkdf2](./pbkdf2.md) | `object` | `wasmRuntime` | PBKDF2 (SP 800-132 / RFC 8018) — Tier-2 fallback |
| [hkdf](./hkdf.md) | `object` | `wasmRuntime` | HKDF extract/expand (RFC 5869) — Tier-2 fallback |
| [aes](./aes.md) | `object` | `wasmRuntime` | AES-GCM/CBC/CTR (SP 800-38A / FIPS 197) software speed — Tier-2 fallback |
| [rsa](./rsa.md) | `object` | `wasmRuntime` | RSA-OAEP / RSA-PSS / RSASSA-PKCS1-v1_5 (PKCS#1) — Tier-2 fallback |
| [ecc](./ecc.md) | `object` | `wasmRuntime` | ECDSA + ECDH on P-256/384/521 (FIPS 186-5 / RFC 6979) — Tier-2 fallback |
| [ed25519](./ed25519.md) | `object` | `wasmRuntime` | Ed25519 keygen/sign/verify (RFC 8032) — Tier-2 fallback |
| [x25519](./x25519.md) | `object` | `wasmRuntime` | X25519 keygen/deriveBits key agreement (RFC 7748) — Tier-2 fallback |

## Common pattern

```js
const wasmArgon2 = fw.runtime.resolve('wasmArgon2');
if (wasmArgon2.isAvailable()) {
    const hash = await wasmArgon2.hash(password, salt,
        { timeCost: 3, memoryKiB: 65536, parallelism: 4, hashLen: 32 });
    // hash is a Uint8Array, or false on failure
}
```

## Notes

- **Variants**: modules with a SIMD build (`sha3`, `blake2b`, `chacha20poly1305`,
  `ml_kem`, `ml_dsa`) auto-select simd-vs-scalar via the loader; the scalar-only
  modules are loaded with the scalar variant pinned. Both are byte-for-byte
  equivalent — SIMD only changes speed.
- **Binaries**: the `.wasm` are **committed assets colocated** in `crypto/wasm/`
  (`<m>.scalar.wasm` always, `<m>.simd.wasm` for the SIMD-capable targets),
  vendored from the `@awacloud/fw-wasm-crypto` build (`tools/wasm-crypto build` →
  `dist/`) and fetched by name like `io/compress/brotli_dict.bin`. fw has **no
  runtime dependency** on the package — zero npm runtime deps unchanged.

## See also

- [WebCrypto](../webcrypto/README.md) — opt-in async wrappers over `crypto.subtle`
  (the hardware path); [Hash](../hash/README.md), [Mode](../mode/README.md),
  [PKC](../pkc/README.md) — the pure-JS defaults.
- [`NIST_CONFORMANCE.md`](../../../../src/crypto/NIST_CONFORMANCE.md)
