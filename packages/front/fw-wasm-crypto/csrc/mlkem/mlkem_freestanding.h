/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * mlkem_freestanding.h — freestanding wasm32 overrides for the mlkem-native
 * multilevel build (shared by mlkem512.c / mlkem768.c / mlkem1024.c).
 *
 * The wasm-crypto builder compiles with `--target=wasm32 -ffreestanding
 * -nostdlib` and NO sysroot, so the C standard library headers (<string.h>) are
 * not on the include path. mlkem-native otherwise pulls <string.h> for
 * memcpy/memset and (in its inline-asm zeroize path) again for memset. We
 * pre-empt all three via mlkem-native's documented custom-function config hooks,
 * implemented with clang builtins (no header needed); `-mbulk-memory` lowers the
 * builtin memcpy/memset to wasm `memory.copy`/`memory.fill`, preserving the
 * zero-import invariant.
 *
 * This header MUST be included by each level wrapper BEFORE the vendored SCU so
 * the macros are visible when src/common.h and src/verify.h are processed.
 */

#ifndef WASM_CRYPTO_MLKEM_FREESTANDING_H
#define WASM_CRYPTO_MLKEM_FREESTANDING_H

#include <stddef.h>

/* memcpy replacement — see MLK_CONFIG_CUSTOM_MEMCPY in mlkem_native_config.h. */
#define MLK_CONFIG_CUSTOM_MEMCPY
static inline void *mlk_memcpy(void *dest, const void *src, size_t n) {
    return __builtin_memcpy(dest, src, n);
}

/* memset replacement — see MLK_CONFIG_CUSTOM_MEMSET. */
#define MLK_CONFIG_CUSTOM_MEMSET
static inline void *mlk_memset(void *s, int c, size_t n) {
    return __builtin_memset(s, c, n);
}

/* Stack-zeroization replacement — see MLK_CONFIG_CUSTOM_ZEROIZE. Defining this
 * skips verify.h's default zeroize block, which would otherwise #include
 * <string.h> on the inline-asm path. The volatile pointer keeps the compiler
 * from optimizing the clear away (the freestanding analogue of the OpenSSL
 * memset-through-volatile idiom mlkem-native uses by default). */
#define MLK_CONFIG_CUSTOM_ZEROIZE
static inline void mlk_zeroize(void *ptr, size_t len) {
    volatile unsigned char *p = (volatile unsigned char *)ptr;
    while (len-- > 0u) {
        *p++ = 0u;
    }
}

#endif /* WASM_CRYPTO_MLKEM_FREESTANDING_H */
