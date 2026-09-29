/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for "crypto/slh_dsa.h" — wasm-crypto SLH-DSA.
 *
 * The vendored core (slh_dsa_local.h, slh_adrs.c) includes "crypto/slh_dsa.h".
 * Upstream this is include/crypto/slh_dsa.h, which we vendored byte-for-byte
 * next to the core as vendor/openssl-slh-dsa/slh_dsa_pub.h (renamed only so it
 * does not shadow this compat path). This forwarding header re-exports it, so
 * the vendored bytes resolve the include unchanged. C23.
 */
#ifndef WASM_CRYPTO_OSSL_CRYPTO_SLH_DSA_FWD_H
#define WASM_CRYPTO_OSSL_CRYPTO_SLH_DSA_FWD_H

#include "slh_dsa_pub.h"   /* resolved via -Ivendor/openssl-slh-dsa */

#endif /* WASM_CRYPTO_OSSL_CRYPTO_SLH_DSA_FWD_H */
