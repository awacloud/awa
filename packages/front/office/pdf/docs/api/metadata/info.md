---
module: pdfInfo
category: pdf/metadata
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfInfo

> Document Information dictionary — ISO 32000-2 §14.3.3.

**Module** `pdfInfo` | **Source** `packages/front/office/pdf/src/metadata/info.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

The trailer's `/Info` entry carries legacy metadata: `/Title`, `/Author`, `/Subject`, `/Keywords`, `/Creator`, `/Producer`, `/CreationDate`, `/ModDate`, `/Trapped` (`True`/`False`/`Unknown`). PDF 2.0 deprecates it in favour of XMP (Catalog `/Metadata`), but `/Info` remains common. **Dates are returned as the raw PDF date string** (`D:YYYYMMDDHHmmSSOHH'mm'`) — `typeInfo` does not parse them into `Date` objects; the caller parses the string if it needs a `Date`.

## Resolve

```js
const info = runtime.resolve('pdfInfo');
// Returns: { typeInfo }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeInfo` | `(dict) => Info` | Typing. |

### Shape `Info`

```js
{
    title, author, subject, keywords, creator, producer,   // strings
    creationDate: string | undefined,   // raw D:YYYYMMDDHHmmSSOHH'mm', unparsed
    modDate: string | undefined,        // raw D:YYYYMMDDHHmmSSOHH'mm', unparsed
    trapped: 'True' | 'False' | 'Unknown' | undefined,
    raw, _extras
}
```

## Examples

### Reading the trailer's Info

```js
const info = runtime.resolve('pdfInfo').typeInfo(doc._raw.resolve(trailer.info));
info.title;
info.creationDate;   // 'D:20260115120000+01\'00\'' — raw, parse it yourself
```

### Prepress check

```js
if (info.trapped !== 'True') console.warn('document not trapped');
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/info/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/info/bad-string` | `ParseError` | A text field is not a string. |
| `pdf/info/bad-date` | `ParseError` | `/CreationDate`/`/ModDate` is not a string. |
| `pdf/info/bad-trapped` | `ParseError` | `/Trapped` is outside the allowed set. |

## See also

- [`pdfXmp`](./xmp.md) · [`pdfTrailer`](../syntax/trailer.md)
