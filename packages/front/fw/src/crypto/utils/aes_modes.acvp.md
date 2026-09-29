# `aes_modes.js` — ACVP / NIST conformance

> **Convenience wrapper** Uint8Array → Uint8Array aggregating the standard
> AES modes (CBC / CTR / GCM / KW / KWP). **All FIPS / SP 800
> conformance is delegated to the underlying modules**; this file contains
> no algorithmic logic of its own.

## Standards (delegated)

- **FIPS 197** — AES block (cf. [`cipher/aes.acvp.md`](../cipher/aes.acvp.md)).
- **SP 800-38A** §6.2 (CBC) + §6.5 (CTR) — cf. [`mode/cbc.acvp.md`](../mode/cbc.acvp.md), [`mode/ctr.acvp.md`](../mode/ctr.acvp.md).
- **SP 800-38D** (GCM) — cf. [`mode/gcm.acvp.md`](../mode/gcm.acvp.md).
- **SP 800-38F** (KW, KWP) — cf. [`mode/kw.acvp.md`](../mode/kw.acvp.md).

## Implemented algorithm

`aes_modes.factory(bitArray, aes, cbc, ctr, gcm, kw, pad)` exposes a
namespace per mode (`cbc`, `ctr`, `gcm`, `kw`, `kwp`) with a
Uint8Array-only API:

- `cbc.encrypt(key, iv, plaintext)` → PKCS#7-padded CT / `false`
- `cbc.decrypt(key, iv, ciphertext)` → unpadded PT / `false`
- `ctr.encrypt/decrypt(key, iv, data)` → stream XOR, no padding
- `gcm.encrypt(key, iv, plaintext, aad?, tagLen?)` → `{ct, tag}`
- `gcm.decrypt(key, iv, ciphertext, tag, aad?)` → PT / `false`
- `kw.wrap/unwrap(kek, key)` → SP 800-38F §6.2
- `kwp.wrap/unwrap(kek, key)` → SP 800-38F §6.3

The goal is to spare external framework consumers (workers, business
modules) from having to handle the internal SJCL `bitArray`
representation. This layer only does
`Uint8Array ↔ bitArray` marshalling before calling the modes.

## Test coverage

`aes_modes.test.js` covers:

- Round-trip encrypt/decrypt across the 5 namespaces × {AES-128, AES-192, AES-256}.
- Verifies warning propagation on invalid key/IV.
- No KAT re-validation — already fully covered by the
  `mode/*.test.js` suites (1,600+ ACVP vectors).

## FIPS 140-3 conformance (delegated)

| Requirement | Status | Reference |
|---|---|---|
| Approved algorithm | ✅ | cipher/aes + mode/{cbc,ctr,gcm,kw} |
| Byte-exact ACVP vectors | ✅ | delegated |
| No `throw` | ✅ | `console.warn` + `return false` |
| Stable Uint8Array API | ✅ | in scope for this module |

## Known limitations

- **No mechanism of its own**: everything relies on the modes. If a
  mode has a bug, this wrapper inherits it.
- **No GCM nonce-uniqueness protection**: delegated — the caller
  must use `gcm.nonceTracker(prf)` to enable in-process
  detection (cf. [mode/gcm.acvp.md](../mode/gcm.acvp.md)).

## Cross-references

- [`cipher/aes.acvp.md`](../cipher/aes.acvp.md), [`mode/cbc.acvp.md`](../mode/cbc.acvp.md),
  [`mode/ctr.acvp.md`](../mode/ctr.acvp.md), [`mode/gcm.acvp.md`](../mode/gcm.acvp.md),
  [`mode/kw.acvp.md`](../mode/kw.acvp.md).
- **I1** iteration of the FIPS 140-3 upgrade plan: clarifies the
  *convenience wrapper, FIPS coverage delegated* status.
