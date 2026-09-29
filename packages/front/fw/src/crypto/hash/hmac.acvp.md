# `hmac.js` — ACVP / NIST conformance

## Standards

- **Primary**: **FIPS 198-1** — *The Keyed-Hash Message Authentication Code (HMAC)*.
- **Secondary**: **RFC 2104** (HMAC) + **RFC 4231** (HMAC-SHA-2 test vectors).
- **ACVP draft**: `references/NIST/ACVP/src/` (HMAC sub-spec).
- **Vectors**:
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/HMAC-SHA2-{224,256,384,512}-2.0/`

## Implemented algorithm

HMAC `H(K xor opad || H(K xor ipad || M))` (FIPS 198-1 / RFC 2104). Underlying
hash passed as a constructor argument (default `sha256`). If the key
exceeds `blockSize`, it is pre-hashed. Dual streaming state: `_baseHash[0]`
(ipad), `_baseHash[1]` (opad), result derived via `_resultHash`. API:
`new fn(key, Hash).update(data).digest()` or `.encrypt(data)`; `verify(key,
data, tag, Hash)` constant-time via `bitArray.equal`. Output: `bitArray`
(length = underlying hash's `digestSize`). MAC truncation is the
caller's responsibility (`bitArray.clamp(tag, macLen)`).

## Test coverage

### Built-in official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| RFC 4231 | TC 1, 2, 3, 4, 6 (HMAC-SHA-256) | `RFC 4231 HMAC-SHA-256 vectors` | byte-exact KAT (incl. key > blockSize) |
| RFC 4231 | TC 1 (HMAC-SHA-512) | `HMAC-SHA-512 (custom hash arg)` | byte-exact KAT, validates custom hash injection |
| **ACVP-HMAC-SHA2-224-2.0** | AFT sub-sample 36/150 | `ACVP HMAC-SHA2-224-2.0 / AFT` | byte-exact KAT, keyLen 8..2048, variable macLen |
| **ACVP-HMAC-SHA2-256-2.0** | AFT sub-sample 35/150 | `ACVP HMAC-SHA2-256-2.0 / AFT` | byte-exact KAT, keyLen 8..2048, variable macLen |
| **ACVP-HMAC-SHA2-384-2.0** | AFT sub-sample 35/150 | `ACVP HMAC-SHA2-384-2.0 / AFT` | byte-exact KAT, keyLen 8..2048, variable macLen |
| **ACVP-HMAC-SHA2-512-2.0** | AFT sub-sample 36/150 | `ACVP HMAC-SHA2-512-2.0 / AFT` | byte-exact KAT, keyLen 8..2048, variable macLen |
| **ACVP-HMAC-SHA3-224-2.0** (B1) | AFT sub-sample 31/150 | `hmac - ACVP HMAC-SHA3-224-2.0` | byte-exact KAT via `sha3.sha3_224_hash` (rate 1152 bits) |
| **ACVP-HMAC-SHA3-256-2.0** (B1) | AFT sub-sample 31/150 | `hmac - ACVP HMAC-SHA3-256-2.0` | byte-exact KAT via `sha3.sha3_256_hash` (rate 1088 bits) |
| **ACVP-HMAC-SHA3-384-2.0** (B1) | AFT sub-sample 31/150 | `hmac - ACVP HMAC-SHA3-384-2.0` | byte-exact KAT via `sha3.sha3_384_hash` (rate 832 bits) |
| **ACVP-HMAC-SHA3-512-2.0** (B1) | AFT sub-sample 31/150 | `hmac - ACVP HMAC-SHA3-512-2.0` | byte-exact KAT via `sha3.sha3_512_hash` (rate 576 bits) |
| **ACVP-HMAC-SHA2-512-224-2.0** (B2) | AFT sub-sample 31/150 | `hmac - ACVP HMAC-SHA2-512-224-2.0` | byte-exact KAT via `sha512_224.factory(sha512)` (block 1024, digest 224 bits) |
| **ACVP-HMAC-SHA2-512-256-2.0** (B2) | AFT sub-sample 31/150 | `hmac - ACVP HMAC-SHA2-512-256-2.0` | byte-exact KAT via `sha512_256.factory(sha512)` (block 1024, digest 256 bits) |

#### AFT sub-sampling strategy

Each ACVP HMAC-SHA2-X-2.0 suite enumerates 150 tests (1 testGroup) covering
~130 distinct keyLen × 129 msgLen × 11 macLen, **all byte-aligned** (verified
at extraction time). Strategy:

- **Regular stride**: one tcId in 5.
- **Anchors**: `min/max(keyLen)`, `min/max(msgLen)`, `min/max(macLen)`,
  first and last tcId.
- **Total integrated**: ~35 / 150 per variant (≈ 23%).

### Security properties tested

- [x] **Key pre-hashing > blockSize** — RFC 4231 TC 6 (131-byte key; SHA-256
  blockSize = 64) + ACVP case `keyLen ∈ {1024..2048}`.
- [x] **Correct ipad/opad padding** — implicitly covered by every KAT.
- [x] **MAC truncation** — variable `macLen` validated on 11 distinct values
  per variant via `bitArray.clamp(tag, macBits)`.
- [x] **Streaming = one-shot** — `chunked update matches one-shot`.
- [x] **Reset after digest** — `reset allows reuse after digest`.
- [x] **Double-encrypt guard** — `encrypt` on an already-`update`-d instance
  returns `false` + `console.warn`.
- [x] **Constant-time verify** — `verify` uses `bitArray.equal`
  (XOR-accumulated, no short-circuit) — see tests `accepts correct tag`,
  `rejects single-bit tampered tag`, `rejects different message`,
  `rejects different key`, `verify with custom hash module`.
- [x] **Arbitrary hash injection** — `Hash` constructor parameter,
  validated by HMAC-SHA-{224,256,384,512} in the same suite.
- [ ] **Key pre-hashing timing side-channel** — N/A (pre-hashing
  consumes the key in a block, no data-dependent comparison).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | FIPS 198-1 + ACVP-HMAC-SHA2-{224,256,384,512}-2.0 + ACVP-HMAC-SHA2-512-{224,256}-2.0 (B2) + ACVP-HMAC-SHA3-{224,256,384,512}-2.0 (B1) |
| Validated parameter sizes | ✅ | **10 underlying hashes** (4 SHA-2 + 2 SHA-512-truncated + 4 SHA-3) × keyLen 8..2048 × 11 macLen values |
| Power-on KAT / self-test | ✅ | RFC 4231 + ~140 SHA-2 vectors + 62 SHA-512-truncated vectors + 124 SHA-3 ACVP vectors executed on every `bun test` |
| CT comparisons (if secret) | ✅ | `verify` → `bitArray.equal` (XOR-accumulated) |
| No `throw` / timing leak | ✅ | Review: `console.warn` + `return false` (encrypt on an updated instance) |

## Known limitations

- **HMAC-SHA-1 not covered**: SHA-1 is out of scope (discouraged by NIST SP
  800-131A); no `sha1.js` module exposed. The ACVP
  `HMAC-SHA-1-{1.0,2.0}` folders present under `references/NIST/` remain unused.
- ~~**HMAC-SHA-3 not covered**~~ ✅ **Iteration B1 (upgrade plan)**:
  HMAC-SHA-3-{224,256,384,512} now covered via the streaming modules
  `sha3.sha3_{224,256,384,512}_hash` exposed in iteration A1. **31
  byte-exact ACVP HMAC-SHA3-*-2.0 vectors per variant** (124 total).
- ~~**HMAC-SHA-512/224 and HMAC-SHA-512/256 not covered**~~ ✅ **Iteration
  B2**: covered via the `sha512_224.js` / `sha512_256.js` modules created
  in A3. **62 byte-exact ACVP HMAC-SHA2-512-{224,256}-2.0 vectors**
  (31 + 31 sub-samples).
- **AFT sub-sampling**: ~23% per variant. The HMAC code path is unique
  (`encrypt`), only the `keyLen > blockSize` and `keyLen <
  blockSize` transitions diverge; both branches are covered by the
  `min/max(keyLen)` anchors.
- **No HMAC MCT**: the ACVP HMAC suite does not define a Monte Carlo
  Test (unlike SHA-2 / SHA-3).
- **No explicit guard against an empty key**: `keyLen=0` is accepted by the
  constructor (equivalent to HMAC of an all-zero key after ipad/opad XOR);
  not forbidden by RFC 2104 but to be avoided in production.

## Cross references

- Module: [`hash/hmac.js`](./hmac.js)
- Tests: [`hash/hmac.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/hmac.test.js) — 344 tests (158 SHA-2 + 124 SHA-3 [B1] + 62 SHA-512-truncated [B2])
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/HMAC-SHA2-*-2.0/`
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
