/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * <limits.h> — freestanding compat shim for the vendored BearSSL sources.
 *
 * BearSSL's `inner.h` uses `ULONG_MAX` to detect a 64-bit `unsigned long`
 * (`#if ((ULONG_MAX >> 31) >> 31) == 3`). Under
 * `--target=wasm32 -ffreestanding -nostdlib` with no wasi sysroot, the real
 * `<limits.h>` is not on the include path, so this package-local shim provides
 * the integer-limit macros BearSSL references, derived from the
 * compiler-provided `__*_MAX__` builtins (correct for the wasm32 ILP32 ABI,
 * where `unsigned long` is 32-bit → the 64-bit-long branch is not taken).
 *
 * Placed AHEAD of the absent real `<limits.h>` via the `aes` target's
 * `-I…/csrc/bearssl/compat` cflag. Minimal subset — only what the vendored
 * sources reference. No side effects.
 */

#ifndef WASM_CRYPTO_BEARSSL_COMPAT_LIMITS_H
#define WASM_CRYPTO_BEARSSL_COMPAT_LIMITS_H

#ifndef CHAR_BIT
#define CHAR_BIT 8
#endif

#ifndef INT_MAX
#define INT_MAX __INT_MAX__
#endif
#ifndef UINT_MAX
#define UINT_MAX (__INT_MAX__ * 2U + 1U)
#endif

#ifndef LONG_MAX
#define LONG_MAX __LONG_MAX__
#endif
#ifndef ULONG_MAX
#define ULONG_MAX (__LONG_MAX__ * 2UL + 1UL)
#endif

#ifndef LLONG_MAX
#define LLONG_MAX __LONG_LONG_MAX__
#endif
#ifndef ULLONG_MAX
#define ULLONG_MAX (__LONG_LONG_MAX__ * 2ULL + 1ULL)
#endif

#endif /* WASM_CRYPTO_BEARSSL_COMPAT_LIMITS_H */
