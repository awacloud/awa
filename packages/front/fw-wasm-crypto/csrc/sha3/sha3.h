/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * sha3.h — FIPS 202 SHA3-224/256/384/512 + SHAKE128/256 (C23, freestanding).
 *
 * One-shot FIPS 202 hash + XOF over the Keccak-f[1600] sponge (`keccak.{c,h}`).
 * The frozen wasm-crypto `sha3(variantId, …)` ABI lives in `shims/sha3.c`,
 * which drives these entry points; this header carries the variant primitives.
 *
 * Domain separation (FIPS 202 §B.2): SHA-3 appends `01` then pad10*1 (combined
 * first padding byte 0x06); SHAKE appends `1111` then pad10*1 (combined first
 * padding byte 0x1F). Rates (in bytes): SHA3-224 r=144, SHA3-256 r=136,
 * SHA3-384 r=104, SHA3-512 r=72; SHAKE128 r=168, SHAKE256 r=136. Capacity is
 * always 1600 − 8·r bits.
 *
 * Freestanding wasm32: no libc, no <stdbit.h>. C23 language features
 * (constexpr, static_assert) used freely. No global ctor, no load-time effects.
 */
#ifndef WASM_CRYPTO_SHA3_H
#define WASM_CRYPTO_SHA3_H

#include <stdint.h>
#include <stddef.h>

/* FIPS 202 fixed-digest sizes (bytes). */
constexpr size_t SHA3_224_DIGEST = 28;
constexpr size_t SHA3_256_DIGEST = 32;
constexpr size_t SHA3_384_DIGEST = 48;
constexpr size_t SHA3_512_DIGEST = 64;

/* FIPS 202 rates (bytes) = (1600 − capacity) / 8. */
constexpr size_t SHA3_224_RATE = 144;
constexpr size_t SHA3_256_RATE = 136;
constexpr size_t SHA3_384_RATE = 104;
constexpr size_t SHA3_512_RATE = 72;
constexpr size_t SHAKE128_RATE = 168;
constexpr size_t SHAKE256_RATE = 136;

/*
 * Fixed-output SHA-3: absorb `in`/`inLen`, squeeze exactly the digest size for
 * the variant into `out`. `rate` selects the variant; `out` must hold the
 * variant's digest size. `inLen == 0` is the valid empty-message hash.
 */
void sha3_hash(size_t rate, const uint8_t *in, size_t inLen, uint8_t *out, size_t outLen);

/*
 * SHAKE XOF: absorb `in`/`inLen` with the SHAKE domain (0x1F), squeeze exactly
 * `outLen` bytes into `out`. `rate` is SHAKE128_RATE or SHAKE256_RATE.
 */
void shake_xof(size_t rate, const uint8_t *in, size_t inLen, uint8_t *out, size_t outLen);

#endif /* WASM_CRYPTO_SHA3_H */
