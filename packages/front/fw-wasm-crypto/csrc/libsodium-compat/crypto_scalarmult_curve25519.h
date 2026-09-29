/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * crypto_scalarmult_curve25519.h — freestanding compat shim (constants only).
 *
 * keypair.c (sk_to_curve25519) and x25519_ref10.c reference the curve25519 size
 * constants. Reproduce the fixed 32-byte values from libsodium's public header.
 */
#ifndef AWA_LIBSODIUM_COMPAT_CRYPTO_SCALARMULT_CURVE25519_H
#define AWA_LIBSODIUM_COMPAT_CRYPTO_SCALARMULT_CURVE25519_H

#include <stddef.h>

#define crypto_scalarmult_curve25519_BYTES 32U
#define crypto_scalarmult_curve25519_SCALARBYTES 32U

#endif /* AWA_LIBSODIUM_COMPAT_CRYPTO_SCALARMULT_CURVE25519_H */
