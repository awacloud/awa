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

The trailer's `/Info` entry carries legacy metadata: `/Title`, `/Author`, `/Subject`, `/Keywords`, `/Creator`, `/Producer`, `/CreationDate`, `/ModDate`, `/Trapped` (`True`/`False`/`Unknown`). PDF 2.0 deprecates it in favour of XMP (Catalog `/Metadata`), but `/Info` remains common. **The text fields and the dates are returned as the strings' bytes** (`Uint8Array`, as the parser reads a string): `decodeTextString` turns a text string into a JavaScript string, and a date is the raw PDF date string (`D:YYYYMMDDHHmmSSOHH'mm'`) — `typeInfo` does not parse it into a `Date` object; the caller decodes and parses it if it needs a `Date`.

## Resolve

```js
const info = runtime.resolve('pdfInfo');
// Returns: { typeInfo, decodeTextString }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeInfo` | `(dict) => Info` | Typing. |
| `decodeTextString` | `(bytes: Uint8Array) => string` | Decodes a text string such as `/Title` (§ 7.9.2.2): UTF-16BE after `FE FF` (surrogate pairs joined, a language escape `U+001B … U+001B` removed), UTF-8 after `EF BB BF`, else PDFDocEncoding (Annex D — Latin-1 but for 0x18–0x1F and 0x7F–0xA0, an undefined code U+FFFD). Anything but a `Uint8Array` throws `ContractError` `pdf/info/bad-text-string`. |

### Shape `Info`

```js
{
    title, author, subject, keywords, creator, producer,   // the strings' bytes (Uint8Array)
    creationDate: Uint8Array | undefined,   // bytes of the raw D:YYYYMMDDHHmmSSOHH'mm', unparsed
    modDate: Uint8Array | undefined,        // bytes of the raw D:YYYYMMDDHHmmSSOHH'mm', unparsed
    trapped: 'True' | 'False' | 'Unknown' | undefined,
    raw, _extras
}
```

## Examples

### Reading the trailer's Info

```js
const info = runtime.resolve('pdfInfo').typeInfo(doc._raw.resolve(trailer.info));
info.title;          // Uint8Array — the string's bytes
runtime.resolve('pdfInfo').decodeTextString(info.title);   // the title as a string
info.creationDate;   // the bytes of D:20260115120000+01'00' — raw, decode and parse it yourself
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
| `pdf/info/bad-text-string` | `ContractError` | `decodeTextString`: the argument is not a `Uint8Array`. |

## See also

- [`pdfXmp`](./xmp.md) · [`pdfTrailer`](../syntax/trailer.md)
