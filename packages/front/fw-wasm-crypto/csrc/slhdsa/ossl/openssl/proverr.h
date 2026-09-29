/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for <openssl/proverr.h> — wasm-crypto SLH-DSA.
 *
 * Provides only the PROV_R_* reason codes referenced by the vendored
 * slh_dsa.c (used purely as arguments to the no-op ERR_raise* macros). Values
 * are irrelevant in the freestanding build. C23. No side effects, no <stdbit.h>.
 */
#ifndef WASM_CRYPTO_OSSL_PROVERR_H
#define WASM_CRYPTO_OSSL_PROVERR_H

#define PROV_R_INVALID_SIGNATURE_SIZE 0
#define PROV_R_MISSING_KEY            0

#endif /* WASM_CRYPTO_OSSL_PROVERR_H */
