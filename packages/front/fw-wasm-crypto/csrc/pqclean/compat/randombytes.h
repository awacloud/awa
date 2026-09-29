/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * randombytes.h — compat shim binding PQClean's randomness to the wasm-crypto
 * staged-entropy seam (csrc/rng/rng.{h,c}, task 01).
 *
 * The vendored `vendor/pqclean/common/randombytes.h` declares
 *   #define randombytes PQCLEAN_randombytes
 *   int randombytes(uint8_t *output, size_t n);
 * i.e. it renames every PQClean `randombytes(...)` call site to the namespaced
 * `PQCLEAN_randombytes` symbol, whose definition lives in the (deliberately NOT
 * vendored) `common/randombytes.c`.
 *
 * For the freestanding wasm build we route PQClean's randomness through the seam
 * instead: the seam defines the plain `randombytes(uint8_t*, size_t)` symbol and
 * drains host-staged deterministic entropy (rng_stage/rng_reset). So this
 * package-local shim is placed AHEAD of the vendored common/ directory on the
 * ml_dsa target's include path; the vendored ML-DSA sources `#include
 * "randombytes.h"` resolve to THIS file, dropping the `PQCLEAN_randombytes`
 * rename so their `randombytes(...)` calls bind directly to the seam.
 *
 * The signature matches both the vendored declaration and the seam
 * (`csrc/rng/rng.h`), so including either alongside is type-compatible.
 */

#ifndef WASM_CRYPTO_PQCLEAN_COMPAT_RANDOMBYTES_H
#define WASM_CRYPTO_PQCLEAN_COMPAT_RANDOMBYTES_H

#include <stddef.h>
#include <stdint.h>

/* The staged-entropy seam (csrc/rng/rng.c). No PQCLEAN_ rename: PQClean call
 * sites bind straight to the seam's `randombytes`. */
void randombytes(uint8_t *output, size_t n);

#endif /* WASM_CRYPTO_PQCLEAN_COMPAT_RANDOMBYTES_H */
