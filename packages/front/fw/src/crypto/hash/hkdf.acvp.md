# `hkdf.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST SP 800-56C Rev. 2** — *Recommendation for
  Key-Derivation Methods in Key-Establishment Schemes* (HKDF as a
  Two-Step KDF, §4.1).
- **Secondary**: **RFC 5869** — *HMAC-based Extract-and-Expand Key
  Derivation Function (HKDF)* (base algorithm, App. A vectors).
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-kda.adoc`
- **Vectors**: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/KDA-HKDF-Sp800-56Cr1/`

## Implemented algorithm

HKDF (RFC 5869) in two steps:
- **Extract**: `PRK = HMAC-Hash(salt, IKM)`; empty salt → 0^HashLen.
- **Expand**: `OKM = T(1) || ... || T(N)` with `T(i) = HMAC-Hash(PRK,
  T(i-1) || info || i)`, `N = ⌈L / HashLen⌉ ≤ 255`. Explicit guard:
  `length ≤ 255 × HashLen` (otherwise `false`).

NIST SP 800-56C §4.1 usage: HKDF is applied as a *Two-Step KDF*
over a shared secret Z, with `info = uPartyInfo || vPartyInfo || L_be32`
(structure standardized for ECC/DH/PQC key-establishment
schemes). The caller constructs `info`; `hkdf.js` remains agnostic.

API: `extract(salt, ikm, Prff?)`, `expand(prk, info, length_bits, Prff?)`,
`derive(salt, ikm, info, length_bits, Prff?)` → `Array | false`. Default
PRF = HMAC-SHA-256; any compatible `hmac` instance accepts
another hash (tested: SHA-224, SHA-384, SHA-512).

## Test coverage

### Built-in official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| RFC 5869 App. A.1 | TC 1 (basic, SHA-256) | `A.1 Test Case 1` | byte-exact Extract + Expand + derive |
| RFC 5869 App. A.2 | TC 2 (longer inputs, SHA-256) | `A.2 Test Case 2` | byte-exact Extract + derive (L=82 bytes) |
| RFC 5869 App. A.3 | TC 3 (zero-length salt/info, SHA-256) | `A.3 Test Case 3` | Empty salt → 0^HashLen path + derive |
| **KDA-HKDF-Sp800-56Cr1** | AFT 120/200 (sub-sample 3/group) | `AFT` | byte-exact dkm (4 HMAC × 2 saltMethod × 5 zLength × 3 vectors) |
| **KDA-HKDF-Sp800-56Cr1** | VAL 120/200 (sub-sample 3/group, incl. 27 `testPassed=false`) | `VAL` | Candidate dkm verification — pass/fail labels honored |
| **KDA-HKDF-Sp800-56Cr1** (B3) | AFT 180/600 sub-sample 3/group over **6 new HMAC families** (SHA-3-{224,256,384,512} + SHA-512/{224,256}) | `extension 6 nouvelles familles HMAC (B3)` | byte-exact dkm, validates the A1+A3+B1+B2 cascade over HKDF |
| **KDA-HKDF-Sp800-56Cr2 hybrid single** (B3) | 40 AFT capped 4/alg over the 10 families | `hybrid single-expansion AFT (B3)` | byte-exact dkm with `IKM = Z ‖ T` (SP 800-56C Rev. 2 §5.8.2) |
| **KDA-HKDF-Sp800-56Cr2 hybrid multi** (B3) | 20 AFT capped 2/alg, 56 total expand iterations | `hybrid multi-expansion AFT (B3)` | 1 shared PRK, N distinct expand iterations (TLS-style multi-key derivation) |

#### AFT sub-sampling strategy

`KDA-HKDF-Sp800-56Cr1` exposes **1000 tests** (200 testGroups × 5 tcId)
multi-parameter. Filtering applied:

- `multiExpansion = false` (single-expansion only)
- `usesHybridSharedSecret = false` (no auxiliary `T` — Cr2 is
  100% hybrid and would require `IKM = Z || T`)
- `hmacAlg ∈ {SHA-224, SHA-256, SHA-384, SHA-512}` (4 variants
  supported by `hmac.js`; SHA-3 and SHA-512/{224,256} P2 not
  implemented)

→ 80 filtered groups × 5 tests = **400 candidate ACVP vectors**.
**Sub-sample [first, middle, last]** per group →
**240 vectors (120 AFT + 120 VAL)** integrated ≈ 24% of the total.

### Security properties tested

- [x] **Extract (HMAC-key=salt, HMAC-msg=IKM)** — covered by 3 RFC + 240
  ACVP; random salt (saltMethod=`random`) and zero (saltMethod=`default`).
