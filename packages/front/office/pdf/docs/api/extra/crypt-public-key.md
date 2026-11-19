---
module: pdfCryptPublicKey
category: pdf/extra
dependencies: [pdfErrors, pdfParser, pdfSigAesGcm]
returns: object
worker-safe: true
status: complete
---

# pdfCryptPublicKey

> The public-key security handler's dictionaries and the crypt filter maps, typed — ISO 32000-2 §7.6.5–§7.6.7. Typing only: the package decrypts the Standard handler alone.

**Module** `pdfCryptPublicKey` | **Source** `packages/front/office/pdf/src/extra/crypt-public-key.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfSigAesGcm` | **Worker-safe** yes

A document under the public-key handler (`/Filter /Adobe.PubSec`) names its recipients in PKCS#7 objects, in `/Recipients` of its `/Encrypt` dictionary or of each crypt filter. `pdfSecurity.typeEncryptDict` types that `/Encrypt` dictionary (its `Recipients` included), and this module types the rest. Each typer takes a parser dictionary node and returns a record with every key it names copied, `raw`, and `_extras` for the other keys.

## Resolve

```js
const ext = runtime.resolve('pdfCryptPublicKey');
// Returns: { typeCryptFilterPublicKey, typeCryptFilterPublicKeyMap, typeCryptFilterMap, typeEncryptedPayload }
```

## API

| Function | Input | Returns |
|----------|-------|---------|
| `typeCryptFilterPublicKey` | a public-key crypt filter (Table 27) | `{ recipients: [Uint8Array] \| null, encryptMetadata: boolean, cfm, authEvent, length, type?, raw, _extras }` — `/Recipients` as an array of byte strings, a single one included; `encryptMetadata` defaults to `true` |
| `typeCryptFilterPublicKeyMap` | a `/CF` map of public-key crypt filters | `{ filters: { [name]: <typeCryptFilterPublicKey> }, raw, _extras }` |
| `typeCryptFilterMap` | a `/CF` map of Standard crypt filters | `{ filters: { [name]: <pdfSigAesGcm.typeCfEntry> }, raw, _extras }` |
| `typeEncryptedPayload` | an unencrypted wrapper document's `/EncryptedPayload` (§7.6.7) | `{ subtype, version, type?, raw, _extras }` |

In a map, an entry that is not a dictionary stays in `_extras`. A typer given anything but a dictionary throws `ParseError('pdf/extra/crypt-public-key/not-dict')`.

## Example

```js
const pk = runtime.resolve('pdfCryptPublicKey');
const map = pk.typeCryptFilterPublicKeyMap(encryptDict.entries.CF);
map.filters.DefaultCryptFilter.recipients; // [Uint8Array, …] — the PKCS#7 objects
```

## Notes

- Reading a public-key document stops at `pdf/crypto/unsupported-filter`: these records describe it, they do not open it.
- Registered by [`pdf-full`](../bundles/pdf-full.md).

## See also

- [pdfSecurity](../crypto/security.md) — `typeEncryptDict`, the `/Encrypt` dictionary of either handler.
- [pdfSigAesGcm](./sig-aes-gcm.md) — `typeCfEntry`, a Standard crypt filter.
