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
//   typeNavigator, typeCustomIcon, typeCollectionItem, typeCollectionPart,
//   COLLECTION_PART_KEYS, typeFilePart, FILE_PART_KEYS,
//   VIEW_MODES, SCHEMA_SUBTYPES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typePortfolio` | `(collectionDict) => Portfolio` | Full view `{ raw, _extras, schema?, initialDoc?, view?, sort?, navigator? }`. |
| `typeSchema` | `(dict) => { fields, raw }` | `/Schema` fields, keyed by their dict key; the optional `/Type /CollectionSchema` names the dictionary and is not a field. |
| `typeSchemaField` | `(name, dict) => Field` | A single field definition; `type` holds `/Type` when present. |
| `typeSort` | `(dict) => Sort` | `/Sort` `/S`/`/A`; `type` holds `/Type` when present. |
| `typeNavigator` | `(value) => Navigator` | Ref or typed dict: `{ raw, entries }`, with `type` (a name by value) and `layout` (a name by value or the array as read, `null` for another value), each present only when the key is. |
| `typeCustomIcon` | `(dict) => { raw }` | `/CI` icon. |
| `typeCollectionItem` | `(dict) => CI` | Per-file metadata; `type` holds `/Type` when present. |
| `typeCollectionPart` | `(dict, kind) => Part` | A collection folder, colours, split or sub-item dictionary (`kind` `folder`, `colors`, `split`, `subitem`): one field per key of its list, named after the key in lower case (`CreationDate` → `creationdate`), present only when the key is — a name, a text string (its bytes; a date as its string), a number or an integer by its value, an array, a dictionary or a stream as read, a reference as read, a sub-item's `D` a string or a number, `null` for none — plus `raw` and `_extras`. |
| `COLLECTION_PART_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
| `typeFilePart` | `(dict, kind) => FilePart` | A file specification's `/EF` (`kind` `ef`: `F`, `UF` streams) or `/RF` (`rf`: `F`, `UF` arrays), a Mac OS file information dictionary (`mac`: `Subtype`, `Creator` integers, `ResFork` a stream) or a go-to-embedded target (`target`: `R` a name, `N` a string's bytes, `P` and `A` an integer or a string, `T` a dictionary): one field per key of its list, named after the key in lower case, present only when the key is — a reference as read, `null` for a value of another type — plus `raw` and `_extras`. |
| `FILE_PART_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
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
| `pdf/portfolio/part/not-dict` | `ParseError` | `typeCollectionPart`: not a dict. |
| `pdf/portfolio/part/kind` | `ContractError` | `typeCollectionPart`: `kind` missing or unknown. |
| `pdf/portfolio/file-part/not-dict` | `ParseError` | `typeFilePart`: not a dict. |
| `pdf/portfolio/file-part/kind` | `ContractError` | `typeFilePart`: `kind` missing or unknown. |

## See also

- [`pdfCollection`](../embedded/collection.md)
- [`pdfFileSpec`](../embedded/fileSpec.md)
- [Extras index](./README.md)
