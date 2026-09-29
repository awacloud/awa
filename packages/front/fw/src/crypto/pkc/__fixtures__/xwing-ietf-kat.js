// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Official IETF X-Wing KAT vectors — production fixture for the
 * `crypto/pkc/hybridKem` (X-Wing) conformance suite and the reproducible
 * combiner-KAT regeneration (`tools/hybrid-kat-regen.js`).
 *
 * Provenance: `draft-connolly-cfrg-xwing-kem` **rev -06** Appendix C test
 * vectors (tv0..tv2), byte-extracted from the official IETF/libsodium reference
 * KAT (`crypto_kem/xwing/kem_xwing.c`). That reference `.c` is UNTRACKED and
 * absent from fresh worktrees (W1 lesson); these transcribed bytes are the
 * tracked source of truth. See `hybrid-kat.provenance.md` (per-file SHA-256).
 * Each vector is a DETERMINISTIC seed → keypair → deterministic encaps.
 *   - seed         : 32-byte X-Wing seed (→ SK; expand-on-use)
 *   - randomness   : 64-byte deterministic encaps randomness (msg32 || eskX32)
 *   - ekPrefix     : first 32 bytes of the 1216-byte public (encapsulation) key
 *   - ctPrefix     : first 26 bytes of the 1120-byte ciphertext
 *   - ss           : 32-byte shared secret
 * We verify the FULL ss (the primary KAT claim); ek/ct are prefix-only because
 * that is what the reference vector publishes.
 */

export const XWING_KAT = [
    {
        name: 'tv0',
        seed: '0000000000000000000000000000000000000000000000000000000000000000',
        randomness:
            '6464646464646464646464646464646464646464646464646464646464646464' +
            '6464646464646464646464646464646464646464646464646464646464646464',
        ekPrefix: '3d209f716752f6408e7f89bceef97ac388530045377927644ef046c0a7cae978',
        ctPrefix: 'd81018a94f8078e02105beaa814e003390befa4589bb614f7739',
        ss: 'e5ba94031ea6efd69c09c254f6d9783136ba6037e2d4c43bcccf19d6f3f4343a'
    },
    {
        name: 'tv1',
        seed: '0101010101010101010101010101010101010101010101010101010101010101',
        randomness:
            '6565656565656565656565656565656565656565656565656565656565656565' +
            '6565656565656565656565656565656565656565656565656565656565656565',
        ekPrefix: 'ec7b50cddc8360f98b189bac73d395ef947b37d8453886a253269f7b18b9eb78',
        ctPrefix: '600ecf4026683898d0e339eeea9ebd437a4a802952bf32bfa326',
        ss: '750300db25bff9620e893c2c6fcab9bf04d7f2e543b5b39420485626fa274908'
    },
    {
        name: 'tv2',
        seed: '0202020202020202020202020202020202020202020202020202020202020202',
        randomness:
            '6666666666666666666666666666666666666666666666666666666666666666' +
            '6666666666666666666666666666666666666666666666666666666666666666',
        ekPrefix: '08118d8819772292c976ec971ee3039195800c823544484595cc63450b9db941',
        ctPrefix: '413c55d5710bae6376761dada807daffd4dc45f9f70d825e0d46',
        ss: '87292f18b2e7af74bb8839ddee15e832d2f4bfac14dc84f824906d951436aafa'
    }
];
