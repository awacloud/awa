# `chacha20.js` — RFC interop conformance

> **STATUS: RFC interop — outside NIST/CAVP validation.**
> ChaCha20 is not a FIPS 140-3 approved algorithm (NIST/SP 800-38
> covers only AES modes). Coverage exclusively RFC 8439
> (IETF) — no published NIST ACVP vector. ChaCha20 is nevertheless
> mandated by TLS 1.3 (RFC 8446 §B.4), QUIC (RFC 9001), Noise, WireGuard.

## Standards

- **Primary**: **RFC 8439** — *ChaCha20 and Poly1305 for IETF
  Protocols* (June 2018, obsoletes RFC 7539). §2.3 *ChaCha20 Block
  Function*, §2.4 *ChaCha20 Encryption Algorithm*, §2.5 *Poly1305*
  (covered separately by poly1305.js).
- **Origin**: Bernstein 2008 — *ChaCha, a variant of Salsa20*.
- **Implemented variant**: IETF ChaCha20 (256-bit key, 96-bit nonce,
  32-bit counter). Not the original Bernstein variant (64-bit nonce +
  64-bit counter) nor XChaCha20 (192-bit nonce).

## Implemented algorithm

`chacha20.factory()` exposes the IETF ChaCha20 cipher (RFC 8439 §2.4).
Public API (`Uint8Array`):

- `xor(key, nonce, data, initialCounter = 0)` → `Uint8Array` of the same
  length as `data`, or `false` if key ≠ 32 bytes or nonce ≠ 12 bytes.
  Implements the stream involution (encrypt = decrypt).
- `_internal.block(key32, counter, nonce32, out32)` — exposed under the `_internal.*` convention (post-upgrade Finding 2 audit) for debug / introspection. Public tests exercise it indirectly via `xor(zero, …)`. Generates a
  64-byte block (16 u32 words) of keystream.

No `seek` variant; the initial counter is explicit (`initialCounter`
parameter).

## Test coverage

### Integrated official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| RFC 8439 §2.3.2 | block function | `§2.3.2 block keystream (counter=1)` | KAT 64-byte keystream byte-exact |
| RFC 8439 §2.4.2 | encryption "Sunscreen" | `§2.4.2 encrypt "Ladies and Gentlemen..."` | KAT byte-exact + round-trip decrypt |
| RFC 8439 §A.1.1 | block — zero key/nonce, counter=0 | `§A.1.1 zero key, zero nonce, counter=0` | KAT |
| RFC 8439 §A.1.2 | block — zero key/nonce, counter=1 | `§A.1.2 zero key, zero nonce, counter=1` | KAT |
| RFC 8439 §A.1.3 | block — key=0..01, counter=1 | `§A.1.3 key=0..00 01, zero nonce, counter=1` | KAT |
| RFC 8439 §A.1.4 | block — key=00ff.., counter=2 | `§A.1.4 key=00ff..00, zero nonce, counter=2` | KAT |
| RFC 8439 §A.1.5 | block — nonce=0..02, counter=0 | `§A.1.5 zero key, nonce=0..02, counter=0` | KAT |
| RFC 8439 §A.2.1 | encrypt 64 zero bytes | `§A.2.1 encrypt 64 zero bytes` | KAT |
| RFC 8439 §A.2.2 | encrypt "Any submission..." (375 bytes) | `§A.2.2 encrypt "Any submission..."` | KAT multi-block |
| RFC 8439 §A.2.3 | encrypt "'Twas brillig..." (counter=42) | `§A.2.3 encrypt long para` | KAT non-trivial counter |
| Stress | counter advance vs concat | `multi-block encryption equals concatenation of single blocks` | stream/block equivalence |
| Stress | involution | `keystream is involution` | xor(xor(pt))=pt over 513 bytes |
| Pre-existing | reject key size | `rejects non-32-byte key` | `false` |
| Pre-existing | reject nonce size | `rejects non-12-byte nonce` | `false` |
| Added | empty plaintext | `accepts empty plaintext` | zero-length output |

