/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * pbkdf2.c — RFC 8018 §5.2 PBKDF2 over the OWN HMAC core (C23, freestanding
 * wasm32).
 *
 * PBKDF2(PRF, Password, Salt, c, dkLen):
 *   DK = T_1 ∥ T_2 ∥ … ∥ T_l, first dkLen bytes
 *
 *   l = ceil(dkLen / hLen)
 *   T_i = F(Password, Salt, c, i)
 *   F(P, S, c, i) = U_1 ⊕ U_2 ⊕ … ⊕ U_c
 *     U_1 = PRF(P, S ∥ INT_BE32(i))
 *     U_j = PRF(P, U_{j−1}),  j = 2..c
 *
 * PRF = HMAC-hashId. INT_BE32(i) is the 4-byte big-endian encoding of i,
 * i starting at 1.
 *
 * The own HMAC core (csrc/hmac/) is consumed READ-ONLY: HMAC and SHA-2 are
 * never re-implemented here. All per-block derivation goes through the
 * streaming hmac_ctx (init / update / final) to minimise allocations on the
 * freestanding stack.
 *
 * Constant-time: control flow is on the PUBLIC hashId (dispatch) and
 * public-length arithmetic (block index, XOR loops, truncation). No
 * secret-dependent branch or memory index over the password, salt, or derived
 * bytes. CT posture inherits HMAC's.
 */

#include "csrc/pbkdf2/pbkdf2.h"
#include "csrc/hmac/hmac.h"

#define PBKDF2_EBADPARAM (-1)

/* ── Freestanding helpers (no libc) ──────────────────────────────────────── */

static void pbkdf2_memset(uint8_t *p, uint8_t v, size_t n) {
    for (size_t i = 0; i < n; i++) p[i] = v;
}

static void pbkdf2_memcpy(uint8_t *dst, const uint8_t *src, size_t n) {
    for (size_t i = 0; i < n; i++) dst[i] = src[i];
}

/* XOR `n` bytes of `src` into `dst`. */
static void pbkdf2_xor(uint8_t *dst, const uint8_t *src, size_t n) {
    for (size_t i = 0; i < n; i++) dst[i] ^= src[i];
}

/* Encode a 32-bit unsigned integer as 4 big-endian bytes into `out`. */
static void be32(uint8_t out[4], uint32_t v) {
    out[0] = (uint8_t)(v >> 24);
    out[1] = (uint8_t)(v >> 16);
    out[2] = (uint8_t)(v >>  8);
    out[3] = (uint8_t)(v      );
}

/* ── PBKDF2 F-function ────────────────────────────────────────────────────── */

/*
 * Compute T_block = F(P, S, c, blockIdx) and write it to `t_out` (hLen bytes).
 *
 * U_1 = HMAC(pwd, salt ∥ INT_BE32(blockIdx))
 * U_j = HMAC(pwd, U_{j-1}),  j = 2..c
 * T   = U_1 ⊕ U_2 ⊕ … ⊕ U_c
 */
static void pbkdf2_block(int hashId,
                          const uint8_t *pwd,  size_t pwdLen,
                          const uint8_t *salt, size_t saltLen,
                          int c, uint32_t blockIdx,
                          uint8_t *t_out, size_t hLen) {
    uint8_t u_prev[HMAC_MAX_DIGEST]; /* current U value, then previous */

    /* U_1 = HMAC(pwd, salt ∥ INT_BE32(blockIdx)) */
    {
        hmac_ctx ctx;
        hmac_init(&ctx, hashId, pwd, pwdLen);
        if (saltLen > 0) hmac_update(&ctx, salt, saltLen);
        uint8_t blk[4];
        be32(blk, blockIdx);
        hmac_update(&ctx, blk, 4);
        hmac_final(&ctx, u_prev);
    }

    /* T = U_1 */
    pbkdf2_memcpy(t_out, u_prev, hLen);

    /* U_j = HMAC(pwd, U_{j-1}), XOR into T */
    uint8_t u_cur[HMAC_MAX_DIGEST];
    for (int j = 2; j <= c; j++) {
        hmac_ctx ctx;
        hmac_init(&ctx, hashId, pwd, pwdLen);
        hmac_update(&ctx, u_prev, hLen);
        hmac_final(&ctx, u_cur);
        pbkdf2_xor(t_out, u_cur, hLen);
        pbkdf2_memcpy(u_prev, u_cur, hLen);
    }

    /* Zeroize working buffers (best-effort on the stack). */
    pbkdf2_memset(u_prev, 0, hLen);
    pbkdf2_memset(u_cur,  0, hLen);
}

/* ── Public API ───────────────────────────────────────────────────────────── */

int pbkdf2_derive(int hashId,
                  const uint8_t *pwd,  size_t pwdLen,
                  const uint8_t *salt, size_t saltLen,
                  int iters,
                  uint8_t *dk, size_t dkLen) {
    if (iters <= 0 || dkLen == 0) return PBKDF2_EBADPARAM;

    const size_t hLen = hmac_digest_size(hashId);
    if (hLen == 0) return PBKDF2_EBADPARAM;

    /*
     * l = ceil(dkLen / hLen)   — number of full blocks to derive.
     * We iterate i = 1..l, filling dk[] block by block, truncating the last.
     */
    const size_t l = (dkLen + hLen - 1) / hLen;

    uint8_t t_block[HMAC_MAX_DIGEST]; /* T_i scratch */

    size_t written = 0;
    for (size_t i = 1; i <= l; i++) {
        pbkdf2_block(hashId, pwd, pwdLen, salt, saltLen,
                     iters, (uint32_t)i, t_block, hLen);

        size_t copy = dkLen - written;
        if (copy > hLen) copy = hLen;
        pbkdf2_memcpy(dk + written, t_block, copy);
        written += copy;
    }

    pbkdf2_memset(t_block, 0, sizeof(t_block));

    static_assert(HMAC_MAX_DIGEST >= 64, "HMAC_MAX_DIGEST must fit SHA-512");
    return 0;
}
