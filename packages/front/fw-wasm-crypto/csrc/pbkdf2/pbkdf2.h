/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * pbkdf2.h — RFC 8018 §5.2 PBKDF2 over the OWN HMAC core (C23, freestanding
 * wasm32).
 *
 * PBKDF2 is a THIN KDF wrapper: the algorithm is HMAC + XOR accumulation +
 * a big-endian 32-bit block counter. No new primitive math is introduced here.
 * The own HMAC core (csrc/hmac/hmac.{c,h}, task 06), itself over the own
 * SHA-2 core (csrc/sha2/, task 02), is consumed READ-ONLY (#include) — neither
 * HMAC nor SHA-2 is re-implemented or duplicated here.
 *
 * hashId enum (mirrors the frozen sha2 variantId / hmac hashId):
 *   256 = PBKDF2-HMAC-SHA-256,
 *   384 = PBKDF2-HMAC-SHA-384,
 *   512 = PBKDF2-HMAC-SHA-512.
 *
 * RFC 8018 §5.2 algorithm:
 *   DK = T_1 ∥ T_2 ∥ … ∥ T_l, truncated to dkLen bytes.
 *   T_i = F(Password, Salt, c, i)
 *   F(P, S, c, i) = U_1 ⊕ U_2 ⊕ … ⊕ U_c
 *   U_1 = PRF(P, S ∥ INT_BE32(i))
 *   U_j = PRF(P, U_{j-1}), j = 2..c
 *
 * PRF is HMAC-hashId. INT_BE32(i) is a 4-byte big-endian encoding of the block
 * index i (starting at 1).
 *
 * Constant-time: the only control flow is dispatch on the PUBLIC hashId,
 * public-length block/XOR loops, and the truncation to outLen. No
 * secret-dependent branch or memory index over password/salt bytes. The
 * in-engine CT proof is acvp-wasm-ct-fuzz's job — this code does NOT
 * self-attest constant-time. CT posture inherits HMAC's.
 *
 * Freestanding wasm32: no libc, no C23 library headers (<stdbit.h> avoided).
 * Only <stdint.h>/<stddef.h> are pulled in via csrc/hmac/hmac.h. C23 language
 * features (constexpr, static_assert) used freely. No global constructor, no
 * side effect at load.
 */
#ifndef WASM_CRYPTO_PBKDF2_H
#define WASM_CRYPTO_PBKDF2_H

#include <stdint.h>
#include <stddef.h>

#include "csrc/hmac/hmac.h"

/*
 * pbkdf2_derive — RFC 8018 §5.2 PBKDF2 derivation.
 *
 * pwd/pwdLen:   password bytes
 * salt/saltLen: salt bytes (must not be NULL when saltLen > 0)
 * iters:        iteration count (must be > 0)
 * dk/dkLen:     output buffer; dkLen must be > 0.
 *               The buffer is filled with exactly dkLen bytes of derived key.
 *
 * Returns 0 on success, -1 on a bad hashId, iters <= 0, or dkLen <= 0.
 */
int pbkdf2_derive(int hashId,
                  const uint8_t *pwd,  size_t pwdLen,
                  const uint8_t *salt, size_t saltLen,
                  int iters,
                  uint8_t *dk, size_t dkLen);

#endif /* WASM_CRYPTO_PBKDF2_H */
