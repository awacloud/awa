/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * rng.c — freestanding, zero-import entropy seam for the PQC shims.
 *
 * Provides the `randombytes(uint8_t*, size_t)` symbol that PQClean and the
 * non-derandomized path of mlkem-native link against, by draining a
 * caller-staged entropy buffer that lives in this module's own linear memory.
 * There is NO JS/WASI import: the host stages deterministic entropy into the
 * module's BSS via `rng_stage`, then the export that draws randomness consumes
 * it in order. This makes ACVP KAT runs deterministic (the staged buffer IS the
 * vector's seed). It is NOT a CSPRNG/DRBG — no entropy expansion, no reseed.
 *
 * The per-scheme shim translation units (#include this header and add rng.c to
 * their cSources) re-export `rng_stage`/`rng_reset` under the host-facing names;
 * this TU only provides the definitions so the linker resolves `randombytes`.
 *
 * C23 (built with -std=c23 via cStdFor for csrc/). No <stdbit.h>. BSS-only
 * state, no global constructors, no side effects at load.
 */

#include "csrc/rng/rng.h"

/* Capacity of the staging arena: covers the largest single-op entropy draw. */
#define RNG_STAGE_CAP (256u * 1024u)

static_assert(RNG_STAGE_CAP > 0, "RNG_STAGE_CAP must be positive");

/* All state lives in BSS (zero-initialised): no import, no global ctor. */
static uint8_t  rng_buf[RNG_STAGE_CAP];
static uint32_t rng_len = 0;
static uint32_t rng_cur = 0;
static int      rng_under = 0;

int rng_stage(const uint8_t* src, uint32_t n) {
    if (n > RNG_STAGE_CAP) {
        return -1;
    }
    for (uint32_t i = 0; i < n; i++) {
        rng_buf[i] = src[i];
    }
    rng_len = n;
    rng_cur = 0;
    rng_under = 0;
    return 0;
}

void rng_reset(void) {
    rng_len = 0;
    rng_cur = 0;
    rng_under = 0;
}

void randombytes(uint8_t* buf, size_t n) {
    size_t i = 0;
    /* Drain from the staged buffer, in order, exactly once each. */
    uint32_t avail = rng_len - rng_cur;
    while (i < n && avail > 0) {
        buf[i] = rng_buf[rng_cur];
        rng_cur++;
        avail--;
        i++;
    }
    /* Under-staged vector: zero-fill the deficit and raise the sticky flag so a
     * KAT harness detects it instead of silently passing on zeros. */
    if (i < n) {
        while (i < n) {
            buf[i] = 0u;
            i++;
        }
        rng_under = 1;
    }
}

int rng_underflowed(void) {
    return rng_under;
}
