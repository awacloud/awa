# `chacha20poly1305.js` — RFC interop conformance

> **STATUS: RFC interop — outside NIST/CAVP validation.**
> ChaCha20-Poly1305 is not a FIPS 140-3 approved AEAD (NIST/SP
> 800-38D retains AES-GCM). Coverage exclusively RFC 8439 (IETF) —
> no published NIST ACVP vector. Nevertheless mandated by TLS 1.3 (RFC
> 8446 §B.4 `TLS_CHACHA20_POLY1305_SHA256`), QUIC (RFC 9001), Noise,
> WireGuard, OpenSSH, Signal, OAuth.

## Standards

- **Primary**: **RFC 8439** — *ChaCha20 and Poly1305 for IETF
  Protocols* (June 2018, obsoletes RFC 7539). §2.6 *Generating the
  Poly1305 Key Using ChaCha20*, §2.8 *AEAD Construction*, §A.5 (test
  vector decrypt).
- **Origin**: Adam Langley & Yoav Nir, Bernstein's AEAD integration of
  ChaCha20 + Poly1305.

## Implemented algorithm

`chacha20poly1305.factory(chacha20, poly1305)` exposes the IETF
ChaCha20-Poly1305 AEAD (256-bit key, 96-bit nonce, 128-bit tag). Public
API (`Uint8Array`):

- `encrypt(key, nonce, plaintext, aad?)` → `{ ct, tag }` (16-byte
  tag), or `false` if key/nonce has the wrong size.
- `decrypt(key, nonce, ciphertext, tag, aad?)` → `Uint8Array` (plaintext)
  or `false` if tag verification fails (`console.error CORRUPT`).

Internal construction (RFC 8439 §2.8.1):
1. `polyKey = ChaCha20(key, nonce, 0×64)[0..31]` — counter=0 block.
2. `ct = ChaCha20(key, nonce, plaintext)` starting at counter=1.
3. `macInput = aad ‖ pad16 ‖ ct ‖ pad16 ‖ |aad|₈ ‖ |ct|₈` (64-bit
   little-endian lengths).
4. `tag = Poly1305(polyKey, macInput)`.
5. Constant-time tag verification on decrypt via `poly1305.verify`.

## Test coverage

### Integrated official vectors

| Source | Reference | Test | Property verified |
|---|---|---|---|
| RFC 8439 §2.6.2 | polyKey derivation | `§2.6.2 polyKey derivation` | KAT first 32 bytes of ChaCha20(counter=0) |
| RFC 8439 §2.8.2 | AEAD example | `§2.8.2 AEAD encrypt KAT` | KAT byte-exact ct + tag |
| RFC 8439 §2.8.2 | AEAD example | `§2.8.2 AEAD decrypt KAT` | round-trip decrypt byte-exact |
| RFC 8439 §A.5 | AEAD decrypt fixture | `§A.5 AEAD decrypt KAT` | KAT decrypt byte-exact (different key/nonce/aad/ct/tag, msg "Internet-Drafts...") |
| Edge | empty pt + AAD | `round-trip with empty plaintext + non-empty AAD` | ct.length=0 + valid tag |
| Edge | pt + empty AAD | `round-trip with empty AAD + non-empty plaintext` | round-trip OK |
| Edge | both empty | `round-trip with both empty` | tag = MAC of the length-encoding |
| Tampering | ct (every position) | `decrypt rejects tampered ciphertext (every byte position)` | false on every XOR |
| Tampering | tag (16 positions) | `decrypt rejects tampered tag (every byte position)` | false on every XOR |
| Tampering | aad (every position) | `decrypt rejects tampered AAD (every byte position)` | false on every XOR |
| Tampering | nonce | `decrypt rejects altered nonce` | false (cross-binding) |
| Tampering | ct length | `decrypt rejects truncated/appended ciphertext` | false (length-encoding bind) |
| Validation | reject 31-byte key | `encrypt rejects non-32-byte key` | false |
| Validation | reject 11-byte nonce | `encrypt rejects non-12-byte nonce` | false |
| Validation | reject 15/17-byte tag | `decrypt rejects bad-length tag` | false |
| Counter | counter=1 ChaCha20 | `encrypt uses ChaCha20 counter=1 for keystream` | direct equivalence with `_cc.xor(., 1)` |

