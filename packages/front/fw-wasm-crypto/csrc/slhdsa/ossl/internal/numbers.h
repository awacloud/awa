/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for "internal/numbers.h" — wasm-crypto SLH-DSA.
 *
 * The freestanding internal/packet.h compat uses SIZE_MAX for the PACKET length
 * sanity check. <stdint.h> already defines it; this header just guarantees its
 * presence (upstream numbers.h supplies a fallback for ancient toolchains). C23.
 */
#ifndef WASM_CRYPTO_OSSL_INTERNAL_NUMBERS_H
#define WASM_CRYPTO_OSSL_INTERNAL_NUMBERS_H

#include <stdint.h>

#ifndef SIZE_MAX
# define SIZE_MAX ((size_t)-1)
#endif

#endif /* WASM_CRYPTO_OSSL_INTERNAL_NUMBERS_H */
