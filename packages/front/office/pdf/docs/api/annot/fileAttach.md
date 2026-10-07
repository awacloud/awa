---
module: pdfFileAttachAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfFileAttachAnnot

> File-attachment annotation — ISO 32000-2 §12.5.6.15.

**Module** `pdfFileAttachAnnot` | **Source** `packages/front/office/pdf/src/annot/fileAttach.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/FileAttachment`. Key entries: `/FS` (file specification — see
[`pdfFileSpec`](../embedded/fileSpec.md)) and `/Name` (icon — `Graph`,
`PushPin`, `Paperclip`, `Tag`). The payload lives in the file spec's `/EF`
stream. `/FS` is required and must be a reference or a dictionary.

## Resolve

```js
const fa = runtime.resolve('pdfFileAttachAnnot');
// Returns: { typeFileAttachAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeFileAttachAnnot` | `(dict) => FileAttachAnnot` | Base record plus `fs` (raw typed `/FS` — ref or dict) and `iconName`. |

## Examples

```js
const fa = runtime.resolve('pdfFileAttachAnnot').typeFileAttachAnnot(dict);
const spec = runtime.resolve('pdfFileSpec').typeFileSpec(doc._raw.resolve(fa.fs));
spec.f;             // filename (/F)
spec.embedded?.F;   // /EF /F — the embedded-file stream reference
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/fileattach/bad-subtype` | `ParseError` | `/Subtype` present and not `/FileAttachment`. |
| `pdf/annot/fileattach/bad-fs` | `ParseError` | `/FS` missing, or neither a reference nor a dictionary. |

## See also

- [`pdfAnnot`](./annot.md) · [`pdfMarkupAnnot`](./markup.md)
- [`pdfFileSpec`](../embedded/fileSpec.md) · [`pdfEmbeddedFile`](../embedded/embeddedFile.md)
