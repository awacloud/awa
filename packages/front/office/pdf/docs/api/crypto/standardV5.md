---
module: pdfStandardV5
category: pdf/crypto
dependencies: [pdfErrors, aes, cbc, sha256, bitArray, pdfAesGcm]
returns: object
worker-safe: true
status: complete
---

# pdfStandardV5

> Standard Security Handler R=5 (historical AES-256, PDF 1.7 Adobe Extension Level 3).

**Module** `pdfStandardV5` | **Source** `packages/front/office/pdf/src/crypto/standardV5.js` | **Deps** `pdfErrors`, `aes`, `cbc`, `sha256`, `bitArray`, `pdfAesGcm` | **Worker-safe** yes

Implements the R=5 derivation: SHA-256 of password + validation salt → file encryption key via AES-CBC over `/OE`/`/UE`. This algorithm was deprecated by ISO 32000-2 in favor of R=6 hardening, but remains needed to read PDFs produced between 2009 and 2018. `pdfAesGcm` is an optional dependency, only required when a `/CF` crypt filter resolves to `AESV4` (ISO/TS 32003).

## Resolve

```js
const v5 = runtime.resolve('pdfStandardV5');
// Returns: { tryPassword, decryptString, decryptStream,
//            encryptString, encryptStream,
//            buildUUE, buildOOE, buildPerms }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `tryPassword` | `(typedEncrypt: { O, U, OE, UE }, password: string \| Uint8Array, isOwner: boolean) => { fileEncryptionKey: Uint8Array \| null }` | `null` on rejection. |
| `decryptString` | `(typedEncrypt: { method? }, fek, objNum, gen, ciphertext) => Uint8Array` | AES-256-CBC (or AES-GCM when `typedEncrypt.method === 'AESV4'`), §7.6.4. `objNum`/`gen` are accepted but unused (V5 keys are not per-object). |
| `decryptStream` | same signature as `decryptString` | Alias — identical implementation. |
| `encryptString` | `(typedEncrypt: { method? }, fek, objNum, gen, plaintext, iv) => Uint8Array` | Encrypts (write side). `iv` must be 16 bytes for AES-CBC or 12 bytes for AESV4. |
| `encryptStream` | same signature as `encryptString` | Alias — identical implementation. |
| `buildUUE` | `(password, fek, valSalt: Uint8Array, keySalt: Uint8Array) => { U: Uint8Array(48), UE: Uint8Array(32) }` | Builds `/U` + `/UE` per Algorithm 2.A. |
| `buildOOE` | `(password, fek, U48: Uint8Array, valSalt, keySalt) => { O: Uint8Array(48), OE: Uint8Array(32) }` | Builds `/O` + `/OE`. |
| `buildPerms` | `(p: number, fek, encryptMetadata: boolean, randomBytes: (n) => Uint8Array) => Uint8Array(16)` | Algorithm 10 — encrypted `/Perms` block. |

## Examples

### Owner then user password attempt

```js
const v5 = runtime.resolve('pdfStandardV5');
let r = v5.tryPassword(enc, ownerPwd, true);
if (!r.fileEncryptionKey) r = v5.tryPassword(enc, userPwd, false);
if (!r.fileEncryptionKey) throw new Error('bad password');
const plain = v5.decryptStream(enc, r.fileEncryptionKey, num, gen, encStream);
```

### Building a fresh `/O`, `/U`, `/OE`, `/UE` set (write side)

```js
const v5 = runtime.resolve('pdfStandardV5');
const { U, UE } = v5.buildUUE(userPwd, fek, valSalt, keySalt);
const { O, OE } = v5.buildOOE(ownerPwd, fek, U, valSalt2, keySalt2);
const permsBlock = v5.buildPerms(pBitmask, fek, true, cryptoRandomBytes);
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/crypto/v5/missing-fw` | `EncryptionError` | fw bundle incomplete (thrown at module construction). |
| `pdf/crypto/v5/bad-password` | `EncryptionError` | Invalid password argument. |
| `pdf/crypto/v5/bad-ciphertext-len` | `EncryptionError` | Length not a multiple of 16. |
| `pdf/crypto/v5/aes-schedule-failed` | `EncryptionError` | fw key schedule failed. |
| `pdf/crypto/v5/cbc-decrypt-failed` | `EncryptionError` | fw CBC decrypt failed. |
| `pdf/crypto/v5/bad-O-U` | `EncryptionError` | `/O` or `/U` not at least 48 bytes. |
| `pdf/crypto/v5/bad-OE-UE` | `EncryptionError` | `/OE` or `/UE` not exactly 32 bytes. |
| `pdf/crypto/v5/bad-string` | `EncryptionError` | Encrypted string shorter than 32 bytes (IV + 1 block). |
| `pdf/crypto/v5/missing-gcm` | `EncryptionError` | `method === 'AESV4'` requested but `pdfAesGcm` was not supplied. |
| `pdf/crypto/v5/bad-pt-len` | `EncryptionError` | Plaintext length not a multiple of 16 (`encryptString`/CBC path). |
| `pdf/crypto/v5/aes-encrypt-schedule` | `EncryptionError` | fw key schedule failed on the encrypt side. |
| `pdf/crypto/v5/cbc-encrypt-failed` | `EncryptionError` | fw CBC encrypt failed. |
| `pdf/crypto/v5/encrypt-bad-input` | `EncryptionError` | `encryptString` plaintext is not a Uint8Array. |
| `pdf/crypto/v5/encrypt-bad-iv` | `EncryptionError` | `iv` has the wrong length for the resolved method. |
| `pdf/crypto/v5/perms-schedule` | `EncryptionError` | AES-256-ECB schedule failed while building `/Perms`. |

## See also

- [`pdfStandardV6`](./standardV6.md) — recommended algorithm.
- [`pdfSecurity`](./security.md) · [`pdfPermissions`](./permissions.md) · [`pdfAesGcm`](./aesGcm.md)
