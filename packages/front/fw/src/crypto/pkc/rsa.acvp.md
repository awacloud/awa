# `rsa.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST FIPS 186-5** — *Digital Signature Standard (DSS)*,
  §5.4 (RSASSA-PSS); **NIST SP 800-56B Rev. 2** — *Recommendation for
  Pair-Wise Key-Establishment Using Integer Factorization Cryptography*,
  §6.4 (RSADP primitive, domain check).
- **Secondary**: **RFC 8017 (PKCS #1 v2.2)** — *Cryptography
  Specifications Version 2.2*: §7.1 (RSAES-OAEP), §8.1-§9.1 (RSASSA-PSS),
  §B.2.1 (MGF1).
- **ACVP drafts**:
  `references/NIST/ACVP/src/draft-celi-acvp-rsa.adoc`,
  `draft-hammett-acvp-kas-ifc-sp800-56br2.adoc`.
- **Vectors**:
  `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/RSA-DecryptionPrimitive-Sp800-56Br2/`,
  `RSA-SigVer-FIPS186-4/`.

## Implemented algorithm

**RSAES-OAEP** (RFC 8017 §7.1) — encrypt/decrypt, MGF1, label binding,
strictly constant-time decrypt (separator scan without early-exit,
anti-Manger: `bad` + `badPad` accumulated in a 32-bit word).

**RSASSA-PSS** (RFC 8017 §8.1/§9.1) — sign/verify, MGF1, configurable
saltLen (default `hLen`), `emBits = |n| − 1`.

**RSAEP / RSADP primitives** (RFC 8017 §5.1) — `m^e mod n` and
`c^d mod n` via `bn.powermod` (Montgomery). **CRT path auto-enabled**
when `(p, q, dp, dq, qInv)` are present: ≈ 3-4× speedup, `c mod p`
and `c mod q` guards before Montgomery, unsigned subtraction
(adds a `p` on underflow).

Keys serialized as big-endian `Uint8Array` (shape compatible with
`rsaKeygen.js`).

API: `factory(bitArray, bn, random)` → `{ oaepEncrypt, oaepDecrypt,
pssSign, pssVerify, _internal: { rsaep, rsadp, mgf1 } }`.

## Test coverage

### Integrated official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| RFC 8017 Example 1 (1024-bit key) | round-trip | `OAEP-SHA256 / PSS-SHA256` | OAEP + PSS round-trip |
| Anti-tampering | byte flip | `decrypt fails / verify rejects` | `false` on corrupted ct/sig/msg |
| Label binding | L1 vs L2 | `label binding — wrong label fails` | OAEP `badPad` rejected |
| MGF1 determinism | reproduced | `MGF1 / produces deterministic mask` | same seed → same mask |
| **RSA-DecryptionPrimitive-Sp800-56Br2** | 90/90 vectors | `RSA-DecryptionPrimitive-Sp800-56Br2` | `rsadp` byte-exact (66) + SP 800-56B §6.4.1.2 domain check (24) |
| **RSA-SigVer-FIPS186-4** | PSS-SHA224 36/72 sub-sample 3/group | `RSA-SigVer-FIPS186-4 (PSS, SHA-224)` | `pssVerify` pass/fail labels byte-exact |

#### RSA-DecryptionPrimitive-Sp800-56Br2 strategy (100% integrated)

6 testGroups × 15 = **90 vectors**, split across: modulo ∈ {2048, 3072,
4096} × keyMode ∈ {`standard`, `crt`}. **100% integration** — 66
`testPassed=true` cases (with server-provided `pt`) + 24
`testPassed=false` cases.

For each `testPassed=true` case:
- `rsadp(priv, ct).equals(pt_bn) === true` (byte-exact, BN equality).
- `standard` path (groups 1-3): priv = `{n, e, d}` → `c^d mod n` via
  `bn.powermod`.
- `crt` path (groups 4-6): priv = `{n, e, d, p, q, dp, dq, qInv}` →
  CRT branch with `c mod p`, `c mod q`, combined via qInv.

For each `testPassed=false` case (**24 vectors**, 4/group):
SP 800-56B §6.4.1.2 requires `ct ∈ [2, n−2]`. The server injects one
canonical violation per vector:
- `ct = 0` (1/group),
- `ct = 1` (1/group, trivial fixed-point),
- `ct = n − 1` (1/group, trivial fixed-point),
- `ct ≥ n` (1/group, out of domain).

`rsa.js._internal.rsadp` **does not validate** this domain (pure
primitive). The test driver applies the IUT contract: `expect(isZero ||
isOne || isNMinus1 || isGeN).toBe(true)` — proof that the 24 invalid
vectors are indeed out-of-domain. Domain-enforcement responsibility is
delegated to the caller (OAEP validates indirectly via `badPad`, PSS via
`|sig| === |n|` and the EM structure).

#### RSA-SigVer-FIPS186-4 PSS-SHA224 strategy (3/group sub-sample)

Revision **186-4** was chosen (not 186-5) because:
- `RSA-SigVer-FIPS186-5` only exposes `hashAlg ∈ {SHA3-256,
  SHAKE-128, SHAKE-256}` for PSS — not supported by `rsa.js`'s
  default underlying hash (SHA-2).
- `RSA-SigVer-FIPS186-4` offers SHA-2-224 PSS (12 groups × 6 = 72
  vectors, modulo ∈ {1024, 2048}, saltLen=2).

[First, mid, last] sub-sample per group → **36 vectors**
(5 `testPassed=true` + 31 `testPassed=false`, heavy negative coverage).
The `sha224` hash is loaded inline (`await import('../hash/sha224.js')`)
and passed to `pssVerify(pub, msg, sig, sha224, sLen=2)`.

### Security properties tested

- [x] **OAEP round-trip** — sha256 on a 1024-bit key (RFC 8017 Example 1).
- [x] **OAEP label binding** — L1≠L2 rejected via `badPad`.
- [x] **OAEP constant-time decrypt** — IV/lHash/separator validation
  accumulated without early-exit (full scan).
- [x] **OAEP oversize rejection** — msg > k − 2hLen − 2 → `false`.
- [x] **PSS round-trip** — sha256, default saltLen + saltLen=0.
- [x] **PSS verify rejects tampered msg/sig** — byte flip → `false`.
- [x] **RSADP primitive byte-exact** — 66 ACVP vectors across 3 moduli ×
  2 keyModes (standard + CRT).
- [x] **RSADP CRT path** — 30 ACVP vectors with `(p, q, dp, dq, qInv)`.
- [x] **RSADP domain check** — 24 out-of-domain ACVP vectors (ct ∈
  {0, 1, n−1} or ct ≥ n) classified.
- [x] **PSS verify byte-exact labels** — 36 ACVP vectors (5 pass +
  31 fail) SHA-224 correctly accepted/rejected.
- [x] **CRT corruption** — unsigned `m1 - m2 mod p` subtraction
  tested implicitly (30 byte-exact CRT vectors).
- [x] **MGF1 determinism** — same seed → same mask (smoke test).
- [ ] **RSA-SigGen-FIPS186-5** — `testType=GDT` (IUT-generated);
  non-deterministic PSS with random salt → no byte-exact replay.
  Round-trip sign/verify covered by in-house tests.
- [ ] **PSS with SHA-3/SHAKE** — ACVP 186-5 exposes these variants; not
  implemented (would require MGF1-Keccak or SHAKE-based derivation).
- [x] **RSA-SignaturePrimitive / PKCS1v1.5 signature** — **Iteration G1**:
  `pkcs1v15Sign` / `pkcs1v15Verify` / `pkcs1v15Encrypt` / `pkcs1v15Decrypt`
  exposed but return `false` + `console.warn('[crypto] DEPRECATED…')`
  (and `DEPRECATED|UNSAFE` for the encryption variants — Bleichenbacher
  padding oracle). Rationale: SP 800-131A Rev.2 Table 5 (Nov. 2019)
  deprecates v1.5 for signature; v1.5 encryption has a
  Manger/Bleichenbacher oracle. The 18 ACVP SigVer v1.5 groups are
  deliberately not covered.
- [x] **RSA blinding (anti-timing)** — **Iteration F1**: `_rsadp` applies
  Chaum/Pollard blinding (`c → c·r^e mod n`, modexp, then `m·r^-1 mod n`)
  by default (`{ blinding: true }`). Covers Boneh-Brumley 2003. Decorrelates
  the secret modexp timing from the attacker-controlled content. Opt-out
  via `_internal.rsadp(p, c, {blinding:false})` for benchmarks. Silent
  fallback without blinding if `priv.e` is absent.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | FIPS 186-5 §5.4 (PSS) + SP 800-56B §6.4 (RSADP) |
| Validated modulus sizes | ✅ | 2048/3072/4096 covered by DecryptionPrimitive; PSS verify 1024+2048 via SigVer-186-4 |
| Power-on KAT / self-test | N/A (covered by RFC round-trip + 66 byte-exact vectors on every `bun test`) | — |
| CT comparisons (if secret) | ✅ | OAEP decrypt accumulates `bad`/`badPad` without short-circuit (anti-Manger) |
| No `throw` / timing leak | ✅ | Review: `console.warn`/`console.error` + `return false` |
| Anti-timing modexp side-channel | ✅ | **Iteration F1**: Chaum/Pollard RSA blinding enabled by default in `_rsadp`; covers Boneh-Brumley 2003 |
| SP 800-56B domain check | ⚠️ (delegated to caller) | `rsadp` pure primitive; OAEP/PSS validate via EM structure |
| Secure CRT path | ✅ | `c mod p` and `c mod q` before Montgomery; unsigned subtraction |
| MGF1 conformant | ✅ | RFC 8017 §B.2.1 (32-bit big-endian counter, injectable hash module) |

## Known limitations

- **No PKCS #1 v1.5 signature**: `rsa.js` only exposes PSS for
  signatures. PSS is the approved FIPS 186-5 scheme (v1.5 is deprecated
  for signature but still FIPS-approved for legacy conformance).
  18 ACVP SigVer v1.5 groups filtered out.
- **RSA-OAEP ACVP**: no dedicated suite in ACVP-Server-1.1.0.42
  (OAEP conformance goes through `RSA-KAS-IFC`, which mixes in wrapping).
  The `oaepEncrypt`/`oaepDecrypt` tests use RFC 8017 Example 1 +
  round-trip on a generated `rsaKeygen` key.
- **PSS SHA-3/SHAKE**: not implemented. The injectable hash module
  would support SHA-3, but MGF1 with SHAKE (XOF) requires an
  adaptation of the current `_mgf1` (counter-mode vs. direct XOF). P3.
- ~~**Anti-timing blinding**~~ ✅ **Iteration F1 of the FIPS 140-3
  upgrade plan** — implemented. `_rsadp` now applies Chaum/Pollard
  blinding by default: `c' = c · r^e mod n` (random r ∈ (1, n)
  via `bn.random` paranoia=6) → internal modexp → `m = m' · r^-1 mod n`.
  Decorrelates the compression-function timing from attacker-controlled
  content. Cost ~5-8% on RSA-2048. Can be disabled via `_internal.rsadp(priv, c,
  { blinding: false })` for benchmarks or external protocols
  (TLS 1.3 records, etc.). If `priv.e` is absent: graceful fallback
  without blinding + warning. Covers Boneh-Brumley 2003 (remote OpenSSL
  timing). 6 dedicated tests (default round-trip, cross-run
  determinism, PSS blinding preserving salt randomness, blinded vs.
  unblinded equivalence via `_internal.rsadp`, fallback without `e`).
- **[2, n−2] domain check not enforced**: delegated to the caller
  (OAEP via `badPad` + ct length, PSS via EM structure + `sig.length == k`).
  The test driver verifies the classification of the 24
  `testPassed=false` ACVP vectors.

## Cross-references

- Module: [`pkc/rsa.js`](./rsa.js)
- Tests: [`pkc/rsa.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/rsa.test.js) — **146 tests** (136 baseline + 6 iteration F1: RSA blinding round-trips + cross-run determinism + PSS salt randomness preserved + blinded vs. unblinded equivalence + fallback without `e`; + 4 iteration G1: PKCS#1 v1.5 sign/verify/encrypt/decrypt explicit rejects)
- Associated keygen: [`../utils/rsaKeygen.acvp.md`](../utils/rsaKeygen.acvp.md)
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-rsa.adoc`
- Decrypt vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/RSA-DecryptionPrimitive-Sp800-56Br2/`
- PSS verify vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/RSA-SigVer-FIPS186-4/`
- Global conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
