# @awacloud/fw-wasm-crypto — Documentation

Reference index for the 17 crypto wasm modules and cross-cutting guides.

## Module table

All 17 rows transcribed from `targets.json` in declaration order.

| Module | Algorithm | source | sourceKind | simd | ABI exports |
|---|---|---|---|---|---|
| `argon2` | Argon2id (RFC 9106) | `own-argon2` | `own` | false | `memory`, `alloc`, `free`, `argon2id_hash` |
| `ml_kem` | ML-KEM (FIPS-203) | `mlkem-native` | `vendored-fork` | true | `memory`, `alloc`, `free`, `mlkem_keygen`, `mlkem_encaps`, `mlkem_decaps`, `rng_stage`, `rng_reset` |
| `ml_dsa` | ML-DSA (FIPS-204) | `pqclean` | `vendored-fork` | true | `memory`, `alloc`, `free`, `mldsa_keygen`, `mldsa_sign`, `mldsa_verify`, `rng_stage`, `rng_reset` |
| `slh_dsa` | SLH-DSA (FIPS-205) | `openssl-slh-dsa` | `vendored-fork` | false | `memory`, `alloc`, `free`, `slhdsa_keygen`, `slhdsa_sign`, `slhdsa_verify`, `rng_stage`, `rng_reset` |
| `sha3` | SHA-3 + SHAKE | `own-sha3` | `own` | true | `memory`, `alloc`, `free`, `sha3` |
| `blake2b` | BLAKE2b (RFC 7693) | `own-blake2` | `own` | true | `memory`, `alloc`, `free`, `blake2b` |
| `chacha20poly1305` | ChaCha20-Poly1305 AEAD (RFC 8439) | `own-chacha20poly1305` | `own` | true | `memory`, `alloc`, `free`, `aead_seal`, `aead_open` |
| `cmac` | AES-CMAC (SP 800-38B) | `own-cmac-over-bearssl-aes` | `own` | false | `memory`, `alloc`, `free`, `aes_cmac` |
| `sha2` | SHA-2 (224/256/384/512/512-224/512-256) | `own-sha2` | `own` | false | `memory`, `alloc`, `free`, `sha2` |
| `hmac` | HMAC-SHA2 (FIPS 198-1) | `own-hmac` | `own` | false | `memory`, `alloc`, `free`, `hmac` |
| `pbkdf2` | PBKDF2 (RFC 8018) | `own-pbkdf2` | `own` | false | `memory`, `alloc`, `free`, `pbkdf2` |
| `hkdf` | HKDF (RFC 5869) | `own-hkdf` | `own` | false | `memory`, `alloc`, `free`, `hkdf` |
| `aes` | AES-GCM/CBC/CTR | `bearssl` | `vendored` | false | `memory`, `alloc`, `free`, `aes_gcm_seal`, `aes_gcm_open`, `aes_cbc_enc`, `aes_cbc_dec`, `aes_ctr` |
| `rsa` | RSA PKCS#1 v1.5 + PSS + OAEP | `bearssl` | `vendored` | false | `memory`, `alloc`, `free`, `rsa_keygen`, `rsa_oaep_enc`, `rsa_oaep_dec`, `rsa_sign`, `rsa_verify`, `rng_stage`, `rng_reset` |
| `ecc` | ECDSA + ECDH (P-256/384/521) | `fiat-crypto` | `vendored-fork` | false | `memory`, `alloc`, `free`, `ecdsa_keygen`, `ecdsa_sign`, `ecdsa_verify`, `ecdh`, `rng_stage`, `rng_reset` |
| `ed25519` | Ed25519 (RFC 8032) | `libsodium` | `vendored` | false | `memory`, `alloc`, `free`, `ed25519_keypair`, `ed25519_sign`, `ed25519_verify` |
| `x25519` | X25519 DH (RFC 7748) | `libsodium` | `vendored` | false | `memory`, `alloc`, `free`, `x25519_base`, `x25519` |

## Guides

- [Module reference](guide/modules.md) — all 17 modules grouped by tier and role
- [simd128 + scalar dual-build](guide/simd-scalar.md) — which targets build simd and why
- [sourceKind taxonomy](guide/source-kinds.md) — `own`, `vendored`, `vendored-fork` defined
- [C23 posture](guide/c23.md) — own Tier-A sources target C23
- [dist-to-fw loader seam](guide/loader-seam.md) — how `dist/*.wasm` reaches `@awacloud/fw`
- [Handoff — G2 satisfied](guide/handoff.md) — `dist/*.wasm` satisfies gate G2; L3 (in-engine CT + fuzz) pending

## API reference

- [loader](api/loader.md) — load a crypto `.wasm` module from `dist/`
- [provenance](api/provenance.md) — validate `vendor/PROVENANCE.json`
- [Index](api/README.md)
