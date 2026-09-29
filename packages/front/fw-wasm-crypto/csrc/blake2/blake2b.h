/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * blake2b.h — RFC 7693 BLAKE2b core (C23, freestanding wasm32).
 *
 * Streaming BLAKE2b over the 12-round G permutation: init_param / update /
 * final, plus the 64-byte `blake2b_param` (RFC 7693 §2.5) so the keyed,
 * salted and personalised modes are all expressible. The frozen wasm-crypto
 * `blake2b(inPtr, …, outPtr, outLen)` 8-arg ABI lives in `shims/blake2b.c`,
 * which drives these entry points; this header is the internal core contract.
 *
 * FROZEN INTERNAL CONTRACT — task 09 (argon2) consumes this csrc read-only via
 * `#include "csrc/blake2/blake2b.h"`: the file path
 * (`csrc/blake2/blake2b.{h,c}`), the `blake2b_param` layout, the
 * `blake2b_ctx` state, and the `blake2b_init_param`/`_update`/`_final` +
 * `blake2b_long` symbol names are fixed once delivered. Argon2's long-hash H'
 * (RFC 9106 §3.3) is exactly the `blake2b_long` variable-output helper here.
 *
 * Freestanding wasm32: no libc, no <stdbit.h> (rotr64 is hand-rolled). Only
 * freestanding-mandated <stdint.h>/<stddef.h>. C23 *language* features
 * (constexpr, static_assert) are used freely. No global constructor, no side
 * effects at load.
 *
 * Constant-time posture: the compression function is straight-line with no
 * secret-dependent branch or table index (sigma is indexed by the public
 * round/lane counters). The in-engine CT proof is acvp-wasm-ct-fuzz's job —
 * this code does NOT self-attest constant-time.
 */
#ifndef WASM_CRYPTO_BLAKE2B_H
#define WASM_CRYPTO_BLAKE2B_H

#include <stdint.h>
#include <stddef.h>

static_assert(sizeof(uint64_t) == 8, "uint64_t must be 64-bit");

/* BLAKE2b limits (RFC 7693 §2.1, §2.8): block 128 B, max digest/key 64 B. */
constexpr size_t BLAKE2B_BLOCKBYTES = 128;
constexpr size_t BLAKE2B_OUTBYTES   = 64;
constexpr size_t BLAKE2B_KEYBYTES   = 64;
constexpr size_t BLAKE2B_SALTBYTES  = 16;
constexpr size_t BLAKE2B_PERSONALBYTES = 16;

/*
 * The 64-byte BLAKE2b parameter block (RFC 7693 §2.5, little-endian). Mixed
 * word-by-word into the IV at init. Layout is the libsodium/blake2-ref layout
 * — identical to the one `shims/hashes.c` mirrored AND the one Argon2's H'
 * (task 09) needs. `static_assert(sizeof == 64)` enforces the no-padding
 * contract (the trailing salt+personal arrays keep the struct 8-aligned).
 */
typedef struct {
    uint8_t  digest_length;   /* 0  */
    uint8_t  key_length;      /* 1  */
    uint8_t  fanout;          /* 2  */
    uint8_t  depth;           /* 3  */
    uint32_t leaf_length;     /* 4  */
    uint32_t node_offset;     /* 8  */
    uint32_t xof_length;      /* 12 (RFC: node_offset high / xof_length) */
    uint8_t  node_depth;      /* 16 */
    uint8_t  inner_length;    /* 17 */
    uint8_t  reserved[14];    /* 18 */
    uint8_t  salt[BLAKE2B_SALTBYTES];        /* 32 */
    uint8_t  personal[BLAKE2B_PERSONALBYTES];/* 48 */
} blake2b_param;

static_assert(sizeof(blake2b_param) == 64, "blake2b_param must be 64 bytes");

/*
 * Streaming state. `h` is the 8-word chained state, `t` the 128-bit byte
 * counter, `f` the finalisation flags, `buf` a 128-byte block buffer, `buflen`
 * the bytes pending in `buf`, `outlen` the requested digest size. Opaque to
 * callers other than the core + the argon2 consumer.
 */
typedef struct {
    uint64_t h[8];
    uint64_t t[2];
    uint64_t f[2];
    uint8_t  buf[BLAKE2B_BLOCKBYTES];
    size_t   buflen;
    size_t   outlen;
} blake2b_ctx;

/*
 * Initialise `ctx` from a fully-formed parameter block `P`. The whole 64-byte
 * `P` is XORed into the IV (RFC 7693 §2.5). `P->digest_length` selects the
 * output size echoed at final; `P->key_length` is informational here (the
 * keyed first block is the caller's responsibility — see `shims/blake2b.c`).
 * Returns 0 on success, -1 if `P->digest_length` is 0 or > 64.
 */
int blake2b_init_param(blake2b_ctx *ctx, const blake2b_param *P);

/* Absorb `inlen` bytes from `in` into the streaming hash. */
void blake2b_update(blake2b_ctx *ctx, const uint8_t *in, size_t inlen);

/*
 * Finalise: emit exactly `ctx->outlen` bytes into `out`. `out` must hold
 * `ctx->outlen` bytes (1..64). The context is consumed (single-shot final).
 */
void blake2b_final(blake2b_ctx *ctx, uint8_t *out);

/*
 * One-shot unkeyed/unsalted helper with caller-chosen output length — the
 * Argon2 H' building block (RFC 9106 §3.3 uses unkeyed BLAKE2b with a length
 * prefix; this is the underlying primitive, the ≤64-byte case). Hashes
 * `inlen` bytes from `in` and writes exactly `outlen` bytes (1..64) to `out`.
 * Returns 0 on success, -1 if `outlen` is 0 or > 64. No key/salt/personal.
 */
int blake2b_long(uint8_t *out, size_t outlen, const uint8_t *in, size_t inlen);

#endif /* WASM_CRYPTO_BLAKE2B_H */
