---
module: pdfPermissions
category: pdf/crypto
dependencies: [pdfErrors, aes]
returns: object
worker-safe: true
status: complete
---

# pdfPermissions

> `/P` decoding + `/Perms` verification — ISO 32000-2 §7.6.3.2 Table 22.

**Module** `pdfPermissions` | **Source** `packages/front/office/pdf/src/crypto/permissions.js` | **Deps** `pdfErrors`, `aes` | **Worker-safe** yes

The `/P` field is a signed 32-bit integer whose bits encode permissions (bit 3 = print, 4 = modify, 5 = copy/extract, 6 = annotate, 9 = fill forms, 10 = accessibility extraction, 11 = assemble, 12 = high-quality print). `verifyPermsField` decrypts the 16-byte `/Perms` string (AES-256-ECB with the FEK) and checks that it encodes the same `/P` — a de facto MAC protecting against post-encryption tampering.

## Resolve

```js
const perms = runtime.resolve('pdfPermissions');
// Returns: { decodePermissions, verifyPermsField }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `decodePermissions` | `(p: number) => PermFlags` | Decomposes `/P` into readable booleans. |
| `verifyPermsField` | `(typedEncrypt: { Perms }, fek: Uint8Array) => { ok, p, encryptMetadata }` | Verifies the `/Perms` MAC. |

### Shape `PermFlags`

```js
{
    raw: number,
    print: boolean,             // bit 3
    modify: boolean,            // bit 4
    copy: boolean,               // bit 5
    annot: boolean,              // bit 6
    formFill: boolean,           // bit 9
    accessible: boolean,         // bit 10 — accessibility extraction
    assemble: boolean,           // bit 11
    printHighQuality: boolean    // bit 12
}
```

## Examples

### Decoding the flags

```js
const p = runtime.resolve('pdfPermissions').decodePermissions(enc.P);
if (!p.copy) viewer.disableTextSelection();
```

### MAC verification

```js
const v = perms.verifyPermsField(enc, fek);
if (!v.ok) throw new Error('permissions tampered');
v.encryptMetadata === enc.EncryptMetadata;
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/crypto/permissions/bad-input` | `EncryptionError` | `p` argument is not an integer. |
| `pdf/crypto/permissions/missing-fw` | `EncryptionError` | fw bundle incomplete (thrown at module construction). |
| `pdf/crypto/permissions/missing-perms` | `EncryptionError` | `/Perms` absent. |
| `pdf/crypto/permissions/bad-perms-length` | `EncryptionError` | `/Perms` ≠ 16 bytes. |
| `pdf/crypto/permissions/bad-fek` | `EncryptionError` | FEK ≠ 32 bytes. |
| `pdf/crypto/permissions/aes-schedule-failed` | `EncryptionError` | Key schedule failed. |
| `pdf/crypto/permissions/aes-decrypt-failed` | `EncryptionError` | Block decryption failed. |

## See also

- [`pdfSecurity`](./security.md) · [`pdfStandardV5`](./standardV5.md) · [`pdfStandardV6`](./standardV6.md)
