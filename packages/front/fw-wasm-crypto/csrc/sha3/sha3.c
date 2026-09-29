/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * sha3.c — FIPS 202 SHA3-224/256/384/512 + SHAKE128/256 sponge (C23).
 *
 * One-shot absorb / pad10*1 / squeeze over Keccak-f[1600] (`keccak.{c,h}`).
 * The state is held as a 200-byte little-endian buffer; absorb and squeeze XOR
 * / copy directly against the byte view, lane endianness handled by load/store
 * helpers so the implementation is identical on any host (wasm32 is LE).
 *
 * No libc; no global ctor; no secret-dependent control flow.
 */
#include "csrc/sha3/sha3.h"
#include "csrc/sha3/keccak.h"

/* Little-endian lane load/store (FIPS 202 maps state bytes LE into lanes). */
[[nodiscard]] static inline uint64_t load64_le(const uint8_t *p) {
    return ((uint64_t) p[0])        | ((uint64_t) p[1] << 8)
         | ((uint64_t) p[2] << 16)  | ((uint64_t) p[3] << 24)
         | ((uint64_t) p[4] << 32)  | ((uint64_t) p[5] << 40)
         | ((uint64_t) p[6] << 48)  | ((uint64_t) p[7] << 56);
}
static inline void store64_le(uint8_t *p, uint64_t v) {
    for (unsigned i = 0; i < 8; i++) p[i] = (uint8_t) (v >> (8u * i));
}

/* Permute: pack the 200-byte LE state into lanes, run keccak_f1600, unpack. */
static void permute(uint8_t state[KECCAK_STATE_BYTES]) {
    uint64_t lanes[KECCAK_LANES];
    for (unsigned i = 0; i < KECCAK_LANES; i++) lanes[i] = load64_le(state + 8u * i);
    keccak_f1600(lanes);
    for (unsigned i = 0; i < KECCAK_LANES; i++) store64_le(state + 8u * i, lanes[i]);
}

/*
 * Generic FIPS 202 sponge: absorb `in` at `rate`, apply pad10*1 with the given
 * domain byte (0x06 SHA-3, 0x1F SHAKE), then squeeze `outLen` bytes.
 */
static void sponge(size_t rate, uint8_t domain,
                   const uint8_t *in, size_t inLen,
                   uint8_t *out, size_t outLen) {
    uint8_t state[KECCAK_STATE_BYTES];
    for (unsigned i = 0; i < KECCAK_STATE_BYTES; i++) state[i] = 0;

    /* Absorb full rate-sized blocks. */
    while (inLen >= rate) {
        for (size_t i = 0; i < rate; i++) state[i] ^= in[i];
        permute(state);
        in += rate;
        inLen -= rate;
    }

    /* Absorb the final partial block + pad10*1 with the domain prefix. */
    for (size_t i = 0; i < inLen; i++) state[i] ^= in[i];
    state[inLen] ^= domain;          /* domain bits + first pad bit (10*1) */
    state[rate - 1] ^= 0x80u;        /* final pad bit */
    permute(state);

    /* Squeeze `outLen` bytes, one rate-block at a time. */
    while (outLen >= rate) {
        for (size_t i = 0; i < rate; i++) out[i] = state[i];
        permute(state);
        out += rate;
        outLen -= rate;
    }
    for (size_t i = 0; i < outLen; i++) out[i] = state[i];
}

void sha3_hash(size_t rate, const uint8_t *in, size_t inLen, uint8_t *out, size_t outLen) {
    sponge(rate, 0x06u, in, inLen, out, outLen);
}

void shake_xof(size_t rate, const uint8_t *in, size_t inLen, uint8_t *out, size_t outLen) {
    sponge(rate, 0x1Fu, in, inLen, out, outLen);
}
