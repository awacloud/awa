/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * _arena.h — shared linear-memory bump allocator for the wasm-crypto shims.
 *
 * Every shim in this directory exposes the BATCH_11 task-01 WASM ABI:
 *   - the wasm `memory` export (provided by the linker/runtime, not here),
 *   - `void* alloc(int n)`   — bump-allocate `n` bytes from linear memory,
 *   - `void  free(void* p, int n)` — no-op / arena-reset boundary.
 *
 * Rationale: vendored reference crypto code is freestanding and never calls
 * libc malloc/free in the WASM build. The host (fw `wasmRuntime`) drives the
 * arena: it `alloc`s scratch buffers, marshals (ptr,len) pairs into linear
 * memory, calls the algorithm export, reads results back, then resets.
 *
 * Design:
 *   - No libc, no syscalls, no global constructors (no side effects at load).
 *   - A single static byte arena in the module's linear memory.
 *   - `alloc` bumps a cursor, 16-byte aligned; out-of-space returns NULL.
 *   - `free(p, n)` is a no-op except that freeing the most-recent allocation
 *     rewinds the cursor (cheap LIFO reuse). The host resets per call by
 *     freeing the first allocation it made, or the arena is implicitly reset
 *     when the module instance is dropped.
 *   - `arena_reset()` fully rewinds (host-callable if exported by a target).
 *
 * This header is shared (#included) by every *.c shim so they agree on the
 * exact `alloc`/`free` ABI and emit identical exports.
 */

#ifndef WASM_CRYPTO_ARENA_H
#define WASM_CRYPTO_ARENA_H

#include <stddef.h>
#include <stdint.h>

/* Arena size: large enough for the biggest single-call working set
 * (PQC keygen scratch, RSA, Argon2 with small m-cost). 16 MiB of the
 * module's linear memory. Adjust per-target via the build if needed. */
#ifndef WASM_CRYPTO_ARENA_BYTES
#define WASM_CRYPTO_ARENA_BYTES (16u * 1024u * 1024u)
#endif

#define WASM_CRYPTO_ARENA_ALIGN 16u

/* The backing store lives in the data segment of the wasm module, which the
 * linker maps into linear `memory`. Zero-initialised (BSS). */
static uint8_t  wc_arena_buf[WASM_CRYPTO_ARENA_BYTES];
static uint32_t wc_arena_cursor = 0;

/* Round `x` up to the arena alignment. */
static inline uint32_t wc_arena_align_up(uint32_t x) {
    const uint32_t a = WASM_CRYPTO_ARENA_ALIGN;
    return (x + (a - 1u)) & ~(a - 1u);
}

/*
 * Bump-allocate `n` bytes. Returns a pointer into linear memory, or NULL when
 * the arena is exhausted or `n` is negative/zero-overflowing. Exported as
 * `alloc` by each shim's translation unit.
 */
__attribute__((used))
void* alloc(int n) {
    if (n <= 0) {
        return (void*)0;
    }
    uint32_t need = wc_arena_align_up((uint32_t)n);
    if (need > WASM_CRYPTO_ARENA_BYTES - wc_arena_cursor) {
        return (void*)0; /* out of arena */
    }
    void* p = &wc_arena_buf[wc_arena_cursor];
    wc_arena_cursor += need;
    return p;
}

/*
 * Free `n` bytes at `p`. No-op in general; if `p`+`n` is exactly the current
 * cursor (the most-recent allocation), rewind it (LIFO reuse). The host uses
 * `free` as an arena-reset boundary between calls. Exported as `free`.
 */
__attribute__((used))
void free(void* p, int n) {
    if (p == (void*)0 || n <= 0) {
        return;
    }
    uint32_t need = wc_arena_align_up((uint32_t)n);
    uint8_t* end = (uint8_t*)p + need;
    if (end == &wc_arena_buf[wc_arena_cursor]) {
        wc_arena_cursor -= need; /* pop the top allocation */
    }
    /* otherwise: no-op — interior frees are ignored by the bump arena. */
}

/* Full arena reset — rewinds the cursor to the base. */
static inline void arena_reset(void) {
    wc_arena_cursor = 0;
}

#endif /* WASM_CRYPTO_ARENA_H */
