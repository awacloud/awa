// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Official interop test vectors for the id-MLDSA65-ECDSA-P256-SHA512 composite
 * signature — vendored for byte-exact conformance of `crypto/pkc/hybridSign`.
 *
 * Source  : lamps-wg/draft-composite-sigs  src/testvectors_wrapped.json
 * Revision: draft-ietf-lamps-pq-composite-sigs-19  (numbered IETF revision, 2026-04-21)
 * Tag URL : https://raw.githubusercontent.com/lamps-wg/draft-composite-sigs/draft-ietf-lamps-pq-composite-sigs-19/src/testvectors_wrapped.json
 * Commit  : 6df63fdcee0487b6b02271f928d0572c4720fb11  (tag deref; re-vendored 2026-07-09)
 * History : first vendored from main commit 1bb9f5c6 (2026-07-07, the commit the W0
 *           spike verified). The numbered revision -19 was re-fetched 2026-07-09
 *           and confirmed BYTE-IDENTICAL to the commit 1bb9f5c6 bytes for every field
 *           (PK, empty-ctx sig, with-ctx sig, message, ctx): the WG numbered
 *           revision retained the construction (ASCII `Label`, no per-signature
 *           randomizer `r`). Provenance is re-pinned to the numbered revision.
 *           See `hybrid-kat.provenance.md` (per-file SHA-256 + regen command).
 *
 * Algorithm : id-MLDSA65-ECDSA-P256-SHA512  (OID 1.3.6.1.5.5.7.6.45)
 *   Label   (ASCII) : "COMPSIG-MLDSA65-ECDSA-P256-SHA512"
 *
 * NOTE — the draft's own prose tables are internally inconsistent for this
 * variant: src/labelsTable.md lists the label as "COMPSIG-MLDSA65-P256-SHA512"
 * while src/algParams.md lists "COMPSIG-MLDSA65-ECDSA-P256-SHA512". The committed
 * interop vectors below are the authoritative oracle: they verify ONLY with the
 * algParams.md label "COMPSIG-MLDSA65-ECDSA-P256-SHA512" (the shorter label
 * yields a different M' and fails both component verifies). The module uses the
 * vector-proven label.
 *   Prefix  (ASCII) : "CompositeAlgorithmSignatures2025"
 *   PH              : SHA-512
 *   M' = Prefix || Label || len(ctx) || ctx || SHA-512(M)
 *   composite pk    = mldsaPK[1952] || ECDSA-P256PK[65]   (2017 B, plain concat)
 *   composite sig   = mldsaSig[3309] || DER-encoded ECDSA-P256 sig (variable; inner hash SHA-256)
 *   verify          = ML-DSA-65.Verify(mldsaPK, M', mldsaSig, ctx=Label) AND
 *                     ECDSA-P256.Verify over M'
 *
 * Two official cases: empty ctx (`SIG_EMPTYCTX_B64`) and non-empty ctx
 * (`SIG_WITHCTX_B64`, ctx = `CTX`). base64 standard alphabet, unwrapped.
 */

/** Global message M signed in every LAMPS composite test case. */
export const M = "The quick brown fox jumps over the lazy dog.";
/** Non-empty application context for the with-context case. */
export const CTX = "The lethargic, colorless dog sat beneath the energetic, stationary fox.";

export const LABEL_ASCII = "COMPSIG-MLDSA65-ECDSA-P256-SHA512";
export const PREFIX_ASCII = "CompositeAlgorithmSignatures2025";

/** Composite public key (base64), 2017 B. */
export const PK_B64 =
    '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';

/** Composite signature over EMPTY ctx (base64), 3380 B. */
export const SIG_EMPTYCTX_B64 =
    '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' +
    'N/g6oSA=';

/** Composite signature over CTX (base64), 3381 B. */
export const SIG_WITHCTX_B64 =
    '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' +
    'owzbxl/n';
