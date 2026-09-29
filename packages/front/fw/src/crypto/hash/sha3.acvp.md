# `sha3.js` — ACVP / NIST conformance

## Standards

- **Primary**: **FIPS 202** — *SHA-3 Standard: Permutation-Based Hash and
  Extendable-Output Functions*, §6 (SHA-3 family) + §6.2 (SHAKE).
- **Secondary**: ACVP — draft-celi-acvp-sha3.
- **ACVP draft**: `references/NIST/ACVP/src/sha3/`
- **Vectors**:
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SHA3-{224,256,384,512}-2.0/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SHAKE-{128,256}-FIPS202/`

## Implemented algorithm

**Keccak-f[1600]** permutation + sponge construction (FIPS 202 §3.4 / §4).
Internal state: `Uint32Array(50)` (25 64-bit lanes emulated as `(lo, hi)`
pairs). Domain separation byte `0x06` (SHA-3) or `0x1F` (SHAKE), `pad10*1`
padding. Capacity = 2 × security level (448, 512, 768, 1024 bits). Worker-
serializable factory API. Six one-shot functions exposed: `sha3_{224,256,384,512}`
(fixed digest) and `shake{128,256}(data, outBits)` (XOF, `outBits` must be a multiple of 8).

**Iteration A1 (FIPS 140-3 upgrade)**: added four streaming sub-modules
`sha3_{224,256,384,512}_hash` exposing the `{ name, fn, hash }` contract with
`fn.prototype.{blockSize, update, finalize}` and clone constructor `new fn(other)`.
This unlocks HMAC-SHA-3, HKDF-SHA-3, and PBKDF2-HMAC-SHA-3 composition (Phase B
of the upgrade plan) without breaking the existing one-shot API.

## Test coverage

### Built-in official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| FIPS 202 | digest empty (4 SHA-3 variants) | `empty input` / `SHA3-XXX("")` | byte-exact KAT |
| FIPS 202 | digest "abc" (4 SHA-3 variants) | `"abc" input` / `SHA3-XXX("abc")` | byte-exact KAT |
| NIST CAVP | 200 × 0xa3 (1600-bit) | `200 bytes of 0xa3` | byte-exact KAT (covers 1 full absorption + tail) |
| FIPS 202 | SHAKE empty input (256-bit / 512-bit out) | `SHAKE empty input` | byte-exact XOF |
| **ACVP-SHA3-224-2.0** | AFT sub-sample (15/163 byte-aligned, 1258 total) | `ACVP SHA3-224-2.0 / AFT vectors` | byte-exact KAT |
| **ACVP-SHA3-224-2.0** | MCT standard (100 outer × 1000 inner) | `MCT (standard)` | **100/100 byte-exact results** (Iteration H2) |
| **ACVP-SHA3-256-2.0** | AFT sub-sample (16/151 byte-aligned, 1194 total) | `ACVP SHA3-256-2.0 / AFT vectors` | byte-exact KAT |
| **ACVP-SHA3-256-2.0** | MCT standard (100 outer × 1000 inner) | `MCT (standard)` | **100/100 byte-exact results** |
| **ACVP-SHA3-384-2.0** | AFT sub-sample (13/118 byte-aligned, 938 total) | `ACVP SHA3-384-2.0 / AFT vectors` | byte-exact KAT |
| **ACVP-SHA3-384-2.0** | MCT standard (100 outer × 1000 inner) | `MCT (standard)` | **100/100 byte-exact results** (Iteration H2) |
| **ACVP-SHA3-512-2.0** | AFT sub-sample (13/86 byte-aligned, 682 total) | `ACVP SHA3-512-2.0 / AFT vectors` | byte-exact KAT |
| **ACVP-SHA3-512-2.0** | MCT standard (100 outer × 1000 inner) | `MCT (standard)` | **100/100 byte-exact results** (Iteration H2) |
| **ACVP-SHAKE-128-FIPS202** | AFT sub-sample (29/269 byte-aligned in/out) | `ACVP SHAKE128-FIPS202 / AFT vectors` | byte-exact XOF, variable outLen |
| **ACVP-SHAKE-256-FIPS202** | AFT sub-sample (6/41 byte-aligned in/out, 237 total) | `ACVP SHAKE256-FIPS202 / AFT vectors` | byte-exact XOF, variable outLen |

#### Sub-sampling strategy

- **SHA-3 AFT**: one byte-aligned tcId in 32, plus anchors `len ∈ {0, 8, 16,
  24, 56, 96, 256, 512, 1024, 2048, 8192}` when available, plus
  `min(len)` and `max(len)`. Individual cap 32000 bits (except the max-anchor).
- **SHA-3 MCT**: **standard** FIPS202 algorithm (`MD[0]=SEED ; MSG=MD[i-1]
  ; MD[i]=SHA3(MSG)`). 100 outer × 1000 inner. For SHA3-256, **all 100
  results** are verified byte-exact (full path validated); for
  224/384/512, iter 0 and iter 99 are checked (CI cost saving; identical algorithm).
- **SHAKE AFT**: one tcId in 8 (both input AND outLen byte-aligned), plus
  `min/max(outLen)` and `min(len)`. Input cap 16000 bits.
- **SHAKE MCT**: **not specified in the FIPS 202 ACVP revision** (see the
  draft-celi-acvp-sha3 spec). Therefore not tested.
- **LDT (testGroup 3)**: not integrated (`fullLength` up to ~8.5 GiB).

### Security properties tested

- [x] **Keccak-f[1600] permutation (24 rounds)** — covered by all vectors.
- [x] **Domain separation 0x06 / 0x1F** — indirect proof: SHA3 and SHAKE
  share the same `_sponge`, only outputs diverge byte-for-byte
  (validated by their respective empty KATs).
- [x] **`pad10*1` padding** — exercised by the AFT length variations
  (cases where `remaining + 1 < rateBytes` and `remaining = rateBytes - 1`).
- [x] **Multi-block absorption** — 200×0xa3 KAT (1600 bits = 9 SHA3-256 blocks).
- [x] **Multi-round squeeze (XOF)** — SHAKE128 vectors with `outLen > rate`
  (SHAKE128 rate = 1344 bits; SHAKE AFT `outLen` spans several blocks).
- [x] **Long-chain stability** — standard MCT for SHA3-{224,256,384,512}:
  100,000 consecutive hashes per variant validated **byte-exact across all 100
  iters** (Iteration H2; previously only SHA3-256 was fully byte-exact,
  SHA3-{224,384,512} tested only iter0 + iter99). Any drift deviates
  `resultsArray[j]` at any iteration.
- [x] **XOF outLen guard** — `SHAKE rejects non-byte-aligned output`:
  `console.warn` + `return false`.
- [ ] **Side-channel resistance** — N/A (hash module with no secret by default;
  HMAC-SHA-3 usage handled by `hmac.js`).
- [ ] **Bit-level inputs (non-byte-aligned)** — **NOT SUPPORTED** by
  the current implementation (see *Known limitations*).
- [x] **Streaming API for HMAC/HKDF/PBKDF2** (upgrade plan iteration A1) —
  4 sub-modules `sha3_{224,256,384,512}_hash` exposing `{ name, fn, hash }`
  with `fn.prototype.{blockSize, update, finalize}` and clone constructor
  `new fn(other)`. **40 dedicated tests**: streaming = one-shot (3-chunk,
  byte-by-byte, exact rate boundary), clone independence, idempotent finalize
  (2nd call rejected), update rejected after finalize, empty input, bitArray accepted
  for the HMAC ex-key path.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | FIPS 202 §6 + ACVP-SHA3-{224,256,384,512}-2.0 |
| Validated parameter sizes | ✅ | 4 digestSize + 2 SHAKE variants; variable outLen covered by AFT SHAKE |
| Power-on KAT / self-test | ✅ | FIPS 202 vectors (empty + "abc" + 200×0xa3) + ACVP AFT executed on every `bun test` |
| CT comparisons (if secret) | N/A | Hash module with no secret |
| No `throw` / timing leak | ✅ | Review: `console.warn` + `return false` on the XOF guard |

## Known limitations

- **Bit-level inputs not supported**: sha3.js does not implement the FIPS
  202 Annex B bit-alignment extension (the ACVP suites enumerate ~85% of
  non-byte-aligned vectors; they are **filtered out** at sub-sampling). If a
  consumer needs to absorb a number of bits not a multiple of 8, the
  module must be extended to adjust the domain padding bits.
- **Aggressive AFT sub-sampling on the 224/384/512 variants**: low
  percentages (15/163, 13/118, 13/86) because the ACVP suite is dominated by
  non-byte-aligned lengths. The remaining byte-aligned vectors cover the
  critical lengths `[0, 8, 16, 24, 56, 96, 256, 512, 1024, 2048, 8192, max]`.
- **MCT 224/384/512: iter0 + iter99 assertions only** — the algorithm
  is strictly the same (single MD chain, no seed truncation); a
  drift at any intermediate iter would deviate iter 99. All 100
  outer iters are **executed** in all cases (iter 100 depends on the 99
  preceding ones), only the assertion checkpoints are reduced.
- **SHAKE MCT not tested**: the FIPS 202 ACVP revision spec does not expose an
  MCT for SHAKE.
- **LDT not integrated**: multi-GB per tcId, out of CI budget.
- **SHAKE128: very few tcIds with both input AND outLen byte-aligned**
  in the AFT (29/269; 41/237 for SHAKE256). The multi-block squeeze
  code path remains exercised by these 35 vectors.

## Cross references

- Module: [`hash/sha3.js`](./sha3.js)
- Tests: [`hash/sha3.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/sha3.test.js) — 150 tests (110 ACVP/FIPS 202 + 40 streaming API since upgrade plan iteration A1)
- ACVP draft: `references/NIST/ACVP/src/sha3/`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/SHA3-*-2.0/` + `SHAKE-{128,256}-FIPS202/`
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
