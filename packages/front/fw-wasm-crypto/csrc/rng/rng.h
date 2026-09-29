/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef WASM_CRYPTO_RNG_H
#define WASM_CRYPTO_RNG_H
#include <stddef.h>
#include <stdint.h>

/* Host-facing staging ABI (exported by the shim translation unit that
 * includes rng.c — see the per-scheme tasks 04/05/06). The host writes the
 * vector's deterministic entropy into linear memory and stages it BEFORE
 * calling a keygen/sign export that consumes randomness. */

/* Stage `n` bytes from linear-memory pointer `src` as the entropy to be
 * returned by subsequent randombytes() calls, in order. Resets the read
 * cursor to 0. Returns 0 on success, -1 if n exceeds RNG_STAGE_CAP. */
int rng_stage(const uint8_t* src, uint32_t n);

/* Reset the staged buffer to empty (cursor=0, length=0). */
void rng_reset(void);

/* The seam symbol PQClean / mlkem-native link against. Copies the next `n`
 * bytes from the staged buffer into buf. If fewer than `n` bytes remain,
 * the deficit is zero-filled AND a sticky underflow flag is raised
 * (rng_underflowed() returns non-zero) so a KAT harness can detect an
 * under-staged vector instead of silently passing on zeros. */
void randombytes(uint8_t* buf, size_t n);

/* Non-zero iff any randombytes() call drained past the staged length since the
 * last rng_stage()/rng_reset(). For the test harness; not part of the KAT path. */
int rng_underflowed(void);

#endif
