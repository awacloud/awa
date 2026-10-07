---
module: pdfCertChain
category: pdf/sig
dependencies: [pdfErrors, pdfSigOids, asn1, pem]
returns: object
worker-safe: true
status: complete
---

# pdfCertChain

> X.509 chain extraction and ordering — ISO 32000-2 §12.8.3.

**Module** `pdfCertChain` | **Source** `packages/front/office/pdf/src/sig/certChain.js` | **Deps** `pdfErrors`, `pdfSigOids`, `asn1`, `pem` | **Worker-safe** yes

Parses the DER certificates embedded in a CMS blob (signature or timestamp), extracts `tbsCertificate` (issuer, subject, validity, subjectPublicKeyInfo), finds the issuer within a set of candidates, and validates chain ordering (leaf → CA → root). Performs **no** trust validation (no trust-anchor evaluation, no CRL/OCSP) — that is left to the caller.

## Resolve

```js
const cc = runtime.resolve('pdfCertChain');
// Returns: { parseCertificate, extractCertsFromCms, extractCertFromPem,
//            findIssuer, validateChainOrder }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parseCertificate` | `(der: Uint8Array, asn1Mod?) => Cert` | Decodes tbsCertificate. |
| `extractCertsFromCms` | `(blob, asn1Mod?, opts?) => Cert[]` | Looks up the SignedData's `certificates [0]` field; malformed certs are skipped and reported via `opts.warnings` if supplied. |
| `extractCertFromPem` | `(pemString, pemMod?, asn1Mod?) => Cert` | Decodes a single PEM certificate. |
| `findIssuer` | `(cert, candidates) => Cert \| null` | Matches by `candidate.subject === cert.issuer`. |
| `validateChainOrder` | `(chain: Cert[]) => { valid: boolean, errors: object[] }` | Checks ordering (each cert's `issuer` must equal the next cert's `subject`). |

### Shape `Cert`

```js
{
    version, serialNumber: Uint8Array,
    issuer: string, subject: string,      // rendered RDN sequences
    notBefore: Date | null, notAfter: Date | null,
    publicKey: Uint8Array,                // raw SPKI BIT STRING value
    keyAlgorithm: string, sigAlgorithm: string,
    raw: Uint8Array                        // full certificate DER
}
```

## Examples

### Extraction and sort

```js
const cc = runtime.resolve('pdfCertChain');
const certs = cc.extractCertsFromCms(sig.contents);
const leaf  = certs.find((c) => c.subject === pkcs7SignerSubject);
const issuer = cc.findIssuer(leaf, certs);
```

### Order validation

```js
const ok = cc.validateChainOrder([leaf, issuer, root]);
if (!ok.valid) console.warn(ok.errors);
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/cert/malformed` | `ParseError` | Invalid ASN.1. |
| `pdf/cert/short` | `ParseError` | DER too short. |
| `pdf/cert/bad-tbs` | `ParseError` | Malformed tbsCertificate. |
| `pdf/cert/bad-input` | `ParseError` | `extractCertsFromCms` received a non-Uint8Array. |
| `pdf/cert/missing-fw` | `EncryptionError` | `asn1` bundle missing. |
| `pdf/cert/bad-pem-input` | `ParseError` | PEM argument is not a string. |
| `pdf/cert/missing-pem` | `EncryptionError` | `pem` provider not supplied. |
| `pdf/cert/pem-decode-failed` | `ParseError` | Malformed PEM. |
| `pdf/cert/empty-chain` | record `errors[]` | `validateChainOrder` received a non-array or empty chain. |
| `pdf/cert/chain-break` | record `errors[]` | A cert's `issuer` does not equal the next cert's `subject`. |

## See also

- [`pdfSignature`](./signature.md) · [`pdfTimestamp`](./timestamp.md)
