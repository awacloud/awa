# `adf.js` — Format-spec interop conformance

> **STATUS: Format interop (KeePass) — outside NIST/CAVP validation and outside IETF RFC.**
> ADF (AES-Derivation Function) is a KDF internal to the KeePass v1 /
> **KDBX 3.x** file format (Dominik Reichl, 2003-present). It is not
> documented by any RFC nor by any NIST standard. The sole normative
> source is the KeePass source code and the spec
> https://keepass.info/help/kb/kdbx_3.1.html.
> **KDBX 4** replaced ADF with Argon2(d/id) — ADF is kept only
> for backward compatibility with v1/v2/v3 vaults.

## Standards

- **Primary**: KeePass v1 / KDBX 3.x file format spec (Dominik Reichl,
  https://keepass.info). No RFC nor NIST standard.
- **Internal cryptanalysis**: combines SHA-256 (FIPS 180-4, validated via
  sha256.acvp.md) + AES-256/ECB (FIPS 197, validated via aes.acvp.md). Security
  depends exclusively on these two primitives; ADF itself
  only composes them.
- **No external reference vector**: KeePass distributes .kdbx
  files but no pure ADF vector. Coverage here is
  *own property + self-snapshot KAT regression*.

## Implemented algorithm

`adf.factory(sha256, aes)` exposes two functions:

```
adf_partial(master, transform, rounds, composite):
    ck    = SHA256(composite)                            // 32 bytes
    half0 = ck[0..15],  half1 = ck[16..31]
    cipher = AES-256-ECB encryption with key = transform
    repeat `rounds` times:
        half0 = AES_encrypt(half0)                        // 16 bytes
        half1 = AES_encrypt(half1)                        // 16 bytes
    return master ‖ SHA256(half0 ‖ half1)

adf_full(master, transform, rounds, composite):
    return SHA256(adf_partial(master, transform, rounds, composite))
```

Inputs and outputs are **SJCL bitArrays** (arrays of BE Int32 words),
not `Uint8Array`. Convention inherited from the SJCL ecosystem used
by the historical crypto module.

Public API:

- `fn(master, transform, rounds, composite)` — alias for `adf_full` (output
  256 bits = 8 words).
- `partial(master, transform, rounds, composite)` — output `master.length + 8` words.

## Test coverage

### Built-in vectors

| Category | Test | Property verified |
|---|---|---|
| Determinism | `fn is deterministic for the same inputs` | bit-exact reproducibility |
| Determinism | `partial is deterministic` | bit-exact reproducibility |
| Binding M | `master binding: different master → different output` | M change → tag ≠ |
| Binding T | `transform binding: different transform → different output` | T change → tag ≠ |
| Binding C | `composite binding: different composite → different output` | C change → tag ≠ |
| Binding R | `rounds binding: different rounds → different output` | R change → tag ≠ |
| Round=0 | `rounds=0 path` | semantics: composite hashed once, AES not iterated (verified vs manual reconstruction) |
| Round 1 vs 2 | `rounds=1 vs rounds=2 differ` | incremental AES iteration |
| Composition | `partial vs fn: fn(args) === SHA256(partial(args))` | structural invariant |
| Output shape | `fn output is 256 bits (8 × 32-bit words)` | 8-word length |
| Output shape | `partial output = master ‖ SHA256(transformed) — 16 words` | master prefix structure verified |
| Output shape | `partial output adapts to master length (128-bit master → 12-word output)` | 128-bit M accepted |
| Independence T | `transform-only change propagates through AES core` | partial.tail changes, partial.head identical |
| Independence M | `master-only change does NOT affect AES-transformed inner state` | partial.tail identical, partial.head changes |
| **Regression KAT** | `fn(SHA256("m"), SHA256("t"), 100, SHA256("c"))` | byte-exact snapshot `e51ad967db...` |
| **Regression KAT** | `partial(SHA256("m"), SHA256("t"), 50, SHA256("c"))` | 64-byte byte-exact snapshot `62c66a7a5d...` |
| **Regression KAT** | `rounds=10000 smoke` | byte-exact snapshot `8f10656500...` (typical KeePass perf usage canary) |

### Security properties tested

- [x] **Exhaustive bindings**: 4 inputs (M, T, C, R) each modify the
      output; orthogonality tested.
- [x] **Channel independence**: T modifies the internal AES state without
      touching prefix M; M modifies the prefix without touching the
      AES state (verified via `partial.slice` head/tail).
- [x] **Structural invariant**: `fn = SHA256 ∘ partial`.
- [x] **rounds=0 semantics**: degenerate path explicitly tested
      (composite → SHA256 → SHA256 → out, without any AES call).
- [x] **Output shape**: 256 bits for `fn`; `master.length + 256 bits`
      for `partial`.
- [x] **Byte-exact regression**: 3 self-snapshot KATs detect any silent
      algorithm drift (AES mode substitution ↔ CBC,
      half0/half1 order, omission of the final SHA-256, etc.).
- [x] **No `throw`** — no explicit validation (the module does not
      check lengths; it expects well-formed SJCL bitArrays). Any
      caller-side misuse surfaces as an AES exception
      (length asserts) — legacy SJCL behavior.
- [ ] **Official KeePass vector** — KeePass does not publish an isolated
      ADF vector; KDBX tests exist but only as complete
      .kdbx files (encrypted + auth). **P3** — could be enriched
      via a custom dump from KeePassXC or via the KeePass
      C# test driver if required for interop audit.
- [ ] **Input length validation** — `composite` must be
      ≥ 32 bytes for `slice(0,4)`/`slice(4,8)` to produce the
      two halves; no explicit guard. **P3** — internal usage
      only (bitArrays are pre-validated SHA-256 output).
- [ ] **Side-channel resistance** — AES-ECB on composite without
      randomization: an attacker who knows `transform` can
      observe whether two composites share the same first half. Acceptable
      for the KeePass context (the composite is itself a SHA-256).
      **Out of scope** — inherited from the KDBX 3.x format.
- [ ] **Memory-hardness / GPU resistance** — ADF is NOT memory-hard.
      Vulnerable to GPU/ASIC. This is precisely why
      KDBX 4 migrated to Argon2(d). **Design limitation**.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| NIST-approved algorithm | ❌ N/A | ADF is a KeePass format-specific construct, not a standard |
| Underlying primitives approved | ✅ | SHA-256 (FIPS 180-4) + AES-256-ECB (FIPS 197), both ACVP-validated |
| Determinism | ✅ | `determinism` tests + 3 regression KATs |
| Input bindings | ✅ | 4 bindings + 2 channel-independence tests |
| Memory-hardness | ❌ | ADF is not memory-hard (by KDBX 3.x design) |

## Known limitations

- **Outside NIST + outside RFC** — KeePass format only. No external
  standard to validate a KAT against.
- **Not memory-hard**: vulnerable to GPU/ASIC. Migration to
  Argon2id recommended (see argon2.acvp.md) for any newly created vault.
  ADF is kept only for reading existing KDBX 3.x vaults.
- **No input validation**: legacy SJCL-style module; expects
  well-formed bitArrays.
- **No third-party vector**: conformance rests on:
  1. The independent validation of SHA-256 (sha256.acvp.md, MCT).
  2. The independent validation of AES-256-ECB (aes.acvp.md, MCT).
  3. The self-snapshot regression KATs (algorithmic canary).

## Cross references

- Module: [`hash/adf.js`](./adf.js)
- Tests: [`hash/adf.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/adf.test.js) — 18 tests (was 7 before this iteration)
- KeePass KDBX 3.x spec: `https://keepass.info/help/kb/kdbx_3.1.html`
- Recommended successor: [`./argon2.js`](./argon2.js) — see [argon2.acvp.md](./argon2.acvp.md)
- Underlying primitives: [`./sha256.acvp.md`](./sha256.acvp.md), [`../cipher/aes.acvp.md`](../cipher/aes.acvp.md)
- Overall conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