### Security properties tested

- [x] **RFC 8439 conformance** — 9 byte-exact KAT vectors (1× §2.3.2,
      1× §2.4.2, 5× §A.1, 3× §A.2). Covers keystream, encryption,
      counters 0/1/2/42, variable nonces.
- [x] **Multi-block** — RFC 8439 §A.2.2 encrypts 375 bytes (6 full
      blocks + 1 partial); cross-check `multi-block == concat(single-block)`.
- [x] **Involution** — `xor(xor(pt))=pt` over 513 bytes (8 blocks + 1).
- [x] **32-bit counter** — covered by §A.2.3 (explicit counter=42)
      + counter-advance cross-check.
- [x] **key/nonce length validation** — early return false; negative
      tests.
- [x] **Empty input** — empty output (stream cipher edge case).
- [x] **No `throw`** — `console.warn` + `return false` (reviewed
      lines 61-69).
- [x] **XChaCha20 (192-bit nonce)** — **Iteration G3**: `xchacha20()`
      exposed but returns `false` + `console.warn('NOT-IMPLEMENTED: XChaCha20
      (draft-irtf-cfrg-xchacha)')`. Prevents silent use; callers must
      go through a dedicated implementation (e.g. libsodium-wasm) if needed.
- [x] **32-bit counter overflow guard** — **Iteration G3**: `xor()` rejects
      any call that would push the counter ≥ 2^32 under a (key, nonce)
      pair → `false` + `console.warn('LIMIT-EXCEEDED: counter overflow (>256 GiB)')`.
      Prevents silent counter wraparound (which would reuse keystream
      blocks → catastrophic).
- [ ] **Original Bernstein ChaCha20 (64-bit nonce + 64-bit counter)** —
      not implemented. **P3** — IETF retains the 96/32 variant.
- [ ] **Strict constant-time** — `_qr`, `_block` operate only on
      u32 words (rotations, XOR, modular additions). No data-dependent
      branch in the hot path. ✅ implicit by construction
      (algorithm design).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| NIST-approved algorithm | ❌ N/A | ChaCha20 outside SP 800-38 |
| RFC 8439 conformance | ✅ | 9 byte-exact KAT vectors |
| Multi-block + counter | ✅ | §A.2.2 (375 bytes) + §A.2.3 (counter=42) |
| Stream involution | ✅ | xor(xor(pt))=pt verified |
| Parameter validation | ✅ | early return false |
| No `throw` | ✅ | `console.warn` + return false |

## Known limitations

- **Outside NIST scope** — no ACVP vector. Validation = RFC 8439.
- **No XChaCha20 or original-Bernstein variants**: see P3
  above.
- **32-bit counter → 256 GiB / (key, nonce) limit**: documented in
  RFC 8439 §2.4; no runtime protection against wraparound (caller's
  or the chacha20poly1305 AEAD wrapper's responsibility).
- **No SIMD**: scalar JS implementation; adequate performance for
  application-level protocols, suboptimal for massive throughput (TLS
  bulk).

## Cross-references

- Module: [`cipher/chacha20.js`](./chacha20.js)
- Tests: [`cipher/chacha20.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/cipher/chacha20.test.js) — **20 tests** (including the 4 added in Iteration G3: counter overflow guard + XChaCha20 reject)
- RFC 8439: [`https://datatracker.ietf.org/doc/html/rfc8439`](https://datatracker.ietf.org/doc/html/rfc8439)
- AEAD wrapper: [`../mode/chacha20poly1305.js`](../mode/chacha20poly1305.js) — see [chacha20poly1305.acvp.md](../mode/chacha20poly1305.acvp.md) (forthcoming)
- Tag MAC: [`../hash/poly1305.js`](../hash/poly1305.js) — see [poly1305.acvp.md](../hash/poly1305.acvp.md) (forthcoming)
- Overall conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
