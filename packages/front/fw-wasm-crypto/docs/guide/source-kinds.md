# sourceKind taxonomy

Three classifications govern how each module's C source is maintained.

## Definitions

### `own`

Framework-authored C sources under `csrc/`. The awa project owns every line
of the implementation and can modify it freely. All `own` modules in this
package target C23 (see [C23 posture](c23.md)).

### `vendored`

Committed upstream sources used essentially as-is, with no substantive edits
to the vendored bytes. The content is frozen at a known upstream ref and
recorded in `vendor/PROVENANCE.json`. A package-local freestanding compat
layer (header-only, placed ahead on `-I`) may supply missing symbols for the
wasm32 freestanding target, but the vendored `.c` files themselves are not
modified.

### `vendored-fork`

Committed upstream sources that require a package-local adaptation layer to
work freestanding on wasm32. The vendored bytes are still unmodified, but a
`csrc/<scheme>/` or `csrc/pqclean/` directory provides the glue: ADRS vtable
adapters, freestanding compat headers, entropy-seam `randombytes` redirects,
or `#include`-based shim TUs. The term "fork" reflects that the combination
(vendored code + own adaptation layer) diverges from a simple upstream drop-in,
even though the upstream bytes themselves are byte-for-byte unchanged.

## Per-module classification

All 17 entries, in `targets.json` order:

| Module | sourceKind | Upstream |
|---|---|---|
| `argon2` | `own` | framework-authored `csrc/argon2/`, `csrc/blake2/` |
| `ml_kem` | `vendored-fork` | mlkem-native v1.2.0 (`csrc/mlkem/` adaptation layer) |
| `ml_dsa` | `vendored-fork` | PQClean @ 202a8f9 (`csrc/pqclean/` compat + support layer) |
| `slh_dsa` | `vendored-fork` | OpenSSL 3.5.0 `crypto/slh_dsa` (`csrc/slhdsa/` hash adapter) |
| `sha3` | `own` | framework-authored `csrc/sha3/` |
| `blake2b` | `own` | framework-authored `csrc/blake2/` |
| `chacha20poly1305` | `own` | framework-authored `csrc/chacha20poly1305/` |
| `cmac` | `own` | framework-authored `csrc/cmac/` (calls vendored BearSSL AES block) |
| `sha2` | `own` | framework-authored `csrc/sha2/` |
| `hmac` | `own` | framework-authored `csrc/hmac/` |
| `pbkdf2` | `own` | framework-authored `csrc/pbkdf2/` |
| `hkdf` | `own` | framework-authored `csrc/hkdf/` |
| `aes` | `vendored` | BearSSL v0.6 `symcipher/aes_ct64*` + `aead/gcm.c` |
| `rsa` | `vendored` | BearSSL v0.6 `rsa/rsa_i31*` + `int/i31_*` bignum |
| `ecc` | `vendored-fork` | fiat-crypto `fiat-c/p256_64.c` + BearSSL EC framing |
| `ed25519` | `vendored` | libsodium `crypto_sign/ed25519/ref10` |
| `x25519` | `vendored` | libsodium `crypto_scalarmult/curve25519/ref10` |

## Notes on boundary cases

**`cmac` is `own` despite using vendored AES**: the SP 800-38B construction
(K1/K2 derivation, CBC-MAC final XOR) is framework-authored. The BearSSL
`aes_ct64` single-block ECB call is an implementation detail of the block
cipher primitive, not of the CMAC construction. The `sourceKind` records
who authored the crypto logic, not whether any vendored symbol is referenced.

**`ecc` is `vendored-fork` not `vendored`**: the `fiat-c/p256_64.c` file is
unmodified, but its `static __inline__` functions require a `#include` from the
shim (not a normal link) and the shim also supplies a freestanding `__multi3`
and ECDSA/ECDH orchestration that ties together fiat-crypto field arithmetic
with BearSSL EC framing. That owned adaptation layer justifies `vendored-fork`.

**`ed25519` and `x25519` are `vendored` not `own`**: the libsodium `ref10`
implementations are committed verbatim. No package-local adaptation layer
beyond the shim's symbol bridging is required. These are the known not-yet-own
Tier-A pair; an own C23 replacement is a future milestone.
