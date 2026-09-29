/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * crypto_sign_ed25519.h — freestanding compat shim (constants only).
 *
 * The vendored sign.c/keypair.c/open.c reference the ed25519 size constants and
 * (for the message-buffer max) SODIUM_SIZE_MAX. Reproduce exactly the values
 * from libsodium's public header — these are FIPS/RFC 8032 fixed sizes.
 */
#ifndef AWA_LIBSODIUM_COMPAT_CRYPTO_SIGN_ED25519_H
#define AWA_LIBSODIUM_COMPAT_CRYPTO_SIGN_ED25519_H

#include <stddef.h>
#include "export.h" /* SODIUM_SIZE_MAX */

#define crypto_sign_ed25519_BYTES 64U
#define crypto_sign_ed25519_SEEDBYTES 32U
#define crypto_sign_ed25519_PUBLICKEYBYTES 32U
#define crypto_sign_ed25519_SECRETKEYBYTES (32U + 32U)
#define crypto_sign_ed25519_MESSAGEBYTES_MAX (SODIUM_SIZE_MAX - crypto_sign_ed25519_BYTES)

#endif /* AWA_LIBSODIUM_COMPAT_CRYPTO_SIGN_ED25519_H */
