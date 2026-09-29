/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * pqcl_support.c — freestanding heap + abort for the vendored PQClean common/
 * sources (ML-DSA's FIPS-202 incremental SHAKE).
 *
 * PQClean's `vendor/pqclean/common/fips202.c` allocates its incremental-SHAKE
 * context (`PQC_SHAKEINCCTX_BYTES`/`PQC_SHAKECTX_BYTES`, a few hundred bytes per
 * live context) on the heap via libc `malloc`/`free`, and calls `exit(111)` if an
 * allocation fails. Freestanding wasm32 has no libc, so the package-local
 * `<stdlib.h>` compat shim (csrc/pqclean/compat/stdlib.h) redirects those calls
 * to the `pqcl_*` functions defined here.
 *
 * The allocator is a tiny LIFO bump arena in this module's BSS, kept SEPARATE
 * from the host-facing `_arena.h` ABI arena (`alloc` / `free(void*, int)`): the
 * frozen BATCH_11 ABI `free` takes two arguments and must stay untouched, so the
 * libc-shaped `pqcl_free(void*)` lives under its own name. ML-DSA sign/keygen
 * create only a couple of short-lived contexts and release them in LIFO order
 * (init → … → ctx_release), so the bump+LIFO-pop reclaim keeps usage bounded.
 *
 * C23 (csrc/ → c23 via cStdFor). Zero imports, no <stdbit.h>, no global ctor,
 * no side effects at load (BSS-only state). `pqcl_exit` traps deterministically.
 */

#include <stddef.h>
#include <stdint.h>

/* Capacity for PQClean incremental-SHAKE contexts. Each context is
 * sizeof(uint64_t)*26 = 208 bytes; ML-DSA keeps at most a handful live at once.
 * 64 KiB is ample headroom and stays well inside the module's linear memory. */
#define PQCL_HEAP_BYTES (64u * 1024u)
#define PQCL_ALIGN 16u

static uint8_t pqcl_heap[PQCL_HEAP_BYTES];
static uint32_t pqcl_cursor = 0;

static inline uint32_t pqcl_align_up(uint32_t x) {
    return (x + (PQCL_ALIGN - 1u)) & ~(PQCL_ALIGN - 1u);
}

/* Allocation header: the rounded size, stored just before the returned block so
 * pqcl_free() can LIFO-pop the most-recent allocation. */
typedef struct {
    uint32_t size; /* rounded block size (excluding this header) */
} pqcl_hdr;

void *pqcl_malloc(size_t n) {
    if (n == 0) {
        return NULL;
    }
    uint32_t need = pqcl_align_up((uint32_t)n);
    uint32_t hdr = pqcl_align_up((uint32_t)sizeof(pqcl_hdr));
    if (need > PQCL_HEAP_BYTES - pqcl_cursor ||
        hdr > PQCL_HEAP_BYTES - pqcl_cursor - need) {
        return NULL; /* exhausted */
    }
    pqcl_hdr *h = (pqcl_hdr *)&pqcl_heap[pqcl_cursor];
    h->size = need;
    uint8_t *block = &pqcl_heap[pqcl_cursor + hdr];
    pqcl_cursor += hdr + need;
    return block;
}

void pqcl_free(void *p) {
    if (p == NULL) {
        return;
    }
    uint32_t hdr = pqcl_align_up((uint32_t)sizeof(pqcl_hdr));
    uint8_t *block = (uint8_t *)p;
    pqcl_hdr *h = (pqcl_hdr *)(block - hdr);
    /* LIFO reclaim: pop only if this is the most-recent allocation; otherwise a
     * no-op (interior frees are tolerated, matching the bump-arena discipline).
     * The contexts are released in reverse creation order, so this reclaims. */
    if (block + h->size == &pqcl_heap[pqcl_cursor]) {
        pqcl_cursor = (uint32_t)((uint8_t *)h - pqcl_heap);
    }
}

_Noreturn void pqcl_exit(int code) {
    (void)code;
    __builtin_trap();
}
