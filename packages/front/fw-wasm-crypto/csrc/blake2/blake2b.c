/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * blake2b.c — RFC 7693 BLAKE2b (C23), with a wasm `simd128` compression path
 * and a mandatory scalar fallback, selected at compile time by
 * `__wasm_simd128__` (set by clang's `-msimd128`). BLAKE2b is a listed
 * simd128 beneficiary (OQ-3): the 16-word working vector maps onto eight
 * 2×64-bit v128 lanes and a round is realised by the SSE-style
 * diagonalise / G / undiagonalise dance.
 *
 * Algorithm bytes follow RFC 7693 Appendix C verbatim: the SHA-512 IV, the
 * 12-round sigma message schedule, the ROTR64 mixing function G, and the
 * t-counter / last-block (f[0]=~0) finalisation. The scalar path is the parity
 * oracle; the simd path must produce byte-identical digests.
 *
 * NO <stdbit.h> / no C23 *library* header is included: rotr64 is hand-rolled.
 * No libc, no global ctor, no secret-dependent control flow.
 */

#include "csrc/blake2/blake2b.h"

/* SHA-512 / BLAKE2b IV (RFC 7693 §2.6). */
static constexpr uint64_t blake2b_iv[8] = {
    0x6a09e667f3bcc908ULL, 0xbb67ae8584caa73bULL,
    0x3c6ef372fe94f82bULL, 0xa54ff53a5f1d36f1ULL,
    0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL,
    0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL,
};

/* Message word schedule permutations (RFC 7693 §2.7), 12 rounds. */
static constexpr uint8_t blake2b_sigma[12][16] = {
    {  0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15 },
    { 14, 10,  4,  8,  9, 15, 13,  6,  1, 12,  0,  2, 11,  7,  5,  3 },
    { 11,  8, 12,  0,  5,  2, 15, 13, 10, 14,  3,  6,  7,  1,  9,  4 },
    {  7,  9,  3,  1, 13, 12, 11, 14,  2,  6,  5, 10,  4,  0, 15,  8 },
    {  9,  0,  5,  7,  2,  4, 10, 15, 14,  1, 11, 12,  6,  8,  3, 13 },
    {  2, 12,  6, 10,  0, 11,  8,  3,  4, 13,  7,  5, 15, 14,  1,  9 },
    { 12,  5,  1, 15, 14, 13,  4, 10,  0,  7,  6,  3,  9,  2,  8, 11 },
    { 13, 11,  7, 14, 12,  1,  3,  9,  5,  0, 15,  4,  8,  6,  2, 10 },
    {  6, 15, 14,  9, 11,  3,  0,  8, 12,  2, 13,  7,  1,  4, 10,  5 },
    { 10,  2,  8,  4,  7,  6,  1,  5, 15, 11,  9, 14,  3, 12, 13,  0 },
    {  0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15 },
    { 14, 10,  4,  8,  9, 15, 13,  6,  1, 12,  0,  2, 11,  7,  5,  3 },
};

/* Cyclic right rotation (hand-rolled — no <stdbit.h>). */
static inline uint64_t rotr64(uint64_t x, int y) {
    return (x >> y) | (x << (64 - y));
}

/* Little-endian 64-bit load/store (wasm32 is LE; explicit for any host). */
[[nodiscard]] static inline uint64_t load64_le(const uint8_t *p) {
    return ((uint64_t) p[0])        | ((uint64_t) p[1] << 8)
         | ((uint64_t) p[2] << 16)  | ((uint64_t) p[3] << 24)
         | ((uint64_t) p[4] << 32)  | ((uint64_t) p[5] << 40)
         | ((uint64_t) p[6] << 48)  | ((uint64_t) p[7] << 56);
}
static inline void store64_le(uint8_t *p, uint64_t v) {
    for (unsigned i = 0; i < 8; i++) p[i] = (uint8_t) (v >> (8u * i));
}

#if defined(__wasm_simd128__)

/* ───────────────────────── simd128 path ───────────────────────────────── */
#include <wasm_simd128.h>

/* A v128 holds two 64-bit lanes [lo, hi]. Per-lane right-rotate. */
static inline v128_t rotr64_v(v128_t x, int n) {
    return wasm_v128_or(wasm_u64x2_shr(x, n), wasm_i64x2_shl(x, 64 - n));
}

/* Pick lanes: build a v128 from two named message words m[i], m[j]. The
 * SSE-style layout splits v[0..15] into 4 rows of 4 words, each row held as
 * two 2-lane v128 registers (l/h); a column round runs all 4 columns in two
 * v128 ops, a diagonalise shuffle realigns for the diagonal round. */
#define M2(i, j) wasm_i64x2_make(m[(i)], m[(j)])

static void blake2b_compress(blake2b_ctx *ctx, const uint8_t block[BLAKE2B_BLOCKBYTES]) {
    uint64_t m[16];
    for (int i = 0; i < 16; i++) m[i] = load64_le(block + 8 * i);

    /* Working vector as 4 row registers of 2 lanes (the SSE/NEON BLAKE2b form):
     *   r1 = [v0,v1]  r2 = [v2,v3]  r3 = [v4,v5]  r4 = [v6,v7]
     *   r5 = [v8,v9]  r6 = [v10,v11] r7 = [v12,v13] r8 = [v14,v15]
     * Columns operate on (r1,r3,r5,r7) and (r2,r4,r6,r8) lane-aligned. */
    v128_t row1l = wasm_i64x2_make(ctx->h[0], ctx->h[1]);
    v128_t row1h = wasm_i64x2_make(ctx->h[2], ctx->h[3]);
    v128_t row2l = wasm_i64x2_make(ctx->h[4], ctx->h[5]);
    v128_t row2h = wasm_i64x2_make(ctx->h[6], ctx->h[7]);
    v128_t row3l = wasm_i64x2_make(blake2b_iv[0], blake2b_iv[1]);
    v128_t row3h = wasm_i64x2_make(blake2b_iv[2], blake2b_iv[3]);
    v128_t row4l = wasm_i64x2_make(blake2b_iv[4] ^ ctx->t[0], blake2b_iv[5] ^ ctx->t[1]);
    v128_t row4h = wasm_i64x2_make(blake2b_iv[6] ^ ctx->f[0], blake2b_iv[7] ^ ctx->f[1]);

    for (int r = 0; r < 12; r++) {
        const uint8_t *s = blake2b_sigma[r];

        /* Column step. */
        row1l = wasm_i64x2_add(wasm_i64x2_add(row1l, row2l), M2(s[0], s[2]));
        row1h = wasm_i64x2_add(wasm_i64x2_add(row1h, row2h), M2(s[4], s[6]));
        row4l = rotr64_v(wasm_v128_xor(row4l, row1l), 32);
        row4h = rotr64_v(wasm_v128_xor(row4h, row1h), 32);
        row3l = wasm_i64x2_add(row3l, row4l);
        row3h = wasm_i64x2_add(row3h, row4h);
        row2l = rotr64_v(wasm_v128_xor(row2l, row3l), 24);
        row2h = rotr64_v(wasm_v128_xor(row2h, row3h), 24);

        row1l = wasm_i64x2_add(wasm_i64x2_add(row1l, row2l), M2(s[1], s[3]));
        row1h = wasm_i64x2_add(wasm_i64x2_add(row1h, row2h), M2(s[5], s[7]));
        row4l = rotr64_v(wasm_v128_xor(row4l, row1l), 16);
        row4h = rotr64_v(wasm_v128_xor(row4h, row1h), 16);
        row3l = wasm_i64x2_add(row3l, row4l);
        row3h = wasm_i64x2_add(row3h, row4h);
        row2l = rotr64_v(wasm_v128_xor(row2l, row3l), 63);
        row2h = rotr64_v(wasm_v128_xor(row2h, row3h), 63);

        /* Diagonalise: rotate row2 left 1 word, row3 by 2, row4 by 3. With the
         * [l,h] split, a 1-word rotation of the 4-lane row swaps/shuffles the
         * lo/hi registers. */
        {
            v128_t t;
            /* row2: [v4,v5,v6,v7] -> [v5,v6,v7,v4] */
            t     = wasm_i64x2_shuffle(row2l, row2h, 1, 2); /* [v5,v6] */
            row2h = wasm_i64x2_shuffle(row2l, row2h, 3, 0); /* [v7,v4] */
            row2l = t;
            /* row3: [v8,v9,v10,v11] -> [v10,v11,v8,v9] (swap halves) */
            t     = row3l; row3l = row3h; row3h = t;
            /* row4: [v12,v13,v14,v15] -> [v15,v12,v13,v14] */
            t     = wasm_i64x2_shuffle(row4l, row4h, 3, 0); /* [v15,v12] */
            row4h = wasm_i64x2_shuffle(row4l, row4h, 1, 2); /* [v13,v14] */
            row4l = t;
        }

        /* Diagonal step. */
        row1l = wasm_i64x2_add(wasm_i64x2_add(row1l, row2l), M2(s[8], s[10]));
        row1h = wasm_i64x2_add(wasm_i64x2_add(row1h, row2h), M2(s[12], s[14]));
        row4l = rotr64_v(wasm_v128_xor(row4l, row1l), 32);
        row4h = rotr64_v(wasm_v128_xor(row4h, row1h), 32);
        row3l = wasm_i64x2_add(row3l, row4l);
        row3h = wasm_i64x2_add(row3h, row4h);
        row2l = rotr64_v(wasm_v128_xor(row2l, row3l), 24);
        row2h = rotr64_v(wasm_v128_xor(row2h, row3h), 24);

        row1l = wasm_i64x2_add(wasm_i64x2_add(row1l, row2l), M2(s[9], s[11]));
        row1h = wasm_i64x2_add(wasm_i64x2_add(row1h, row2h), M2(s[13], s[15]));
        row4l = rotr64_v(wasm_v128_xor(row4l, row1l), 16);
        row4h = rotr64_v(wasm_v128_xor(row4h, row1h), 16);
        row3l = wasm_i64x2_add(row3l, row4l);
        row3h = wasm_i64x2_add(row3h, row4h);
        row2l = rotr64_v(wasm_v128_xor(row2l, row3l), 63);
        row2h = rotr64_v(wasm_v128_xor(row2h, row3h), 63);

        /* Undiagonalise (inverse of the above word rotations). Registers now
         * hold row2l=[v5,v6] row2h=[v7,v4]; row3 halves swapped;
         * row4l=[v15,v12] row4h=[v13,v14]. */
        {
            v128_t t;
            /* row2: [v5,v6,v7,v4] -> [v4,v5,v6,v7] */
            t     = wasm_i64x2_shuffle(row2l, row2h, 3, 0); /* [v4,v5] */
            row2h = wasm_i64x2_shuffle(row2l, row2h, 1, 2); /* [v6,v7] */
            row2l = t;
            /* row3: swap halves back. */
            t     = row3l; row3l = row3h; row3h = t;
            /* row4: [v15,v12,v13,v14] -> [v12,v13,v14,v15] */
            t     = wasm_i64x2_shuffle(row4l, row4h, 1, 2); /* [v12,v13] */
            row4h = wasm_i64x2_shuffle(row4l, row4h, 3, 0); /* [v14,v15] */
            row4l = t;
        }
    }

    /* Feed-forward: h ^= v[0..7] ^ v[8..15]. */
    uint64_t v[16];
    wasm_v128_store(&v[0],  row1l); wasm_v128_store(&v[2],  row1h);
    wasm_v128_store(&v[4],  row2l); wasm_v128_store(&v[6],  row2h);
    wasm_v128_store(&v[8],  row3l); wasm_v128_store(&v[10], row3h);
    wasm_v128_store(&v[12], row4l); wasm_v128_store(&v[14], row4h);
    for (int i = 0; i < 8; i++) ctx->h[i] ^= v[i] ^ v[i + 8];
}

#undef M2

#else /* scalar path */

/* ───────────────────────── scalar path ────────────────────────────────── */

/* G mixing function (RFC 7693 §3.1). */
#define B2B_G(a, b, c, d, x, y)            \
    v[a] = v[a] + v[b] + (x);              \
    v[d] = rotr64(v[d] ^ v[a], 32);        \
    v[c] = v[c] + v[d];                    \
    v[b] = rotr64(v[b] ^ v[c], 24);        \
    v[a] = v[a] + v[b] + (y);              \
    v[d] = rotr64(v[d] ^ v[a], 16);        \
    v[c] = v[c] + v[d];                    \
    v[b] = rotr64(v[b] ^ v[c], 63)

static void blake2b_compress(blake2b_ctx *ctx, const uint8_t block[BLAKE2B_BLOCKBYTES]) {
    uint64_t v[16];
    uint64_t m[16];

    for (int i = 0; i < 16; i++) m[i] = load64_le(block + 8 * i);

    for (int i = 0; i < 8; i++) v[i]     = ctx->h[i];
    for (int i = 0; i < 8; i++) v[i + 8] = blake2b_iv[i];
    v[12] ^= ctx->t[0];
    v[13] ^= ctx->t[1];
    v[14] ^= ctx->f[0];
    v[15] ^= ctx->f[1];

    for (int i = 0; i < 12; i++) {
        const uint8_t *s = blake2b_sigma[i];
        B2B_G(0, 4,  8, 12, m[s[ 0]], m[s[ 1]]);
        B2B_G(1, 5,  9, 13, m[s[ 2]], m[s[ 3]]);
        B2B_G(2, 6, 10, 14, m[s[ 4]], m[s[ 5]]);
        B2B_G(3, 7, 11, 15, m[s[ 6]], m[s[ 7]]);
        B2B_G(0, 5, 10, 15, m[s[ 8]], m[s[ 9]]);
        B2B_G(1, 6, 11, 12, m[s[10]], m[s[11]]);
        B2B_G(2, 7,  8, 13, m[s[12]], m[s[13]]);
        B2B_G(3, 4,  9, 14, m[s[14]], m[s[15]]);
    }

    for (int i = 0; i < 8; i++) ctx->h[i] ^= v[i] ^ v[i + 8];
}

#undef B2B_G

#endif /* simd / scalar */

/* ───────────────────────── streaming API ──────────────────────────────── */

/* Increment the 128-bit byte counter t by `inc`. */
static inline void blake2b_increment_counter(blake2b_ctx *ctx, uint64_t inc) {
    ctx->t[0] += inc;
    ctx->t[1] += (ctx->t[0] < inc) ? 1 : 0;
}

int blake2b_init_param(blake2b_ctx *ctx, const blake2b_param *P) {
    if (P->digest_length == 0 || P->digest_length > BLAKE2B_OUTBYTES) {
        return -1;
    }
    const uint8_t *p = (const uint8_t *) P;
    for (int i = 0; i < 8; i++) ctx->h[i] = blake2b_iv[i] ^ load64_le(p + 8 * i);
    ctx->t[0] = 0;
    ctx->t[1] = 0;
    ctx->f[0] = 0;
    ctx->f[1] = 0;
    ctx->buflen = 0;
    ctx->outlen = P->digest_length;
    for (size_t i = 0; i < BLAKE2B_BLOCKBYTES; i++) ctx->buf[i] = 0;
    return 0;
}

void blake2b_update(blake2b_ctx *ctx, const uint8_t *in, size_t inlen) {
    if (inlen == 0) return;
    size_t left = ctx->buflen;
    size_t fill = BLAKE2B_BLOCKBYTES - left;

    /* If this update overflows the buffer, flush the current full block(s). */
    if (inlen > fill) {
        ctx->buflen = 0;
        for (size_t i = 0; i < fill; i++) ctx->buf[left + i] = in[i];
        blake2b_increment_counter(ctx, BLAKE2B_BLOCKBYTES);
        blake2b_compress(ctx, ctx->buf);
        in += fill;
        inlen -= fill;
        while (inlen > BLAKE2B_BLOCKBYTES) {
            blake2b_increment_counter(ctx, BLAKE2B_BLOCKBYTES);
            blake2b_compress(ctx, in);
            in += BLAKE2B_BLOCKBYTES;
            inlen -= BLAKE2B_BLOCKBYTES;
        }
        left = 0;
    }
    /* Buffer the trailing bytes (never compress here — the final block is held
     * back for blake2b_final to apply the last-block flag). */
    for (size_t i = 0; i < inlen; i++) ctx->buf[left + i] = in[i];
    ctx->buflen = left + inlen;
}

void blake2b_final(blake2b_ctx *ctx, uint8_t *out) {
    blake2b_increment_counter(ctx, (uint64_t) ctx->buflen);
    ctx->f[0] = (uint64_t) -1;                         /* last-block flag */
    for (size_t i = ctx->buflen; i < BLAKE2B_BLOCKBYTES; i++) ctx->buf[i] = 0;
    blake2b_compress(ctx, ctx->buf);

    uint8_t full[BLAKE2B_OUTBYTES];
    for (int i = 0; i < 8; i++) store64_le(full + 8 * i, ctx->h[i]);
    for (size_t i = 0; i < ctx->outlen; i++) out[i] = full[i];
}

int blake2b_long(uint8_t *out, size_t outlen, const uint8_t *in, size_t inlen) {
    if (outlen == 0 || outlen > BLAKE2B_OUTBYTES) return -1;
    blake2b_param P;
    uint8_t *pp = (uint8_t *) &P;
    for (size_t i = 0; i < sizeof(P); i++) pp[i] = 0;
    P.digest_length = (uint8_t) outlen;
    P.key_length    = 0;
    P.fanout        = 1;
    P.depth         = 1;

    blake2b_ctx ctx;
    if (blake2b_init_param(&ctx, &P) != 0) return -1;
    blake2b_update(&ctx, in, inlen);
    blake2b_final(&ctx, out);
    return 0;
}
