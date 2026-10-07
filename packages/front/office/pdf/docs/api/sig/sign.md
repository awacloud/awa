---
module: pdfSign
category: pdf/sig
dependencies: [pdfErrors, pdfSigOids, pdfByteRange, pdfDssBuilder, pdfIncrementalWriter, pdfParser, asn1, rsa, ecc, ed25519, sha256, sha384, sha512, bitArray, pdfDocument, pdfSecurity, pdfStandardV4, pdfStandardV5, pdfStandardV6]
returns: object
worker-safe: true
status: complete
---

# pdfSign

> PAdES signature generation (write side) — levels B / T / LT / LTA.

**Module** `pdfSign` | **Source** `packages/front/office/pdf/src/sig/sign.js` | **Deps** `pdfErrors`, `pdfSigOids`, `pdfByteRange`, `pdfDssBuilder`, `pdfIncrementalWriter`, `pdfParser`, `asn1`, `rsa`, `ecc`, `ed25519`, `sha256`, `sha384`, `sha512`, `bitArray`, `pdfDocument`, `pdfSecurity`, `pdfStandardV4`, `pdfStandardV5`, `pdfStandardV6` | **Worker-safe** yes

Companion of [`pdfSignature`](./signature.md) (verify side). Produces a
detached PKCS#7/CMS `SignedData` blob and embeds it into a signature
dictionary whose `/ByteRange` covers the whole document minus the
whole `/Contents` `<…>` token, delimiters included (ISO 32000-2 §12.8.3.3.1
— see [`pdfByteRange`](./byteRange.md)); `_emitWithPlaceholder`'s
`contentsOffset` / `contentsLength` still name the hex-digit span. Algorithms: RSA-PSS, ECDSA (P-256/P-384/P-521),
Ed25519 — PKCS#1 v1.5 is deliberately refused (fw policy, NIST SP
800-131A Rev.2). ECDSA signature values are DER `ECDSA-Sig-Value`
(RFC 3279 §2.2.3); Ed25519 always uses SHA-512 (RFC 8419 §3.1).
**Default `subFilter` is `adbe.pkcs7.detached`** — a PAdES
emitter MUST explicitly pass `subFilter: 'ETSI.CAdES.detached'`.

## PAdES levels

| Level | Requires | Behavior |
|-------|----------|----------|
| `B` (default) | — | Single embedded signature, `eContentInfo` absent, no `signedAttrs` unless `opts.useSignedAttrs`. |
| `T` | `opts.tsaSign` callback | Adds `signedAttrs` (contentType, messageDigest, signingTime, ESS `signing-certificate-v2`) and an `unsignedAttrs` RFC 3161 timestamp token. |
| `LT` | `T` requirements + `pdfDssBuilder`/`pdfDocument` (always present via the registered `modules` deps) | As `T`, then appends a DSS (`/Certs`, `/OCSPs`, `/CRLs`, `/VRI`) and an updated Catalog via an incremental update. |
| `LTA` | `LT` requirements | As `LT`, then appends a second incremental update carrying a `/DocTimeStamp` (fresh `tsaSign` call over the LT bytes). |

Every level signs by **incremental update** (§7.5.6, non-destructive): the
base bytes are kept verbatim and the signature object is appended through
[`pdfIncrementalWriter`](../document/incrementalWriter.md). The update section
therefore takes the form of the base's newest cross-reference section
(classical table or cross-reference stream), and its `/Root`, `/Info` and
`/ID` come from the newest-first merged trailer. The signature takes the
first object number at or past the merged `/Size`, so an object held in an
object stream is never overwritten. The fixed-width `/ByteRange`
and `/Contents` placeholders are found inside the signature object from its
own offset, and they are patched without changing the byte length. `LT`
adds a second update: the DSS, plus the Catalog re-defined under its own
number with `/DSS`. The Catalog is resolved through `readDocument` from the
trailer `/Root`, wherever it lives, including inside an object stream.
`LTA` adds a third update, the DocTimeStamp, appended the same way
as the signature. A hybrid-reference base (a classical trailer carrying
`/XRefStm`) is refused, and nothing is written.

The `pdfParser` dependency is no longer read. It keeps its position so that
code calling the factory with positional arguments still works.
`pdfDocument` comes next. Every level needs it, because the signature
field is written from the Catalog and page 1 that `readDocument` resolves.
`pdfSecurity`, `pdfStandardV4`, `pdfStandardV5` and `pdfStandardV6` are
appended last. They are read only when the base is encrypted, so a
hand-wired factory that signs only unencrypted documents may pass `null`
for them.

