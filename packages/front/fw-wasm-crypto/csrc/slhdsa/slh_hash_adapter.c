/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * slh_hash_adapter.c — freestanding FIPS-205 hash vtable for the vendored
 * OpenSSL SLH-DSA core (task 06, OpenSSL re-source).
 *
 * The vendored core (vendor/openssl-slh-dsa/**) is decoupled from the hash
 * implementation through a function-pointer vtable (SLH_HASH_FUNC, declared in
 * vendor/openssl-slh-dsa/slh_hash.h). Upstream that vtable is satisfied by
 * slh_hash.c, which is EVP/provider-bound (EVP_MD_CTX, EVP_MAC, PKCS1_MGF1) and
 * NOT vendored. This file is its freestanding replacement: it implements the six
 * vtable entries (H_MSG, PRF, PRF_MSG, F, H, T) per FIPS-205 §11 on top of the
 * already-vendored PQClean primitives:
 *   - SHAKE-256  (vendor/pqclean/common/fips202.c)  — the SHAKE parameter sets
 *   - SHA-256/512 (vendor/pqclean/common/sha2.c)     — the SHA-2 parameter sets
 * plus a freestanding HMAC-SHA-X and MGF1-SHA-X (FIPS-205 §11.2.1/§11.2.2) built
 * on those one-shot digests.
 *
 * Correspondence with FIPS-205 §11 (and the upstream slh_hash.c it replaces):
 *
 *   SHAKE (Section 11.1) — every function is SHAKE-256 over the concatenation:
 *     PRF      = SHAKE256(pk_seed || adrs || sk_seed, n)
 *     F        = SHAKE256(pk_seed || adrs || m1, n)
 *     H        = SHAKE256(pk_seed || adrs || m1 || m2, n)
 *     T        = SHAKE256(pk_seed || adrs || ml, n)
 *     PRF_MSG  = SHAKE256(sk_prf || opt_rand || msg, n)
 *     H_MSG    = SHAKE256(r || pk_seed || pk_root || msg, m)
 *     ADRS is the full 32-byte address (SLH_ADRS_SIZE).
 *
 *   SHA-2 (Section 11.2.1 cat 1, 11.2.2 cat 3&5):
 *     Let Hn = SHA-256 (cat 1) or SHA-512 (cat 3&5) for H/T/H_MSG/PRF_MSG;
 *     PRF and F always use SHA-256.
 *     PRF/F/H/T = first n bytes of Hx(pk_seed || toByte(0, b-n) || ADRSc || m)
 *                 where b = 64 for SHA-256 (PRF/F and cat1 H/T) and
 *                       b = 64 (cat1) / 128 (cat3&5) for H/T (sha2_h_and_t_bound),
 *                 and ADRSc is the 22-byte compressed address (SLH_ADRSC_SIZE).
 *     H_MSG     = MGF1-Hn(r || pk_seed || Hn(r || pk_seed || pk_root || msg), m)
 *     PRF_MSG   = first n bytes of HMAC-Hn(sk_prf, opt_rand || msg)
 *
 * These exactly mirror the vendored-but-excluded slh_hash.c (PRF/F use
 * key->md = SHA-256; H/T/H_MSG/PRF_MSG use key->md_big = SHA-256 for cat1 else
 * SHA-512; do_hash() prepends pk_seed then (b-n) zero bytes then ADRSc then m
 * and truncates to n; H_MSG runs MGF1 over r||pk_seed||digest). The dispatch on
 * SHA-256-vs-SHA-512 and the b bound are derived from params (security_category)
 * instead of prefetched EVP_MD objects — no EVP needed.
 *
 * Output bound: SLH_MAX_M = 49 (the largest H_MSG output). All concatenation
 * buffers are stack-bounded by the parameter sets. C23 (csrc/ -> c23). Zero
 * imports, no <stdbit.h>, no global ctor, no side effects at load.
 */

#include <stddef.h>
#include <stdint.h>
#include <string.h> /* compat: memcpy/memset -> __builtin_* */

#include "slh_dsa_local.h" /* SLH_DSA_HASH_CTX, SLH_DSA_PARAMS, SLH_HASH_FUNC, slh_hash.h */
#include "slh_dsa_key.h"   /* struct slh_dsa_key_st (key->params) */

#include "fips202.h" /* SHAKE-256 (vendor/pqclean/common) */
#include "sha2.h"    /* SHA-256/512 (vendor/pqclean/common) */

#define SHA256_DIGEST_LEN 32
#define SHA512_DIGEST_LEN 64
#define SHA256_BLOCK_LEN 64
#define SHA512_BLOCK_LEN 128
#define MAX_DIGEST_LEN 64
#define MAX_BLOCK_LEN 128

/* ── SHA-2 helpers ──────────────────────────────────────────────────────────── */

static int sha2_is_big(const SLH_DSA_PARAMS *p) /* 1 => SHA-512, 0 => SHA-256 */
{
    return p->security_category != 1;
}

/* One-shot SHA-256 or SHA-512 over a single buffer. */
static void sha2_hash(int big, const uint8_t *in, size_t inlen, uint8_t *out)
{
    if (big)
        sha512(out, in, inlen);
    else
        sha256(out, in, inlen);
}

/* Stream four byte-runs through SHA-256 or SHA-512 and write the digest. The
 * prefix (pk_seed || 0^(b-n) || ADRSc) is small; |m| may be large (WOTS pk or
 * FORS roots for T), so everything is fed block-by-block via the incremental
 * API rather than a single oversized stack buffer. */
static void sha2_stream_digest(int big,
                               const uint8_t *prefix, size_t prefix_len,
                               const uint8_t *m, size_t m_len,
                               uint8_t *digest)
{
    if (big) {
        sha512ctx hctx;
        uint8_t stage[SHA512_BLOCK_LEN];
        size_t fill = 0, bi;
        sha512_inc_init(&hctx);
        for (bi = 0; bi < prefix_len; bi++) {
            stage[fill++] = prefix[bi];
            if (fill == SHA512_BLOCK_LEN) { sha512_inc_blocks(&hctx, stage, 1); fill = 0; }
        }
        for (bi = 0; bi < m_len; bi++) {
            stage[fill++] = m[bi];
            if (fill == SHA512_BLOCK_LEN) { sha512_inc_blocks(&hctx, stage, 1); fill = 0; }
        }
        sha512_inc_finalize(digest, &hctx, stage, fill);
    } else {
        sha256ctx hctx;
        uint8_t stage[SHA256_BLOCK_LEN];
        size_t fill = 0, bi;
        sha256_inc_init(&hctx);
        for (bi = 0; bi < prefix_len; bi++) {
            stage[fill++] = prefix[bi];
            if (fill == SHA256_BLOCK_LEN) { sha256_inc_blocks(&hctx, stage, 1); fill = 0; }
        }
        for (bi = 0; bi < m_len; bi++) {
            stage[fill++] = m[bi];
            if (fill == SHA256_BLOCK_LEN) { sha256_inc_blocks(&hctx, stage, 1); fill = 0; }
        }
        sha256_inc_finalize(digest, &hctx, stage, fill);
    }
}

/* do_hash (FIPS-205 §11.2): out[0..n) = trunc_n( Hx(pk_seed || 0^(b-n) || ADRSc || m) ).
 * |big| selects SHA-512 (1) or SHA-256 (0); |b| is the zero-padding bound. The
 * small fixed prefix (pk_seed || zeros || ADRSc) fits a stack buffer; |m| is
 * streamed so the function is safe for the large T inputs (WOTS pk / FORS roots). */
static int sha2_do_hash(int big, uint32_t n, uint32_t b,
                        const uint8_t *pk_seed, const uint8_t *adrsc,
                        const uint8_t *m, size_t m_len, uint8_t *out)
{
    uint8_t prefix[MAX_BLOCK_LEN + SLH_ADRSC_SIZE]; /* pk_seed(n) || zeros(b-n) || ADRSc(22) */
    uint8_t digest[MAX_DIGEST_LEN];
    size_t off = 0;

    if (b > MAX_BLOCK_LEN || n > b)
        return 0;
    memcpy(prefix + off, pk_seed, n);
    off += n;
    memset(prefix + off, 0, (size_t)b - n);
    off += (size_t)b - n;
    memcpy(prefix + off, adrsc, SLH_ADRSC_SIZE);
    off += SLH_ADRSC_SIZE;

    sha2_stream_digest(big, prefix, off, m, m_len, digest);
    memcpy(out, digest, n);
    return 1;
}

/* HMAC-Hx(key=sk_prf[n], data = opt_rand[n] || msg), truncated to n bytes.
 * FIPS-205 §11.2: PRF_msg = HMAC(SK.prf, opt_rand || M'). The SLH-DSA key length
 * n (16/24/32) is always shorter than the HMAC block, so K0 = key || zeros. */
static int sha2_hmac_trunc(int big, uint32_t n,
                           const uint8_t *sk_prf,
                           const uint8_t *opt_rand,
                           const uint8_t *msg, size_t msg_len,
                           uint8_t *out)
{
    size_t blk = big ? SHA512_BLOCK_LEN : SHA256_BLOCK_LEN;
    size_t dig = big ? SHA512_DIGEST_LEN : SHA256_DIGEST_LEN;
    uint8_t k0[MAX_BLOCK_LEN];
    uint8_t ipad_prefix[MAX_BLOCK_LEN + SLH_MAX_N]; /* ipad(blk) || opt_rand(n) */
    uint8_t opad[MAX_BLOCK_LEN];
    uint8_t inner[MAX_DIGEST_LEN];
    size_t i;

    if (n > blk)
        return 0;
    memcpy(k0, sk_prf, n);
    memset(k0 + n, 0, blk - n);
    for (i = 0; i < blk; i++) {
        ipad_prefix[i] = (uint8_t)(k0[i] ^ 0x36);
        opad[i] = (uint8_t)(k0[i] ^ 0x5c);
    }
    /* prefix = ipad || opt_rand; stream the (possibly large) msg after it. */
    memcpy(ipad_prefix + blk, opt_rand, n);
    sha2_stream_digest(big, ipad_prefix, blk + n, msg, msg_len, inner);

    /* outer = Hx(opad || inner) — both small, single stack buffer. */
    {
        uint8_t obuf[MAX_BLOCK_LEN + MAX_DIGEST_LEN];
        uint8_t odig[MAX_DIGEST_LEN];
        memcpy(obuf, opad, blk);
        memcpy(obuf + blk, inner, dig);
        sha2_hash(big, obuf, blk + dig, odig);
        memcpy(out, odig, n);
    }
    return 1;
}

/* MGF1-Hx(seed, masklen) writing |masklen| bytes to |out|. (FIPS-205 §11.2.1) */
static int sha2_mgf1(int big, const uint8_t *seed, size_t seed_len,
                     uint8_t *out, size_t masklen)
{
    size_t dig = big ? SHA512_DIGEST_LEN : SHA256_DIGEST_LEN;
    uint8_t buf[2 * SLH_MAX_N + MAX_DIGEST_LEN + 4];
    uint8_t digest[MAX_DIGEST_LEN];
    uint32_t counter = 0;
    size_t produced = 0;

    if (seed_len + 4 > sizeof(buf))
        return 0;
    memcpy(buf, seed, seed_len);
    while (produced < masklen) {
        size_t take;
        buf[seed_len + 0] = (uint8_t)((counter >> 24) & 0xff);
        buf[seed_len + 1] = (uint8_t)((counter >> 16) & 0xff);
        buf[seed_len + 2] = (uint8_t)((counter >> 8) & 0xff);
        buf[seed_len + 3] = (uint8_t)(counter & 0xff);
        sha2_hash(big, buf, seed_len + 4, digest);
        take = masklen - produced;
        if (take > dig)
            take = dig;
        memcpy(out + produced, digest, take);
        produced += take;
        counter++;
    }
    return 1;
}

/* ── SHAKE helpers ──────────────────────────────────────────────────────────── */

/* SHAKE-256 over up to four concatenated inputs, |out_len| output bytes. The
 * message (in4) may be large, so stream via the incremental API. */
static int shake256_cat(const uint8_t *in1, size_t l1,
                        const uint8_t *in2, size_t l2,
                        const uint8_t *in3, size_t l3,
                        const uint8_t *in4, size_t l4,
                        uint8_t *out, size_t out_len)
{
    shake256incctx ctx;
    shake256_inc_init(&ctx);
    if (l1) shake256_inc_absorb(&ctx, in1, l1);
    if (l2) shake256_inc_absorb(&ctx, in2, l2);
    if (l3) shake256_inc_absorb(&ctx, in3, l3);
    if (l4) shake256_inc_absorb(&ctx, in4, l4);
    shake256_inc_finalize(&ctx);
    shake256_inc_squeeze(out, out_len, &ctx);
    shake256_inc_ctx_release(&ctx);
    return 1;
}

/* ── SHAKE vtable (FIPS-205 §11.1) ──────────────────────────────────────────── */

static int slh_hmsg_shake(SLH_DSA_HASH_CTX *ctx, const uint8_t *r,
                          const uint8_t *pk_seed, const uint8_t *pk_root,
                          const uint8_t *msg, size_t msg_len,
                          uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    (void)out_len;
    return shake256_cat(r, p->n, pk_seed, p->n, pk_root, p->n, msg, msg_len,
                        out, p->m);
}

static int slh_prf_shake(SLH_DSA_HASH_CTX *ctx, const uint8_t *pk_seed,
                         const uint8_t *sk_seed, const uint8_t *adrs,
                         uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    (void)out_len;
    return shake256_cat(pk_seed, p->n, adrs, SLH_ADRS_SIZE, sk_seed, p->n,
                        NULL, 0, out, p->n);
}

static int slh_prf_msg_shake(SLH_DSA_HASH_CTX *ctx, const uint8_t *sk_prf,
                             const uint8_t *opt_rand, const uint8_t *msg,
                             size_t msg_len, WPACKET *pkt)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    uint8_t out[SLH_MAX_N];
    return shake256_cat(sk_prf, p->n, opt_rand, p->n, msg, msg_len, NULL, 0,
                        out, p->n)
        && WPACKET_memcpy(pkt, out, p->n);
}

