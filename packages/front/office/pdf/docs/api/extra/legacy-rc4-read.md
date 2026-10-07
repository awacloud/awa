---
module: pdfLegacyRc4Read
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfLegacyRc4Read

> RC4 v2/v3 password validation + stream decrypt, read-only — legacy.

**Module** `pdfLegacyRc4Read` | **Source** `packages/front/office/pdf/src/extra/legacy-rc4-read.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Implements the RC4 stream cipher locally plus the read side of the Standard Security Handler PDF 1.7 §7.6.3.3-4: 40-bit RC4 (revision 2, V=1) and 128-bit RC4 (revision 3, V=2), password validation against `/O`/`/U`, per-object key derivation (file-key ‖ objectId/MD5) for `/Encrypt V <= 2`. PDF 2.0 forbids RC4 on write; this module is intentionally read-only.

## Resolve

```js
const ext = runtime.resolve('pdfLegacyRc4Read');
// Returns: { rc4, md5, padPassword, computeFileKey, computeU,
//   validateUserPassword, objectKey, decryptString,
//   decryptStream, PASSWORD_PADDING }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `rc4` | `(key: Uint8Array, data: Uint8Array) => Uint8Array` | Stream cipher. |
| `md5` | `(bytes) => Uint8Array(16)` | Hash. |
| `padPassword` | `(password) => Uint8Array(32)` | §7.6.3.3 step 1. |
| `computeFileKey` | `(password, params: { O, P, idFirst, revision, keyLength, encryptMetadata }) => Uint8Array` | File-key derivation, §7.6.3.3 Algorithm 2. |
| `computeU` | `(fileKey, idFirst, revision) => Uint8Array` | Computes the `/U` value. |
| `validateUserPassword` | `(password, params: { O, P, idFirst, revision, keyLength, encryptMetadata, U }) => { ok: true, fileKey } \| { ok: false }` | |
| `objectKey` | `(fileKey, objNum, gen) => Uint8Array` | Per-object key. |
| `decryptString` / `decryptStream` | `(fileKey, objNum, gen, bytes) => Uint8Array` | |
| `PASSWORD_PADDING` | `Uint8Array(32)` | Padding constant, §7.6.3.3. |

## Examples

### Validate a password

```js
const ext = runtime.resolve('pdfLegacyRc4Read');
const r = ext.validateUserPassword('', {
    O, P, idFirst, revision: 3, keyLength: 128, encryptMetadata: true, U
});
if (!r.ok) throw new Error('wrong password');
const fileKey = r.fileKey;
```

### Decrypt a stream

```js
const plain = ext.decryptStream(fileKey, 5, 0, encStreamBytes);
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/rc4/bad-input` | `EncryptionError` | `rc4` arguments invalid. |
| `pdf/md5/bad-input` | `EncryptionError` | `md5` input is not a Uint8Array. |
| `pdf/rc4/bad-password` | `EncryptionError` | Password/pad input invalid. |
| `pdf/rc4/bad-O` | `EncryptionError` | `/O` invalid (must be a 32-byte Uint8Array). |
| `pdf/rc4/bad-id` | `EncryptionError` | `/ID` first element missing/invalid. |

## See also

- [`pdfStandardV5`](../crypto/standardV5.md)
- [`pdfSecurity`](../crypto/security.md)
- [Extras index](./README.md)
