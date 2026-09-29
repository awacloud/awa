/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * <limits.h> — freestanding compat shim for libsodium ref10 vendored sources.
 *
 * open.c and utils.h include <limits.h>. clang ships a freestanding
 * <limits.h>, but to keep the compat dir self-contained ahead of the absent
 * sysroot we forward to the compiler builtin macros. Only the macros the
 * vendored sources reference are provided.
 */
#ifndef AWA_LIBSODIUM_COMPAT_LIMITS_H
#define AWA_LIBSODIUM_COMPAT_LIMITS_H

#ifndef CHAR_BIT
#define CHAR_BIT __CHAR_BIT__
#endif
#ifndef SIZE_MAX
#define SIZE_MAX __SIZE_MAX__
#endif

#endif /* AWA_LIBSODIUM_COMPAT_LIMITS_H */
