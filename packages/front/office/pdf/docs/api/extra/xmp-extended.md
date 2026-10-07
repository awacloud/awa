---
module: pdfXmpExtended
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfXmpExtended

> Minimal XMP packet (RDF/XML) extractor.

**Module** `pdfXmpExtended` | **Source** `packages/front/office/pdf/src/extra/xmp-extended.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Tokenizes an XMP RDF/XML packet for a fixed set of well-known namespaces and pulls out tag→value pairs. Not a full RDF parser — it walks the element stream and harvests qualified tags whose prefix maps to a known namespace.

Supported namespaces: `dc`, `xmp`, `xmpMM`, `pdf`, `pdfaid`, `pdfuaid`.

## Resolve

```js
const ext = runtime.resolve('pdfXmpExtended');
// Returns: { parsePacket, extract, group, KNOWN_NAMESPACES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `parsePacket` | `(string \| Uint8Array) => { pairs, grouped }` | Top-level entry point. |
| `extract` | `(input) => Pair[]` | Flat list `{ prefix, ns, localName, value, attrs }`. |
| `group` | `(pairs) => { [prefix]: { [localName]: value \| values[] } }` | Re-groups a flat pair list. |
| `KNOWN_NAMESPACES` | object | URI → prefix. |

## Examples

### Parse

```js
const ext = runtime.resolve('pdfXmpExtended');
const r = ext.parsePacket(xmpBytes);
r.grouped.dc.title;    // 'My Document'
r.grouped.pdfaid.part; // '2'
```

### Flat extract

```js
ext.extract(xmpBytes);
// [ { prefix: 'dc', ns: '...', localName: 'title', value: '...', attrs: {} }, … ]
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/xmp2/bad-input` | `ParseError` | Neither a string nor a Uint8Array. |
| `pdf/xmp2/unclosed-tag` | `ParseError` | Malformed XML (unclosed tag). |

## See also

- [`pdfXmp`](../metadata/xmp.md)
- [`pdfInfoDictDeprecated`](./info-dict-deprecated.md)
- [Extras index](./README.md)
