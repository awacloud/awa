/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * argon2.c — Argon2id ABI adapter over the OWN C23 Argon2id core
 * (csrc/argon2/, RFC 9106) which itself runs over the OWN BLAKE2b lib
 * (csrc/blake2/, task 04). Retargeted off the vendored P-H-C reference to
 * `sourceKind:"own"`.
 *
 * ABI source-of-truth: ai/batches/types/fw/BATCH_11/02-wasm-argon2.md
 *   Frozen WASM ABI (preserved VERBATIM):
 *     argon2id_hash(pwdPtr, pwdLen, saltPtr, saltLen, secretPtr, secretLen,
 *                   adPtr, adLen, t, m, p, outPtr, outLen) -> i32  (0 = OK)
 *     + memory / alloc / free.
 *
 * This shim marshals the (ptr,len) buffers from linear memory and calls the
 * own `argon2id_core` over an m'-block matrix taken from linear memory GROWN
 * for the call (BL-1843, tools/LIGHT_62):
 *
 *   - The host's small buffers (password, salt, secret, ad, tag) keep coming
 *     from the shared bump arena (`_arena.h`, 16 MiB static). The matrix does
 *     NOT: it lives in a region past the module's initial memory, obtained
 *     with `memory.grow` (`__builtin_wasm_memory_grow`) the first time a call
 *     needs it and extended in place when a later call needs more. A smaller
 *     call reuses the region as is. The arena is therefore never inflated, so
 *     a page that loads this module pays for the matrix only when it hashes.
 *   - Linear memory never shrinks: the grown region stays allocated until the
 *     module instance is dropped (by design of wasm32 memory). It is zeroed
 *     after every call so no password-derived block outlives the call.
 *   - Explicit ceiling: `m` above ARGON2_MAX_MEMORY_KIB (1 GiB, under the
 *     4 GiB wasm32 limit and the browsers' practical limit) is refused up
 *     front with ARGON2_ERR_PARAM, before any growth. A `memory.grow` the
 *     engine refuses below the ceiling returns ARGON2_ERR_MEMORY. m_cost is
 *     never silently capped.
 */

#include "_arena.h"
#include "csrc/argon2/argon2.h"

/* RFC 9106: blocks are 1024 bytes; m' = 4·p·⌊m/(4p)⌋ blocks. */

/* The largest memory cost `m` (KiB) this binary accepts: 1 GiB. */
#define ARGON2_MAX_MEMORY_KIB (1024u * 1024u)

/* A wasm32 linear-memory page. */
#define A2_WASM_PAGE 65536u

/* The grown matrix region: [a2_region_base, a2_region_base + a2_region_bytes).
 * Zero bytes = not grown yet. Only this shim grows memory (no libc, no other
 * allocator), so after the first growth the region sits at the top of linear
 * memory and a larger call extends it in place. */
static uintptr_t a2_region_base = 0;
static size_t    a2_region_bytes = 0;

/*
 * Return a matrix of at least `bytes` bytes from the grown region, growing
 * linear memory when the region is too small; NULL when the engine refuses
 * the growth (the region is left as it was).
 */
static uint8_t* a2_matrix(size_t bytes) {
    if (bytes <= a2_region_bytes) {
        return (uint8_t*)a2_region_base;
    }
    uintptr_t top = (uintptr_t)__builtin_wasm_memory_size(0) * A2_WASM_PAGE;
    uintptr_t base;
    size_t missing;
    if (a2_region_bytes != 0 && a2_region_base + a2_region_bytes == top) {
        base = a2_region_base;               /* extend the region in place */
        missing = bytes - a2_region_bytes;
    } else {
        base = top;                          /* first growth: start at the top */
        missing = bytes;
    }
    size_t pages = (missing + (A2_WASM_PAGE - 1u)) / A2_WASM_PAGE;
    size_t old = __builtin_wasm_memory_grow(0, pages);
    if (old == (size_t)-1) {
        return (uint8_t*)0;
    }
    a2_region_base = base;
    a2_region_bytes = (size_t)(((uintptr_t)old + pages) * A2_WASM_PAGE - base);
    return (uint8_t*)base;
}

/* Zero `bytes` bytes of the matrix (word-wise; the region is page-aligned). */
static void a2_wipe(uint8_t* mem, size_t bytes) {
    volatile uint64_t* w = (volatile uint64_t*)mem;
    for (size_t i = 0; i < bytes / 8u; i++) {
        w[i] = 0;
    }
}

/*
 * argon2id_hash — frozen ABI adapter onto the own `argon2id_core`.
 *
 * @returns 0 (ARGON2_OK) on success; a negative error code on bad parameters,
 *          `m` above ARGON2_MAX_MEMORY_KIB included (ARGON2_ERR_PARAM), or a
 *          refused memory growth (ARGON2_ERR_MEMORY). Non-zero ⇒ failure, per
 *          the BATCH_11 ABI contract.
 */
__attribute__((used))
int argon2id_hash(
    const uint8_t* pwdPtr,    int pwdLen,
    const uint8_t* saltPtr,   int saltLen,
    const uint8_t* secretPtr, int secretLen,
    const uint8_t* adPtr,     int adLen,
    int t, int m, int p,
    uint8_t* outPtr, int outLen)
{
    if (t <= 0 || m <= 0 || p <= 0 || outLen < 4) return ARGON2_ERR_PARAM;
    if (pwdLen < 0 || saltLen < 0 || secretLen < 0 || adLen < 0)
        return ARGON2_ERR_PARAM;

    uint32_t up = (uint32_t)p;
    uint32_t um = (uint32_t)m;
    /* The documented ceiling, checked before any growth. */
    if (um > ARGON2_MAX_MEMORY_KIB) return ARGON2_ERR_PARAM;
    /* m ≥ 8·p, written as p ≤ ⌊m/8⌋ so a large p cannot overflow 8·p. */
    if (up > um / 8u) return ARGON2_ERR_PARAM;

    /* m' = 4·p·⌊m/(4p)⌋ — the same derivation the core re-checks. */
    uint32_t segment_length = um / (4u * up);
    uint32_t mprime = segment_length * 4u * up;
    if (mprime == 0) return ARGON2_ERR_PARAM;

    /* The block matrix (1024 bytes/block, ≤ 1 GiB) from the grown region. */
    size_t bytes = (size_t)mprime * ARGON2_BLOCK_SIZE;
    uint8_t* mem = a2_matrix(bytes);
    if (mem == (uint8_t*)0) return ARGON2_ERR_MEMORY;      /* growth refused */

    int rc = argon2id_core(
        pwdPtr,    (uint32_t)pwdLen,
        saltPtr,   (uint32_t)saltLen,
        (secretLen > 0) ? secretPtr : (const uint8_t*)0, (uint32_t)secretLen,
        (adLen > 0) ? adPtr : (const uint8_t*)0,         (uint32_t)adLen,
        (uint32_t)t, um, up,
        outPtr, (uint32_t)outLen,
        mem, mprime);

    a2_wipe(mem, bytes);
    return rc;
}
