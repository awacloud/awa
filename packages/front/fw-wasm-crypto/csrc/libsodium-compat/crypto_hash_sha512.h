/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * crypto_hash_sha512.h — freestanding compat shim wiring libsodium's SHA-512
 * to the package's OWN csrc/sha2/sha2.c.
 *
 * ed25519 hashes with SHA-512: sign.c/keypair.c/open.c call the one-shot
 * crypto_hash_sha512 and the incremental crypto_hash_sha512_{init,update,final}.
 * libsodium's own SHA-512 TU (crypto_hash/sha512/cp/hash_sha512_cp.c) is NOT
 * vendored here — it would drag <stdlib.h>/heap-ish utility code; instead this
 * shim maps the four entry points onto the package's freestanding SHA-512
 * (csrc/sha2/sha2.c, FIPS 180-4).
 *
 * The state struct is kept OPAQUE here (a byte buffer wide enough to hold the
 * own sha512_ctx) so the vendored TUs — compiled at C11 — never include the
 * package's own sha2.h, which uses C23 `static_assert`/`constexpr` and would not
 * parse under -std=c11. The seam TU (sodium_sha512_seam.c, compiled C23) is the
 * only place that bridges this opaque buffer onto the real sha512_ctx.
 */
#ifndef AWA_LIBSODIUM_COMPAT_CRYPTO_HASH_SHA512_H
#define AWA_LIBSODIUM_COMPAT_CRYPTO_HASH_SHA512_H

#include <stddef.h>
#include <stdint.h>

#define crypto_hash_sha512_BYTES 64U

/* Opaque incremental state. Sized to hold the own sha512_ctx
 * ({h[8], total_lo, total_hi, buf[128], buf_len}) with generous headroom; the
 * seam TU static_asserts the real ctx fits. 8-byte aligned for the uint64 words. */
typedef struct crypto_hash_sha512_state {
    _Alignas(8) unsigned char opaque[256];
} crypto_hash_sha512_state;

int crypto_hash_sha512(unsigned char *out, const unsigned char *in,
                       unsigned long long inlen);
int crypto_hash_sha512_init(crypto_hash_sha512_state *state);
int crypto_hash_sha512_update(crypto_hash_sha512_state *state,
                              const unsigned char *in, unsigned long long inlen);
int crypto_hash_sha512_final(crypto_hash_sha512_state *state, unsigned char *out);

#endif /* AWA_LIBSODIUM_COMPAT_CRYPTO_HASH_SHA512_H */
