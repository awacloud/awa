# `ctr.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST SP 800-38A** — *Recommendation for Block Cipher Modes
  of Operation: Methods and Techniques*, §6.5 (CTR) + Appendix B (counter
  generation), Appendix F.5 (test vectors).
- **Secondary**: FIPS 197 (AES) for the block PRF.
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- **Vectors**: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-CTR-1.0/`

## Implemented algorithm

CTR (SP 800-38A §6.5): keystream `K = AES_K(CTR_0) || AES_K(CTR_1) || ...`
then `C = P XOR K[:|P|]`. Encrypt = decrypt (involution). Counter
incremented big-endian over 128 bits (carry propagation from the
least-significant byte). API: `encrypt(prf, pt, iv)` / `decrypt(prf, ct, iv)`;
128-bit block PRF; payload of arbitrary length (including non-byte-aligned
via `bitArray.clamp(d, bitLength)`). Helpers `ui8_increase` (+`pos/16`
blocks) and `ui8_increase_384` (advancement over the last 16 bytes of a
48-byte buffer — used by AES-256 KeePass derivation).

## Test coverage

### Integrated official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| NIST SP 800-38A App. F.5.1 | AES-128-CTR (4 blocks / 64 bytes) | `NIST SP 800-38A AES-128-CTR vector F.5.1` | KAT byte-exact + involution encrypt=decrypt |
| **ACVP-AES-CTR-1.0** | AFT encrypt 39/75 (3 testGroups × AES-128/192/256) | `AFT encrypt` | KAT byte-exact, payloadLen 1..1920 bits incl. non-byte/non-block-aligned |
| **ACVP-AES-CTR-1.0** | AFT decrypt 39/75 (3 testGroups × AES-128/192/256) | `AFT decrypt` | KAT byte-exact, payloadLen 1..1920 bits |

#### AFT sub-sampling strategy

ACVP-AES-CTR-1.0 exposes **6 testGroups / 150 AFT** (3 keyLen × 2
directions × 25 tests). Strategy:

- **Regular stride**: one tcId out of 2 (≈ 13/25 per group).
- **Anchors**: `min/max(payloadLen)` per group (covers the extreme
  cases 1 bit and 1920 bits).
- **Total integrated**: **78 / 150** (≈ 52 %).
- **Non-byte-aligned payloadLen**: 52/150 ACVP vectors, **retained** in
  the sample; decoded via `bitArray.clamp(ui8_to_ba(bytes), bitLen)`.
- **Non-block-aligned payloadLen**: 60/150 vectors (final clamp exercised).

**IV note for AFT encrypt**: the ACVP CTR suite enumerates `(key, pt,
payloadLen)` on the prompt side and leaves the IUT to generate the IV.
We use the IV reported in `expectedResults.json` (one valid IV among
many) and verify the CT byte-exact against the same source. The
`_calculate` logic has no IV generation; it is sourced by the caller.

### Security properties tested

- [x] **AES-128/192/256 keystream** — covered by 6 ACVP testGroups +
  vector F.5.1.
- [x] **Big-endian counter + carry** — exercised by vectors with
  `payloadLen > 128` (all ≥ 256 bits go through ≥ 2 increments) +
  `ui8_increase` tests `propagates carry across bytes`, `adds ⌊pos/16⌋`,
  `does not mutate input`.
- [x] **Encrypt = decrypt (involution)** — `decrypt is identical to encrypt`
  + AFT decrypt (39 distinct vectors) independently validate the symmetry.
- [x] **Final truncation (clamp to bitLength)** — 60 non-block-aligned
  ACVP vectors + 52 non-byte-aligned → any leak past the `bl`-th bit
  deviates the hex result.
- [x] **Invalid-length IV** — `iv must be 128 bits` (rejection `false`).
- [x] **Empty data** — `empty data returns empty array` (null `payloadLen=0` case).
- [x] **`ui8_increase` + `ui8_increase_384` helpers** — covered by
  4 dedicated tests.
- [ ] **Side-channel** — delegated to `aes.js` (CTR introduces no
  additional data-dependent branching; XOR + counter carry are **public**).
- [ ] **IV reuse (catastrophic under CTR)** — not guarded by the
  module: caller's responsibility (see `gcm.nonceTracker` for reference).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | SP 800-38A §6.5 + ACVP-AES-CTR-1.0 |
| Validated parameter sizes | ✅ | AES-128/192/256, payloadLen 1..1920 bits |
| KAT power-on / self-test | ✅ | F.5.1 + 78 AFT executed on every `bun test` |
| CT comparisons (if secret) | N/A | No secret comparison in CTR; CT guaranteed by AES |
| No `throw` / timing leak | ✅ | Reviewed: `console.warn` + `return false` |

## Known limitations

- **MCT not specified for CTR by the ACVP**: the official suite is
  limited to AFT (unlike AES-CBC/ECB). Not a coverage gap —
  confirmed by inspecting `ACVP-AES-CTR-1.0/prompt.json` (6 testGroups,
  all `testType=AFT`, no `MCT`). **Iteration D4 of the FIPS 140-3
  upgrade plan**: CBC gets its 6 MCTs, CTR stays AFT-only by construction.
- **No F.5.2/F.5.3/F.5.4 vector (AES-192/256-CTR)** integrated
  manually — covered indirectly by the ACVP encrypt/decrypt × 192/256.
- **No anti-IV-reuse guard**: if the same (K, IV) pair is
  used for two messages, the keystream is repeated → `XOR(C1, C2) =
  XOR(P1, P2)` (total leak). To be handled by the caller (the `cbc`
  module has the same property, likewise; only `gcm` provides
  `nonceTracker`).
- **"Monolithic" 128-bit counter**: SP 800-38A App. B allows separate
  counter schemes (nonce || counter with internal wrap). Our
  implementation increments the full 128 bits; no partial wrap.
  Compatible with ACVP vectors that supply an arbitrary IV but not
  strictly RFC 3686 (where only the low-32 counter increments).

## Cross-references

- Module: [`mode/ctr.js`](./ctr.js)
- Tests: [`mode/ctr.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/mode/ctr.test.js) — 87 tests (was 9 before this iteration)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-CTR-1.0/`
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
