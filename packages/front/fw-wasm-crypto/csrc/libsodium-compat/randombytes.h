/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * randombytes.h — freestanding compat shim wiring libsodium's randombytes to
 * the package's own csrc/rng/ staged-entropy seam.
 *
 * keypair.c calls randombytes_buf(seed, 32) to fill the ed25519 seed. For a
 * deterministic KAT we must NOT use a real CSPRNG (which would be non-
 * reproducible AND a host import). Instead the host stages the RFC 8032 secret
 * scalar into the module's BSS via rng_stage() before calling keygen; this
 * shim's randombytes_buf drains that staged buffer through the seam's
 * randombytes() symbol. Zero imports, fully deterministic.
 *
 * This mirrors the BATCH_21 csrc/pqclean/compat/randombytes.h pattern: it does
 * NOT #define randombytes to a namespaced symbol, so the call binds directly to
 * the seam definition (csrc/rng/rng.c).
 */
#ifndef AWA_LIBSODIUM_COMPAT_RANDOMBYTES_H
#define AWA_LIBSODIUM_COMPAT_RANDOMBYTES_H

#include <stddef.h>
#include <stdint.h>

/* The seam symbol (csrc/rng/rng.c). */
void randombytes(uint8_t *buf, size_t n);

/* libsodium spells the buffer-fill call randombytes_buf; forward to the seam. */
static inline void randombytes_buf(void *const buf, const size_t size) {
    randombytes((uint8_t *) buf, size);
}

#endif /* AWA_LIBSODIUM_COMPAT_RANDOMBYTES_H */
