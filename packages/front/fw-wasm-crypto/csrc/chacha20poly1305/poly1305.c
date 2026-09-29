/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * poly1305.c — RFC 8439 Poly1305 (C23), constant-time, 5 × 26-bit limbs.
 *
 * Ported from spikes/01-great-equalizer-build-seam, productionized into
 * @awacloud/fw-wasm-crypto. Algorithm bodies are byte-for-byte identical to the
 * measured-GO spike; only this provenance comment differs.
 *
 * The accumulator is held as five 26-bit limbs so each schoolbook product
 * fits in uint64_t without overflow; the reduction modulo 2^130 - 5 is the
 * standard limb fold. No secret-dependent branch (the only loop bound is the
 * public message length); the final freeze is a constant-time conditional
 * subtraction via a borrow mask.
 *
 * No <stdbit.h> / no C23 *library* header.
 */

#include "poly1305.h"

void poly1305_init(poly1305_ctx *ctx, const uint8_t key[POLY1305_KEY_BYTES]) {
    /* r is the first 16 bytes, clamped per RFC 8439, split into 26-bit limbs. */
    uint32_t t0 = load32_le(key + 0);
    uint32_t t1 = load32_le(key + 4);
    uint32_t t2 = load32_le(key + 8);
    uint32_t t3 = load32_le(key + 12);

    ctx->r[0] = (t0) & 0x3ffffffu;
    ctx->r[1] = ((t0 >> 26) | (t1 << 6)) & 0x3ffff03u;
    ctx->r[2] = ((t1 >> 20) | (t2 << 12)) & 0x3ffc0ffu;
    ctx->r[3] = ((t2 >> 14) | (t3 << 18)) & 0x3f03fffu;
    ctx->r[4] = ((t3 >> 8)) & 0x00fffffu;

    for (unsigned i = 0; i < 5; i++) ctx->h[i] = 0;

    ctx->pad[0] = load32_le(key + 16);
    ctx->pad[1] = load32_le(key + 20);
    ctx->pad[2] = load32_le(key + 24);
    ctx->pad[3] = load32_le(key + 28);

    ctx->buf_len = 0;
}

/* Absorb exactly one 16-byte block. `hibit` is 1<<24 for full blocks, the
 * top bit position for the (already padded) final partial block. */
static void poly1305_block(poly1305_ctx *ctx, const uint8_t m[16], uint32_t hibit) {
    const uint32_t r0 = ctx->r[0], r1 = ctx->r[1], r2 = ctx->r[2],
                   r3 = ctx->r[3], r4 = ctx->r[4];
    const uint32_t s1 = r1 * 5, s2 = r2 * 5, s3 = r3 * 5, s4 = r4 * 5;

    uint32_t t0 = load32_le(m + 0);
    uint32_t t1 = load32_le(m + 4);
    uint32_t t2 = load32_le(m + 8);
    uint32_t t3 = load32_le(m + 12);

    uint32_t h0 = ctx->h[0] + ((t0) & 0x3ffffffu);
    uint32_t h1 = ctx->h[1] + (((t0 >> 26) | (t1 << 6)) & 0x3ffffffu);
    uint32_t h2 = ctx->h[2] + (((t1 >> 20) | (t2 << 12)) & 0x3ffffffu);
    uint32_t h3 = ctx->h[3] + (((t2 >> 14) | (t3 << 18)) & 0x3ffffffu);
    uint32_t h4 = ctx->h[4] + ((t3 >> 8) | hibit);

    uint64_t d0 = (uint64_t) h0 * r0 + (uint64_t) h1 * s4 + (uint64_t) h2 * s3
                + (uint64_t) h3 * s2 + (uint64_t) h4 * s1;
    uint64_t d1 = (uint64_t) h0 * r1 + (uint64_t) h1 * r0 + (uint64_t) h2 * s4
                + (uint64_t) h3 * s3 + (uint64_t) h4 * s2;
    uint64_t d2 = (uint64_t) h0 * r2 + (uint64_t) h1 * r1 + (uint64_t) h2 * r0
                + (uint64_t) h3 * s4 + (uint64_t) h4 * s3;
    uint64_t d3 = (uint64_t) h0 * r3 + (uint64_t) h1 * r2 + (uint64_t) h2 * r1
                + (uint64_t) h3 * r0 + (uint64_t) h4 * s4;
    uint64_t d4 = (uint64_t) h0 * r4 + (uint64_t) h1 * r3 + (uint64_t) h2 * r2
                + (uint64_t) h3 * r1 + (uint64_t) h4 * r0;

    /* Partial reduction modulo 2^130 - 5. */
    uint32_t c;
    c = (uint32_t) (d0 >> 26); h0 = (uint32_t) d0 & 0x3ffffffu; d1 += c;
    c = (uint32_t) (d1 >> 26); h1 = (uint32_t) d1 & 0x3ffffffu; d2 += c;
    c = (uint32_t) (d2 >> 26); h2 = (uint32_t) d2 & 0x3ffffffu; d3 += c;
    c = (uint32_t) (d3 >> 26); h3 = (uint32_t) d3 & 0x3ffffffu; d4 += c;
    c = (uint32_t) (d4 >> 26); h4 = (uint32_t) d4 & 0x3ffffffu;
    h0 += c * 5;
    c = h0 >> 26; h0 &= 0x3ffffffu; h1 += c;

    ctx->h[0] = h0; ctx->h[1] = h1; ctx->h[2] = h2;
    ctx->h[3] = h3; ctx->h[4] = h4;
}