static int slh_f_shake(SLH_DSA_HASH_CTX *ctx, const uint8_t *pk_seed,
                       const uint8_t *adrs, const uint8_t *m1, size_t m1_len,
                       uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    (void)out_len;
    return shake256_cat(pk_seed, p->n, adrs, SLH_ADRS_SIZE, m1, m1_len, NULL, 0,
                        out, p->n);
}

static int slh_h_shake(SLH_DSA_HASH_CTX *ctx, const uint8_t *pk_seed,
                       const uint8_t *adrs, const uint8_t *m1, const uint8_t *m2,
                       uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    (void)out_len;
    return shake256_cat(pk_seed, p->n, adrs, SLH_ADRS_SIZE, m1, p->n, m2, p->n,
                        out, p->n);
}

static int slh_t_shake(SLH_DSA_HASH_CTX *ctx, const uint8_t *pk_seed,
                       const uint8_t *adrs, const uint8_t *ml, size_t ml_len,
                       uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    (void)out_len;
    return shake256_cat(pk_seed, p->n, adrs, SLH_ADRS_SIZE, ml, ml_len, NULL, 0,
                        out, p->n);
}

/* ── SHA-2 vtable (FIPS-205 §11.2) ──────────────────────────────────────────── */

static int slh_hmsg_sha2(SLH_DSA_HASH_CTX *ctx, const uint8_t *r,
                         const uint8_t *pk_seed, const uint8_t *pk_root,
                         const uint8_t *msg, size_t msg_len,
                         uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    int big = sha2_is_big(p);
    uint32_t n = p->n;
    size_t dig = big ? SHA512_DIGEST_LEN : SHA256_DIGEST_LEN;
    uint8_t seed[2 * SLH_MAX_N + MAX_DIGEST_LEN];
    size_t seed_len = 2 * n + dig;
    (void)out_len;

    /* seed = r || pk_seed || Hx(r || pk_seed || pk_root || msg) */
    memcpy(seed, r, n);
    memcpy(seed + n, pk_seed, n);
    {
        uint8_t prefix[3 * SLH_MAX_N]; /* r || pk_seed || pk_root */
        memcpy(prefix, r, n);
        memcpy(prefix + n, pk_seed, n);
        memcpy(prefix + 2 * n, pk_root, n);
        sha2_stream_digest(big, prefix, 3 * n, msg, msg_len, seed + 2 * n);
    }
    return sha2_mgf1(big, seed, seed_len, out, p->m);
}

