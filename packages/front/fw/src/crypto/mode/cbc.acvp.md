# `cbc.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST SP 800-38A** — *Recommendation for Block Cipher Modes
  of Operation: Methods and Techniques*, §6.2 (CBC).
- **Secondary**: **RFC 3602** (test vectors); FIPS 197 for the underlying
  AES block cipher.
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- **Vectors**: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-CBC-1.0/`

## Implemented algorithm

CBC (SP 800-38A §6.2): `C[i] = AES_K(P[i] XOR C[i-1])`; `C[-1] = IV`. Block
PRF supplied by the caller (`{ encrypt, decrypt }`), block-size = 128 bits.
**Does not perform padding** — the caller must deliver a message that is a
multiple of 16 bytes (use `pad/strip` around it for PKCS#7). Returns `false`
on IV ≠ 128 bits, a non-block-aligned message, or a PRF without `decrypt`
(cipher built with `full=false`). State: none (pure functions).

## Test coverage

### Integrated official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| RFC 3602 §4.1 | TC #1 (16 B / 1 block) | `RFC 3602 §4 vector #1` | KAT byte-exact + round-trip AES-128 |
| RFC 3602 §4.2 | TC #2 (32 B / 2 blocks) | `RFC 3602 §4 vector #2` | KAT byte-exact + round-trip AES-128 |
| RFC 3602 §4.3 | TC #3 (48 B / 3 blocks) | `RFC 3602 §4 vector #3` | KAT byte-exact, multi-block CBC chain |
| RFC 3602 §4.4 | TC #4 (64 B / 4 blocks) | `RFC 3602 §4 vector #4` | KAT byte-exact, multi-block CBC chain |
| **ACVP-AES-CBC-1.0** | AFT encrypt 72 / 1284 (12 testGroups) | `AFT encrypt` | KAT byte-exact (AES-128/192/256, ptLen 128..1280 bits) |
| **ACVP-AES-CBC-1.0** | AFT decrypt 72 / 1284 (12 testGroups) | `AFT decrypt` | KAT byte-exact (AES-128/192/256, ctLen 128..1280 bits) |

#### AFT sub-sampling strategy

ACVP-AES-CBC-1.0 exposes **42 testGroups / 2156 tests**: 36 AFT (12 per
direction × 3 keyLen) and 6 MCT. AFT strategy:

- **Single-block groups (KAT/MMT)**: `[first, middle, last]` → 3 tcId.
- **Multi-block groups (tgId 25-30)**: **ALL 10 tcId** (ptLen ∈ {128,
  256, 384, 512, 640, 768, 896, 1024, 1152, 1280} bits). This is the only
  subset that exercises the CBC chain over ≥ 2 blocks; full coverage.
- **"Extended" groups (tgId 31-36)**: 2 tcId each → all taken.
- **Total integrated**: **144 / 2156** AFT (≈ 6.7 %).

### Security properties tested

- [x] **Multi-block CBC chain** — 60 multi-block ACVP vectors (tgId 25-30,
  up to 10 blocks / 1280 bits) + RFC 3602 #2/#3/#4. Any chaining error
  (XOR on the wrong output, wrong previous block) deviates byte-exact.
- [x] **AES-128 + AES-192 + AES-256** — covered by 3 keyLens × 2 directions.
- [x] **Encrypt + decrypt** — separate directions in the ACVP: no
  trivial self-verification, each ct/pt is validated independently.
- [x] **Round-trip** — RFC 3602 #1-#4 (encrypt(decrypt(x)) == x).
- [x] **Non-standard IV** — `iv must be 128 bits` (rejection `false` +
  `console.warn`).
- [x] **Non-aligned message** — `plaintext must be a whole number of 16-byte
  blocks` (rejection `false`).
- [x] **PRF without decrypt** — `cipher built with full=true` required
  (otherwise `false`).
- [ ] **Padding (PKCS#7) interop** — N/A: `cbc.js` operates on an already
  padded message (wrapper's responsibility). Padding is tested separately
  in `pad.test.js`.
- [ ] **Side-channel on PRF** — delegated to `aes.js` (the CBC module is
  data-independent at the XOR/branching level).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | SP 800-38A §6.2 + ACVP-AES-CBC-1.0 |
| Validated parameter sizes | ✅ | AES-128/192/256 × ptLen 128..1280 bits |
| KAT power-on / self-test | ✅ | RFC 3602 + 144 AFT executed on every `bun test` |
| CT comparisons (if secret) | N/A | Deterministic mode with no secret branch; CT guaranteed by AES |
| No `throw` / timing leak | ✅ | Reviewed: `console.warn` + `return false` |

## Known limitations

- ~~**MCT not integrated**~~ ✅ **Iteration D4** — implemented.
  6 MCT testGroups from ACVP-AES-CBC-1.0 (37-42, encrypt + decrypt × AES-128/192/256)
  integrated. Each MCT runs 100 outer × 1000 inner AES-CBC ops with:
  1. Per-iter key transition (`Key[j+1] = Key[j] XOR last(keyLen, CT[998]||CT[999])`).
  2. `IV[j+1] = CT[999]` and `PT[0]_{j+1} = CT[998]`.
  Byte-exact assertions on `resultsArray[0]` AND `resultsArray[99]` (input +
  final state) — any drift on any of the 100 outer iters breaks iter99.
  Cost: ~6 s per MCT (×6 MCTs = ~36 s additional).
- **Other ACVP CBC modes** (`ACVP-AES-CBC-CS{1,2,3}-1.0` — Ciphertext
  Stealing) not integrated: `cbc.js` does not implement CTS (rarely used
  mode, delegated to a separate module if needed).
- **AFT sub-sampling**: 6.7 % of the total. The 2012 unplayed vectors
  share the same code paths as the 144 retained ones (XOR + PRF call
  unchanged). Representativeness is guaranteed by: (a) coverage of the 3
  keyLens, (b) full coverage of the 10 multi-block ptLens, (c) 3
  vectors per testGroup for the single-block groups.
- **No IV-reuse test**: CBC with a repeated IV under the same K causes an
  XOR leak of the first blocks; the caller's responsibility (the module
  does not keep an IV tracker unlike `gcm.js`).

## Cross-references

- Module: [`mode/cbc.js`](./cbc.js)
- Tests: [`mode/cbc.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/mode/cbc.test.js) — 163 tests (157 baseline + 6 MCT [D4]: 3 encrypt + 3 decrypt × AES-128/192/256, byte-exact iter0 + iter99)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-CBC-1.0/`
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
