---
module: pdfSignature
category: pdf/sig
dependencies: [pdfErrors, pdfParser, pdfSigOids, asn1, rsa, ecc, ed25519, sha256, sha384, sha512, bitArray]
returns: object
worker-safe: true
status: complete
---

# pdfSignature

> Digital signature handler — ISO 32000-2 §12.8 + ISO TS 32001 (CAdES) + ISO TS 32002 (Ed25519).

**Module** `pdfSignature` | **Source** `packages/front/office/pdf/src/sig/signature.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfSigOids`, `asn1`, `rsa`, `ecc`, `ed25519`, `sha256`, `sha384`, `sha512`, `bitArray` | **Worker-safe** yes

Typing and end-to-end verification of PDF signatures (detached PKCS#7/CMS). Supported SubFilters: `adbe.pkcs7.detached`, `adbe.pkcs7.sha1` (legacy), `ETSI.CAdES.detached`, `ETSI.RFC3161` (timestamp only), plus Ed25519 (ISO TS 32002). `verifySignature` reconstructs the `/ByteRange`-covered bytes, recomputes the digest, locates the signer's certificate inside the embedded PKCS#7 `SignedData`, and **does dispatch and execute** the public-key check itself (`rsa.pssVerify` / ECDSA / `ed25519.verify` via the internal `verifyPk` dispatcher) — see § *Semantics of `verified` vs `valid` vs `pkVerified`* below. The result's `valid` field is a deprecated alias of `verified`: read `verified`.

## Resolve

```js
const sig = runtime.resolve('pdfSignature');
// Returns: { typeSignature, verifySignature, verifyAllSignatures, verifyPk,
//            locatePkcs7, DIGEST_OIDS, SIG_OIDS }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeSignature` | `(dict, refInfo?) => Signature` | Strict typing, §12.8.1 Table 252. |
| `verifySignature` | `(typedSig, documentBytes, fwBundle?) => VerifyResult` | Full verification — digests `/ByteRange`, locates the signer cert, and runs the public-key check. |
| `verifyAllSignatures` | `(documentBytes, fwBundle?) => { signatures: VerifyResult[], timestamps: TsVerifyResult[] }` | Scans the raw bytes for every `/Type /Sig` and `/Type /DocTimeStamp` object (across incremental updates) and verifies each. |
| `verifyPk` | `(args: { algorithm, pubKey, signature, message?, digest?, hashMod?, sLen? }) => { verified: boolean, code?: string, error?: string }` | Public-key verification primitive dispatcher — routes to `rsa.pssVerify` (`'rsa-pss'`), fw's deliberate RSA PKCS#1 v1.5 refusal (`'rsa-v15'`/`'rsa'`), ECDSA (`'ecdsa'`/`'ecc'`) or `ed25519.verify` (`'ed25519'`). For ECDSA, `signature` is the DER `ECDSA-Sig-Value` or the legacy fixed-width raw r‖s (DER tried first; anything else → `pdf/sig/verify-pk/bad-ecdsa-sig`). |
| `locatePkcs7` | `(blob: Uint8Array, asn1Mod?) => asn1Children \| false` | Decodes the CMS `ContentInfo` → `SignedData` and returns its parsed children (`false` on malformed input). |

`DIGEST_OIDS` and `SIG_OIDS` (constants, re-exported from `pdfSigOids`) are also returned for callers that need to map OIDs to algorithm names directly.

The factory also returns five internal helpers with a leading underscore
(`_hashByteRange`, `_scanSignatureObjects`, `_verifyPkcs7Signature`,
`_verifyTsaSignature`, `_ecdsaSigToRaw`) — exposed for internal reuse/testing, not part of the
stable public contract; prefer the methods above.

### Shape `Signature`

```js
{
    kind: 'Sig' | 'DocTimeStamp',
    filter, subFilter, contents: Uint8Array,
    byteRange: [start1, len1, start2, len2],
    reference, cert, name, m, location, reason, contactInfo,
    v, propBuild, propAuthTime, propAuthType,
    raw   // the source dict
}
```

## Examples

### Semantics of `verified` vs `valid` vs `pkVerified`

`verifySignature(...)` returns:

```js
{
    verified:    true,           // public-key check executed AND succeeded
    valid:       true,           // deprecated alias of verified
    pkVerified:  true,           // explicit strict-crypto boolean
    errors:      [ /* { code, message, context?, cause? } */ ],
    signerCerts: [ /* { der } */ ],
    hashAlg:     'sha256' | 'sha384' | 'sha512' | null,
    signatureAlg:'rsa' | 'rsa-pss' | 'ecc' | 'ed25519' | null,
    computedDigest: Uint8Array | null   // digest recomputed over /ByteRange
}
```

`valid` is a **deprecated alias of `verified`**: it always carries the same
value, is kept for compatibility, and will be removed in a future major
version. Read `verified`. The same holds for the `valid` field of each
`verifyAllSignatures` entry, signatures and document timestamps alike.

`verified` / `pkVerified` are `true` only when the public-key check
(`verifyPk`, dispatched internally) actually ran and succeeded against the
signer's certificate SPKI. There is **no** `pdf/sig/pk-verify-not-wired`
code in this module — the public-key verification path is wired by
construction; a failed check surfaces a specific `errors[]` record instead
(e.g. `pdf/sig/pk-verify-failed`, `pdf/sig/rsa-pkcs1v15-deprecated` for the
deliberately-refused legacy scheme).

### Structural verification + digest

```js
const sig = runtime.resolve('pdfSignature');
const typed = sig.typeSignature(sigFieldDict.v);
const result = sig.verifySignature(typed, documentBytes, fwBundle);
result.verified;                 // true when the PK check passed
result.computedDigest;           // Uint8Array — /ByteRange digest
result.pkVerified;                // strict-crypto boolean, same as `verified`
```

### Multi-signature + timestamp scan

```js
const sig = runtime.resolve('pdfSignature');
const { signatures, timestamps } = sig.verifyAllSignatures(documentBytes, fwBundle);
signatures.every((s) => s.verified);
timestamps.every((t) => t.verified);
```

Each `timestamps[]` entry (`TsVerifyResult`) has this shape:

```js
{
    objNum, objGen,                 // the /DocTimeStamp object
    verified:        true,          // imprint matches AND the gap is exact
    valid:           true,          // deprecated alias of verified
    kind:            'DocTimeStamp',
    subFilter:       'ETSI.RFC3161' | string | null,
    hashAlg:         'sha256' | 'sha384' | 'sha512' | string | null,
    tstInfo:         { hashAlg, imprint, rawSd } | null,
    imprintVerified: true,          // messageImprint == /ByteRange digest (imprint outcome alone)
    tsaVerified:     false,         // TSA signature check — informational
    gapForm:         'token' | 'digits' | null,
    errors:          [ /* { code, message, context?, cause? } */ ],
    signerCerts:     [ /* the TSA signer certificates, when located */ ]
}
```

`gapForm` names the accepted `/ByteRange` gap form, in the vocabulary of
`pdfByteRange.auditByteRange`: `'token'` when the gap is exactly the whole
`<…>` token of the `/Contents` value, `'digits'` when it is exactly its hex
digits, `null` for any other gap. It is present on every entry, failure
paths included. A non-exact gap adds a
`pdf/sig/byterange/gap-start-mismatch` / `gap-end-mismatch` record to
`errors[]` and leaves `verified: false` even when `imprintVerified` is
`true`; the earlier `pdf/ts/*` failures keep their first error code.
`signatures[]` entries carry `objNum` / `objGen` plus the `verifySignature`
result shape above, with no `gapForm` key.

### Inspecting the decoded CMS

```js
const sd = sig.locatePkcs7(typed.contents);
// sd is the parsed SignedData children array (ASN.1 nodes), or `false`.
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/sig/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/sig/bad-type` | `ParseError` | `/Type` is neither `/Sig` nor `/DocTimeStamp`. |
| `pdf/sig/missing-filter` | `ParseError` | `/Filter` missing. |
| `pdf/sig/missing-subfilter` | `ParseError` | `/SubFilter` missing. |
| `pdf/sig/unknown-subfilter` | `ParseError` | SubFilter outside the supported set. |
| `pdf/sig/missing-contents` | `ParseError` | `/Contents` missing. |
| `pdf/sig/missing-byterange` | `ParseError` | `/ByteRange` missing. |
| `pdf/sig/bad-byterange` | `ParseError` | `/ByteRange` malformed (≠ 4 integers). |
| `pdf/sig/missing-fw` | `EncryptionError` | fw bundle incomplete for `verifySignature`. |
| `pdf/sig/byterange/inconsistent` | `ParseError` | ByteRange offsets inconsistent with the document length. |
| `pdf/sig/pkcs7-malformed` | record `errors[]` | PKCS#7 `SignedData` parse failed. |
| `pdf/sig/no-signer` / `empty-signers` / `bad-signer` | record `errors[]` | `signerInfos` absent / empty / malformed. |
| `pdf/sig/unknown-digest` / `unknown-sigalg` | record `errors[]` | digestAlgorithm / signatureAlgorithm OID outside the supported set. |
| `pdf/sig/no-hash` | record `errors[]` | Hash module unavailable for the resolved `hashAlg`. |
| `pdf/sig/signer-info-short` / `no-encrypted-digest` | record `errors[]` | SignerInfo ASN.1 shape unexpected. |
| `pdf/sig/digest-failed` | record `errors[]` | Failed to recompute the `/ByteRange` digest. The record is `{ code, message }`: the underlying error's message is appended to `message`, and no `cause` is attached. |
| `pdf/sig/signed-attrs-parse-failed` / `digest-not-computed` / `digest-length-mismatch` / `digest-mismatch` / `no-message-digest-attr` | record `errors[]` | `signedAttrs` present but its `messageDigest` attribute fails to parse or match. |
| `pdf/sig/signer-cert-not-found` | record `errors[]` | No embedded cert matches the SignerInfo's `IssuerAndSerialNumber`. |
| `pdf/sig/spki-*` (`cert-parse`, `not-found`, `malformed`, `rsa-parse`, `rsa-fields`, `ecc-not-uncompressed`, `ed25519-bad-len`, `unsupported-alg`) | record `errors[]` | SubjectPublicKeyInfo extraction/shape failure. |
| `pdf/sig/byterange/gap-start-mismatch` / `gap-end-mismatch` | record `errors[]` (`verified: false`) | `/Sig` and `/DocTimeStamp`: the `/ByteRange` gap is neither exactly the hex digits of `/Contents` nor exactly its whole `<…>` token — both forms are accepted, every other gap is refused by `verifySignature` / `verifyAllSignatures` (a `/Sig`) and by `verifyAllSignatures` (a `/DocTimeStamp`, whose `imprintVerified` still reports the imprint outcome alone). The `timestamps[]` entry names the accepted form in `gapForm`. |
| `pdf/sig/byterange-concat-failed` | record `errors[]` | Failed to extract the ByteRange-covered bytes for the fallback signed-payload path. |
| `pdf/sig/pk-verify-failed` | record `errors[]` | `verifyPk` ran and returned `verified: false` (see `verifyPk` codes below). |
| `pdf/sig/verify-pk/bad-args` / `no-alg` / `bad-sig` / `no-message` / `no-hash` / `no-rsa` / `bad-rsa-key` / `no-ecc` / `bad-ecc-key` / `unknown-curve` / `bad-ecc-point` / `bad-ecdsa-sig` / `no-digest` / `no-ed25519` / `bad-ed25519-key` / `unknown-alg` / `throw` | `verifyPk` return `{ code }` | Invalid inputs or dispatch failure inside `verifyPk`. |
| `pdf/sig/rsa-pkcs1v15-deprecated` | `verifyPk` return `{ code }` | RSA PKCS#1 v1.5 is deliberately refused (NIST SP 800-131A Rev.2) — use RSA-PSS. |
| `pdf/ts/*` (`empty-contents`, `parse-failed`, `unknown-hash`, `imprint-length-mismatch`, `imprint-mismatch`, `byterange-failed`, `no-ci`, `short-ci`, `no-sd`, `short-sd`, `no-eci`, `no-econtent`, `no-tst`, `short-tstinfo`, `no-imprint`, `tsa-no-sd`, `tsa-throw`) | record `errors[]` | Emitted by `verifyAllSignatures`'s `/DocTimeStamp` branch (RFC 3161 TimeStampToken parsing + TSA signature check). |

## See also

- [`pdfByteRange`](./byteRange.md) · [`pdfTimestamp`](./timestamp.md) · [`pdfCertChain`](./certChain.md)
- [`pdfSignatureField`](../form/signature.md)
