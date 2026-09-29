/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * crypto_verify_32.h — freestanding compat shim.
 *
 * open.c and ed25519_ref10.c call crypto_verify_32(x, y) (a constant-time
 * 32-byte equality returning 0 iff equal). libsodium's real crypto_verify/
 * verify.c carries SSE2 intrinsics behind HAVE_EMMINTRIN_H, which is not
 * freestanding-clean; rather than vendor it we provide a tiny branch-free
 * implementation inline here. Constant-time over the 32 bytes (no early exit).
 *
 * Header-only (inline): no seam TU needed.
 */
#ifndef AWA_LIBSODIUM_COMPAT_CRYPTO_VERIFY_32_H
#define AWA_LIBSODIUM_COMPAT_CRYPTO_VERIFY_32_H

#include <stddef.h>
#include <stdint.h>

#define crypto_verify_32_BYTES 32U

static inline int crypto_verify_32(const unsigned char *x, const unsigned char *y) {
    uint_fast16_t d = 0U;
    for (size_t i = 0; i < 32U; i++) {
        d |= (uint_fast16_t) (x[i] ^ y[i]);
    }
    /* 0 iff equal, -1 otherwise (matches libsodium's return contract). */
    return (1 & ((d - 1) >> 8)) - 1;
}

#endif /* AWA_LIBSODIUM_COMPAT_CRYPTO_VERIFY_32_H */
