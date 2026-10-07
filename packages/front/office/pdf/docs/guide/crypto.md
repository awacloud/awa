# Crypto — risks and limitations

> Summary of `@awacloud/pdf`'s crypto choices and the security properties it
> does (or does *not*) guarantee.

**Prerequisites** — the package `@awacloud/pdf` (root entry
`@awacloud/pdf`, or the committed `@awacloud/pdf/standalone/*` build) and its
`@awacloud/fw` / `@awacloud/fonts` dependencies; any modern JavaScript runtime
(browser main thread or Worker, Bun, Node.js 18+). The cryptography goes through `@awacloud/fw/crypto/*`
(synchronous, no Web Crypto); the modules below are `@awacloud/pdf/crypto/*`
and `@awacloud/pdf/sig/*`.

## Standard Security Handler (V=4 R=4 / V=5 R=5 / V=5 R=6)

`crypto/standardV4.js` implements the V=4 R=4 handler (AES-128-CBC or
RC4-128 crypt filters), `crypto/standardV5.js` the V=5 R=5 handler (AES-256,
Algorithm 2.A, no hardening loop) and `crypto/standardV6.js` the PDF 2.0
V=5 R=6 handler (AES-256 with the Algorithm 2.B hardening loop). `read`
does not apply them by itself: it refuses an encrypted file unless
`allowEncrypted: true` is passed, and the caller then decrypts through
these handlers.

### AES-CBC without a MAC: malleability risk

The PDF format mandates plain **AES-256-CBC** for encrypted strings and
streams when `/Method /AESV3` is used. Consequences:

- **No authenticated integrity protection** on an encrypted field: an
  attacker able to modify ciphertext bytes of an encrypted PDF string
  causes predictable changes in the decrypted plaintext (CBC
  bit-flipping). Until a MAC or AEAD is applied *on top* (e.g. a digital
  signature over the whole document), malleability is a property of the
  format itself.
- The **TS 32003 — AES-GCM** extension covers this by replacing CBC with
  GCM (authenticated encryption). The `aesGcm.js` module is shipped for
  consumers who want to implement this out-of-strict-spec extension.

### Password authentication

Algorithm 2.B (R=6) resists dictionary attacks correctly thanks to the
hardening loop (≥ 64 iterations of SHA-2 + AES-128, conditional
termination on the ciphertext). In `standardV6.js`:

- The AES-128 key-schedule scratch buffer is reused across rounds.
- A forced bail-out at 1024 rounds guards against a runaway loop
  (`pdf/crypto/v6/hardening-runaway`).

## Signatures

`sig/signature.js` and `sig/timestamp.js` type PKCS#7/CMS signatures and
RFC 3161 tokens **and execute real public-key verification** through the
`verifyPk` primitive dispatcher (RSA-PSS, ECDSA, Ed25519) — `verifyPk` is
wired by construction, called from `_verifyPkcs7Signature` on every
`verifySignature(...)`/`verifyAllSignatures(...)` call. There is no
"structural-only, PK verify left to the consumer" mode: the digest is
recomputed from the `/ByteRange`-covered bytes, the signer certificate's
SPKI is extracted, and the matching fw primitive
(`rsa.pssVerify`/`ecc.ecdsa…verify`/`ed25519.verify`) is invoked directly.

### Semantics of `verifySignature(...)`

| Field | Meaning |
|-------|------|
| `verified` | `true` **iff** the RSA-PSS / ECDSA / Ed25519 public-key verification ran and succeeded. `false` in every other case (parse failure, digest mismatch, missing/unmatched signer cert, unsupported algorithm, or a failed public-key check). |
| `valid` | Historical alias of `verified` — kept in sync, same boolean. |
| `pkVerified` | `true` only once `_verifyPkcs7Signature` reaches and passes the `verifyPk` call; `false` on every earlier bail-out. |
| `computedDigest` | The digest recomputed over the `/ByteRange` ranges — useful for a caller that wants to re-run `rsa.pssVerify` / `ecc…verify` itself. |
| `errors` | Array of `{ code, message }` records — the parse/verification step that failed, if any (e.g. `pdf/sig/pkcs7-malformed`, `pdf/sig/signer-cert-not-found`, or a `pdf/sig/verify-pk/*` code from `verifyPk` on primitive-level failure). |

RSA PKCS#1 v1.5 signatures are refused outright
(`pdf/sig/rsa-pkcs1v15-deprecated`, NIST SP 800-131A Rev.2) rather than
verified — use RSA-PSS.

**Ceiling that remains real**: `certChain.validateChainOrder` compares
issuer/subject strings only (no cryptographic chain, revocation, or trust
anchor check). Still open: a cryptographic chain-of-trust check over the
PKCS#7 SignerInfo certificates, and PAdES long-term validation (which
needs network I/O for revocation data).
`valid`/`verified: true` proves the PKCS#7 signature was cryptographically
valid over the signed bytes and the signer certificate was structurally
matched — it is **not** proof the certificate itself is trusted or
unrevoked.

### Hardened ByteRange verification

`auditByteRange(documentBytes, byteRange, opts)` (from L3+) detects:

- `pdf/sig/byterange/self-overlap` — the second range starts before the
  first one ends.
- `pdf/sig/byterange/gap-start-mismatch` /
  `pdf/sig/byterange/gap-end-mismatch` — the declared gap does not land
  exactly on the `/Contents` hex string.
- `pdf/sig/byterange/cross-overlap` — overlap with another `/ByteRange`
  (useful for multiple signatures / incremental updates).
- `pdf/sig/byterange/incomplete-coverage` — the second range does not
  reach `documentBytes.length` (unsigned tail).
- `pdf/sig/byterange/non-zero-start` — the first range does not start at
  0.

### Active actions (`/Launch`, `/JavaScript`, `/SubmitForm`)

The `action/launch.js` typer returns a record with:

```js
{ kind: 'Launch', sandboxed: true,
  securityWarning: 'launch actions are not executed by @awacloud/pdf', … }
```

The opt-in `pdfSandbox` linter (bundle `pdf-full`) consolidates every
active-content record into a unified audit — `lintActions(records)`
returns `{ issues, hasErrors, hasActiveContent }` with `error` severity for
`Launch` / `JavaScript` / `ImportData` and `warning` for `URI` /
`SubmitForm` / `Rendition + /JS`.

**The package never executes anything.** These helpers exist so the host
application can refuse or prompt before propagating active content.

## See also

- [Coverage](./coverage.md)
- [CHANGELOG](../../CHANGELOG.md)
