# Provenance of third-party-derived code in `@awacloud/fw`

## Scope

This page records **origin**. Where an origin's licence requires retaining its
notice, the notice ships under `third-party/` (owner ruling 2026-09-21): SJCL is
BSD-2-Clause, the Penner / jQuery Easing equations are BSD-licensed. The other
entries (TweetNaCl, public domain) carry no obligation.

| File | Covers |
|---|---|
| `third-party/NOTICE-sjcl` | the six SJCL-derived files below — SJCL copyright notice and BSD 2-clause text |
| `third-party/NOTICE-penner-easing` | `src/io/calc/easing.js` — jQuery Easing v1.3 and Robert Penner easing-equations BSD notices |

## SJCL-derived (BSD-2-Clause)

| Module | File | Derived part | Own work |
|---|---|---|---|
| `aes` | `src/crypto/cipher/aes.js` | T-table precomputation, key schedule and the opt-in T-table block path `aes.ttable.fn` (SJCL implementation) | Constant-time default path `aes.fn`, ESM factory, JSDoc, tests, every later change |
| `sha256` | `src/crypto/hash/sha256.js` | FIPS 180-4 compression loop and round constants (SJCL implementation) | ESM factory, JSDoc, tests, every later change |
| `sha512` | `src/crypto/hash/sha512.js` | FIPS 180-4 compression loop and the 64-bit-as-two-32-bit-halves representation (SJCL implementation) | ESM factory, JSDoc, tests, every later change |
| `ecc` | `src/crypto/pkc/ecc.js` | Affine / Jacobian point arithmetic, curve registry, basic key and ECDSA scaffolding (SJCL implementation) | RFC 6979 deterministic nonce, input validation, ESM factory, JSDoc, tests, every later change |
| `bitArray` | `src/crypto/utils/bitArray.js` | Bit-array representation and partial-word encoding (SJCL implementation) | ESM factory, JSDoc, tests, every later change |
| `bn` | `src/crypto/utils/bn.js` | Arbitrary-precision limb arithmetic (SJCL implementation) | ESM factory, JSDoc, tests, every later change |

`sha256`, `sha512`, `bitArray` and `bn` carry this origin note, verbatim, in
their file header; `aes` and `ecc` carry the same note with the derived and
own parts named:

> Origin: adapted from the Stanford JavaScript Crypto Library (SJCL),
> BSD-2-Clause (SJCL is dual-licensed BSD-2-Clause OR GPL-2.0-or-later; the
> BSD-2-Clause terms are retained, see third-party/NOTICE-sjcl); the ESM
> factory, JSDoc, tests and every later change are this project's own work.
> See docs/dev/provenance.md.

SJCL has been dual-licensed BSD-2-Clause OR GPL-2.0-or-later since its first
public commit (2010-05-26; its README/COPYRIGHT reads 'SJCL used to be in the
public domain'). Upstream `core/ecc.js` dates from 2011-05-23 and
`core/sha512.js` from 2012-12-19; this project's adaptations date from 2022, so
no public-domain-era claim applies. The BSD-2-Clause terms are retained; the
notice is `third-party/NOTICE-sjcl`.

## TweetNaCl-derived (public domain)

| Module | File |
|---|---|
| `ed25519` | `src/crypto/pkc/ed25519.js` |
| `x25519` | `src/crypto/pkc/x25519.js` |

Both derive from the TweetNaCl reference implementation (Bernstein et al.,
public domain).

## Penner easing equations

| Module | File | Derived part | Own work |
|---|---|---|---|
| `easing` | `src/io/calc/easing.js` | All 31 function bodies: identical in form to Robert Penner's published `(t, b, c, d)` easing equations; the elastic and back families follow the jQuery Easing v1.3 port (locally initialised amplitude, period and overshoot) | ESM factory, JSDoc, tests, every later change |

Robert Penner publishes the equations under the MIT and 3-clause BSD
licences; jQuery Easing v1.3 (George McGinley Smith) is BSD-licensed. Both
BSD notices ship in `third-party/NOTICE-penner-easing`.

## Everything else

Compression (`io/compress`): `deflate`, `huffman`, `bitstream` and `lz4`
are in-house implementations written clean-room from RFC 1951, RFC 7932
and the LZ4 Block Format specification; the earlier fflate-derived
(`deflate`, `huffman`, `bitstream`) and node-lz4-derived (`lz4`)
implementations were replaced, and none of their implementation code
remains. What was kept verbatim is the public contract the modules already
exposed, so existing callers are unaffected: the module descriptors, the
JSDoc typedefs and, for `lz4`, the streaming wrapper surface and its error
messages. Measured in 2026-09 with that contract surface excluded, the
exact-8-token overlap against the pre-rewrite sources and against fflate is
at most 1.8 %. They owe nothing.

All other crypto modules are original implementations validated against
NIST ACVP / RFC vectors (see `src/crypto/NIST_CONFORMANCE.md`); the WASM
tier's vendored C provenance lives in `@awacloud/fw-wasm-crypto`
(`vendor/PROVENANCE.json`, `vendor/NOTICE`).
