# `argon2.js` — RFC interop conformance

> **STATUS: RFC interop — outside NIST/CAVP validation.**
> Argon2 is not a FIPS 140-3 approved KDF (NIST/SP 800-132 retains
> PBKDF2; PHC selects Argon2 but not FIPS). Coverage is exclusively
> RFC 9106 (IRTF / IETF) — no published NIST ACVP vector. Argon2id is
> nonetheless the KDF/PHF recommended by OWASP, the IETF (RFC 9106 §4 "MUST
> use Argon2id"), libsodium, the IETF Crypto Forum Research Group (CFRG),
> and the PHC (Password Hashing Competition, 2015 winner).

## Standards

- **Primary**: **RFC 9106** — *Argon2 Memory-Hard Function for
  Password Hashing and Proof-of-Work Applications* (September 2021).
  §3 algorithm, §4 *Parameter Choice* (Argon2id mandated), §5.3
  Argon2id reference vector.
- **Origin**: Biryukov, Dinu, Khovratovich 2016 — *Argon2: new
  generation of memory-hard functions for password hashing*. PHC
  (Password Hashing Competition) winner.
- **Implemented variant**: **Argon2id only** (type=2). RFC 9106
  §4 makes Argon2id the MUST variant for general-purpose applications.
  Argon2d (type=0, data-dependent) and Argon2i (type=1, data-independent)
  are not exposed.

## Implemented algorithm

`argon2.factory(blake2b)` exposes Argon2id (RFC 9106). Public API:

- `hash(opts)` → `Uint8Array(opts.tagLen)` or `false`.
  - `opts.password: Uint8Array` (P, required)
  - `opts.salt: Uint8Array` (S, ≥ 8 bytes required)
  - `opts.secret?: Uint8Array` (K, optional — keyed mode RFC §3.1)
  - `opts.ad?: Uint8Array` (X, optional — associated data)
  - `opts.time: number` (t ≥ 1)
  - `opts.memory: number` (m, in KiB; clamped to 8·p if below)
  - `opts.parallelism: number` (p ≥ 1)
  - `opts.tagLen: number` (τ ≥ 4)

Internal API (test-only):

- `_internal.Hp(input, outLen)` — variable-length BLAKE2b extension (RFC 9106
  §3.3). Single-call path if outLen ≤ 64, multi-block otherwise.
- `_internal.compress` — Argon2 compression function §3.4 (G).
  `_internal.*` convention shared with gcm/cmac/rsa/random (post-upgrade
  audit Finding 2).

Underlying: BLAKE2b (RFC 7693, see blake2b.acvp.md). Argon2id combines
data-independent addressing (first half-pass) and data-dependent
(the rest) — resistant to side-channels and TMTO.

## Test coverage

### Built-in official vectors

| Source | Reference | Test | Property verified |
|---|---|---|---|
| **RFC 9106 §5.3** | Argon2id reference (t=3, m=32, p=4, τ=32) | `§5.3 Argon2id reference` | byte-exact KAT `0d640df5...6b01e659` (full P/S/K/X) |
| Determinism | repro | `determinism: same inputs → same tag` | reproducible |
| Binding P | password ≠ | `password binding` | tag ≠ |
| Binding S | salt ≠ | `salt binding` | tag ≠ |
| Binding K | secret ≠ + no-secret == empty-secret | `secret binding (keyed mode)` | tag ≠ + `K=undefined` ≡ `K=Uint8Array(0)` |
| Binding X | ad ≠ | `associated data binding` | tag ≠ |
| Binding t | t=1 ≠ t=2 ≠ t=3 | `time binding` | 3 pairs ≠ |
| Binding m | m=8 ≠ m=16 ≠ m=32 | `memory binding` | 2 pairs ≠ |
| Binding p | p=1 ≠ p=2 | `parallelism binding` | tag ≠ (final XOR fold) |
| τ variations | 32/64/128 | `tagLen variations` | correct length + determinism |
| τ binding | tagLen 32 ≠ truncate(64) | `tagLen 32 ≠ truncate(tagLen 64)` | τ parameterized in H₀ §3.2 |
| `_internal.Hp` ≤64 | outLen 32 + 64 | `_Hp produces requested length (≤64)` | correct length |
| `_internal.Hp` >64 | outLen 100, 200, 1024 | `_Hp produces requested length (>64 multi-block)` | multi-block path + determinism |
| Validation | salt < 8 | `rejects salt < 8 bytes` | false |
| Validation | t < 1 | `rejects t < 1` | false |
| Validation | p < 1 | `rejects p < 1` | false |
| Validation | tagLen < 4 | `rejects tagLen < 4` | false |
| Validation | missing password | `rejects missing password` | false |
| Validation | missing salt | `rejects missing salt` | false |
| Memory clamp | m < 8·p clamped to 8·p | `memory clamped to 8*p when below floor` | tag identical between m=4/p=2 and m=16/p=2 |

### Security properties tested

- [x] **Byte-exact RFC 9106 §5.3 conformance** — Argon2id reference
      vector with all components (P, S, K, X, t, m, p, τ).
- [x] **Exhaustive bindings** — each input (P, S, K, X) and each
      parameter (t, m, p, τ) changes the tag (8 orthogonality tests).
- [x] **Optional K == empty K** — RFC §3.1 stipulates that K is optional
      but is bound via LE32(|K|)||K in H₀; `undefined` must produce
      the same tag as `Uint8Array(0)` (LE32(0)).
- [x] **Parametric τ** — bound in H₀ §3.2; `Argon2id(τ=32)` ≠
      `truncate(Argon2id(τ=64), 32)` — security against truncation
      attacks.
- [x] **`_internal.Hp` multi-block** — outLen 100/200/1024 validates the §3.3
      path (BLAKE2b chained with previous-block XOR).
- [x] **Memory clamp** — m < 8·p readjusted to 8·p (RFC §3.2); tag
      identical to the explicit m=8·p case.
- [x] **Parameter validation** — 6 negative cases (short salt, t/p/τ
      out of range, missing P/S).
- [x] **No `throw`** — `console.warn` + `return false` (reviewed
      lines 284-291).
- [x] **Argon2d (type=0)** — **Iteration G4**: `hashD()` exposed but
      returns `false` + `console.warn('UNSAFE: vulnerable to cache-timing
      attacks (data-dependent addressing). Use hash() (Argon2id)')`.
      Preempts the classic mistake of using Argon2d for password hashing.
- [x] **Argon2i (type=1)** — **Iteration G4**: `hashI()` exposed but
      returns `false` + `console.warn('DEPRECATED: Argon2i alone is
      sub-optimal (Alwen-Blocki 2016 — reduced GPU/ASIC resistance).
      Use hash() (Argon2id)')`.
- [ ] **Argon2 v1.0 (legacy)** — RFC 9106 specifies v=0x13 (our
      `VERSION`). v=0x10 (Argon2 v1.0, outside the RFC) is not supported. **P3** —
      historical interest only.
- [ ] **Strict constant-time / SCA** — data-dependent addressing
      (passes 2..t and the second half of pass 0) by design introduces
      input-dependent memory accesses. Argon2id is designed
      to provide SCA resistance *only over the first half-pass*
      (slice 0,1 of pass 0). Acceptable for offline password hashing,
      to be avoided in a cache-sniffable context (multi-tenant server side).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| NIST-approved algorithm | ❌ N/A | Argon2 outside SP 800-132 |
| RFC 9106 conformance | ✅ | §5.3 byte-exact + 8 bindings + memory clamp |
| OWASP/IETF recommended mode | ✅ | Argon2id (RFC §4 "MUST use") |
| Parametric τ (no-truncation) | ✅ | tag(τ=32) ≠ truncate(tag(τ=64)) |
| Parameter validation | ✅ | early return false |
| No `throw` | ✅ | `console.warn` + return false |
| SCA resistance (Argon2id partial) | ⚠️ | by design, first slices §3.4 |

## Known limitations

- **Outside NIST scope** — no ACVP vector. Validation = RFC 9106.
- **Argon2d and Argon2i not implemented**: see P3 above. RFC §4
  recommends Argon2id for general-purpose usage; Argon2d for proof-of-work
  cryptocurrencies, Argon2i alone deprecated.
- **No version 1.0**: only v=0x13 (RFC 9106). No migration
  path for legacy hashes.

## Cross references

- Module: [`hash/argon2.js`](./argon2.js)
- Tests: [`hash/argon2.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/argon2.test.js) — **23 tests** (including the 2 added in G4: `hashD` UNSAFE + `hashI` DEPRECATED rejects; was 4 before the upgrade)
- RFC 9106: [`https://datatracker.ietf.org/doc/html/rfc9106`](https://datatracker.ietf.org/doc/html/rfc9106)
- Underlying hash: [`./blake2b.js`](./blake2b.js) — see [blake2b.acvp.md](./blake2b.acvp.md)
- Equivalent NIST KDF: [`./pbkdf2.js`](./pbkdf2.js) — see [pbkdf2.acvp.md](./pbkdf2.acvp.md)
- Overall conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
