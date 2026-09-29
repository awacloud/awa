# @awacloud/fw-wasm-crypto

Build-asset package that produces the framework's crypto `.wasm` modules. Holds own C sources (`csrc/`), ABI shims (`shims/`), committed vendored sources (`vendor/`), the build manifest (`targets.json`), the provenance lockfile (`vendor/PROVENANCE.json`), and the emitted artifacts (`dist/`). Built by `tools/wasm-crypto` via `--pkg`; consumed by `@awacloud/fw` through the loader in `src/loader.js`.

Maturity: **L3** — docs + aggregated NOTICE + all 17 targets ACVP/RFC-green as **functional KAT**. L3 is reached: the extended manifest fields, the API mirror and a declared coverage floor (`awa.coverageBasis` `["src/**"]` with `coverageFloor` 0.86) are all in place, and the in-engine constant-time proof and differential fuzz were delivered.

> **Early release.** All 17 targets pass their NIST ACVP / defining-RFC vectors as functional KAT (byte-for-byte where the vector format states it) — correctness evidence, not a timing guarantee. In-engine constant-time is proven only where measured (see the [CT note](#tier-a-own-modules) below); there is no blanket CT attestation and no third-party audit. The whole crypto tier, this package included, is scheduled for a full rework against a dedicated ACVP validation harness in the next program.

## Canonical module table

All 17 modules in `targets.json` declaration order. This table is the index; the per-tier sections below contain the implementation detail.

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
| `ed25519` | Ed25519 (RFC 8032) | `libsodium` | `vendored` | false | `memory`, `alloc`, `free`, `ed25519_keypair`, `ed25519_sign`, `ed25519_verify`, `rng_stage`, `rng_reset` |
| `x25519` | X25519 DH (RFC 7748) | `libsodium` | `vendored` | false | `memory`, `alloc`, `free`, `x25519_base`, `x25519` |

> **Tier-A vendored follow-up**: `ed25519` and `x25519` are currently built from the vendored libsodium ref10 implementation (`sourceKind: vendored`). Replacing them with own-rolled C23 implementations is deferred to a follow-up.

## Layout

| Directory | Role |
|---|---|
| `csrc/` | Own C sources (framework-authored crypto implementations) |
| `shims/` | ABI shim sources (thin wrappers adapting vendored code to the WASM ABI) |
| `vendor/` | Committed vendored third-party C sources + `PROVENANCE.json` lockfile |
| `dist/` | Emitted `.wasm` and `.wasm.js` artifacts (build output, gitignored in CI) |
| `src/` | Shipped JS loader and provenance validator modules |

## Installation

```bash
npm install @awacloud/fw-wasm-crypto
```

## Quick Start

Building and verifying the `.wasm` targets needs the companion
`@awacloud/tool-wasm-crypto` builder (installed separately):

```bash
npm install --save-dev @awacloud/tool-wasm-crypto

# Build all wasm targets defined in targets.json
bunx wasm-crypto build --pkg node_modules/@awacloud/fw-wasm-crypto

# Verify emitted artifacts against vendor/PROVENANCE.json
bunx wasm-crypto verify --pkg node_modules/@awacloud/fw-wasm-crypto
```

The framework itself only *consumes* the already-compiled `.wasm` bytes
shipped in `dist/` — building is only needed to regenerate them.

## Tests

The published npm package is lean (no test files); the suite below runs
against the source repository:

```bash
bun test src/ shims/
```

### KAT strict mode

Each `shims/*.kat.test.ts` gates its build + KAT legs on a discovered WASI SDK
(`WASI_SDK_PATH` / `discoverWasiSdk()`). Without a toolchain, the default
behaviour is an **honest deferral**: a `console.warn` and an early return — a
local run without the SDK still reports green, by design.

Setting `AWA_KAT_STRICT=1` turns that deferral into a **failure** instead: a
machine that must tell "verified" from "deferred" (a publication gate, CI)
sets this flag so an absent toolchain reddens the suite rather than passing
it silently. CI and `tools/pkg-export`'s `freshness:wasm-crypto-verify` gate
set `AWA_KAT_STRICT=1`; a developer running `bun test` locally without the
WASI SDK should not. The shared policy lives in
[`shims/_kat-toolchain.ts`](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/shims/_kat-toolchain.ts)
(`katDeferral(family, present, standard = "ACVP KAT")`), read at call time
so the flag can be toggled within one process. All 17 `shims/*.kat.test.ts`
call it. The optional third parameter carries a family's own KAT label —
several families have no ACVP vectors (argon2: RFC 9106, blake2b: RFC 7693,
chacha20poly1305: RFC 8439, ed25519: RFC 8032 §7.1, hkdf: RFC 5869, pbkdf2:
RFC 7914, x25519: RFC 7748 §5.2) and pass their own standard so the
deferral message never claims an ACVP KAT that does not exist; the other 10
families (including the ACVP-backed hmac, sha2, sha3) use the default.

## Documentation

Full source docs (not part of the published npm package — browse them in
the source repository):

- [Module reference](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/docs/guide/modules.md) — all 17 modules grouped by tier and role
- [simd128 + scalar dual-build](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/docs/guide/simd-scalar.md) — which targets build simd and why
- [sourceKind taxonomy](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/docs/guide/source-kinds.md) — `own`, `vendored`, `vendored-fork` defined
- [C23 posture](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/docs/guide/c23.md) — own Tier-A sources target C23
- [dist-to-fw loader seam](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/docs/guide/loader-seam.md) — how `dist/*.wasm` reaches `@awacloud/fw`
- [Handoff, build to loader](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/docs/guide/handoff.md) — how `dist/*.wasm` reaches consumers
- [Full module table index](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/docs/README.md)

### Third-party licensing detail

This package is licensed under **Apache-2.0** ([`LICENSE`](LICENSE), `package.json` `license`). That covers all framework-authored sources — the C sources under `csrc/` and `shims/` as well as the JS loader and provenance validator under `src/`. Third-party vendored sources are committed under their respective open-source licenses, listed below.

- Aggregated third-party notices: [`vendor/NOTICE`](vendor/NOTICE)
- Provenance lockfile (url / ref / sha256 / license per tree): [`vendor/PROVENANCE.json`](vendor/PROVENANCE.json)

License summary by tree:

| Tree | License |
|---|---|
| mlkem-native | Apache-2.0 AND MIT AND ISC AND CC0-1.0 |
| pqclean | CC0-1.0 |
| openssl-slh-dsa | Apache-2.0 |
| bearssl | MIT |
| fiat-crypto | MIT AND BSD-1-Clause AND Apache-2.0 |
| libsodium (ed25519 / x25519) | ISC |

## RNG seam

The PQC schemes (PQClean ML-DSA/SLH-DSA and the non-derandomized path of
mlkem-native) link against a `randombytes(uint8_t*, size_t)` symbol. Instead of
importing entropy from JS/WASI — which would break the zero-import invariant the
builder enforces — `csrc/rng/rng.c` provides a freestanding seam that drains a
**caller-staged entropy buffer** living in the module's own linear memory (BSS).

**Contract** (`csrc/rng/rng.h`):

- `int rng_stage(const uint8_t* src, uint32_t n)` — the host writes a vector's
  deterministic entropy into linear memory and stages it (returns `-1` if
  `n` exceeds `RNG_STAGE_CAP = 256 KiB`, else `0` and resets the read cursor).
- `void randombytes(uint8_t* buf, size_t n)` — returns the staged bytes **in
  order, exactly once each**. If fewer than `n` bytes remain, the deficit is
  zero-filled and a sticky underflow flag is raised.
- `void rng_reset(void)` — empties the staged buffer (cursor = length = 0).
- `int rng_underflowed(void)` — non-zero iff any `randombytes` call drained past
  the staged length since the last `rng_stage`/`rng_reset` (harness-only; not on
  the KAT path).

**KAT determinism**: because `randombytes` returns the staged buffer verbatim and
in order, an ACVP KAT run is fully deterministic — the staged buffer *is* the
vector's seed. The host stages entropy with `rng_stage(ptr, n)` BEFORE calling
any export that draws randomness.

**Non-goal**: this is a deterministic entropy *conduit* for KAT, **not** a
CSPRNG/DRBG. No entropy expansion, no reseed policy. It coexists with the bump
arena in [`shims/_arena.h`](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/shims/_arena.h); the per-scheme shims `#include` this
header and re-export the staging entry points.

## Vendored sources

Committed third-party crypto C, with provenance in
[`vendor/PROVENANCE.json`](vendor/PROVENANCE.json) and the aggregated
[`vendor/NOTICE`](vendor/NOTICE).

| Tree | Upstream | Ref | License | Notes |
|---|---|---|---|---|
| mlkem-native | https://github.com/pq-code-package/mlkem-native | v1.2.0 | Apache-2.0 AND MIT AND ISC AND CC0-1.0 | freestanding (bundles FIPS-202; needs only the rng seam) |
| pqclean / ml-dsa-44 | https://github.com/PQClean/PQClean | 202a8f9 | CC0-1.0 | FIPS-204 ML-DSA-44 clean backend; rng via the seam |
| pqclean / ml-dsa-65 | https://github.com/PQClean/PQClean | 202a8f9 | CC0-1.0 | FIPS-204 ML-DSA-65 clean backend; rng via the seam |
| pqclean / ml-dsa-87 | https://github.com/PQClean/PQClean | 202a8f9 | CC0-1.0 | FIPS-204 ML-DSA-87 clean backend; rng via the seam |
| pqclean / common/{fips202,sha2} | https://github.com/PQClean/PQClean | 202a8f9 | CC0-1.0 | FIPS-202 (ml-dsa + slh_dsa) + SHA-2 (slh_dsa adapter), shared from common/ |
| openssl-slh-dsa | https://github.com/openssl/openssl | openssl-3.5.0 | Apache-2.0 | FIPS-205 SLH-DSA core (crypto/slh_dsa); freestanding via a csrc/ hash adapter on common/fips202+sha2 |
| bearssl | https://bearssl.org/bearssl-0.6.tar.gz | v0.6 | MIT | Tier-B AES/RSA/ECC bases (constant-time `aes_ct64`/`ghash_ctmul64`, `rsa_i31`, `ec_prime_i31`). **Accepted debt**: v0.6 beta, Aug 2018, never formally audited; no GitHub mirror (bearssl.org snapshot). |
| fiat-crypto | https://github.com/mit-plv/fiat-crypto | v0.1.6 | MIT AND BSD-1-Clause AND Apache-2.0 | Machine-verified P-256/P-384/P-521 field arithmetic for the ECC own-layer (field math only; group law/ECDSA framing is BearSSL EC). |
| libsodium | https://github.com/jedisct1/libsodium | 1.0.22-RELEASE | ISC | Ed25519 + curve25519 ref10 closure (20 files). Field path fe_25_5 (32-bit, wasm32-safe); fe_51 headers vendored as include-closure but not compiled. SHA-512/randombytes/sodium-utils seamed to own csrc/ via `csrc/libsodium-compat/`. A pre-implementation feasibility spike proved the ref10 closure builds freestanding zero-import to wasm32. Tier-A own-roll deferred to a follow-up. |

## Tier-A own modules

The nine Tier-A primitives — the "great-equalizer" hash / AEAD / MAC / KDF
surface — are framework-authored C23 under [`csrc/`](https://github.com/awacloud/awa/tree/main/packages/front/fw-wasm-crypto/csrc), `simd128` + scalar
where it pays (ChaCha20-Poly1305, SHA-3, BLAKE2b). Each imports nothing,
re-exports the frozen ABI, and is validated byte-for-byte against NIST
ACVP (where vectors are published) or the defining RFC. The `csrc/` cores form an
internal dependency graph consumed read-only (frozen path + symbol names):
`sha2` ← `hmac` ← {`hkdf`, `pbkdf2`}; `blake2b` ← `argon2`. `cmac` owns only the
SP 800-38B construction and reuses the vendored BearSSL `aes_ct64` block (the one
vendored dependency in this tier — never roll the block cipher).

| Module | Algorithm | Source | Shim | simd | KAT status |
|---|---|---|---|---|---|
| `chacha20poly1305` | ChaCha20-Poly1305 AEAD (RFC 8439, IETF) | own (`csrc/chacha20poly1305/`) | `shims/chacha20poly1305.c` | simd + scalar | ACVP: RFC 8439 §2.8.2 byte-for-byte + simd||scalar parity — productionized from the "great-equalizer" feasibility spike (own simd128 path carries a keystream correctness fix over the spike) |
| `sha2` | SHA-2 (224/256/384/512, 512/224, 512/256) | own (`csrc/sha2/`) | `shims/sha2.c` | scalar | ACVP SHA2-* AFT + MCT byte-for-byte — shared `csrc/` core for hmac/hkdf/pbkdf2 |
| `sha3` | SHA-3 + SHAKE (224/256/384/512, SHAKE128/256) | own (`csrc/sha3/`) | `shims/sha3.c` | simd + scalar | FIPS 202; ACVP SHA-3 AFT + SHAKE AFT/VOT byte-for-byte + simd||scalar parity |
| `blake2b` | BLAKE2b (RFC 7693, keyed + salt/personal) | own (`csrc/blake2/`) | `shims/blake2b.c` | simd + scalar | RFC 7693 App A "abc" + App E self-test grand hash byte-for-byte + simd||scalar parity — shared `csrc/` core for argon2 |
| `cmac` | AES-CMAC (SP 800-38B, 128/192/256) | own SP 800-38B framing (`csrc/cmac/`) over **vendored** BearSSL `aes_ct64` block | `shims/cmac.c` | scalar | ACVP CMAC-AES-1.0 byte-for-byte (405 accept / 135 reject) + RFC 4493 anchor |
| `hmac` | HMAC-SHA2 (FIPS 198-1) | own (`csrc/hmac/`) over own SHA-2 | `shims/hmac.c` | scalar | ACVP HMAC-SHA2-256/384/512 byte-for-byte + RFC 4231 — shared `csrc/` core for hkdf/pbkdf2 |
| `hkdf` | HKDF (RFC 5869) | own (`csrc/hkdf/`) over own HMAC | `shims/hkdf.c` | scalar | RFC 5869 extract/expand byte-for-byte |
| `pbkdf2` | PBKDF2 (RFC 8018) | own (`csrc/pbkdf2/`) over own HMAC | `shims/pbkdf2.c` | scalar | RFC 7914/6070 SHA-256 byte-for-byte (NIST PBKDF corpus is SHA2-224-only, outside the frozen hashId enum 256/384/512) |
| `argon2` | Argon2id (RFC 9106) | own (`csrc/argon2/`) over own BLAKE2b | `shims/argon2.c` | scalar | RFC 9106 §5.3 byte-for-byte (t=3, m=32 KiB, p=4, 32-byte tag) |

The previously vendored sources for these algos (`vendor/{argon2,blake2,xkcp}`,
the libsodium ChaCha path) are now unreferenced by `targets.json` but kept on
disk — their removal + provenance recompute is deferred pending a
human-reviewed prune.

> **CT note**: tag/MAC compares are branch-free in-shim, but constant-time is
> **not** self-attested here — the in-engine CT proof is a separate,
> dedicated effort. The ACVP/RFC status above means functional KAT, not a
> timing guarantee.

## Tier-A vendored libsodium base

The `ed25519` and `x25519` modules are built from committed libsodium
**1.0.22-RELEASE** ref10 sources (ISC). Vendored under `vendor/libsodium/` (20
files, byte-for-byte from upstream). Field path **fe_25_5** (32-bit limb,
wasm32-safe); fe_51 headers are vendored as part of the include closure but are
**not compiled** (`HAVE_TI_MODE` is not defined, avoiding the 128-bit integer path
that needs `__multi3` on wasm32).

**Seam layer** (`csrc/libsodium-compat/`): the non-freestanding surface is thin
and bridged via a package-local compat dir placed ahead on `-I`:

- `string.h` / `stdlib.h` / `limits.h` — libc-shim headers mapping to clang builtins.
- `export.h` — collapses `SODIUM_EXPORT`/`SODIUM_C99`/`CRYPTO_ALIGN` to
  freestanding equivalents.
- `utils.h` — declares `sodium_memzero/memcmp/is_zero`.
- `randombytes.h` — forwards `randombytes_buf` to the rng seam; no
  `#define randombytes` redirection so the call binds directly to `csrc/rng/rng.c`.
- `crypto_verify_32.h` — branch-free inline; avoids vendoring the SSE2-tainted
  `crypto_verify/verify.c`.
- `crypto_hash_sha512.h` — opaque state buffer (256 bytes, `_Alignas(8)`); the
  seam TU overlays the real `sha512_ctx`.
- `crypto_sign_ed25519.h` / `crypto_scalarmult_curve25519.h` — RFC 8032/7748
  size constants only.
- `sodium_util_seam.c` — `sodium_memzero/memcmp/is_zero` (constant-time, C23);
  linked by BOTH `ed25519` and `x25519`.
- `sodium_sha512_seam.c` — `crypto_hash_sha512{,_init,_update,_final}` overlaid
  on `csrc/sha2/sha2.c` (FIPS 180-4 SHA-512, C23 with `static_assert` on ctx
  fit); linked by `ed25519` ONLY.

**libsodium's own SHA-512 TU and `crypto_verify/verify.c` are NOT vendored** —
replaced entirely by the seam layer. `scalarmult_curve25519.c` (the runtime
dispatcher) is also not vendored — the build calls the ref10 impl struct directly.

**Tier-A `ed25519` own-layer over libsodium ref10**: the
`ed25519` module is built from the own-layer C23 shim `shims/ed25519.c` (frozen
3-export ABI `ed25519_keypair`/`ed25519_sign`/`ed25519_verify`, seed-explicit
keygen) forwarding to the vendored libsodium ref10 entry points
(`crypto_sign_ed25519_*`). The field path is **fe_25_5**; SHA-512 is wired to the
own `csrc/sha2/sha2.c` via the `sodium_sha512_seam.c` seam; the `csrc/rng`
staged-entropy seam is exported (`rng_stage`/`rng_reset`) for host entropy
staging. Built scalar (`simd:false`), zero imports, and validated against
**RFC 8032 §7.1** byte-for-byte (keygen + sign + verify, incl. the 1023-byte
multi-block message) by `shims/ed25519.kat.test.ts`. Vectors anchor:
`references/SPEC/RFC/rfc8032.txt`.

**Tier-A `x25519` own-layer over libsodium curve25519 ref10**: the
`x25519` module is built from the own-layer C23 shim
`shims/x25519.c` (frozen 2-export ABI `x25519_base`/`x25519`) forwarding to the
vendored libsodium curve25519 ref10. It calls the `..._ref10_implementation`
struct's `.mult`/`.mult_base` function pointers **directly** — the runtime
dispatcher `scalarmult_curve25519.c` is dropped (it needs `sodium_runtime_*`, not
freestanding). The field path is **fe_25_5**; the shared `ed25519_ref10.c`
fe25519 field core compiles into this separate link (no collision with the
`ed25519` link), and the sodium util surface is resolved by
`sodium_util_seam.c`. There is **no rng seam** (X25519 has no keygen) and no
SHA-512. Built scalar (`simd:false`), zero imports, and validated against
**RFC 7748 §5.2** byte-for-byte (the two single vectors + the iterated 1 and 1000
ladder from basepoint 9) by `shims/x25519.kat.test.ts`. Vectors anchor:
`references/SPEC/RFC/rfc7748.txt`.

**Spike provenance**: a de-risking feasibility spike proved the ref10 closure
builds freestanding zero-import to wasm32, RFC 8032 §7.1 + RFC 7748 §5.2
byte-for-byte (≈ 77.8 KiB). Verdict GO.

**Own-roll deferred**: a replacement in framework-authored C23 is a follow-up
beyond the currently delivered work. The vendored path is the current production base.

| Module | Algorithm | Vendored base | License | KAT status |
|---|---|---|---|---|
| `ed25519` | Ed25519 (RFC 8032) | libsodium 1.0.22 ref10 (`crypto_sign/ed25519/ref10` + `crypto_core/ed25519/ref10`) | ISC | RFC 8032 §7.1 byte-for-byte (`shims/ed25519.kat.test.ts`, productionized) |
| `x25519` | X25519 DH (RFC 7748) | libsodium 1.0.22 ref10 (`crypto_scalarmult/curve25519/ref10`, impl-struct-direct / dispatcher dropped) | ISC | RFC 7748 §5.2 byte-for-byte (`shims/x25519.kat.test.ts`, productionized) |

## Tier-C PQC modules

The three PQC targets are retargeted from round-3-style refs to FIPS-final
vendored forks, validated against the on-disk NIST ACVP vectors. All three modules
import nothing and re-export the frozen ABI plus the `rng_stage`/`rng_reset`
host staging entry points wired to the [RNG seam](#rng-seam).

| Module | Algorithm | Source | Shim | Sets | ACVP KAT status |
|---|---|---|---|---|---|
| `ml_kem` | ML-KEM (FIPS-203 final) | mlkem-native v1.2.0 | `shims/mlkem.c` | 512/768/1024 | keyGen + encapDecap byte-for-byte (standard build) |
| `ml_dsa` | ML-DSA (FIPS-204 final) | PQClean ml-dsa-{44,65,87}/clean | `shims/mldsa.c` | 44/65/87 | keyGen + sigGen byte-for-byte + sigVer verdict (standard build) |
| `slh_dsa` | SLH-DSA (FIPS-205 final) | OpenSSL crypto/slh_dsa (openssl-3.5.0) | `shims/slhdsa.c` | 12 (SHA2/SHAKE × 128/192/256 × s/f) | keyGen + sigGen byte-for-byte + sigVer verdict (all 12 sets) |

### Tier-C ML-DSA bascule + pqc.c retirement

`ml_dsa` is built from the freestanding **PQClean ml-dsa-{44,65,87}/clean** trees
(FIPS-204 final, `vendor/pqclean`) + the shared `common/fips202.c`, instead of
dilithium/ref. The frozen ABI (`mldsa_keygen/sign/verify(ps,…)`) is
preserved verbatim in `shims/mldsa.c`, binding the external+pure FIPS-204 interface
over the PQClean namespaced symbols (`PQCLEAN_MLDSA44/65/87_CLEAN_*`). Randomness is
routed to the **randombytes seam** (`csrc/rng`): the host stages the keygen `seed` /
sign `rnd` (0^256 when deterministic, the vector's `rnd` when hedged) before the
call, making the ACVP KAT reproducible while keeping the ABI seed-free. PQClean's
libc dependencies (heap SHAKE ctx, `<string.h>`/`<stdlib.h>`) are satisfied
freestanding via a package-local compat layer (`csrc/pqclean/`) without editing
vendored bytes. With the ML-KEM bascule, the dual-scheme `shims/pqc.c` is retired.

> The ML-DSA ACVP KAT passes 210/210 byte-for-byte via the standard build. ML-DSA
> frames exceed wasm-ld's 64 KiB default stack, so the `ml_dsa` target carries a
> `-Wl,-z,stack-size=4194304` cflag; the builder forwards `-Wl,`/`-z` link-directed
> cflags to the link step (`linkerFlagsFromCflags`, opt-in — targets without one
> are byte-identical).

### Tier-C SLH-DSA bascule (FIPS-205, OpenSSL re-source)

`slh_dsa` is built from the **OpenSSL FIPS-205 SLH-DSA** algorithm core
(`vendor/openssl-slh-dsa`, openssl-3.5.0, Apache-2.0) — all 12 sets in one
zero-import scalar module (SLH-DSA is hash-bound). OpenSSL decouples the core
from EVP through a hash function-pointer vtable; the EVP-bound TUs are replaced
by a freestanding adapter (`csrc/slhdsa/`) implementing the FIPS-205 §11 hashes
(PRF/F/H/T/H_MSG/PRF_MSG) on the shared PQClean `common/fips202.c` (SHAKE sets)
and `common/sha2.c` (SHA-2 sets) plus a freestanding HMAC/MGF1. The frozen
ABI (`slhdsa_keygen/sign/verify(psId,…)`, psId 0..11) is preserved in
`shims/slhdsa.c`, with the FIPS-205 §10.2.1 external/pure context wrap
(`M' = 0x00 || |ctx| || ctx || M`) done in-shim. Entropy routes to the
**randombytes seam** (`csrc/rng`): the host stages keyGen `skSeed||skPrf||pkSeed`
(3n) / the sign `addrnd` (PK.seed deterministic, else the vector's
`additionalRandomness`, n); the freestanding entry layer drains it and passes it
to the core.

> **Conformance**: keyGen + sigGen byte-for-byte and sigVer verdict-for-verdict
> against the NIST FIPS-205 ACVP vectors, all 12 sets. (This replaces the dropped
> first attempt that bound PQClean's round-3 SPHINCS+, which is not FIPS-205 and
> rejected the ACVP sign/verify vectors.)

## Tier-B classical modules

The classical AES / RSA / ECC targets are built onto committed vendored
bases (BearSSL v0.6 + machine-verified fiat-crypto field arithmetic), built via
`wasm-crypto build --pkg`, and validated against the on-disk NIST ACVP vectors.
All modules import nothing.

**Shim split**: the AES family lives in `shims/aes.c`
(`aes_ctr`, `aes_cbc_enc`, `aes_cbc_dec`, `aes_gcm_seal`, `aes_gcm_open`) and
the RSA family in `shims/rsa.c` (`rsa_keygen`, `rsa_oaep_enc`, `rsa_oaep_dec`,
`rsa_sign`, `rsa_verify`); each keeps the same `_arena.h`/`bearssl.h`/macro
preamble. The hash/MAC/KDF surface (Tier-A own C23) lives in dedicated own
shims (`shims/{sha2,hmac,hkdf,pbkdf2,cmac}.c`).

| Module | Algorithm | Source | Shim | ACVP KAT status |
|---|---|---|---|---|
| `aes` | AES-GCM/CBC/CTR | BearSSL v0.6 (vendored, constant-time `aes_ct64` + `ghash_ctmul64`) | `shims/aes.c` | ACVP-AES-GCM byte-for-byte (enc + dec accept/reject) + CBC/CTR KAT |
| `rsa` | RSA PKCS#1 v1.5 + PSS + OAEP | BearSSL v0.6 `rsa_i31` (vendored, **accepted debt**) | `shims/rsa.c` | PKCS#1 v1.5 SigVer (accept+reject) + sign->verify + OAEP round-trip + keyGen + PSS SigVer byte-for-byte (FIPS186-4 SHA-2) + PSS sign->verify |
| `ecc` | ECDSA + ECDH (P-256/384/521) | fiat-crypto field arith + BearSSL EC framing | `shims/ecc.c` | keyGen + DetECDSA sigGen byte-for-byte + sigVer (accept+reject) + ECDH shared secret |

### Tier-B AES own-layer

The high-level GCM/CBC/CTR orchestration is owned in `shims/aes.c` over BearSSL's
audited **constant-time** bitsliced `aes_ct64` core + `ghash_ctmul64` — no
AES-NI/PCLMULQDQ (unavailable in WASM). `simd:false` (AES gains nothing from
`simd128`; the "great-equalizer" simd targets are ChaCha/Keccak). A freestanding
`memcmp` lives in the shim (BearSSL is not freestanding-clean — `<string.h>`/
`<limits.h>` resolve via the package-local `csrc/bearssl/compat/` include).

### Tier-B RSA vendored — accepted debt

The RSA **arithmetic** (bignum/modexp) is intentionally **vendored** on BearSSL
v0.6 `rsa_i31`, **never own-rolled**. The OID is selected by
`hashId` (SHA-256/384/512) and keygen entropy routes through the [RNG seam](#rng-seam)
(re-exported `rng_stage`/`rng_reset`). Notes:

- **PSS (scheme=0) — supported via an authorized own EMSA-PSS layer.** BearSSL v0.6
  ships no PSS engine, so the EMSA-PSS encode/verify padding (MGF1 + salt, RFC 8017
  §9.1) is implemented in `shims/rsa.c` over BearSSL's raw `br_rsa_i31_private`/
  `_public` modexp — a deliberate, human-authorized exception (2026-06-21) to the
  no-own-rolling rule (the RSA *math* stays vendored; only the *padding* is owned).
  Sign uses salt length = hash length; verify auto-recovers the salt length (no
  `saltLen` ABI parameter). Validated byte-for-byte against the FIPS186-4 PSS SHA-2
  ACVP vectors (verify) + sign->verify roundtrip.
- **keyGen is deterministic-via-seam but not byte-equal to NIST RSA-KeyGen** —
  BearSSL uses probabilistic primes, not FIPS 186-5 provable-prime-from-seed.

### Tier-B ECC own-layer

ECDSA/ECDH framing is owned over **machine-verified fiat-crypto** field
arithmetic with BearSSL EC framing (`br_ec_prime_i31` / `br_ecdsa_i31_*`). A
freestanding `__multi3` (built only from 32-bit limb products) supports
fiat-crypto's 64-bit P-256 code on wasm32; keygen entropy routes through the
[RNG seam](#rng-seam). The ECDH P-curve KAT uses KAS-ECC-1.0 (the on-disk
KAS-ECC-SSC corpus is binary-Koblitz only); DetECDSA sigGen validates the plain
RFC-6979 groups byte-for-byte across P-256/384/521 (the SP800-106
message-randomization conformance groups are out of ABI scope).

## See also

- [`@awacloud/tool-wasm-crypto`](https://github.com/awacloud/awa/tree/main/tools/wasm-crypto) — the builder tool (`--pkg` interface)
- [`@awacloud/fw`](https://github.com/awacloud/awa/tree/main/packages/front/fw) — the browser framework that consumes `dist/*.wasm` via the loader seam

## Licence

Apache-2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) (aggregated
third-party notices) in this package. Per-tree licence detail: [§ Third-party
licensing detail](#third-party-licensing-detail).

Copyright (c) 2026 AwaCloud SAS

## Project

- Website: https://awaforge.eu
- Source: [`packages/front/fw-wasm-crypto`](https://github.com/awacloud/awa/tree/main/packages/front/fw-wasm-crypto)
- Issues: this package's own repository has issues disabled — report at
  https://github.com/awacloud/awa/issues
- Security policy and release verification:
  https://github.com/awacloud/awa/blob/main/SECURITY.md
- Maintenance policy:
  https://github.com/awacloud/awa/blob/main/MAINTENANCE.md

A CycloneDX 1.6 and SPDX 2.3 SBOM is generated for each published release.

Developed by AwaCloud.
