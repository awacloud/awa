---
module: pdfJbig2Read
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: partial
---

# pdfJbig2Read

> JBIG2 segment reader, header-only (PARTIAL).

**Module** `pdfJbig2Read` | **Source** `packages/front/office/pdf/src/extra/jbig2-read.js` | **Deps** `pdfErrors` | **Worker-safe** yes

JBIG2 is the bilevel codec referenced by `/Filter /JBIG2Decode` (ISO 32000-2 §7.4.7). A full decoder is out of scope; this module parses the segment-header chain (ISO/IEC 14492:2001 §7.2) and returns descriptors for enumeration. **Status: PARTIAL — header-only**, unrelated to the real T.4/T.6 codec shipped by [`pdfCcittFaxDecoder`](./ccitt-fax-decoder.md).

## Resolve

```js
const ext = runtime.resolve('pdfJbig2Read');
// Returns: { parseSegments, enumerateGenericRegions, decode,
//   SEGMENT_TYPES, STATUS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `parseSegments` | `(Uint8Array) => Segment[]` | Walks the segment chain. |
| `enumerateGenericRegions` | `(Uint8Array) => Segment[]` | Filters types 36/38/39. |
| `decode` | `(Uint8Array) => never` | Always throws `not-implemented`. |
| `SEGMENT_TYPES` | object | Type number → name. |
| `STATUS` | string | `'partial — header-only'`. |

### Shape `Segment`

```js
{ segmentNumber, type, typeName, referredCount,
  retain, deferredNonRetain, dataOffset, dataLength, unknownLength }
```

## Examples

### Enumerate segments

```js
const ext = runtime.resolve('pdfJbig2Read');
const segs = ext.parseSegments(jbig2Bytes);
segs[0].typeName;  // 'symbolDictionary'
```

### Generic regions

```js
ext.enumerateGenericRegions(jbig2Bytes).length;
```

### Status check

```js
ext.STATUS;  // 'partial — header-only'
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/jbig2/bad-input` | `ParseError` | Not a Uint8Array. |
| `pdf/jbig2/truncated-header` | `ParseError` | Header chain cut short. |
| `pdf/jbig2/truncated-data-length` | `ParseError` | Data-length field missing. |
| `pdf/jbig2/truncated-data` | `ParseError` | Payload cut short. |
| `pdf/jbig2/not-implemented` | `ParseError` | Always, from `decode()`. |

## See also

- [`pdfFilters`](../syntax/filters/README.md)
- [`pdfImages`](../content/images.md)
- [`pdfCcittFaxDecoder`](./ccitt-fax-decoder.md)
- [Extras index](./README.md)
