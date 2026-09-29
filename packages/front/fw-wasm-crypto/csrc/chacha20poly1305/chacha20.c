/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * chacha20.c — RFC 8439 ChaCha20 (C23), with a wasm `simd128` quarter-round
 * path and a scalar fallback, selected at compile time by `__wasm_simd128__`
 * (set by clang's `-msimd128`).
 *
 * Ported from spikes/01-great-equalizer-build-seam, productionized into
 * @awacloud/fw-wasm-crypto. Algorithm bodies are byte-for-byte identical to the
 * measured-GO spike; only this provenance comment differs.
 *
 * The great-equalizer thesis: in WASM there is no AES-NI/AVX advantage, so a
 * hand-written simd128 core lands within an acceptable band of libsodium's.
 *
 * NOTE: NO <stdbit.h> / no C23 *library* header is included anywhere here.
 * The only included headers are the freestanding <stdint.h>/<stddef.h> pulled
 * via common.h.
 */

#include "chacha20.h"

/* The four 32-bit ASCII constants "expand 32-byte k". */
static constexpr uint32_t CHACHA_C0 = 0x61707865u;
static constexpr uint32_t CHACHA_C1 = 0x3320646eu;
static constexpr uint32_t CHACHA_C2 = 0x79622d32u;
static constexpr uint32_t CHACHA_C3 = 0x6b206574u;

/* Initialise the 16-word ChaCha state for (key, nonce, counter). */
static void chacha_init_state(uint32_t st[16],
                              const uint8_t key[CHACHA20_KEY_BYTES],
                              const uint8_t nonce[CHACHA20_NONCE_BYTES],
                              uint32_t counter) {
    st[0] = CHACHA_C0;
    st[1] = CHACHA_C1;
    st[2] = CHACHA_C2;
    st[3] = CHACHA_C3;
    for (unsigned i = 0; i < 8; i++) st[4 + i] = load32_le(key + 4u * i);
    st[12] = counter;
    st[13] = load32_le(nonce + 0);
    st[14] = load32_le(nonce + 4);
    st[15] = load32_le(nonce + 8);
}

#if defined(__wasm_simd128__)

/* ───────────────────────── simd128 path ───────────────────────────────── */
#include <wasm_simd128.h>

/*
 * Vectorised ChaCha20 block: the four state rows are held in four v128_t
 * lanes; a column round operates on all four words in parallel, and a diagonal
 * round is realised by lane-rotating rows b/c/d (the canonical SIMD ChaCha
 * shuffle) so the same column kernel computes the diagonal round.
 */
static inline v128_t rotl_v(v128_t x, int n) {
    /* Logical (zero-filling) right shift — wasm_i32x4_shr is ARITHMETIC and
     * sign-extends, corrupting the rotate for lanes with the high bit set.
     * Correctness fix vs the W0① spike (throughput-only, never KAT-validated
     * its simd path): a left-rotate composes shl | u32-shr. */
    return wasm_v128_or(wasm_i32x4_shl(x, n), wasm_u32x4_shr(x, 32 - n));
}

static void chacha_block_simd(const uint32_t st[16], uint32_t out[16]) {
    v128_t a = wasm_v128_load(&st[0]);
    v128_t b = wasm_v128_load(&st[4]);
    v128_t c = wasm_v128_load(&st[8]);
    v128_t d = wasm_v128_load(&st[12]);

    const v128_t a0 = a, b0 = b, c0 = c, d0 = d;

    for (int i = 0; i < 10; i++) {
        /* column round */
        a = wasm_i32x4_add(a, b); d = wasm_v128_xor(d, a); d = rotl_v(d, 16);
        c = wasm_i32x4_add(c, d); b = wasm_v128_xor(b, c); b = rotl_v(b, 12);
        a = wasm_i32x4_add(a, b); d = wasm_v128_xor(d, a); d = rotl_v(d, 8);
        c = wasm_i32x4_add(c, d); b = wasm_v128_xor(b, c); b = rotl_v(b, 7);

        /* diagonal round: rotate lanes of b (<<<1), c (<<<2), d (<<<3) */
        b = wasm_i32x4_shuffle(b, b, 1, 2, 3, 0);
        c = wasm_i32x4_shuffle(c, c, 2, 3, 0, 1);
        d = wasm_i32x4_shuffle(d, d, 3, 0, 1, 2);

        a = wasm_i32x4_add(a, b); d = wasm_v128_xor(d, a); d = rotl_v(d, 16);
        c = wasm_i32x4_add(c, d); b = wasm_v128_xor(b, c); b = rotl_v(b, 12);
        a = wasm_i32x4_add(a, b); d = wasm_v128_xor(d, a); d = rotl_v(d, 8);
        c = wasm_i32x4_add(c, d); b = wasm_v128_xor(b, c); b = rotl_v(b, 7);

        /* undo the diagonal lane rotation */
        b = wasm_i32x4_shuffle(b, b, 3, 0, 1, 2);
        c = wasm_i32x4_shuffle(c, c, 2, 3, 0, 1);
        d = wasm_i32x4_shuffle(d, d, 1, 2, 3, 0);
    }

    a = wasm_i32x4_add(a, a0);
    b = wasm_i32x4_add(b, b0);
    c = wasm_i32x4_add(c, c0);
    d = wasm_i32x4_add(d, d0);

    wasm_v128_store(&out[0], a);
    wasm_v128_store(&out[4], b);
    wasm_v128_store(&out[8], c);
    wasm_v128_store(&out[12], d);
}

#else /* scalar path */

/* ───────────────────────── scalar path ────────────────────────────────── */

#define QR(a, b, c, d)                              \
    a += b; d ^= a; d = rotl32(d, 16);              \
    c += d; b ^= c; b = rotl32(b, 12);              \
    a += b; d ^= a; d = rotl32(d, 8);               \
    c += d; b ^= c; b = rotl32(b, 7)

static void chacha_block_scalar(const uint32_t st[16], uint32_t out[16]) {
    uint32_t x[16];
    for (unsigned i = 0; i < 16; i++) x[i] = st[i];

    for (int i = 0; i < 10; i++) {
        /* column rounds */
        QR(x[0], x[4], x[8],  x[12]);
        QR(x[1], x[5], x[9],  x[13]);
        QR(x[2], x[6], x[10], x[14]);
        QR(x[3], x[7], x[11], x[15]);
        /* diagonal rounds */
        QR(x[0], x[5], x[10], x[15]);
        QR(x[1], x[6], x[11], x[12]);
        QR(x[2], x[7], x[8],  x[13]);
        QR(x[3], x[4], x[9],  x[14]);
    }

    for (unsigned i = 0; i < 16; i++) out[i] = x[i] + st[i];
}

#undef QR

#endif

/* Block function: produce 64 keystream bytes (LE serialisation of the words). */
void chacha20_block(const uint8_t key[CHACHA20_KEY_BYTES],
                    const uint8_t nonce[CHACHA20_NONCE_BYTES],
                    uint32_t counter,
                    uint8_t out[CHACHA20_BLOCK_BYTES]) {
    uint32_t st[16];
    uint32_t words[16];
    chacha_init_state(st, key, nonce, counter);
#if defined(__wasm_simd128__)
    chacha_block_simd(st, words);
#else
    chacha_block_scalar(st, words);
#endif
    for (unsigned i = 0; i < 16; i++) store32_le(out + 4u * i, words[i]);
}

void chacha20_xor(const uint8_t key[CHACHA20_KEY_BYTES],
                  const uint8_t nonce[CHACHA20_NONCE_BYTES],
                  uint32_t counter,
                  const uint8_t *in,
                  uint8_t *out,
                  size_t len) {
    uint8_t ks[CHACHA20_BLOCK_BYTES];
    size_t off = 0;
    while (off < len) {
        chacha20_block(key, nonce, counter, ks);
        counter++;
        size_t n = len - off;
        if (n > CHACHA20_BLOCK_BYTES) n = CHACHA20_BLOCK_BYTES;
        for (size_t i = 0; i < n; i++) out[off + i] = in[off + i] ^ ks[i];
        off += n;
    }
}
