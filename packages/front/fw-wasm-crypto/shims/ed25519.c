/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * ed25519.c — own-layer C23 ABI shim for Ed25519 over the vendored libsodium
 * ref10 implementation (tools/BATCH_26/02, W6 bascule).
 *
 * Frozen ABI source-of-truth (fw/BATCH_11/17 — verbatim sigs from shims/sodium.c):
 *   ed25519_keypair(seedPtr, pkPtr, skPtr)            -> i32  (0 = ok)
 *   ed25519_sign(skPtr, msgPtr, msgLen, sigPtr)       -> i32  (0 = ok, sig = 64B detached)
 *   ed25519_verify(pkPtr, sigPtr, msgPtr, msgLen)     -> i32  (0 = valid)
 *   + memory / alloc / free  (the package arena, _arena.h)
 *   + rng_stage / rng_reset  (the csrc/rng staged-entropy seam, exported directly
 *                             via the targets.json `exports` list — NO export_name
 *                             wrapper, which would duplicate the wasm export).
 *
 * No crypto is reimplemented: every export forwards to the audited libsodium
 * ref10 reference primitives (`crypto_sign_ed25519_*`), compiled as separate
 * translation units (vendor/libsodium/crypto_sign/ed25519/ref10/{keypair,sign,
 * open}.c + crypto_core/ed25519/ref10/ed25519_ref10.c). The non-freestanding
 * surface (SHA-512, randombytes, sodium utils) is resolved by the package-local
 * compat include dir placed AHEAD on -I (csrc/libsodium-compat) and the seam TUs
 * (sodium_sha512_seam.c, sodium_util_seam.c, csrc/sha2/sha2.c, csrc/rng/rng.c).
 *
 * The frozen ed25519_keypair is SEED-EXPLICIT: it derives pk/sk deterministically
 * from the caller-supplied 32-byte seed via crypto_sign_ed25519_seed_keypair (it
 * does NOT draw entropy from the rng seam — that differs from the spike's
 * keypair.c/randombytes path). The rng seam is still exported so a host CAN stage
 * entropy for other consumers, but this export binds to the explicit seed.
 *
 * Zero imports; no global ctor; no <stdbit.h>; abort -> __builtin_trap.
 */

#include "_arena.h"        /* 16 MiB arena: memory/alloc/free exports */
#include "csrc/rng/rng.h"  /* rng_stage/rng_reset exported via the --export list */

/* ── libsodium ed25519 ref10 entry points (no <sodium.h> in the shim) ────────
 * Declared here exactly as shims/sodium.c does; defined in the vendored TUs
 * vendor/libsodium/crypto_sign/ed25519/ref10/{keypair,sign,open}.c. */
extern int crypto_sign_ed25519_seed_keypair(uint8_t* pk, uint8_t* sk, const uint8_t* seed);
extern int crypto_sign_ed25519_detached(
    uint8_t* sig, unsigned long long* siglen_p,
    const uint8_t* m, unsigned long long mlen, const uint8_t* sk);
extern int crypto_sign_ed25519_verify_detached(
    const uint8_t* sig, const uint8_t* m, unsigned long long mlen, const uint8_t* pk);

/* ── Ed25519 ABI surface (frozen 3-export ABI) ──────────────────────────────── */

__attribute__((used))
int ed25519_keypair(const uint8_t* seedPtr, uint8_t* pkPtr, uint8_t* skPtr) {
    /* Seed-explicit derivation: sk = seed(32) || pk(32), pk(32). */
    return crypto_sign_ed25519_seed_keypair(pkPtr, skPtr, seedPtr);
}

__attribute__((used))
int ed25519_sign(const uint8_t* skPtr, const uint8_t* msgPtr, int msgLen,
                 uint8_t* sigPtr) {
    unsigned long long siglen = 0;
    return crypto_sign_ed25519_detached(
        sigPtr, &siglen, msgPtr, (unsigned long long)msgLen, skPtr);
}

__attribute__((used))
int ed25519_verify(const uint8_t* pkPtr, const uint8_t* sigPtr,
                   const uint8_t* msgPtr, int msgLen) {
    return crypto_sign_ed25519_verify_detached(
        sigPtr, msgPtr, (unsigned long long)msgLen, pkPtr);
}
