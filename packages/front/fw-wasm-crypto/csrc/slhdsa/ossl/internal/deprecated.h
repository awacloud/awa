/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for "internal/deprecated.h" — wasm-crypto SLH-DSA.
 *
 * Upstream slh_hash.c includes this to opt into deprecated PKCS1_MGF1(); our
 * freestanding hash adapter (csrc/slhdsa/slh_hash_adapter.c) does NOT use the
 * vendored slh_hash.c (it is excluded) and computes MGF1 itself, so this is an
 * empty placeholder kept only in case a future re-vendor references it. C23.
 */
#ifndef WASM_CRYPTO_OSSL_INTERNAL_DEPRECATED_H
#define WASM_CRYPTO_OSSL_INTERNAL_DEPRECATED_H
#endif
