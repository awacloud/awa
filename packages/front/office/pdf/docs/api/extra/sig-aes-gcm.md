---
module: pdfSigAesGcm
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfSigAesGcm

> AES-GCM crypt filter (`/CFM /AESV4`) — ISO/TS 32003.

**Module** `pdfSigAesGcm` | **Source** `packages/front/office/pdf/src/extra/sig-aes-gcm.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

TS 32003 adds `/CFM /AESV4` (AES-256 GCM) to the Standard Security Handler v6. Wire format: `IV (12) ‖ ciphertext ‖ tag (16)`. This module inspects an `/Encrypt` dict, locates the CF entries, and surfaces a typed view identifying GCM crypt filters.

## Resolve

```js
const ext = runtime.resolve('pdfSigAesGcm');
// Returns: { typeEncryptForGcm, typeCfEntry, validateGcmFraming, CFM_CATALOG }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeEncryptForGcm` | `(encryptDict) => { v, r, length, stmF, strF, eff, cf, hasAesGcm, raw, _extras }` | GCM-focused view. |
| `typeCfEntry` | `(dict) => { cfm, authEvent, length, catalog, raw, _extras }` | A single `/CF` entry. |
| `validateGcmFraming` | `(Uint8Array) => { iv, ciphertext, tag }` | Splits the TS 32003 framing. |
| `CFM_CATALOG` | frozen catalog | CFM name → `{ cipher, keyBits, mode?, notes }`. |

## Examples

### Detect AES-GCM

```js
const ext = runtime.resolve('pdfSigAesGcm');
const e = ext.typeEncryptForGcm(encryptDict);
e.hasAesGcm;        // true
e.cf.StdCF.cfm;     // 'AESV4'
```

### Split a framed buffer

```js
const f = ext.validateGcmFraming(framedBytes);
f.iv.length;   // 12
f.tag.length;  // 16
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/sig-aes-gcm/not-dict` | `ParseError` | encryptDict is not a dict. |
| `pdf/extra/sig-aes-gcm/bad-cf` | `ParseError` | `/CF` is not a dict. |
| `pdf/extra/sig-aes-gcm/bad-cf-entry` | `ParseError` | A CF entry is not a dict. |
| `pdf/extra/sig-aes-gcm/cf-entry-not-dict` | `ParseError` | `typeCfEntry` argument is not a dict. |
| `pdf/extra/sig-aes-gcm/bad-input` | `EncryptionError` | Framing input is not a Uint8Array. |
| `pdf/extra/sig-aes-gcm/too-short` | `EncryptionError` | Framed buffer is under 28 bytes. |

## See also

- [`pdfStandardV6`](../crypto/standardV6.md)
- [`pdfAesGcm`](../crypto/aesGcm.md)
- [`pdfSigPades`](./sig-pades.md)
- [Extras index](./README.md)
