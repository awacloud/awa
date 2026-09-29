/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * mlkem.c — ML-KEM (FIPS 203 final) ABI shim over mlkem-native v1.2.0.
 *   source: pq-code-package/mlkem-native (see vendor/PROVENANCE.json).
 *
 * Replaces the kyber/ref path that shims/pqc.c served for ml_kem. The frozen
 * BATCH_11 ABI is preserved VERBATIM (names + signatures) so the fw wrapper and
 * shims.test.ts keep working unchanged:
 *
 *   ai/batches/types/fw/BATCH_11/03-wasm-ml-kem.md
 *     int mlkem_keygen(int ps, uint8_t* pkPtr, uint8_t* skPtr);              // 0=OK
 *     int mlkem_encaps(int ps, const uint8_t* pkPtr, uint8_t* ctPtr, uint8_t* ssPtr);
 *     int mlkem_decaps(int ps, const uint8_t* skPtr, const uint8_t* ctPtr, uint8_t* ssPtr);
 *   + memory / alloc / free (from _arena.h).  (0 = OK; non-zero = failure.)
 *
 * `ps` parameter-set enum (unchanged): 0 = ML-KEM-512, 1 = ML-KEM-768,
 *                                       2 = ML-KEM-1024.
 *
 * Determinism / staged-entropy contract (the seam, csrc/rng/rng.{h,c})
 * --------------------------------------------------------------------
 * mlkem-native is built here with the FIPS-203 *derandomized* API
 * (mlkem<lvl>_keypair_derand / mlkem<lvl>_enc_derand): the randomness is passed
 * in as explicit `coins`, not drawn from a CSPRNG. To keep the public ABI
 * coins-free (the (ps,...) signatures above carry NO seed argument), the host
 * stages the vector's deterministic entropy into linear memory BEFORE the call,
 * via the exported rng_stage()/rng_reset() wrappers, and the shim drains it
 * through the seam's randombytes() into a local coins buffer:
 *
 *   keygen : host stages d || z (64 bytes) → shim drains 64 → mlkem<lvl>_keypair_derand(pk, sk, coins)
 *   encaps : host stages m       (32 bytes) → shim drains 32 → mlkem<lvl>_enc_derand(ct, ss, pk, coins)
 *   decaps : no entropy            → mlkem<lvl>_dec(ss, ct, sk)
 *
 * This makes the ML-KEM ACVP keyGen/encapDecap AFT vectors reproducible while
 * leaving the ABI identical to the kyber/ref era. In production the host stages
 * fresh CSPRNG bytes the same way; there is NO JS/WASI import (freestanding).
 *
 * The three parameter sets coexist via mlkem-native's multilevel monolithic
 * build (csrc/mlkem/mlkem{512,768,1024}.c each #include the vendored SCU with a
 * fixed MLK_CONFIG_PARAMETER_SET); the level-dependent symbols are namespaced
 * mlkem512_* / mlkem768_* / mlkem1024_*. We forward-declare exactly the three
 * derandomized entry points we use, to keep this shim header-light (the vendored
 * mlkem_native.h is a single-level header and cannot expose all three at once).
 *
 * C23 (built -std=c23 via cStdFor for shims/). Zero imports, no <stdbit.h>,
 * no global constructors, no side effects at load.
 */

#include <stddef.h>
#include <stdint.h>

#include "_arena.h"          /* frozen memory / alloc / free ABI (one arena owner) */
#include "csrc/rng/rng.h"    /* the staged-entropy seam: randombytes / rng_stage / rng_reset */

/* ── ML-KEM key-material sizes (FIPS 203), per parameter set ─────────────────── */

#define MLKEM512_EK 800
#define MLKEM512_DK 1632
#define MLKEM512_CT 768

#define MLKEM768_EK 1184
#define MLKEM768_DK 2400
#define MLKEM768_CT 1088

#define MLKEM1024_EK 1568
#define MLKEM1024_DK 3168
#define MLKEM1024_CT 1568

#define MLKEM_SS 32          /* shared secret, level-independent */

/* Coins drawn from the seam: keygen = d || z (2*32), encaps = m (32). */
#define MLKEM_KEYGEN_COINS 64
#define MLKEM_ENCAPS_COINS 32

#define WC_EBADPARAM (-1)
#define WC_ERNGUNDERFLOW (-2)

/* ── Vendored mlkem-native derandomized entry points (namespaced per level) ───
 * Defined by csrc/mlkem/mlkem{512,768,1024}.c (the multilevel build). Without a
 * context parameter, the signatures are the plain FIPS-203 derandomized forms.
 * All return 0 on success. */
