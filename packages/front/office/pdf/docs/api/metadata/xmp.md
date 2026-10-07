---
module: pdfXmp
category: pdf/metadata
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfXmp

> XMP Metadata stream — ISO 32000-2 §14.3.2 / ISO 16684-1 (XMP).

**Module** `pdfXmp` | **Source** `packages/front/office/pdf/src/metadata/xmp.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

The Catalog may carry `/Metadata`, pointing to a stream `/Type /Metadata /Subtype /XML`. The content is an XMP (RDF/XML) packet. This module validates the stream's conformance (`/Type`, `/Subtype`, dict presence) and exposes the raw bytes; parsing the XML/RDF itself is left to the caller (no XML dependency embedded).

## Resolve

```js
const xmp = runtime.resolve('pdfXmp');
// Returns: { typeXmpStream }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeXmpStream` | `(stream) => { type: 'Metadata', subtype: 'XML', bytes: Uint8Array, raw: PdfStream }` | Validation + extraction. |

## Examples

### Extracting the packet text

```js
const xmp = runtime.resolve('pdfXmp').typeXmpStream(
    doc._raw.resolve(catalog.metadata)
);
const xml = new TextDecoder('utf-8').decode(xmp.bytes);
// → '<?xpacket begin=…?><x:xmpmeta …>…'
```

### Common XMP fields

An XMP packet typically carries:
- `dc:title`, `dc:creator`, `dc:description` (Dublin Core).
- `xmp:CreateDate`, `xmp:ModifyDate`, `xmp:CreatorTool`.
- `pdf:Producer`, `pdf:Keywords`.
- `pdfaid:part` / `pdfuaid:part` (PDF/A and PDF/UA conformance).

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/xmp/not-stream` | `ParseError` | Argument is not a stream. |
| `pdf/xmp/no-dict` | `ParseError` | Stream has no dict. |
| `pdf/xmp/bad-type` | `ParseError` | `/Type` is not `/Metadata`. |
| `pdf/xmp/bad-subtype` | `ParseError` | `/Subtype` is not `/XML`. |

## See also

- [`pdfInfo`](./info.md) · [`pdfCatalog`](../document/catalog.md)
