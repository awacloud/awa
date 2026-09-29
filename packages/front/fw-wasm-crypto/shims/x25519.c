/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * x25519.c — own-layer C23 ABI shim for X25519 over the vendored libsodium
 * curve25519 ref10 implementation (tools/BATCH_26/03, W6 bascule).
 *
 * Frozen ABI source-of-truth (fw/BATCH_11/18 — verbatim sigs from shims/sodium.c):
 *   x25519_base(skPtr, pkPtr)          -> i32  (0 = ok, pk = X25519(sk, basepoint 9))
 *   x25519(skPtr, pkPtr, outPtr)       -> i32  (non-zero if the shared secret is
 *                                               all-zero / a low-order point)
 *   + memory / alloc / free  (the package arena, _arena.h)
 *
 * X25519 has no keygen, so there is NO rng seam here (no rng_stage/rng_reset
 * export, no csrc/rng/rng.c, no sodium_sha512_seam.c — SHA-512 is unused).
 *
 * No crypto is reimplemented: every export forwards to the audited libsodium
 * curve25519 ref10 reference primitives, compiled as separate translation units
 * (vendor/libsodium/crypto_scalarmult/curve25519/ref10/x25519_ref10.c +
 * crypto_core/ed25519/ref10/ed25519_ref10.c for the shared fe25519 field
 * arithmetic). The non-freestanding sodium_* utility surface is resolved by the
 * package-local compat include dir placed AHEAD on -I (csrc/libsodium-compat) and
 * the seam TU (csrc/libsodium-compat/sodium_util_seam.c).
 *
 * Dispatcher-drop / impl-struct-direct (FINDINGS §4/carried note 2): we do NOT
 * forward to crypto_scalarmult_curve25519* (the runtime dispatcher in
 * scalarmult_curve25519.c needs sodium_runtime_has_avx / runtime.h — not
 * freestanding). Instead we call the ref10 implementation struct's
 * .mult / .mult_base function pointers directly.
 *
 * Zero imports; no global ctor; abort -> __builtin_trap.
 */

#include "_arena.h"   /* 16 MiB arena: memory/alloc/free exports */

/* ── curve25519 ref10 implementation struct (no <sodium.h> in the shim) ──────
 * Defined in vendor/libsodium/crypto_scalarmult/curve25519/ref10/x25519_ref10.c.
 * We call through .mult / .mult_base rather than the runtime-dispatching
 * scalarmult_curve25519.c (which needs sodium_runtime_* — not freestanding). */
struct crypto_scalarmult_curve25519_implementation {
    int (*mult)(unsigned char* q, const unsigned char* n, const unsigned char* p);
    int (*mult_base)(unsigned char* q, const unsigned char* n);
};
extern struct crypto_scalarmult_curve25519_implementation
    crypto_scalarmult_curve25519_ref10_implementation;

/* ── X25519 ABI surface (frozen 2-export ABI) ───────────────────────────────── */

__attribute__((used))
int x25519_base(const uint8_t* skPtr, uint8_t* pkPtr) {
    /* pk = X25519(sk, basepoint 9). */
    return crypto_scalarmult_curve25519_ref10_implementation.mult_base(pkPtr, skPtr);
}

__attribute__((used))
int x25519(const uint8_t* skPtr, const uint8_t* pkPtr, uint8_t* outPtr) {
    /* libsodium returns -1 when the peer point is small-order (shared secret
     * all-zero); the ABI contract requires non-zero in that case — pass through. */
    return crypto_scalarmult_curve25519_ref10_implementation.mult(outPtr, skPtr, pkPtr);
}
