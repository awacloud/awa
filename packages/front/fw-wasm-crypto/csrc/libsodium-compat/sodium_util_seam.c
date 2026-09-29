/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * sodium_util_seam.c — freestanding sodium utility seam (c23).
 *
 * Provides freestanding implementations of the sodium_* utility functions
 * referenced by both the ed25519 and curve25519 ref10 vendored sources:
 *
 *   - sodium_memzero  — volatile secure zero (no optimisation removal).
 *   - sodium_memcmp   — constant-time compare (returns 0 iff equal, -1 otherwise).
 *   - sodium_is_zero  — constant-time all-zero predicate (returns 1 iff all zero).
 *
 * Used by BOTH the ed25519 and x25519 wasm modules. The x25519 module does NOT
 * pull sodium_sha512_seam.c (SHA-512 is only needed for ed25519).
 *
 * Compiled -std=c23 (cStdFor: csrc/ → c23). No libc dependencies.
 */

#include <stddef.h>
#include <stdint.h>

#include "utils.h"

/* ── secure zero ────────────────────────────────────────────────────────────── */

void sodium_memzero(void *const pnt, const size_t len) {
    volatile unsigned char *volatile p = (volatile unsigned char *volatile) pnt;
    size_t i = 0U;
    while (i < len) {
        p[i] = 0U;
        i++;
    }
}

/* ── constant-time compare ──────────────────────────────────────────────────── */

int sodium_memcmp(const void *const b1_, const void *const b2_, size_t len) {
    const unsigned char *b1 = (const unsigned char *) b1_;
    const unsigned char *b2 = (const unsigned char *) b2_;
    uint_fast16_t d = 0U;
    for (size_t i = 0U; i < len; i++) {
        d |= (uint_fast16_t) (b1[i] ^ b2[i]);
    }
    return (1 & ((d - 1) >> 8)) - 1;
}

/* ── constant-time all-zero predicate ──────────────────────────────────────── */

/* Returns 1 iff all `nlen` bytes are zero. Used by the fe25519 is_canonical
 * helpers in the ref10 fe headers. */
int sodium_is_zero(const unsigned char *n, const size_t nlen) {
    unsigned char d = 0U;
    for (size_t i = 0U; i < nlen; i++) {
        d |= n[i];
    }
    return 1 & ((d - 1) >> 8);
}
