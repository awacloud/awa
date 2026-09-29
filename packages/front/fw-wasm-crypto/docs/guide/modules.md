# Module reference

All 17 wasm crypto modules grouped by tier, with sources and ABI exports.

The per-module facts below are transcribed from `targets.json`. The
three-section ABI triple (`memory` / `alloc` / `free`) is shared by every
module and is not repeated per row; the exports column lists only the
algorithm-specific functions.

---

## Tier-A own (C23, sourceKind: own)

Framework-authored C23 sources under `csrc/`. Nine modules covering the
hash / AEAD / MAC / KDF surface. Each imports nothing, exports the ABI
triple, and is validated byte-for-byte against NIST ACVP vectors or the
defining RFC.

Some modules form an internal read-only dependency graph — the downstream
module includes the upstream `csrc/` translation unit directly (separate
wasm links, zero symbol collision):

- `sha2` is consumed read-only by `hmac`
- `hmac` is consumed read-only by `hkdf` and `pbkdf2`
- `blake2b` is consumed read-only by `argon2`

`cmac` is a partial exception: the SP 800-38B construction (`csrc/cmac/`)
is own-authored, but it calls into the vendored BearSSL `aes_ct64` block
cipher (the one vendored dependency allowed in this tier — the block cipher
is never own-rolled).

| Module | Algorithm | source | shim | simd | Algorithm exports |
|---|---|---|---|---|---|
| `chacha20poly1305` | ChaCha20-Poly1305 AEAD (RFC 8439, IETF) | `own-chacha20poly1305` | `shims/chacha20poly1305.c` | true | `aead_seal`, `aead_open` |
| `sha2` | SHA-2 (224/256/384/512/512-224/512-256) | `own-sha2` | `shims/sha2.c` | false | `sha2` |
| `sha3` | SHA-3 + SHAKE (224/256/384/512, SHAKE-128/256) | `own-sha3` | `shims/sha3.c` | true | `sha3` |
| `blake2b` | BLAKE2b (RFC 7693, keyed + salt/personal) | `own-blake2` | `shims/blake2b.c` | true | `blake2b` |
| `cmac` | AES-CMAC (SP 800-38B, 128/192/256) | `own-cmac-over-bearssl-aes` | `shims/cmac.c` | false | `aes_cmac` |
| `hmac` | HMAC-SHA2 (FIPS 198-1) | `own-hmac` | `shims/hmac.c` | false | `hmac` |
| `hkdf` | HKDF (RFC 5869) | `own-hkdf` | `shims/hkdf.c` | false | `hkdf` |
| `pbkdf2` | PBKDF2 (RFC 8018) | `own-pbkdf2` | `shims/pbkdf2.c` | false | `pbkdf2` |
| `argon2` | Argon2id (RFC 9106) | `own-argon2` | `shims/argon2.c` | false | `argon2id_hash` |

---

## Tier-B classical (sourceKind: vendored / vendored-fork)

Three classical-cryptography modules built on committed vendored bases.
BearSSL v0.6 provides AES and RSA arithmetic; fiat-crypto provides
machine-verified P-256/384/521 field arithmetic for ECC.

| Module | Algorithm | source | sourceKind | shim | simd | Algorithm exports |
|---|---|---|---|---|---|---|
| `aes` | AES-GCM/CBC/CTR | `bearssl` | `vendored` | `shims/aes.c` | false | `aes_gcm_seal`, `aes_gcm_open`, `aes_cbc_enc`, `aes_cbc_dec`, `aes_ctr` |
| `rsa` | RSA PKCS#1 v1.5 + PSS + OAEP | `bearssl` | `vendored` | `shims/rsa.c` | false | `rsa_keygen`, `rsa_oaep_enc`, `rsa_oaep_dec`, `rsa_sign`, `rsa_verify`, `rng_stage`, `rng_reset` |
| `ecc` | ECDSA + ECDH (P-256/384/521) | `fiat-crypto` | `vendored-fork` | `shims/ecc.c` | false | `ecdsa_keygen`, `ecdsa_sign`, `ecdsa_verify`, `ecdh`, `rng_stage`, `rng_reset` |

**Notes**:

- `aes`: constant-time `aes_ct64` bitsliced core + `ghash_ctmul64` from BearSSL.
  GCM/CBC/CTR orchestration is authored in `shims/aes.c`. No SIMD (AES gains
  nothing from `simd128`).
