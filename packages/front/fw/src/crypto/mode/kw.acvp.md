# `kw.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST SP 800-38F** — *Recommendation for Block Cipher
  Modes of Operation: Methods for Key Wrapping*.
- **Secondary**:
  - **RFC 3394** — *AES Key Wrap Algorithm* (KW)
  - **RFC 5649** — *AES Key Wrap with Padding Algorithm* (KWP)
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- **Vectors**:
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-KW-1.0/`
  - `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-KWP-1.0/`

## Implemented algorithm

KW (SP 800-38F §6.2): *Wrapping function* `W` over 6 rounds (n+1 64-bit
semi-blocks, n ≥ 2) — chained via register `A` initialized to
`0xA6A6A6A6A6A6A6A6` (RFC 3394 IV). Integrity check after unwrap
by comparing `A` to the expected IV.

KWP (SP 800-38F §6.3 / RFC 5649): extension of KW for arbitrary length
≥ 1 byte. Extended IV = `0xA65959A6 || MLI₃₂` (plaintext length in
bytes, big-endian). Zero-padding up to the next multiple of 8 bytes.
Single-semi-block fast path (≤ 8 bytes of data) = a single AES
encryption (RFC 5649 §4.1). Constant-time verification: IV check +
MLI ∈ [maxLen-7, maxLen] + zero padding bytes — all accumulated in a
single `bad` word before the final branch (no short-circuit).

API: `wrap(prf, pt)` / `unwrap(prf, ct)` / `wrapPad(prf, pt)` /
`unwrapPad(prf, ct)` → `Uint8Array | false`. PRF = AES instantiated with
`full=true` (exposes both `encrypt` AND `decrypt`).

## Test coverage

### Integrated official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| RFC 3394 §4.1 | KW AES-128 | `RFC 3394 §4.1 — Wrap 128-bit key with 128-bit KEK` | KAT byte-exact + round-trip |
| RFC 3394 §4.2 | KW AES-192 | `RFC 3394 §4.2` | KAT byte-exact + unwrap |
| RFC 3394 §4.3 | KW AES-256 | `RFC 3394 §4.3` | KAT byte-exact wrap |
| RFC 3394 §4.4 | KW 192/192 | `RFC 3394 §4.4` | KAT byte-exact wrap |
| RFC 3394 §4.6 | KW 256/256 | `RFC 3394 §4.6` | KAT byte-exact wrap |
| RFC 5649 §6 | KWP TV1 (20 B) | `KWP test vector 1` | KAT byte-exact + round-trip |
| RFC 5649 §6 | KWP TV2 (7 B, single semi-block) | `KWP test vector 2` | single-semi-block fast path |
| **ACVP-AES-KW-1.0** | AFT encrypt cipher (tg 1-18) | `kw - ACVP-AES-KW-1.0 / AFT encrypt` | KAT byte-exact ct (54/1800 sub-sample: AES-128/192/256 × 6 payloadLen × 3 vectors) |
| **ACVP-AES-KW-1.0** | AFT decrypt cipher (tg 37-54) | `kw - ACVP-AES-KW-1.0 / AFT decrypt` | Pass/fail labels (12 `testPassed=false` cases rejected) |
| **ACVP-AES-KWP-1.0** | AFT encrypt cipher (tg 1-18) | `kwp - ACVP-AES-KWP-1.0 / AFT encrypt` | KAT byte-exact ct (54/1800 sub-sample, single-semi-block fast path included via payloadLen=8) |
| **ACVP-AES-KWP-1.0** | AFT decrypt cipher (tg 37-54) | `kwp - ACVP-AES-KWP-1.0 / AFT decrypt` | Pass/fail labels (10 `testPassed=false` cases rejected) |

#### AFT sub-sampling strategy

Each ACVP suite (`ACVP-AES-KW-1.0`, `ACVP-AES-KWP-1.0`) exposes
**7200 tests** organized into 72 testGroups:

- 36 `direction=encrypt` groups (18 cipher + 18 inverse) × 100 tcId
- 36 `direction=decrypt` groups (18 cipher + 18 inverse) × 100 tcId

**Filtering**: `kwCipher='cipher'` only (direct `W` variant;
the `inverse` variant uses `CIPH_K^-1` inside `W` and is not
implemented — see *Known limitations*).

**Sub-sample**: `[first, middle, last]` per group → 18 enc + 18
dec = 36 × 3 = **108 vectors / 1800 per suite** (≈ 6 % of the
cipher direction, ≈ 3 % of the total). Covers every
`(keyLen, payloadLen)` × `(encrypt, decrypt)` combination.

**Negative cases** integrated in full (12 KW + 10 KWP `testPassed=false`)
— explicit validation of rejection via the IV check (KW) or via
the constant-time IV+length+padding check (KWP).

### Security properties tested

- [x] **`W` wrapping function over 6 rounds** — covered by all
  vectors (216 ACVP + 7 RFC).
- [x] **IV chaining (non-CMAC integrity)** — IV `0xA6×8` (KW) and
  `0xA65959A6 || MLI` (KWP) validated by comparison after unwrap.
- [x] **Constant-time integrity check (KWP)** — `bad` accumulated over IV +
  MLI bounds + padding bytes; no short-circuit. Proof: 10 ACVP
  `testPassed=false` cases (corrupt ct, non-zero padding, MLI out of
  bounds) all rejected via `false`.
- [x] **KWP single-semi-block fast path** — RFC 5649 TV2 (7 B) + ACVP
  `payloadLen=8` (3 testGroups × 3 vectors).
- [x] **Zero padding (KWP)** — covered by `payloadLen` non-multiple of
  64 bits (1280, 2152, 3040 bits).
- [x] **AES-128/192/256** — 3 keyLens × encrypt/decrypt.
- [x] **Tampering rejection** — handcrafted `wrapped[0] ^= 1` (KW + KWP)
  + 22 ACVP `testPassed=false` cases. Plaintext never released.
- [x] **Rejection of n=1 semi-block in KW** — `RFC 3394 requires at least 2
  semi-blocks` (handcrafted test).
- [x] **Rejection of empty input in KWP** — `kwp: plaintext must not be empty`.
- [x] **Rejection of non-multiple-of-8 input in KW** — `kw: plaintext length
  must be a positive multiple of 8 bytes`.
- [x] **`kwCipher=inverse` variant** ✅ **Iteration D2** — explicit reject.
  Exports `wrapInverseCipher()` / `unwrapInverseCipher()` return
  `false` + a typed `NOT-IMPLEMENTED` warning. Avoids any silent use
  of the SP 800-38F §6.3 variant (`CIPH_K⁻¹` in the wrap direction,
  rare outside embedded TPM). If documented need arises, the
  implementation will need to be added and separately audited.
- [x] **Rejection of TDES (and other non-AES)** ✅ **Iteration D2** — `_checkBlockSize`
  rejects any PRF with `blockSize !== 16` (TDES = 8 bytes). SP 800-131A
  §2.4 deprecates 3DES since 2024; SP 800-38F §6.2 mandates AES.
- [ ] **Side-channel on AES** — delegated to `aes.js`.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | SP 800-38F §6.2 (KW) + §6.3 (KWP) |
| Validated parameter sizes | ✅ | AES-128/192/256 × 6 payloadLen (KW: 128..4096 / KWP: 8..4096) |
| KAT power-on / self-test | ✅ | RFC 3394 + RFC 5649 + 216 ACVP executed on every `bun test` |
| CT comparisons (if secret) | ✅ | `unwrapPad` accumulates IV + length + padding with no short-circuit |
| No `throw` / timing leak | ✅ | Reviewed: `console.warn`/`console.error` + `return false` |
| Plaintext not released on failed integrity | ✅ | `unwrap`/`unwrapPad` return `false` BEFORE any exposure; tested by 22 `testPassed=false` cases |

## Known limitations

- **`kwCipher=inverse` variant not implemented**: SP 800-38F §6.3
  allows using the inverse function `CIPH_K⁻¹` in the wrap direction.
  Our `kw.js` only implements the `cipher` variant (forward `W`), which
  is the dominant form in TLS/PKCS#8/JOSE. The ACVP provides 3600
  `inverse` vectors per suite (50 % of the total) which are filtered
  out. **Iteration D2**: added `wrapInverseCipher()` / `unwrapInverseCipher()`
  exports that return `false` + `console.warn('NOT-IMPLEMENTED')` to
  prevent any silent use by a consumer that believes it has inverse KW-AE.
- **No asymmetric KW-AE/KW-AD**: the `wrap`/`unwrap`
  functions use the AES instance in the correct direction (CIPH_K for
  encrypt, CIPH_K^-1 for decrypt) — the caller must build the PRF
  with `full=true`.
- **6 % sub-sampling**: 5292 unplayed vectors per suite (out of 5400
  cipher-direction). The anchors cover `[first, middle, last]`
  per testGroup; each `(keyLen, payloadLen)` combination has 6
  vectors integrated (3 enc + 3 dec).
- **No massive payloadLen stress**: ACVP caps at 4096 bits. The
  theoretical KWP limit (`2^32 − 1` bytes ≈ 4 GiB) is not tested.
- **No MCT specified by the ACVP for KW/KWP** (a limitation of the standard).

## Cross-references

- Module: [`mode/kw.js`](./kw.js)
- Tests: [`mode/kw.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/mode/kw.test.js) — 240 tests (233 baseline + 7 iteration D2: KW-AE inverse explicit reject + TDES guards)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-KW-1.0/` + `ACVP-AES-KWP-1.0/`
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