static int slh_prf_sha2(SLH_DSA_HASH_CTX *ctx, const uint8_t *pk_seed,
                        const uint8_t *sk_seed, const uint8_t *adrs,
                        uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    (void)out_len;
    /* PRF always uses SHA-256 with bound 64 (OSSL_SLH_DSA_SHA2_NUM_ZEROS_H_AND_T_BOUND1). */
    return sha2_do_hash(0, p->n, 64, pk_seed, adrs, sk_seed, p->n, out);
}

static int slh_prf_msg_sha2(SLH_DSA_HASH_CTX *ctx, const uint8_t *sk_prf,
                            const uint8_t *opt_rand, const uint8_t *msg,
                            size_t msg_len, WPACKET *pkt)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    uint8_t out[SLH_MAX_N];
    /* PRF_MSG = trunc_n( HMAC-Hx(SK.prf, opt_rand || M') ); Hx = SHA-256 (cat1)
     * or SHA-512 (cat3&5). */
    return sha2_hmac_trunc(sha2_is_big(p), p->n, sk_prf, opt_rand, msg, msg_len, out)
        && WPACKET_memcpy(pkt, out, p->n);
}

static int slh_f_sha2(SLH_DSA_HASH_CTX *ctx, const uint8_t *pk_seed,
                      const uint8_t *adrs, const uint8_t *m1, size_t m1_len,
                      uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    (void)out_len;
    /* F always uses SHA-256 with bound 64. */
    return sha2_do_hash(0, p->n, 64, pk_seed, adrs, m1, m1_len, out);
}