extern int mlkem512_keypair_derand(uint8_t *pk, uint8_t *sk, const uint8_t *coins);
extern int mlkem512_enc_derand(uint8_t *ct, uint8_t *ss, const uint8_t *pk, const uint8_t *coins);
extern int mlkem512_dec(uint8_t *ss, const uint8_t *ct, const uint8_t *sk);

extern int mlkem768_keypair_derand(uint8_t *pk, uint8_t *sk, const uint8_t *coins);
extern int mlkem768_enc_derand(uint8_t *ct, uint8_t *ss, const uint8_t *pk, const uint8_t *coins);
extern int mlkem768_dec(uint8_t *ss, const uint8_t *ct, const uint8_t *sk);

extern int mlkem1024_keypair_derand(uint8_t *pk, uint8_t *sk, const uint8_t *coins);
extern int mlkem1024_enc_derand(uint8_t *ct, uint8_t *ss, const uint8_t *pk, const uint8_t *coins);
extern int mlkem1024_dec(uint8_t *ss, const uint8_t *ct, const uint8_t *sk);

/* ── ML-KEM ABI (frozen names/signatures — do NOT rename) ─────────────────────
 *
 * keygen / encaps consume staged entropy: the host stages the deterministic
 * coins via rng_stage() first; we drain exactly the needed count through the
 * seam's randombytes() into a stack buffer, then call the derandomized vendor
 * API. rng_underflowed() guards against an under-staged vector (the seam
 * zero-fills + sets the sticky flag) so we never silently KAT-pass on zeros. */

__attribute__((used))
int mlkem_keygen(int ps, uint8_t* pkPtr, uint8_t* skPtr) {
    uint8_t coins[MLKEM_KEYGEN_COINS];
    randombytes(coins, MLKEM_KEYGEN_COINS);
    if (rng_underflowed()) {
        return WC_ERNGUNDERFLOW;
    }
    switch (ps) {
        case 0: return mlkem512_keypair_derand(pkPtr, skPtr, coins);
        case 1: return mlkem768_keypair_derand(pkPtr, skPtr, coins);
        case 2: return mlkem1024_keypair_derand(pkPtr, skPtr, coins);
        default: return WC_EBADPARAM;
    }
}

__attribute__((used))
int mlkem_encaps(int ps, const uint8_t* pkPtr, uint8_t* ctPtr, uint8_t* ssPtr) {
    uint8_t coins[MLKEM_ENCAPS_COINS];
    randombytes(coins, MLKEM_ENCAPS_COINS);
    if (rng_underflowed()) {
        return WC_ERNGUNDERFLOW;
    }
    switch (ps) {
        case 0: return mlkem512_enc_derand(ctPtr, ssPtr, pkPtr, coins);
        case 1: return mlkem768_enc_derand(ctPtr, ssPtr, pkPtr, coins);
        case 2: return mlkem1024_enc_derand(ctPtr, ssPtr, pkPtr, coins);
        default: return WC_EBADPARAM;
    }
}

__attribute__((used))
int mlkem_decaps(int ps, const uint8_t* skPtr, const uint8_t* ctPtr, uint8_t* ssPtr) {
    switch (ps) {
        case 0: return mlkem512_dec(ssPtr, ctPtr, skPtr);
        case 1: return mlkem768_dec(ssPtr, ctPtr, skPtr);
        case 2: return mlkem1024_dec(ssPtr, ctPtr, skPtr);
        default: return WC_EBADPARAM;
    }
}

/* ── Host staging ABI ─────────────────────────────────────────────────────────
 * The seam (csrc/rng/rng.c) already defines `rng_stage(const uint8_t*, uint32_t)`
 * and `rng_reset(void)` with exactly the wasm host ABI we need: on wasm32 a
 * pointer IS an i32, so `srcPtr` arrives as the linear-memory offset and no
 * conversion wrapper is required. The builder exports both directly via the
 * target's `exports` list (`-Wl,--export=rng_stage`/`rng_reset`). We therefore
 * do NOT add `export_name`-renamed wrappers here — a wrapper named "rng_stage"
 * would collide with the seam's own exported `rng_stage` symbol (duplicate
 * export). The host stages d||z (keygen) / m (encaps) through these before the
 * matching KEM call; see the determinism contract in the header comment.
 * (rng_stage/rng_reset are declared in csrc/rng/rng.h, included above.) */
