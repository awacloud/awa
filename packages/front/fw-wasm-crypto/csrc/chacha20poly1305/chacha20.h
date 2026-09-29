/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * chacha20.h — RFC 8439 ChaCha20 stream cipher (C23).
 *
 * Ported from spikes/01-great-equalizer-build-seam, productionized into
 * @awacloud/fw-wasm-crypto. Algorithm bodies unchanged from the spike.
 */
#ifndef SPIKE_CHACHA20_H
#define SPIKE_CHACHA20_H

#include "common.h"

/*
 * Generate the keystream block at `counter` for (key, nonce) and write 64
 * bytes to `out`. Used to derive the Poly1305 one-time key (counter 0) and to
 * encrypt the message (counter >= 1).
 */
void chacha20_block(const uint8_t key[CHACHA20_KEY_BYTES],
                    const uint8_t nonce[CHACHA20_NONCE_BYTES],
                    uint32_t counter,
                    uint8_t out[CHACHA20_BLOCK_BYTES]);

/*
 * XOR-encrypt (or decrypt — the cipher is symmetric) `len` bytes from `in`
 * into `out` using the ChaCha20 keystream starting at block `counter`.
 * `in` and `out` may alias.
 */
void chacha20_xor(const uint8_t key[CHACHA20_KEY_BYTES],
                  const uint8_t nonce[CHACHA20_NONCE_BYTES],
                  uint32_t counter,
                  const uint8_t *in,
                  uint8_t *out,
                  size_t len);

#endif /* SPIKE_CHACHA20_H */
