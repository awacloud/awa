/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * export.h — freestanding compat shim for the vendored libsodium ref10 sources.
 *
 * Replaces libsodium's include/sodium/export.h (which selects DLL/visibility
 * attributes per platform). Under the freestanding wasm32 build there is a
 * single static link unit, so every SODIUM_EXPORT collapses to nothing and
 * CRYPTO_ALIGN maps to the clang aligned attribute. SODIUM_MIN/SODIUM_SIZE_MAX
 * are reproduced for utils.h.
 */
#ifndef AWA_LIBSODIUM_COMPAT_EXPORT_H
#define AWA_LIBSODIUM_COMPAT_EXPORT_H

#include <stddef.h>
#include <stdint.h>

#define SODIUM_EXPORT
#define SODIUM_EXPORT_WEAK

#ifndef CRYPTO_ALIGN
#define CRYPTO_ALIGN(x) __attribute__((aligned(x)))
#endif

#define SODIUM_MIN(A, B) ((A) < (B) ? (A) : (B))
#ifndef SIZE_MAX
#define SIZE_MAX __SIZE_MAX__
#endif
#define SODIUM_SIZE_MAX SODIUM_MIN(UINT64_MAX, SIZE_MAX)

#endif /* AWA_LIBSODIUM_COMPAT_EXPORT_H */
