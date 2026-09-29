/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * hkdf.h — RFC 5869 HKDF extract/expand over the OWN HMAC core (C23,
 * freestanding wasm32).
 *
 * This is a THIN KDF wrapper: HKDF is HMAC-Extract + HMAC-Expand with no new
 * primitive math. The own HMAC core (csrc/hmac/hmac.{c,h}, task 06), itself
 * over the own SHA-2 core (csrc/sha2/, task 02), is consumed READ-ONLY
 * (#include) — neither HMAC nor SHA-2 is re-implemented or duplicated here.
 *
 * hashId enum (mirrors the frozen sha2 variantId / hmac hashId):
 *   256 = HKDF-SHA-256, 384 = HKDF-SHA-384, 512 = HKDF-SHA-512.
 *
 * RFC 5869 §2.2 (Extract): PRK = HMAC-Hash(salt, IKM)
 *   Note: salt is the HMAC *key*, IKM is the HMAC *message*. If salt is absent
 *   (saltLen == 0 with saltPtr == NULL), use a string of HashLen zero bytes as
 *   defined in RFC 5869 §2.2.
 *
 * RFC 5869 §2.3 (Expand): OKM = T(1) ∥ T(2) ∥ … ∥ T(N), truncated to L bytes.
 *   T(0) = empty, T(i) = HMAC(PRK, T(i-1) ∥ info ∥ i).
 *   Reject outLen > 255 * HashLen (RFC 5869 §2.3 constraint).
 *
 * Freestanding wasm32: no libc, no C23 library headers (<stdbit.h> avoided).
 * Only <stdint.h>/<stddef.h> pulled in. C23 language features (constexpr,
 * static_assert) used freely. No global constructor, no side effect at load.
 *
 * Constant-time posture: dispatch is on the PUBLIC hashId only; no
 * secret-dependent branch over key/IKM bytes. Inherits HMAC's CT posture.
 * The in-engine CT proof is acvp-wasm-ct-fuzz's job — this code does NOT
 * self-attest constant-time.
 */
#ifndef WASM_CRYPTO_HKDF_H
#define WASM_CRYPTO_HKDF_H

#include <stdint.h>
#include <stddef.h>

#include "csrc/hmac/hmac.h"

/*
 * RFC 5869 §2.2 Extract: PRK = HMAC-Hash(salt, IKM).
 *
 * prk must point to a buffer of at least hmac_digest_size(hashId) bytes
 * (32/48/64 for SHA-256/384/512). The caller is responsible for sizing it.
 *
 * salt: if saltLen == 0 (regardless of saltPtr), the RFC-specified default
 * (HashLen zero bytes) is substituted automatically.
 *
 * Returns 0 on success, -1 on a bad hashId.
 */
int hkdf_extract(int hashId,
                 const uint8_t *salt, size_t saltLen,
                 const uint8_t *ikm,  size_t ikmLen,
                 uint8_t *prk);

/*
 * RFC 5869 §2.3 Expand: OKM[0..outLen) from PRK + info.
 *
 * prk must be exactly hmac_digest_size(hashId) bytes.
 * outLen must be > 0 and <= 255 * hmac_digest_size(hashId).
 *
 * Returns 0 on success, -1 on a bad hashId or outLen out of range.
 */
int hkdf_expand(int hashId,
                const uint8_t *prk,
                const uint8_t *info, size_t infoLen,
                uint8_t *okm,  size_t outLen);

#endif /* WASM_CRYPTO_HKDF_H */
