---
module: pdfTimestamp
category: pdf/sig
dependencies: [pdfErrors, pdfSigOids, asn1, rsa, ecc, ed25519, sha256, sha384, sha512]
returns: object
worker-safe: true
status: complete
---

# pdfTimestamp

> Document Timestamp + TSA tokens — ISO 32000-2 §12.8.5 / RFC 3161.

**Module** `pdfTimestamp` | **Source** `packages/front/office/pdf/src/sig/timestamp.js` | **Deps** `pdfErrors`, `pdfSigOids`, `asn1`, `rsa`, `ecc`, `ed25519`, `sha256`, `sha384`, `sha512` | **Worker-safe** yes

Parsing and verification of RFC 3161 Time-Stamp Authority tokens — used either as a standalone document timestamp (`SubFilter = ETSI.RFC3161`) or as an unsigned attribute of a signature for proof of existence. The module extracts `TSTInfo` (genTime, policy, messageImprint, serialNumber) and verifies the TSA signature against the embedded certificate.

## Resolve

```js
const ts = runtime.resolve('pdfTimestamp');
// Returns: { parseTimestampToken, verifyTimestamp,
//            extractTimestampFromUnsignedAttrs,
//            OID_TST_INFO, OID_AA_TIMESTAMP }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parseTimestampToken` | `(blob: Uint8Array, asn1Mod?) => TstInfo` | Decodes the RFC 3161 ContentInfo. |
| `verifyTimestamp` | `(blob: Uint8Array, fwBundle?) => VerifyResult` | Cryptographic verification. |
| `extractTimestampFromUnsignedAttrs` | `(signedAttrs, asn1Mod?) => Uint8Array \| null` | Looks up `id-aa-timeStampToken` (1.2.840.113549.1.9.16.2.14). |
| `OID_TST_INFO` | `string` (constant) | `id-ct-TSTInfo` OID (1.2.840.113549.1.9.16.1.4), used to validate `encapContentInfo`'s eContentType. |
| `OID_AA_TIMESTAMP` | `string` (constant) | `id-aa-timeStampToken` OID, used by `extractTimestampFromUnsignedAttrs`. |

### Shape `TstInfo`

```js
{
    version, policy: oid,
    serialNumber: Uint8Array,
    messageImprint: { hashAlg, hashedMessage: Uint8Array } | null,
    genTime: Date | null,
    nonce?: Uint8Array, tsa?: Uint8Array
}
```

## Examples

### Document timestamp

```js
const ts = runtime.resolve('pdfTimestamp');
const result = ts.verifyTimestamp(sig.contents);
result.valid;
result.tstInfo.genTime;     // Date — proof of existence
```

### Timestamp embedded in a signature

```js
const pk7 = runtime.resolve('pdfSignature').locatePkcs7(sig.contents);
const tsBytes = ts.extractTimestampFromUnsignedAttrs(pk7.signerInfo.unsignedAttrs);
if (tsBytes) {
    const tstInfo = ts.parseTimestampToken(tsBytes);
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/ts/bad-input` | `ParseError` | Argument is not a Uint8Array. |
| `pdf/ts/missing-fw` | `EncryptionError` | fw bundle incomplete. |
| `pdf/ts/malformed` | `ParseError` | Invalid ASN.1 structure (ContentInfo, SignedData, or top-level TSTInfo). |
| `pdf/ts/no-econtent` | `ParseError` | `encapContentInfo` has no `eContent`. |
| `pdf/ts/wrong-econtent` | `ParseError` | eContentType ≠ `id-ct-TSTInfo`. |
| `pdf/ts/no-tstinfo` | `ParseError` | TSTInfo not found inside eContent. |
| `pdf/ts/bad-tstinfo` | `ParseError` | Required fields missing or mistyped. |

## See also

- [`pdfSignature`](./signature.md) · [`pdfByteRange`](./byteRange.md) · [`pdfCertChain`](./certChain.md)
