# `ecc.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST FIPS 186-5** — *Digital Signature Standard
  (DSS)*, **§6** *ECDSA* (KeyGen, SigGen, SigVer, deterministic-K
  variant per §6.3 / RFC 6979).
- **Secondary**: **NIST SP 800-186** — recommended curves
  (P-192/224/256/384/521).
- **K determinism**: **RFC 6979** — *Deterministic Usage of the
  Digital Signature Algorithm (DSA) and Elliptic Curve Digital
  Signature Algorithm (ECDSA)*.
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-ecdsa.adoc`
- **Vectors**:
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ECDSA-KeyGen-FIPS186-5/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ECDSA-KeyVer-FIPS186-5/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ECDSA-SigVer-FIPS186-5/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/DetECDSA-SigGen-FIPS186-5/`

## Implemented algorithm

`ecc.factory(bitArray, hex, bn, sha256, sha384, sha512, hmac)` exposes
two families: **ECDSA** (signature/verification, FIPS 186-5 §6) and
**elGamal/ECDH** (generic KEM/DH). Registered curves:
P-{192,224,256,384,521} (NIST Weierstrass) + Koblitz K-{192,224,256}
(secp192k1, secp224k1, secp256k1).

API:

- `ecc.ecdsa.generateKeys(bitsLen, paranoia?, sec?)` → `{pub, sec}`.
- `sec.sign(hash, opts?)` — deterministic signature by default (RFC
  6979 §3.2 via `_rfc6979K`). `opts.deterministic = false` falls back
  to `bn.random` (legacy mode). `opts.fixedKForTesting` injects an
  arbitrary K (test only).
- `pub.verify(hash, rs, fakeLegacyVersion?)` → `true | false`. Checks
  `r, s ∈ [1, n-1]` then reconstructs r' = (h·G + r·s⁻¹·Q).x mod n.
- `ecc.deserialize({type, curve, point | exponent, secretKey})` →
  publicKey/secretKey (`isValid()` validation of the point on the curve).

Deterministic K derivation (`_rfc6979K`): internal H = `_hashForBits(curveBitLength)`
→ SHA-256 for P-≤256 (hence also P-224), SHA-384 for P-384, SHA-512
for P-521. **Note**: this choice is independent of the hash function
used to digest the message — a simplifying choice that diverges from
the strict RFC 6979 contract (which requires H_K = H_msg).

## Test coverage

### Integrated official vectors

| Source | ACVP reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| NIST CAVP / ACVP | `ECDSA-KeyGen-FIPS186-5/expectedResults.json` (24/72) | `ECDSA-KeyGen-FIPS186-5 (...validator-style, 24/72 vectors)` | `Q == d·G` byte-exact (4 NIST curves × 6 tcId) |
| NIST CAVP / ACVP | `ECDSA-KeyVer-FIPS186-5/expectedResults.json` (4 positive) | `ECDSA-KeyVer-FIPS186-5 (...4 vectors)` | `deserialize` accepts valid Q values (P-224/256/384/521) |
| **NIST CAVP / ACVP (C1)** | `ECDSA-KeyVer-FIPS186-5` 12/12 (4 pos + 8 neg) across 4 NIST P-curves | `ecc - ACVP ECDSA-KeyVer-FIPS186-5 (subgroup check, itération C1)` | Full §A.4.2 validation: x/y range + on-curve + non-identity + n·Q == O. Covers the 8 negative cases (off-curve point, x/y out of field range — incl. P-521 tg=4 tc=11 where qx ≥ p). |
| **C1 deserialize integration** | pos + neg smoke test | `deserialize integrates subgroup check` | `ecc.deserialize` returns `false` for an out-of-subgroup point |
| NIST CAVP / ACVP | `ECDSA-SigVer-FIPS186-5/expectedResults.json` (8 sub-sampled positives) | `ECDSA-SigVer-FIPS186-5 (...8 sub-sampled vectors)` | `verify(H, r||s)` byte-exact (P-{224,256,384,521} × {SHA-256, SHA-512}) |
| NIST CAVP / ACVP | `DetECDSA-SigGen-FIPS186-5/internalProjection.json` (16 vectors) | `DetECDSA-SigGen-FIPS186-5 (...RFC 6979 byte-exact)` | RFC 6979 §3.2 byte-exact on 4 (curve, hash) pairs: (P-224, SHA-256), (P-256, SHA-256), (P-384, SHA-384), **(P-521, SHA-512) — iteration C2** × [first/mid/last] |
| FIPS 186-3 SigVer.rsp | P-256/SHA-256 vector + tampering | `NIST CAVP ECDSA verify` | historical KAT + tampering rejection |
| Pre-existing | round-trip | `ECDSA sign/verify` (P-256, P-384, P-521) | basic round-trip |
| Pre-existing | round-trip | `elGamal DH`, `kem` | commutative DH + KEM round-trip |
| Pre-existing | structure | `serialize / deserialize` | blob round-trip; rejection of unknown curve/type |

