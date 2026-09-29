---
module: pem
category: crypto/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# pem

> PEM (RFC 7468) — encode/decode between `Uint8Array` and `-----BEGIN/END LABEL-----` Base64.

**Module** `pem` | **Source** `packages/front/fw/src/crypto/utils/pem.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const pem = runtime.resolve('pem');
// Returns: { encode, decode }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `encode(bytes, label)` | `(Uint8Array, string) => string` | PEM with BEGIN/END headers |
| `decode(text, label?)` | `(string, string?) => Uint8Array \| false` | Bytes or `false` if invalid / label mismatch |

## Examples

```js
const { pem, hex } = fw.runtime.resolveAll(['pem', 'hex']);

const der = hex.toBytes('30820122300d06092a864886f70d01010105000382010f00');
const text = pem.encode(der, 'PUBLIC KEY');
// "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\n-----END PUBLIC KEY-----"

const back = pem.decode(text);                    // no label = accept any
const back2 = pem.decode(text, 'PUBLIC KEY');     // with label = exact match required
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.pem.encode(args[0], 'CERTIFICATE'));
    },
    { dependencies: ['pem'], args: [derBytes] }
);
```

## Notes

- **Lines 64 chars max** (RFC 7468 §3) — automatic wrapping on encode.
- **Label mismatch** → `false` + `console.warn('INVALID')`.
- **`decode` strips** trailing whitespace and tolerates `CR/LF` or `LF` only.

## See also

- [keyformat](./keyformat.md) — ECC/RSA/Ed key serialisation
- [asn1](./asn1.md) — DER inner format
