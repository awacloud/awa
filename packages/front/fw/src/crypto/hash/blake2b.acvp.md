# `blake2b.js` — RFC interop conformance

> **STATUS: RFC interop — outside NIST/CAVP validation.**
> BLAKE2b is not a FIPS 140-3 approved hash function (NIST/FIPS
> 180-4 retains SHA-2, FIPS 202 retains SHA-3/SHAKE). Coverage is
> exclusively RFC 7693 (IETF) — no published NIST ACVP vector.
> BLAKE2b is nonetheless deployed in Argon2 (RFC 9106), libsodium,
> WireGuard, KeePass v4, IPFS, Cardano, Zcash, and many modern
> KDF/MAC schemes for its performance and its resistance to
> length-extension.

## Standards

- **Primary**: **RFC 7693** — *The BLAKE2 Cryptographic Hash and
  Message Authentication Code (MAC)* (November 2015). §3 BLAKE2b
  algorithm, §A "abc" vector, §E official *self-test*.
- **Origin**: Aumasson, Neves, Wilcox-O'Hearn, Winnerlein 2013 —
  *BLAKE2: simpler, smaller, fast as MD5*.
- **Implemented variant**: BLAKE2b (64-bit words, output 1..64 bytes,
  128-byte block, 12 rounds). No BLAKE2s (32-bit words) nor
  BLAKE2bp/sp (parallel).

## Implemented algorithm

`blake2b.factory()` exposes BLAKE2b in one-shot and streaming form.
Public API (`Uint8Array`):

- `hash(msg, outLen = 64, key?)` → `Uint8Array(outLen)` or `false`.
  outLen ∈ [1, 64]. key ∈ [0, 64] bytes (BLAKE2b keyed MAC mode).
- `create(outLen = 64, key?, salt?, person?)` → context `{ update, digest }`
  or `false`. salt and person must be exactly 16 bytes if provided;
  bound to the parameter block §3.3 / §2.5-2.8.
- `update(chunk)` accumulates a Uint8Array; rejects calls after
  `digest()` (return false).
- `digest()` finalizes and returns the hash.

All lengths (outLen, keyLen) are bound into the parameter block
XOR'd into h[0..7] (§3.3) — strong domain separation.

## Test coverage

### Built-in official vectors

| Source | Reference | Test | Property verified |
|---|---|---|---|
| RFC 7693 §A | "abc" BLAKE2b-512 | `§A: hash of "abc"` | byte-exact KAT |
| Reference | empty BLAKE2b-512 | `hash of empty input` | byte-exact KAT |
| Reference | empty BLAKE2b-256 | `hash of empty input at outLen=32` | byte-exact KAT (see blake2b CLI) |
| **RFC 7693 §E** | **official self-test** | `§E self-test — final hash matches RFC constant` | accumulates **48 sub-tests** (4 outLens × 6 inLens × {keyed, unkeyed}); final hash == `c23a7800d98123bd...7bccd475` |
| Stream | length-binding | `shorter outLen is BLAKE2b-parameterised` | BLAKE2b-256 ≠ truncate(BLAKE2b-512) — RFC 7693 §3.3 |
| Stream | 3-chunk update | `streaming matches one-shot` | determinism |
| Stream | 128-byte block boundary | `streaming matches one-shot across exact 128-byte block boundary` | block boundary |
| Stream | byte-by-byte | `streaming matches one-shot with byte-by-byte updates` | 1-byte granularity |
| Stream | finalization | `digest is idempotent — second call after finalisation rejected` | update post-digest → false |
| MAC | keyed determinism | `keyed hash differs from unkeyed and is deterministic` | key binding + reproducibility |
| MAC | key binding | `different keys produce different outputs` | non-collision on key |
| MAC | empty msg keyed | `keyed hash with empty msg` | well defined |
| Param | salt binding | `salt parameter binds into output` | s1 ≠ s2 → hash ≠ |
| Param | person binding | `personalization parameter binds into output` | p1 ≠ p2 → hash ≠ |
| Param | salt vs person domain separation | `salt vs personalization are distinct domains` | same bytes in salt vs person → hash ≠ |
| Validation | outLen out of range | `rejects outLen out of range` | false on 0 + 65 |
| Validation | key > 64 | `rejects key > 64 bytes` | false |
| Validation | salt length | `rejects salt of wrong length` | false on 15 + 17 |
| Validation | person length | `rejects personalization of wrong length` | false on 15 + 17 |

