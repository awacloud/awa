# Digital Signatures — ISO 32000-2 §12.8

PKCS#7 detached + CAdES + RFC 3161 timestamps, generation (`pdfSign`) and verification (`pdfSignature`/`pdfTimestamp`/`pdfCertChain`), plus the PAdES-LT Document Security Store builder (`pdfDssBuilder`). Most modules are `fwModules` (fw-bound: `asn1`, `rsa`, `ecc`, `ed25519`, `sha256`, `sha384`, `sha512`, `bitArray`, `pem`); `pdfSigOids` and `pdfSha1` are lighter dispatch/legacy-hash helpers shared by the rest of the family.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [`pdfSignature`](./signature.md) | `{ typeSignature, verifySignature, verifyAllSignatures, verifyPk, locatePkcs7, DIGEST_OIDS, SIG_OIDS }` | `pdfErrors`, `pdfParser`, `pdfSigOids`, fw crypto | §12.8 + ISO TS 32001/32002 — verify. |
| [`pdfSign`](./sign.md) | `{ sign, HASH_TABLE, … }` (plus `_`-prefixed test helpers) | `pdfErrors`, `pdfSigOids`, `pdfByteRange`, `pdfDssBuilder`, `pdfIncrementalWriter`, `pdfParser`, `pdfDocument`, fw crypto | PAdES generation, levels B/T/LT/LTA. |
| [`pdfByteRange`](./byteRange.md) | `{ computeByteRange, extractSignedBytes, findContentsField, auditByteRange }` | `pdfErrors` | `/ByteRange` §12.8.1 + hardened audit. |
| [`pdfTimestamp`](./timestamp.md) | `{ parseTimestampToken, verifyTimestamp, extractTimestampFromUnsignedAttrs, OID_TST_INFO, OID_AA_TIMESTAMP }` | `pdfErrors`, `pdfSigOids`, fw crypto | RFC 3161 §12.8.5. |
| [`pdfCertChain`](./certChain.md) | `{ parseCertificate, extractCertsFromCms, extractCertFromPem, findIssuer, validateChainOrder }` | `pdfErrors`, `pdfSigOids`, fw `asn1`, `pem` | X.509 chain §12.8.3. |
| [`pdfDssBuilder`](./dss.md) | `{ buildDss }` | `pdfErrors`, `pdfSha1`, `bitArray` | PAdES-LT Document Security Store, §12.8.4.3. |
| [`pdfSigOids`](./oids.md) | `{ DIGEST_OIDS, SIG_DISPATCH_OIDS, KEY_ALG_OIDS, SIG_ALG_OIDS_VERBOSE, OID_TST_INFO, OID_AA_TIMESTAMP, lookupDigest, lookupSigAlg, lookupKeyAlg, lookupSigVerbose, shortOid }` | `asn1Oid` | Shared OID dispatch tables. |
| [`pdfSha1`](./sha1.md) | `{ fn, hash }` | `bitArray`, `utf8` | Legacy SHA-1 — DSS `/VRI` keys only. |

## Verification pattern

```js
const sig = runtime.resolve('pdfSignature');
const typed = sig.typeSignature(sigField.v);
const result = sig.verifySignature(typed, documentBytes, fwBundle);
// `result.verified` / `result.pkVerified` reflect the ACTUAL outcome of the
// public-key check (RSA-PSS / ECDSA / Ed25519) — the check is wired and
// executed by construction. There is no `pdf/sig/pk-verify-not-wired` code;
// a failed check surfaces a specific `errors[]` record instead (see
// `pdfSignature`'s Errors table).
```

## See also

- [`pdfSignatureField`](../form/signature.md) — carrier in the AcroForm.
- [Crypto](../crypto/README.md) — encryption (orthogonal).
