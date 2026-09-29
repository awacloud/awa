# `pbkdf2.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST SP 800-132** — *Recommendation for
  Password-Based Key Derivation, Part 1: Storage Applications*.
- **Secondary**: **RFC 2898 / PKCS #5 v2.1 / RFC 8018** — *PKCS #5:
  Password-Based Cryptography Specification* (PBKDF2 algorithm,
  reference vectors for HMAC-SHA-1/256).
- **OWASP conformance**: Password Storage Cheat Sheet (2023) —
  `count ≥ 600 000` for PBKDF2-HMAC-SHA-256.
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-pbkdf.adoc`
- **Vectors**: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/PBKDF-1.0/`

## Implemented algorithm

PBKDF2 (PKCS #5 §5.2 / RFC 2898):

```
DK = T_1 || T_2 || ... || T_l   (truncated to dkLen)
T_i = F(P, S, c, i)
F(P, S, c, i) = U_1 ⊕ U_2 ⊕ ... ⊕ U_c
U_1 = PRF(P, S || INT_be32(i))
U_j = PRF(P, U_{j-1})
```

Default PRF = HMAC-SHA-256 (`Prff` overridable). `dkLen` in bits.
Bounds: `count ≥ 0`, `length ≥ 0`; warning if `count < 100 000`
(`MIN_RECOMMENDED_COUNT`). Default `count = 600 000` (OWASP 2023).

API: `pbkdf2(password, salt, count, length_bits, Prff?)` — directly
callable; `.derive(...)` alias. `password`/`salt` accept `string`
(UTF-8 → bytes → bitArray) or `bitArray`. Output `bitArray | false`.

## Test coverage

### Built-in official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| RFC 7914 / PKCS #5 (de-facto) | TC 1 (c=1, dkLen=256) | `c=1, dkLen=256 bits` | byte-exact KAT (sanity) |
| RFC 7914 / PKCS #5 (de-facto) | TC 2 (c=2) | `c=2, dkLen=256 bits` | byte-exact KAT |
| RFC 7914 / PKCS #5 (de-facto) | TC 3 (c=4096) | `c=4096, dkLen=256 bits` | byte-exact KAT (nominal count) |
| RFC 7914 / PKCS #5 (de-facto) | TC 4 (long P/S) | `c=4096, dkLen=320 bits` | byte-exact KAT, multi-block T_2 |
| **PBKDF-1.0** | AFT 25/50 (sub-sample 1/2) | `pbkdf2 - PBKDF-1.0 / AFT` | byte-exact dkm (HMAC-SHA-224 × 25 vectors) |
| **Cross-check against Python `hashlib.pbkdf2_hmac()`** (B4) | 9 families × 5 cases = 45 vectors | `pbkdf2 - itération B4 (10-family cross-check)` | byte-exact against the `hashlib.pbkdf2_hmac()` reference (SHA-2-256/384/512, SHA-512/{224,256}, SHA-3-{224,256,384,512}) |

#### AFT sub-sampling strategy

`PBKDF-1.0` exposes only **1 testGroup × 50 AFT** (HMAC-SHA-224;
the other PRFs are absent from the v1.0 draft). Sub-sample applied:

- **1 vector out of 2** (even index) → 25 vectors integrated.
- Total `iterationCount` executed = **135 077** HMAC-SHA-224
  iterations (~5 s wall-time in pure JS).
- Covers `iterationCount ∈ [1, 10 000]`, `keyLen ∈ [112, 560]` bits,
  `saltLen ∈ [16, 32]` bytes, `passwordLen ∈ [8, 32]` ASCII characters.

### Security properties tested

- [x] **F(P, S, c, i) chain (XOR of c PRF calls)** — covered by all
  vectors with `c > 1` (24/25 ACVP).
- [x] **Multi-block T_i (dkLen > HashLen)** — `keyLen > 224` bits forces
  ≥ 2 blocks T_1, T_2 (16/25 ACVP with keyLen ∈ [232, 560]).
- [x] **Single-iteration KAT** — `c=1` covers the initial output `T_i =
  PRF(P, S || INT_be32(i))` (1 ACVP + 1 RFC).
- [x] **High-iteration count** — `c=10 000` exercised (1 ACVP), `c=4096`
  (2 RFC).
- [x] **HMAC-SHA-256** (default PRF) — RFC 7914 vectors.
- [x] **HMAC-SHA-224** (Prff override) — 25 byte-exact ACVP.
- [x] **HMAC-SHA-{384,512}** ✅ B4 — 5 vectors/family cross-checked against Python `hashlib`.
- [x] **HMAC-SHA-512/{224,256}** ✅ B4 — 5 vectors/family cross-checked against Python `hashlib`.
- [x] **HMAC-SHA-3-{224,256,384,512}** ✅ B4 — 5 vectors/family cross-checked against Python `hashlib`.
- [x] **String → UTF-8 bytes** — handcrafted (`'password'` direct).
- [x] **Default count 600 000 applied** — `pbkdf2('p', 's', undefined,
  128) === pbkdf2('p', 's', 600000, 128)`.
- [x] **Warning if count < 100 000** — emits `console.warn('WEAK:')`;
  observed on 25/25 ACVP (all < 100 000) + 45 cross-check (same).
- [x] **Bounds** — `count < 0` → `false`; `length < 0` → `false`.
- [x] **Empty password** ✅ B4 — `pbkdf2('', 'salt', 10, 128)` covered
  for the 9 new families (degenerate PRF-over-zero-length-input case).
- [x] **dkLen < HashLen (T_1 truncation)** ✅ B4 — `dkLen=160` bits with
  HashLen=512 bits forces a single truncated `T_1` output; covered for
  the 9 new families.
- [ ] **PBKDF-2.0 ACVP** — not published to date; the Python cross-check
  remains the authority for the 9 families not covered by v1.0.
- [ ] **HMAC side-channel** — delegated to `hmac.js`.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | SP 800-132 (PBKDF) + PKCS #5 v2.1 |
| Validated parameter sizes | ✅ | dkLen 112..560 bits × salt 16..32 B × password 8..32 B × iter 1..10000 + cross-check 9 PRF families (B4) |
| Power-on KAT / self-test | ✅ | RFC 7914 + 25 ACVP SHA-224 + 45 cross-check (B4) executed on every `bun test` |
| CT comparisons (if secret) | N/A (PBKDF2 performs no comparison; delegated to the caller) | — |
| No `throw` / timing leak | ✅ | Review: `console.warn` + `return false` |
| Production hardening | ✅ | Default `count = 600 000` (OWASP 2023); warning below 100 000 |

## Known limitations

- **PBKDF-1.0 covers only HMAC-SHA-224**: the 9 other families
  (SHA-256/384/512, SHA-512/{224,256}, SHA-3-{224,256,384,512}) are
  validated in B4 via cross-check against Python **`hashlib.pbkdf2_hmac()`**
  (5 vectors/family = 45 regression vectors). A future PBKDF-2.0
  ACVP would replace these snapshots with official NIST vectors.
- **50% sub-sampling**: 25 ACVP vectors not exercised (out of 50). The
  even-index pattern uniformly covers the `iterationCount` range.
- ~~**HMAC-SHA-3**~~ ✅ B4 — supported via the A1 streaming modules.
- **B4 wall-time cost**: 6.3 s for the 80 tests (including 18 vectors
  at `c=4096` across 9 families). For `count = 600 000` (default
  production), a single call = 30-60 s; the module is designed for
  off-critical-path usage (key wrapping/storage).

## Cross references

- Module: [`hash/pbkdf2.js`](./pbkdf2.js)
- Tests: [`hash/pbkdf2.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/pbkdf2.test.js) — 80 tests (35 baseline + 45 cross-check over 9 families since iteration B4)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-pbkdf.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/PBKDF-1.0/`
- Underlying HMAC: [`hmac.acvp.md`](./hmac.acvp.md)
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