void poly1305_update(poly1305_ctx *ctx, const uint8_t *m, size_t len) {
    /* Drain any buffered partial block first. */
    if (ctx->buf_len > 0) {
        while (ctx->buf_len < 16 && len > 0) {
            ctx->buf[ctx->buf_len++] = *m++;
            len--;
        }
        if (ctx->buf_len == 16) {
            poly1305_block(ctx, ctx->buf, 1u << 24);
            ctx->buf_len = 0;
        }
    }

    while (len >= 16) {
        poly1305_block(ctx, m, 1u << 24);
        m += 16;
        len -= 16;
    }

    for (size_t i = 0; i < len; i++) ctx->buf[ctx->buf_len++] = m[i];
}

void poly1305_finish(poly1305_ctx *ctx, uint8_t tag[POLY1305_TAG_BYTES]) {
    /* Pad and absorb the final partial block, if any. */
    if (ctx->buf_len > 0) {
        size_t i = ctx->buf_len;
        ctx->buf[i++] = 1;
        while (i < 16) ctx->buf[i++] = 0;
        /* hibit 0: the 1-byte terminator is already in the buffer. */
        poly1305_block(ctx, ctx->buf, 0);
    }

    uint32_t h0 = ctx->h[0], h1 = ctx->h[1], h2 = ctx->h[2],
             h3 = ctx->h[3], h4 = ctx->h[4];

    /* Fully carry h. */
    uint32_t c;
    c = h1 >> 26; h1 &= 0x3ffffffu; h2 += c;
    c = h2 >> 26; h2 &= 0x3ffffffu; h3 += c;
    c = h3 >> 26; h3 &= 0x3ffffffu; h4 += c;
    c = h4 >> 26; h4 &= 0x3ffffffu; h0 += c * 5;
    c = h0 >> 26; h0 &= 0x3ffffffu; h1 += c;

    /* Compute h + -p (i.e. h + 5) and select if there was a carry out of 2^130. */
    uint32_t g0 = h0 + 5; c = g0 >> 26; g0 &= 0x3ffffffu;
    uint32_t g1 = h1 + c; c = g1 >> 26; g1 &= 0x3ffffffu;
    uint32_t g2 = h2 + c; c = g2 >> 26; g2 &= 0x3ffffffu;
    uint32_t g3 = h3 + c; c = g3 >> 26; g3 &= 0x3ffffffu;
    uint32_t g4 = h4 + c - (1u << 26);

    /* mask = 0xffffffff if h >= 2^130-5 (use g), else 0 (use h). Branch-free. */
    uint32_t mask = (g4 >> 31) - 1u;
    g0 &= mask; g1 &= mask; g2 &= mask; g3 &= mask; g4 &= mask;
    mask = ~mask;
    h0 = (h0 & mask) | g0;
    h1 = (h1 & mask) | g1;
    h2 = (h2 & mask) | g2;
    h3 = (h3 & mask) | g3;
    h4 = (h4 & mask) | g4;

    /* Serialise h into 4 × 32-bit words. */
    uint32_t f0 = (h0) | (h1 << 26);
    uint32_t f1 = (h1 >> 6) | (h2 << 20);
    uint32_t f2 = (h2 >> 12) | (h3 << 14);
    uint32_t f3 = (h3 >> 18) | (h4 << 8);

    /* tag = (h + s) mod 2^128. */
    uint64_t t;
    t = (uint64_t) f0 + ctx->pad[0]; f0 = (uint32_t) t;
    t = (uint64_t) f1 + ctx->pad[1] + (t >> 32); f1 = (uint32_t) t;
    t = (uint64_t) f2 + ctx->pad[2] + (t >> 32); f2 = (uint32_t) t;
    t = (uint64_t) f3 + ctx->pad[3] + (t >> 32); f3 = (uint32_t) t;

    store32_le(tag + 0, f0);
    store32_le(tag + 4, f1);
    store32_le(tag + 8, f2);
    store32_le(tag + 12, f3);
}
