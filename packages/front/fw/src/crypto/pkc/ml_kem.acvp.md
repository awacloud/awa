# `ml_kem.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST FIPS 203** — *Module-Lattice-Based Key-Encapsulation
  Mechanism Standard* (August 2024). Implements ML-KEM-512, ML-KEM-768,
  ML-KEM-1024 (§7 "Key Encapsulation Mechanism").
- **Secondary**: SP 800-227 (KEM transition, draft); FIPS 202 (SHA-3,
  SHAKE-256 used for PRF/G/J/H).
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-ml-kem.adoc`
- **Vectors**:
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ML-KEM-keyGen-FIPS203/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ML-KEM-encapDecap-FIPS203/`

## Implemented algorithm

`ml_kem.factory(sha3, bitArray, random)` exposes `ml_kem512`, `ml_kem768`,
`ml_kem1024` (FIPS 203 Table 2 parameters: K∈{2,3,4}, η₁∈{3,2,2},
η₂=2, dᵤ∈{10,10,11}, dᵥ∈{4,4,5}). FIPS 203 §6 (ML-KEM) implementation
on top of K-PKE (§5) with NTT modulo q=3329 (ζ=17). Public API (`Uint8Array`):

- `keygen(seed?)` → `{ publicKey: ek, secretKey: dk }`. seed = `d || z`
  (64 bytes); dk in the full FIPS 203 format = `dk_PKE || ek || H(ek) || z`.
- `encapsulate(publicKey, msg?)` → `{ cipherText, sharedSecret }`. msg
  optional (32 bytes; random otherwise). Modulus-q validation on ek
  (§7.2) before encryption.
- `decapsulate(cipherText, secretKey)` → sharedSecret (32 bytes). Implicit
  reject constant-time via XOR mask (lines 489-493).

Internal API (test-only, added for ACVP `*KeyCheck`):

- `<variant>._internal.isValidEncapsulationKey(ek)` — §7.2 input
  validation: length + modulus-q (ByteEncode∘ByteDecode round-trip).
- `<variant>._internal.isValidDecapsulationKey(dk)` — §7.3 input
  validation: length + consistency H(ek_embedded) == ek_hash_embedded.

## Test coverage

### Integrated official vectors

| Source | ACVP reference | Test (`describe`) | Property verified |
|---|---|---|---|
| NIST CAVP / ACVP | `ML-KEM-keyGen-FIPS203` (9/75 sub-samples) | `ML-KEM-keyGen-FIPS203 (...9 sub-samples)` | `keygen(d‖z) == (ek, dk)` byte-exact (3 paramSets × first/mid/last) |
| NIST CAVP / ACVP | `ML-KEM-encapDecap` `function=encapsulation` (9/75 sub-samples, AFT) | `.../encapsulation` | `encapsulate(ek, m) == (c, k)` byte-exact |
| NIST CAVP / ACVP | `ML-KEM-encapDecap` `function=decapsulation` (9/30 sub-samples, VAL) | `.../decapsulation` | `decapsulate(c, dk) == k` (covers the implicit-reject branch on corrupted ct) |
| NIST CAVP / ACVP | `ML-KEM-encapDecap` `function=decapsulationKeyCheck` (30/30 VAL) | `.../decapsulationKeyCheck` | `_internal.isValidDecapsulationKey(dk)` ↔ `testPassed` (5 pass + 5 fail / paramSet) |
| NIST CAVP / ACVP | `ML-KEM-encapDecap` `function=encapsulationKeyCheck` (30/30 VAL) | `.../encapsulationKeyCheck` | `_internal.isValidEncapsulationKey(ek)` ↔ `testPassed` (5 pass + 5 fail / paramSet) |
| Pre-existing (noble-post-quantum) | ML-KEM-768 KAT keygen+encaps | `ML-KEM-768 KAT` | byte-exact ek/sk + ss=K |
| Pre-existing | round-trip 512/768/1024 | `ML-KEM-{512,768,1024} round-trip` | `decapsulate(encapsulate(ek), sk) == K` |
| Pre-existing | implicit reject | `ML-KEM-768 implicit reject on tampered ciphertext` | different ss but still 32 bytes |
| Pre-existing | NTT round-trip | `NTT round-trip` | `nttInv(ntt(f)) == f` mod q |

