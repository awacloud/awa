/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * common.h — shared C23 primitives for the own ChaCha20-Poly1305 (RFC 8439).
 *
 * Ported from spikes/01-great-equalizer-build-seam/csrc/chacha20poly1305/,
 * productionized into the @awacloud/fw-wasm-crypto package (W0① great-equalizer).
 * Algorithm bodies are byte-for-byte identical to the measured-GO spike; only
 * this provenance comment differs.
 *
 * Freestanding wasm32: no libc, no C23 *library* headers. In particular
 * <stdbit.h> is DELIBERATELY NOT included — the one bit rotation we need is
 * hand-rolled below. C23 *language* features are used freely (constexpr,
 * static_assert, nullptr, [[nodiscard]]).
 *
 * Only <stdint.h> and <stddef.h> are pulled in: those are freestanding
 * headers mandated by the C standard for hosted AND freestanding modes, so
 * they are available under wasi-sdk clang `-ffreestanding -nostdlib`. They are
 * NOT C23 *library* additions — <stdbit.h>/<stdckdint.h> are the C23 additions
 * we avoid (we hand-roll the checked add we need in the shim).
 */
#ifndef SPIKE_CHACHA20POLY1305_COMMON_H
#define SPIKE_CHACHA20POLY1305_COMMON_H

#include <stdint.h>
#include <stddef.h>

/* Sanity: the spike assumes a little-endian, 32-bit-pointer wasm32 target. */
static_assert(sizeof(uint32_t) == 4, "uint32_t must be 32-bit");
static_assert(sizeof(uint64_t) == 8, "uint64_t must be 64-bit");

/* ChaCha20 / Poly1305 fixed sizes (RFC 8439). */
constexpr size_t CHACHA20_KEY_BYTES   = 32;
constexpr size_t CHACHA20_NONCE_BYTES = 12; /* IETF 96-bit nonce */
constexpr size_t CHACHA20_BLOCK_BYTES = 64;
constexpr size_t POLY1305_KEY_BYTES   = 32;
constexpr size_t POLY1305_TAG_BYTES   = 16;

/*
 * 32-bit left rotation. Hand-rolled rather than pulling <stdbit.h>'s
 * stdc_rotate_left_ui (the C23 library header we must avoid). The mask keeps
 * the shift in range and the expression is branch-free / constant-time.
 */
[[nodiscard]] static inline uint32_t rotl32(uint32_t x, unsigned n) {
    return (x << n) | (x >> ((32u - n) & 31u));
}

/* Little-endian 32-bit load/store (wasm32 is LE, but stay explicit). */
[[nodiscard]] static inline uint32_t load32_le(const uint8_t *p) {
    return (uint32_t) p[0]
         | ((uint32_t) p[1] << 8)
         | ((uint32_t) p[2] << 16)
         | ((uint32_t) p[3] << 24);
}

static inline void store32_le(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t) (v & 0xff);
    p[1] = (uint8_t) ((v >> 8) & 0xff);
    p[2] = (uint8_t) ((v >> 16) & 0xff);
    p[3] = (uint8_t) ((v >> 24) & 0xff);
}

static inline void store64_le(uint8_t *p, uint64_t v) {
    for (unsigned i = 0; i < 8; i++) p[i] = (uint8_t) ((v >> (8u * i)) & 0xff);
}

#endif /* SPIKE_CHACHA20POLY1305_COMMON_H */