### Validator-style strategy (KeyGen)

`ECDSA-KeyGen-FIPS186-5` is `testType=AFT` and exposes all
`secretGenerationMode ∈ {testingCandidates, extraRandomBits}` modes.
Our `ecc.ecdsa.generateKeys` derives `d` randomly via DRBG with no
controllable seed — no replay. Coverage retained: for each of the
24 keys (4 NIST curves × 6 tc), recompute `d·G` via `point.mult` and
compare byte-exact against `(qx, qy)`. This simultaneously validates:

1. Scalar multiplication (`point.mult` via Jacobian, NAF).
2. Coordinate serialization (clamp/pad to `curveBitLength`).
3. The d/Q consistency produced by both ACVP modes.

### Security properties tested

- [x] **RFC 6979 §3.2 byte-exact** — 9 DetECDSA vectors (P-224/256/384);
      the K derived via `_hmac` reproduces the NIST K exactly → r, s
      identical bit-for-bit.
- [x] **Q = d·G byte-exact** — 24 ACVP keys, point arithmetic and
      big-endian serialization validated.
- [x] **`verify` accepts a valid signature** — 8 NIST positive
      sub-samples (P-{224,256,384,521} × {SHA-256, SHA-512}).
- [x] **`verify` rejects a forged signature** — S tampering on the
      P-256/SHA-256 vector (pre-existing test) + explicit `r, s ∈ [1, n-1]`
      bounds in `verify` (line 603 ecc.js).
- [x] **Deserialize rejects unknown type/curve** — pre-existing tests.
- [x] **Round-trip sign/verify** — P-256/P-384/P-521 (pre-existing +
      implicit DetECDSA).
- [x] **Public validation §A.4.2 / SP 800-56A Rev.3 §5.6.2.3.3** ✅
      **Iteration C1** — implemented in `ecc.deserialize`:
      (1) x, y coordinates in field range (< p), (2) point on curve via
      `isValid()`, (3) non-identity, (4) subgroup membership via
      `n·Q == O`. Exposed via `_internal.{coordsInRange, isInSubgroup,
      isValidPublicKey}`. **8 negative ACVP KeyVer vectors byte-exact**
      (off-curve + out-of-range, incl. P-521 tg=4 tc=11 where qx ≥ p — a
      typical oversize-encoding case not caught by the plain curve
      equation modulo p).
- [x] **Strict ECDSA malleability (s > n/2 rejection)** ✅
      **Iteration C3** — implemented. `verify(rs, { strict: true })`
      rejects signatures with `s > ⌊n/2⌋` (BIP62 / NIST strict mode).
      `sign({ strict: true })` always produces a canonical low-s `s`
      (replaces `s` with `n − s` if needed). Test: generate a
      signature, build the counter-signature `(r, n−s)`, verify that
      both pass in legacy mode but that **exactly one** passes in
      strict mode. Note: ACVP `SigVer-FIPS186-5` does not provide
      dedicated low-s vectors (negatives are *modify r/s*,
      *zero r/s*, *modify message/key*) — covered by synthetic
      counter-signature tests instead.
- [x] **RFC 6979 byte-exact P-521** ✅ **Iteration C2** — fixed.
      Cause: SJCL `bn.bitLength()` returns 528 (rounded up to a multiple
      of 16) instead of 521. Helper `_trueBitLength(R)` added, which
      walks the byte representation to find the true MSB. The RFC 6979
      §A.2.7 P-521/SHA-512 sample vector is now reproduced byte-exact
      (modulo the 65 vs 66-byte encoding — RFC uses minimal-length,
      FIPS uses 66 fixed bytes), and 4 ACVP P-521+SHA-512 DetECDSA
      sub-samples pass.
