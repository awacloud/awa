---
module: pdfEmbeddedFile
category: pdf/embedded
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfEmbeddedFile

> Embedded file stream — ISO 32000-2 §7.11.4.

**Module** `pdfEmbeddedFile` | **Source** `packages/front/office/pdf/src/embedded/embeddedFile.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Types the stream pointed at by a file spec's `/EF` entry. The stream dict carries `/Type /EmbeddedFile`, an optional `/Subtype` (MIME type as a name), and an optional `/Params` sub-dictionary (`/Size`, `/CreationDate`, `/ModDate`, `/CheckSum`). The binary content is the stream's raw (pre-filter) bytes.

## Resolve

```js
const ef = runtime.resolve('pdfEmbeddedFile');
// Returns: { typeEmbeddedFile }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeEmbeddedFile` | `(stream) => EmbeddedFile` | Typing. |

### Shape `EmbeddedFile`

```js
{
    subtype: string | undefined,     // MIME, e.g. 'application/pdf'
    params: Params | undefined,
    bytes: Uint8Array,                // raw stream (pre-filter)
    raw: PdfStream,
    _extras
}
```

`Params` (the decoded `/Params` sub-dict):

```js
{
    size: number | undefined,
    creationDate: string | undefined,  // raw PDF date string, not parsed
    modDate: string | undefined,       // raw PDF date string, not parsed
    checkSum: string | undefined,      // 16-byte MD5, as the string bytes
    raw, _extras
}
```

## Examples

### Extraction

```js
const ef = runtime.resolve('pdfEmbeddedFile').typeEmbeddedFile(stream);
const dispatch = runtime.resolve('pdfFilterDispatch');
const plain = dispatch.decode(ef.raw);
```

### Metadata

```js
ef.subtype;                // 'application/json'
ef.params?.size;           // original byte size
ef.params?.checkSum;       // MD5, as raw string bytes
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/embedded/not-stream` | `ParseError` | Argument is not a stream. |
| `pdf/embedded/no-dict` | `ParseError` | Stream has no dict. |
| `pdf/embedded/bad-type` | `ParseError` | `/Type` is not `/EmbeddedFile`. |
| `pdf/embedded/bad-subtype` | `ParseError` | `/Subtype` is not a name. |
| `pdf/embedded/bad-params` | `ParseError` | `/Params` is not a dict. |

## See also

- [`pdfFileSpec`](./fileSpec.md) · [`pdfCollection`](./collection.md)
- [`pdfFilterDispatch`](../syntax/filters/README.md)
