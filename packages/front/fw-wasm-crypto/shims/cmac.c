/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * cmac.c — AES-CMAC ABI adapter (NIST SP 800-38B) wiring the OWN CMAC framing
 *          (csrc/cmac) to the vendored constant-time BearSSL `aes_ct64` block.
 *
 * ABI source-of-truth (frozen, mirrors the old shims/bearssl.c semantics):
 *   aes_cmac(keyPtr, keyLen, msgPtr, msgLen, tagPtr, tagLen) -> i32
 *   + memory / alloc / free.  (0 = OK ; WC_EBADPARAM = -1.)
 *
 * Contract (verbatim from the previous bearssl.c path): the construction
 * produces a full 16-byte tag; the caller requests `tagLen ∈ [0,16]` bytes and
 * this shim writes the first `tagLen` bytes of the tag (truncation). tagLen<0 or
 * tagLen>16 → WC_EBADPARAM.
 *
 * Difference from the previous path: the CMAC framing is now the OWN
 * `csrc/cmac/cmac.c` (subkey K1/K2 + CBC-MAC final-block XOR). Only the AES
 * *block* stays vendored — here a single-block ECB encrypt over BearSSL's
 * bitsliced `br_aes_ct64` core (the same constant-time core AES/GCM use).
 *
 * Freestanding header note: BearSSL's inner.h pulls <string.h>/<limits.h>; those
 * are provided by the package-local compat shims in csrc/bearssl/compat/, placed
 * ahead on -I via this target's cflags (no edits to vendored bytes).
 */

#include "_arena.h"
#include "inner.h" /* vendored BearSSL: br_aes_ct64_* bitslice block + br_{enc,dec}32le */
#include "csrc/cmac/cmac.h"

#define WC_EBADPARAM (-1)

/*
 * Freestanding memcmp — under `-flto` a `__builtin_memcmp` of a variable size
 * can lower to an extern `memcmp` libcall (BATCH_21 note (c) / aes.c). The CMAC
 * path does not call memcmp, but providing the symbol forecloses that libcall
 * class so the zero-import invariant cannot be broken by an LTO-introduced
 * reference. The compat <string.h> macro-maps memcmp → __builtin_memcmp; #undef
 * it here so this real definition is emitted as the actual `memcmp` symbol.
 */
#ifdef memcmp
#undef memcmp
#endif
__attribute__((used))
int memcmp(const void *a, const void *b, size_t n) {
    const uint8_t *pa = (const uint8_t *)a;
    const uint8_t *pb = (const uint8_t *)b;
    for (size_t i = 0; i < n; i++) {
        if (pa[i] != pb[i]) return (int)pa[i] - (int)pb[i];
    }
    return 0;
}

/*
 * AES single-block ECB encrypt over the vendored constant-time ct64 core.
 * `num_rounds` + the expanded subkeys `sk_exp` are bound once at key schedule;
 * each call encrypts one 16-byte block. Mirrors the bitslice sequence in
 * vendor/.../aes_ct64_ctr.c (interleave_in / ortho / bitslice_encrypt / ortho /
 * interleave_out) for a single block.
 */
typedef struct {
    unsigned num_rounds;
    uint64_t sk_exp[120];
} aes_ct64_ecb_ctx;

static void aes_ct64_ecb_encrypt(void *vctx, const uint8_t in[16], uint8_t out[16]) {
    aes_ct64_ecb_ctx *c = (aes_ct64_ecb_ctx *)vctx;
    uint32_t w[4];
    uint64_t q[8];

    /* Decode the 16-byte block into 4 little-endian words (BearSSL convention). */
    for (int i = 0; i < 4; i++) w[i] = br_dec32le(in + (i << 2));

    /* One block occupies q[0]/q[4]; the other three lanes are unused. */
    br_aes_ct64_interleave_in(&q[0], &q[4], w);
    q[1] = q[2] = q[3] = q[0];
    q[5] = q[6] = q[7] = q[4];
    br_aes_ct64_ortho(q);
    br_aes_ct64_bitslice_encrypt(c->num_rounds, c->sk_exp, q);
    br_aes_ct64_ortho(q);
    br_aes_ct64_interleave_out(w, q[0], q[4]);

    for (int i = 0; i < 4; i++) br_enc32le(out + (i << 2), w[i]);
}

__attribute__((used))
int aes_cmac(const uint8_t *keyPtr, int keyLen,
             const uint8_t *msgPtr, int msgLen,
             uint8_t *tagPtr, int tagLen) {
    if (tagLen < 0 || tagLen > 16) return WC_EBADPARAM;
    if (msgLen < 0) return WC_EBADPARAM;

    /* Constant-time ct64 key schedule (returns 0 for an invalid key length). */
    aes_ct64_ecb_ctx ctx;
    uint64_t comp_skey[30];
    ctx.num_rounds = br_aes_ct64_keysched(comp_skey, keyPtr, (size_t)keyLen);
    if (ctx.num_rounds == 0) return WC_EBADPARAM;
    br_aes_ct64_skey_expand(ctx.sk_exp, ctx.num_rounds, comp_skey);

    /* Own SP 800-38B framing over the vendored ct64 block → full 16-byte tag. */
    uint8_t full[16];
    cmac_aes(aes_ct64_ecb_encrypt, &ctx, msgPtr, (size_t)msgLen, full);

    /* Truncate to the requested tag length (caller's ACVP macLen/8). */
    for (int i = 0; i < tagLen; i++) tagPtr[i] = full[i];
    return 0;
}
