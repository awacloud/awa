/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for <openssl/err.h> — wasm-crypto SLH-DSA (task 06).
 *
 * slh_dsa.c raises a couple of OpenSSL error codes on bad-size / missing-key
 * paths via ERR_raise / ERR_raise_data. In the freestanding wasm build there is
 * no OpenSSL error stack and the host only observes the int return code (0 on
 * failure), so these become no-ops that discard their arguments. The (void)
 * casts keep -Wunused quiet without pulling any libc/printf. C23. No <stdbit.h>.
 */
#ifndef WASM_CRYPTO_OSSL_ERR_H
#define WASM_CRYPTO_OSSL_ERR_H

#include <openssl/e_os2.h>
#include <openssl/crypto.h> /* real <openssl/err.h> transitively exposes OPENSSL_zalloc/free */

#define ERR_LIB_PROV 0
#define ERR_R_PASSED_NULL_PARAMETER 0

/* No-op: the caller already returns 0 on the error path. Variadic form swallows
 * the format string + args. Implemented as expression-statements so they are
 * valid wherever the upstream macro is used (statement context only here). */
#define ERR_raise(lib, reason)                 do { (void)(lib); (void)(reason); } while (0)
#define ERR_raise_data(lib, reason, ...)       do { (void)(lib); (void)(reason); } while (0)

#endif /* WASM_CRYPTO_OSSL_ERR_H */
