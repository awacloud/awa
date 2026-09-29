/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * keccak.c — Keccak-f[1600] permutation (FIPS 202 §3.2), C23 freestanding.
 *
 * The 24-round permutation over a 5×5 array of 64-bit lanes: θ ρ π χ ι, with
 * the FIPS 202 round constants (ι) and rotation offsets (ρ). Lanes are
 * little-endian. The scalar path is mandatory and is the parity oracle; a
 * `__wasm_simd128__` path vectorizes the χ non-linear step (Keccak is a listed
 * simd128 beneficiary) while remaining byte-for-byte identical to the scalar
 * core.
 *
 * No libc, no <stdbit.h>; `rotl64` is hand-rolled. No global ctor.
 */
#include "csrc/sha3/keccak.h"

/* ── Hand-rolled left-rotate (avoid <stdbit.h>; branch-free) ─────────────── */
[[nodiscard]] static inline uint64_t rotl64(uint64_t x, unsigned n) {
    return (x << n) | (x >> ((64u - n) & 63u));
}

/* FIPS 202 §3.2.5 — 24 round constants for ι. */
static constexpr uint64_t RC[24] = {
    0x0000000000000001ull, 0x0000000000008082ull, 0x800000000000808aull,
    0x8000000080008000ull, 0x000000000000808bull, 0x0000000080000001ull,
    0x8000000080008081ull, 0x8000000000008009ull, 0x000000000000008aull,
    0x0000000000000088ull, 0x0000000080008009ull, 0x000000008000000aull,
    0x000000008000808bull, 0x800000000000008bull, 0x8000000000008089ull,
    0x8000000000008003ull, 0x8000000000008002ull, 0x8000000000000080ull,
    0x000000000000800aull, 0x800000008000000aull, 0x8000000080008081ull,
    0x8000000000008080ull, 0x0000000080000001ull, 0x8000000080008008ull,
};

/*
 * FIPS 202 §3.2.2 — rotation offsets ρ[x][y], laid out in the lane-index
 * order used below (lane = x + 5*y). Offsets are taken mod 64.
 */
static constexpr unsigned RHO[25] = {
     0,  1, 62, 28, 27,
    36, 44,  6, 55, 20,
     3, 10, 43, 25, 39,
    41, 45, 15, 21,  8,
    18,  2, 61, 56, 14,
};

#if defined(__wasm_simd128__)
#include <wasm_simd128.h>

/*
 * SIMD χ: per row y (5 lanes b[0..4]), compute
 *   s[i] = b[i] ^ ((~b[i+1]) & b[i+2])   (indices mod 5).
 * Lanes (0,1) and (2,3) are processed as two i64x2 vectors; lane 4 stays
 * scalar. The bitwise ops (xor/andnot) are bit-identical to the scalar core,
 * so the emitted digest is byte-for-byte equal to the scalar variant.
 *
 * `wasm_v128_andnot(a, b)` computes `a & ~b`; χ needs `~b[i+1] & b[i+2]`, i.e.
 * `andnot(b[i+2], b[i+1])`.
 */
static inline void chi_simd128(uint64_t s[KECCAK_LANES], const uint64_t b[25]) {
    for (unsigned y = 0; y < 5; y++) {
        const uint64_t *r = &b[5 * y];
        /* pair01 = (r0, r1); next01 = (r1, r2); skip01 = (r2, r3) */
        v128_t r01 = wasm_i64x2_make(r[0], r[1]);
        v128_t n01 = wasm_i64x2_make(r[1], r[2]);
        v128_t s01 = wasm_i64x2_make(r[2], r[3]);
        v128_t o01 = wasm_v128_xor(r01, wasm_v128_andnot(s01, n01));

        /* pair23 = (r2, r3); next23 = (r3, r4); skip23 = (r4, r0) */
        v128_t r23 = wasm_i64x2_make(r[2], r[3]);
        v128_t n23 = wasm_i64x2_make(r[3], r[4]);
        v128_t s23 = wasm_i64x2_make(r[4], r[0]);
        v128_t o23 = wasm_v128_xor(r23, wasm_v128_andnot(s23, n23));

        uint64_t o4 = r[4] ^ ((~r[0]) & r[1]);

        s[0 + 5 * y] = (uint64_t)wasm_i64x2_extract_lane(o01, 0);
        s[1 + 5 * y] = (uint64_t)wasm_i64x2_extract_lane(o01, 1);
        s[2 + 5 * y] = (uint64_t)wasm_i64x2_extract_lane(o23, 0);
        s[3 + 5 * y] = (uint64_t)wasm_i64x2_extract_lane(o23, 1);
        s[4 + 5 * y] = o4;
    }
}
#endif

void keccak_f1600(uint64_t s[KECCAK_LANES]) {
    for (unsigned round = 0; round < 24; round++) {
        /* θ: column parities + diffusion. */
        uint64_t c[5];
        for (unsigned x = 0; x < 5; x++) {
            c[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
        }
        uint64_t d[5];
        for (unsigned x = 0; x < 5; x++) {
            d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
        }
        for (unsigned x = 0; x < 5; x++) {
            for (unsigned y = 0; y < 5; y++) {
                s[x + 5 * y] ^= d[x];
            }
        }

        /* ρ then π: rotate each lane, then permute lane positions.
         * b[y][2x+3y] = rot(a[x][y]) → store into the permuted index. */
        uint64_t b[25];
        for (unsigned x = 0; x < 5; x++) {
            for (unsigned y = 0; y < 5; y++) {
                unsigned src = x + 5 * y;
                unsigned dstX = y;
                unsigned dstY = (2 * x + 3 * y) % 5;
                b[dstX + 5 * dstY] = rotl64(s[src], RHO[src]);
            }
        }

        /* χ: non-linear step, row by row. */
#if defined(__wasm_simd128__)
        chi_simd128(s, b);
#else
        for (unsigned y = 0; y < 5; y++) {
            uint64_t r0 = b[0 + 5 * y], r1 = b[1 + 5 * y], r2 = b[2 + 5 * y];
            uint64_t r3 = b[3 + 5 * y], r4 = b[4 + 5 * y];
            s[0 + 5 * y] = r0 ^ ((~r1) & r2);
            s[1 + 5 * y] = r1 ^ ((~r2) & r3);
            s[2 + 5 * y] = r2 ^ ((~r3) & r4);
            s[3 + 5 * y] = r3 ^ ((~r4) & r0);
            s[4 + 5 * y] = r4 ^ ((~r0) & r1);
        }
#endif

        /* ι: break round symmetry on lane (0,0). */
        s[0] ^= RC[round];
    }
}