## What the update contains

ISO 32000-2 §12.7.5.5 makes a signature dictionary the value (`/V`) of a
signature field (`/FT /Sig`), and §12.8.5.2 says a document timestamp is
found the same way, by examining signature fields. So the incremental
update that carries a signature dictionary also carries the field that
holds it:

| Object | Content |
|--------|---------|
| Signature dictionary | `/Type /Sig` (`/Type /DocTimeStamp` for the LTA timestamp), `/Filter /Adobe.PPKLite`, `/SubFilter`, `/ByteRange`, `/Contents`. It takes the first object number at or past the merged `/Size`. |
| Field / widget | One object, the field dictionary merged with its widget annotation (§12.7.4, §12.5.6.19), numbered right after the signature: `/Type /Annot`, `/Subtype /Widget`, `/FT /Sig`, `/T (Signature<n>)`, `/V` → the signature dictionary, `/Rect [0 0 0 0]` (invisible), `/F 132` (Print + Locked), `/P` → page 1. `<n>` is the lowest index no root field of the document already uses, so a second `sign()` writes `Signature2`. |
| Page 1 | Re-emitted under its own number with the widget appended to `/Annots`. If `/Annots` is an indirect array, that array object is re-emitted instead and the page is not. Page 1 is the first leaf of the page tree. |
| `/AcroForm` | `/Fields` gets the new field appended, and `/SigFlags` is set to `3` (SignaturesExist + AppendOnly). An indirect `/AcroForm` is re-emitted under its own number. A direct or absent one is written into a re-emission of the Catalog. An indirect `/Fields` array is re-emitted under its own number. |

Every entry these objects already had is copied as it is, so existing form
fields, annotations and `/AcroForm` keys (`/DA`, `/DR`, `/NeedAppearances`
and so on) are kept. All new objects come before the update's
cross-reference section, so the `/ByteRange` covers them like every other
byte. `LT` copies the Catalog, `/AcroForm` included, when it adds `/DSS`.
`LTA` then appends a second field for its `/DocTimeStamp` in the timestamp's
own update.

### Ed25519: the ISO/TS 32002 declaration

EdDSA signatures come from ISO/TS 32002, which requires "PDF documents
using enhancements described in this document" to declare it in the
Catalog (ISO/TS 32002 §4). For `algorithm: 'ed25519'`, at every level and
with every `subFilter`, the signing update therefore also re-emits the
Catalog under its own number with:

- `/Extensions` holding the prefix `ISO_` → a developer extensions
  dictionary (ISO 32000-2 §7.12.3) with exactly `/Type /DeveloperExtensions`,
  `/BaseVersion /2.0`, `/ExtensionLevel 32002`, `/ExtensionRevision (:2022)`
  and `/URL (https://www.iso.org/standard/45875.html)`;
- `/Version /2.0` when the document's effective version is below 2.0: the
  Catalog `/Version` name when there is one, else the header version
  (ISO 32000-2 §7.7.2, the entry exists so that an incremental update can
  raise the version; ISO/TS 32002 Table 2 marks EdDSA as PDF 2.x). A PDF 2.0
  document gets no `/Version` entry. A `/Version` that is not a name counts
  as absent.

The declaration is merged with what the document already has (ISO 32000-2
§7.12.2: the value of a prefix is a developer extensions dictionary or an
array of them):

| Existing `/Extensions` | Result |
|------------------------|--------|
| absent | `<< /ISO_ ext >>` |
| present, no `ISO_` | `ISO_` added; the other prefixes (`ADBE_`, …) kept |
| `ISO_` a dictionary at `/ExtensionLevel 32002` | unchanged — signing an already declared document again adds nothing |
| `ISO_` a dictionary at another level | `ISO_` becomes the array `[existing ext]` |
| `ISO_` an array | `ext` appended, unless an element is already at level 32002 |
| any of these held by an indirect reference | resolved; the merged result is written as a direct dictionary in the Catalog, the referenced object stays in the file, no longer referenced by it |
| any other shape (`/Extensions 5`, an `ISO_` string, an array element that is not a dictionary) | `pdf/sign/bad-extensions`, nothing written |

The Catalog is re-emitted whenever the declaration or the version changes
it, including when the `/AcroForm` is indirect (otherwise the signature
field alone does not touch the Catalog); every other Catalog entry is
copied as it is. The `LT` and `LTA` updates copy the Catalog, so the
declaration stays in the newest Catalog. ECDSA and RSA-PSS signatures do
not touch `/Extensions` or `/Version`.

