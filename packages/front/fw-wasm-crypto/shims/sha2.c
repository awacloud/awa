/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * sha2.c — frozen wasm-crypto `sha2(variantId, …)` ABI over the OWN C23
 * SHA-2 core (csrc/sha2/), replacing the BearSSL-backed def in shims/bearssl.c.
 *
 * Frozen ABI (source-of-truth: ai/batches/types/fw/BATCH_11/10-wasm-sha2.md,
 * previously mirrored by shims/bearssl.c):
 *   memory                         (linker-exported)
 *   alloc(n) -> ptr                (shared arena, _arena.h)
 *   free(ptr, n) -> void           (shared arena, _arena.h)
 *   sha2(variantId, inPtr, inLen, outPtr) -> i32
 *     variantId 256 → SHA-256 (32B), 384 → SHA-384 (48B), 512 → SHA-512 (64B);
 *     returns 0 on OK, WC_EBADPARAM (-1) for a bad variantId. inLen==0 is the
 *     empty-message hash (valid). Matches the prior bearssl.c semantics.
 *
 * Freestanding wasm32: zero imports, no libc, no global ctor. The streaming
 * core (the sha256_ / sha384_ / sha512_ families) is the shared csrc lib
 * consumed by the HMAC/HKDF/PBKDF2 shims (tasks 06/07/08). The compression is
 * straight-line / branch-free; the in-engine CT proof is the CT-fuzz job.
 */

#include "_arena.h"
#include "csrc/sha2/sha2.h"

#define WC_EBADPARAM (-1)

__attribute__((used))
int sha2(int variantId, const uint8_t* inPtr, int inLen, uint8_t* outPtr) {
    if (inLen < 0) return WC_EBADPARAM;
    size_t n = (size_t) inLen;
    switch (variantId) {
        case 256: {
            sha256_ctx ctx;
            sha256_init(&ctx);
            if (inLen > 0) sha256_update(&ctx, inPtr, n);
            sha256_final(&ctx, outPtr);
            return 0;
        }
        case 384: {
            sha512_ctx ctx;
            sha384_init(&ctx);
            if (inLen > 0) sha512_update(&ctx, inPtr, n);
            sha384_final(&ctx, outPtr);
            return 0;
        }
        case 512: {
            sha512_ctx ctx;
            sha512_init(&ctx);
            if (inLen > 0) sha512_update(&ctx, inPtr, n);
            sha512_final(&ctx, outPtr);
            return 0;
        }
        default:
            return WC_EBADPARAM;
    }
}
