/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * hmac.h — FIPS 198-1 HMAC over the OWN SHA-2 core (C23, freestanding wasm32).
 *
 * This is a SHARED csrc lib: the incremental init/update/final context API
 * below is a FROZEN internal contract consumed read-only (#include) by the
 * HKDF / PBKDF2 shims (tasks 07/08), plus a one-shot helper. Its file paths
 * (`csrc/hmac/hmac.{c,h}`) and the `hmac_*` symbol names are fixed once
 * delivered — downstream tasks bind to them verbatim.
 *
 * The frozen wasm-crypto `hmac(hashId, …)` ABI lives in `shims/hmac.c`, which
 * drives this core; this header carries only the streaming + one-shot
 * primitives.
 *
 * It is built READ-ONLY over the own SHA-2 lib (csrc/sha2/sha2.{c,h}, task 02):
 * the ipad/opad framing reuses the `sha256_*` / `sha384_*` / `sha512_*`
 * streaming contexts and the SHA256_BLOCK / SHA512_BLOCK block sizes. SHA-2 is
 * NOT re-implemented or duplicated here.
 *
 * hashId enum (mirrors the frozen sha2 variantId): 256 = HMAC-SHA-256,
 * 384 = HMAC-SHA-384, 512 = HMAC-SHA-512.
 *
 * Freestanding wasm32: no libc, no C23 *library* headers (<stdbit.h>
 * deliberately avoided). Only <stdint.h>/<stddef.h> are pulled in. C23
 * *language* features (constexpr, static_assert) are used freely. No global
 * constructor, no side effect at load.
 *
 * Constant-time posture: the dispatch is on the PUBLIC hashId only; there is
 * no secret-dependent branch or table index over the key/message bytes. The
 * in-engine CT proof is acvp-wasm-ct-fuzz's job; this code does NOT self-attest
 * constant-time.
 */
#ifndef WASM_CRYPTO_HMAC_H
#define WASM_CRYPTO_HMAC_H

#include <stdint.h>
#include <stddef.h>

#include "csrc/sha2/sha2.h"

static_assert(SHA512_BLOCK >= SHA256_BLOCK, "SHA-512 block must dominate SHA-256");

/* Largest block / digest across the supported hashes — sizes the scratch. */
constexpr size_t HMAC_MAX_BLOCK  = SHA512_BLOCK;   /* 128 */
constexpr size_t HMAC_MAX_DIGEST = SHA512_DIGEST;  /* 64  */

/*
 * Incremental HMAC context. Carries the inner SHA-2 streaming context (already
 * primed with K⊕ipad) plus enough state to compute the outer hash at final
 * time. `block`/`digest` cache the per-hashId sizes so update/final need no
 * re-dispatch. The union holds whichever SHA-2 ctx the hashId selects.
 */
typedef struct {
    int    hashId;                 /* 256 / 384 / 512 (0 = uninitialised/bad) */
    size_t block;                  /* block size in bytes (64 or 128)         */
    size_t digest;                 /* digest size in bytes (32 / 48 / 64)     */
    uint8_t opad_key[HMAC_MAX_BLOCK]; /* K0 ⊕ opad, replayed at final         */
    union {
        sha256_ctx s256;
        sha512_ctx s512;           /* SHA-384 shares the SHA-512 ctx */
    } inner;                       /* inner hash: H(K0⊕ipad ∥ msg …) */
} hmac_ctx;

/*
 * Initialise an HMAC context for `hashId` with key bytes `key[0..keyLen)`.
 * Performs FIPS 198-1 key conditioning (K0 = H(K) if keyLen > block, else the
 * key zero-padded to block length), primes the inner hash with K0⊕ipad and
 * caches K0⊕opad. Returns 0 on success, -1 on a bad hashId.
 */
int  hmac_init(hmac_ctx *ctx, int hashId, const uint8_t *key, size_t keyLen);

/* Absorb `len` message bytes into the inner hash. */
void hmac_update(hmac_ctx *ctx, const uint8_t *data, size_t len);

/*
 * Finalise: out = H(K0⊕opad ∥ H(K0⊕ipad ∥ msg)). Writes exactly `ctx->digest`
 * bytes to `out`. The caller is responsible for any truncation (e.g. ACVP
 * macLen). The context is consumed (do not reuse without re-init).
 */
void hmac_final(hmac_ctx *ctx, uint8_t *out);

/*
 * One-shot convenience: out = HMAC-hashId(key, msg). Writes the full digest
 * (`digest` size) to `out`. Returns 0 on success, -1 on a bad hashId.
 */
int  hmac_oneshot(int hashId, const uint8_t *key, size_t keyLen,
                  const uint8_t *msg, size_t msgLen, uint8_t *out);

/* Digest size for a hashId, or 0 for a bad hashId (handy for callers). */
size_t hmac_digest_size(int hashId);

#endif /* WASM_CRYPTO_HMAC_H */
