/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * sha2.c — FIPS 180-4 SHA-256 / SHA-384 / SHA-512 cores (C23, freestanding).
 *
 * Straight-line compression (no secret-dependent branch/index); big-endian
 * message schedule and length encoding per FIPS 180-4. Shared csrc lib —
 * the HMAC/HKDF/PBKDF2 shims (06/07/08) consume the sha2.h streaming API.
 *
 * No libc, no <stdbit.h>; `rotr32`/`rotr64` are hand-rolled. No global ctor.
 */
#include "csrc/sha2/sha2.h"

/* ── Hand-rolled rotates (avoid <stdbit.h>; branch-free) ─────────────────── */
[[nodiscard]] static inline uint32_t rotr32(uint32_t x, unsigned n) {
    return (x >> n) | (x << ((32u - n) & 31u));
}
[[nodiscard]] static inline uint64_t rotr64(uint64_t x, unsigned n) {
    return (x >> n) | (x << ((64u - n) & 63u));
}

/* Big-endian loads/stores (SHA-2 is defined big-endian; wasm32 is LE). */
[[nodiscard]] static inline uint32_t load32_be(const uint8_t *p) {
    return ((uint32_t) p[0] << 24) | ((uint32_t) p[1] << 16)
         | ((uint32_t) p[2] << 8)  | (uint32_t) p[3];
}
[[nodiscard]] static inline uint64_t load64_be(const uint8_t *p) {
    return ((uint64_t) p[0] << 56) | ((uint64_t) p[1] << 48)
         | ((uint64_t) p[2] << 40) | ((uint64_t) p[3] << 32)
         | ((uint64_t) p[4] << 24) | ((uint64_t) p[5] << 16)
         | ((uint64_t) p[6] << 8)  | (uint64_t) p[7];
}
static inline void store32_be(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t) (v >> 24); p[1] = (uint8_t) (v >> 16);
    p[2] = (uint8_t) (v >> 8);  p[3] = (uint8_t) v;
}
static inline void store64_be(uint8_t *p, uint64_t v) {
    for (unsigned i = 0; i < 8; i++) p[i] = (uint8_t) (v >> (56u - 8u * i));
}

/* ════════════════════════════ SHA-256 ════════════════════════════════════ */

/* FIPS 180-4 §4.2.2 round constants. */
static constexpr uint32_t K256[64] = {
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u,
    0x923f82a4u, 0xab1c5ed5u, 0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
    0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u, 0xe49b69c1u, 0xefbe4786u,
    0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u,
    0x06ca6351u, 0x14292967u, 0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
    0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u, 0xa2bfe8a1u, 0xa81a664bu,
    0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au,
    0x5b9cca4fu, 0x682e6ff3u, 0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
    0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u,
};

