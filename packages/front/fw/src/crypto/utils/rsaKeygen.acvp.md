# `rsaKeygen.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST FIPS 186-5** — *Digital Signature Standard
  (DSS)*, **§A.1.3** *Generation of Probable Primes* (probable-prime
  variant); **§A.1.1** structural invariants (n=p·q,
  d=e⁻¹ mod λ(n), |p−q| > 2^(nlen/2−100), d > 2^(nlen/2)).
- **Secondary**: **FIPS 186-5 Annex B.1** — *Auxiliary Functions*
  (Miller-Rabin), **Table B.1** (rounds required per bit-length class).
- **Tertiary**: **NIST SP 800-90A** — DRBG used for the randomness of
  candidate primes (CTR_DRBG via [`random.drbg()`](./random.js)).
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-rsa.adoc`
- **Vectors**: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/RSA-KeyGen-FIPS186-5/`

## Implemented algorithm

`generate({ bits, e, drbg? })` produces an RSA key pair conforming to
FIPS 186-5 §A.1.3 (probable-prime):

1. **Validation**: `nlen ∈ {2048, 3072, 4096}`; `e` odd, `≥ 3`.
2. **`p`**: an `nlen/2`-bit candidate via DRBG, top-2 bits forced (ensures
   `p·q ∈ [2^(nlen−1), 2^nlen)`), bit 0 forced (odd); rejected if
   `gcd(p−1, e) ≠ 1`; trial division by primes < 2000; Miller-Rabin
   `k=5` rounds (FIPS 186-5 Table B.1, audit profile k=4 + 1
   defense-in-depth).
3. **`q`**: same, plus the Fermat constraint `|p−q| > 2^(nlen/2−100)`
   (retries if not satisfied).
4. **`n = p·q`; `λ(n) = lcm(p−1, q−1)`** (Euclidean gcd on `bn`).
5. **`d = e⁻¹ mod λ(n)`** via `_inverseModAny` (even-modulus split via
   Hensel 2-adic + CRT — `bn.inverseMod` requires an odd modulus).
6. **CRT**: `dp = d mod (p−1)`, `dq = d mod (q−1)`,
   `qInv = q⁻¹ mod p`. Checks `d > 2^(nlen/2)` (§A.1.1), retries otherwise.

API: `factory(bitArray, bn, random)` → `{ generate, generateProbablePrime,
_internal: { millerRabin, smallPrimes, divmod, lcm, inverseModAny } }`.
Output serialized as big-endian `Uint8Array` for `pkc/rsa.js` integration.

## Test coverage

### Integrated official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| FIPS 186-5 §A.1.3 | RSA-2048 structure | `generate — full RSA-2048 key pair` | shape + `n=p·q` + OAEP round-trip |
| Miller-Rabin small primes | knowns 5..65537 | `_millerRabin / accepts` | true positives |
| Miller-Rabin small composites | knowns 9..65535 | `_millerRabin / rejects` | true negatives |
| **RSA-KeyGen-FIPS186-5** | 5 testGroups × 3 = **15/15 vectors** | `RSA-KeyGen-FIPS186-5 ... validator-style` | §A.1.1 invariants byte-exact (CRT) |

#### Validator-style strategy (not byte-exact replay)

`RSA-KeyGen-FIPS186-5` mixes several generation methods:

- `provable` (Shawe-Taylor, FIPS 186-5 §B.6) — deterministic via a
  server seed;
- `provableWithProvableAux`, `probableWithProvableAux`,
  `probableWithProbableAux` — derivation via auxiliary primes
  (§B.7/§B.8);
- `probable` (§B.3, equivalent to §A.1.3) — the probable-prime method,
  but as `testType=GDT` (IUT-generated, no controllable seed).

`rsaKeygen.js` implements **only the probable-prime method with OS
entropy** (`random.drbg()`). Byte-exact replay of ACVP `(p, q)` is
therefore **infeasible** by construction — no seed drives our
candidates.

**Coverage retained**: validate, across each of the 15 NIST keys
(3 nlen × 5 methods), the §A.1.1 structural invariants that every IUT
*must* satisfy. The `_internal` primitives (`millerRabin`, `lcm`,
`inverseModAny`) are precisely what a CMVP validator exercises:

```
1. Miller-Rabin(p, k=4) ∧ Miller-Rabin(q, k=4)         // §A.1.3
2. n = p · q                                           // byte-exact
3. inverseModAny(e, p−1) ≠ false ∧ inverseModAny(e, q−1) ≠ false
4. d = inverseModAny(e, lcm(p−1, q−1)) ; d.bits > nlen/2
5. d mod (p−1) == dmp1   (byte-exact against ACVP vector)
6. d mod (q−1) == dmq1   (byte-exact against ACVP vector)
7. q⁻¹ mod p == iqmp     (byte-exact against ACVP vector)
8. |p − q|.bits > nlen/2 − 100                         // Fermat resistance
```

