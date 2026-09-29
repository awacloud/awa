/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * blake2b.c — frozen wasm-crypto `blake2b(...)` 8-arg ABI over the OWN C23
 * RFC 7693 BLAKE2b core (csrc/blake2/), replacing the BLAKE2-ref-backed def
 * that lived in shims/hashes.c.
 *
 * Frozen ABI (source-of-truth: ai/batches/types/fw/BATCH_11/07-wasm-blake2b.md,
 * previously mirrored by shims/hashes.c):
 *   memory                                          (linker-exported)
 *   alloc(n) -> ptr                                 (shared arena, _arena.h)
 *   free(ptr, n) -> void                            (shared arena, _arena.h)
 *   blake2b(inPtr, inLen, keyPtr, keyLen,
 *           saltPtr, personalPtr, outPtr, outLen) -> i32
 *     validates outLen ∈ [1,64] and keyLen ∈ [0,64]; threads salt/personal
 *     into the 64-byte parameter block; the keyed path absorbs a zero-padded
 *     128-byte first block holding the key. Returns 0 on OK, -1 on bad params.
 *     This reproduces the prior hashes.c semantics EXACTLY, but over the own
 *     csrc/blake2 core (the same core argon2 — task 09 — consumes).
 *
 * Freestanding wasm32: zero imports, no libc, no global ctor. The compression
 * core (csrc/blake2/) is straight-line / branch-free; the in-engine CT proof
 * is the CT-fuzz job.
 */

#include "_arena.h"
#include "csrc/blake2/blake2b.h"

#define WC_EBADPARAM (-1)

static void wc_memcpy(uint8_t* d, const uint8_t* s, size_t n) {
    for (size_t i = 0; i < n; i++) d[i] = s[i];
}
static void wc_memzero(uint8_t* d, size_t n) {
    for (size_t i = 0; i < n; i++) d[i] = 0;
}

__attribute__((used))
int blake2b(const uint8_t* inPtr, int inLen,
            const uint8_t* keyPtr, int keyLen,
            const uint8_t* saltPtr, const uint8_t* personalPtr,
            uint8_t* outPtr, int outLen) {
    if (outLen <= 0 || outLen > 64 || keyLen < 0 || keyLen > 64) {
        return WC_EBADPARAM;
    }

    blake2b_param P;
    wc_memzero((uint8_t*)&P, sizeof(P));
    P.digest_length = (uint8_t)outLen;
    P.key_length    = (uint8_t)keyLen;
    P.fanout        = 1;
    P.depth         = 1;
    if (saltPtr)     wc_memcpy(P.salt, saltPtr, 16);
    if (personalPtr) wc_memcpy(P.personal, personalPtr, 16);

    blake2b_ctx S;
    int rc = blake2b_init_param(&S, &P);
    if (rc != 0) return rc;

    /* Keyed BLAKE2b: the first block is the zero-padded key. */
    if (keyLen > 0) {
        uint8_t block[128];
        wc_memzero(block, sizeof(block));
        wc_memcpy(block, keyPtr, (size_t)keyLen);
        blake2b_update(&S, block, sizeof(block));
        wc_memzero(block, sizeof(block));
    }

    if (inLen > 0) {
        blake2b_update(&S, inPtr, (size_t)inLen);
    }

    blake2b_final(&S, outPtr);
    return 0;
}
