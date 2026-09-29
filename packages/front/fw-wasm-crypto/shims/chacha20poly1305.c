/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * chacha20poly1305.c — IETF ChaCha20-Poly1305 AEAD over the OWN C23 primitives
 * (csrc/chacha20poly1305/, ported + productionized from spikes/01-great-
 * equalizer-build-seam), bound to the FROZEN wasm-crypto ABI.
 *
 * Frozen ABI exports (source-of-truth: ai/batches/types/fw/BATCH_11/
 * 08-wasm-chacha20poly1305.md, mirrored by shims/sodium.c):
 *   memory                                   (linker-exported)
 *   alloc(n) -> ptr                          (shared arena, _arena.h)
 *   free(ptr, n) -> void                     (shared arena, _arena.h)
 *   aead_seal(keyPtr, noncePtr, ptPtr, ptLen, aadPtr, aadLen, outPtr) -> i32
 *       out = ct(ptLen) || tag(16); returns 0.
 *   aead_open(keyPtr, noncePtr, ctPtr, ctLen, aadPtr, aadLen, outPtr) -> i32
 *       ctPtr = ct(ctLen-16) || tag(16); outPtr = pt(ctLen-16);
 *       returns non-zero on auth failure (mirrors sodium.c exactly).
 *
 * IETF ChaCha20-Poly1305: 32-byte key, 12-byte nonce, 16-byte tag (RFC 8439).
 *
 * Freestanding wasm32: zero imports, no libc, no global ctor, no <stdbit.h> /
 * no C23 *library* header. The arena (alloc/free) is the package-wide shared
 * bump allocator from _arena.h — NOT a shim-local allocator. The Poly1305 tag
 * compare is constant-time (no secret-dependent early return).
 */

#include "_arena.h"
#include "csrc/chacha20poly1305/chacha20.h"
#include "csrc/chacha20poly1305/poly1305.h"

#define WC_AEAD_TAGBYTES 16

/* ─── Poly1305 AAD/CT MAC framing (RFC 8439 §2.8) ─────────────────────────── */

static void poly_pad16(poly1305_ctx *mac, size_t len) {
    static const uint8_t zeros[16] = {0};
    size_t rem = len & 15u;
    if (rem != 0) poly1305_update(mac, zeros, 16u - rem);
}

/*
 * Compute the RFC 8439 AEAD tag over (aad, ciphertext) using the one-time
 * Poly1305 key derived from ChaCha20 block 0 (counter 0).
 */
static void chacha20poly1305_tag(const uint8_t *key, const uint8_t *nonce,
                                 const uint8_t *aad, size_t aad_len,
                                 const uint8_t *ct, size_t ct_len,
                                 uint8_t tag[POLY1305_TAG_BYTES]) {
    uint8_t block0[CHACHA20_BLOCK_BYTES];
    chacha20_block(key, nonce, 0, block0);

    poly1305_ctx mac;
    poly1305_init(&mac, block0);                 /* first 32 bytes are the OTK */

    poly1305_update(&mac, aad, aad_len);
    poly_pad16(&mac, aad_len);
    poly1305_update(&mac, ct, ct_len);
    poly_pad16(&mac, ct_len);

    uint8_t lengths[16];
    store64_le(lengths + 0, (uint64_t) aad_len);
    store64_le(lengths + 8, (uint64_t) ct_len);
    poly1305_update(&mac, lengths, 16);

    poly1305_finish(&mac, tag);
}

/* Constant-time tag comparison: 0 if equal, non-zero otherwise. No early
 * return on a secret-dependent byte (in-engine CT proof is acvp-wasm-ct-fuzz). */
[[nodiscard]] static int ct_tag_diff(const uint8_t *a, const uint8_t *b) {
    uint8_t acc = 0;
    for (unsigned i = 0; i < WC_AEAD_TAGBYTES; i++) acc |= (uint8_t) (a[i] ^ b[i]);
    return acc;
}

/* ─── Frozen ABI: aead_seal / aead_open ───────────────────────────────────── */

/*
 * Seal: encrypt `ptLen` bytes (counter starts at 1; block 0 is the Poly1305
 * OTK), then append the 16-byte tag. out = ct(ptLen) || tag(16). Returns 0.
 */
__attribute__((used))
int aead_seal(const uint8_t* keyPtr, const uint8_t* noncePtr,
              const uint8_t* ptPtr, int ptLen,
              const uint8_t* aadPtr, int aadLen,
              uint8_t* outPtr) {
    if (ptLen < 0 || aadLen < 0) return 1;

    /* Encrypt with counter 1 → out[0 .. ptLen). */
    chacha20_xor(keyPtr, noncePtr, 1, ptPtr, outPtr, (size_t) ptLen);

    /* Tag over (aad, ciphertext) → out[ptLen .. ptLen+16). */
    chacha20poly1305_tag(keyPtr, noncePtr, aadPtr, (size_t) aadLen,
                         outPtr, (size_t) ptLen, outPtr + ptLen);
    return 0;
}

/*
 * Open: ctPtr = ct(ctLen-16) || tag(16). Recompute the tag, constant-time
 * compare, and only on success decrypt into outPtr = pt(ctLen-16). Mirrors
 * shims/sodium.c aead_open: ctLen INCLUDES the trailing 16-byte tag; non-zero
 * return on auth failure.
 */
__attribute__((used))
int aead_open(const uint8_t* keyPtr, const uint8_t* noncePtr,
              const uint8_t* ctPtr, int ctLen,
              const uint8_t* aadPtr, int aadLen,
              uint8_t* outPtr) {
    if (aadLen < 0) return 1;
    if (ctLen < WC_AEAD_TAGBYTES) return 1;       /* no room for the tag */

    size_t msgLen = (size_t) ctLen - WC_AEAD_TAGBYTES;
    const uint8_t *tag = ctPtr + msgLen;          /* trailing 16-byte tag */

    uint8_t expected[POLY1305_TAG_BYTES];
    chacha20poly1305_tag(keyPtr, noncePtr, aadPtr, (size_t) aadLen,
                         ctPtr, msgLen, expected);

    if (ct_tag_diff(expected, tag) != 0) return 1; /* tag mismatch → reject */

    /* Authenticated: decrypt the ciphertext body (same keystream, counter 1). */
    chacha20_xor(keyPtr, noncePtr, 1, ctPtr, outPtr, msgLen);
    return 0;
}
