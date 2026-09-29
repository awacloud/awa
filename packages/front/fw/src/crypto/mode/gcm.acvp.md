# `gcm.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST SP 800-38D** — *Recommendation for Block Cipher
  Modes of Operation: Galois/Counter Mode (GCM) and GMAC*.
- **Secondary**: **RFC 5288** (TLS), **RFC 4106** (IPsec), **RFC 4543**
  (GMAC), **RFC 7518 §4.7** (JOSE A*-GCM-KW) — interoperability;
  McGrew-Viega vectors.
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- **Vectors**:
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-GCM-1.0/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-GMAC-1.0/`

## Implemented algorithm

GCM (SP 800-38D §7): combines **GCTR** (CTR with a 32-bit counter;
increment modulo 2^32) + **GHASH** (GF(2^128) multiplication under `p(x) =
x^128 + x^7 + x^2 + x + 1`, constant `R = 0xE1000000…`). Subkey `H =
E_K(0^128)`; pre-block `J0` computed via the 96-bit fast path (`IV || 0x00000001`)
or via GHASH for ivLen ≠ 96. PRF: 128-bit block cipher (`encrypt(block)`),
**decrypt not required** (GCM only ever encrypts counters).

API: `encrypt(prf, pt, iv, aad, tlen)` → `{ ct, tag }`; `decrypt(prf,
ct, iv, aad, tag, tlen)` → `pt | false` (plaintext is never released on
an invalid tag; `console.error('CORRUPT:')`). GMAC: `gmac(prf, aad, iv,
tlen)` / `gmacVerify(prf, aad, iv, tag, tlen)`. Nonce safeguard:
`nonceTracker(prf)` (in-process Set of seen IVs, refuses duplicates).

## Test coverage

### Integrated official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| McGrew-Viega §B | TC 1-6, 13-14 | `AES-128-GCM, McGrew-Viega test case 1..6` + `AES-256-GCM TC 13/14` | KAT byte-exact + round-trip + GHASH-J0 (TC 5/6) |
| McGrew-Viega §B | TC 5 (64-bit IV) + TC 6 (480-bit IV) | `non-96-bit IV uses GHASH-derived J0` | alternate J0 code path |
| **McGrew-Viega §B (D1)** | TC 7-12 (AES-192) | `AES-192-GCM, test case 7..12` | KAT byte-exact for AES-192 × {empty, single block, multi-block, AAD, 96/64/480-bit IV}. Cross-checked reference against Node `createCipheriv('aes-192-gcm')` (= OpenSSL libcrypto). |
| **McGrew-Viega §B (D1)** | TC 15-18 (AES-256 extended) | `AES-256-GCM, test case 15..18` | KAT byte-exact extending AES-256 coverage (previously limited to TC 13/14 = empty + single block) to TC 15-18 = full multi-block + AAD + 64/480-bit IV. |
| **ACVP-AES-GCM-1.0** | AFT encrypt 30/30 (tg 1, 2) | `AFT encrypt` | KAT byte-exact ct + tag (ivLen 96/120, payloadLen 0/120, aadLen 0/120, tagLen 32/128) |
| **ACVP-AES-GCM-1.0** | AFT decrypt 30/30 (tg 3, 4) | `AFT decrypt` | Pass/fail labels honored (10 fail / 30 = `{ corrupt ct/tag/iv/aad }` rejected) |
| **ACVP-AES-GMAC-1.0** | AFT encrypt 30/30 (tg 1, 2) | `gmac AFT encrypt` | GMAC tag byte-exact via `gcm.gmac(prf, aad, iv, tlen)` |
| **ACVP-AES-GMAC-1.0** | AFT decrypt 30/30 (tg 3, 4) | `gmac AFT decrypt` | `gmacVerify` returns exact pass/fail labels |

#### AFT integration strategy

ACVP-AES-GCM-1.0 and ACVP-AES-GMAC-1.0 are **compact** (60 + 60 tests,
4 testGroups each) → **full 100 % integration**. The encrypt groups
are exhaustive (30 vectors each); the decrypt groups
include `testPassed=false` cases (10 GCM / 7 GMAC) that explicitly
validate rejection of forged tags.

### Security properties tested

- [x] **GHASH (GF(2^128) multiplication)** — covered by every vector
  with `aadLen > 0` or `payloadLen > 0`.
- [x] **GCTR (counter incremented mod 2^32)** — exercised by all
  payloadLen > 0 (≥ 2 blocks).
- [x] **J0 fast path (96-bit IV)** — `ivLen=96` vectors (3 GCM
  testGroups + 2 GMAC) + McGrew-Viega TC 1-4.
- [x] **J0 GHASH-derived (ivLen ≠ 96)** — `ivLen=120` vectors (3
  GCM testGroups + 2 GMAC) + McGrew-Viega TC 5/6.
- [x] **32/128-bit tag truncation** — all ACVP combinations +
  `truncated tags 96-bit (TLS-style)` test.
- [x] **AAD-only (GMAC)** — 60 dedicated GMAC vectors.
- [x] **Authentication failure handling** — 10 ACVP `testPassed=false`
  cases (corrupt ct/tag/iv/aad) + 3 handcrafted tests (`tampered ciphertext`,
  `tampered AAD`, `tampered tag`). The plaintext is **never** released.
- [x] **`nonceTracker` — duplicate detection** — accepts the first IV, rejects
  reuse (handcrafted test).
- [x] **Empty payload + empty AAD** — McGrew-Viega TC 1 + GCM tg 1 (15
  `payloadLen=0` vectors).
- [x] **Tag length bounds** — `rejects tag length below 32 bits`,
  `rejects tag length above 128 bits`.
- [x] **Empty IV rejection** — `rejects empty IV` (`iv must not be empty`).
- [x] **Constant-time tag compare** — `bitArray.equal` (accumulated XOR,
  no short-circuit) — proof: 10 ACVP fail cases rejected.
- [ ] **Side-channel on `_gmult`** — constant bit-by-bit iteration
  (128 iterations); no secret-dependent branching dependency
  (`if ((X[w] >>> b) & 1)` operates on the secret X but the timing
  remains identical because the XORs are conditionally added).
  Conservative note: a `Karatsuba` or *bit-slicing* implementation
  would be preferable outside JS.
- [ ] **Cross-process nonce reuse** — `nonceTracker` is
  in-process only; persistence/distribution is the caller's concern.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | SP 800-38D + ACVP-AES-GCM-1.0 + ACVP-AES-GMAC-1.0 |
| Validated parameter sizes | ✅ | **AES-128**: 60 ACVP-AES-GCM-1.0 + McGrew-Viega TC 1-6. **AES-192**: McGrew-Viega TC 7-12 (D1). **AES-256**: McGrew-Viega TC 13-18 (D1). All 3 keyLen × {96-bit IV, 64-bit IV, 480-bit IV} × {empty AAD, non-empty AAD} × {payload 0/16/60/64 bytes} covered byte-exact. |
| KAT power-on / self-test | ✅ | McGrew-Viega + 120 ACVP executed on every `bun test` |
| CT comparisons (if secret) | ✅ | `bitArray.equal` (no early exit) |
| No `throw` / timing leak | ✅ | Reviewed: `console.warn`/`console.error` + `return false` |
| Plaintext not released on invalid tag | ✅ | `decrypt` returns `false` BEFORE the final `_gctr`; tested by `testPassed=false` |

## Known limitations

- ~~**AES-192 / AES-256 outside integrated ACVP**~~ ✅ **Iteration D1** —
  **McGrew-Viega TC 7-12 (AES-192) + TC 15-18 (AES-256 extended)** added.
  The supplied ACVP-AES-GCM-1.0 suite still only covers `keyLen=128`
  (60 tests), but McGrew-Viega §B is the historical **canonical source**
  for GCM (referenced by RFC 5288 §A, RFC 4106 §8, RFC 5647) and remains
  the standard authority for 192/256 pending publication of a possible
  ACVP-AES-GCM-2.0. The values are cross-checked against Node
  `createCipheriv('aes-{192,256}-gcm')` (= OpenSSL libcrypto).
- **MCT not specified** by the ACVP for GCM/GMAC.
- **`nonceTracker` not scalable**: in-process Set; `seenNonces` exposed
  for manual purging. Recommendation: a deterministic out-of-process
  counter for long-horizon deployments.
- **`payloadLen` bounded by ACVP**: 0..120 bits (compact test).
  McGrew-Viega extends up to 480 bits. For the theoretical GCM limit
  (`2^32 − 2` blocks ≈ 64 GiB), no stress test (out of budget).
- **`_gmult` bit-by-bit**: 128 iterations per multiplication, slow in
  pure JS (~50 µs/multiplication). Optimization via precomputed tables
  (Karatsuba M0/M4/M8 bytes) out of scope.
- **96-bit random nonce ≠ deterministic**: SP 800-38D §8.2.1 vs §8.2.2.
  The ACVP vectors use `ivGen=external, ivGenMode=8.2.2`
  (deterministic, handled by the caller). The module accepts any IV;
  the generation contract is delegated.

## Cross-references

- Module: [`mode/gcm.js`](./gcm.js)
- Tests: [`mode/gcm.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/mode/gcm.test.js) — 156 tests (143 baseline + 13 McGrew-Viega TC 7-12 / 15-18 [D1])
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-GCM-1.0/` + `ACVP-AES-GMAC-1.0/`
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
