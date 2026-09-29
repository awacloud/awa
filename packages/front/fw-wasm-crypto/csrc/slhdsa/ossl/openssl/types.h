/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for <openssl/types.h> — wasm-crypto SLH-DSA (task 06).
 *
 * The vendored core's public header (crypto/slh_dsa.h) pulls <openssl/types.h>
 * for a handful of opaque OpenSSL object typedefs. Only the names referenced by
 * the vendored SLH-DSA core (and our freestanding key/ctx + hash adapter) are
 * declared here, as opaque incomplete/aliased types — no real OpenSSL objects
 * are ever constructed in the freestanding build (the EVP-coupled TUs are
 * replaced by csrc/slhdsa/slh_entry.c + slh_hash_adapter.c).
 *
 * C23. No side effects, no <stdbit.h>.
 */
#ifndef WASM_CRYPTO_OSSL_TYPES_H
#define WASM_CRYPTO_OSSL_TYPES_H

#include <openssl/e_os2.h>

/* Opaque OpenSSL object typedefs. In the freestanding build these are only used
 * as struct-field types in the (vendored) key/ctx structs; the fields are never
 * dereferenced because the hashing is done by the freestanding adapter, which
 * reads only key->params. We give them concrete-but-empty struct tags so the
 * structs are layout-complete. */
typedef struct ossl_lib_ctx_st OSSL_LIB_CTX;
typedef struct evp_md_st EVP_MD;
typedef struct evp_md_ctx_st EVP_MD_CTX;
typedef struct evp_mac_st EVP_MAC;
typedef struct evp_mac_ctx_st EVP_MAC_CTX;
typedef struct ossl_param_st OSSL_PARAM;
typedef struct bio_st BIO;

#endif /* WASM_CRYPTO_OSSL_TYPES_H */
