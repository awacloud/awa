---
module: pdfCollection
category: pdf/embedded
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfCollection

> Collection (portfolio) — ISO 32000-2 §7.11.6.

**Module** `pdfCollection` | **Source** `packages/front/office/pdf/src/embedded/collection.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

`/Type /Collection` lives on the Catalog. It describes a "PDF Portfolio": a cover PDF plus a set of embedded files. Entries: `/Schema` (dict of column definitions, kept raw), `/D` (default-displayed item name), `/View` (`D` details / `T` tile / `H` hidden / `C` custom), `/Sort` (kept raw), `/Navigator` (dict or ref, custom navigator extension).

## Resolve

```js
const coll = runtime.resolve('pdfCollection');
// Returns: { typeCollection }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeCollection` | `(dict) => Collection` | Typing. |

### Shape `Collection`

```js
{
    schema: PdfDict | undefined,       // /Schema, untyped
    initialDoc: string | undefined,    // /D
    view: 'D' | 'T' | 'H' | 'C' | undefined,
    sort: PdfDict | undefined,         // /Sort, untyped
    navigator: PdfDict | PdfRef | undefined,
    raw, _extras
}
```

## Examples

### Reading a portfolio

```js
const coll = runtime.resolve('pdfCollection').typeCollection(catalog.collection);
coll.view;         // 'D' = details
coll.initialDoc;   // name of the item shown by default
```

### Items

Portfolio items are the embedded files reachable from the Catalog's `/Names /EmbeddedFiles` name tree; each file spec carries `/CI` for the schema column values (kept raw on `pdfFileSpec`'s `.ci`).

```js
for (const [name, fsRef] of nameTree.entries(catalog.names.embeddedFiles)) {
    const fs = runtime.resolve('pdfFileSpec').typeFileSpec(resolveRef(fsRef));
    fs.ci;
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/collection/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/collection/bad-type` | `ParseError` | `/Type` is not `/Collection`. |
| `pdf/collection/bad-schema` | `ParseError` | `/Schema` is not a dict. |
| `pdf/collection/bad-d` | `ParseError` | `/D` is not a string. |
| `pdf/collection/bad-view` | `ParseError` | `/View` is outside `D`/`T`/`H`/`C`. |
| `pdf/collection/bad-sort` | `ParseError` | `/Sort` is not a dict. |
| `pdf/collection/bad-navigator` | `ParseError` | `/Navigator` is neither a dict nor a ref. |

## See also

- [`pdfFileSpec`](./fileSpec.md) · [`pdfEmbeddedFile`](./embeddedFile.md)
- [`pdfCatalog`](../document/catalog.md)
