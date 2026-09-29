# Crypto — Cryptography

**FIPS 140-3 / SP 800 (latest) + RFC standards** crypto module for browser applications. Layered architecture: block/stream primitives → operating modes → public key → utilities.

**4 357 tests / 7 skip gated `CRYPTO_FULL` / 0 fail / 59 files** (incl. the 16-module `crypto/wasm` tier, 453 tests; +51 for the `hybridKem`/`hybridSign` combiners) — see [`NIST_CONFORMANCE.md`](../../../src/crypto/NIST_CONFORMANCE.md) for conformance detail.

| Category | Modules | Description |
|-----------|---------|-------------|
| [Cipher](./cipher/README.md) | `aes`, `chacha20` | Low-level symmetric ciphers (FIPS 197 / RFC 8439) |
| [Hash](./hash/README.md) | `sha224`, `sha256`, `sha384`, `sha512`, `sha512_224`, `sha512_256`, `sha3`, `hmac`, `hkdf`, `pbkdf2`, `blake2b`, `poly1305`, `argon2`, `adf` | Hashes, MAC, KDF (FIPS 180-4 / 198-1 / 202 + SP 800-56C / 132) |
| [Mode](./mode/README.md) | `cbc`, `ctr`, `gcm`, `cmac`, `kw`, `chacha20poly1305` | AES operating modes + AEAD (SP 800-38A/B/D/F + RFC 8439) |
| [PKC](./pkc/README.md) | `rsa`, `ecc`, `ed25519`, `x25519`, `ml_kem`, `ml_dsa`, `slh_dsa`, `hybridKem`, `hybridSign` | Asymmetric cryptography (FIPS 186-5/203/204/205 + RFC 7748/8032) + hybrid PQC combiners (X-Wing KEM, LAMPS composite signatures) |
| [Utils](./utils/README.md) | `random`, `rsaKeygen`, `bn`, `bitArray`, `pad`, `pem`, `asn1`, `asn1Oid`, `keyformat`, `jws`, `aes_modes`, `aes_ctr`, `totp` | DRBG, keygen, algebraic primitives, key formats, ASN.1 base OIDs, OTP |
| [WebCrypto](./webcrypto/README.md) | `webcryptoDigest`, `webcryptoHmac`, `webcryptoPbkdf2`, `webcryptoHkdf`, `webcryptoAes`, `webcryptoAesKw`, `webcryptoRsa`, `webcryptoEcc`, `webcryptoEd25519`, `webcryptoX25519` | Opt-in async wrappers over the platform `crypto.subtle` (Uint8Array/CryptoKey, `Promise<Result\|false>`) |
| [WASM](./wasm/README.md) | `wasmRuntime`, `wasmArgon2`, `wasmMlKem`, `wasmMlDsa`, `wasmSlhDsa`, `wasmSha3`, `wasmBlake2b`, `wasmChacha20poly1305`, `wasmCmac`, `wasmSha2`, `wasmHmac`, `wasmPbkdf2`, `wasmHkdf`, `wasmAes`, `wasmRsa`, `wasmEcc` | Opt-in async WASM-SIMD software accelerators over `@awacloud/fw-wasm-crypto` (Uint8Array, `Promise<Result\|false>`) — Group A (PQC/Argon2/SHA-3/BLAKE2b/ChaCha20-Poly1305/CMAC) + Tier-2 fallbacks |

## Principles

1. **No exception thrown** — any cryptographic error logs via `console.warn`/`console.error` then returns `false`. Convention for `bun test` + Worker safety.
2. **Secure by default** — deprecated paths (PKCS#1 v1.5 sign, MD-5, HMAC-SHA-1, KW-AE inverse, Argon2d/i, XChaCha20, Ed448) are explicitly rejected via `console.warn('DEPRECATED|UNSAFE|NOT-IMPLEMENTED')` + `return false`.
3. **Constant-time comparisons** — all security-critical comparisons (AEAD tag, MAC, OAEP padding, ML-KEM Khat/Kbar) are branch-free.
4. **Single entropy source** — `random.js` uses `crypto.getRandomValues` exclusively (NRBG OS-level validated). `Math.random` blocked by `sanity/base.js`.
5. **Worker-safe** — all `factory()` are pure and `factory.toString()` remains serializable for Worker transport.

## Common pattern

```js
const { aes, gcm, random } = fw.runtime.resolveAll(['aes', 'gcm', 'random']);

const key   = random.bytes(32);                                   // AES-256 key
const iv    = random.bytes(12);                                   // GCM 96-bit nonce
const cipher = aes.fn(Array.from(bitArray.ui8_to_ba(key)));
const { ct, tag } = gcm.encrypt(cipher, ptBitArray, iv, aad);
```

## See also

- [`NIST_CONFORMANCE.md`](../../../src/crypto/NIST_CONFORMANCE.md) — global conformance table (FIPS / SP / RFC) + CRYPTO_FULL policy + "Secure by default" section.
- ACVP vectors: `references/NIST/ACVP-Server-1.1.0.42/` (mono-repo, read-only — see `references/NIST.md`).
