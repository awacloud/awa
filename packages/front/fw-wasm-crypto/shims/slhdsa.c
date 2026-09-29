/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * slhdsa.c — SLH-DSA (FIPS 205) ABI shim over the vendored OpenSSL FIPS-205
 *   SLH-DSA core (vendor/openssl-slh-dsa/**, openssl-3.5.0) behind a freestanding
 *   hash/key/driver adapter (csrc/slhdsa/**). 12 parameter sets.
 *   source: OpenSSL (Apache-2.0; see vendor/PROVENANCE.json + vendor/NOTICE-openssl-slh-dsa).
 *
 * RE-SOURCE (task 06 re-run): the first attempt bound PQClean's
 * sphincs-*-simple/clean, which is ROUND-3 SPHINCS+, NOT FIPS-205 SLH-DSA, so
 * sign/verify rejected the FIPS-205 ACVP vectors. This shim now binds the OpenSSL
 * FIPS-205 SLH-DSA algorithm core (decoupled from EVP via a function-pointer hash
 * vtable; the EVP-bound hashing/key TUs are replaced by the freestanding adapter
 * in csrc/slhdsa/). The shim ABI, psId order, the M' domain wrap, and the seam
 * routing are UNCHANGED from the prior attempt's design — only the crypto core
 * underneath changed.
 *
 * The frozen BATCH_11 ABI is preserved VERBATIM (names + signatures + psId order)
 * so the fw wrapper and shims.test.ts keep working unchanged:
 *
 *   ai/batches/types/fw/BATCH_11/05-wasm-slh-dsa.md
 *     int slhdsa_keygen(int psId, uint8_t* pkPtr, uint8_t* skPtr);
 *     int slhdsa_sign(int psId, const uint8_t* skPtr, const uint8_t* msgPtr, int msgLen,
 *                     const uint8_t* ctxPtr, int ctxLen, uint8_t* sigPtr, int* sigLenPtr);
 *     int slhdsa_verify(int psId, const uint8_t* pkPtr, const uint8_t* sigPtr, int sigLen,
 *                       const uint8_t* msgPtr, int msgLen, const uint8_t* ctxPtr, int ctxLen);
 *   + memory / alloc / free (from _arena.h).  (0 = OK / valid; non-zero = failure.)
 *
 * `psId` enum (unchanged 0..11 — SHA2/SHAKE × 128/192/256 × s/f order):
 *   0  SLH-DSA-SHA2-128s    1  SLH-DSA-SHA2-128f
 *   2  SLH-DSA-SHA2-192s    3  SLH-DSA-SHA2-192f
 *   4  SLH-DSA-SHA2-256s    5  SLH-DSA-SHA2-256f
 *   6  SLH-DSA-SHAKE-128s   7  SLH-DSA-SHAKE-128f
 *   8  SLH-DSA-SHAKE-192s   9  SLH-DSA-SHAKE-192f
 *   10 SLH-DSA-SHAKE-256s   11 SLH-DSA-SHAKE-256f
 * (The freestanding entry layer maps this psId order onto the OpenSSL algorithm
 *  names via the same 0..11 table — see csrc/slhdsa/slh_entry.c.)
 *
 * FIPS-205 external / pure context wrapping (§10.2.1) — handled HERE
 * --------------------------------------------------------------------------------
 * FIPS-205 §10.2.1 (slh_sign, external / non-prehash) signs the domain-separated
 *
 *     M' = toByte(0, 1) || toByte(|ctx|, 1) || ctx || M
 *        =  0x00        ||  ctxLen          || ctx || M
 *
 * (and verify checks M'). The frozen ABI threads (ctxPtr, ctxLen) into the shim,
 * so the shim builds M' on the arena and passes it to the core with encode=0 (the
 * core does NOT re-encode). With ctxLen == 0 this prepends exactly the two bytes
 * 0x00 0x00, matching the ACVP signatureInterface="external", preHash="pure"
 * groups (the only interface this frozen ABI binds; internal/preHash groups use
 * APIs outside the ABI surface). FIPS-205 caps |ctx| at 255; ctxLen > 255 is
 * rejected (WC_EBADCTX).
 *
 * Determinism / staged-entropy contract (the seam, csrc/rng/rng.{h,c})
 * --------------------------------------------------------------------------------
 * The freestanding entry layer DRAINS the host-staged seam to obtain entropy
 * (the OpenSSL core takes entropy/addrnd as explicit arguments rather than via
 * randombytes()). The host stages:
 *   keygen: 3*n bytes = skSeed || skPrf || pkSeed (the ACVP keyGen vector).
 *   sign:   n bytes = addrnd — PK.seed for the DETERMINISTIC ACVP groups
 *           (PK.seed = sk[2n..3n) = pk[0..n)), else the vector's n-byte
 *           additionalRandomness for the HEDGED groups. The shim is path-agnostic
 *           (it never picks the coins — mirrors the ML-DSA shim).
 *   verify: no randomness.
 * rng_underflowed() guards against an under-staged vector so we never silently
 * KAT-pass on zeros (handled inside the entry layer; the shim surfaces its rc).
 *
 * C23 (built -std=c23 via cStdFor for shims/). Zero imports, no <stdbit.h>,
 * no global constructors, no side effects at load.
 */

#include <stddef.h>
#include <stdint.h>

#include "_arena.h"          /* frozen memory / alloc / free ABI (one arena owner) */
#include "csrc/rng/rng.h"    /* the staged-entropy seam: rng_stage / rng_reset (re-exported) */

#define WC_SLH_NSETS 12
#define WC_EBADPARAM    (-1)
#define WC_EBADCTX      (-3)
#define WC_ENOMEM       (-4)

/* ── Freestanding OpenSSL SLH-DSA core entry points (csrc/slhdsa/slh_entry.c) ───
 * These construct the vendored key/ctx structs, wire the freestanding adapter
 * vtables, drain the seam for entropy, and call ossl_slh_dsa_sign/verify with
 * encode=0 (the shim already built M'). All return 0 on success; verify returns
 * 0 iff the signature is valid. */
extern int slhdsa_core_keygen(int psId, uint8_t *pk, uint8_t *sk);
extern int slhdsa_core_sign(int psId, const uint8_t *sk,
                            const uint8_t *mprime, size_t mprime_len,
                            uint8_t *sig, size_t *sig_len);
extern int slhdsa_core_verify(int psId, const uint8_t *pk,
                              const uint8_t *sig, size_t sig_len,
                              const uint8_t *mprime, size_t mprime_len);

/* ── FIPS-205 §10.2.1 external/pure context-wrap helper ────────────────────────
 * Build M' = 0x00 || ctxLen(1) || ctx || M into a fresh arena block. Returns the
 * pointer (and writes the total length), or NULL on bad ctx / OOM. The two-byte
 * prefix is always present (ctxLen == 0 -> 0x00 0x00). */
static uint8_t* wc_build_mprime(const uint8_t* msg, int msgLen,
                                const uint8_t* ctx, int ctxLen,
                                size_t* outLen) {
    if (ctxLen < 0 || ctxLen > 255 || msgLen < 0) {
        return (uint8_t*)0;
    }
    size_t total = (size_t)2 + (size_t)ctxLen + (size_t)msgLen;
    uint8_t* mp = (uint8_t*)alloc((int)total);
    if (mp == (uint8_t*)0) {
        return (uint8_t*)0;
    }
    mp[0] = 0x00;                 /* external/pure domain separator */
    mp[1] = (uint8_t)ctxLen;      /* |ctx| (<= 255) */
    for (int i = 0; i < ctxLen; i++) {
        mp[2 + i] = ctx[i];
    }
    for (int i = 0; i < msgLen; i++) {
        mp[2 + ctxLen + i] = msg[i];
    }
    *outLen = total;
    return mp;
}

/* ── SLH-DSA ABI (frozen names/signatures — do NOT rename) ───────────────────── */

__attribute__((used))
int slhdsa_keygen(int psId, uint8_t* pkPtr, uint8_t* skPtr) {
    if (psId < 0 || psId >= WC_SLH_NSETS) {
        return WC_EBADPARAM;
    }
    return slhdsa_core_keygen(psId, pkPtr, skPtr);
}

__attribute__((used))
int slhdsa_sign(int psId, const uint8_t* skPtr,
                const uint8_t* msgPtr, int msgLen,
                const uint8_t* ctxPtr, int ctxLen,
                uint8_t* sigPtr, int* sigLenPtr) {
    if (psId < 0 || psId >= WC_SLH_NSETS) {
        return WC_EBADPARAM;
    }
    if (ctxLen < 0 || ctxLen > 255 || msgLen < 0) {
        return WC_EBADCTX;
    }
    size_t mpLen = 0;
    uint8_t* mp = wc_build_mprime(msgPtr, msgLen, ctxPtr, ctxLen, &mpLen);
    if (mp == (uint8_t*)0) {
        return WC_ENOMEM;
    }
    size_t siglen = 0;
    int rc = slhdsa_core_sign(psId, skPtr, mp, mpLen, sigPtr, &siglen);
    free(mp, (int)mpLen);
    if (rc == 0 && sigLenPtr != (int*)0) {
        *sigLenPtr = (int)siglen;
    }
    return rc;
}

__attribute__((used))
int slhdsa_verify(int psId, const uint8_t* pkPtr,
                  const uint8_t* sigPtr, int sigLen,
                  const uint8_t* msgPtr, int msgLen,
                  const uint8_t* ctxPtr, int ctxLen) {
    if (psId < 0 || psId >= WC_SLH_NSETS) {
        return WC_EBADPARAM;
    }
    if (ctxLen < 0 || ctxLen > 255 || msgLen < 0 || sigLen < 0) {
        return WC_EBADCTX;
    }
    size_t mpLen = 0;
    uint8_t* mp = wc_build_mprime(msgPtr, msgLen, ctxPtr, ctxLen, &mpLen);
    if (mp == (uint8_t*)0) {
        return WC_ENOMEM;
    }
    int rc = slhdsa_core_verify(psId, pkPtr, sigPtr, (size_t)sigLen, mp, mpLen);
    free(mp, (int)mpLen);
    return rc;
}

/* ── Host staging ABI ──────────────────────────────────────────────────────────
 * The seam (csrc/rng/rng.c) defines rng_stage / rng_reset with exactly the wasm
 * host ABI we need; the builder exports them directly via the target's `exports`
 * list (-Wl,--export=rng_stage/rng_reset). We add NO export_name wrappers here
 * (a wrapper named "rng_stage" would collide with the seam's own exported symbol
 * -> duplicate export -> the module fails to parse). The host stages the keygen
 * seed / sign addrnd through these before the matching call; the entry layer
 * drains them. (Declared in csrc/rng/rng.h.)
 */
