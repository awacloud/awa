/*
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Freestanding compat shim for <openssl/obj_mac.h> — wasm-crypto SLH-DSA.
 *
 * slh_params.c tags each parameter set with a NID_SLH_DSA_* object id (stored in
 * params->type and exposed via ossl_slh_dsa_key_get_type()). The algorithm core
 * never branches on these values, and the frozen BATCH_11 ABI selects parameter
 * sets by psId, not by NID, so the concrete values are immaterial. We give them
 * the upstream OpenSSL NID numbers for fidelity. C23. No side effects.
 */
#ifndef WASM_CRYPTO_OSSL_OBJ_MAC_H
#define WASM_CRYPTO_OSSL_OBJ_MAC_H

#define NID_SLH_DSA_SHA2_128s  1460
#define NID_SLH_DSA_SHA2_128f  1461
#define NID_SLH_DSA_SHA2_192s  1462
#define NID_SLH_DSA_SHA2_192f  1463
#define NID_SLH_DSA_SHA2_256s  1464
#define NID_SLH_DSA_SHA2_256f  1465
#define NID_SLH_DSA_SHAKE_128s 1466
#define NID_SLH_DSA_SHAKE_128f 1467
#define NID_SLH_DSA_SHAKE_192s 1468
#define NID_SLH_DSA_SHAKE_192f 1469
#define NID_SLH_DSA_SHAKE_256s 1470
#define NID_SLH_DSA_SHAKE_256f 1471

#endif /* WASM_CRYPTO_OSSL_OBJ_MAC_H */
