---
module: asn1Oid
category: crypto/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# asn1Oid

> ASN.1 OID database — bidirectional name ↔ OID resolution, ≥ 180 entries.

**Module** `asn1Oid` | **Source** `packages/front/fw/src/crypto/utils/asn1-oid.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const oid = runtime.resolve('asn1Oid');
// Returns: { lookup, byName, findByCategory, OID_DATABASE }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `lookup` | `(oidStr: string) => OidEntry \| null` | OID entry or `null` if unknown / invalid |
| `byName` | `(name: string) => string \| null` | OID dotted-string or `null` |
| `findByCategory` | `(category: string) => Array<{ oid: string } & OidEntry>` | Array of entries (may be empty) |
| `OID_DATABASE` | `Record<string, OidEntry>` | Raw read-only catalogue |

### OidEntry

```ts
{
  name: string;       // canonical unique name (e.g. 'sha256WithRSAEncryption')
  shortName: string;  // abbreviation (e.g. 'sha256WithRSA')
  category: string;   // group (e.g. 'pkcs1', 'x509-dn', 'ecc-curve')
  // optional fields depending on category:
  hashAlg?: string;   // e.g. 'sha-256'
  sigAlg?: string;    // e.g. 'rsa', 'ecdsa', 'rsa-pss'
  curve?: string;     // e.g. 'P-256'
  keyLen?: number;    // e.g. 128, 256 (AES)
  mode?: string;      // e.g. 'cbc', 'gcm' (AES)
}
```

## Supported categories

| Category | Description | Examples |
|----------|-------------|---------|
| `pkcs1` | PKCS#1 RSA + ECDSA (RFC 8017, ANSI X9.62) | `rsaEncryption`, `sha256WithRSA`, `ecdsaWithSHA256` |
| `pkcs5` | PKCS#5 PBKDF2 / PBES2 (RFC 2898 / RFC 8018) | `pbkdf2`, `pbes2`, `pbeWithMD5AndDES` |
| `pkcs7` | PKCS#7 / CMS content types (RFC 2315 / RFC 5652) | `signedData`, `envelopedData`, `digestedData` |
| `pkcs9` | PKCS#9 signed attributes (RFC 2985) | `signingTime`, `messageDigest`, `contentType` |
| `pkcs12` | PKCS#12 bag types (RFC 7292) | `keyBag`, `certBag`, `pkcs8ShroudedKeyBag` |
| `digest` | Hash algorithms (RFC 1321, FIPS 180-4, FIPS 202) | `sha256`, `sha3-256`, `md5`, `hmacWithSHA256` |
| `x509-dn` | Distinguished Name attributes (ITU-T X.520, RFC 5280) | `CN`, `O`, `OU`, `C`, `L`, `ST` |
| `x509-extension` | Certificate extensions (RFC 5280) | `basicConstraints`, `keyUsage`, `subjectAltName`, `authorityKeyIdentifier` |
| `x509-eku` | Extended Key Usage values (RFC 5280 §4.2.1.12) | `serverAuth`, `clientAuth`, `codeSigning` |
| `pades` | PAdES / ETSI EN 319 142 / TS 102 778 | `pades-b`, `pades-t`, `sigPolicyId`, `commitmentType` |
| `ecc-curve` | Elliptic curves (ANSI X9.62, SEC2, RFC 5480) | `P-256`, `P-384`, `P-521`, `secp256k1`, `Ed25519` |
| `aes` | AES cipher OIDs (NIST / FIPS 197) | `aes128-CBC`, `aes256-GCM`, `aes128-wrap` |

**Total: ≥ 180 OIDs**

## Examples

```js
const oid = runtime.resolve('asn1Oid');

// OID → metadata
oid.lookup('1.2.840.113549.1.7.2');
// → { name: 'pkcs7-signedData', shortName: 'signedData', category: 'pkcs7' }

oid.lookup('1.2.840.113549.1.1.11');
// → { name: 'sha256WithRSAEncryption', shortName: 'sha256WithRSA',
//      category: 'pkcs1', hashAlg: 'sha-256', sigAlg: 'rsa' }

oid.lookup('9.9.9.9.9');
// → null  (unknown)

// name/shortName → OID (case-insensitive)
oid.byName('signedData');               // → '1.2.840.113549.1.7.2'
oid.byName('pkcs7-signedData');         // → '1.2.840.113549.1.7.2'  (same OID)
oid.byName('sha256WithRSAEncryption'); // → '1.2.840.113549.1.1.11'
oid.byName('CN');                       // → '2.5.4.3'

// Category
oid.findByCategory('ecc-curve');
// → [{ oid: '1.2.840.10045.3.1.7', name: 'prime256v1', shortName: 'P-256', ... }, ...]

// Raw catalogue
Object.keys(oid.OID_DATABASE).length; // ≥ 180
```

## Worker Usage

```js
const worker = fw.createWorker(workerFn, { modules: ['asn1Oid'] });
// asn1Oid uses no DOM API — natively worker-safe.
```

## Adding a new OID

Add an entry to the static `OID_DATABASE` (at the top of the source file):

```js
'1.2.3.4.5.6': {
    name: 'myAlgorithm',        // canonical name (unique in the DB)
    shortName: 'myAlg',         // short abbreviation
    category: 'pkcs1',          // existing or new category
    hashAlg: 'sha-256',         // optional field depending on usage
},
```

The key is the dotted OID string. The internal `_nameIndex` is rebuilt on each `factory()` call.

## Notes

- No npm or external dependency — the table is hand-built from public RFCs and specs.
- `lookup` and `byName` always return `null` for invalid or unknown input, never `throw`.
- `byName` is case-insensitive and accepts both the canonical `name` and the `shortName`.
- Duplicate entries in `_nameIndex` (shared `shortName` case) are overwritten deterministically following the iteration order of `OID_DATABASE`.

## See also

- [asn1](./asn1.md) — ASN.1 DER (X.690) parser whose semantic companion is `asn1Oid`
- [pem](./pem.md) — PEM encoding (BEGIN/END) used with X.509 certificates
- [keyformat](./keyformat.md) — EC/RSA/Ed key serialisation (PKCS#8 + SPKI)
