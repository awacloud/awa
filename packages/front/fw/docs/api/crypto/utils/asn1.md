---
module: asn1
category: crypto/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# asn1

> ASN.1 DER (X.690) — encode/decode tags primitifs (INTEGER, OCTET STRING, OID, SEQUENCE, ...).

**Module** `asn1` | **Source** `packages/front/fw/src/crypto/utils/asn1.js` | **Deps** none | **Worker-safe** yes

Strict DER serialisation for key formats (PKCS#8, SPKI, SEC1, JWK Key OPS) and signatures (ECDSA r,s).

## Resolve

```js
const asn1 = runtime.resolve('asn1');
// Returns: { encode, decode, oid, ... }
```

## API (excerpt)

| Method | Signature | Returns |
|--------|-----------|---------|
| `encode(value, type)` | — | DER bytes |
| `decode(bytes)` | — | Tree `{type, length, value}` |
| `oid(dotted)` | — | Encoded OID |

Supported types: `INTEGER`, `OCTET STRING`, `BIT STRING`, `OID`, `SEQUENCE`, `SET`, `NULL`, `IA5String`, `UTF8String`, `OBJECT IDENTIFIER`, `BOOLEAN`.

## Examples

```js
const { asn1, hex } = fw.runtime.resolveAll(['asn1', 'hex']);

// ECDSA signature : SEQUENCE { INTEGER r, INTEGER s }
const der = asn1.encode({
    type: 'SEQUENCE',
    value: [
        { type: 'INTEGER', value: rBytes },
        { type: 'INTEGER', value: sBytes }
    ]
});
hex.fromBytes(der);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) { self.postMessage(libs.asn1.decode(args[0])); },
    { dependencies: ['asn1'], args: [derBytes] }
);
```

## Notes

- **DER strict** (X.690 §10): minimal length, INTEGER no leading zeros, etc.
- **`decode` does not validate BER** — DER only. Non-canonical BER encodings are rejected.
- **OID**: canonical base-128 encoding (RFC 5280 §4.1.1.2).

## See also

- [keyformat](./keyformat.md) — uses asn1 for PKCS#8 / SPKI
- [pem](./pem.md) — Base64 + headers wrapper
