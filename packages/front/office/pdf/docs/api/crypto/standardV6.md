---
module: pdfStandardV6
category: pdf/crypto
dependencies: [pdfErrors, aes, cbc, sha256, sha384, sha512, bitArray, pdfAesGcm]
returns: object
worker-safe: true
status: complete
---

# pdfStandardV6

> Standard Security Handler R=6 — AES-256 + hardening — ISO 32000-2 §7.6.4.

**Module** `pdfStandardV6` | **Source** `packages/front/office/pdf/src/crypto/standardV6.js` | **Deps** `pdfErrors`, `aes`, `cbc`, `sha256`, `sha384`, `sha512`, `bitArray`, `pdfAesGcm` | **Worker-safe** yes

Implements Algorithm 2.B (Annex A): 64+ rounds of SHA-{256/384/512} over password + salt (+ extra), resistant to brute-force/rainbow-table attacks. Which hash function runs at each round depends on the remainder mod 3 of the last byte of the round's AES-CBC output (`hardening-runaway` bounds the loop at 1024 rounds). String/stream decryption shape is identical to V5 (IV-prefixed AES-256-CBC, no per-object rekeying); `pdfAesGcm` is optional, only required for `AESV4` (ISO/TS 32003).

## Resolve

```js
const v6 = runtime.resolve('pdfStandardV6');
// Returns: { tryPassword, decryptString, decryptStream,
//            encryptString, encryptStream,
//            buildUUE, buildOOE, buildPerms }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `tryPassword` | `(typedEncrypt: { O, U, OE, UE }, password, isOwner: boolean) => { fileEncryptionKey: Uint8Array \| null }` | `null` = rejected (try the next password). |
| `decryptString` | `(typedEncrypt: { method? }, fek, objNum, gen, ciphertext) => Uint8Array` | AES-256-CBC (or AES-GCM for `method === 'AESV4'`). |
| `decryptStream` | same signature as `decryptString` | Alias — identical implementation. |
| `encryptString` | `(typedEncrypt: { method? }, fek, objNum, gen, plaintext, iv) => Uint8Array` | Encrypts (write side). `iv`: 16 bytes CBC / 12 bytes AESV4. |
| `encryptStream` | same signature as `encryptString` | Alias — identical implementation. |
| `buildUUE` | `(password, fek, valSalt, keySalt) => { U: Uint8Array(48), UE: Uint8Array(32) }` | Algorithm 8 / 2.B with hardening. |
| `buildOOE` | `(password, fek, U48, valSalt, keySalt) => { O: Uint8Array(48), OE: Uint8Array(32) }` | Same, owner side. |
| `buildPerms` | `(p: number, fek, encryptMetadata: boolean, randomBytes: (n) => Uint8Array) => Uint8Array(16)` | Algorithm 10 — encrypted `/Perms` block. |

## Examples

### Full decryption

```js
const v6 = runtime.resolve('pdfStandardV6');
const r = v6.tryPassword(enc, userPwd, false);
if (!r.fileEncryptionKey) throw new Error('rejected');
for (const obj of doc._raw.encryptedStreams) {
    obj.plain = v6.decryptStream(enc, r.fileEncryptionKey, obj.num, obj.gen, obj.raw);
}
```

### Permission validation

```js
const perms = runtime.resolve('pdfPermissions');
const ok = perms.verifyPermsField(enc, r.fileEncryptionKey);
ok.encryptMetadata === enc.EncryptMetadata;
```

### Building a fresh handler set (write side)

```js
const v6 = runtime.resolve('pdfStandardV6');
const { U, UE } = v6.buildUUE(userPwd, fek, valSalt, keySalt);
const { O, OE } = v6.buildOOE(ownerPwd, fek, U, valSalt2, keySalt2);
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/crypto/v6/missing-fw` | `EncryptionError` | fw bundle incomplete (thrown at module construction). |
| `pdf/crypto/v6/bad-password` | `EncryptionError` | Invalid password argument. |
| `pdf/crypto/v6/bad-pt-len` | `EncryptionError` | Plaintext length not a multiple of 16. |
| `pdf/crypto/v6/aes-schedule-failed` | `EncryptionError` | Key schedule failed (hardening round). |
| `pdf/crypto/v6/bad-ct-len` | `EncryptionError` | Ciphertext length not a multiple of 16. |
| `pdf/crypto/v6/aes-decrypt-schedule` | `EncryptionError` | Key schedule failed on decrypt. |
| `pdf/crypto/v6/cbc-decrypt-failed` | `EncryptionError` | CBC decrypt failed. |
| `pdf/crypto/v6/hardening-runaway` | `EncryptionError` | Hardening loop exceeded 1024 rounds. |
| `pdf/crypto/v6/bad-O-U` | `EncryptionError` | `/O`/`/U` not at least 48 bytes. |
| `pdf/crypto/v6/bad-OE-UE` | `EncryptionError` | `/OE`/`/UE` not exactly 32 bytes. |
| `pdf/crypto/v6/bad-string` | `EncryptionError` | Encrypted string shorter than 32 bytes. |
| `pdf/crypto/v6/missing-gcm` | `EncryptionError` | `method === 'AESV4'` requested but `pdfAesGcm` was not supplied. |
| `pdf/crypto/v6/encrypt-bad-input` | `EncryptionError` | `encryptString` plaintext is not a Uint8Array. |
| `pdf/crypto/v6/encrypt-bad-iv` | `EncryptionError` | `iv` has the wrong length for the resolved method. |
| `pdf/crypto/v6/perms-schedule` | `EncryptionError` | AES-256-ECB schedule failed while building `/Perms`. |

## See also

- [`pdfStandardV5`](./standardV5.md) — legacy.
- [`pdfAesGcm`](./aesGcm.md) — ISO/TS 32003 (AES-GCM).
- [`pdfSecurity`](./security.md)
