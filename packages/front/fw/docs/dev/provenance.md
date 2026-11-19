# Provenance of third-party-derived code in `@awacloud/fw`

## Scope

This page records **origin**. Where an origin's licence requires retaining its
notice, the notice ships under `third-party/`: SJCL is BSD-2-Clause, the Penner / jQuery
Easing equations are BSD-licensed, the WHATWG entity table is BSD-3-Clause,
the Brotli dictionary carries the RFC 7932 code-component terms and the
google/brotli MIT notice, and the WASM binaries carry the notices of the C
sources they are built from. TweetNaCl (public domain) carries no obligation.

| File | Covers |
|---|---|
| `third-party/NOTICE-sjcl` | the six SJCL-derived files below — SJCL copyright notice and BSD 2-clause text |
| `third-party/NOTICE-penner-easing` | `src/io/calc/easing.js` — jQuery Easing v1.3 and Robert Penner easing-equations BSD notices |
| `third-party/NOTICE-whatwg-entities.txt` | `src/io/text/html-entities.js` — the WHATWG copyright and BSD 3-clause text |
| `third-party/NOTICE-brotli-dictionary.txt` | `src/io/compress/brotli_dict.bin` — the RFC 7932 code-component licence and the google/brotli MIT notice |
| `third-party/NOTICE-fw-wasm-crypto.txt` | `src/crypto/wasm/*.wasm` — the notices of the vendored C sources (a copy of `@awacloud/fw-wasm-crypto`'s `vendor/NOTICE`) |

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
public domain). This project's own work on top: the unrolled field multiply
and square, the inversion / square-root addition chains, ed25519's
constant-time base-point table and its signed-digit recoding, and the
windowed variable-base multiplication of `verify`.

## Penner easing equations

| Module | File | Derived part | Own work |
|---|---|---|---|
| `easing` | `src/io/calc/easing.js` | All 31 function bodies: identical in form to Robert Penner's published `(t, b, c, d)` easing equations; the elastic and back families follow the jQuery Easing v1.3 port (locally initialised amplitude, period and overshoot) | ESM factory, JSDoc, tests, every later change |

Robert Penner publishes the equations under the MIT and 3-clause BSD
licences; jQuery Easing v1.3 (George McGinley Smith) is BSD-licensed. Both
BSD notices ship in `third-party/NOTICE-penner-easing`.

## Data tables

| Data | File | Origin | Licence |
|---|---|---|---|
| Named character references | `src/io/text/html-entities.js` (the inlined table, 2 125 entries) | WHATWG HTML Standard, `https://html.spec.whatwg.org/entities.json` | Copyright © WHATWG (Apple, Google, Mozilla, Microsoft); the Standard is CC BY 4.0, and portions incorporated into source code are BSD-3-Clause instead |
| Brotli static dictionary | `src/io/compress/brotli_dict.bin` (122 784 bytes) | RFC 7932 Appendix A, bit-identical (CRC-32 `0x5136CB04`, as the appendix states); the file was copied from `google/brotli` `c/common/dictionary.bin` | RFC 7932 code components: the IETF Trust's BSD terms (Trust Legal Provisions § 4.e); google/brotli: MIT |

## WebAssembly binaries

The 22 `src/crypto/wasm/*.wasm` files are the build of `@awacloud/fw-wasm-crypto`
(byte-identical to its `dist/MANIFEST.sha256`, checked by
`tests/pack-contents.integration.test.js`). They are compiled from that
package's own C sources and from vendored mlkem-native, PQClean, OpenSSL
SLH-DSA, BearSSL, fiat-crypto and libsodium sources; the per-tree origin is
locked in its `vendor/PROVENANCE.json`, and the notices ship here as
`third-party/NOTICE-fw-wasm-crypto.txt`.

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
NIST ACVP / RFC vectors (see `src/crypto/NIST_CONFORMANCE.md`).
