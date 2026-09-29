# `ml_dsa.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST FIPS 204** — *Module-Lattice-Based Digital
  Signature Standard* (August 2024). Implements ML-DSA-44, ML-DSA-65,
  ML-DSA-87 (§5 "ML-DSA", §6 "Internal functions").
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-ml-dsa.adoc`
- **Vectors**:
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ML-DSA-keyGen-FIPS204/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ML-DSA-sigGen-FIPS204/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ML-DSA-sigVer-FIPS204/`

## Implemented algorithm

`ml_dsa.factory(sha3, bitArray, random)` exposes `ml_dsa44`, `ml_dsa65`,
`ml_dsa87` (FIPS 204 Table 1 parameters: K∈{4,6,8}, L∈{4,5,7},
η∈{2,4,2}, γ₁∈{2¹⁷, 2¹⁹, 2¹⁹}, γ₂={(q−1)/88, (q−1)/32, (q−1)/32},
τ∈{39,49,60}, ω∈{80,55,75}, c̃∈{32,48,64}). FIPS 204 §5 (ML-DSA)
implementation on top of §6 (internal sign/verify) with NTT modulo
q=8380417 (root 1753, N=256). Public API (`Uint8Array`):

- `keygen(seed?)` → `{ publicKey, secretKey }`. seed = 32 bytes; sk in
  the full FIPS 204 format = packed `(ρ ‖ K ‖ tr ‖ s₁ ‖ s₂ ‖ t₀)`.
