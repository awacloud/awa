---
module: pdfWellTagged
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfWellTagged

> WTPDF 1.0 (Well-Tagged PDF) linter — best practices beyond PDF/UA.

**Module** `pdfWellTagged` | **Source** `packages/front/office/pdf/src/extra/well-tagged-pdf.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

WTPDF 1.0 (PDF Association, 2024). Rule families: Artifact placement (tagged decorative content), `/Span` use (no bare pseudo-paragraph span), Table (`/Table` → `/TR` → `/TH`/`/TD`), List (`/L` → `/LI` → `/Lbl` + `/LBody`), heading-level jumps.

## Resolve

```js
const ext = runtime.resolve('pdfWellTagged');
// Returns: { lintWellTagged, checkArtifactPlacement, WTPDF_RULES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `lintWellTagged` | `(structTree) => { pass, errors, warnings }` | Walks the tree and applies the WTPDF checks. |
| `checkArtifactPlacement` | `(regions) => { pass, errors, warnings }` | Checks an array of content regions. |
| `WTPDF_RULES` | frozen catalog | Rule id → description (`wtpdf/artifact`, `wtpdf/span/empty`, `wtpdf/table/empty`, `wtpdf/table/row`, `wtpdf/list/empty`, `wtpdf/list/item`, `wtpdf/heading/jump`). |

## Examples

### Lint a tree

```js
const ext = runtime.resolve('pdfWellTagged');
const r = ext.lintWellTagged(structTree);
r.errors.find(e => e.rule === 'wtpdf/table/empty');
```

### Artifact placement

```js
ext.checkArtifactPlacement(regions).errors;
// [ { rule: 'wtpdf/artifact', message: '…', mcid } ]
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/wtpdf/bad-tree` | `ParseError` | structTree is not an object. |
| `pdf/extra/wtpdf/regions/bad-input` | `ParseError` | regions is not an array. |

## See also

- [`pdfUaTagged`](./pdf-ua-tagged.md)
- [`pdfStructTree`](../tagged/structTree.md)
- [Extras index](./README.md)
