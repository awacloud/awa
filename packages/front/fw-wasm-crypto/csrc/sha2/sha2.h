/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * sha2.h — FIPS 180-4 SHA-256 / SHA-384 / SHA-512 (C23, freestanding wasm32).
 *
 * This is a SHARED csrc lib: the incremental init/update/final context API
 * below is a FROZEN internal contract consumed read-only (#include) by the
 * HMAC / HKDF / PBKDF2 shims (tasks 06/07/08). Its file paths
 * (`csrc/sha2/sha2.{c,h}`) and the `sha256_*` / `sha384_*` / `sha512_*` symbol
 * names are fixed once delivered — downstream tasks bind to them verbatim.
 *
 * The frozen wasm-crypto `sha2(variantId, …)` ABI lives in `shims/sha2.c`,
 * which drives this core; this header carries only the streaming primitives.
 *
 * Freestanding wasm32: no libc, no C23 *library* headers (<stdbit.h>/
 * <stdckdint.h> deliberately avoided — `rotr` is hand-rolled). Only the
 * freestanding-mandated <stdint.h>/<stddef.h> are pulled in. C23 *language*
 * features (constexpr, static_assert) are used freely. No global constructor,
 * no side effects at load.
 *
 * Constant-time posture: the compression functions are straight-line with no
 * secret-dependent branch or table index. The message inputs hashed here are
 * public, but HMAC reuses this core over a secret key — keeping it branch-free
 * preserves that reuse. The in-engine CT proof is acvp-wasm-ct-fuzz's job;
 * this code does NOT self-attest constant-time.
 */
#ifndef WASM_CRYPTO_SHA2_H
#define WASM_CRYPTO_SHA2_H

#include <stdint.h>
#include <stddef.h>

static_assert(sizeof(uint32_t) == 4, "uint32_t must be 32-bit");
static_assert(sizeof(uint64_t) == 8, "uint64_t must be 64-bit");

/* FIPS 180-4 sizes. Block sizes are needed by HMAC (ipad/opad framing). */
constexpr size_t SHA256_BLOCK  = 64;   /* 512-bit block */
constexpr size_t SHA512_BLOCK  = 128;  /* 1024-bit block (also SHA-384) */
constexpr size_t SHA256_DIGEST = 32;
constexpr size_t SHA384_DIGEST = 48;
constexpr size_t SHA512_DIGEST = 64;

/* ── SHA-256 state (32-bit words, 64-byte block) ─────────────────────────── */
typedef struct {
    uint32_t h[8];        /* chaining value */
    uint64_t total;       /* total message length in bytes */
    uint8_t  buf[64];     /* partial-block buffer */
    size_t   buf_len;     /* bytes currently buffered (< 64) */
} sha256_ctx;

void sha256_init(sha256_ctx *ctx);
void sha256_update(sha256_ctx *ctx, const uint8_t *data, size_t len);
void sha256_final(sha256_ctx *ctx, uint8_t out[32]);

/* ── SHA-512 / SHA-384 state (64-bit words, 128-byte block) ──────────────── */
typedef struct {
    uint64_t h[8];        /* chaining value */
    uint64_t total_lo;    /* total message length in bytes (low 64 bits) */
    uint64_t total_hi;    /* high 64 bits (128-bit length per FIPS 180-4) */
    uint8_t  buf[128];    /* partial-block buffer */
    size_t   buf_len;     /* bytes currently buffered (< 128) */
} sha512_ctx;

/* SHA-384 shares the SHA-512 block/update machinery; only the IV and the
 * truncated 48-byte output differ. update/final go through sha512_*. */
void sha384_init(sha512_ctx *ctx);
void sha512_init(sha512_ctx *ctx);
void sha512_update(sha512_ctx *ctx, const uint8_t *data, size_t len);
void sha512_final(sha512_ctx *ctx, uint8_t out[64]); /* full 64-byte digest */
void sha384_final(sha512_ctx *ctx, uint8_t out[48]); /* truncated 48 bytes */

#endif /* WASM_CRYPTO_SHA2_H */
