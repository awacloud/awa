# `slh_dsa.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST FIPS 205** — *Stateless Hash-Based Digital
  Signature Standard* (August 2024). Implements SLH-DSA-{SHAKE,SHA2}-
  {128,192,256}{f,s} (12 variants: §11.1 SHAKE family + §11.2 SHA2
  family with 22-byte compressed addresses, `PRFmsg` = HMAC-SHA-2,
  `Hmsg` = MGF1).
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-slh-dsa.adoc`
- **Vectors**:
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SLH-DSA-keyGen-FIPS205/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SLH-DSA-sigGen-FIPS205/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SLH-DSA-sigVer-FIPS205/`

## Implemented algorithm

`slh_dsa.factory(sha3, sha256, sha512, hmac, bitArray, random)` exposes
the 12 FIPS 205 variants (Table 2: N∈{16,24,32}, total height H,
number of layers D, FORS arity A, top-tree H', etc.). PureSLH-DSA
implementation (§10.1) — wrapper M' = `0x00 ‖ |ctx| ‖ ctx ‖ msg`
(§10.2.1) ahead of the §6 pipeline (PRFmsg → R → tree/leafIdx/md →
FORS → hypertree).

Public API (`Uint8Array`):

- `keygen(seed?)` → `{ publicKey: 2N, secretKey: 4N }`. seed = 3N bytes
  = `(skSeed ‖ skPRF ‖ pkSeed)`.
- `sign(msg, sk, opts?)` → signature or `false`. opts.context ≤ 255
  bytes; opts.extraEntropy `false` (deterministic: rnd = pkSeed),
  `undefined` (hedged via random.bytes), or `Uint8Array(N)` (rnd
  injected for reproducibility).
- `verify(sig, msg, publicKey, opts?)` → `true | false`. Constant-time
  on the final recomputed root equality (accumulated XOR), early return
  only on invalid sizes.

**Iteration E4 (FIPS 140-3 upgrade plan)**: added the
**HashSLH-DSA** variants (FIPS 205 §10.2.2 algos 24+25) and the
**internal** interface (§6 raw, without the M' wrapper):
- `signPh(msg, sk, hashAlg, hashMod, opts)` / `verifyPh(sig, msg, pk, hashAlg, hashMod, opts)`.
  Supported hashes: `SHA2-{224,256,384,512}`, `SHA2-512/{224,256}`,
  `SHA3-{224,256,384,512}`, `SHAKE-{128,256}` (12 algorithms; DER OIDs
  conforming to FIPS 205, shared with ML-DSA E3).
- `_internal.signInternal(M, sk, opts)` / `_internal.verifyInternal(sig, M, pk)`:
  bypasses the §10.2.1 wrapper; M is passed as-is.

Note: SLH-DSA has **NO** externalMu mode (no intermediate mu in
FIPS 205 §6 — hashing is embedded in the PRFmsg + Hmsg pipeline).

## Test coverage

### Integrated official vectors

| Source | ACVP reference | Test (`describe`) | Property verified |
|---|---|---|---|
| NIST CAVP / ACVP | `SLH-DSA-keyGen-FIPS205` (36/120 sub-samples) | `SLH-DSA-keyGen-FIPS205 (...36 sub-samples)` | `keygen(skSeed‖skPRF‖pkSeed) == (pk, sk)` byte-exact (12 paramSets × 3 [first/mid/last]) |
| NIST CAVP / ACVP | `SLH-DSA-sigGen-FIPS205` external+pure det=true 128f | `SLH-DSA-sigGen-FIPS205 / external+pure deterministic` | `sign(msg, sk, {context, extraEntropy:false}) == sig` byte-exact (SHA2-128f + SHAKE-128f, 1 vector each) |
| NIST CAVP / ACVP | `SLH-DSA-sigVer-FIPS205` external+pure 'f' (15/84 sub-samples) | `SLH-DSA-sigVer-FIPS205 / external+pure (...15 sub-samples)` | `verify(sig, msg, pk, {context})` ↔ `testPassed` (6 paramSets × [length-fail, valid, modified-sig], covers the NIST reasons: *invalid signature - too large/small*, *valid*, *modified signature - SIGFORS/SIGHT/R*) |
| Pre-existing (noble-pq KAT) | SLH-DSA-SHAKE-128f keygen + sign + verify | `SLH-DSA-SHAKE-128f KAT` (3 tests) | byte-exact pk + sign + verify |
| Pre-existing (noble-pq KAT) | SLH-DSA-SHA2-128f keygen + sign + verify | `SLH-DSA-SHA2-128f KAT` (3 tests) | byte-exact pk + sign + verify |
| Pre-existing | SLH-DSA-SHA2-192f keygen + round-trip | `SLH-DSA-SHA2-192f KAT` + round-trip | byte-exact pk + round-trip (SHA-512 lane H1) |
| Pre-existing | tampering signature/message | 3 tests `verify rejects tampered/modified` | rejects bit-flip and message-flip |
| Pre-existing | determinism | `SLH-DSA-SHAKE-128f deterministic sign is reproducible` | idempotent sign for identical seed |

### Security properties tested

- [x] **Determinism (extraEntropy=false → rnd=pkSeed)** — 2 byte-exact
      ACVP vectors (SHA2-128f, SHAKE-128f) + noble-pq KAT + `reproducible`
      test.
- [x] **M' wrapper §10.2.1** — `0x00 ‖ |ctx| ‖ ctx ‖ msg`, ctx ≤ 255
      enforced; covered by 2 ACVP sigGen vectors with real ctx
      (193 and 46 bytes respectively) + 15 sigVer vectors.
- [x] **sig/pk/sk length validation** — early return false; covered
      by 6 ACVP sigVer "invalid signature - too large/small" vectors.
- [x] **Constant-time comparison of the final root** — accumulated XOR (cf.
      noble-pq derivation, slh_dsa.js verify path).
- [x] **Tampering rejection** — negative ACVP vectors with explicit
      NIST reasons: *modified signature - SIGFORS* (altered FORS
      auth path), *SIGHT* (altered hypertree WOTS+), *R* (altered
      randomness), *modified message*. Coverage across the SHA2 and
      SHAKE families, 128f/192f/256f.
- [x] **Hash family parity** — 12 byte-exact keyGen paramSets,
      validating SHA-256/SHA-512/SHAKE-128/SHAKE-256 wiring (H₁ lanes
      with 22-byte address compression for SHA2 §11.2).
- [x] **No `throw`** — early return + `console.warn` (review
      lines 481-505, 552-554).
- [x] **HashSLH-DSA (preHash variant)** ✅ **Iteration E4** — implemented.
      `signPh(msg, sk, hashAlg, hashMod, opts)` / `verifyPh` apply
      PH(msg) with the injected hash + the FIPS 205 §10.2.2 algo 24 wrapper
      (`0x01 || |ctx| || ctx || OID(hashAlg) || PH(msg)`). 12 hashAlg
      values supported. **2 SigGen + 12 SigVer ACVP vectors byte-exact** on
      the 128f variants (aggressive sub-sampling since signing 's' costs
      minutes/op).
- [x] **"internal" interface** ✅ **Iteration E4** — exposed via
      `_internal.signInternal(M, sk, opts)` and `_internal.verifyInternal`.
      Bypasses the §10.2.1 wrapper; M is passed as-is to _signCore.
      **2 SigGen + 12 SigVer ACVP vectors byte-exact**.
- [ ] **Exhaustive sign/verify on 's' variants** — sigGen on 256s
      takes ~5 min/vector, verify ~10-20 s/vector; outside the module
      budget. Structural coverage via exhaustive keyGen (`s`
      variants included in the 36 sub-samples) + parity with `f`
      variants (same hashes + same HT/FORS structure).
- [ ] **deterministic=false (additionalRandomness)** — not covered
      as it is redundant with the byte-exact deterministic=true
      coverage (same primitives, only rnd differs).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | FIPS 205 §6-11 + 3 official ACVP folders |
| Approved paramSets | ✅ | 12/12 variants (FIPS 205 Table 2) |
| Deterministic generation (seed) | ✅ | byte-exact on 36 ACVP keyGen vectors |
| Deterministic signature (rnd=pkSeed) | ✅ | byte-exact on 2 ACVP sigGen vectors + noble KAT |
| SLH-DSA verification | ✅ | 15 ACVP sigVer vectors (positives + 4 NIST negative reasons) |
| Public validation (pk/sig length) | ✅ | early return false; 6 "size" ACVP vectors |
| Power-on KAT / self-test | N/A | permanent KATs via 2 sigGen vectors + noble KAT |
| CT comparisons (root) | ✅ | accumulated XOR on the final equality |
| No `throw` / timing leak | ✅ | Review: `console.warn` + `return false` |
| Entropy source (hedged sign) | inherited | `random.bytes` (CTR_DRBG SP 800-90A) |

## Known limitations

- **Aggressive sub-sampling** by default. **Iteration H3**: `CRYPTO_FULL=1`
  enables 120/120 keyGen + full external+pure sigVer (180 of 504, the
  preHash/internal cases covered by the E4 sub-sample) → 385 tests in ~135 s.
  - keyGen: 36/120 [first/mid/last] by default → **120/120 under CRYPTO_FULL**.
  - sigGen: 2/144 by default (SHA2-128f + SHAKE-128f byte-exact). **Full
    sigGen (624) deliberately not wired even under CRYPTO_FULL**: signing
    costs minutes/op for the 's' variants, an estimated total of hours.
  - sigVer: 15/168 by default across the 6 `f` paramSets → **180 (full
    external+pure) under CRYPTO_FULL**.
- ~~**Out of scope: HashSLH-DSA + signatureInterface=internal**~~
  ✅ **Iteration E4** — implemented and validated ACVP byte-exact (see
  the `[x]` checks above). Still out of scope: the `additionalRandomness`
  path (deterministic=false with ACVP rnd) — coverage redundant with
  byte-exact deterministic=true, and **`externalMu`**, which FIPS 205
  does not define for SLH-DSA (no intermediate mu in §6).
- **Not formally constant-time**: a hash-based implementation whose
  WOTS+/FORS loops depend only on the ciphertext and public key → no
  secret leakage (the `tree`/`leafIdx` indices come from
  `_hashMessage(R, pk, msg)`, itself computed from the message + public
  R). The only secret used in a loop is `skSeed` via `PRFaddr` (HMAC or
  SHAKE), assumed CT by the underlying hash primitives.

## Cross-references

- Module: [`pkc/slh_dsa.js`](./slh_dsa.js)
- Tests: [`pkc/slh_dsa.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/slh_dsa.test.js) — 97 tests (69 baseline + 28 iteration E4: 2 sigGen-ph + 2 internal + 12 sigVer-ph + 12 sigVer-internal)
- Pre-existing KAT: [`pkc/slh_dsa.kat.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/slh_dsa.kat.js) (noble-pq SLH-DSA-SHAKE-128f + SLH-DSA-SHA2-128f)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-slh-dsa.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SLH-DSA-*-FIPS205/`
- Sibling ML-DSA module: [`./ml_dsa.acvp.md`](./ml_dsa.acvp.md)
- Sibling ML-KEM module: [`./ml_kem.acvp.md`](./ml_kem.acvp.md)
- Global conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
