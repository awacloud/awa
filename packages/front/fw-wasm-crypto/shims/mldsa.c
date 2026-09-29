/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * mldsa.c — ML-DSA (FIPS 204 final) ABI shim over PQClean ml-dsa-{44,65,87}.
 *   source: PQClean (see vendor/PROVENANCE.json, vendor/NOTICE-pqclean).
 *
 * Replaces the dilithium/ref path that shims/pqc.c served for ml_dsa (pqc.c is
 * retired by this task — ml_kem moved to shims/mlkem.c in task 04). The frozen
 * BATCH_11 ABI is preserved VERBATIM (names + signatures) so the fw wrapper and
 * shims.test.ts keep working unchanged:
 *
 *   ai/batches/types/fw/BATCH_11/04-wasm-ml-dsa.md
 *     int mldsa_keygen(int ps, uint8_t* pkPtr, uint8_t* skPtr);
 *     int mldsa_sign(int ps, const uint8_t* skPtr, const uint8_t* msgPtr, int msgLen,
 *                    const uint8_t* ctxPtr, int ctxLen, uint8_t* sigPtr, int* sigLenPtr);
 *     int mldsa_verify(int ps, const uint8_t* pkPtr, const uint8_t* sigPtr, int sigLen,
 *                      const uint8_t* msgPtr, int msgLen, const uint8_t* ctxPtr, int ctxLen);
 *   + memory / alloc / free (from _arena.h).  (0 = OK / valid; non-zero = failure.)
 *
 * `ps` parameter-set enum (unchanged): 0 = ML-DSA-44, 1 = ML-DSA-65, 2 = ML-DSA-87.
 *
 * Determinism / staged-entropy contract (the seam, csrc/rng/rng.{h,c}) — OQ-1
 * --------------------------------------------------------------------------------
 * PQClean's clean ML-DSA draws randomness ONLY via `randombytes()`, which this
 * build routes to the staged-entropy seam (the compat csrc/pqclean/compat/
 * randombytes.h drops PQClean's PQCLEAN_randombytes rename so the call binds to
 * the seam's `randombytes`). There are exactly two draw sites, both pinned by
 * FIPS-204 / the ACVP vectors:
 *
 *   keygen  (crypto_sign_keypair):   ONE draw of SEEDBYTES = 32 bytes — the
 *           ACVP ML-DSA-keyGen vector's `seed` (xi). The host stages those 32
 *           bytes before mldsa_keygen(); the seam returns them as the seed.
 *
 *   sign    (crypto_sign_signature_ctx): ONE draw of RNDBYTES = 32 bytes — the
 *           per-signature `rnd`. FIPS-204 has two coin paths:
 *             - DETERMINISTIC ("pure"/det vector): rnd = 0^256. The host stages
 *               32 zero bytes (or relies on the seam's zero-fill) → identical to
 *               the standard's hedged-off path.
 *             - HEDGED (non-deterministic vector): rnd = the vector's 32-byte
 *               `rnd`. The host stages it before mldsa_sign().
 *           In BOTH cases mldsa_sign() makes exactly one 32-byte draw, so the KAT
 *           harness simply stages the right 32 bytes; the shim is path-agnostic.
 *
 *   verify  (crypto_sign_verify_ctx): NO randomness — pure deterministic check.
 *
 * This shim binds to the EXTERNAL, PURE FIPS-204 interface
 * (crypto_sign_signature_ctx / crypto_sign_verify_ctx): mu is derived inside
 * PQClean from tr, the domain-separator byte 0x00 (pure), ctxlen, ctx and the
 * message — matching ACVP's signatureInterface=external, preHash=pure groups.
 * The HashML-DSA (preHash) and internal (externalMu) ACVP groups use APIs
 * PQClean's `clean` build does not expose and are outside this frozen ABI.
 *
 * The three parameter sets coexist by compiling all three PQClean clean trees
 * (namespaced PQCLEAN_MLDSA44/65/87_CLEAN_*) into one freestanding module; we
 * forward-declare exactly the three entry points per scheme we use, to keep this
 * shim header-light (each scheme's api.h is single-level).
 *
 * C23 (built -std=c23 via cStdFor for shims/). Zero imports, no <stdbit.h>,
 * no global constructors, no side effects at load.
 */

#include <stddef.h>
#include <stdint.h>

#include "_arena.h"          /* frozen memory / alloc / free ABI (one arena owner) */
#include "csrc/rng/rng.h"    /* the staged-entropy seam: randombytes / rng_stage / rng_reset */

#define WC_EBADPARAM (-1)
#define WC_ERNGUNDERFLOW (-2)

/* ── Vendored PQClean ml-dsa entry points (namespaced per level) ──────────────
 * Provided by vendor/pqclean/crypto_sign/ml-dsa-{44,65,87}/clean/sign.c. We use
 * the external+pure FIPS-204 interface: _keypair, _crypto_sign_signature_ctx,
 * _crypto_sign_verify_ctx. All return 0 on success; verify returns 0 iff valid.
 */
extern int PQCLEAN_MLDSA44_CLEAN_crypto_sign_keypair(uint8_t *pk, uint8_t *sk);
extern int PQCLEAN_MLDSA44_CLEAN_crypto_sign_signature_ctx(
    uint8_t *sig, size_t *siglen, const uint8_t *m, size_t mlen,
    const uint8_t *ctx, size_t ctxlen, const uint8_t *sk);
extern int PQCLEAN_MLDSA44_CLEAN_crypto_sign_verify_ctx(
    const uint8_t *sig, size_t siglen, const uint8_t *m, size_t mlen,
    const uint8_t *ctx, size_t ctxlen, const uint8_t *pk);

extern int PQCLEAN_MLDSA65_CLEAN_crypto_sign_keypair(uint8_t *pk, uint8_t *sk);
extern int PQCLEAN_MLDSA65_CLEAN_crypto_sign_signature_ctx(
    uint8_t *sig, size_t *siglen, const uint8_t *m, size_t mlen,
    const uint8_t *ctx, size_t ctxlen, const uint8_t *sk);
extern int PQCLEAN_MLDSA65_CLEAN_crypto_sign_verify_ctx(
    const uint8_t *sig, size_t siglen, const uint8_t *m, size_t mlen,
    const uint8_t *ctx, size_t ctxlen, const uint8_t *pk);

extern int PQCLEAN_MLDSA87_CLEAN_crypto_sign_keypair(uint8_t *pk, uint8_t *sk);
extern int PQCLEAN_MLDSA87_CLEAN_crypto_sign_signature_ctx(
    uint8_t *sig, size_t *siglen, const uint8_t *m, size_t mlen,
    const uint8_t *ctx, size_t ctxlen, const uint8_t *sk);
extern int PQCLEAN_MLDSA87_CLEAN_crypto_sign_verify_ctx(
    const uint8_t *sig, size_t siglen, const uint8_t *m, size_t mlen,
    const uint8_t *ctx, size_t ctxlen, const uint8_t *pk);

/* ── ML-DSA ABI (frozen names/signatures — do NOT rename) ──────────────────────
 *
 * keygen / sign consume staged entropy: the host stages the deterministic seed
 * (keygen) or rnd (sign) via rng_stage() first; PQClean draws it through the
 * seam's randombytes(). rng_underflowed() guards against an under-staged vector
 * (the seam zero-fills + raises the sticky flag) so we never silently KAT-pass
 * on zeros. (Note: a legitimately deterministic sign stages rnd = 0^256, which
 * is exactly 32 staged bytes — NOT an underflow.) */

__attribute__((used))
int mldsa_keygen(int ps, uint8_t* pkPtr, uint8_t* skPtr) {
    int rc;
    switch (ps) {
        case 0: rc = PQCLEAN_MLDSA44_CLEAN_crypto_sign_keypair(pkPtr, skPtr); break;
        case 1: rc = PQCLEAN_MLDSA65_CLEAN_crypto_sign_keypair(pkPtr, skPtr); break;
        case 2: rc = PQCLEAN_MLDSA87_CLEAN_crypto_sign_keypair(pkPtr, skPtr); break;
        default: return WC_EBADPARAM;
    }
    if (rc == 0 && rng_underflowed()) {
        return WC_ERNGUNDERFLOW;
    }
    return rc;
}

__attribute__((used))
int mldsa_sign(int ps, const uint8_t* skPtr,
               const uint8_t* msgPtr, int msgLen,
               const uint8_t* ctxPtr, int ctxLen,
               uint8_t* sigPtr, int* sigLenPtr) {
    size_t siglen = 0;
    int rc;
    switch (ps) {
        case 0: rc = PQCLEAN_MLDSA44_CLEAN_crypto_sign_signature_ctx(
                    sigPtr, &siglen, msgPtr, (size_t)msgLen,
                    ctxPtr, (size_t)ctxLen, skPtr); break;
        case 1: rc = PQCLEAN_MLDSA65_CLEAN_crypto_sign_signature_ctx(
                    sigPtr, &siglen, msgPtr, (size_t)msgLen,
                    ctxPtr, (size_t)ctxLen, skPtr); break;
        case 2: rc = PQCLEAN_MLDSA87_CLEAN_crypto_sign_signature_ctx(
                    sigPtr, &siglen, msgPtr, (size_t)msgLen,
                    ctxPtr, (size_t)ctxLen, skPtr); break;
        default: return WC_EBADPARAM;
    }
    if (rc == 0 && rng_underflowed()) {
        return WC_ERNGUNDERFLOW;
    }
    if (rc == 0 && sigLenPtr != (int*)0) {
        *sigLenPtr = (int)siglen;
    }
    return rc;
}

__attribute__((used))
int mldsa_verify(int ps, const uint8_t* pkPtr,
                 const uint8_t* sigPtr, int sigLen,
                 const uint8_t* msgPtr, int msgLen,
                 const uint8_t* ctxPtr, int ctxLen) {
    switch (ps) {
        case 0: return PQCLEAN_MLDSA44_CLEAN_crypto_sign_verify_ctx(
                    sigPtr, (size_t)sigLen, msgPtr, (size_t)msgLen,
                    ctxPtr, (size_t)ctxLen, pkPtr);
        case 1: return PQCLEAN_MLDSA65_CLEAN_crypto_sign_verify_ctx(
                    sigPtr, (size_t)sigLen, msgPtr, (size_t)msgLen,
                    ctxPtr, (size_t)ctxLen, pkPtr);
        case 2: return PQCLEAN_MLDSA87_CLEAN_crypto_sign_verify_ctx(
                    sigPtr, (size_t)sigLen, msgPtr, (size_t)msgLen,
                    ctxPtr, (size_t)ctxLen, pkPtr);
        default: return WC_EBADPARAM;
    }
}

/* ── Host staging ABI ─────────────────────────────────────────────────────────
 * The seam (csrc/rng/rng.c) already defines `rng_stage(const uint8_t*, uint32_t)`
 * and `rng_reset(void)` with exactly the wasm host ABI we need (on wasm32 a
 * pointer IS an i32, so `srcPtr` arrives as the linear-memory offset). The
 * builder exports both directly via the target's `exports` list
 * (`-Wl,--export=rng_stage`/`rng_reset`). We therefore do NOT add export_name
 * wrappers here — a wrapper named "rng_stage" would collide with the seam's own
 * exported symbol (duplicate export → the module fails to parse). The host
 * stages the keygen seed / sign rnd through these before the matching call; see
 * the determinism contract in the header comment. (Declared in csrc/rng/rng.h.)
 */
