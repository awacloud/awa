/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * sha3.c — frozen wasm-crypto `sha3(variantId, …)` ABI over the OWN C23
 * Keccak-f[1600] sponge (csrc/sha3/), replacing the XKCP-backed def that lived
 * in shims/hashes.c.
 *
 * Frozen ABI (source-of-truth: ai/batches/types/fw/BATCH_11/06-wasm-sha3.md,
 * previously mirrored by shims/hashes.c):
 *   memory                                  (linker-exported)
 *   alloc(n) -> ptr                         (shared arena, _arena.h)
 *   free(ptr, n) -> void                    (shared arena, _arena.h)
 *   sha3(variantId, inPtr, inLen, outPtr, outLen) -> i32
 *     variantId enum (FIPS 202):
 *       0 SHA3-224  1 SHA3-256  2 SHA3-384  3 SHA3-512
 *       4 SHAKE128  5 SHAKE256
 *     Fixed-output variants (0..3) ignore the caller `outLen` (digest size is
 *     implied: 28/32/48/64). SHAKE variants (4/5) emit exactly `outLen` bytes.
 *     Returns 0 on OK, WC_EBADPARAM (-1) for an unknown variantId. inLen==0 is
 *     the valid empty-message hash. Matches the prior hashes.c semantics.
 *
 * Freestanding wasm32: zero imports, no libc, no global ctor. The sponge core
 * (csrc/sha3/) is straight-line / branch-free; the in-engine CT proof is the
 * CT-fuzz job.
 */

#include "_arena.h"
#include "csrc/sha3/sha3.h"

#define WC_EBADPARAM (-1)

__attribute__((used))
int sha3(int variantId, const uint8_t* inPtr, int inLen,
         uint8_t* outPtr, int outLen) {
    if (inLen < 0) return WC_EBADPARAM;
    size_t n = (size_t) inLen;
    switch (variantId) {
        case 0:
            sha3_hash(SHA3_224_RATE, inPtr, n, outPtr, SHA3_224_DIGEST);
            return 0;
        case 1:
            sha3_hash(SHA3_256_RATE, inPtr, n, outPtr, SHA3_256_DIGEST);
            return 0;
        case 2:
            sha3_hash(SHA3_384_RATE, inPtr, n, outPtr, SHA3_384_DIGEST);
            return 0;
        case 3:
            sha3_hash(SHA3_512_RATE, inPtr, n, outPtr, SHA3_512_DIGEST);
            return 0;
        case 4:
            if (outLen < 0) return WC_EBADPARAM;
            shake_xof(SHAKE128_RATE, inPtr, n, outPtr, (size_t) outLen);
            return 0;
        case 5:
            if (outLen < 0) return WC_EBADPARAM;
            shake_xof(SHAKE256_RATE, inPtr, n, outPtr, (size_t) outLen);
            return 0;
        default:
            return WC_EBADPARAM;
    }
}
