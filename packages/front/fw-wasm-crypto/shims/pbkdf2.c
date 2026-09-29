/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * pbkdf2.c — frozen wasm-crypto `pbkdf2(hashId, …)` ABI over the OWN C23
 * PBKDF2 core (csrc/pbkdf2/), itself over the own HMAC core (csrc/hmac/,
 * task 06), itself over the own SHA-2 core (csrc/sha2/, task 02), replacing
 * the BearSSL-backed definition in shims/bearssl.c.
 *
 * Frozen ABI (source-of-truth: ai/batches/types/fw/BATCH_11/12-wasm-pbkdf2.md,
 * previously mirrored by shims/bearssl.c):
 *   memory                                              (linker-exported)
 *   alloc(n) -> ptr                                     (shared arena, _arena.h)
 *   free(ptr, n) -> void                                (shared arena, _arena.h)
 *   pbkdf2(hashId, pwdPtr, pwdLen,
 *           saltPtr, saltLen, iters,
 *           outPtr, outLen) -> i32
 *     hashId 256 → PBKDF2-HMAC-SHA-256,
 *            384 → PBKDF2-HMAC-SHA-384,
 *            512 → PBKDF2-HMAC-SHA-512.
 *     Returns 0 on success; WC_EBADPARAM (-1) for a bad hashId, iters <= 0,
 *     or outLen <= 0. Mirrors the validation from shims/bearssl.c's pbkdf2().
 *     pwdLen == 0 / saltLen == 0 are valid (RFC 8018 allows them).
 *
 * Freestanding wasm32: zero imports, no libc, no global ctor. The PBKDF2 core
 * (csrc/pbkdf2/) is a thin RFC 8018 §5.2 F-function (U_1..U_c XOR) + block
 * counter wrapper over the own HMAC core (csrc/hmac/); neither HMAC nor SHA-2
 * is re-implemented here. The framing is straight-line over the public hashId;
 * the in-engine CT proof is the CT-fuzz job — this shim does NOT self-attest CT.
 */

#include "_arena.h"
#include "csrc/pbkdf2/pbkdf2.h"

#define WC_EBADPARAM (-1)

__attribute__((used))
int pbkdf2(int hashId, const uint8_t* pwdPtr, int pwdLen,
           const uint8_t* saltPtr, int saltLen, int iters,
           uint8_t* outPtr, int outLen) {
    /* Mirror the bearssl.c validation: !vt || iters <= 0 || outLen <= 0. */
    const size_t hLen = hmac_digest_size(hashId);
    if (hLen == 0 || iters <= 0 || outLen <= 0) return WC_EBADPARAM;

    return pbkdf2_derive(hashId,
                         pwdPtr, (size_t)(pwdLen < 0 ? 0 : pwdLen),
                         saltPtr, (size_t)(saltLen < 0 ? 0 : saltLen),
                         iters,
                         outPtr, (size_t)outLen);
}
