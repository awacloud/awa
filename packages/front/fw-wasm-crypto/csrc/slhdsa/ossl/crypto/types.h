/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for "crypto/types.h" — wasm-crypto SLH-DSA.
 *
 * The vendored public header (slh_dsa_pub.h) includes "crypto/types.h" for
 * internal OpenSSL forward typedefs. None of those are referenced by the
 * freestanding SLH-DSA build (the opaque EVP/lib-ctx names come from
 * <openssl/types.h>), so this is an empty placeholder. C23.
 */
#ifndef WASM_CRYPTO_OSSL_CRYPTO_TYPES_H
#define WASM_CRYPTO_OSSL_CRYPTO_TYPES_H
#endif
