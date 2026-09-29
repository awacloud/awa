/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * sodium_sha512_seam.c — freestanding SHA-512 seam for the ed25519 module (c23).
 *
 * Bridges libsodium's SHA-512 API (one-shot + incremental) onto the package's
 * OWN freestanding csrc/sha2/sha2.c (FIPS 180-4). libsodium's own SHA-512 TU
 * (crypto_hash/sha512/cp/hash_sha512_cp.c) is NOT vendored — it would drag
 * <stdlib.h>/heap-ish utility code.
 *
 * Only the ED25519 module links this TU (SHA-512 is a prerequisite of
 * Ed25519 / RFC 8032). The X25519 module does NOT require SHA-512 and must
 * NOT link this file.
 *
 * The compat state is an opaque byte buffer (see crypto_hash_sha512.h); the
 * real sha512_ctx is overlaid here in the (C23) seam TU so the C11 vendored
 * callers never parse the C23 sha2.h.
 *
 * Compiled -std=c23 (cStdFor: csrc/ → c23). References sha2.h in place (do
 * NOT copy sha2.h into this directory).
 */

#include <stddef.h>
#include <stdint.h>

#include "csrc/sha2/sha2.h"             /* own SHA-512 (package-relative include) */
#include "crypto_hash_sha512.h"         /* opaque state typedef */

/* The seam TU is the only place that bridges the opaque buffer onto the real
 * sha512_ctx, so we can safely static_assert their sizes here. */
static_assert(sizeof(sha512_ctx) <= sizeof(((crypto_hash_sha512_state *)0)->opaque),
              "sha512_ctx must fit in the opaque compat state buffer");

/* ── one-shot ───────────────────────────────────────────────────────────────── */

int crypto_hash_sha512(unsigned char *out, const unsigned char *in,
                       unsigned long long inlen) {
    sha512_ctx ctx;
    sha512_init(&ctx);
    sha512_update(&ctx, in, (size_t) inlen);
    sha512_final(&ctx, out);
    return 0;
}

/* ── incremental ────────────────────────────────────────────────────────────── */

int crypto_hash_sha512_init(crypto_hash_sha512_state *state) {
    sha512_init((sha512_ctx *) (void *) state->opaque);
    return 0;
}

int crypto_hash_sha512_update(crypto_hash_sha512_state *state,
                              const unsigned char *in, unsigned long long inlen) {
    sha512_update((sha512_ctx *) (void *) state->opaque, in, (size_t) inlen);
    return 0;
}

int crypto_hash_sha512_final(crypto_hash_sha512_state *state, unsigned char *out) {
    sha512_final((sha512_ctx *) (void *) state->opaque, out);
    return 0;
}
