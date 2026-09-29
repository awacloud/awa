/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * argon2.h — RFC 9106 Argon2id core (C23, freestanding wasm32) over the OWN
 * BLAKE2b lib (csrc/blake2/, task 04).
 *
 * Argon2id is the one mandatory RFC 9106 variant: data-INDEPENDENT addressing
 * for the first half of pass 0 (Argon2i-style), data-DEPENDENT thereafter
 * (Argon2d-style). This header declares the single freestanding entry point
 * the shim drives; the H0 pre-hash, the m_cost block matrix fill (G
 * compression over 1 KiB blocks), the id-indexing and the H' finalisation all
 * live in argon2.c.
 *
 * The implementation consumes the own BLAKE2b core read-only via
 * `#include "csrc/blake2/blake2b.h"` (its `blake2b_init_param`/`_update`/
 * `_final` streaming API for H0 and the variable-output `blake2b_long`-style
 * long hash H'). BLAKE2b is NOT re-implemented here.
 *
 * Freestanding wasm32: no libc, no <stdbit.h>. Only the freestanding-mandated
 * <stdint.h>/<stddef.h>. C23 language features (constexpr, static_assert) are
 * used freely. No global constructor, no side effects at load.
 *
 * Constant-time posture: the pass-0 first-half addressing is data-independent
 * of password/salt/secret (Argon2i indexing — addresses derive from public
 * counters only). The data-dependent phase (RFC-sanctioned for Argon2id) reads
 * an address from a block word, which is a memory access at a secret-derived
 * index by design. This code does NOT self-attest constant-time — the
 * in-engine CT proof is acvp-wasm-ct-fuzz's job (G2).
 */
#ifndef WASM_CRYPTO_ARGON2_H
#define WASM_CRYPTO_ARGON2_H

#include <stdint.h>
#include <stddef.h>

/* RFC 9106 §3.1: 1024-byte memory blocks; version 0x13 (19). */
constexpr size_t  ARGON2_BLOCK_SIZE   = 1024;        /* bytes per block      */
constexpr size_t  ARGON2_QWORDS       = 128;         /* 64-bit words / block */
constexpr uint32_t ARGON2_VERSION_13  = 0x13;        /* RFC 9106 version     */
constexpr uint32_t ARGON2_TYPE_ID     = 2;           /* y=2 → Argon2id       */
constexpr uint32_t ARGON2_SYNC_POINTS = 4;           /* segments per lane    */
constexpr uint32_t ARGON2_PREHASH_LEN = 64;          /* H0 length            */

/* Return codes (0 = OK; negatives mirror the shim's error contract). */
constexpr int ARGON2_OK            =  0;
constexpr int ARGON2_ERR_PARAM     = -1;   /* invalid t/m/p/outlen          */
constexpr int ARGON2_ERR_MEMORY    = -2;   /* arena allocation failed       */

/*
 * argon2id_core — RFC 9106 Argon2id over a caller-supplied scratch arena.
 *
 * All inputs are (ptr,len) pairs in linear memory; `secret`/`ad` may be NULL
 * with len 0. `t` (passes ≥ 1), `m` (m_cost in KiB ≥ 8·p), `p` (lanes ≥ 1) are
 * the RFC cost parameters. Writes exactly `outlen` (4..) bytes of tag to `out`.
 *
 * `mem` points at a caller-allocated block matrix of `mem_blocks`
 * (= m' = 4·p·⌊m/(4p)⌋) ARGON2_BLOCK_SIZE-byte blocks; it must be large enough
 * or the call returns ARGON2_ERR_PARAM. Returns 0 on success, a negative code
 * otherwise. The shim owns arena allocation and passes the matrix in.
 */
int argon2id_core(
    const uint8_t *pwd,    uint32_t pwdlen,
    const uint8_t *salt,   uint32_t saltlen,
    const uint8_t *secret, uint32_t secretlen,
    const uint8_t *ad,     uint32_t adlen,
    uint32_t t, uint32_t m, uint32_t p,
    uint8_t *out, uint32_t outlen,
    uint8_t *mem, uint32_t mem_blocks);

#endif /* WASM_CRYPTO_ARGON2_H */