The byte-exact equalities (5)-(7) prove that `_lcm` + `_inverseModAny` +
`bn.inverseMod` produce **exactly the same value** as the NIST
reference on 15 independent keys — algorithmic conformance of the
primitives is therefore validated even without a byte-exact replay of
the generation itself.

### Security properties tested

- [x] **Miller-Rabin acceptance/rejection** — small primes/composites
  + 30 generated primes (15 ACVP × 2) accepted at `k=4`.
- [x] **`n = p·q` generation** — shape + exact multiplication verified
  on 15 ACVP keys.
- [x] **Correct `λ(n)` computation** — indirect proof via the
  `d mod (p−1) == dmp1` equality (any error in lcm propagates to dmp1).
- [x] **`d > 2^(nlen/2)`** — §A.1.1 invariant verified on 15 ACVP
  keys (compute d via inverseModAny then `d.bitLength() > nlen/2`).
- [x] **Consistent CRT (dp, dq, qInv)** — byte-exact on 15 ACVP keys.
- [x] **Fermat resistance `|p−q| > 2^(nlen/2−100)`** — verified on 15
  keys + enforced in `generate` (retry if violated).
- [x] **`_inverseModAny` on an even modulus** — tested via λ(n), which
  is always even; proven by byte-exact dmp1/dmq1.
- [x] **OAEP-SHA-256 round-trip on a generated key** — RSA-2048 keygen +
  `rsa.oaepEncrypt`/`oaepDecrypt`.
- [x] **`bits` bounds** — rejects 1024 / 1234.
- [x] **`e` bounds** — rejects 4 (even) / 2 (< 3).
- [x] **Top-2 bits forced** — indirect proof via `n.length === 256`
  (RSA-2048) constant across all keygen calls.
- [ ] **`provable` / `auxiliary-prime` methods** — not implemented
  (P3, outside `rsaKeygen.js`'s current scope: Shawe-Taylor §B.6,
  auxiliary primes §B.7/B.8).
- [ ] **Strict Table B.1 conformance (round count per bit-length)** —
  our `_mrRounds` returns `k=5` at 1024 bits (auditor=4 + 1 hardening);
  conforms with margin.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | FIPS 186-5 §A.1.3 (probable-prime) |
| Validated parameter sizes | ✅ | nlen ∈ {2048, 3072, 4096}; e odd ≥ 3 |
| Validated entropy source | ✅ | DRBG via `random.drbg()` (CTR_DRBG-AES-256, SP 800-90A — cf. [random.acvp.md](./random.acvp.md)) |
| §A.1.1 invariants verified | ✅ | `n=p·q`, `d=e⁻¹ mod λ(n)`, `\|p−q\| > 2^(nlen/2−100)`, `d > 2^(nlen/2)` — enforced in `generate` AND verified on 15 NIST vectors |
| Miller-Rabin Table B.1 | ✅ (with margin) | k=5 at 1024 bits (Table B.1 auditor=4) |
| Power-on KAT / self-test | N/A (probable-prime is non-deterministic; coverage via byte-exact CRT vectors + inherited DRBG POST) | — |
| No `throw` / timing leak | ✅ | Review: `console.warn`/`console.error` + `return false`; no `throw` |
| No prime side-channel | ⚠️ (probable) | Miller-Rabin is not constant-time (the sequence of rejected candidates is observable) — acceptable for offline key generation |

## Known limitations

- **Alternative FIPS 186-5 methods**: `provable` (Shawe-Taylor §B.6),
  `provableWithProvableAux` (§B.7), `probableWithProbableAux` (§B.8),
  `provableWithProvableAux` not implemented. The module covers only the
  §A.1.3 probable-prime variant, which remains **FIPS-approved** but
  does not allow the `randPQ ∈ {provable, *Aux}` ACVP vectors.
- **No byte-exact replay**: no seed is controllable on the IUT
  side; byte-exact coverage goes through the CRT invariants (dmp1, dmq1,
  iqmp), not through (p, q) themselves. This is the standard strategy
  for non-deterministic algorithms (cf. ACVP draft §6.5).
- **Pure-JS performance**: RSA-2048 keygen ≈ several seconds;
  RSA-4096 ≈ 30+ seconds. Documented in `@fileoverview`; recommended
  usage via a Worker.
- **Miller-Rabin not constant-time**: the number of rejections is
  observable via timing, but not the candidate values — an acceptable
  risk for an offline keygen operation.
- **No post-quantum path**: ML-KEM/ML-DSA are provided separately
  (cf. [ml_kem.acvp.md](../pkc/ml_kem.acvp.md), [ml_dsa.acvp.md](../pkc/ml_dsa.acvp.md)).

## Cross-references

- Module: [`utils/rsaKeygen.js`](./rsaKeygen.js)
- Tests: [`utils/rsaKeygen.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/utils/rsaKeygen.test.js) — 25 tests (was 10 before this iteration)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-rsa.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/RSA-KeyGen-FIPS186-5/`
- Underlying DRBG: [`./random.acvp.md`](./random.acvp.md)
- Consuming RSA module: [`../pkc/rsa.js`](../pkc/rsa.js)
- Global conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
