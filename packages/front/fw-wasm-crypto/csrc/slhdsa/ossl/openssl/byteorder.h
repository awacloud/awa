/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for <openssl/byteorder.h> — wasm-crypto SLH-DSA.
 *
 * slh_adrs.c uses OPENSSL_store_u32_be / OPENSSL_store_u64_be to write the
 * big-endian ADRS fields. These are pure byte stores with no platform/header
 * dependencies, reimplemented here freestanding (semantically identical to the
 * upstream portable branch of <openssl/byteorder.h>). C23. No <stdbit.h>.
 */
#ifndef WASM_CRYPTO_OSSL_BYTEORDER_H
#define WASM_CRYPTO_OSSL_BYTEORDER_H

#include <openssl/e_os2.h>
#include <stdint.h>

static ossl_inline ossl_unused unsigned char *
OPENSSL_store_u32_be(unsigned char *out, uint32_t val)
{
    *out++ = (unsigned char)((val >> 24) & 0xff);
    *out++ = (unsigned char)((val >> 16) & 0xff);
    *out++ = (unsigned char)((val >> 8) & 0xff);
    *out++ = (unsigned char)(val & 0xff);
    return out;
}

static ossl_inline ossl_unused unsigned char *
OPENSSL_store_u64_be(unsigned char *out, uint64_t val)
{
    *out++ = (unsigned char)((val >> 56) & 0xff);
    *out++ = (unsigned char)((val >> 48) & 0xff);
    *out++ = (unsigned char)((val >> 40) & 0xff);
    *out++ = (unsigned char)((val >> 32) & 0xff);
    *out++ = (unsigned char)((val >> 24) & 0xff);
    *out++ = (unsigned char)((val >> 16) & 0xff);
    *out++ = (unsigned char)((val >> 8) & 0xff);
    *out++ = (unsigned char)(val & 0xff);
    return out;
}

#endif /* WASM_CRYPTO_OSSL_BYTEORDER_H */
