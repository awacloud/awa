/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * utils.h — freestanding compat shim for the vendored libsodium ref10 sources.
 *
 * Replaces libsodium's include/sodium/utils.h. The vendored ed25519/curve25519
 * ref10 TUs reference only a small subset of sodium's util surface:
 *   - SODIUM_C99(X)   — the C99 designated-initializer guard (the impl struct in
 *                       x25519_ref10.c uses it). clang is C99+, so it expands to X.
 *   - sodium_memzero  — secure zeroing; provided freestanding in sodium_util_seam.c.
 *   - sodium_memcmp   — constant-time compare; provided freestanding in sodium_util_seam.c.
 *   - sodium_is_zero  — constant-time all-zero check; provided freestanding in sodium_util_seam.c.
 * Nothing here pulls libc.
 */
#ifndef AWA_LIBSODIUM_COMPAT_UTILS_H
#define AWA_LIBSODIUM_COMPAT_UTILS_H

#include <stddef.h>
#include <stdint.h>
#include "export.h"

#ifdef __cplusplus
extern "C" {
#endif

/* C99 designated-initializer guard — clang is always C99+, so expand to X. */
#define SODIUM_C99(X) X

/* Defined freestanding in csrc/libsodium-compat/sodium_util_seam.c. */
void sodium_memzero(void *const pnt, const size_t len);
int  sodium_memcmp(const void *const b1_, const void *const b2_, size_t len);
int  sodium_is_zero(const unsigned char *n, const size_t nlen);

#ifdef __cplusplus
}
#endif

#endif /* AWA_LIBSODIUM_COMPAT_UTILS_H */
