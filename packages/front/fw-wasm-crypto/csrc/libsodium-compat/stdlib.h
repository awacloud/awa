/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * <stdlib.h> — freestanding compat shim for libsodium ref10 vendored sources.
 *
 * The vendored libsodium ed25519 ref10 sources include <stdlib.h> (transitively
 * through private/common.h and the fe headers) but, in the ref10 scalar path,
 * do NOT actually call malloc/free/exit — they only need the header to be
 * present. We therefore expose only the freestanding-safe types from <stddef.h>
 * and deliberately provide NO malloc/free/exit symbol (so any accidental heap
 * pull would fail loudly at link, never silently import). NULL/size_t come from
 * <stddef.h>.
 */
#ifndef AWA_LIBSODIUM_COMPAT_STDLIB_H
#define AWA_LIBSODIUM_COMPAT_STDLIB_H

#include <stddef.h> /* size_t, NULL (compiler-provided, freestanding-safe) */

/* ed25519_ref10.c has one unreachable abort() (LCOV_EXCL_LINE, a defensive
 * branch). Under -nostdlib there is no libc abort; map it to the wasm
 * `unreachable` trap (no import). Freestanding-safe, never reached on the KAT
 * path. */
_Noreturn static inline void abort(void) {
    __builtin_trap();
}

#endif /* AWA_LIBSODIUM_COMPAT_STDLIB_H */
