# Crypto — ISO 32000-2 §7.6 + ISO TS 32003

Encryption handlers and permissions. All modules are `fwModules`; the handlers' fw-crypto deps resolve from `@awacloud/fw/crypto`.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [`pdfSecurity`](./security.md) | `{ typeEncryptDict, selectHandler, isEmbeddedFileStream, dispatchDecryptStream }` | `pdfErrors` | Dispatch, §7.6.2. |
| [`pdfStandardV4`](./standardV4.md) | `{ tryPassword, decryptString, decryptStream, decryptEmbeddedFile, encryptEmbeddedFile, encryptString, encryptStream, buildOU, buildPerms, computeFileKey, computeU, computeO, objectKey, rc4, md5, padPassword, PASSWORD_PADDING }` | `pdfErrors`, `aes`, `cbc`, `bitArray` | PDF 1.6 legacy — RC4-128 / AES-128-CBC. |
| [`pdfStandardV5`](./standardV5.md) | `{ tryPassword, decryptString, decryptStream, encryptString, encryptStream, buildUUE, buildOOE, buildPerms }` | `pdfErrors`, fw crypto, `pdfAesGcm`? | Historical R=5 AES-256. |
| [`pdfStandardV6`](./standardV6.md) | `{ tryPassword, decryptString, decryptStream, encryptString, encryptStream, buildUUE, buildOOE, buildPerms }` | `pdfErrors`, fw crypto, `pdfAesGcm`? | R=6 hardening, §7.6.4. |
| [`pdfPermissions`](./permissions.md) | `{ decodePermissions, verifyPermsField }` | `pdfErrors`, fw `aes` | `/P` + `/Perms` MAC. |
| [`pdfAesGcm`](./aesGcm.md) | `{ encryptObjectGcm, decryptObjectGcm }` | `pdfErrors`, fw `aes`, `gcm`, `bitArray` | AES-GCM (ISO TS 32003). |

## Decryption pattern

```js
const sec  = runtime.resolve('pdfSecurity');
const enc  = sec.typeEncryptDict(trailer.encrypt);
const selection = sec.selectHandler(enc, {
    v5: runtime.resolve('pdfStandardV5'),
    v6: runtime.resolve('pdfStandardV6')
});
const { fileEncryptionKey } = selection.handler.tryPassword(enc, password, false);
```

## See also

- [`pdfTrailer`](../syntax/trailer.md) — carrier of the `/Encrypt` dict.
- [Signature](../sig/README.md) — orthogonal to the encryption handlers.