static void sha256_compress(uint32_t h[8], const uint8_t block[64]) {
    uint32_t w[64];
    for (unsigned i = 0; i < 16; i++) w[i] = load32_be(block + 4u * i);
    for (unsigned i = 16; i < 64; i++) {
        uint32_t s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >> 3);
        uint32_t s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = h[0], b = h[1], c = h[2], d = h[3];
    uint32_t e = h[4], f = h[5], g = h[6], hh = h[7];
    for (unsigned i = 0; i < 64; i++) {
        uint32_t S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        uint32_t ch = (e & f) ^ (~e & g);
        uint32_t t1 = hh + S1 + ch + K256[i] + w[i];
        uint32_t S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
        uint32_t t2 = S0 + maj;
        hh = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
}

void sha256_init(sha256_ctx *ctx) {
    ctx->h[0] = 0x6a09e667u; ctx->h[1] = 0xbb67ae85u;
    ctx->h[2] = 0x3c6ef372u; ctx->h[3] = 0xa54ff53au;
    ctx->h[4] = 0x510e527fu; ctx->h[5] = 0x9b05688cu;
    ctx->h[6] = 0x1f83d9abu; ctx->h[7] = 0x5be0cd19u;
    ctx->total = 0;
    ctx->buf_len = 0;
}

void sha256_update(sha256_ctx *ctx, const uint8_t *data, size_t len) {
    ctx->total += len;
    /* Fill a partial buffer first. */
    if (ctx->buf_len != 0) {
        while (len != 0 && ctx->buf_len < SHA256_BLOCK) {
            ctx->buf[ctx->buf_len++] = *data++;
            len--;
        }
        if (ctx->buf_len == SHA256_BLOCK) {
            sha256_compress(ctx->h, ctx->buf);
            ctx->buf_len = 0;
        }
    }
    while (len >= SHA256_BLOCK) {
        sha256_compress(ctx->h, data);
        data += SHA256_BLOCK;
        len -= SHA256_BLOCK;
    }
    for (size_t i = 0; i < len; i++) ctx->buf[ctx->buf_len++] = data[i];
}

void sha256_final(sha256_ctx *ctx, uint8_t out[32]) {
    uint64_t bit_len = ctx->total * 8u;
    /* Pad: 0x80, zeros, then 64-bit big-endian bit length. */
    ctx->buf[ctx->buf_len++] = 0x80u;
    if (ctx->buf_len > SHA256_BLOCK - 8u) {
        while (ctx->buf_len < SHA256_BLOCK) ctx->buf[ctx->buf_len++] = 0;
        sha256_compress(ctx->h, ctx->buf);
        ctx->buf_len = 0;
    }
    while (ctx->buf_len < SHA256_BLOCK - 8u) ctx->buf[ctx->buf_len++] = 0;
    store64_be(ctx->buf + SHA256_BLOCK - 8u, bit_len);
    sha256_compress(ctx->h, ctx->buf);
    for (unsigned i = 0; i < 8; i++) store32_be(out + 4u * i, ctx->h[i]);
}

/* ════════════════════════════ SHA-512 / SHA-384 ══════════════════════════ */

/* FIPS 180-4 §4.2.3 round constants. */
static constexpr uint64_t K512[80] = {
    0x428a2f98d728ae22ull, 0x7137449123ef65cdull, 0xb5c0fbcfec4d3b2full,
    0xe9b5dba58189dbbcull, 0x3956c25bf348b538ull, 0x59f111f1b605d019ull,
    0x923f82a4af194f9bull, 0xab1c5ed5da6d8118ull, 0xd807aa98a3030242ull,
    0x12835b0145706fbeull, 0x243185be4ee4b28cull, 0x550c7dc3d5ffb4e2ull,
    0x72be5d74f27b896full, 0x80deb1fe3b1696b1ull, 0x9bdc06a725c71235ull,
    0xc19bf174cf692694ull, 0xe49b69c19ef14ad2ull, 0xefbe4786384f25e3ull,
    0x0fc19dc68b8cd5b5ull, 0x240ca1cc77ac9c65ull, 0x2de92c6f592b0275ull,
    0x4a7484aa6ea6e483ull, 0x5cb0a9dcbd41fbd4ull, 0x76f988da831153b5ull,
    0x983e5152ee66dfabull, 0xa831c66d2db43210ull, 0xb00327c898fb213full,
    0xbf597fc7beef0ee4ull, 0xc6e00bf33da88fc2ull, 0xd5a79147930aa725ull,
    0x06ca6351e003826full, 0x142929670a0e6e70ull, 0x27b70a8546d22ffcull,
    0x2e1b21385c26c926ull, 0x4d2c6dfc5ac42aedull, 0x53380d139d95b3dfull,
    0x650a73548baf63deull, 0x766a0abb3c77b2a8ull, 0x81c2c92e47edaee6ull,
    0x92722c851482353bull, 0xa2bfe8a14cf10364ull, 0xa81a664bbc423001ull,
    0xc24b8b70d0f89791ull, 0xc76c51a30654be30ull, 0xd192e819d6ef5218ull,
    0xd69906245565a910ull, 0xf40e35855771202aull, 0x106aa07032bbd1b8ull,
    0x19a4c116b8d2d0c8ull, 0x1e376c085141ab53ull, 0x2748774cdf8eeb99ull,
    0x34b0bcb5e19b48a8ull, 0x391c0cb3c5c95a63ull, 0x4ed8aa4ae3418acbull,
    0x5b9cca4f7763e373ull, 0x682e6ff3d6b2b8a3ull, 0x748f82ee5defb2fcull,
    0x78a5636f43172f60ull, 0x84c87814a1f0ab72ull, 0x8cc702081a6439ecull,
    0x90befffa23631e28ull, 0xa4506cebde82bde9ull, 0xbef9a3f7b2c67915ull,
    0xc67178f2e372532bull, 0xca273eceea26619cull, 0xd186b8c721c0c207ull,
    0xeada7dd6cde0eb1eull, 0xf57d4f7fee6ed178ull, 0x06f067aa72176fbaull,
    0x0a637dc5a2c898a6ull, 0x113f9804bef90daeull, 0x1b710b35131c471bull,
    0x28db77f523047d84ull, 0x32caab7b40c72493ull, 0x3c9ebe0a15c9bebcull,
    0x431d67c49c100d4cull, 0x4cc5d4becb3e42b6ull, 0x597f299cfc657e2aull,
    0x5fcb6fab3ad6faecull, 0x6c44198c4a475817ull,
};

static void sha512_compress(uint64_t h[8], const uint8_t block[128]) {
    uint64_t w[80];
    for (unsigned i = 0; i < 16; i++) w[i] = load64_be(block + 8u * i);
    for (unsigned i = 16; i < 80; i++) {
        uint64_t s0 = rotr64(w[i - 15], 1) ^ rotr64(w[i - 15], 8) ^ (w[i - 15] >> 7);
        uint64_t s1 = rotr64(w[i - 2], 19) ^ rotr64(w[i - 2], 61) ^ (w[i - 2] >> 6);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint64_t a = h[0], b = h[1], c = h[2], d = h[3];
    uint64_t e = h[4], f = h[5], g = h[6], hh = h[7];
    for (unsigned i = 0; i < 80; i++) {
        uint64_t S1 = rotr64(e, 14) ^ rotr64(e, 18) ^ rotr64(e, 41);
        uint64_t ch = (e & f) ^ (~e & g);
        uint64_t t1 = hh + S1 + ch + K512[i] + w[i];
        uint64_t S0 = rotr64(a, 28) ^ rotr64(a, 34) ^ rotr64(a, 39);
        uint64_t maj = (a & b) ^ (a & c) ^ (b & c);
        uint64_t t2 = S0 + maj;
        hh = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
}

void sha512_init(sha512_ctx *ctx) {
    ctx->h[0] = 0x6a09e667f3bcc908ull; ctx->h[1] = 0xbb67ae8584caa73bull;
    ctx->h[2] = 0x3c6ef372fe94f82bull; ctx->h[3] = 0xa54ff53a5f1d36f1ull;
    ctx->h[4] = 0x510e527fade682d1ull; ctx->h[5] = 0x9b05688c2b3e6c1full;
    ctx->h[6] = 0x1f83d9abfb41bd6bull; ctx->h[7] = 0x5be0cd19137e2179ull;
    ctx->total_lo = 0; ctx->total_hi = 0;
    ctx->buf_len = 0;
}

void sha384_init(sha512_ctx *ctx) {
    ctx->h[0] = 0xcbbb9d5dc1059ed8ull; ctx->h[1] = 0x629a292a367cd507ull;
    ctx->h[2] = 0x9159015a3070dd17ull; ctx->h[3] = 0x152fecd8f70e5939ull;
    ctx->h[4] = 0x67332667ffc00b31ull; ctx->h[5] = 0x8eb44a8768581511ull;
    ctx->h[6] = 0xdb0c2e0d64f98fa7ull; ctx->h[7] = 0x47b5481dbefa4fa4ull;
    ctx->total_lo = 0; ctx->total_hi = 0;
    ctx->buf_len = 0;
}

void sha512_update(sha512_ctx *ctx, const uint8_t *data, size_t len) {
    /* 128-bit total length (FIPS 180-4 allows up to 2^128 bits). */
    uint64_t prev = ctx->total_lo;
    ctx->total_lo += len;
    if (ctx->total_lo < prev) ctx->total_hi++;
    if (ctx->buf_len != 0) {
        while (len != 0 && ctx->buf_len < SHA512_BLOCK) {
            ctx->buf[ctx->buf_len++] = *data++;
            len--;
        }
        if (ctx->buf_len == SHA512_BLOCK) {
            sha512_compress(ctx->h, ctx->buf);
            ctx->buf_len = 0;
        }
    }
    while (len >= SHA512_BLOCK) {
        sha512_compress(ctx->h, data);
        data += SHA512_BLOCK;
        len -= SHA512_BLOCK;
    }
    for (size_t i = 0; i < len; i++) ctx->buf[ctx->buf_len++] = data[i];
}

/* Shared finalize: emit the full 8-word state to `out` (caller truncates). */
static void sha512_finalize(sha512_ctx *ctx, uint8_t out[64]) {
    /* 128-bit big-endian bit length = (hi:lo) bytes << 3. */
    uint64_t bit_hi = (ctx->total_hi << 3) | (ctx->total_lo >> 61);
    uint64_t bit_lo = ctx->total_lo << 3;
    ctx->buf[ctx->buf_len++] = 0x80u;
    if (ctx->buf_len > SHA512_BLOCK - 16u) {
        while (ctx->buf_len < SHA512_BLOCK) ctx->buf[ctx->buf_len++] = 0;
        sha512_compress(ctx->h, ctx->buf);
        ctx->buf_len = 0;
    }
    while (ctx->buf_len < SHA512_BLOCK - 16u) ctx->buf[ctx->buf_len++] = 0;
    store64_be(ctx->buf + SHA512_BLOCK - 16u, bit_hi);
    store64_be(ctx->buf + SHA512_BLOCK - 8u, bit_lo);
    sha512_compress(ctx->h, ctx->buf);
    for (unsigned i = 0; i < 8; i++) store64_be(out + 8u * i, ctx->h[i]);
}

void sha512_final(sha512_ctx *ctx, uint8_t out[64]) {
    sha512_finalize(ctx, out);
}

void sha384_final(sha512_ctx *ctx, uint8_t out[48]) {
    uint8_t full[64];
    sha512_finalize(ctx, full);
    for (unsigned i = 0; i < 48; i++) out[i] = full[i];
}