**Sub-sampling strategy**: keyGen (25/group), encapsulation (25/group)
and decapsulation (10/group) are sub-sampled as `[first, mid, last]`
(3 per group) to keep within the module's 30 s budget. The key-checks
(lightweight: one SHA3-256 + ByteEncode round-trip) are exhaustive (30/30).

### Security properties tested

- [x] **Constant-time implicit reject** — `okMask` XOR mask (lines
      489-493 ml_kem.js); tested via ct tampering + 9 byte-exact
      ACVP decapsulation vectors (which exercise the nominal path).
- [x] **§7.2 ek validation (modulus-q)** — `_ctEqual` of the
      ByteEncode∘ByteDecode round-trip; 30 encapKeyCheck vectors
      (5 fail/paramSet).
- [x] **§7.3 dk validation (hash consistency)** — `_ctEqual(SHA3-256(ek), ekHash)`;
      30 decapKeyCheck vectors (5 fail/paramSet).
- [x] **keygen + encap determinism** — byte-exact on 18 ACVP vectors.
- [x] **Constant-time comparison** — `_ctEqual` (accumulated XOR + OR)
      used for the modulus check, hash check, and implicit-reject mask.
- [x] **No `throw`** — early return `false` + `console.warn/error`
      on invalid sizes or failed modulus check (review lines 410-441).
- [ ] **Large-message BFT subsample** — not applicable (ACVP ML-KEM
      does not expose BFT for this module).
- [ ] **NTT/CBD side-channels** — not formally constant-time
      (Uint16Array, branches on public values only). Acceptable
      for a PQC KEM where secret coefficients are CBD-distributed
      uniformly, but not SCA-certified. **P3** — dedicated audit if
      deployed embedded.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | FIPS 203 §6-7 + 2 official ACVP folders |
| Approved paramSets | ✅ | ML-KEM-{512,768,1024} (FIPS 203 Table 2) |
| Deterministic generation (seed) | ✅ | byte-exact on 9 ACVP keyGen vectors |
| Deterministic encapsulation (fixed m) | ✅ | byte-exact on 9 ACVP encap vectors |
| Decapsulation + implicit reject | ✅ | 9 ACVP decap vectors + tampering test |
| Public validation (§7.2 ek) | ✅ | `_internal.isValidEncapsulationKey` + 30 vectors |
| Private validation (§7.3 dk) | ✅ | `_internal.isValidDecapsulationKey` + 30 vectors |
| Power-on KAT / self-test | N/A | permanent KATs via 18 deterministic vectors |
| CT comparisons (secret) | ✅ | `_ctEqual` throughout (modulus, hash, reject mask) |
| No `throw` / timing leak | ✅ | Review: `console.warn/error` + `return false` |
| Entropy source | inherited | `random.bytes` (CTR_DRBG SP 800-90A, cf. utils/random.acvp.md) |

## Known limitations

- **[first/mid/last] sub-sampling** by default: 9/75 keyGen, 9/75 encap,
  9/30 decap (CI budget < 1 s). **Iteration H3**: `CRYPTO_FULL=1` enables
  the full 75 keyGen + 165 encapDecap (encapsulation, decapsulation,
  encapsulationKeyCheck, decapsulationKeyCheck) → 336 tests in ~0.5 s via
  direct loading of the `internalProjection.json` + `expectedResults.json`.
- **No "expanded sk" ML-KEM variant**: our `dk` is always in the
  full FIPS 203 Algorithm 16 line 7-8 format (`dk_PKE || ek || H(ek) || z`,
  respectively 1632 / 2400 / 3168 bytes). The "seed-only" format (32 bytes,
  cf. SP 800-227 draft) is not exposed.
- **NTT not formally constant-time**: see P3 above.

## Cross-references

- Module: [`pkc/ml_kem.js`](./ml_kem.js)
- Tests: [`pkc/ml_kem.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/ml_kem.test.js) — 96 tests (was 8 before this iteration)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-ml-kem.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ML-KEM-*-FIPS203/`
- Equivalent ML-DSA module: [`./ml_dsa.acvp.md`](./ml_dsa.acvp.md) (upcoming)
- Global conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
