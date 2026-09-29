/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * keccak.h — Keccak-f[1600] permutation + sponge (C23, freestanding wasm32).
 *
 * The 24-round Keccak-f[1600] permutation (FIPS 202 §3.2: θ ρ π χ ι) over a
 * 5×5 array of 64-bit lanes, plus a minimal sponge (absorb / pad10*1 / squeeze)
 * driven by the FIPS 202 hash/XOF layer in `sha3.{c,h}`. This header is the
 * internal permutation contract: file paths (`csrc/sha3/keccak.{c,h}`) and the
 * `keccak_*` symbol names are fixed once delivered.
 *
 * Freestanding wasm32: no libc, no C23 *library* headers (<stdbit.h> avoided —
 * `rotl64` is hand-rolled). Only freestanding-mandated <stdint.h>/<stddef.h>.
 * C23 *language* features (constexpr, static_assert) are used freely. No global
 * constructor, no side effects at load.
 *
 * Constant-time posture: the permutation is straight-line with no
 * secret-dependent branch or table index (the only data-dependent quantities
 * are the public RC/rho tables indexed by the loop counter). Keccak inputs here
 * are public; keeping the core branch-free preserves reuse for any keyed mode.
 * The in-engine CT proof is acvp-wasm-ct-fuzz's job — this code does NOT
 * self-attest constant-time.
 */
#ifndef WASM_CRYPTO_KECCAK_H
#define WASM_CRYPTO_KECCAK_H

#include <stdint.h>
#include <stddef.h>

static_assert(sizeof(uint64_t) == 8, "uint64_t must be 64-bit");

/* The Keccak-f[1600] state: 25 lanes of 64 bits = 1600 bits = 200 bytes. */
constexpr size_t KECCAK_LANES = 25;
constexpr size_t KECCAK_STATE_BYTES = 200;

/*
 * Apply the 24-round Keccak-f[1600] permutation in place over the 25-lane
 * state. Lanes are little-endian per FIPS 202 (state byte i lives in lane
 * i/8 at byte i%8). A `simd128` lane-interleaving path MAY be selected behind
 * `__wasm_simd128__`; the scalar path is mandatory and is the parity oracle.
 */
void keccak_f1600(uint64_t state[KECCAK_LANES]);

#endif /* WASM_CRYPTO_KECCAK_H */
