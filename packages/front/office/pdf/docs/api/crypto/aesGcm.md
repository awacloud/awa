---
module: pdfAesGcm
category: pdf/crypto
dependencies: [pdfErrors, aes, gcm, bitArray]
returns: object
worker-safe: true
status: complete
---

# pdfAesGcm

> AES-GCM cipher for PDF objects — ISO TS 32003.

**Module** `pdfAesGcm` | **Source** `packages/front/office/pdf/src/crypto/aesGcm.js` | **Deps** `pdfErrors`, `aes`, `gcm`, `bitArray` | **Worker-safe** yes

Implements the `AESV4` cipher introduced by ISO TS 32003: AES-256 in GCM mode with a 12-byte IV and a 16-byte authentication tag. Both functions operate on the PDF wire format directly — a single `Uint8Array` framed as `IV (12) ‖ ciphertext (n) ‖ tag (16)` — rather than a `{ iv, ciphertext, tag }` object. Decryption rejects truncated ciphertext or a mismatched tag.

## Resolve

```js
const gcm = runtime.resolve('pdfAesGcm');
// Returns: { encryptObjectGcm, decryptObjectGcm }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `encryptObjectGcm` | `(fek: Uint8Array, plaintext: Uint8Array, ivProvider: () => Uint8Array) => Uint8Array` | Framed `iv ‖ ciphertext ‖ tag`. `ivProvider` is called with no arguments and must return exactly 12 bytes. |
| `decryptObjectGcm` | `(fek: Uint8Array, framed: Uint8Array) => Uint8Array` | Splits `framed` into `iv`/`ciphertext`/`tag`, verifies the tag, and returns the plaintext. Throws on tag mismatch. |

`fek` (File Encryption Key) must be exactly 32 bytes (AES-256).

## Examples

### Deterministic encrypt (tests)

```js
const gcm = runtime.resolve('pdfAesGcm');
const framed = gcm.encryptObjectGcm(
    fek,
    new TextEncoder().encode('hello'),
    () => new Uint8Array(12)   // ZERO IV — test only
);
```

### Decrypt the wire format

```js
const gcm = runtime.resolve('pdfAesGcm');
const plain = gcm.decryptObjectGcm(fek, framed);
// framed === iv(12) ‖ ciphertext ‖ tag(16), exactly as read from the PDF object.
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/crypto/gcm/missing-fw` | `EncryptionError` | fw bundle incomplete (thrown at module construction). |
| `pdf/crypto/gcm/bad-fek` | `EncryptionError` | FEK ≠ 32 bytes. |
| `pdf/crypto/gcm/aes-schedule-failed` | `EncryptionError` | AES-256 key schedule failed. |
| `pdf/crypto/gcm/bad-input` | `EncryptionError` | `framed` is not a Uint8Array of at least 28 bytes. |
| `pdf/crypto/gcm/tag-mismatch` | `EncryptionError` | Authentication tag invalid — data tampered or wrong key. |
| `pdf/crypto/gcm/bad-plaintext` | `EncryptionError` | Plaintext is not a Uint8Array. |
| `pdf/crypto/gcm/bad-iv-provider` | `EncryptionError` | `ivProvider` is not a function. |
| `pdf/crypto/gcm/bad-iv` | `EncryptionError` | `ivProvider()` did not return exactly 12 bytes. |
| `pdf/crypto/gcm/encrypt-failed` | `EncryptionError` | The GCM provider failed. |

## See also

- [`pdfStandardV6`](./standardV6.md) — handler carrying the CFM.
- [`pdfSecurity`](./security.md)
