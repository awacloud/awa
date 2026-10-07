---
module: pdfTaggedPdfTyped
category: pdf/extra
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfTaggedPdfTyped

> Typing of structural attribute dictionaries (`/O` Owner) — ISO 32000-2 §14.8.5.

**Module** `pdfTaggedPdfTyped` | **Source** `packages/front/office/pdf/src/extra/tagged-pdf-typed.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

Covers the standard attribute owners: Layout (§14.8.5.4), List (§14.8.5.5), Table (§14.8.5.7), PrintField (§14.8.5.6), Artifact (§14.8.2.2), UserProperties (§14.8.5.10). Dispatches on `/O`; unknown keys are preserved under `_extras`.

## Resolve

```js
const ext = runtime.resolve('pdfTaggedPdfTyped');
// Returns: { typeStructAttribute, ATTRIBUTE_OWNERS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeStructAttribute` | `(dict) => StructAttr` | Record `{ owner, ...typed, raw, _extras }`. |
| `ATTRIBUTE_OWNERS` | `Set<string>` | `Layout`, `List`, `Table`, `PrintField`, `Artifact`, `UserProperties`. |

### Shape `StructAttr` (Layout)

```js
{ owner: 'Layout', placement, writingMode, backgroundColor,
  borderColor, borderStyle, borderThickness, padding,
  color, spaceBefore, spaceAfter, …, raw, _extras }
```

## Examples

### Type a Layout attribute

```js
const ext = runtime.resolve('pdfTaggedPdfTyped');
const a = ext.typeStructAttribute(layoutDict);
a.owner;            // 'Layout'
a.placement;        // 'Block'
a.writingMode;      // 'LrTb'
```

### UserProperties

```js
const up = ext.typeStructAttribute(userPropsDict);
up.properties;  // [ { name: 'role', value: 'caption', formatted: false, hidden: false }, … ]
```

### Catalog

```js
ext.ATTRIBUTE_OWNERS.has('Table');  // true
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/tagged/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/extra/tagged/missing-owner` | `ParseError` | `/O` missing or not a name. |
| `pdf/extra/tagged/bad-user-property` | `ParseError` | A `/P` item is malformed. |

## See also

- [`pdfStructTree`](../tagged/structTree.md)
- [`pdfStructElement`](../tagged/structElement.md)
- [`pdfUaTagged`](./pdf-ua-tagged.md)
- [Extras index](./README.md)