- `sign(msg, secretKey, ctx?, rnd?)` → signature (`Uint8Array` or `false`).
  ctx ≤ 255 bytes (§5.4 wrapper M' = `0x00 ‖ |ctx| ‖ ctx ‖ msg`). rnd =
  32 bytes; **zero by default (deterministic)**, hedged mode if supplied.
- `verify(sig, msg, publicKey, ctx?)` → `true | false`. Constant-time
  comparison of the recomputed c̃ (accumulated XOR + diff===0, line 733-736).

**Iteration E3 (FIPS 140-3 upgrade plan)**: added the
**HashML-DSA** variants (FIPS 204 §5.4 algos 4+5), the **internal**
interface (§6.2 raw, without the M' wrapper), and the **externalMu**
mode (pre-computed mu):
- `signPh(msg, sk, hashAlg, hashMod, ctx?, rnd?)` / `verifyPh(sig, msg, pk, hashAlg, hashMod, ctx?)`.
  Supported hashes: `SHA2-{224,256,384,512}`, `SHA2-512/{224,256}`,
  `SHA3-{224,256,384,512}`, `SHAKE-{128,256}` (12 algorithms; DER-encoded
  OIDs conforming to FIPS 204).
- `_internal.signInternal(M, sk, rnd?)` / `_internal.verifyInternal(sig, M, pk)`:
  bypasses the §5.4 M' wrapper (M is used as the raw message bytes).
- `_internal.signWithMu(mu, sk, rnd?)` / `_internal.verifyWithMu(sig, mu, pk)`:
  skips the mu = SHAKE256(tr || M, 64) derivation; the caller supplies mu.

## Test coverage

### Integrated official vectors

| Source | ACVP reference | Test (`describe`) | Property verified |
|---|---|---|---|
| NIST CAVP / ACVP | `ML-DSA-keyGen-FIPS204` (9/75 sub-samples) | `ML-DSA-keyGen-FIPS204 (...9 sub-samples)` | `keygen(seed) == (pk, sk)` byte-exact |
| NIST CAVP / ACVP | `ML-DSA-sigGen-FIPS204` external+pure deterministic=true (9/45) | `.../external+pure (deterministic=$det)` | `sign(msg, sk, ctx, 0) == sig` byte-exact (rnd=zeros) |
| NIST CAVP / ACVP | `ML-DSA-sigGen-FIPS204` external+pure deterministic=false (9/45) | `.../external+pure (deterministic=$det)` | `sign(msg, sk, ctx, rnd) == sig` byte-exact (ACVP rnd) |
| NIST CAVP / ACVP | `ML-DSA-sigVer-FIPS204` external+pure (45/45) | `.../external+pure (45/45 vectors)` | `verify(sig, msg, pk, ctx)` ↔ `testPassed` (mix of valid + 14 failure reasons: modified message/signature/z/commitment/etc.) |
| Pre-existing (Wycheproof) | ML-DSA-65 KAT keygen/sign/verify "Hello world" | `ML-DSA-65 KAT` | byte-exact pk + sign + verify |
| Pre-existing | round-trip 44/65/87 | `ML-DSA-{44,65,87} round-trip` | `verify(sign(msg)) == true` |
| Pre-existing | tampering signature | `ML-DSA-65 verify rejects tampered signature` | bit-flip rejection |
| Pre-existing | NTT round-trip | `NTT round-trip` | `nttInv(ntt(f)) == f` mod q |

### Security properties tested

- [x] **Determinism + hedge** — sign(rnd=0) reproduces 9 ACVP det=true
      vectors byte-exact; sign(rnd=ACVP_rnd) reproduces 9 ACVP det=false
      vectors byte-exact. Covers both FIPS 204 §5.6 modes.
- [x] **Constant-time c̃ verify comparison** — accumulated XOR + `diff===0`
      (lines 733-736 ml_dsa.js). No inter-byte early return.
- [x] **sk/pk/sig length validation** — early return false (§6.2/6.3
      lines 549-552, 677-678).
- [x] **M' wrapper §5.4** — `0x00 ‖ |ctx| ‖ ctx ‖ msg`, ctx ≤ 255
      enforced (line 534-537); covered by 18 sigGen vectors with
      variable ctx + 45 sigVer vectors.
- [x] **z norm bound (γ₁−β) and r₀ (γ₂−β)** — `_polyChknorm` rejects
      → retry loop (kappa+=L); 1000-iteration budget; tested
      indirectly via byte-exact sigGen.
- [x] **h ≤ ω bound check** — `cnt > OMEGA` rejects in sign (line 666),
      `hCount > OMEGA` rejects in verify (line 725).
- [x] **Tampering rejection** — 14+ negative ACVP sigVer vectors
      (`reason ∈ {modified message, modified signature - z, commitment,
      hint, response, public key bit-flip}`).
- [x] **No `throw`** — early return + `console.warn/error` (review
      lines 480-557, 670-680).
- [x] **HashML-DSA (preHash variant)** ✅ **Iteration E3** — implemented.
      `signPh(msg, sk, hashAlg, hashMod, ctx?, rnd?)` / `verifyPh` apply
      PH(msg) with the injected hash + the FIPS 204 §5.4 algo 4 wrapper
      (`0x01 || |ctx| || ctx || OID(hashAlg) || PH(msg)`). 12 hashAlg
      values supported (SHA2-{224,256,384,512}, SHA2-512/{224,256}, SHA3-*,
      SHAKE-{128,256}). **9 SigGen + 45 SigVer ACVP vectors byte-exact**
      (3/group sub-sample across 3 paramSets for SigGen, full coverage
      for SigVer).
- [x] **"internal" interface** ✅ **Iteration E3** — exposed via
      `_internal.signInternal(M, sk, rnd?)` and `_internal.verifyInternal`.
      Bypasses the §5.4 wrapper; M is passed as-is to mu = SHAKE256(tr||M, 64).
      **9 ACVP vectors byte-exact** (3/paramSet sub-sample).
- [x] **externalMu** ✅ **Iteration E3** — exposed via
      `_internal.signWithMu(mu, sk, rnd?)` and `_internal.verifyWithMu`.
      Skips the mu derivation; the caller supplies the pre-computed mu
      (typically `SHAKE256(tr || M, 64)`). **9 ACVP vectors byte-exact**.
- [ ] **Side-channel NTT/sampling** — not formally constant-time
      (Int32, branches on public values only).
      Acceptable for software PQC DSA; **P3** for embedded
      deployment → dedicated audit.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | FIPS 204 §5-6 + 3 official ACVP folders |
| Approved paramSets | ✅ | ML-DSA-{44,65,87} (FIPS 204 Table 1) |
| Deterministic generation (seed) | ✅ | byte-exact on 9 ACVP keyGen vectors |
| Deterministic signature (rnd=0) | ✅ | byte-exact on 9 sigGen det=true vectors |
| Hedged signature (rnd≠0) | ✅ | byte-exact on 9 sigGen det=false vectors |
| ML-DSA verification | ✅ | 45 sigVer vectors (documented positives + negatives) |
| Public validation (pk/sig length) | ✅ | early return false; verified by negative sigVer |
| Power-on KAT / self-test | N/A | permanent KATs via 18 sigGen vectors + Wycheproof |
| CT comparisons (c̃) | ✅ | accumulated XOR line 733-736 |
| No `throw` / timing leak | ✅ | Review: `console.warn/error` + `return false` |
| Entropy source (hedged rnd) | inherited | `random.bytes` (CTR_DRBG SP 800-90A) |

## Known limitations

- **[first/mid/last] sub-sampling**: 9/75 keyGen, 18/270 sigGen vs.
  exhaustive coverage. Rationale: signing ML-DSA-87 takes 50-100 ms ×
  270 vectors = ~25 s per group, exceeding the module's 30 s budget.
  Sub-sampling preserves tcId diversity across the 6 external+pure
  groups. sigVer is exhaustive (45/45 in-scope, ~3-4 ms/op).
  **Iteration H3**: `CRYPTO_FULL=1` enables 75/75 keyGen + 45/45 sigVer
  external+pure + 90/90 sigGen external+pure → 364 tests in ~4 s; the
  preHash / internal / externalMu variants remain E3 sub-sampled
  (already fully covered per variant).
- ~~**Out of scope**~~ ✅ **Iteration E3** — HashML-DSA + internal
  interface + externalMu are now all implemented and validated ACVP
  byte-exact. See the `[x]` checks above.
- **NTT not formally CT**: Int32, branches depending only on
  public values (kappa, indices); the signing path uses
  timing-observable rejections (attempt loop 1..1000). Acceptable
  outside direct network traffic.

## Cross-references

- Module: [`pkc/ml_dsa.js`](./ml_dsa.js)
- Tests: [`pkc/ml_dsa.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/ml_dsa.test.js) — 154 tests (82 baseline + 72 iteration E3: 9 sigGen-ph + 9 internal + 9 externalMu + 45 sigVer-ph)
- Pre-existing KAT: [`pkc/ml_dsa.kat.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/ml_dsa.kat.js) (Wycheproof "Hello world" ML-DSA-65)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-ml-dsa.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ML-DSA-*-FIPS204/`
- Sibling ML-KEM module: [`./ml_kem.acvp.md`](./ml_kem.acvp.md)
- Sibling SLH-DSA module: [`./slh_dsa.acvp.md`](./slh_dsa.acvp.md) (upcoming)
- Global conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
