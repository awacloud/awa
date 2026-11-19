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
// Returns: { TAG, encodeInteger, encodeOctetString, encodeBitString, encodeNull, encodeOid,
//            encodeSequence, encodeSet, encodeExplicit, encodeImplicit,
//            parseOne, parseChildren, readInteger, readOid, readBitString }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `TAG` | `{INTEGER, BIT_STRING, OCTET_STRING, NULL, OID, SEQUENCE, SET}` | Tag-byte constants |
| `encodeInteger(value)` | `(Uint8Array \| number[] \| number) => Uint8Array \| false` | An INTEGER TLV (minimal two's-complement) |
| `encodeOctetString(bytes)` | `(Uint8Array \| number[]) => Uint8Array \| false` | An OCTET STRING TLV |
| `encodeBitString(bytes, unusedBits)` | `(Uint8Array \| number[], number) => Uint8Array \| false` | A BIT STRING TLV |
| `encodeNull()` | `() => Uint8Array` | `05 00` |
| `encodeOid(dotted)` | `(string) => Uint8Array \| false` | An OBJECT IDENTIFIER TLV |
| `encodeSequence(items)` / `encodeSet(items)` | `(Uint8Array[]) => Uint8Array \| false` | A SEQUENCE / SET of encoded TLVs |
| `encodeExplicit(n, body)` | `(number, Uint8Array) => Uint8Array \| false` | `body` wrapped in context-specific `[n]` EXPLICIT |
| `encodeImplicit(n, tlv, constructed?)` | `(number, Uint8Array, boolean?) => Uint8Array` | `tlv` re-tagged as context-specific `[n]` IMPLICIT |
| `parseOne(buf, off)` | `(Uint8Array, number) => node \| false` | One TLV: `{tag, length, value, valueOff, next}` (`value` is a view into `buf`) |
| `parseChildren(value)` | `(Uint8Array) => node[] \| false` | The TLVs of a constructed value |
| `readInteger(node)` | `(node) => Uint8Array \| false` | The INTEGER's two's-complement bytes |
| `readOid(node)` | `(node) => string \| false` | The OID, dotted |
| `readBitString(node)` | `(node) => {unusedBits, bytes} \| false` | The BIT STRING's content |

## Examples

```js
const { asn1, hex } = fw.runtime.resolveAll(['asn1', 'hex']);

// ECDSA signature: SEQUENCE { INTEGER r, INTEGER s }
const der = asn1.encodeSequence([asn1.encodeInteger(rBytes), asn1.encodeInteger(sBytes)]);
hex.fromBytes(der);

// and back
const seq = asn1.parseOne(der, 0);
const [r, s] = asn1.parseChildren(seq.value).map(asn1.readInteger);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) { self.postMessage(libs.asn1.parseOne(args[0], 0).tag); },
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
