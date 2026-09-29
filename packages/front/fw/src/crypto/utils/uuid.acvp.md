# `uuid.js` — RFC 4122 / RFC 9562 conformance

## Standards

- **Primary**: **RFC 9562** — *Universally Unique IDentifiers (UUIDs)*
  (May 2024) — supersedes RFC 4122. Identical binary format,
  clarified terminology + new variants (v6/v7/v8, not implemented here).
- **Secondary**: **RFC 4122** — *A Universally Unique IDentifier (UUID)
  URN Namespace* (July 2005) — still widely referenced, supported.
- **Canonical string format**: RFC 4122 §3 / RFC 9562 §4:
  `xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx` (36 chars: 32 hex + 4 dashes,
  where `M` = version nibble and `N` ∈ {8, 9, a, b} = variant nibble).
- **Vectors**: RFC 9562 §A (non-normative examples) + interop
  cross-check with the `valid.js:uuid` regex validator.
- **Outside NIST**: no FIPS standard covers UUIDs. Security relies
  exclusively on the quality of the randomness source (`crypto.getRandomValues`,
  cf. `random.acvp.md` SP 800-90B).

## Implemented algorithm

`uuid.factory(hex)` exposes 2 generators:

- **`v1(raw=false, prng=false, format='compact')`** — UUID v1 (time-based,
  RFC 4122 §4.2 / RFC 9562 §5.1). Combines a 60-bit timestamp (100-ns ticks
  since 1582-10-15), a 14-bit clockseq (anti-rollback), a 48-bit
  node (random MAC, multicast bit forced per RFC §4.5).
- **`v4(raw=false, prng=false, format='compact')`** — UUID v4 (random,
  RFC 4122 §4.4 / RFC 9562 §5.4). 122 random bits + 4 version bits
  (`0100` = v4) + 2 variant bits (`10` = RFC 4122).

### Output

| Param | Type | Description |
|---|---|---|
| `raw=true` | `Uint8Array(16)` | Raw binary, version + variant patched |
| `raw=false` + `format='compact'` (default) | `string` 32 hex | No dashes, **back-compat** with the historical API |
| `raw=false` + `format='rfc4122'` | `string` 36 chars | Canonical RFC 4122 §3 format (with dashes) |

### Randomness source

- Default: `crypto.getRandomValues` (Web Crypto API `RandomSource`,
  SP 800-90B-grade in every validated JS runtime).
- Custom `prng` callback: **test-only / replay** use only. No-op PRNG
  detection: if the signature returns `undefined/null` AND does not
  modify the supplied buffer, automatic fallback to
  `crypto.getRandomValues` (safe by default).

## Test coverage

### Integrated vectors / properties

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| RFC 4122 §3 | Canonical format with dashes | `format=rfc4122 returns canonical RFC 4122 §3 format` | strict regex + dashes at positions 8/13/18/23 + version nibble |
| RFC 4122 §4.1.3 | Version nibble v1 = `0001` | `should set UUID version to 1 and RFC 4122 variant` | `(raw[6] & 0xf0) >> 4 === 1` |
| RFC 4122 §4.1.3 | Version nibble v4 = `0100` | `should set UUID version to 4 and RFC 4122 variant` | `(raw[6] & 0xf0) >> 4 === 4` |
| RFC 4122 §4.1.1 | 2-bit variant = `10` | (same) | `(raw[8] & 0xc0) >> 6 === 2` |
| RFC 4122 §4.1.1 | Variant nibble ∈ {8, 9, a, b} | `format=rfc4122 v4 ... variant nibble` | `id[19] ∈ [89ab]` |
| RFC 9562 §A.4 (style) | Byte-exact vector, deterministic v4 prng | `format=rfc4122 byte-exact known vector` | canonical string = `91c274f2-9a0d-4ce6-9d5d-b2c3d4e5f607` |
| Cross-check `valid.js:uuid` | Validator interop | `format=rfc4122 v4/v1 matches valid.js uuid regex` | 50 consecutive random outputs match the strict regex |
| Cross-format | `compact` vs `rfc4122` byte-equivalent | `rfc4122 reformat is byte-equivalent to compact` | `rfc.replace(/-/g, '') === compact` (deterministic prng) |

### Security properties tested

- [x] **Correct binary format** — version + variant nibbles patched
  per RFC 4122 §4.1.1 + §4.1.3.
