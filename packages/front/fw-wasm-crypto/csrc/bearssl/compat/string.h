/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * <string.h> — freestanding compat shim for the vendored BearSSL AES sources.
 *
 * The wasm-crypto builder compiles every translation unit with
 * `--target=wasm32 -ffreestanding -nostdlib` and NO wasi sysroot on the include
 * path, so the C standard library `<string.h>` is not found. BearSSL's
 * `inner.h` / `bearssl_hash.h` pull `<string.h>` for `memcpy`/`memset`
 * (`memmove`/`memcmp` covered for safety) used by the AES ct64 + GCM
 * translation units (`aes_ct64*`, `ghash_ctmul64`, `gcm.c`).
 *
 * We cannot edit the vendored bytes, so this package-local shim is placed AHEAD
 * of the (absent) real `<string.h>` on the include path (via the `aes` target's
 * `-I…/csrc/bearssl/compat` cflag) and maps the referenced functions onto clang
 * builtins. `-mbulk-memory` (set unconditionally by the builder) lowers
 * `__builtin_memcpy`/`__builtin_memset`/`__builtin_memmove` to wasm
 * `memory.copy`/`memory.fill`, so the zero-import invariant holds — no libc
 * import is emitted. `__builtin_memcmp` of a variable size can lower to an
 * extern `memcmp` libcall under `-flto`; the AES TUs do not use memcmp, but the
 * shim's freestanding `memcmp` symbol (in `shims/aes.c`) covers it regardless.
 *
 * Minimal subset — only what the vendored AES sources reference. NOT a general
 * libc; no global state, no side effects.
 */

#ifndef WASM_CRYPTO_BEARSSL_COMPAT_STRING_H
#define WASM_CRYPTO_BEARSSL_COMPAT_STRING_H

#include <stddef.h> /* size_t (compiler-provided, freestanding-safe) */

#define memcpy(d, s, n)  __builtin_memcpy((d), (s), (n))
#define memset(s, c, n)  __builtin_memset((s), (c), (n))
#define memmove(d, s, n) __builtin_memmove((d), (s), (n))
#define memcmp(a, b, n)  __builtin_memcmp((a), (b), (n))

#endif /* WASM_CRYPTO_BEARSSL_COMPAT_STRING_H */
