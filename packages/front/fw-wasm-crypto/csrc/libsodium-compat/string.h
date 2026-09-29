/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * <string.h> — freestanding compat shim for libsodium ref10 vendored sources.
 *
 * The wasm-crypto builder compiles every TU with
 * `--target=wasm32 -ffreestanding -nostdlib` and no wasi sysroot, so the C
 * standard library headers are off the include path. The vendored libsodium
 * ed25519/curve25519 ref10 sources pull <string.h> for memcpy/memmove/memset.
 * This compat header (placed AHEAD of the absent real <string.h> via a
 * package-qualified -I on the compat dir) maps the referenced functions onto
 * clang builtins. `-mbulk-memory` (set unconditionally by the builder) lowers
 * __builtin_memcpy/memset/memmove to wasm memory.copy/memory.fill, preserving
 * the zero-import invariant.
 *
 * Mirrors the csrc/pqclean/compat/string.h pattern (BATCH_21).
 */
#ifndef AWA_LIBSODIUM_COMPAT_STRING_H
#define AWA_LIBSODIUM_COMPAT_STRING_H

#include <stddef.h> /* size_t (compiler-provided, freestanding-safe) */

#define memcpy(d, s, n)  __builtin_memcpy((d), (s), (n))
#define memmove(d, s, n) __builtin_memmove((d), (s), (n))
#define memset(s, c, n)  __builtin_memset((s), (c), (n))

#endif /* AWA_LIBSODIUM_COMPAT_STRING_H */
