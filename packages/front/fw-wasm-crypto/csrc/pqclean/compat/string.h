/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * <string.h> — freestanding compat shim for the vendored PQClean common sources.
 *
 * Companion to the package-local `<stdlib.h>` shim (see its header). PQClean's
 * `vendor/pqclean/common/fips202.c` pulls `<string.h>` for `memcpy` (cloning the
 * incremental-SHAKE context). Under `--target=wasm32 -ffreestanding -nostdlib`
 * there is no real `<string.h>`, so this shim maps the referenced functions onto
 * clang builtins. `-mbulk-memory` (set unconditionally by the builder) lowers
 * `__builtin_memcpy`/`__builtin_memset` to wasm `memory.copy`/`memory.fill`,
 * preserving the zero-import invariant — no libc import is emitted.
 *
 * Minimal subset — only what the vendored common/ sources reference.
 */

#ifndef WASM_CRYPTO_PQCLEAN_COMPAT_STRING_H
#define WASM_CRYPTO_PQCLEAN_COMPAT_STRING_H

#include <stddef.h> /* size_t (compiler-provided, freestanding-safe) */

#define memcpy(d, s, n)  __builtin_memcpy((d), (s), (n))
#define memset(s, c, n)  __builtin_memset((s), (c), (n))
#define memmove(d, s, n) __builtin_memmove((d), (s), (n))

#endif /* WASM_CRYPTO_PQCLEAN_COMPAT_STRING_H */
