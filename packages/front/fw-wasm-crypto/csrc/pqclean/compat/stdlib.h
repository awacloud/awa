/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * <stdlib.h> — freestanding compat shim for the vendored PQClean common sources.
 *
 * The wasm-crypto builder compiles every translation unit with
 * `--target=wasm32 -ffreestanding -nostdlib` and NO wasi sysroot, so the C
 * standard library headers are not on the include path. PQClean's
 * `vendor/pqclean/common/fips202.c` (the FIPS-202 SHAKE used by ML-DSA) is
 * vendored byte-for-byte and pulls `<stdlib.h>` for `malloc`/`free`/`exit`
 * (its incremental-SHAKE context lives on the heap).
 *
 * We cannot edit the vendored source, so instead this package-local shim is put
 * AHEAD of the (absent) real `<stdlib.h>` on the include path (via the ml_dsa
 * target's `-I…/csrc/pqclean/compat` cflag). It maps the three libc entry points
 * fips202.c needs onto freestanding implementations defined in
 * `csrc/pqclean/pqcl_support.c`, via macros — so the vendored `malloc(...)` /
 * `free(...)` / `exit(...)` call sites rewrite to `pqcl_*` WITHOUT colliding with
 * the frozen BATCH_11 arena ABI (`alloc` / `free(void*, int)` from `_arena.h`),
 * which keeps its own distinct two-argument `free` symbol.
 *
 * This is a minimal subset — only what the vendored common/ sources reference.
 * It is NOT a general libc. No <stdbit.h>, no global state, no side effects.
 */

#ifndef WASM_CRYPTO_PQCLEAN_COMPAT_STDLIB_H
#define WASM_CRYPTO_PQCLEAN_COMPAT_STDLIB_H

#include <stddef.h> /* size_t, NULL (compiler-provided, freestanding-safe) */

/* Freestanding implementations (see csrc/pqclean/pqcl_support.c). */
void *pqcl_malloc(size_t n);
void pqcl_free(void *p);
_Noreturn void pqcl_exit(int code);

/* Redirect the vendored libc call sites to the freestanding impls. Macros (not
 * declarations of `malloc`/`free`) so the arena ABI's `free(void*, int)` symbol
 * in the shim TU is never shadowed or re-typed. */
#define malloc(n) pqcl_malloc((n))
#define free(p)   pqcl_free((p))
#define exit(c)   pqcl_exit((c))

#endif /* WASM_CRYPTO_PQCLEAN_COMPAT_STDLIB_H */
