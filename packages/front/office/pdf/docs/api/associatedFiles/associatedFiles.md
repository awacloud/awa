---
module: pdfAssociatedFiles
category: pdf/associatedFiles
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfAssociatedFiles

> Associated Files — PDF 2.0 (PDF20_AN002-AF annex).

**Module** `pdfAssociatedFiles` | **Source** `packages/front/office/pdf/src/associatedFiles/associatedFiles.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

PDF 2.0's *Associated Files* mechanism (§14.13) lets *any* PDF object (Catalog, page, annotation, image XObject, structure element, …) attach a file spec via `/AF`, tagged with the file spec's own `/AFRelationship`. This module types an `/AF` array (one or more file spec entries).

Standard `/AFRelationship` values: `Source` (this PDF is derived from the source), `Data` (data used by the object), `Alternative` (alternate rendering), `Supplement` (supplementary info), `EncryptedPayload`, `FormData` (PDF 2.0), `Schema`, `Unspecified`.

**The returned file spec is the raw parser dict node, not a `pdfFileSpec.typeFileSpec()` result** — call `typeFileSpec` yourself on `.filespec` if you need the convenience accessors (`.uf`, `.f`, …).

## Resolve

```js
const af = runtime.resolve('pdfAssociatedFiles');
// Returns: { typeAssociatedFiles }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeAssociatedFiles` | `(arr, resolveRef?) => AssociatedFile[]` | List of associated-file records. |

### Shape `AssociatedFile`

```js
// entry successfully resolved to a dict:
{ filespec: PdfDict, relationship: string | null, standard: boolean, ref?: { num, gen } }

// entry is an unresolved ref and no resolveRef was supplied:
{ ref: PdfRef, resolved: false }
```

## Examples

### AF on the Catalog

```js
const af = runtime.resolve('pdfAssociatedFiles');
const fileSpecModule = runtime.resolve('pdfFileSpec');
const files = af.typeAssociatedFiles(catalog.af, doc._raw.resolve);
for (const f of files) {
    f.relationship;                                  // 'Source' | 'Data' | …
    const fs = fileSpecModule.typeFileSpec(f.filespec);
    fs.uf;                                            // filename
}
```

### AF on an image (PDF/A-3, PDF/A-4)

```js
const files = af.typeAssociatedFiles(stream.dict.entries.AF, resolveRef);
// Source data attached to the image
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/af/not-array` | `ParseError` | Argument is not an array. |
| `pdf/af/bad-entry` | `ParseError` | An entry resolves to neither a dict nor a ref. |
| `pdf/af/bad-relationship` | `ParseError` | `/AFRelationship` is not a name. |

## See also

- [`pdfFileSpec`](../embedded/fileSpec.md) · [`pdfEmbeddedFile`](../embedded/embeddedFile.md)
- [`pdfCatalog`](../document/catalog.md) · [`pdfPage`](../document/page.md)