**Viewers.** Adobe Acrobat Reader does not validate Ed25519 (EdDSA)
signatures: it reports an error about the formatting of the signature,
with or without the declaration, and also on an Ed25519 signature produced
by OpenSSL (measured 2026-10-05). OpenSSL 3.5 and later verify them
(`openssl cms -verify`). Use ECDSA P-256 where Acrobat interoperability
matters — see the [PAdES guide](../../guide/pades-integration.md).

### Encrypted base

A base whose trailer carries `/Encrypt` gets the same field, with its
field name encrypted:

- **Password.** `opts.password` is required. It may be the owner or the
  user password, and `''` is a valid empty user password. The document key
  is derived from it through the standard security handler, once per
  `sign()` call and before anything is written.
- **Permissions.** With the user password, `/P` must grant bit 4 (modify)
  and bit 6 (annotations and form fields), ISO 32000-2 Table 22. The owner
  password is not checked against `/P`.
- **Supported encryption.** AES only, for both the string and the stream
  crypt filters: V=4 R=4 with `AESV2`, V=5 R=5 and V=5 R=6 with `AESV3`.
  RC4 (V below 4, or a `/V2` crypt filter), AES-GCM (`AESV4`, ISO/TS
  32003) and any handler other than `/Standard` are refused with a typed
  error. Nothing is ever signed without its field.
- **What is encrypted.** The new field's `/T` is encrypted with the string
  crypt filter, keyed by the field's own object number, behind a fresh
  16-byte IV from `opts.randomBytes` (default `crypto.getRandomValues`).
  When the string filter is `Identity`, the name is written in clear.
  The signature dictionary's `/Contents` is never encrypted (ISO 32000-2
  §7.6.2), and `/ByteRange` holds integers. Re-emitted objects (Catalog,
  page 1, `/AcroForm`, `/Fields`) keep their number and generation, so the
  encrypted strings they already held keep their key.
- **Ed25519 declaration.** The two new strings of the ISO/TS 32002
  dictionary (`/ExtensionRevision`, `/URL`) are encrypted with the string
  crypt filter under the Catalog's object number and generation, each
  behind a fresh IV; names and integers are never encrypted. The strings
  of an indirect `/Extensions` value that is inlined into the Catalog are
  decrypted under their former object and encrypted again under the
  Catalog's, since the V=4 key depends on the object number.
- **Trailer.** Every incremental update written over an encrypted base
  repeats the base's `/Encrypt` in its trailer or cross-reference stream
  dictionary (ISO 32000-2 §7.5.6).