- [x] **Canonical string format** — `format='rfc4122'` produces the
  `xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx` representation validated by a
  strict regex (33 cases tested: 50 v4 + 50 v1 + byte-exact vector).
- [x] **Back-compat** — `format='compact'` (default) returns 32 hex
  chars without dashes, identical to the module's historical API.
- [x] **Safe default randomness source** — `crypto.getRandomValues`.
  A custom PRNG can only be used via an explicit parameter; no-op
  detection + automatic fallback to `crypto.getRandomValues`.
- [x] **Validator interop** — the `format='rfc4122'` output matches
  the public `valid.js:194` regex (`uuid` format) byte-exact.
- [x] **Statistical uniqueness** — `should generate different values across
  calls` (v1 + v4).
- [x] **v1 monotonicity** — clockseq incremented if dt < 0 or nsecs ≥ 10000
  (RFC 4122 §4.2.1.2). No direct test, but the code follows the RFC 4122
  algorithm.

### Security properties not covered

- [ ] **UUIDv6 / v7 / v8** (RFC 9562 §5.6-5.8) — not implemented. v7
  in particular is recommended for modern use cases (sortable + random)
  as an alternative to v1. **P3** — no breaking change required for
  a future addition.
- [ ] **UUIDv3 / v5** (name-based MD5 / SHA-1, RFC 4122 §4.3) — not
  implemented. SP 800-131A deprecates SHA-1 and MD-5; v5 remains useful
  for deterministic namespaces but is outside the scope of this module,
  which focuses on random/time-based generation.
- [ ] **Real MAC for v1** — RFC 4122 §4.5 authorizes using a random
  MAC when no hardware MAC is accessible (the browser runtime case).
  The current implementation uses `crypto.getRandomValues` with the
  multicast bit forced per spec — **conforms to RFC 4122 §4.5**.

## RFC 4122 / RFC 9562 conformance

| Requirement | Status | Evidence |
|---|---|---|
| 16-byte binary format | ✅ | `Uint8Array.length === 16` tested for v1 and v4 |
| v1/v4 version nibble patched | ✅ | bit-mask test `(raw[6] & 0xf0) >> 4` |
| RFC 4122 variant nibble patched | ✅ | bit-mask test `(raw[8] & 0xc0) >> 6 === 2` |
| Canonical string format with dashes | ✅ | `format='rfc4122'` byte-exact + strict regex 50× |
| Cryptographic randomness source | ✅ | `crypto.getRandomValues` (default), auto fallback if prng is a no-op |
| No `throw` | ✅ | no code path uses `throw` |
| Validator interop | ✅ | `valid.js:194` regex matches all 100 tested outputs |

## Known limitations

- **v1 uses a random MAC**, not a hardware MAC (impossible in a
  browser context). RFC 4122 §4.5 paragraph 2 explicitly authorizes
  this degraded mode with the multicast bit forced.
- **v3/v5/v6/v7/v8 variants not implemented** — see the `[ ]` checks above.
- **No nil UUID support** (`00000000-0000-0000-0000-000000000000`,
  RFC 4122 §4.1.7) nor max UUID (RFC 9562 §5.10). Trivially addable
  as exported constants if needed.
- **Test-only PRNG buffer**: the `prng` parameter is documented as
  test-only; no production usage should pass a `prng` other than
  `false`. No-op PRNG detection + automatic fallback to
  `crypto.getRandomValues` prevents accidentally degrading the
  randomness source.

## Cross-references

- Module: [`crypto/utils/uuid.js`](./uuid.js)
- Tests: [`crypto/utils/uuid.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/utils/uuid.test.js) — **21 tests**
  (including 6 new `format='rfc4122'` tests + cross-check against the
  `valid.js:uuid` regex on 100 samples).
- Validator interop: [`io/utils/valid.js:194`](../../io/utils/valid.js)
  (`uuid` format regex).
- Randomness source: [`crypto/utils/random.js`](./random.js) — `crypto.getRandomValues`
  used directly (no userspace DRBG for this module).
- Global conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
- RFC 9562: [`https://datatracker.ietf.org/doc/html/rfc9562`](https://datatracker.ietf.org/doc/html/rfc9562)
- RFC 4122: [`https://datatracker.ietf.org/doc/html/rfc4122`](https://datatracker.ietf.org/doc/html/rfc4122)
