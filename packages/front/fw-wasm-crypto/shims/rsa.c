/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * rsa.c — RSA OAEP enc/dec + PKCS#1 v1.5 sign/verify + keygen ABI adapters
 *         over the vendored BearSSL "i31" big-integer engine (constant-time).
 *
 * ACCEPTED VENDORED DEBT (wasm-crypto-hardened-impl plan, risk 2)
 * --------------------------------------------------------------
 * RSA here is INTENTIONALLY vendored on BearSSL v0.6 and is NEVER own-rolled:
 * no RSA math, no bignum, no PKCS#1/OAEP padding is reimplemented in this shim.
 * Every export marshals (ptr,len) buffers and dispatches into the vendored
 * `br_rsa_i31_*` / `br_rsa_keygen` primitives. BearSSL v0.6 is a frozen,
 * never-formally-audited upstream (bearssl.org; no GitHub mirror) — this is a
 * deliberate freeze risk recorded as accepted debt, distinct from the
 * FIPS-final PQC forks (ml_kem/ml_dsa/slh_dsa) which are owned/forked.
 *
 * SCHEME COVERAGE (BearSSL v0.6 reality)
 * --------------------------------------
 * scheme enum: 0 = PSS, 1 = PKCS#1 v1.5.
 *   - PKCS#1 v1.5 sign/verify (scheme=1): SUPPORTED — br_rsa_i31_pkcs1_sign /
 *     br_rsa_i31_pkcs1_vrfy, OID selected by hashId (256/384/512).
 *   - OAEP enc/dec: SUPPORTED — encrypt composes the vendored padding
 *     (br_rsa_oaep_pad) with the vendored public modexp (br_rsa_i31_public),
 *     exactly as BearSSL's own rsa_i31_oaep_encrypt.c does (the unit TU itself
 *     was not vendored, so the two vendored primitives are composed here — NO
 *     new crypto); decrypt is br_rsa_i31_oaep_decrypt.
 *   - keygen: SUPPORTED — br_rsa_keygen_get_default() driven by an HMAC_DRBG
 *     seeded from the staged-entropy seam (csrc/rng/rng.h), so a keyGen run is
 *     deterministic w.r.t. the staged seed.
 *   - PSS (scheme=0, CALLER-SELECTED, never a default): SUPPORTED via a
 *     HUMAN-AUTHORIZED exception to the no-own-rolling rule (option ③,
 *     2026-06-21 — a deliberate, documented exception exactly like the SLH-DSA
 *     OpenSSL re-source in BATCH_21). BearSSL v0.6 ships NO PSS engine
 *     (bearssl_rsa.h declares no br_rsa_i31_pss_*), so the EMSA-PSS PADDING
 *     layer (encode / verify / MGF1 mask / salt) is OWNED in this shim per
 *     RFC 8017 / PKCS#1 v2.1 §9.1. The RSA ARITHMETIC stays 100% vendored
 *     BearSSL: sign = EMSA-PSS-ENCODE then br_rsa_i31_private (raw modexp);
 *     verify = br_rsa_i31_public (raw modexp) then EMSA-PSS-VERIFY. Hashing is
 *     the BearSSL br_sha{256,384,512} vtables; the mask is the vendored
 *     br_mgf1_xor (MGF1 hash = the message hash). Salt length sLen = hLen on
 *     the SIGN path (the conventional default; the frozen ABI carries no
 *     saltLen parameter); the salt is drawn from the rng seam (deterministic
 *     under host staging, real entropy in production). The VERIFY path performs
 *     salt-length AUTO-RECOVERY (locate the 0x01 separator) so any ACVP saltLen
 *     verifies — sLen is NOT hardcoded on verify. The H'==H comparison is
 *     constant-time. This is the ONLY owned crypto in the shim; everything else
 *     (PKCS#1 v1.5, OAEP, bignum/modexp, keygen) remains vendored.
 *
 * KEY WIRE FORMAT (host marshals; this shim only deserialises — not crypto)
 * ------------------------------------------------------------------------
 * Big integers are unsigned big-endian (leading zeros allowed), as BearSSL
 * expects. All length prefixes are big-endian.
 *
 *   public  key  := u16 nlen | n[nlen] | u16 elen | e[elen]
 *   private key  := u32 n_bitlen
 *                 | u16 plen  | p[plen]
 *                 | u16 qlen  | q[qlen]
 *                 | u16 dplen | dp[dplen]
 *                 | u16 dqlen | dq[dqlen]
 *                 | u16 iqlen | iq[iqlen]
 *
 * rsa_keygen writes these same two layouts into pkOutPtr / skOutPtr and sets
 * *pkLenPtr / *skLenPtr to the serialised byte counts.
 *
 * Determinism / staged-entropy contract (the seam, csrc/rng/rng.{h,c})
 * --------------------------------------------------------------------
 * keygen draws randomness through the freestanding randombytes() seam: the host
 * stages the deterministic entropy into linear memory via rng_stage() BEFORE
 * the keygen call (rng_reset() to clear), exactly like the ml_kem shim. The
 * builder exports rng_stage/rng_reset directly (target `exports` list); we do
 * NOT redefine them here (that would duplicate the seam's exported symbols).
 * OAEP encrypt also draws its OAEP seed through the same seam, so an OAEP
 * round-trip KAT is reproducible. There is NO JS/WASI import (freestanding).
 *
 * C23 (built -std=c99 per the rsa target's cStd, to match the vendored BearSSL
 * sources). No <stdbit.h>. Zero imports, no global constructors, no side
 * effects at load.
 *
 * Freestanding header note: BearSSL's inner.h/bearssl_hash.h pull <string.h>
 * (memcpy/memset/memmove) and <limits.h> (ULONG_MAX). Under
 * `--target=wasm32 -ffreestanding -nostdlib` with no wasi sysroot those are
 * provided by the package-local compat shims in csrc/bearssl/compat/, placed
 * ahead on -I via the `rsa` target's cflags (not edits to vendored bytes).
 */

#include "_arena.h"
#include "bearssl.h"        /* vendored umbrella header (public RSA + rand API) */
#include "csrc/rng/rng.h"   /* staged-entropy seam: randombytes / rng_stage / rng_reset */

#define WC_EBADPARAM (-1)
#define WC_EFAIL     (-2)
#define WC_ERNGUNDERFLOW (-3)

/*
 * Internal BearSSL prototypes (declared in src/inner.h, which we deliberately
 * do NOT include from the shim — it drags the whole internal surface). These
 * are the vendored OAEP padding primitives composed below for OAEP encrypt.
 * Signatures copied verbatim from inner.h.
 */
size_t br_rsa_oaep_pad(const br_prng_class **rnd, const br_hash_class *dig,
    const void *label, size_t label_len,
    const br_rsa_public_key *pk,
    void *dst, size_t dst_max_len,
    const void *src, size_t src_len);

/*
 * Vendored MGF1 mask generator (inner.h). Computes MGF1(seed, len) with the
 * given hash and XORs it into `data`. Used by the OWNED EMSA-PSS layer below
 * (the mask itself is BearSSL's, not own-rolled).
 */
void br_mgf1_xor(void *data, size_t len,
    const br_hash_class *dig, const void *seed, size_t seed_len);

/*
 * Freestanding memcmp — under `-flto` a `__builtin_memcmp` of a variable size
 * can lower to an extern `memcmp` libcall (BATCH_21 note (c)). Provide a real
 * `memcmp` symbol so the zero-import invariant cannot be broken by an
 * LTO-introduced reference. The compat <string.h> macro-maps `memcmp` to
 * `__builtin_memcmp`; #undef it here so this definition emits the real symbol.
 */
#ifdef memcmp
#undef memcmp
#endif
__attribute__((used))
int memcmp(const void* a, const void* b, size_t n) {
    const uint8_t* pa = (const uint8_t*)a;
    const uint8_t* pb = (const uint8_t*)b;
    for (size_t i = 0; i < n; i++) {
        if (pa[i] != pb[i]) return (int)pa[i] - (int)pb[i];
    }
    return 0;
}

/* ── hashId → BearSSL hash vtable / OID / output length ─────────────────────── */

static const br_hash_class* wc_sha2_vtable(int id) {
    switch (id) {
        case 256: return &br_sha256_vtable;
        case 384: return &br_sha384_vtable;
        case 512: return &br_sha512_vtable;
        default:  return (const br_hash_class*)0;
    }
}

static size_t wc_sha2_outlen(int id) {
    switch (id) {
        case 256: return 32;
        case 384: return 48;
        case 512: return 64;
        default:  return 0;
    }
}

/* PKCS#1 v1.5 DigestInfo OID prefix (BearSSL "length byte + OID bytes" form). */
static const unsigned char* wc_sha2_oid(int id) {
    switch (id) {
        case 256: return BR_HASH_OID_SHA256;
        case 384: return BR_HASH_OID_SHA384;
        case 512: return BR_HASH_OID_SHA512;
        default:  return (const unsigned char*)0;
    }
}

/* ── Little big-endian length-prefix readers over a (ptr,len) buffer ─────────── */

typedef struct {
    const uint8_t* p;
    int            len;
    int            off;
    int            bad;
} wc_rd;

static uint32_t wc_rd_u16(wc_rd* r) {
    if (r->bad || r->off + 2 > r->len) { r->bad = 1; return 0; }
    uint32_t v = ((uint32_t)r->p[r->off] << 8) | (uint32_t)r->p[r->off + 1];
    r->off += 2;
    return v;
}

static uint32_t wc_rd_u32(wc_rd* r) {
    if (r->bad || r->off + 4 > r->len) { r->bad = 1; return 0; }
    uint32_t v = ((uint32_t)r->p[r->off] << 24) | ((uint32_t)r->p[r->off + 1] << 16)
               | ((uint32_t)r->p[r->off + 2] << 8) | (uint32_t)r->p[r->off + 3];
    r->off += 4;
    return v;
}

/* Returns a pointer to `n` bytes at the cursor and advances; NULL on overrun. */
static const uint8_t* wc_rd_blob(wc_rd* r, uint32_t n) {
    if (r->bad || (int)n < 0 || r->off + (int)n > r->len) { r->bad = 1; return (const uint8_t*)0; }
    const uint8_t* q = r->p + r->off;
    r->off += (int)n;
    return q;
}

/* Parse the serialised public key into a br_rsa_public_key (pointers alias the
 * input buffer, which the caller keeps alive for the duration of the op). */
static int wc_parse_pub(const uint8_t* buf, int len, br_rsa_public_key* pk) {
    wc_rd r = { buf, len, 0, 0 };
    uint32_t nlen = wc_rd_u16(&r);
    const uint8_t* n = wc_rd_blob(&r, nlen);
    uint32_t elen = wc_rd_u16(&r);
    const uint8_t* e = wc_rd_blob(&r, elen);
    if (r.bad) return -1;
    pk->n = (unsigned char*)n;  pk->nlen = nlen;
    pk->e = (unsigned char*)e;  pk->elen = elen;
    return 0;
}

/* Parse the serialised private key into a br_rsa_private_key. */
static int wc_parse_priv(const uint8_t* buf, int len, br_rsa_private_key* sk) {
    wc_rd r = { buf, len, 0, 0 };
    uint32_t nbits = wc_rd_u32(&r);
    uint32_t plen  = wc_rd_u16(&r);  const uint8_t* p  = wc_rd_blob(&r, plen);
    uint32_t qlen  = wc_rd_u16(&r);  const uint8_t* q  = wc_rd_blob(&r, qlen);
    uint32_t dplen = wc_rd_u16(&r);  const uint8_t* dp = wc_rd_blob(&r, dplen);
    uint32_t dqlen = wc_rd_u16(&r);  const uint8_t* dq = wc_rd_blob(&r, dqlen);
    uint32_t iqlen = wc_rd_u16(&r);  const uint8_t* iq = wc_rd_blob(&r, iqlen);
    if (r.bad || nbits == 0) return -1;
    sk->n_bitlen = nbits;
    sk->p  = (unsigned char*)p;  sk->plen  = plen;
    sk->q  = (unsigned char*)q;  sk->qlen  = qlen;
    sk->dp = (unsigned char*)dp; sk->dplen = dplen;
    sk->dq = (unsigned char*)dq; sk->dqlen = dqlen;
    sk->iq = (unsigned char*)iq; sk->iqlen = iqlen;
    return 0;
}

/* ── A br_prng_class adapter that draws from the staged-entropy seam ──────────
 * br_rsa_oaep_pad and the OAEP-seed generation take a (br_prng_class**); we wrap
 * the freestanding randombytes() seam so OAEP encrypt is deterministic w.r.t.
 * the staged bytes (the KAT stages the seed before calling). No crypto here —
 * just a generate() that copies from the seam. */

typedef struct {
    const br_prng_class* vtable;
} wc_seam_prng;

static void wc_seam_init(const br_prng_class** ctx, const void* params,
                         const void* seed, size_t seed_len) {
    (void)ctx; (void)params; (void)seed; (void)seed_len;
}
static void wc_seam_generate(const br_prng_class** ctx, void* out, size_t len) {
    (void)ctx;
    randombytes((uint8_t*)out, len);
}
static void wc_seam_update(const br_prng_class** ctx, const void* seed, size_t len) {
    (void)ctx; (void)seed; (void)len;
}

/* Field order MUST match br_prng_class_: { context_size, init, generate, update }. */
static const br_prng_class wc_seam_prng_vtable = {
    sizeof(wc_seam_prng),
    wc_seam_init,
    wc_seam_generate,
    wc_seam_update,
};

/* ════════════════════════════════════════════════════════════════════════════
 * OWNED EMSA-PSS layer (RFC 8017 / PKCS#1 v2.1 §9.1)
 *
 * HUMAN-AUTHORIZED EXCEPTION to the no-own-rolling rule (option ③, 2026-06-21).
 * Only the PSS PADDING is owned here. The RSA arithmetic (br_rsa_i31_private /
 * br_rsa_i31_public), the hashing (br_sha*_vtable) and the mask (br_mgf1_xor)
 * are all vendored BearSSL. No bignum/modexp is reimplemented.
 * ════════════════════════════════════════════════════════════════════════════ */

/*
 * EMSA-PSS-ENCODE (RFC 8017 §9.1.1). emBits = modBits - 1.
 *   M'   = (0x00 × 8) || mHash || salt          (salt length sLen)
 *   H    = Hash(M')
 *   DB   = PS(0x00…) || 0x01 || salt            (length emLen - hLen - 1)
 *   dbMask = MGF1(H, emLen - hLen - 1)
 *   maskedDB = DB XOR dbMask, then clear the top (8*emLen - emBits) bits
 *   EM   = maskedDB || H || 0xBC                (length emLen)
 * The salt is drawn from the rng seam (deterministic under host staging).
 * Returns 0 on success, <0 on parameter error.
 */
static int wc_emsa_pss_encode(const br_hash_class* vt, size_t hLen, size_t sLen,
                              size_t emBits, const uint8_t* mHash,
                              uint8_t* em, size_t emLen) {
    /* §9.1.1 step 3: emLen < hLen + sLen + 2 ⇒ "encoding error". */
    if (emLen < hLen + sLen + 2) return WC_EFAIL;

    /* salt from the seam (sign path). */
    uint8_t salt[64];           /* sLen == hLen ≤ 64 (SHA-512) */
    if (sLen > sizeof salt) return WC_EBADPARAM;
    if (sLen) {
        randombytes(salt, sLen);
        if (rng_underflowed()) return WC_ERNGUNDERFLOW;
    }

    /* H = Hash( (0x00×8) || mHash || salt ). */
    uint8_t zero8[8] = { 0, 0, 0, 0, 0, 0, 0, 0 };
    uint8_t* H = em + (emLen - hLen - 1);   /* H lands at maskedDB end (in place) */
    {
        br_hash_compat_context hc;
        vt->init(&hc.vtable);
        vt->update(&hc.vtable, zero8, 8);
        vt->update(&hc.vtable, mHash, hLen);
        if (sLen) vt->update(&hc.vtable, salt, sLen);
        vt->out(&hc.vtable, H);
    }

    /* maskedDB region = em[0 .. emLen-hLen-1). Build DB then mask in place.
     * DB = 00..00 || 0x01 || salt   (length dbLen = emLen - hLen - 1). */
    size_t dbLen = emLen - hLen - 1;
    for (size_t i = 0; i < dbLen; i++) em[i] = 0x00;
    em[dbLen - sLen - 1] = 0x01;
    for (size_t i = 0; i < sLen; i++) em[dbLen - sLen + i] = salt[i];

    /* dbMask = MGF1(H, dbLen); maskedDB = DB XOR dbMask (vendored mask). */
    br_mgf1_xor(em, dbLen, vt, H, hLen);

    /* Clear the top (8*emLen - emBits) bits of the leftmost octet of maskedDB. */
    size_t topClear = 8 * emLen - emBits;       /* 0..7 */
    if (topClear) em[0] &= (uint8_t)(0xFF >> topClear);

    /* Trailer 0xBC. (H already in place at em[dbLen].) */
    em[emLen - 1] = 0xBC;
    return 0;
}

/*
 * EMSA-PSS-VERIFY (RFC 8017 §9.1.2). emBits = modBits - 1.
 * Salt-length AUTO-RECOVERY: the 0x01 separator in the recovered DB locates the
 * salt, so any saltLen verifies without being hardcoded. Constant-time H'==H.
 * Returns 1 if consistent (valid), 0 otherwise.
 */
static int wc_emsa_pss_verify(const br_hash_class* vt, size_t hLen, size_t emBits,
                              const uint8_t* mHash, uint8_t* em, size_t emLen) {
    /* §9.1.2 step 3: emLen < hLen + 2 ⇒ inconsistent. */
    if (emLen < hLen + 2) return 0;
    /* step 4: rightmost octet must be 0xBC. */
    if (em[emLen - 1] != 0xBC) return 0;

    size_t dbLen = emLen - hLen - 1;
    uint8_t* maskedDB = em;
    const uint8_t* H = em + dbLen;

    /* step 6: the leftmost (8*emLen - emBits) bits of maskedDB[0] must be 0. */
    size_t topClear = 8 * emLen - emBits;       /* 0..7 */
    if (topClear) {
        if (maskedDB[0] & (uint8_t)(0xFF << (8 - topClear))) return 0;
    }

    /* steps 7-9: DB = maskedDB XOR MGF1(H, dbLen); clear the same top bits. */
    br_mgf1_xor(maskedDB, dbLen, vt, H, hLen);
    if (topClear) maskedDB[0] &= (uint8_t)(0xFF >> topClear);

    /* step 10: DB = PS(0x00…) || 0x01 || salt. Locate the 0x01 separator: every
     * byte before it must be 0x00 (salt-length auto-recovery — sLen = bytes
     * after the separator). */
    size_t sep = 0;
    int found = 0;
    for (size_t i = 0; i < dbLen; i++) {
        if (em[i] != 0x00) {
            if (em[i] == 0x01) { sep = i; found = 1; }
            break;  /* first non-zero byte must be the 0x01 separator */
        }
    }
    if (!found) return 0;
    size_t sLen = dbLen - sep - 1;
    const uint8_t* salt = em + sep + 1;

    /* steps 12-13: H' = Hash( (0x00×8) || mHash || salt ). */
    uint8_t zero8[8] = { 0, 0, 0, 0, 0, 0, 0, 0 };
    uint8_t Hp[64];     /* hLen ≤ 64 */
    {
        br_hash_compat_context hc;
        vt->init(&hc.vtable);
        vt->update(&hc.vtable, zero8, 8);
        vt->update(&hc.vtable, mHash, hLen);
        if (sLen) vt->update(&hc.vtable, salt, sLen);
        vt->out(&hc.vtable, Hp);
    }

    /* step 14: constant-time H' == H (no early return on the first diff byte). */
    unsigned diff = 0;
    for (size_t i = 0; i < hLen; i++) diff |= (unsigned)(Hp[i] ^ H[i]);
    return diff == 0 ? 1 : 0;
}

/* ── RSA keygen — entropy via the staged seam, serialised key out ─────────────
 *
 * The host stages deterministic entropy (rng_stage) then calls rsa_keygen; we
 * seed an HMAC_DRBG from a seam-drained block and drive the default i31 keygen.
 * NOTE: BearSSL uses probabilistic prime generation from the PRNG; it does NOT
 * implement the FIPS 186-5 *provable-prime-from-seed* (B.3.2) algorithm, so a
 * generated key matches NIST RSA-KeyGen byte-for-byte ONLY if the same PRNG
 * stream is used — it does not reproduce NIST's seed-derived keys. The KAT
 * therefore checks determinism + internal validity (sign with sk verifies under
 * pk), not byte-equality with NIST keyGen vectors (algorithmic mismatch). */
__attribute__((used))
int rsa_keygen(int scheme, int bits, int hashId,
               uint8_t* pkOutPtr, int* pkLenPtr,
               uint8_t* skOutPtr, int* skLenPtr) {
    (void)scheme; (void)hashId;
    if (bits < 2048 || bits > 4096 || (bits & 7)) return WC_EBADPARAM;

    /* Seed an HMAC_DRBG with 32 bytes drained from the staged seam. */
    uint8_t seed[32];
    randombytes(seed, sizeof seed);
    if (rng_underflowed()) return WC_ERNGUNDERFLOW;

    br_hmac_drbg_context rng;
    br_hmac_drbg_init(&rng, &br_sha256_vtable, seed, sizeof seed);

    /* Key-element scratch in arena (BearSSL writes the big-integer limbs here). */
    unsigned char kbuf_priv[BR_RSA_KBUF_PRIV_SIZE(4096)];
    unsigned char kbuf_pub[BR_RSA_KBUF_PUB_SIZE(4096)];

    br_rsa_private_key sk;
    br_rsa_public_key  pk;
    uint32_t ok = br_rsa_i31_keygen(&rng.vtable, &sk, kbuf_priv, &pk, kbuf_pub,
                                    (unsigned)bits, 0 /* default public exponent (3) */);
    if (!ok) return WC_EFAIL;

    /* Serialise public key: u16 nlen | n | u16 elen | e */
    {
        int o = 0;
        pkOutPtr[o++] = (uint8_t)(pk.nlen >> 8); pkOutPtr[o++] = (uint8_t)pk.nlen;
        for (size_t i = 0; i < pk.nlen; i++) pkOutPtr[o++] = pk.n[i];
        pkOutPtr[o++] = (uint8_t)(pk.elen >> 8); pkOutPtr[o++] = (uint8_t)pk.elen;
        for (size_t i = 0; i < pk.elen; i++) pkOutPtr[o++] = pk.e[i];
        if (pkLenPtr) *pkLenPtr = o;
    }
    /* Serialise private key: u32 n_bitlen | (u16 len|blob)*5 */
    {
        int o = 0;
        skOutPtr[o++] = (uint8_t)(sk.n_bitlen >> 24); skOutPtr[o++] = (uint8_t)(sk.n_bitlen >> 16);
        skOutPtr[o++] = (uint8_t)(sk.n_bitlen >> 8);  skOutPtr[o++] = (uint8_t)sk.n_bitlen;
        const unsigned char* blobs[5] = { sk.p, sk.q, sk.dp, sk.dq, sk.iq };
        size_t lens[5] = { sk.plen, sk.qlen, sk.dplen, sk.dqlen, sk.iqlen };
        for (int b = 0; b < 5; b++) {
            skOutPtr[o++] = (uint8_t)(lens[b] >> 8); skOutPtr[o++] = (uint8_t)lens[b];
            for (size_t i = 0; i < lens[b]; i++) skOutPtr[o++] = blobs[b][i];
        }
        if (skLenPtr) *skLenPtr = o;
    }
    return 0;
}

/* ── OAEP encrypt — vendored pad + vendored public modexp (no new crypto) ───── */
__attribute__((used))
int rsa_oaep_enc(int hashId, const uint8_t* pkPtr, int pkLen,
                 const uint8_t* msgPtr, int msgLen,
                 const uint8_t* labelPtr, int labelLen,
                 uint8_t* outPtr, int* outLenPtr) {
    const br_hash_class* vt = wc_sha2_vtable(hashId);
    if (!vt) return WC_EBADPARAM;
    if (msgLen < 0 || labelLen < 0) return WC_EBADPARAM;

    br_rsa_public_key pk;
    if (wc_parse_pub(pkPtr, pkLen, &pk) != 0) return WC_EBADPARAM;

    /* Modulus byte length k. Our serialisation carries no leading zero bytes, so
     * the encoded modulus length is the effective k; br_rsa_oaep_pad recomputes
     * the exact k internally anyway. */
    size_t k = pk.nlen;

    /* Pad in place into outPtr (k bytes), using the seam PRNG for the OAEP seed. */
    wc_seam_prng pr;
    pr.vtable = &wc_seam_prng_vtable;
    size_t em = br_rsa_oaep_pad(&pr.vtable, vt,
                                labelLen ? labelPtr : (const void*)0, (size_t)labelLen,
                                &pk, outPtr, k, msgPtr, (size_t)msgLen);
    if (em == 0) return WC_EFAIL;

    /* Public modexp in place: EM (k bytes) -> ciphertext (k bytes). */
    uint32_t ok = br_rsa_i31_public(outPtr, em, &pk);
    if (!ok) return WC_EFAIL;
    if (outLenPtr) *outLenPtr = (int)em;
    return 0;
}

/* ── OAEP decrypt — vendored br_rsa_i31_oaep_decrypt ──────────────────────────
 * Decrypts in place: ctPtr is copied into outPtr (k bytes), decrypted, the
 * recovered message left at the start of outPtr, *outLenPtr set to its length. */
__attribute__((used))
int rsa_oaep_dec(int hashId, const uint8_t* skPtr, int skLen,
                 const uint8_t* ctPtr, int ctLen,
                 const uint8_t* labelPtr, int labelLen,
                 uint8_t* outPtr, int* outLenPtr) {
    const br_hash_class* vt = wc_sha2_vtable(hashId);
    if (!vt) return WC_EBADPARAM;
    if (ctLen < 0 || labelLen < 0) return WC_EBADPARAM;

    br_rsa_private_key sk;
    if (wc_parse_priv(skPtr, skLen, &sk) != 0) return WC_EBADPARAM;

    for (int i = 0; i < ctLen; i++) outPtr[i] = ctPtr[i];
    size_t len = (size_t)ctLen;
    uint32_t ok = br_rsa_i31_oaep_decrypt(vt, labelLen ? labelPtr : (const void*)0,
                                          (size_t)labelLen, &sk, outPtr, &len);
    if (!ok) return WC_EFAIL;
    if (outLenPtr) *outLenPtr = (int)len;
    return 0;
}

/* ── RSA sign: PKCS#1 v1.5 (scheme=1) or PSS (scheme=0, owned EMSA-PSS) ───────
 * hashPtr/hashLen is the message *digest* (the host hashes the message). For
 * PSS, sign = EMSA-PSS-ENCODE (owned padding) then br_rsa_i31_private (vendored
 * raw modexp); salt length sLen = hLen, salt drawn from the rng seam. */
__attribute__((used))
int rsa_sign(int scheme, int hashId, const uint8_t* skPtr, int skLen,
             const uint8_t* hashPtr, int hashLen, uint8_t* sigPtr, int* sigLenPtr) {
    if (scheme != 0 && scheme != 1) return WC_EBADPARAM;
    const br_hash_class* vt = wc_sha2_vtable(hashId);
    if (!vt) return WC_EBADPARAM;
    size_t hlen = wc_sha2_outlen(hashId);
    if ((size_t)hashLen != hlen) return WC_EBADPARAM;

    br_rsa_private_key sk;
    if (wc_parse_priv(skPtr, skLen, &sk) != 0) return WC_EBADPARAM;
    size_t klen = (sk.n_bitlen + 7) >> 3;
    if (klen == 0 || klen > 1024) return WC_EBADPARAM;   /* ≤ 8192-bit modulus */

    if (scheme == 1) {
        /* PKCS#1 v1.5 — vendored. */
        const unsigned char* oid = wc_sha2_oid(hashId);
        if (!oid) return WC_EBADPARAM;
        uint32_t ok = br_rsa_i31_pkcs1_sign(oid, hashPtr, hlen, &sk, sigPtr);
        if (!ok) return WC_EFAIL;
        if (sigLenPtr) *sigLenPtr = (int)klen;
        return 0;
    }

    /* PSS (scheme=0) — OWNED EMSA-PSS encode + VENDORED raw private modexp.
     * emBits = modBits-1; emLen = ceil(emBits/8); the modexp operand is exactly
     * klen bytes, so EM is right-aligned (leading zero byte when emLen=klen-1). */
    size_t modBits = sk.n_bitlen;
    size_t emBits = modBits - 1;
    size_t emLen = (emBits + 7) >> 3;
    if (emLen == 0 || emLen > klen) return WC_EFAIL;

    uint8_t buf[1024];                  /* klen ≤ 1024 */
    size_t pad = klen - emLen;          /* 0 or 1 */
    for (size_t i = 0; i < pad; i++) buf[i] = 0x00;
    int rc = wc_emsa_pss_encode(vt, hlen, hlen /* sLen = hLen */, emBits, hashPtr,
                                buf + pad, emLen);
    if (rc != 0) return rc;

    uint32_t ok = br_rsa_i31_private(buf, &sk);
    if (!ok) return WC_EFAIL;
    for (size_t i = 0; i < klen; i++) sigPtr[i] = buf[i];
    if (sigLenPtr) *sigLenPtr = (int)klen;
    return 0;
}

/* ── RSA verify: PKCS#1 v1.5 (scheme=1) or PSS (scheme=0, owned EMSA-PSS) ─────
 * For PSS, verify = br_rsa_i31_public (vendored raw modexp) then
 * EMSA-PSS-VERIFY (owned padding with salt-length auto-recovery). */
__attribute__((used))
int rsa_verify(int scheme, int hashId, const uint8_t* pkPtr, int pkLen,
               const uint8_t* sigPtr, int sigLen,
               const uint8_t* hashPtr, int hashLen) {
    if (scheme != 0 && scheme != 1) return WC_EBADPARAM;
    const br_hash_class* vt = wc_sha2_vtable(hashId);
    if (!vt) return WC_EBADPARAM;
    size_t hlen = wc_sha2_outlen(hashId);
    if ((size_t)hashLen != hlen) return WC_EBADPARAM;

    br_rsa_public_key pk;
    if (wc_parse_pub(pkPtr, pkLen, &pk) != 0) return WC_EBADPARAM;

    if (scheme == 1) {
        /* PKCS#1 v1.5 — vendored. */
        const unsigned char* oid = wc_sha2_oid(hashId);
        if (!oid) return WC_EBADPARAM;
        unsigned char digest[64];   /* max SHA-512 output */
        uint32_t ok = br_rsa_i31_pkcs1_vrfy(sigPtr, (size_t)sigLen, oid, hlen, &pk, digest);
        if (!ok) return WC_EFAIL;
        /* Constant-time compare the recovered digest against the supplied hash. */
        unsigned diff = 0;
        for (size_t i = 0; i < hlen; i++) diff |= (unsigned)(digest[i] ^ hashPtr[i]);
        return diff == 0 ? 0 : WC_EFAIL;
    }

    /* PSS (scheme=0) — VENDORED raw public modexp + OWNED EMSA-PSS verify.
     * The modexp operates in place on a klen-byte buffer holding the signature;
     * the recovered EM is the rightmost emLen bytes (emLen = ceil((modBits-1)/8),
     * and modBits is the bit length of n). */
    size_t klen = pk.nlen;
    if (klen == 0 || klen > 1024) return WC_EBADPARAM;
    if ((size_t)sigLen != klen) return WC_EFAIL;     /* signature must be k bytes */

    uint8_t buf[1024];
    for (size_t i = 0; i < klen; i++) buf[i] = sigPtr[i];
    uint32_t ok = br_rsa_i31_public(buf, klen, &pk);
    if (!ok) return WC_EFAIL;

    /* modBits = bit length of n; emBits = modBits-1; emLen = ceil(emBits/8). */
    size_t modBits = 0;
    {
        /* Find the bit length of the modulus n (big-endian, no leading-zero in
         * our wire form, but be robust to one). */
        size_t i = 0;
        while (i < pk.nlen && pk.n[i] == 0) i++;
        if (i < pk.nlen) {
            uint8_t top = pk.n[i];
            size_t bits = (pk.nlen - i - 1) * 8;
            while (top) { bits++; top >>= 1; }
            modBits = bits;
        }
    }
    if (modBits == 0) return WC_EFAIL;
    size_t emBits = modBits - 1;
    size_t emLen = (emBits + 7) >> 3;
    if (emLen == 0 || emLen > klen) return WC_EFAIL;

    /* EM is the rightmost emLen bytes of the klen-byte modexp output. Any
     * leading bytes (when emLen = klen-1) must be zero for a valid encoding. */
    for (size_t i = 0; i < klen - emLen; i++) {
        if (buf[i] != 0x00) return WC_EFAIL;
    }
    int valid = wc_emsa_pss_verify(vt, hlen, emBits, hashPtr, buf + (klen - emLen), emLen);
    return valid ? 0 : WC_EFAIL;
}