- **Levels LT and LTA.** Levels LT and LTA are supported on an encrypted
  base. The DSS certificate, OCSP and CRL streams, any VRI timestamp
  stream and the VRI `/TU` string are encrypted with the document key
  (stream and string crypt filters of the base's `/Encrypt`), as is the
  DocTimeStamp field's `/T`. Each of these strings and streams gets its
  own fresh 16-byte IV from `opts.randomBytes`. The hexadecimal
  `/Contents` of the `/Sig` and `/DocTimeStamp` dictionaries is never
  encrypted (ISO 32000-2 §7.6.2). Every incremental update repeats the
  base's `/Encrypt` (§7.5.6). Copied objects (Catalog, page, AcroForm)
  keep their existing ciphertext under their own object numbers.

To pick a field name that is not taken yet, the existing root field names
are decrypted first.

### Signed attributes

When signed attributes are emitted (levels T, LT and LTA, or
`useSignedAttrs: true`), they are written in DER `SET OF` order. Each
attribute is encoded first. The encodings are then sorted as unsigned byte
strings, and an encoding that is a prefix of a longer one sorts first
(X.690 §11.6). The signature covers these sorted bytes (RFC 5652 §5.4).
A verifier that re-encodes the attributes before it checks the signature,
as OpenSSL does for Ed25519, therefore checks the bytes that were signed.
Signatures written in the earlier fixed order (contentType, messageDigest,
signingTime, signing-certificate-v2) still verify with `pdfSignature`,
which checks the attributes as received.

## Resolve

```js
const s = runtime.resolve('pdfSign');
// Returns: { sign, _buildPkcs7, _buildSignedAttrs, _sortDerSetOf,
//            _buildUnsignedAttrsTsa, _extractIssuerSerial,
//            _emitWithPlaceholder, _hashBytes, _toDer, HASH_TABLE }
```

The factory also returns internal helpers with a leading underscore,
exposed for white-box testing only — prefer `sign` for the stable contract.

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `sign` | `(pdfBytes: Uint8Array, opts: SignOpts) => Uint8Array` | The signed PDF bytes: the base kept verbatim plus one incremental update for the signature and its field, then one for the DSS (`LT`/`LTA`) and one for the DocTimeStamp and its field (`LTA`). |
| `HASH_TABLE` | `{ sha256, sha384, sha512 }` → `{ mod, oid, len }` | The supported digest algorithms, by `opts.hashAlg` name. |
| `_buildPkcs7` / `_buildSignedAttrs` / `_sortDerSetOf` / `_buildUnsignedAttrsTsa` / `_extractIssuerSerial` / `_emitWithPlaceholder` / `_hashBytes` / `_toDer` | internal helpers | Returned for white-box tests only; not a stable contract — use `sign`. |

### `SignOpts`

```js
{
    cert: Uint8Array | string,        // X.509 DER bytes or PEM string
    privateKey:                        // algorithm-specific:
        { n, e, d }                    //   RSA-PSS — Uint8Array each
      | { curve, secretKey }           //   ECDSA — ecc.curves.c256|c384|c521 + ecc.ecdsa.secretKey
      | Uint8Array,                    //   Ed25519 — 64 bytes (seed || pub)
    algorithm: 'rsa-pss' | 'ecdsa' | 'ed25519',
    hashAlg?: 'sha256' | 'sha384' | 'sha512',  // default 'sha256'; 'sha512' only (and default) for Ed25519
    level?: 'B' | 'T' | 'LT' | 'LTA',           // default 'B'
    subFilter?: string,                          // default 'adbe.pkcs7.detached'
    useSignedAttrs?: boolean,                    // default false for level 'B'
    placeholderBytes?: number,                   // default 8192
    docTimeStamp?: boolean,                      // internal — DocTimeStamp object emission
    signingTime?: Date,
    tsaSign?: (args: { digest, hashAlg }) => Uint8Array,  // required for T/LT/LTA
    dss?: { certs?, ocsps?, crls?, vri?, autoVri?, vriTime? },  // LT/LTA — see pdfDssBuilder
    docTimeStampPlaceholder?: number,            // LTA — default = placeholderBytes
    password?: string | Uint8Array,              // encrypted base: owner or user password ('' = empty user password)
    randomBytes?: (n: number) => Uint8Array      // encrypted base: IV source (field names, DSS strings and streams), default crypto.getRandomValues
}
```

## Examples

### Level B — RSA-PSS, PAdES `SubFilter`

```js
const s = runtime.resolve('pdfSign');
const signed = s.sign(pdfBytes, {
    cert, privateKey: { n, e, d },
    algorithm: 'rsa-pss', hashAlg: 'sha256',
    subFilter: 'ETSI.CAdES.detached'   // required for PAdES — not the default
});
```

### Level T — with a timestamp authority callback

```js
const signed = s.sign(pdfBytes, {
    cert, privateKey, algorithm: 'ecdsa',
    level: 'T',
    tsaSign: ({ digest, hashAlg }) => callRealTsa(digest, hashAlg) // returns RFC 3161 TimeStampToken DER
});
```

### Level LTA — full chain with DSS + DocTimeStamp

```js
const signed = s.sign(pdfBytes, {
    cert, privateKey, algorithm: 'ed25519',
    level: 'LTA',
    tsaSign: myTsaCallback,
    dss: { certs: [leafDer, caDer], ocsps: [ocspDer], autoVri: true }
});
```

## Errors

Raised as `ContractError` unless noted.

| Code | When |
|------|------|
| `pdf/sign/bad-input` | `pdfBytes` not `Uint8Array`, or a cert/privateKey argument neither `Uint8Array` nor PEM string. |
| `pdf/sign/bad-opts` | `opts` missing or not an object. |
| `pdf/sign/level-not-implemented` | `opts.level` outside `B`/`T`/`LT`/`LTA`. |
| `pdf/sign/no-dss-builder` | Level `LT`/`LTA` requested without `pdfDssBuilder` wired. |
| `pdf/sign/no-document-reader` | Any level requested without `pdfDocument` wired (the signature field needs the Catalog and page 1). |
| `pdf/sign/no-incremental-writer` | Any level requested without `pdfIncrementalWriter` wired. |
| `pdf/sign/no-algorithm` | `opts.algorithm` missing. |
| `pdf/sign/bad-hash-alg` | `opts.hashAlg` outside `sha256`/`sha384`/`sha512`. |
| `pdf/sign/ed25519-requires-sha512` | `algorithm: 'ed25519'` with an `opts.hashAlg` other than `sha512` (RFC 8419 §3.1); `context.hashAlg` names it. Omit `hashAlg` or pass `'sha512'`. |
| `pdf/sign/tsa-required-for-level-T` | Level `T`/`LT`/`LTA` without `opts.tsaSign`. |
| `pdf/sign/tsa-bad-result` / `tsa-bad-result-lta` | `tsaSign` did not return a `Uint8Array`. |
| `pdf/sign/cert-parse` | Cert DER doesn't parse as a valid X.509 SEQUENCE (issuer/serial extraction). |
| `pdf/sign/unknown-hash` / `unknown-sigalg` / `unknown-algorithm` | Unsupported `hashAlg`/`signatureAlg`/`algorithm` value reaching the PKCS#7 builder or signer dispatch. |
| `pdf/sign/no-startxref` / `bad-startxref` | Base `pdfBytes` has no (or an unparsable) `startxref` — required to append the placeholder signature object. |
| `pdf/sign/no-trailer` | No cross-reference section of the base supplies a usable `/Size` and `/Root`. |
| `pdf/incremental/hybrid-base` (`RenderError`) | The base is a hybrid-reference file; propagated from `pdfIncrementalWriter`, nothing written. `pdf/incremental/unsupported-base` likewise when `startxref` designates neither a table nor an xref stream. |
| `pdf/sign/br-placeholder-missing` / `br-overflow` | Internal `/ByteRange` / `/Contents` placeholder location or patching failed (should not occur in practice). |
| `pdf/sign/no-rsa` / `no-ecc` / `no-ed25519` (`EncryptionError`) | The matching fw crypto primitive (`rsa.pssSign`, `ecc.ecdsa`, `ed25519.sign`) is unavailable. |
| `pdf/sign/bad-rsa-key` / `bad-ecdsa-key` / `bad-ed25519-key` | `privateKey` shape doesn't match the selected `algorithm`. |
| `pdf/sign/rsa-failed` / `ed25519-failed` (`EncryptionError`) | The underlying fw signer returned `false`. |
| `pdf/sign/pkcs7-too-large` | The built PKCS#7 blob exceeds `placeholderBytes`. |
| `pdf/sign/hex-overflow` / `dts-hex-overflow` | PKCS#7 (or TimeStampToken) hex exceeds the reserved `/Contents` placeholder length. |
| `pdf/sign/tst-too-large` | LTA `DocTimeStamp` TimeStampToken exceeds its placeholder. |
| `pdf/sign/bad-extensions` | `algorithm: 'ed25519'` and the Catalog `/Extensions` (or its `ISO_` entry, or an element of an `ISO_` array) is not a dictionary, an array of dictionaries or a reference to one (ISO 32000-2 §7.12). `context: { shape }` names the offending value's type. Nothing is written. |
| `pdf/sign/catalog-not-found` | The trailer `/Root` does not resolve to a dictionary (signature field, or the LT/LTA Catalog update). |
| `pdf/sign/no-security-handler` | Encrypted base, and `pdfSecurity`, `pdfStandardV4`, `pdfStandardV5` or `pdfStandardV6` is not wired. |
| `pdf/sign/encrypted-password-required` | Encrypted base without `opts.password`. Pass `''` for an empty user password. |
| `pdf/sign/encrypted-bad-password` | `opts.password` is neither the owner nor the user password. The password is not echoed in the error. |
| `pdf/sign/encrypted-unsupported` | Encryption that cannot be signed: `context.filter` names a handler other than `Standard`; `context.reason` is `'rc4'` (V below 4, or a `/V2` crypt filter), `'aes-gcm'` (`AESV4`) or `'no-id'` (V=4 without a trailer `/ID`); `context.cause` carries the handler's error code for an unreadable or unsupported `/Encrypt`. |
| `pdf/sign/encrypted-permission-denied` | User password, and `/P` lacks bit 4 or bit 6. `context: { P, required: ['modify', 'annot'] }`. Use the owner password. |
| `pdf/sign/no-random` (`EncryptionError`) | Encrypted base, and neither `opts.randomBytes` nor `crypto.getRandomValues` is available for the IV. |

## See also

- [`pdfSignature`](./signature.md) — verify side (the counterpart this module's output is checked against).
- [`pdfDssBuilder`](./dss.md) — DSS construction for levels LT/LTA.
- [`pdfByteRange`](./byteRange.md) · [`pdfTimestamp`](./timestamp.md) · [`pdfCertChain`](./certChain.md)
- [`pdfIncrementalWriter`](../document/incrementalWriter.md) — underlying append mechanism for every level.
