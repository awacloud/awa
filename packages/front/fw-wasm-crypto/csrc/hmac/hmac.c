/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * hmac.c — FIPS 198-1 HMAC over the OWN SHA-2 core (C23, freestanding wasm32).
 *
 * HMAC(K, m) = H( (K0 ⊕ opad) ∥ H( (K0 ⊕ ipad) ∥ m ) ), where
 *   - ipad = 0x36 repeated to the block length, opad = 0x5c likewise;
 *   - K0 = H(K) zero-padded to block length   if len(K) > block
 *        = K   zero-padded to block length     otherwise.
 * Block length B = 64 for SHA-256, 128 for SHA-384/SHA-512.
 *
 * The SHA-2 primitive is the own streaming core (csrc/sha2/), consumed
 * READ-ONLY: this file #includes its header and reuses the `sha256_*` /
 * `sha384_*` / `sha512_*` contexts. SHA-2 is never re-implemented here.
 *
 * Constant-time: the only control flow is the dispatch on the PUBLIC hashId and
 * the public-length key-conditioning branch (keyLen vs block); there is no
 * secret-dependent branch or memory index over key/message bytes. The
 * in-engine CT proof is the CT-fuzz job — this file does NOT self-attest CT.
 */

#include "csrc/hmac/hmac.h"
#include "csrc/sha2/sha2.h"

#define HMAC_EBADPARAM (-1)

/* ── Small freestanding helpers (no libc) ─────────────────────────────────── */

static void hmac_memset(uint8_t *p, uint8_t v, size_t n) {
    for (size_t i = 0; i < n; i++) p[i] = v;
}

static void hmac_memcpy(uint8_t *dst, const uint8_t *src, size_t n) {
    for (size_t i = 0; i < n; i++) dst[i] = src[i];
}

/* ── Per-hashId SHA-2 driver (a tiny vtable-free dispatch) ────────────────── */

/* Hash `len` bytes of `data` into `out` (full digest) using `hashId`. */
static void sha2_oneshot(int hashId, const uint8_t *data, size_t len, uint8_t *out) {
    switch (hashId) {
        case 256: {
            sha256_ctx c;
            sha256_init(&c);
            if (len) sha256_update(&c, data, len);
            sha256_final(&c, out);
            break;
        }
        case 384: {
            sha512_ctx c;
            sha384_init(&c);
            if (len) sha512_update(&c, data, len);
            sha384_final(&c, out);
            break;
        }
        default: { /* 512 */
            sha512_ctx c;
            sha512_init(&c);
            if (len) sha512_update(&c, data, len);
            sha512_final(&c, out);
            break;
        }
    }
}

/* Initialise the inner SHA-2 ctx held by `ctx` for its hashId. */
static void inner_init(hmac_ctx *ctx) {
    switch (ctx->hashId) {
        case 256: sha256_init(&ctx->inner.s256); break;
        case 384: sha384_init(&ctx->inner.s512); break;
        default:  sha512_init(&ctx->inner.s512); break; /* 512 */
    }
}

/* Absorb into the inner SHA-2 ctx held by `ctx`. */
static void inner_update(hmac_ctx *ctx, const uint8_t *data, size_t len) {
    if (!len) return;
    if (ctx->hashId == 256) sha256_update(&ctx->inner.s256, data, len);
    else                    sha512_update(&ctx->inner.s512, data, len);
}

/* Finalise the inner SHA-2 ctx held by `ctx` into `out` (full digest). */
static void inner_final(hmac_ctx *ctx, uint8_t *out) {
    switch (ctx->hashId) {
        case 256: sha256_final(&ctx->inner.s256, out); break;
        case 384: sha384_final(&ctx->inner.s512, out); break;
        default:  sha512_final(&ctx->inner.s512, out); break; /* 512 */
    }
}

size_t hmac_digest_size(int hashId) {
    switch (hashId) {
        case 256: return SHA256_DIGEST;
        case 384: return SHA384_DIGEST;
        case 512: return SHA512_DIGEST;
        default:  return 0;
    }
}

static size_t hmac_block_size(int hashId) {
    switch (hashId) {
        case 256: return SHA256_BLOCK;
        case 384: return SHA512_BLOCK;
        case 512: return SHA512_BLOCK;
        default:  return 0;
    }
}

/* ── Public API ───────────────────────────────────────────────────────────── */

int hmac_init(hmac_ctx *ctx, int hashId, const uint8_t *key, size_t keyLen) {
    const size_t block  = hmac_block_size(hashId);
    const size_t digest = hmac_digest_size(hashId);
    if (block == 0) return HMAC_EBADPARAM;

    ctx->hashId = hashId;
    ctx->block  = block;
    ctx->digest = digest;

    /* K0 = key conditioned to exactly `block` bytes. */
    uint8_t k0[HMAC_MAX_BLOCK];
    hmac_memset(k0, 0, block);
    if (keyLen > block) {
        /* Long key → hash it, then zero-pad the digest up to block. */
        sha2_oneshot(hashId, key, keyLen, k0); /* writes `digest` bytes, rest stays 0 */
    } else {
        hmac_memcpy(k0, key, keyLen);          /* short key → zero-padded copy */
    }

    /* ipad/opad framing: prime inner with K0⊕ipad, cache K0⊕opad. */
    uint8_t ipad_key[HMAC_MAX_BLOCK];
    for (size_t i = 0; i < block; i++) {
        ipad_key[i]       = (uint8_t)(k0[i] ^ 0x36u);
        ctx->opad_key[i]  = (uint8_t)(k0[i] ^ 0x5cu);
    }

    inner_init(ctx);
    inner_update(ctx, ipad_key, block);
    return 0;
}

void hmac_update(hmac_ctx *ctx, const uint8_t *data, size_t len) {
    inner_update(ctx, data, len);
}

void hmac_final(hmac_ctx *ctx, uint8_t *out) {
    /* inner = H(K0⊕ipad ∥ msg) */
    uint8_t inner[HMAC_MAX_DIGEST];
    inner_final(ctx, inner);

    /* outer = H(K0⊕opad ∥ inner) */
    switch (ctx->hashId) {
        case 256: {
            sha256_ctx c;
            sha256_init(&c);
            sha256_update(&c, ctx->opad_key, ctx->block);
            sha256_update(&c, inner, ctx->digest);
            sha256_final(&c, out);
            break;
        }
        case 384: {
            sha512_ctx c;
            sha384_init(&c);
            sha512_update(&c, ctx->opad_key, ctx->block);
            sha512_update(&c, inner, ctx->digest);
            sha384_final(&c, out);
            break;
        }
        default: { /* 512 */
            sha512_ctx c;
            sha512_init(&c);
            sha512_update(&c, ctx->opad_key, ctx->block);
            sha512_update(&c, inner, ctx->digest);
            sha512_final(&c, out);
            break;
        }
    }
}

int hmac_oneshot(int hashId, const uint8_t *key, size_t keyLen,
                 const uint8_t *msg, size_t msgLen, uint8_t *out) {
    hmac_ctx ctx;
    if (hmac_init(&ctx, hashId, key, keyLen) != 0) return HMAC_EBADPARAM;
    hmac_update(&ctx, msg, msgLen);
    hmac_final(&ctx, out);
    return 0;
}
