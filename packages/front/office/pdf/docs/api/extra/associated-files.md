---
module: pdfAssociatedFiles2
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfAssociatedFiles2

> Extended `/AF` (Associated Files) — PDF 2.0 / PDF20_AN002-AF.

**Module** `pdfAssociatedFiles2` | **Source** `packages/front/office/pdf/src/extra/associated-files.js` | **Deps** `pdfErrors` | **Worker-safe** yes

PDF 2.0 allows `/AF` on the Catalog, Page, XObject (Form), Mark, StructElem, Annot, or DParams. Each item references a File Specification that MUST carry `/AFRelationship`. Vocabulary: `Source`, `Data`, `Alternative`, `Supplement`, `EncryptedPayload`, `FormData`, `Schema`, `Unspecified`.

## Resolve

```js
const ext = runtime.resolve('pdfAssociatedFiles2');
// Returns: { typeAf, typeAfEntry, resolveFileSpec,
//   isStandardRelationship, listStandardRelationships,
//   STANDARD_REL, CARRIER_HINTS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeAf` | `(afArray, opts?: { resolveRef?, carrier? }) => { entries, carrier }` | Types a top-level `/AF` array. |
| `typeAfEntry` | `(entry, resolveRef?, index?) => Entry` | Types one item. |
| `resolveFileSpec` | `(entry, resolveRef?) => { resolved, dict?, ref? }` | Dereferences an entry. |
| `isStandardRelationship` | `(name) => boolean` | |
| `listStandardRelationships` | `() => string[]` | |
| `STANDARD_REL` | `Set` | The 8 standard relationships. |
| `CARRIER_HINTS` | `Set` | `Catalog`, `Page`, `XObject`, `StructElem`, `Annot`, `Mark`, `DParams`. |

## Examples

### Load a page's AF array

```js
const ext = runtime.resolve('pdfAssociatedFiles2');
const af = ext.typeAf(page.af, { resolveRef: ref => doc._raw.resolve(ref), carrier: 'Page' });
af.entries[0].relationship;  // 'Data'
```

### Check a custom relationship

```js
ext.isStandardRelationship('CustomXYZ');  // false
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/af2/bad-entry` | `ParseError` | Entry is neither a dict nor a ref. |
| `pdf/af2/not-filespec` | `ParseError` | Resolved entry is not a dict. |
| `pdf/af2/bad-filespec-type` | `ParseError` | `/Type` is not `/Filespec`. |
| `pdf/af2/bad-relationship` | `ParseError` | `/AFRelationship` is not a name. |
| `pdf/af2/bad-carrier` | `ParseError` | Carrier outside `CARRIER_HINTS`. |
| `pdf/af2/not-array` | `ParseError` | `/AF` is not an array. |

## See also

- [`pdfAssociatedFiles`](../associatedFiles/associatedFiles.md)
- [`pdfFileSpec`](../embedded/fileSpec.md)
- [Extras index](./README.md)