### Security properties tested

- [x] **RFC 8439 §2.8 conformance** — KAT byte-exact ct + tag (§2.8.2)
      + decrypt KAT (§A.5).
- [x] **polyKey/keystream domain separation** — explicitly verified:
      polyKey = ChaCha20 counter=0, ct = counter=1.
- [x] **Length-encoding binding** — ct truncation and appending
      detected (the MAC's `len64le` binding rejects altered lengths).
- [x] **Exhaustive tampering** — 4 categories (ct, tag, aad, nonce) +
      ct lengths; per-byte coverage on ct/tag/aad.
- [x] **Constant-time tag comparison** — delegated to `poly1305.verify`
      (see poly1305.acvp.md; accumulated XOR).
- [x] **key/nonce/tag length validation** — early return false;
      negative tests.
- [x] **No `throw`** — `console.error CORRUPT` + `return false`
      on tag mismatch (reviewed lines 80-85).
- [ ] **XChaCha20-Poly1305 (192-bit nonce)** — not implemented
      (draft-irtf-cfrg-xchacha). **P3**.
- [ ] **Per-(key, nonce) limit** — RFC 8439 §6 documents the limit at
      ~2⁶⁴ ChaCha20 blocks per (key, nonce) pair. No runtime guard;
      caller's responsibility. **P3** — could be added as a
      counter.
- [x] **Nonce-reuse detection** — **Iteration G2**: `nonceTracker(key)`
      exposed (symmetric pattern to `mode/gcm.js:258`). Wraps `encrypt` /
      `decrypt` with a `Set` of seen nonces, reuse → `console.error('[crypto]
      CORRUPT: chacha20poly1305: nonce reuse rejected by tracker')` + `false`.
      Process-local and per-wrapper (no global sharing). Opt-in (no
      breaking change).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| NIST-approved algorithm | ❌ N/A | ChaCha20-Poly1305 outside SP 800-38D |
| RFC 8439 conformance | ✅ | KAT §2.6.2 + §2.8.2 + §A.5 byte-exact |
| polyKey/ct domain separation | ✅ | counter=0 vs counter=1 verified |
| Length-encoding binding | ✅ | ct length tampering rejected |
| Constant-time tag verify | ✅ | delegated to poly1305.verify |
| No `throw` | ✅ | `console.error` + return false |
| Nonce-reuse protection | ✅ (opt-in) | **Iteration G2**: `nonceTracker(key)` wraps encrypt/decrypt with a Set of nonces, reuse → `false` + `CORRUPT` warn |

## Known limitations

- **Outside NIST scope** — no ACVP vector. Validation = RFC 8439.
- **No XChaCha20-Poly1305**: see P3 above.
- ~~**No nonce-reuse tracker**~~ — resolved in G2 (see above).

## Cross-references

- Module: [`mode/chacha20poly1305.js`](./chacha20poly1305.js)
- Tests: [`mode/chacha20poly1305.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/mode/chacha20poly1305.test.js) — **23 tests** (including the 5 added in G2: `nonceTracker` opt-in — first-encrypt / reuse rejected / distinct nonces / decrypt does not increment the set / per-wrapper scope; was 6 before the upgrade)
- RFC 8439: [`https://datatracker.ietf.org/doc/html/rfc8439`](https://datatracker.ietf.org/doc/html/rfc8439)
- Stream cipher: [`../cipher/chacha20.js`](../cipher/chacha20.js) — see [chacha20.acvp.md](../cipher/chacha20.acvp.md)
- MAC: [`../hash/poly1305.js`](../hash/poly1305.js) — see [poly1305.acvp.md](../hash/poly1305.acvp.md)
- Sibling NIST AEAD: [`./gcm.js`](./gcm.js) — see [gcm.acvp.md](./gcm.acvp.md)
- Overall conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
