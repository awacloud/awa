---
module: pdfEmbeddedFilesPortfolio
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfEmbeddedFilesPortfolio

> Deep typing of the PDF Portfolio (`/Collection`).

**Module** `pdfEmbeddedFilesPortfolio` | **Source** `packages/front/office/pdf/src/extra/embedded-files-portfolio.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Augments the L1 `/Collection` typing with deep inspection: `/Schema` field defs, `/Sort` criteria, `/Navigator`, the initial `/D` entry, the `/View` mode (`D`/`T`/`H`/`C`), and the `/CI` (Collection Item) custom icon.

## Resolve

```js
const ext = runtime.resolve('pdfEmbeddedFilesPortfolio');
// Returns: { typePortfolio, typeSchema, typeSchemaField, typeSort,
//   typeNavigator, typeCustomIcon, typeCollectionItem,
//   VIEW_MODES, SCHEMA_SUBTYPES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typePortfolio` | `(collectionDict) => Portfolio` | Full view `{ raw, _extras, schema?, initialDoc?, view?, sort?, navigator? }`. |
| `typeSchema` | `(dict) => { fields, raw }` | `/Schema` fields, keyed by their dict key. |
| `typeSchemaField` | `(name, dict) => Field` | A single field definition. |
| `typeSort` | `(dict) => Sort` | `/Sort` `/S`/`/A`. |
| `typeNavigator` | `(value) => Navigator` | Ref or typed dict. |
| `typeCustomIcon` | `(dict) => { raw }` | `/CI` icon. |
| `typeCollectionItem` | `(dict) => CI` | Per-file metadata. |
| `VIEW_MODES` | `Set` | `D`, `T`, `H`, `C`. |
| `SCHEMA_SUBTYPES` | `Set` | `S`, `D`, `N`, `F`, `Desc`, `ModDate`, `CreationDate`, `Size`. |

## Examples

### Load a portfolio

```js
const ext = runtime.resolve('pdfEmbeddedFilesPortfolio');
const p = ext.typePortfolio(catalog.collection);
p.view;                    // 'D'
p.schema.fields.Title.displayName;  // 'Title'
```

### Sort

```js
ext.typeSort(sortDict);
// { keys: ['Date','Size'], ascending: [false, true], raw, _extras }
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/portfolio/bad-schema-field` | `ParseError` | Field is not a dict. |
| `pdf/portfolio/bad-schema-subtype` | `ParseError` | `/Subtype` outside the set. |
| `pdf/portfolio/bad-schema-n` | `ParseError` | `/N` is not a string. |
| `pdf/portfolio/bad-schema-o` | `ParseError` | `/O` is not an int. |
| `pdf/portfolio/bad-schema-v` | `ParseError` | `/V` wrong type. |
| `pdf/portfolio/bad-schema-e` | `ParseError` | `/E` wrong type. |
| `pdf/portfolio/bad-schema` | `ParseError` | `/Schema` dict invalid. |
| `pdf/portfolio/bad-sort` | `ParseError` | `/Sort` dict invalid. |
| `pdf/portfolio/bad-sort-s-item` | `ParseError` | `/S` array item is not a name. |
| `pdf/portfolio/bad-sort-s` | `ParseError` | `/S` is neither name nor array. |
| `pdf/portfolio/bad-sort-a-item` | `ParseError` | `/A` array item is not a bool. |
| `pdf/portfolio/bad-sort-a` | `ParseError` | `/A` is neither bool nor array. |
| `pdf/portfolio/bad-navigator` | `ParseError` | Navigator invalid. |
| `pdf/portfolio/bad-ci` | `ParseError` | `/CI` is not a dict or stream. |
| `pdf/portfolio/not-dict` | `ParseError` | Collection is not a dict. |
| `pdf/portfolio/bad-type` | `ParseError` | `/Type` is not `/Collection`. |
| `pdf/portfolio/bad-d` | `ParseError` | `/D` is not a string. |
| `pdf/portfolio/bad-view` | `ParseError` | `/View` outside `VIEW_MODES`. |
| `pdf/portfolio/ci-not-dict` | `ParseError` | `typeCollectionItem` argument is not a dict. |

## See also

- [`pdfCollection`](../embedded/collection.md)
- [`pdfFileSpec`](../embedded/fileSpec.md)
- [Extras index](./README.md)