static int slh_h_sha2(SLH_DSA_HASH_CTX *ctx, const uint8_t *pk_seed,
                      const uint8_t *adrs, const uint8_t *m1, const uint8_t *m2,
                      uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    uint8_t m[2 * SLH_MAX_N];
    (void)out_len;
    memcpy(m, m1, p->n);
    memcpy(m + p->n, m2, p->n);
    /* H uses md_big (SHA-256 cat1, SHA-512 cat3&5) with bound sha2_h_and_t_bound. */
    return sha2_do_hash(sha2_is_big(p), p->n, (uint32_t)p->sha2_h_and_t_bound,
                        pk_seed, adrs, m, 2 * p->n, out);
}

static int slh_t_sha2(SLH_DSA_HASH_CTX *ctx, const uint8_t *pk_seed,
                      const uint8_t *adrs, const uint8_t *ml, size_t ml_len,
                      uint8_t *out, size_t out_len)
{
    const SLH_DSA_PARAMS *p = ctx->key->params;
    (void)out_len;
    /* T uses md_big with bound sha2_h_and_t_bound; ml may be large (WOTS pk /
     * FORS roots), so route through sha2_do_hash which streams nothing but uses a
     * single buffer — bounded by the parameter sets (T input <= len*n or k*a*n).
     * For the large-input case (T over the full WOTS pk = (2n+3)*n bytes, or the
     * FORS roots = k*n bytes) sha2_do_hash's stack buffer must be large enough. */
    return sha2_do_hash(sha2_is_big(p), p->n, (uint32_t)p->sha2_h_and_t_bound,
                        pk_seed, adrs, ml, ml_len, out);
}

/* ── Vtable export ──────────────────────────────────────────────────────────── */

const SLH_HASH_FUNC *ossl_slh_get_hash_fn(int is_shake)
{
    static const SLH_HASH_FUNC methods[] = {
        { /* is_shake index 0 == SHAKE (matches upstream methods[0]) */
            slh_hmsg_shake, slh_prf_shake, slh_prf_msg_shake,
            slh_f_shake, slh_h_shake, slh_t_shake
        },
        { /* index 1 == SHA-2 */
            slh_hmsg_sha2, slh_prf_sha2, slh_prf_msg_sha2,
            slh_f_sha2, slh_h_sha2, slh_t_sha2
        }
    };
    return &methods[is_shake ? 0 : 1];
}