- `rsa`: RSA arithmetic (`rsa_i31` bignum/modexp) is vendored and never
  own-rolled (accepted debt, plan risk 2). The EMSA-PSS padding layer in
  `shims/rsa.c` is own-authored by explicit human authorization (BearSSL v0.6
  has no PSS engine). Entropy routes through `csrc/rng/rng.c` (re-exported as
  `rng_stage`/`rng_reset`).
- `ecc`: fiat-crypto `fiat-c/p256_64.c` is a single-TU `static __inline__`
  emit; the shim `#include`s it directly (no separate link). BearSSL EC
  framing handles the group law and ECDSA. Entropy routes through the RNG seam.

---

## Tier-C PQC (sourceKind: vendored-fork)

Three post-quantum cryptography modules targeting the FIPS-final algorithms.
All three modules export `rng_stage`/`rng_reset` (the RNG seam) in addition
to the ABI triple.

| Module | Algorithm | source | shim | simd | Algorithm exports |
|---|---|---|---|---|---|
| `ml_kem` | ML-KEM (FIPS-203, 512/768/1024) | `mlkem-native` v1.2.0 | `shims/mlkem.c` | true | `mlkem_keygen`, `mlkem_encaps`, `mlkem_decaps`, `rng_stage`, `rng_reset` |
| `ml_dsa` | ML-DSA (FIPS-204, 44/65/87) | `pqclean` ml-dsa-{44,65,87}/clean | `shims/mldsa.c` | true | `mldsa_keygen`, `mldsa_sign`, `mldsa_verify`, `rng_stage`, `rng_reset` |
| `slh_dsa` | SLH-DSA (FIPS-205, all 12 sets) | `openssl-slh-dsa` (openssl-3.5.0) | `shims/slhdsa.c` | false | `slhdsa_keygen`, `slhdsa_sign`, `slhdsa_verify`, `rng_stage`, `rng_reset` |

**Notes**:

- `ml_kem`: mlkem-native v1.2.0 is a single-compilation-unit freestanding
  ML-KEM implementation. The derandomized APIs (`*_keypair_derand`/`*_enc_derand`)
  are used for deterministic KAT. `cStd: c99` (mlkem-native requirement).
- `ml_dsa`: PQClean `ml-dsa-{44,65,87}/clean` trees (FIPS-204 final) plus
  shared `common/fips202.c`. PQClean's libc dependencies are resolved via a
  package-local compat layer (`csrc/pqclean/compat/`) without editing vendored
  bytes. `cStd: c99`.
- `slh_dsa`: OpenSSL 3.5.0 `crypto/slh_dsa` core (7 portable TUs). The
  EVP-bound TUs are excluded; a freestanding hash adapter (`csrc/slhdsa/`)
  implements FIPS-205 hashes over the shared PQClean SHAKE/SHA-2 primitives.
  `cStd: c99`. `simd: false` (SLH-DSA is hash-bound; no lane-parallel inner loop).

---

## Tier-A libsodium-vendored (sourceKind: vendored)

Two curve-25519 modules whose field/group arithmetic is vendored from
libsodium 1.0.22 ref10 (ISC, `vendor/libsodium/`, `fe_25_5` 32-bit field
path) under a framework-authored own-layer C23 ABI shim. Ed25519's SHA-512
and randombytes are seamed to the package's own `csrc/sha2` and `csrc/rng`
(no libsodium SHA-512 TU or sodium-utils vendored); curve25519 calls the
`..._ref10_implementation` struct directly (the runtime dispatcher is
dropped). Validated byte-for-byte against RFC 8032 §7.1 / RFC 7748 §5.2.

| Module | Algorithm | source | shim | simd | Algorithm exports |
|---|---|---|---|---|---|
| `ed25519` | Ed25519 signatures (RFC 8032) | `libsodium` | `shims/ed25519.c` | false | `ed25519_keypair`, `ed25519_sign`, `ed25519_verify`, `rng_stage`, `rng_reset` |
| `x25519` | X25519 Diffie-Hellman (RFC 7748) | `libsodium` | `shims/x25519.c` | false | `x25519_base`, `x25519` |

The two modules now have separate shims (`shims/ed25519.c` /
`shims/x25519.c`), each a distinct zero-import wasm link over the shared
vendored `ed25519_ref10.c` field core. `ed25519` exports the `csrc/rng`
staged-entropy seam (`rng_stage`/`rng_reset`) so a host may stage entropy,
but the frozen `ed25519_keypair` derives deterministically from its explicit
seed argument. `x25519` has no keygen, so it exports no RNG seam.
`simd: false` for both (scalar proven sufficient).
