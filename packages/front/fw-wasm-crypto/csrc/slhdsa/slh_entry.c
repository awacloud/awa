/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * slh_entry.c — freestanding key/context + driver layer for the vendored
 * OpenSSL SLH-DSA core (task 06, OpenSSL re-source).
 *
 * The vendored core (vendor/openssl-slh-dsa/**) signs/verifies through
 * ossl_slh_dsa_sign / ossl_slh_dsa_verify, which take a SLH_DSA_HASH_CTX wrapping
 * a SLH_DSA_KEY. Upstream those structs are built by slh_dsa_key.c /
 * slh_dsa_hash_ctx.c, which are EVP/provider-bound and therefore NOT vendored.
 * This file is the freestanding replacement: it constructs the (vendored) key +
 * ctx structs directly, wires the parameter set + the freestanding adrs/hash
 * vtables, and exposes three core entry points the shim (shims/slhdsa.c) calls:
 *
 *   int slhdsa_core_keygen(int psId, uint8_t *pk, uint8_t *sk);
 *   int slhdsa_core_sign  (int psId, const uint8_t *sk,
 *                          const uint8_t *mprime, size_t mprime_len,
 *                          uint8_t *sig, size_t *sig_len);
 *   int slhdsa_core_verify(int psId, const uint8_t *pk,
 *                          const uint8_t *sig, size_t sig_len,
 *                          const uint8_t *mprime, size_t mprime_len);
 *
 * `mprime` is the FIPS-205 §10.2.1 external/pure-encoded message M' built by the
 * shim (M' = 0x00 || |ctx| || ctx || M); the core is therefore invoked with
 * encode=0 (no second encoding), exactly mirroring the prior attempt's "pass M'
 * to the raw signature" contract.
 *
 * Entropy / the seam (csrc/rng/rng.{h,c}, task 01)
 * --------------------------------------------------------------------------------
 * Unlike the round-3 PQClean path, the OpenSSL core does NOT call randombytes():
 *   - ossl_slh_dsa_generate_key takes the 3n key entropy as an explicit |entropy|
 *     argument (skSeed||skPrf||pkSeed);
 *   - ossl_slh_dsa_sign takes the per-signature randomizer as an explicit
 *     |add_rand| argument (FIPS-205 addrnd; n bytes).
 * To keep the frozen rng_stage/rng_reset host ABI and the determinism contract,
 * this layer DRAINS the host-staged seam itself: it reads the staged bytes via
 * the seam's randombytes() (which drains the staged buffer in order and raises a
 * sticky underflow flag on a short stage). The host stages exactly:
 *   - keygen: 3n bytes = skSeed||skPrf||pkSeed (the ACVP keyGen vector);
 *   - sign:   n bytes = addrnd (PK.seed for deterministic groups, else the
 *             vector's additionalRandomness).
 * verify draws nothing. rng_underflowed() guards a KAT against an under-staged
 * vector so we never silently succeed on zeros.
 *
 * Key layout (FIPS-205): sk = SK.seed || SK.prf || PK.seed || PK.root (4n);
 * pk = PK.seed || PK.root (2n). The vendored key struct stores all of priv[4n]
 * inline and points pub at priv+2n.
 *
 * C23 (csrc/ -> c23 via cStdFor). Zero imports (entropy via the BSS seam), no
 * <stdbit.h>, no global ctor, no side effects at load.
 */

#include <stddef.h>
#include <stdint.h>
#include <string.h> /* compat: memcpy/memset -> __builtin_* */

#include "slh_dsa_local.h" /* SLH_DSA_KEY/HASH_CTX, params, adrs/hash vtables */
#include "slh_dsa_key.h"   /* struct slh_dsa_key_st, SLH_DSA_SK_SEED/... macros */

#include "csrc/rng/rng.h"  /* randombytes (seam drain) + rng_underflowed */

#define WC_SLH_NSETS 12

/* psId 0..11 -> the FIPS-205 algorithm name (frozen BATCH_11 order:
 * SHA2/SHAKE × 128/192/256 × s/f). Maps onto ossl_slh_dsa_params_get(). */
static const char *const WC_PSID_ALG[WC_SLH_NSETS] = {
    "SLH-DSA-SHA2-128s",  "SLH-DSA-SHA2-128f",
    "SLH-DSA-SHA2-192s",  "SLH-DSA-SHA2-192f",
    "SLH-DSA-SHA2-256s",  "SLH-DSA-SHA2-256f",
    "SLH-DSA-SHAKE-128s", "SLH-DSA-SHAKE-128f",
    "SLH-DSA-SHAKE-192s", "SLH-DSA-SHAKE-192f",
    "SLH-DSA-SHAKE-256s", "SLH-DSA-SHAKE-256f",
};

/* Build a freestanding SLH_DSA_KEY for |psId| with the params + vtables wired.
 * The EVP/lib-ctx fields are zeroed (unused: hashing is done by the freestanding
 * adapter which reads only key->params). Returns 0 on bad psId. */
static int wc_key_init(SLH_DSA_KEY *key, int psId)
{
    const SLH_DSA_PARAMS *params;

    if (psId < 0 || psId >= WC_SLH_NSETS)
        return 0;
    memset(key, 0, sizeof(*key));
    params = ossl_slh_dsa_params_get(WC_PSID_ALG[psId]);
    if (params == NULL)
        return 0;
    key->params = params;
    key->adrs_func = ossl_slh_get_adrs_fn(params->is_shake == 0); /* compressed for SHA-2 */
    key->hash_func = ossl_slh_get_hash_fn(params->is_shake);
    key->pub = NULL;
    key->has_priv = 0;
    return 1;
}

/* Compute the public root from SK.seed + PK.seed into |out_root| (n bytes).
 * Mirrors slh_dsa_compute_pk_root() (FIPS-205 §9.1 / §10.1). */
static int wc_compute_root(SLH_DSA_HASH_CTX *hctx, uint8_t *out_root)
{
    const SLH_DSA_KEY *key = hctx->key;
    const SLH_DSA_PARAMS *params = key->params;
    const SLH_ADRS_FUNC *adrsf = key->adrs_func;
    uint8_t adrs[SLH_ADRS_SIZE_MAX];

    adrsf->zero(adrs);
    adrsf->set_layer_address(adrs, params->d - 1);
    return ossl_slh_xmss_node(hctx, SLH_DSA_SK_SEED(key), 0, params->hm,
                              SLH_DSA_PK_SEED(key), adrs, out_root, params->n);
}

/* ── core entry points (called by shims/slhdsa.c) ───────────────────────────── */

int slhdsa_core_keygen(int psId, uint8_t *pk, uint8_t *sk)
{
    SLH_DSA_KEY key;
    SLH_DSA_HASH_CTX hctx;
    uint32_t n;
    uint8_t entropy[3 * SLH_DSA_MAX_N];

    if (!wc_key_init(&key, psId))
        return -1;
    n = key.params->n;

    /* Drain 3n staged bytes = SK.seed || SK.prf || PK.seed. */
    randombytes(entropy, (size_t)(3 * n));
    if (rng_underflowed())
        return -2;

    /* priv = SK.seed || SK.prf || PK.seed || (PK.root computed below). */
    memcpy(key.priv, entropy, (size_t)(3 * n));
    key.pub = SLH_DSA_PUB(&key);   /* points at priv + 2n */
    key.has_priv = 1;

    hctx.key = &key;
    hctx.md_ctx = NULL;
    hctx.md_big_ctx = NULL;
    hctx.hmac_ctx = NULL;
    hctx.hmac_digest_used = 0;

    if (!wc_compute_root(&hctx, SLH_DSA_PK_ROOT(&key)))
        return -3;

    /* pk = PK.seed || PK.root (2n); sk = SK.seed||SK.prf||PK.seed||PK.root (4n). */
    memcpy(pk, SLH_DSA_PK_SEED(&key), (size_t)(2 * n));
    memcpy(sk, key.priv, (size_t)(4 * n));
    return 0;
}

int slhdsa_core_sign(int psId, const uint8_t *sk,
                     const uint8_t *mprime, size_t mprime_len,
                     uint8_t *sig, size_t *sig_len)
{
    SLH_DSA_KEY key;
    SLH_DSA_HASH_CTX hctx;
    uint32_t n;
    uint8_t add_rand[SLH_DSA_MAX_N];
    size_t siglen = 0;
    int rc;

    if (!wc_key_init(&key, psId))
        return -1;
    n = key.params->n;

    /* sk = SK.seed||SK.prf||PK.seed||PK.root (4n). */
    memcpy(key.priv, sk, (size_t)(4 * n));
    key.pub = SLH_DSA_PUB(&key);
    key.has_priv = 1;

    hctx.key = &key;
    hctx.md_ctx = NULL;
    hctx.md_big_ctx = NULL;
    hctx.hmac_ctx = NULL;
    hctx.hmac_digest_used = 0;

    /* Drain n staged bytes = addrnd (PK.seed for deterministic, else the
     * vector's additionalRandomness — the host stages the right n bytes). */
    randombytes(add_rand, (size_t)n);
    if (rng_underflowed())
        return -2;

    /* encode=0: |mprime| is already the FIPS-205 §10.2.1 M' (built by the shim).
     * sigsize = params->sig_len (the core checks it). */
    rc = ossl_slh_dsa_sign(&hctx, mprime, mprime_len, NULL, 0, add_rand, 0,
                           sig, &siglen, key.params->sig_len);
    if (rc != 1)
        return -4;
    if (sig_len != NULL)
        *sig_len = siglen;
    return 0;
}

int slhdsa_core_verify(int psId, const uint8_t *pk,
                       const uint8_t *sig, size_t sig_len,
                       const uint8_t *mprime, size_t mprime_len)
{
    SLH_DSA_KEY key;
    SLH_DSA_HASH_CTX hctx;
    uint32_t n;

    if (!wc_key_init(&key, psId))
        return -1;
    n = key.params->n;

    /* pk = PK.seed || PK.root (2n) -> store at priv + 2n; pub points there. */
    memcpy(SLH_DSA_PK_SEED(&key), pk, (size_t)(2 * n));
    key.pub = SLH_DSA_PUB(&key);
    key.has_priv = 0;

    hctx.key = &key;
    hctx.md_ctx = NULL;
    hctx.md_big_ctx = NULL;
    hctx.hmac_ctx = NULL;
    hctx.hmac_digest_used = 0;

    /* encode=0: |mprime| is already M'. Returns 1 iff the signature is valid. */
    return ossl_slh_dsa_verify(&hctx, mprime, mprime_len, NULL, 0, 0,
                               sig, sig_len) == 1 ? 0 : 1;
}
