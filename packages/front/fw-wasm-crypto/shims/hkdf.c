/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * hkdf.c — frozen wasm-crypto `hkdf(hashId, …)` ABI over the OWN C23 HKDF
 * core (csrc/hkdf/), itself over the own HMAC core (csrc/hmac/, task 06),
 * itself over the own SHA-2 core (csrc/sha2/, task 02), replacing the
 * BearSSL-backed definition in shims/bearssl.c.
 *
 * Frozen ABI (source-of-truth: ai/batches/types/fw/BATCH_11/13-wasm-hkdf.md,
 * previously mirrored by shims/bearssl.c):
 *   memory                                         (linker-exported)
 *   alloc(n) -> ptr                                (shared arena, _arena.h)
 *   free(ptr, n) -> void                           (shared arena, _arena.h)
 *   hkdf(hashId, ikmPtr, ikmLen,
 *        saltPtr, saltLen,
 *        infoPtr, infoLen,
 *        outPtr, outLen) -> i32
 *     hashId 256 → HKDF-SHA-256, 384 → HKDF-SHA-384, 512 → HKDF-SHA-512.
 *     Returns 0 on success; WC_EBADPARAM (-1) for a bad hashId or outLen that
 *     exceeds 255*HashLen; WC_EFAIL (-2) if the expand step produces fewer
 *     bytes than requested (should not occur with a conforming implementation
 *     but matches the prior bearssl.c error contract).
 *     ikmLen==0 / saltLen==0 / infoLen==0 are valid (RFC 5869 allows them).
 *
 * Freestanding wasm32: zero imports, no libc, no global ctor. The HKDF core
 * (csrc/hkdf/) is a thin RFC 5869 extract/expand wrapper over the own HMAC
 * core (csrc/hmac/); neither HMAC nor SHA-2 is re-implemented here. The
 * framing is straight-line over the public hashId; the in-engine CT proof is
 * the CT-fuzz job — this shim does NOT self-attest CT.
 */

#include "_arena.h"
#include "csrc/hkdf/hkdf.h"

#define WC_EBADPARAM (-1)
#define WC_EFAIL     (-2)

__attribute__((used))
int hkdf(int hashId, const uint8_t* ikmPtr, int ikmLen,
         const uint8_t* saltPtr, int saltLen,
         const uint8_t* infoPtr, int infoLen,
         uint8_t* outPtr, int outLen) {
    /* Validate before calling into the core. */
    if (ikmLen < 0 || saltLen < 0 || infoLen < 0 || outLen <= 0) return WC_EBADPARAM;

    const size_t hashLen = hmac_digest_size(hashId);
    if (hashLen == 0) return WC_EBADPARAM;
    /* RFC 5869 §2.3: outLen must be <= 255 * HashLen. */
    if ((size_t)outLen > 255u * hashLen) return WC_EBADPARAM;

    /* Step 1: Extract — PRK = HMAC(salt, IKM). */
    uint8_t prk[HMAC_MAX_DIGEST];
    int rc = hkdf_extract(hashId,
                          saltLen > 0 ? saltPtr : (const uint8_t*)0,
                          (size_t)saltLen,
                          ikmPtr, (size_t)ikmLen,
                          prk);
    if (rc != 0) return WC_EBADPARAM;

    /* Step 2: Expand — OKM = T(1) ∥ T(2) ∥ … truncated to outLen. */
    rc = hkdf_expand(hashId,
                     prk,
                     infoLen > 0 ? infoPtr : (const uint8_t*)0,
                     (size_t)infoLen,
                     outPtr, (size_t)outLen);
    return (rc == 0) ? 0 : WC_EFAIL;
}
