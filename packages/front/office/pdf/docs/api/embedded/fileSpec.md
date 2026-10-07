---
module: pdfFileSpec
category: pdf/embedded
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfFileSpec

> File specification — ISO 32000-2 §7.11.3.

**Module** `pdfFileSpec` | **Source** `packages/front/office/pdf/src/embedded/fileSpec.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Types a `/Type /Filespec` (or legacy `/Type /F`) dictionary. Entries: `/FS` (file system — `URL` or absent for local), `/F`/`/UF` (standard/Unicode path — `UF` preferred since 1.7), `/DOS`/`/Mac`/`/Unix` (platform-specific paths), `/ID` (array of 2 byte-strings — file identity), `/V` (volatile flag), `/EF` (dict of embedded-file stream refs — `F`/`UF`/`DOS`/`Mac`/`Unix`), `/RF` (related-files dict), `/Desc` (description), `/CI` (collection item), `/AFRelationship` (PDF 2.0 associated-file relationship name).

## Resolve

```js
const fs = runtime.resolve('pdfFileSpec');
// Returns: { typeFileSpec }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeFileSpec` | `(dict) => FileSpec` | Strict typing; throws on malformed entries. |

### Shape `FileSpec`

```js
{
    fs: 'URL' | undefined,
    f, uf, dos, mac, unix,             // string paths, whichever are present
    id: string[] | undefined,          // /ID, filtered to string items
    volatile: boolean | undefined,     // /V
    embedded: { F?, UF?, DOS?, Mac?, Unix? } | undefined,  // /EF entries (raw)
    related: object | undefined,       // /RF entries (raw)
    desc: string | undefined,
    ci: PdfDict | undefined,           // /CI, untyped
    afRelationship: string | undefined,
    afRelationshipStandard: boolean,   // true iff afRelationship is one of
                                        // the 8 standard values
    raw, _extras
}
```

## Examples

### Reading an attachment

```js
const fs   = runtime.resolve('pdfFileSpec').typeFileSpec(dict);
const file = runtime.resolve('pdfEmbeddedFile').typeEmbeddedFile(
    doc._raw.resolve(fs.embedded.F)
);
fs.uf;            // 'attachment.txt'
file.bytes;       // Uint8Array
```

### AF relationship (PDF 2.0)

```js
fs.afRelationship;          // 'Source' | 'Data' | 'Alternative' | 'Supplement' | …
fs.afRelationshipStandard;  // false for a non-standard relationship name
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/filespec/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/filespec/bad-type` | `ParseError` | `/Type` is neither `/Filespec` nor `/F`. |
| `pdf/filespec/bad-fs` | `ParseError` | `/FS` is not a name. |
| `pdf/filespec/bad-path` | `ParseError` | `/F`/`/UF`/`/DOS`/`/Mac`/`/Unix` is not a string. |
| `pdf/filespec/bad-id` | `ParseError` | `/ID` is not an array. |
| `pdf/filespec/bad-ef` | `ParseError` | `/EF` is not a dict. |
| `pdf/filespec/bad-rf` | `ParseError` | `/RF` is not a dict. |
| `pdf/filespec/bad-desc` | `ParseError` | `/Desc` is not a string. |
| `pdf/filespec/bad-afrel` | `ParseError` | `/AFRelationship` is not a name. |
| `pdf/filespec/empty` | `ParseError` | No path and no `/EF` present. |

## See also

- [`pdfEmbeddedFile`](./embeddedFile.md) · [`pdfCollection`](./collection.md) · [`pdfAssociatedFiles`](../associatedFiles/associatedFiles.md)