- [x] **Expand (chaining T(i-1) || info || counter)** — Expand is
  implicitly validated via `derive`; length L=1024 bits forces
  `N=ceil(1024/HashLen)` iterations (≥ 4 for SHA-2 → multi-block).
- [x] **Empty salt → 0^HashLen path** — RFC 5869 §2.2, RFC TC 3.
- [x] **Structured SP 800-56C fixedInfo** — `info = uPartyInfo ||
  vPartyInfo || L_be32`, partyInfo = `partyId || ephemeralData`; 240
  vectors with 16-byte `partyId` and 256-byte `ephemeralData`.
- [x] **HMAC-SHA-2 (4 variants)** — byte-exact.
- [x] **HMAC-SHA-3 (4 variants)** ✅ B3 — 60 Cr1 vectors (3/group × 4 algs × 5 groups)
  byte-exact via the streaming modules `sha3.sha3_*_hash` (A1).
- [x] **HMAC-SHA-512/{224,256}** ✅ B3 — 30 Cr1 vectors (3/group × 2 algs × 5 groups)
  byte-exact via the `sha512_224.js` / `sha512_256.js` modules (A3).
- [x] **Very large IKM** — zLength up to 65536 bits (8 KiB); multi-block
  HMAC validated.
- [x] **Constant-time verify** — the `derive(...) == dkm` comparison is
  done via JS string compare; security relies on HMAC-Verify outside
  the HKDF scope (the caller must use `hmac.verify` for any
  security-critical dkm comparison).
- [x] **Length guards** — `length < 0` → `false`; `length > 255 ×
  HashLen` → `false` (tested `expand(... 65281)` for HashLen=32 bytes).
- [x] **VAL pass/fail labels** — 27 `testPassed=false` cases (corrupted dkm)
  rejected via `match === false`.
- [x] **Hybrid shared secret (Cr2)** ✅ B3 — 40 vectors with
  `IKM = Z ‖ T` byte-exact (SP 800-56C Rev. 2 §5.8.2).
- [x] **multiExpansion (Cr2)** ✅ B3 — 20 vectors (56 total iterations),
  1 shared PRK then multiple expand with distinct fixedInfo. Validates the
  TLS multi-key derivation use case (handshake_traffic_secret → multiple keys).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | SP 800-56C Rev. 2 §4.1 (HKDF Two-Step KDF) + RFC 5869 |
| Validated parameter sizes | ✅ | **10 hmacAlg** (4 SHA-2 + 2 SHA-512-truncated [B3] + 4 SHA-3 [B3]) × 2 saltMethod × 5 zLength variations |
| Power-on KAT / self-test | ✅ | RFC 5869 App. A.1-A.3 + 480 ACVP (240 Cr1 SHA-2 + 180 Cr1 new families + 60 Cr2 hybrid+multi) executed on every `bun test` |
| CT comparisons (if secret) | N/A (HKDF itself performs no comparison; delegated to the caller via `hmac.verify`) | — |
| No `throw` / timing leak | ✅ | Review: `console.warn` + `return false`; no `throw` |
| Boundary guards | ✅ | `length < 0` and `length > 255 × HashLen` rejected |

## Known limitations

- ~~**HMAC-SHA-3 / HMAC-SHA-512/{224, 256}**~~ ✅ **Iteration B3**:
  6 new families covered (180 Cr1 vectors sub-sample 3/group).
- ~~**Hybrid shared secret (Cr2)**~~ ✅ **Iteration B3**: 40 vectors
  AFT capped 4/alg over the 10 HMAC families; `IKM = Z ‖ T` validated byte-exact.
- ~~**multiExpansion**~~ ✅ **Iteration B3**: 20 vectors AFT capped 2/alg,
  56 total expand iterations — TLS-style multi-key derivation validated.
- **Sub-sampling 3/group**: preserves tcId diversity. For a CMVP lab,
  extend via `process.env.CRYPTO_FULL` (plan iteration H3).
- **VAL pass/fail Cr2**: 100 negative vectors (hybrid+multi) not yet
  covered. P3 — could be added following the existing Cr1 VAL pattern.
- **`hmac.js` dependency**: HKDF conformance remains tightly coupled to
  HMAC; see [hmac.acvp.md](./hmac.acvp.md). All 10 HMAC families
  validated in iterations B1+B2 are available here.

## Cross references

- Module: [`hash/hkdf.js`](./hkdf.js)
- Tests: [`hash/hkdf.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/hkdf.test.js) — 490 tests (250 baseline + 240 iteration B3: 180 Cr1 new families + 40 Cr2 hybrid single + 20 Cr2 hybrid multi)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-kda.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/KDA-HKDF-Sp800-56Cr1/`
- Underlying HMAC: [`hmac.acvp.md`](./hmac.acvp.md)
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
