# `aes_ctr.js` — ACVP / NIST conformance

> **Legacy convenience wrapper** for Uint8Array ↔ AES-CTR with PKCS#7 padding
> handled internally. Keeps a historical object API (`new _Encrypt(key, iv)` →
> `pad/strip/raw/ba_*` methods). **All FIPS / SP
> 800-38A conformance is delegated to `mode/ctr.js`.** Prefer
> [`utils/aes_modes.js`](aes_modes.js) (`aes_modes.ctr.{encrypt,decrypt}`) for
> any new code.

## Status (Iteration I1)

**`@deprecated` (soft)** — no export removed, no runtime warn added
so as not to break existing consumers. The doc header of
`aes_ctr.js` redirects to `aes_modes.ctr`.

## Standards (delegated)

- **FIPS 197** — AES block (cf. [`cipher/aes.acvp.md`](../cipher/aes.acvp.md)).
- **SP 800-38A §6.5** (CTR) — cf. [`mode/ctr.acvp.md`](../mode/ctr.acvp.md).
- **PKCS #7 padding** — cf. [`utils/pad.js`](pad.js) (PKCS#7 RFC 5652 §6.3).

## Implemented algorithm

`aes_ctr.factory(bitArray, aes, ctr, pad)` exposes:

- `ui8(key, iv)` → instance with:
  - `pad(plaintext)` — encrypt + PKCS#7 pad → CT
  - `strip(ciphertext)` — decrypt + PKCS#7 strip → PT
  - `raw(data)` — XOR keystream without padding (CTR is an involution)
  - `update(iv)` — change the initial counter (rare)
  - `ba_raw / ba_update` — bitArray variants (internal, avoids
    Uint8Array→bitArray marshalling on the hot path)

## Test coverage

`aes_ctr.test.js` covers round-trip + cross-check against raw
`mode/ctr.js`. No KAT re-validation — fully delegated to
[`mode/ctr.acvp.md`](../mode/ctr.acvp.md) (ACVP-AES-CTR-1.0).

## FIPS 140-3 conformance (delegated)

| Requirement | Status | Reference |
|---|---|---|
| Approved algorithm | ✅ | cipher/aes + mode/ctr |
| Byte-exact ACVP vectors | ✅ | delegated |
| No `throw` | ✅ | delegated (consumes `false` returns without propagating) |
| AEAD authenticity | ❌ N/A | **CTR is malleable** — no authentication; requires encrypt-then-MAC or switching to `aes_modes.gcm` |

## Known limitations

- **Non-uniform legacy API** vs. `aes_modes` (3 separate calls instead
  of a simple `encrypt(key, iv, pt)`). Kept for back-compat.
- **PKCS #7 padding in CTR**: semantically odd (CTR does not need
  padding) — a usage holdover where padding signaled the message
  length. For new code, prefer `aes_modes.ctr.encrypt` (no
  padding, length transmitted out-of-band) or `aes_modes.gcm` (AEAD).
- **No nonce-uniqueness protection**: see `mode/ctr.acvp.md` —
  a (key, IV) collision → keystream recovery → plaintext leak.
  The caller must guarantee uniqueness.

## Cross-references

- [`mode/ctr.acvp.md`](../mode/ctr.acvp.md) — algorithm + ACVP vectors.
- [`utils/aes_modes.acvp.md`](aes_modes.acvp.md) — recommended wrapper for
  new code (uniform API across all modes).
- **I1** iteration of the FIPS 140-3 upgrade plan: legacy status
  clarification + redirection to `aes_modes`.
