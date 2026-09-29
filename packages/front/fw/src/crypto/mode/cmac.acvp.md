# `cmac.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST SP 800-38B** — *Recommendation for Block Cipher
  Modes of Operation: The CMAC Mode for Authentication*.
- **Secondary**: **RFC 4493** — *The AES-CMAC Algorithm* (test
  vectors).
- **ACVP draft**: `references/NIST/ACVP/src/cmac/`
- **Vectors**: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/CMAC-AES-1.0/`

## Implemented algorithm

CMAC (SP 800-38B §6.2 / RFC 4493 §2.4): a CBC-MAC variant resistant to
length extension via two subkeys `K1`, `K2` derived from `L =
E_K(0^128)` by doubling in GF(2^128) under `p(x) = x^128 + x^7 + x^2 +
x + 1` (constant `Rb = 0x87`). The final block is XORed with `K1`
(block-aligned message) or `K2` (final block padded `10*`). Output:
128-bit tag; truncation is the caller's responsibility. PRF: 128-bit
block cipher (`encrypt(block)`) — AES is the only one specified by
NIST. Constant-time verification via `bitArray.equal`.

## Test coverage

### Integrated official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| RFC 4493 §4 | `L`, `K1`, `K2` derivation | `subkey derivation (K1, K2)` | KAT byte-exact subkey derivation |
| RFC 4493 §4 | Ex. 1 (empty), Ex. 2 (16 B), Ex. 3 (40 B), Ex. 4 (64 B) | `RFC 4493 §4 test vectors` | KAT byte-exact, 4 message cases |
| **CMAC-AES-1.0** | `gen` 81/216 (27 testGroups × 8 AFT) | `gen (MAC generation)` | KAT byte-exact (AES-128/192/256 × msgLen ∈ {0, 4256, 65536} × macLen ∈ {64, 88, 128}) |
| **CMAC-AES-1.0** | `ver` 108/540 (27 testGroups × 4 AFT) | `ver (MAC verification)` | Pass/fail labels honored (2 pass + 2 fail per group) |

#### AFT sub-sampling strategy

ACVP CMAC-AES-1.0 exposes **54 testGroups / 756 tests** organized as:

- **27 `gen` groups** (3 keyLen × 3 msgLen × 3 macLen × 8 tcId): for
  each group, take `[first, middle, last]` → 81 vectors.
- **27 `ver` groups** (same parameters × 20 tcId, of which 15 `pass` + 5 `fail`)
  : for each group, take **2 pass + 2 fail** → 108 vectors; the
  test verifies that `bitArray.equal(expected, provided)` returns the
  expected label.
- **Truncation**: `bitArray.clamp(tag, macLen)` — covers the 3 specified
  values (64, 88, 128 bits).
- **Total integrated**: **189 / 756** (≈ 25 %).

### Security properties tested

- [x] **`K1`, `K2` subkey derivation** — RFC 4493 §4 vector + all
  189 ACVP (each tag depends on the correct subkeys).
- [x] **GF(2^128) doubling** — `_dbl` exposed (`_internal.dbl`) and validated
  against the RFC 4493 values (`L`, `K1`, `K2`).
- [x] **Full block vs padded branch** — covered by msgLen ∈ {0
  (padded), 4256 (= 532 bytes, non-aligned mod 16 → padded K2), 65536 (= 8192
  bytes, aligned mod 16 → K1)}.
- [x] **64/88/128-bit truncation** — 9 macLen combinations tested per
  variant.
- [x] **AES-128/192/256** — 3 keyLens covered for gen and ver.
- [x] **Constant-time verify** — `verify` uses `bitArray.equal`
  (accumulated XOR); tests `accepts a correct tag` + `rejects a tampered
  tag` + 27 negative ACVP ver tests.
- [x] **Empty message** — RFC 4493 Ex. 1 + 9 ACVP `msgLen=0` groups.
- [ ] **Side-channel on PRF** — delegated to `aes.js`.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | SP 800-38B + CMAC-AES-1.0 |
| Validated parameter sizes | ✅ | AES-128/192/256 × msgLen 0/4256/65536 × macLen 64/88/128 |
| KAT power-on / self-test | ✅ | RFC 4493 §4 + 189 ACVP executed on every `bun test` |
| CT comparisons (if secret) | ✅ | `verify` → `bitArray.equal` |
| No `throw` / timing leak | ✅ | Reviewed: no `throw`; `verify` returns `false` |

## Known limitations

- **CMAC-TDES not covered**: `CMAC-TDES-1.0` present in `references/NIST/`
  but out of scope. **Iteration D3**: added `_checkBlockSize` which
  rejects any PRF with `blockSize !== 16` (TDES = 8 bytes) with a typed
  `DEPRECATED` warning. Prevents any silent use by a consumer that would
  mistakenly pass a TDES PRF.
- **25 % sub-sampling**: 567 unplayed vectors (567 of 756) share
  the same code paths. The anchors cover `[first, middle, last]`
  per group and each `(keyLen, msgLen, macLen)` combination has at least
  3 gen + 4 ver integrated.
- ~~**No explicit guard against invalid macLen**~~ ✅ **Iteration
  D3** — added `truncatedMac(prf, message, tagLen)` and
  `truncatedVerify(prf, message, tag, tagLen)` which enforce
  `tagLen ∈ [32, 128]` (SP 800-38B §6.4). The legacy `mac()` API remains
  unchanged (returns 128 bits) for back-compat; the new functions are
  to be used when the caller wants truncation enforced by the module
  instead of handling it by hand.
- **No bounded `msgLen` check**: SP 800-38B §6.3 sets `Mlen ≤ 2^64 − 1`
  bits (a natural limit of 8 EiB). No guard in the module; the
  constraint is largely out of reach in JS (`Number.MAX_SAFE_INTEGER`).
- **Test file volume**: ~1.1 MB (msgLen=65536 × ~63 vectors). If an
  IDE issue arises, sub-sample to 1 vector per `msgLen=65536` group.

## Cross-references

- Module: [`mode/cmac.js`](./cmac.js)
- Tests: [`mode/cmac.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/mode/cmac.test.js) — 210 tests (197 baseline + 13 iteration D3: TDES guard + truncatedMac SP 800-38B §6.4 enforcement)
- ACVP draft: `references/NIST/ACVP/src/cmac/`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/CMAC-AES-1.0/`
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
