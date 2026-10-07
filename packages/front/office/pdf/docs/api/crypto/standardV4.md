---
module: pdfStandardV4
category: pdf/crypto
dependencies: [pdfErrors, aes, cbc, bitArray]
returns: object
worker-safe: true
status: complete
---

# pdfStandardV4

> Standard Security Handler V=4, R=4 — PDF 1.6 legacy (RC4-128 / AES-128-CBC).

**Module** `pdfStandardV4` | **Source** `packages/front/office/pdf/src/crypto/standardV4.js` | **Deps** `pdfErrors`, `aes`, `cbc`, `bitArray` | **Worker-safe** yes

Implements ISO 32000-1 §7.6.3 Algorithm 2 (128-bit file-key derivation, 50
rounds of MD5), Algorithm 3 (`/O`), Algorithm 5 (`/U`), and per-object key
derivation for the two V=4 crypt filter methods selectable via `/CF /StdCF`:

- **AESV2** — AES-128-CBC; per-object key = `MD5(fileKey ‖ objId(3 LE) ‖ gen(2 LE) ‖ "sAlT")`
  truncated to `min(fileKey.len + 5, 16)`; ciphertext is IV-prefixed, PKCS#7 padded.
- **V2** — RC4-128; per-object key = `MD5(fileKey ‖ objId(3 LE) ‖ gen(2 LE))` truncated the same way.

MD5 and RC4 are implemented locally (this handler predates fw's hash/cipher
family and both primitives are legacy-only) — `aes`/`cbc` are the only fw
crypto deps, for the AESV2 path.

## Resolve

```js
const v4 = runtime.resolve('pdfStandardV4');
// Returns: { tryPassword, decryptString, decryptStream,
//            decryptEmbeddedFile, encryptEmbeddedFile,
//            encryptString, encryptStream,
//            buildOU, buildPerms,
//            computeFileKey, computeU, computeO,
//            objectKey, rc4, md5, padPassword, PASSWORD_PADDING }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `tryPassword` | `(typedEncrypt: { O, U, P, idFirst, EncryptMetadata? }, password, isOwner: boolean) => { fileEncryptionKey: Uint8Array \| null }` | `null` FEK on rejection; recovers the user password from `/O` first when `isOwner`. |
| `decryptString` | `(typedEncrypt: { method }, fek, objNum, gen, ciphertext) => Uint8Array` | Dispatches on `typedEncrypt.method` (`'AESV2'` or `'V2'`/`'RC4'`). |
| `decryptStream` | same signature as `decryptString` | Alias — identical implementation. |
| `decryptEmbeddedFile` | same signature as `decryptString` | Alias for the `/EFF`-resolved method (ISO 32000-1 §7.6.5). |
| `encryptString` | `(typedEncrypt: { method }, fek, objNum, gen, plaintext, iv?) => Uint8Array` | `iv` (16 bytes) required for `'AESV2'`; ignored for RC4. |
| `encryptStream` | same signature as `encryptString` | Alias — identical implementation. |
| `encryptEmbeddedFile` | same signature as `encryptString` | Alias for the `/EFF` write path. |
| `buildOU` | `(ownerPassword, userPassword, P, idFirst: Uint8Array, encryptMetadata) => { O, U, fek }` | Builds a fresh `/O` + `/U` pair and the derived 16-byte file key. |
| `buildPerms` | `() => null` | No-op — `/Perms` (Algorithm 8) is V≥5 only; kept for handler-dispatch symmetry with V5/V6. |
| `computeFileKey` / `computeU` / `computeO` | internal Algorithm 2/5/3 primitives | Exposed for testing/interop. |
| `objectKey` | `(fileKey, objNum, gen, isAes: boolean) => Uint8Array` | Per-object key derivation. |
| `rc4` / `md5` | stream-cipher / hash primitives | Exposed for testing. |
| `padPassword` | `(password: string \| Uint8Array) => Uint8Array` | The 32-byte padded password of Algorithm 2 step (a). Exposed for testing/interop. |
| `PASSWORD_PADDING` | `Uint8Array` (32 bytes) | The Algorithm 2 padding string. |

## Examples

### Password check then decrypt (read side)

```js
const v4 = runtime.resolve('pdfStandardV4');
const r = v4.tryPassword(
    { O, U, P, idFirst, EncryptMetadata: true }, 'user', false);
if (!r.fileEncryptionKey) throw new Error('bad password');
const plain = v4.decryptStream(
    { method: 'AESV2' }, r.fileEncryptionKey, objNum, gen, encryptedBytes);
```

### Building `/O` + `/U` for a fresh document (write side)

```js
const v4 = runtime.resolve('pdfStandardV4');
const { O, U, fek } = v4.buildOU('owner', 'user', -4, idFirst, true);
```

This is the handler `pdfEncryptedWriter` selects internally for `version: 4, revision: 4`.

## Errors

All thrown as `EncryptionError`.

| Code | When |
|------|------|
| `pdf/crypto/v4/missing-fw` | `aes`/`cbc`/`bitArray` fw modules unavailable (thrown at module construction). |
| `pdf/crypto/v4/bad-password` | Password argument is neither `string` nor `Uint8Array`. |
| `pdf/crypto/v4/bad-O` | `/O` is not a 32-byte `Uint8Array` (`computeFileKey`). |
| `pdf/crypto/v4/bad-id` | First `/ID` element missing/invalid (`computeFileKey`, `buildOU`). |
| `pdf/crypto/v4/bad-O-U` | `/O` or `/U` not exactly 32 bytes (`tryPassword`). |
| `pdf/crypto/v4/bad-string` | AESV2 ciphertext shorter than 16 bytes (missing IV). |
| `pdf/crypto/v4/bad-method` | `method` neither `'AESV2'` nor `'V2'`/`'RC4'` (decrypt or encrypt side). |
| `pdf/crypto/v4/encrypt-bad-input` | `encryptString` plaintext is not a `Uint8Array`. |
| `pdf/crypto/v4/encrypt-bad-iv` | AESV2 encrypt `iv` is not exactly 16 bytes. |
| `pdf/crypto/v4/bad-ciphertext-len` / `bad-pt-len` | AES-CBC input length not a multiple of 16. |
| `pdf/crypto/v4/aes-schedule-failed` / `aes-encrypt-schedule` | fw AES-128 key schedule failed. |
| `pdf/crypto/v4/cbc-decrypt-failed` / `cbc-encrypt-failed` | fw CBC operation failed. |

## See also

- [`pdfEncryptedWriter`](../document/encryptedWriter.md) — selects this handler for `version: 4`.
- [`pdfStandardV5`](./standardV5.md) · [`pdfStandardV6`](./standardV6.md) — modern (V=5) handlers.
- [`pdfSecurity`](./security.md) — read-side dispatch.
