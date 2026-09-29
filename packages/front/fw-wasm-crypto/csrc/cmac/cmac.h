/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * cmac.h — own AES-CMAC framing (NIST SP 800-38B) over a supplied AES block.
 *
 * The CMAC *construction* (subkey K1/K2 derivation + CBC-MAC final-block XOR) is
 * implemented here; the AES *block cipher* is NOT — it is supplied by the caller
 * as a function pointer + opaque context, which the wasm-crypto shim wires to the
 * vendored constant-time BearSSL `aes_ct64` core. This keeps the block primitive
 * vendored (never roll an own AES) while owning only the MAC framing.
 *
 * The block size is fixed at 16 bytes (AES). All buffers the caller passes are
 * raw byte buffers in the module's linear memory.
 */

#ifndef WASM_CRYPTO_CMAC_H
#define WASM_CRYPTO_CMAC_H

#include <stddef.h>
#include <stdint.h>

#define CMAC_BLOCK_BYTES 16

/*
 * AES single-block ECB encrypt callback. Encrypts the 16-byte block `in` under
 * the key bound in `ctx`, writing the 16-byte result to `out`. `in` and `out`
 * may alias. MUST be constant-time (the wired BearSSL ct64 core is).
 */
typedef void (*cmac_block_encrypt_fn)(void *ctx, const uint8_t in[CMAC_BLOCK_BYTES],
                                      uint8_t out[CMAC_BLOCK_BYTES]);

/*
 * Compute the full 16-byte AES-CMAC tag of `msg` (`msgLen` bytes; may be 0) and
 * write it to `tag` (16 bytes). The AES block cipher is provided via `enc`/`ctx`.
 *
 * Implements SP 800-38B:
 *   - K1/K2 derived from AES_K(0^128) by GF(2^128) doubling (constant-time
 *     conditional XOR with Rb=0x87 — no secret-dependent branch),
 *   - full blocks processed as CBC-MAC,
 *   - the final block XORed with K1 (complete final block) or K2 (the final block
 *     padded with 0x80 00…00 when the message is empty or not a block multiple),
 *   - one final AES encrypt → the 16-byte tag.
 *
 * The caller (shim) truncates the 16-byte tag to the requested tag length.
 */
void cmac_aes(cmac_block_encrypt_fn enc, void *ctx,
              const uint8_t *msg, size_t msgLen,
              uint8_t tag[CMAC_BLOCK_BYTES]);

#endif /* WASM_CRYPTO_CMAC_H */
