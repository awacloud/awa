---
module: pdfUaTagged
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfUaTagged

> PDF/UA-1 linter (ISO 14289-1) and draft PDF/UA-2 (ISO 14289-2).

**Module** `pdfUaTagged` | **Source** `packages/front/office/pdf/src/extra/pdf-ua-tagged.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Static linter. Catalog checks: `/StructTreeRoot` required, `/MarkInfo /Marked true`, `/Lang`, `/ViewerPreferences /DisplayDocTitle true`. Structure-element checks: Figures need `/Alt` or `/ActualText`; `/Span` is discouraged as a top-level type; the accessible-permission bit (bit 10) must be set.

## Resolve

```js
const ext = runtime.resolve('pdfUaTagged');
// Returns: { validatePdfUa, validateUaStructElement, UA_STRUCTURE }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `validatePdfUa` | `(typedDoc) => { pass, errors, warnings }` | Document-level lint. |
| `validateUaStructElement` | `(node) => { pass, errors, warnings }` | Lints a single structure node. |
| `UA_STRUCTURE` | frozen catalog | `{ required, forbidden, figure, headings }` structural rule lists. |

## Examples

### Global lint

```js
const ext = runtime.resolve('pdfUaTagged');
const r = ext.validatePdfUa(typedDoc);
r.pass;      // false
r.errors;    // [ 'catalog requires /Lang string', … ]
```

### Lint a node

```js
const r = ext.validateUaStructElement(figureNode);
r.errors[0];  // 'Figure requires /Alt or /ActualText'
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/pdfua/bad-doc` | `ParseError` | typedDoc is not an object. |
| `pdf/extra/pdfua/struct/bad-node` | `ParseError` | node is not an object. |

## See also

- [`pdfStructTree`](../tagged/structTree.md)
- [`pdfWellTagged`](./well-tagged-pdf.md)
- [`pdfTaggedPdfTyped`](./tagged-pdf-typed.md)
- [Extras index](./README.md)