### Security properties tested

- [x] **RFC 7693 self-test §E conformance** — 48 sub-tests covering
      4 outLens × 6 inLens × {keyed, unkeyed}; byte-exact final hash
      simultaneously validating:
      - parameter block packing (outLen, keyLen, fanout, depth)
      - keyed mode (first block of zero-padded key)
      - outLen truncation 20/32/48/64
      - block boundaries (inLen 128, 129, 255, 1024)
      - Fibonacci `selftest_seq` PRG reproduced byte-exact
- [x] **Length binding** — outLen is in the parameter block;
      BLAKE2b-256("abc") ≠ truncate(BLAKE2b-512("abc"), 32). Security
      against cross-outLen length-extension.
- [x] **Salt + personalization binding** — 3 orthogonality tests
      (salt change, person change, salt vs person same bytes).
- [x] **Keyed MAC** — keyed binding + non-collision on different keys.
- [x] **Streaming = one-shot** — 3 granularities (free chunk, 128-byte
      block boundary, byte-by-byte).
- [x] **digest idempotence** — post-finalization, update → false.
- [x] **Parameter validation** — outLen, key, salt, person rejected
      out of range.
- [x] **No `throw`** — `console.warn` + `return false` (reviewed
      lines 209-225, 283-285).
- [ ] **BLAKE2s (32-bit words, output 1..32 bytes)** — not implemented.
      **P3** — less frequently used than BLAKE2b.
- [ ] **BLAKE2bp / BLAKE2sp (parallel, multi-thread)** — not
      implemented. **P3** — of no interest in single-thread JS.
- [ ] **Tree mode (RFC 7693 §2.10)** — not exposed. **P3**.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| NIST-approved algorithm | ❌ N/A | BLAKE2 outside FIPS 180-4 / FIPS 202 |
| RFC 7693 conformance | ✅ | §A + §E self-test (48 sub-tests + byte-exact final hash) |
| Length binding (outLen) | ✅ | BLAKE2b-256 ≠ truncate(BLAKE2b-512) |
| Keyed MAC mode | ✅ | determinism + key binding |
| Domain separation salt/person | ✅ | 3 orthogonality tests |
| Parameter validation | ✅ | early return false |
| No `throw` | ✅ | `console.warn` + return false |

## Known limitations

- **Outside NIST scope** — no ACVP vector. Validation = RFC 7693
  + official self-test (the most rigorous of the non-NIST hashes).
- **No BLAKE2s / parallel variants**: see P3 above.
- **No tree mode**: RFC 7693 §2.10, exposure not required by
  current usages (Argon2, KeePass…).

## Cross references

- Module: [`hash/blake2b.js`](./blake2b.js)
- Tests: [`hash/blake2b.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/hash/blake2b.test.js) — 20 tests (was 7 before this iteration, including **48 sub-tests accumulated in the §E self-test**)
- RFC 7693: [`https://datatracker.ietf.org/doc/html/rfc7693`](https://datatracker.ietf.org/doc/html/rfc7693)
- Reference selftest C: `https://github.com/BLAKE2/BLAKE2/blob/master/ref/blake2b-ref.c`
- Argon2 uses BLAKE2b internally: [`./argon2.js`](./argon2.js) — see [argon2.acvp.md](./argon2.acvp.md) (upcoming)
- Overall conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
