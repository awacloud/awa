---
module: pdfSecurity
category: pdf/crypto
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfSecurity

> `/Encrypt` dict typing and handler selection — ISO 32000-2 §7.6.

**Module** `pdfSecurity` | **Source** `packages/front/office/pdf/src/crypto/security.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Neutral layer that interprets the trailer's `/Encrypt` dict (§7.6.2 Table 21) and selects the appropriate handler (`v4` = RC4/AES-128 legacy, `v5` = historical AES-256 ISO 32000-1 R5, `v6` = AES-256 ISO 32000-2 R6, transparently including ISO/TS 32003 AES-GCM when `/CFM = AESV4`). Performs no key derivation itself — delegates to the specialized handlers, and additionally routes stream decryption between the regular stream path and the embedded-file path (`/EFF`, ISO 32000-1 §7.6.5).

## Resolve

```js
const sec = runtime.resolve('pdfSecurity');
// Returns: { typeEncryptDict, selectHandler, isEmbeddedFileStream, dispatchDecryptStream }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeEncryptDict` | `(dict \| Map) => Encrypt` | Strict typing of the `/Encrypt` entries. |
| `selectHandler` | `(typedEncrypt: Encrypt, handlers: { v4?, v5?, v6? }) => { handler, revision, method, strMethod, effMethod }` | Dispatches `V=4` → `handlers.v4`, `V=5,R=5` → `handlers.v5`, `V=5,R=6` → `handlers.v6`; also resolves the `/CF`/`/StmF`/`/StrF`/`/EFF` crypt-filter method (`'AESV2'`/`'V2'`/`'Identity'` for V=4, `'AESV3'`/`'AESV4'`/`'Identity'` for V=5) into `method` (streams), `strMethod` (strings) and `effMethod` (embedded files). |
| `isEmbeddedFileStream` | `(stream) => boolean` | `true` when the stream dict has `/Type /EmbeddedFile`. |
| `dispatchDecryptStream` | `(selection, stream, fek, objNum, gen, ciphertext) => Uint8Array` | Routes to `selection.handler.decryptEmbeddedFile` (with `effMethod`) when `stream` is an embedded file, else to `handler.decryptStream` (with `method`). Returns `ciphertext` unchanged, without calling the handler, when that method is `'Identity'`. |

### Identity crypt filter

A class whose crypt filter is `Identity` — named explicitly, or absent, which is the ISO 32000-2 §7.6.6 Table 20 default for `/StmF` and `/StrF` — is not encrypted. `selectHandler` resolves each class on its own: `/StmF` gives `method`, `/StrF` gives `strMethod`, and `/EFF` gives `effMethod`, where an absent `/EFF` follows `/StmF`. A V=5 file with `/StmF /StdCF` and `/StrF /Identity` therefore has encrypted streams and clear strings. `dispatchDecryptStream` returns the bytes of an `Identity` class unchanged on every revision (V=4, V=5 R=5, V=5 R=6), and signing such a file writes its new strings in the clear. On V=4, a `/StmF /Identity` paired with a named `/StrF` keeps its existing behaviour: streams use the `/StrF` filter.

### Shape `Encrypt`

```js
{
    V, R, Filter, SubFilter, Length, CF, StmF, StrF, EFF,
    O, U, OE, UE, Perms,    // Uint8Array
    EncryptMetadata: boolean,
    P: number,              // permissions bitmask, §7.6.3.2 Table 22
    raw
}
```

## Examples

### Dispatcher

```js
const sec = runtime.resolve('pdfSecurity');
const enc = sec.typeEncryptDict(trailer.encrypt);
const selection = sec.selectHandler(enc, {
    v5: runtime.resolve('pdfStandardV5'),
    v6: runtime.resolve('pdfStandardV6')
});
const fek = selection.handler.tryPassword(enc, password, false).fileEncryptionKey;
```

### Stream decryption routing (regular vs embedded file)

```js
const plain = sec.dispatchDecryptStream(selection, streamObj, fek, num, gen, ciphertext);
```

### Inspecting permissions

```js
const perms = runtime.resolve('pdfPermissions').decodePermissions(enc.P);
perms.print;
perms.copy;
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/crypto/encrypt-dict/bad-input` | `EncryptionError` | Argument is not an object. |
| `pdf/crypto/encrypt-dict/missing-V-R` | `EncryptionError` | `/V` or `/R` missing. |
| `pdf/crypto/encrypt-dict/bad-V-R-type` | `EncryptionError` | `/V` or `/R` not an integer. |
| `pdf/crypto/v4/missing-cf-entry` | `EncryptionError` | `V=4` requires a `/CF /<name>` entry that is absent. |
| `pdf/crypto/v4/bad-cfm` | `EncryptionError` | `V=4` CFM is neither `AESV2` nor `V2`. |
| `pdf/crypto/v5/bad-cfm` | `EncryptionError` | `V=5` CFM is neither `AESV3` nor `AESV4`. |
| `pdf/crypto/security/bad-typed` | `EncryptionError` | `selectHandler` receives a non-typed encrypt dict. |
| `pdf/crypto/unsupported-version` | `EncryptionError` | `V`/`R` combination outside `4`/`5`+`5`/`5`+`6`. |
| `pdf/crypto/missing-handler` | `EncryptionError` | Required `v4`/`v5`/`v6` handler not supplied. |
| `pdf/crypto/security/bad-selection` | `EncryptionError` | `dispatchDecryptStream` receives a selection without a `handler`. |
| `pdf/crypto/security/no-eff` | `EncryptionError` | Embedded-file stream but the handler exposes neither `decryptEmbeddedFile` nor `decryptStream`. |
| `pdf/crypto/security/no-stream` | `EncryptionError` | Regular stream but the handler lacks `decryptStream`. |

## See also

- [`pdfStandardV5`](./standardV5.md) · [`pdfStandardV6`](./standardV6.md) · [`pdfAesGcm`](./aesGcm.md)
- [`pdfPermissions`](./permissions.md)
