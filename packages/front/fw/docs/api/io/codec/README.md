# IO / Codec

Encoding and decoding between bytes (`Uint8Array`) and text or binary representations.

Four families:
- **bytes ↔ string** — `hex`, `b64`, `base32`, `base58`, `utf8`: API `fromBytes` / `toBytes` (+ `test`).
- **JS value ↔ bytes** (binary serialisation) — `buffer` (internal awa format), `cbor` (RFC 8949), `msgpack` (MessagePack spec): API `encode` / `decode`.
- **JS value ↔ text** (tabular / querystring serialisation) — `csv` (RFC 4180), `url` (querystring + URL): API `parse` / `stringify`.
- **HTTP web formats** — `mime` (multipart + headers): parse/format structured headers, encode/decode `multipart/*` bodies.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [hex](./hex.md) | `{toBytes, fromBytes}` | none | Hex string ↔ Uint8Array |
| [b64](./b64.md) | `{toBytes, fromBytes, test}` | none | Base64 RFC 4648 encode/decode/validate |
| [base32](./base32.md) | `{toBytes, fromBytes, test}` | none | Base32 RFC 4648 (A–Z 2–7, padding `=`) |
| [base58](./base58.md) | `{toBytes, fromBytes, test}` | none | Base58 Bitcoin/IPFS alphabet (no padding) |
| [utf8](./utf8.md) | `{toBytes, fromBytes}` | none | JS String ↔ UTF-8 bytes |
| [buffer](./buffer.md) | `{out, in, consume, clone, concat}` | `valid`, `utf8` | Binary object codec (awacloud notation) — internal framework format |
| [cbor](./cbor.md) | `{encode, decode, Tagged}` | `utf8` | CBOR RFC 8949 — standard interoperability (COSE, IETF) |
| [msgpack](./msgpack.md) | `{encode, decode, Ext}` | `utf8` | MessagePack — standard interoperability (compactness) |
| [csv](./csv.md) | `{parse, stringify}` | none | CSV RFC 4180 — tabular import/export (text) |
| [url](./url.md) | `{parseQuery, stringifyQuery, parseURL, buildURL}` | none | Robust querystring (arrays, nested, comma) + URL helpers |
| [mime](./mime.md) | `{parseHeader, formatHeader, parseHeaders, formatHeaders, encode, decode, randomBoundary}` | `utf8`, `random` | HTTP headers + multipart (form-data, mixed) |
| [xml](./xml.md) | `{el, text, parse, serialize, serializeNode, findChild, findAll, textContent, encodeText, encodeAttr, decodeEntities}` | none | Tolerant minimal XML parser/serialiser (OOXML, ODF, XMP, SVG, RSS) |

## Common pattern

```js
const { hex, b64, utf8 } = fw.runtime.resolveAll(['hex', 'b64', 'utf8']);

// All codecs: fromBytes encodes, toBytes decodes
const bytes = utf8.toBytes('Bonjour');
const encoded = b64.fromBytes(bytes);
const hexStr  = hex.fromBytes(bytes);
```
