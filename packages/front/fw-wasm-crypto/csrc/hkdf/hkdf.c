/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * hkdf.c — RFC 5869 HKDF extract/expand over the OWN HMAC core (C23,
 * freestanding wasm32).
 *
 * HKDF-Extract(salt, IKM) -> PRK:
 *   PRK = HMAC-Hash(salt, IKM)                          [RFC 5869 §2.2]
 *   If salt is absent, use a string of HashLen zero bytes.
 *
 * HKDF-Expand(PRK, info, L) -> OKM:
 *   N   = ceil(L / HashLen)
 *   T   = T(1) ∥ T(2) ∥ … ∥ T(N)
 *   OKM = first L octets of T
 *   where:
 *     T(0) = ""  (empty)
 *     T(i) = HMAC-Hash(PRK, T(i-1) ∥ info ∥ i)        [RFC 5869 §2.3]
 *   Constraint: L <= 255 * HashLen.
 *
 * The own HMAC core (csrc/hmac/) is consumed READ-ONLY: no HMAC or SHA-2
 * primitive is re-implemented here. Pure HMAC calls over the streaming ctx.
 *
 * Constant-time: the only control flow is the dispatch on the PUBLIC hashId
 * and public-length arithmetic (counter loop). No secret-dependent branch or
 * memory index over key/IKM/PRK bytes. Inherits HMAC's CT posture.
 */

#include "csrc/hkdf/hkdf.h"
#include "csrc/hmac/hmac.h"

#define HKDF_EBADPARAM (-1)

/* ── Small freestanding helpers (no libc) ─────────────────────────────────── */

static void hkdf_memset(uint8_t *p, uint8_t v, size_t n) {
    for (size_t i = 0; i < n; i++) p[i] = v;
}

static void hkdf_memcpy(uint8_t *dst, const uint8_t *src, size_t n) {
    for (size_t i = 0; i < n; i++) dst[i] = src[i];
}

/* ── HKDF Extract ─────────────────────────────────────────────────────────── */

int hkdf_extract(int hashId,
                 const uint8_t *salt, size_t saltLen,
                 const uint8_t *ikm,  size_t ikmLen,
                 uint8_t *prk) {
    const size_t hashLen = hmac_digest_size(hashId);
    if (hashLen == 0) return HKDF_EBADPARAM;

    /* RFC 5869 §2.2: if salt not provided, use HashLen zero octets. */
    if (saltLen == 0) {
        /* Use a zero-filled salt of hashLen bytes on the stack. */
        uint8_t zero_salt[HMAC_MAX_DIGEST]; /* max 64 bytes */
        hkdf_memset(zero_salt, 0, hashLen);
        return hmac_oneshot(hashId, zero_salt, hashLen, ikm, ikmLen, prk);
    }

    return hmac_oneshot(hashId, salt, saltLen, ikm, ikmLen, prk);
}

/* ── HKDF Expand ──────────────────────────────────────────────────────────── */

int hkdf_expand(int hashId,
                const uint8_t *prk,
                const uint8_t *info, size_t infoLen,
                uint8_t *okm,  size_t outLen) {
    const size_t hashLen = hmac_digest_size(hashId);
    if (hashLen == 0) return HKDF_EBADPARAM;
    /* RFC 5869 §2.3: L must be <= 255 * HashLen; L == 0 not useful. */
    if (outLen == 0 || outLen > 255u * hashLen) return HKDF_EBADPARAM;

    /*
     * T(i) = HMAC(PRK, T(i-1) ∥ info ∥ i), i = 1..N.
     * T(0) = "" (empty, so for T(1) we skip the T(i-1) part).
     *
     * We accumulate T(i) in `t_prev` (hashLen bytes), copy the prefix of each
     * block into `okm`, and stop once we have emitted `outLen` bytes.
     */
    uint8_t t_prev[HMAC_MAX_DIGEST]; /* T(i-1), starts as T(0)="" */
    hkdf_memset(t_prev, 0, hashLen); /* zero-init (T(0) = "") */

    size_t written = 0;
    uint8_t counter = 0;

    for (size_t i = 1; written < outLen; i++) {
        counter = (uint8_t)i;

        hmac_ctx ctx;
        if (hmac_init(&ctx, hashId, prk, hashLen) != 0) return HKDF_EBADPARAM;

        /* Absorb T(i-1) — empty for i==1 */
        if (i > 1) {
            hmac_update(&ctx, t_prev, hashLen);
        }

        /* Absorb info (may be zero-length) */
        if (infoLen > 0) {
            hmac_update(&ctx, info, infoLen);
        }

        /* Absorb counter byte */
        hmac_update(&ctx, &counter, 1);

        /* Finalise into t_prev */
        hmac_final(&ctx, t_prev);

        /* Copy as many bytes as needed from T(i) */
        size_t copy = outLen - written;
        if (copy > hashLen) copy = hashLen;
        hkdf_memcpy(okm + written, t_prev, copy);
        written += copy;
    }

    static_assert(HMAC_MAX_DIGEST >= 64, "HMAC_MAX_DIGEST must fit SHA-512");
    return 0;
}