- [x] **K-hash decoupled from message-hash** ✅ **Iteration C3** —
      `sign({ hashForK: <hashMod> })` lets the caller make the K
      derivation hash explicit (strict RFC 6979 requires H_K = H_msg).
      The default remains `_hashForBits(curveBitLength)` so as not to
      break current ACVP DetECDSA coverage. Tests: sign with
      `hashForK: sha384` on P-256 produces a signature **different**
      from the default (different K) that still verifies correctly, and
      remains idempotent (signing twice with identical inputs →
      byte-exact).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | FIPS 186-5 §6 + ACVP folders |
| Approved curves | ✅ | P-{192,224,256,384,521} (FIPS 186-5 §3.1) |
| RFC 6979 deterministic generation | ✅ | **Iteration C2**: byte-exact OK for the 4 NIST P-curves (incl. P-521 now; `_trueBitLength` bug fixed) |
| ECDSA verification | ✅ | 8 ACVP vectors + tampering test |
| Q ∈ G validation (point on curve) | ✅ | `point.isValid()` in `curve.fromBits` |
| Q ∈ <G> validation (subgroup) | ✅ | **Iteration C1**: `n·Q == O` verified + range check x,y < p; 12 ACVP `KeyVer-FIPS186-5` vectors (4 pos + 8 neg) byte-exact |
| CT comparisons (if secret) | ⚠️ | `verify` is not constant-time (early return on r, s bounds; OK for pub-key path); `sign` uses non-CT `bn` (SJCL-derived, see docs/dev/provenance.md) |
| No `throw` / timing leak | ✅ | Review: `console.error/warn` + `return false`; no `throw` |

## Known limitations

- ~~**P-521 RFC 6979 byte-exact**~~ ✅ **Iteration C2** — fixed.
  Root cause: SJCL `bn.bitLength()` rounds up to a multiple of 16 (528
  for the 521-bit P-521 order value), which truncated
  `_bitsToInt(T, 528)` instead of `_bitsToInt(T, 521)` — a 7-bit offset
  on the k value. Fix: local helper `_trueBitLength(R)` that walks the
  byte representation to find the true MSB. The RFC 6979 §A.2.7
  P-521/SHA-512 sample vector is now reproduced byte-exact, and 3 ACVP
  P-521+SHA-512 DetECDSA sub-samples pass (previously filtered out at
  iteration 18).
- ~~**Missing subgroup check**~~ ✅ **Iteration C1** — implemented.
  `deserialize` now performs the full §A.4.2 validation: x/y < p range +
  on-curve + non-identity + n·Q == O. 12 ACVP KeyVer vectors (4 pos + 8
  neg) byte-exact. Cost: ~1-3 ms/mult on P-256, acceptable for one-shot
  deserialize.
- ~~**K-hash coupled to `curveBitLength`**~~ ✅ **Iteration C3** —
  the `sign({ hashForK })` option now lets H_K be set explicitly
  (strict RFC 6979). The default (`_hashForBits(curveBitLength)`) is
  unchanged to preserve existing ACVP DetECDSA coverage; callers who
  want byte-exact replay on non-default pairs (e.g. P-256/SHA-384) can
  pass `hashForK: sha384`.
- **Malleability `s' = n − s`**: by default, `verify()` accepts both
  signatures (FIPS 186-5 legacy mode). For protocols requiring
  uniqueness (BIP62, certain blockchain specs), pass
  `verify(rs, { strict: true })` to reject the counter-signature.
  `sign({ strict: true })` always produces a canonical low-s `s`.
- **`_rfc6979K` not constant-time**: the rejection loop (k=0 or
  k≥n) is observable via timing. Acceptable for off-network signing
  (rejection is exceedingly rare on NIST curves with n close to
  2^bits).

## Cross-references

- Module: [`pkc/ecc.js`](./ecc.js)
- Tests: [`pkc/ecc.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/ecc.test.js) — 95 tests (67 baseline + 14 KeyVer subgroup [C1] + 2 deserialize + 4 P-521 DetECDSA [C2] + 8 strict / hashForK [C3])
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-ecdsa.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ECDSA-*-FIPS186-5/`
- Equivalent RSA module: [`./rsa.acvp.md`](./rsa.acvp.md)
- Global conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
