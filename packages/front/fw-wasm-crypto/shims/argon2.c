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
 * This shim marshals the (ptr,len) buffers from linear memory, bump-allocates
 * the m'-block Argon2 memory matrix from the shared arena (`_arena.h`), and
 * calls the own `argon2id_core`. The arena ceiling (WASM_CRYPTO_ARENA_BYTES,
 * 16 MiB default, host-set) bounds m_cost: a matrix of m' KiB that exceeds the
 * arena makes `alloc` return NULL and this shim returns an error — it does NOT
 * silently cap m_cost.
 */

#include "_arena.h"
#include "csrc/argon2/argon2.h"

/* RFC 9106: blocks are 1024 bytes; m' = 4·p·⌊m/(4p)⌋ blocks. */

/*
 * argon2id_hash — frozen ABI adapter onto the own `argon2id_core`.
 *
 * @returns 0 (ARGON2_OK) on success; a negative error code on bad parameters
 *          (ARGON2_ERR_PARAM) or arena exhaustion (ARGON2_ERR_MEMORY). Non-zero
 *          ⇒ failure, per the BATCH_11 ABI contract.
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
    if (um < 8u * up) return ARGON2_ERR_PARAM;

    /* m' = 4·p·⌊m/(4p)⌋ — the same derivation the core re-checks. */
    uint32_t segment_length = um / (4u * up);
    uint32_t mprime = segment_length * 4u * up;
    if (mprime == 0) return ARGON2_ERR_PARAM;

    /* Allocate the block matrix from the arena (1024 bytes/block). */
    uint64_t bytes64 = (uint64_t)mprime * ARGON2_BLOCK_SIZE;
    if (bytes64 > 0x7fffffffULL) return ARGON2_ERR_MEMORY; /* > INT_MAX */
    uint8_t* mem = (uint8_t*)alloc((int)bytes64);
    if (mem == (uint8_t*)0) return ARGON2_ERR_MEMORY;      /* arena ceiling */

    int rc = argon2id_core(
        pwdPtr,    (uint32_t)pwdLen,
        saltPtr,   (uint32_t)saltLen,
        (secretLen > 0) ? secretPtr : (const uint8_t*)0, (uint32_t)secretLen,
        (adLen > 0) ? adPtr : (const uint8_t*)0,         (uint32_t)adLen,
        (uint32_t)t, um, up,
        outPtr, (uint32_t)outLen,
        mem, mprime);

    free(mem, (int)bytes64);
    return rc;
}
