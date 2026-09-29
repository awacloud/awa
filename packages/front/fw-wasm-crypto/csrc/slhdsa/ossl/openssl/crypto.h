/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for <openssl/crypto.h> — wasm-crypto SLH-DSA (task 06).
 *
 * The vendored SLH-DSA core uses only a tiny slice of <openssl/crypto.h>:
 *   - OPENSSL_cleanse(ptr, len)  : zero a buffer (no dead-store elimination)
 *   - OPENSSL_zalloc / OPENSSL_free : heap (only in slh_dsa.c msg_encode big
 *     message path, when the encoded M' exceeds the 1024-byte stack buffer).
 *
 * Under freestanding wasm32 there is no libc heap; the package-local PQClean
 * compat <stdlib.h> maps malloc/free→pqcl_* (a bump arena, csrc/pqclean/
 * pqcl_support.c), already on the slh_dsa include path. We route OPENSSL_zalloc/
 * OPENSSL_free onto those, and OPENSSL_cleanse onto a volatile byte loop.
 *
 * memcpy/memset come from the package-local <string.h> compat (mapped to
 * __builtin_*). C23. No side effects, no <stdbit.h>.
 */
#ifndef WASM_CRYPTO_OSSL_CRYPTO_H
#define WASM_CRYPTO_OSSL_CRYPTO_H

#include <openssl/e_os2.h>
#include <stddef.h>
#include <stdlib.h>   /* package-local compat: malloc/free -> pqcl_* */
#include <string.h>   /* package-local compat: memset -> __builtin_memset */

static ossl_inline void OPENSSL_cleanse(void *ptr, size_t len)
{
    volatile unsigned char *p = (volatile unsigned char *)ptr;
    while (len-- > 0)
        *p++ = 0;
}

static ossl_inline void *OPENSSL_malloc(size_t n)
{
    return malloc(n);
}

static ossl_inline void *OPENSSL_zalloc(size_t n)
{
    void *p = malloc(n);
    if (p != NULL)
        memset(p, 0, n);
    return p;
}

static ossl_inline void OPENSSL_free(void *p)
{
    free(p);
}

#endif /* WASM_CRYPTO_OSSL_CRYPTO_H */
