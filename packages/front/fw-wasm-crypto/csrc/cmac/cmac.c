/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * cmac.c — own AES-CMAC framing (NIST SP 800-38B).
 *
 * The MAC construction is owned here; the AES block cipher is supplied by the
 * caller (the wasm-crypto shim wires it to the vendored constant-time BearSSL
 * `aes_ct64` core). No block cipher is reimplemented in this file.
 *
 * C23. No <stdbit.h>. The subkey GF(2^128) doubling uses a constant-time
 * conditional XOR with Rb (no secret-dependent branch); the final tag is built
 * without secret-dependent control flow.
 *
 * Reference: NIST SP 800-38B (The CMAC Mode for Authentication), and RFC 4493
 * (AES-CMAC) for the K1/K2 derivation and final-block handling.
 */

#include "csrc/cmac/cmac.h"

/*
 * Rb for the 128-bit block: the constant 0x...87 used when the high bit of L is
 * set during GF(2^128) doubling (SP 800-38B §6.1, RFC 4493 §2.3). Constant — no
 * secret data — so a constexpr is sound and the constant-assert documents the
 * block-size assumption.
 */
constexpr uint8_t CMAC_RB_LAST = 0x87;

static_assert(CMAC_BLOCK_BYTES == 16, "AES-CMAC framing is fixed to a 16-byte block");

/*
 * One GF(2^128) doubling (left shift by 1 over the whole 16-byte block, then
 * conditionally XOR Rb into the last byte when the shifted-out top bit was 1).
 *
 * Constant-time: the top-bit value drives an arithmetic mask (0x00 or 0xFF), so
 * the XOR with Rb is unconditional in control flow — there is no branch on a
 * key-derived value. `in` and `out` may alias.
 */
static void gf128_double(const uint8_t in[CMAC_BLOCK_BYTES],
                         uint8_t out[CMAC_BLOCK_BYTES]) {
    /* msb of the input block: 1 → we must reduce with Rb after the shift. */
    uint8_t carry = (uint8_t)(in[0] >> 7);
    /* mask = 0xFF when carry==1, else 0x00 (no data-dependent branch). */
    uint8_t mask = (uint8_t)(0u - (uint32_t)carry);

    /* Left shift the 128-bit value by one bit, MSB-first. */
    uint8_t prev = 0;
    for (int i = CMAC_BLOCK_BYTES - 1; i >= 0; i--) {
        uint8_t cur = in[i];
        out[i] = (uint8_t)((cur << 1) | prev);
        prev = (uint8_t)(cur >> 7);
    }
    /* Conditionally fold Rb into the last byte (only when the top bit was set). */
    out[CMAC_BLOCK_BYTES - 1] ^= (uint8_t)(CMAC_RB_LAST & mask);
}

static void xor_block(uint8_t dst[CMAC_BLOCK_BYTES], const uint8_t src[CMAC_BLOCK_BYTES]) {
    for (int i = 0; i < CMAC_BLOCK_BYTES; i++) dst[i] ^= src[i];
}

void cmac_aes(cmac_block_encrypt_fn enc, void *ctx,
              const uint8_t *msg, size_t msgLen,
              uint8_t tag[CMAC_BLOCK_BYTES]) {
    uint8_t l[CMAC_BLOCK_BYTES];
    uint8_t k1[CMAC_BLOCK_BYTES];
    uint8_t k2[CMAC_BLOCK_BYTES];
    uint8_t x[CMAC_BLOCK_BYTES];
    uint8_t block[CMAC_BLOCK_BYTES];

    /* L = AES_K(0^128) ; K1 = L·u ; K2 = L·u^2  (SP 800-38B §6.1). */
    const uint8_t zero[CMAC_BLOCK_BYTES] = {0};
    enc(ctx, zero, l);
    gf128_double(l, k1);
    gf128_double(k1, k2);

    /*
     * Determine the number of complete blocks consumed by the CBC-MAC chain
     * before the final block, and whether the message length is a non-zero
     * multiple of the block size (final block complete → XOR K1) or not
     * (final block padded with 0x80 00…00 → XOR K2).
     */
    int complete = (msgLen != 0) && ((msgLen % CMAC_BLOCK_BYTES) == 0);
    size_t fullBlocks = complete ? (msgLen / CMAC_BLOCK_BYTES) - 1
                                 : (msgLen / CMAC_BLOCK_BYTES);

    /* CBC-MAC over the leading full blocks: X = AES_K(X ^ Mi), X starts at 0. */
    for (int i = 0; i < CMAC_BLOCK_BYTES; i++) x[i] = 0;
    for (size_t b = 0; b < fullBlocks; b++) {
        const uint8_t *mi = msg + b * CMAC_BLOCK_BYTES;
        for (int i = 0; i < CMAC_BLOCK_BYTES; i++) block[i] = (uint8_t)(x[i] ^ mi[i]);
        enc(ctx, block, x);
    }

    /* Build the final block. */
    size_t off = fullBlocks * CMAC_BLOCK_BYTES;
    size_t rem = msgLen - off; /* bytes of the message in the final block */
    if (complete) {
        /* Final block is a complete message block; XOR K1. */
        const uint8_t *mn = msg + off;
        for (int i = 0; i < CMAC_BLOCK_BYTES; i++) block[i] = (uint8_t)(mn[i] ^ k1[i]);
    } else {
        /* Final block is padded: M_last = (M_n* || 0x80 || 0…0); XOR K2. */
        for (size_t i = 0; i < rem; i++) block[i] = msg[off + i];
        block[rem] = 0x80;
        for (size_t i = rem + 1; i < CMAC_BLOCK_BYTES; i++) block[i] = 0x00;
        xor_block(block, k2);
    }

    /* Final CBC-MAC step → tag. */
    for (int i = 0; i < CMAC_BLOCK_BYTES; i++) block[i] ^= x[i];
    enc(ctx, block, tag);
}
