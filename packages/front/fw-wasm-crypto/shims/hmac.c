/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * hmac.c — frozen wasm-crypto `hmac(hashId, …)` ABI over the OWN C23 HMAC
 * core (csrc/hmac/), itself over the own SHA-2 core (csrc/sha2/), replacing
 * the BearSSL-backed def in shims/bearssl.c.
 *
 * Frozen ABI (source-of-truth: ai/batches/types/fw/BATCH_11/11-wasm-hmac.md,
 * previously mirrored by shims/bearssl.c):
 *   memory                                         (linker-exported)
 *   alloc(n) -> ptr                                (shared arena, _arena.h)
 *   free(ptr, n) -> void                           (shared arena, _arena.h)
 *   hmac(hashId, keyPtr, keyLen, msgPtr, msgLen, outPtr) -> i32
 *     hashId 256 → HMAC-SHA-256 (32B), 384 → HMAC-SHA-384 (48B),
 *     512 → HMAC-SHA-512 (64B); writes the FULL digest (digest size for the
 *     hashId) to outPtr. Returns 0 on OK, WC_EBADPARAM (-1) for a bad hashId.
 *     keyLen==0 / msgLen==0 are valid. Matches the prior bearssl.c semantics.
 *
 * Freestanding wasm32: zero imports, no libc, no global ctor. The HMAC core
 * (csrc/hmac/) is the shared csrc lib consumed by the HKDF/PBKDF2 shims
 * (tasks 07/08); it READS the own SHA-2 core read-only and re-implements
 * neither. The framing is straight-line over the public hashId; the in-engine
 * CT proof is the CT-fuzz job — this shim does NOT self-attest CT.
 */

#include "_arena.h"
#include "csrc/hmac/hmac.h"

#define WC_EBADPARAM (-1)

__attribute__((used))
int hmac(int hashId, const uint8_t* keyPtr, int keyLen,
         const uint8_t* msgPtr, int msgLen, uint8_t* outPtr) {
    if (keyLen < 0 || msgLen < 0) return WC_EBADPARAM;
    if (hmac_digest_size(hashId) == 0) return WC_EBADPARAM;
    return hmac_oneshot(hashId, keyPtr, (size_t)keyLen,
                        msgPtr, (size_t)msgLen, outPtr);
}
