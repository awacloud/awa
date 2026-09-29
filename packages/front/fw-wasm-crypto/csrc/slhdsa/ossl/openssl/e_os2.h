/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for <openssl/e_os2.h> — wasm-crypto SLH-DSA (task 06).
 *
 * The vendored OpenSSL SLH-DSA core (vendor/openssl-slh-dsa/**) includes a small
 * set of OpenSSL infrastructure headers. Under the wasm-crypto builder
 * (`--target=wasm32 -ffreestanding -nostdlib`, no OpenSSL on the include path),
 * those are satisfied by this package-local compat tree (csrc/slhdsa/ossl/**),
 * placed on -I AHEAD of any real OpenSSL. This header provides only the macros
 * and the <stdint.h>/<stddef.h> typedefs the core actually references:
 *   ossl_inline, ossl_unused, ossl_unused, __owur (all attribute/inline macros).
 *
 * No <stdbit.h>, no global state, no side effects. C23.
 */
#ifndef WASM_CRYPTO_OSSL_E_OS2_H
#define WASM_CRYPTO_OSSL_E_OS2_H

#include <stddef.h>
#include <stdint.h>

/* Matches upstream <openssl/e_os2.h>: ossl_inline is bare `inline` (the call
 * sites add `static` explicitly, e.g. `static ossl_inline`). Defining it as
 * `static inline` here would double the storage-class specifier. */
#ifndef ossl_inline
# define ossl_inline inline
#endif
#ifndef ossl_unused
# define ossl_unused __attribute__((unused))
#endif
#ifndef __owur
# define __owur
#endif
#ifndef ossl_likely
# define ossl_likely(x) (x)
#endif
#ifndef ossl_unlikely
# define ossl_unlikely(x) (x)
#endif

#endif /* WASM_CRYPTO_OSSL_E_OS2_H */
