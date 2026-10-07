---
module: pdfSigOids
category: pdf/sig
dependencies: [asn1Oid]
returns: object
worker-safe: true
status: complete
---

# pdfSigOids

> Shared OID dispatch tables for the `pdf/sig/*` family.

**Module** `pdfSigOids` | **Source** `packages/front/office/pdf/src/sig/oids.js` | **Deps** `asn1Oid` | **Worker-safe** yes

A thin adapter over fw's `asn1Oid` (`@awacloud/fw/crypto/utils/asn1-oid.js`) — the
canonical OID database (~150 entries: PKCS, X.509, CMS, JOSE, PAdES, ECC,
AES). This module does **not** duplicate that data; it filters and
normalises a subset into the dispatch semantics `signature.js`, `sign.js`,
`timestamp.js` and `certChain.js` need — mapping OIDs to fw module names or
PDF-domain dispatch labels. Adding or renaming an OID happens in fw's
`asn1Oid` database; this module only decides how to surface an entry to PDF
callers. Every table is rebuilt by filtering fw's database, so an OID fw
doesn't recognise is silently dropped rather than fabricated.

## Resolve

```js
const oids = runtime.resolve('pdfSigOids');
// Returns: { DIGEST_OIDS, SIG_DISPATCH_OIDS, KEY_ALG_OIDS, SIG_ALG_OIDS_VERBOSE,
//            OID_TST_INFO, OID_AA_TIMESTAMP,
//            lookupDigest, lookupSigAlg, lookupKeyAlg, lookupSigVerbose, shortOid }
```

## API

| Member | Shape | Description |
|--------|-------|--------------|
| `DIGEST_OIDS` | `Object.freeze({ [oid]: 'sha256'\|'sha384'\|'sha512'\|'sha1' })` | Digest OID → fw hash module name. |
| `SIG_DISPATCH_OIDS` | `Object.freeze({ [oid]: 'rsa'\|'rsa-pss'\|'ecc'\|'ed25519' })` | Signature-algorithm OID → fw verifier dispatch name (all PKCS#1 v1.5 RSA OIDs map to `'rsa'`). |
| `KEY_ALG_OIDS` | `Object.freeze({ [oid]: 'rsa'\|'ecc'\|'ed25519'\|'ed448' })` | SPKI base-algorithm OID (no hash suffix) → short algorithm name. |
| `SIG_ALG_OIDS_VERBOSE` | `Object.freeze({ [oid]: string })` | Certificate `sigAlgorithm` verbose name (e.g. `'sha256WithRSAEncryption'`, `'ecdsa-with-SHA256'`, `'rsassa-pss'`). |
| `OID_TST_INFO` | `string` | `id-ct-TSTInfo` (`1.2.840.113549.1.9.16.1.4`), RFC 3161. |
| `OID_AA_TIMESTAMP` | `string` | `id-aa-timeStampToken` (`1.2.840.113549.1.9.16.2.14`), RFC 3161. |
| `lookupDigest(oid)` | `(oid: string) => string \| null` | `DIGEST_OIDS[oid]` or `null`. |
| `lookupSigAlg(oid)` | `(oid: string) => string \| null` | `SIG_DISPATCH_OIDS[oid]` or `null`. |
| `lookupKeyAlg(oid)` | `(oid: string) => string \| null` | `KEY_ALG_OIDS[oid]` or `null`. |
| `lookupSigVerbose(oid)` | `(oid: string) => string \| null` | `SIG_ALG_OIDS_VERBOSE[oid]` or `null`. |
| `shortOid(oid)` | `(oid: string) => string` | DN attribute OID → short form (`'CN'`, `'O'`, `'OU'`, `'C'`, `'E'`…); falls back to the OID string itself when unrecognised. |

## Examples

### Resolving a certificate's signature algorithm

```js
const oids = runtime.resolve('pdfSigOids');
const dispatch = oids.lookupSigAlg('1.2.840.113549.1.1.11'); // 'rsa'
const verbose  = oids.lookupSigVerbose('1.2.840.113549.1.1.11'); // 'sha256WithRSAEncryption'
```

### Rendering a Distinguished Name

```js
const oids = runtime.resolve('pdfSigOids');
const parts = rdnAttributes.map(({ oid, value }) => `${oids.shortOid(oid)}=${value}`);
const dn = parts.join(', '); // e.g. 'CN=Example, O=Acme, C=FR'
```

## Errors

None — every lookup returns `null` (or falls back to the OID string, for
`shortOid`) rather than throwing on an unrecognised OID.

## See also

- [`pdfSignature`](./signature.md) · [`pdfSign`](./sign.md) · [`pdfTimestamp`](./timestamp.md) · [`pdfCertChain`](./certChain.md) — all consumers.
