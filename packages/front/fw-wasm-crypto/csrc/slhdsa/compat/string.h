/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * <string.h> — freestanding compat shim for the vendored PQClean sphincs-simple
 * sources (SLH-DSA, task 06).
 *
 * Superset of the shared task-05 PQClean compat <string.h>
 * (csrc/pqclean/compat/string.h): the SPHINCS+ `sign.c` verify path additionally
 * calls `memcmp` (root comparison in crypto_sign_verify), which the ML-DSA-only
 * task-05 shim never needed and therefore does not provide. The shared task-05
 * compat layer is read-only for this task, so SLH-DSA carries its OWN <string.h>
 * placed AHEAD of csrc/pqclean/compat on the include path (the slh_dsa target's
 * `-I…/csrc/slhdsa/compat` precedes `-I…/csrc/pqclean/compat`); the absent
 * `<stdlib.h>`/`<randombytes.h>` resolve onward to the shared task-05 dir.
 *
 * Under `--target=wasm32 -ffreestanding -nostdlib` there is no real <string.h>.
 * memcpy/memset/memmove map onto clang builtins (`-mbulk-memory`, set
 * unconditionally by the builder, lowers them to wasm `memory.copy`/`memory.fill`
 * — no libc import). memcmp is a fixed-size, side-channel-irrelevant comparison
 * here (root vs pub_root, SPX_N bytes); `__builtin_memcmp` lets clang inline it
 * for the constant size, keeping the zero-import invariant.
 *
 * Minimal subset — only what the vendored sphincs-simple sources reference.
 */

#ifndef WASM_CRYPTO_SLHDSA_COMPAT_STRING_H
#define WASM_CRYPTO_SLHDSA_COMPAT_STRING_H

#include <stddef.h> /* size_t (compiler-provided, freestanding-safe) */

#define memcpy(d, s, n)  __builtin_memcpy((d), (s), (n))
#define memset(s, c, n)  __builtin_memset((s), (c), (n))
#define memmove(d, s, n) __builtin_memmove((d), (s), (n))
#define memcmp(a, b, n)  __builtin_memcmp((a), (b), (n))

/* The OpenSSL SLH-DSA core's slh_params.c looks up a parameter set by name with
 * strcmp(p->alg, alg). __builtin_strcmp lets clang fold the comparison; a backing
 * definition (csrc/slhdsa/slh_support.c) covers the -flto libcall lowering. */
#define strcmp(a, b) __builtin_strcmp((a), (b))

#endif /* WASM_CRYPTO_SLHDSA_COMPAT_STRING_H */
