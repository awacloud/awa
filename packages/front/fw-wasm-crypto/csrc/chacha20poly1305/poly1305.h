/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * poly1305.h — RFC 8439 Poly1305 one-time authenticator (C23).
 *
 * Ported from spikes/01-great-equalizer-build-seam, productionized into
 * @awacloud/fw-wasm-crypto. Algorithm bodies unchanged from the spike.
 */
#ifndef SPIKE_POLY1305_H
#define SPIKE_POLY1305_H

#include "common.h"

/* Streaming Poly1305 state (5 × 26-bit limbs). */
typedef struct {
    uint32_t r[5];      /* clamped key r, in 26-bit limbs */
    uint32_t h[5];      /* accumulator, in 26-bit limbs */
    uint32_t pad[4];    /* the "s" half of the key */
    uint8_t  buf[16];   /* partial block */
    size_t   buf_len;
} poly1305_ctx;

/* Initialise with the 32-byte one-time key (r || s). */
void poly1305_init(poly1305_ctx *ctx, const uint8_t key[POLY1305_KEY_BYTES]);

/* Absorb `len` message bytes. */
void poly1305_update(poly1305_ctx *ctx, const uint8_t *m, size_t len);

/* Finalise and write the 16-byte tag. */
void poly1305_finish(poly1305_ctx *ctx, uint8_t tag[POLY1305_TAG_BYTES]);

#endif /* SPIKE_POLY1305_H */
