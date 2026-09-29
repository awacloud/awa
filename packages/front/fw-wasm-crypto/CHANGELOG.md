# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-09-29

### Added
- **17 crypto WebAssembly modules**: nine hash/AEAD/MAC/KDF primitives
  (ChaCha20-Poly1305, SHA-2, SHA-3, BLAKE2b, CMAC, HMAC, HKDF, PBKDF2,
  Argon2id) built from framework-authored C23 sources; three classical
  primitives (AES, RSA, ECC) built over vendored BearSSL v0.6 and
  machine-verified fiat-crypto v0.1.6 field arithmetic; Ed25519 and X25519
  built over vendored libsodium 1.0.22 ref10; three post-quantum schemes
  (ML-KEM, ML-DSA, SLH-DSA) built over vendored FIPS-final forks
  (mlkem-native v1.2.0, PQClean, OpenSSL 3.5.0).
- **Browser loader** (`./loader`) — fetches and instantiates a module's
  `.wasm` binary by name, selecting the `simd128` or scalar build variant.
- **Provenance validator** (`./provenance`) — checks emitted artifacts
  against the recorded vendored-source provenance (url, ref, sha256,
  license per tree).
- **simd128 + scalar dual builds** for ChaCha20-Poly1305, SHA-3, BLAKE2b,
  ML-KEM and ML-DSA; the consumer selects the variant explicitly, with no
  automatic fallback.
- **RSA PSS support** — the PSS padding layer (MGF1 + salt, RFC 8017 §9.1)
  is framework-authored over the vendored RSA modexp core; the RSA
  arithmetic itself stays vendored.
- **Aggregated third-party notices** — every vendored tree's license and
  notice text collected into one file, alongside a per-tree provenance
  record (url, ref, sha256, license).
- **Guides and module index** — a module reference table plus guides on
  the simd/scalar split, the own-vs-vendored source taxonomy, the C23
  sources and the loader hand-off.

### Changed
- The hash/AEAD/MAC/KDF module family (ChaCha20-Poly1305, SHA-2, SHA-3,
  BLAKE2b, CMAC, HMAC, HKDF, PBKDF2, Argon2id) now builds from
  framework-authored C23 sources instead of vendored ones.

All 17 modules are validated byte-for-byte against NIST ACVP vectors where
published, and against the defining RFC test vectors otherwise.
