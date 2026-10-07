---
module: dmlXdrAdvanced
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlXdrAdvanced

> DML/XDR — SpreadsheetDrawing connectors, group shapes, anchor variants.

**Module** `dmlXdrAdvanced` | **Source** `packages/front/office/ooxml/src/extra/dml-xdr-advanced.js` | **Deps** `xml` | **Worker-safe** yes

Extends the SpreadsheetDrawing model (`xl/drawings/drawing*.xml`, `dml-spreadsheetDrawing.xsd`) with connectors, group shapes, and all three anchor flavours (absolute / one-cell / two-cell).

## Resolve

```js
const ext = dmlXdrAdvanced.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseConnector` / `renderConnector` | — | back-compat alias for `parseCxnSp`/`renderCxnSp` |
| `parseGroupShape` / `renderGroupShape` | — | back-compat alias for `parseGrpSp`/`renderGrpSp` |
| `parseCxnSp` / `renderCxnSp` | — | `<xdr:cxnSp>` (nvCxnSpPr / spPr / style) |
| `parseGrpSp` / `renderGrpSp` | — | `<xdr:grpSp>` (recursive — nested `cxnSp`/`grpSp`/`contentPart`) |
| `parseAbsoluteAnchor` / `renderAbsoluteAnchor` | — | `<xdr:absoluteAnchor>` (`pos` + `ext`) |
| `parseOneCellAnchor` / `renderOneCellAnchor` | — | `<xdr:oneCellAnchor>` (`from` + `ext`) |
| `parseTwoCellAnchor` / `renderTwoCellAnchor` | — | `<xdr:twoCellAnchor>` (`from` + `to`) |
| `parseCNvPr` / `renderCNvPr` | — | `<xdr:cNvPr>` (id, name, descr, title, hidden) — shared by `nv*Pr` |
| `parseCNvCxnSpPr` / `renderCNvCxnSpPr` | — | `<xdr:cNvCxnSpPr>` (stCxn / endCxn) |
| `parseNvCxnSpPr` / `renderNvCxnSpPr` | — | `<xdr:nvCxnSpPr>` |
| `parseCNvGrpSpPr` / `renderCNvGrpSpPr` | — | `<xdr:cNvGrpSpPr>` (grpSpLocks) |
| `parseNvGrpSpPr` / `renderNvGrpSpPr` | — | `<xdr:nvGrpSpPr>` |
| `parseGrpSpPr` / `renderGrpSpPr` | — | `<xdr:grpSpPr>` (inner DrawingML preserved raw) |
| `parseStyle` / `renderStyle` | — | `<xdr:style>` (lnRef / fillRef / effectRef / fontRef) |
| `parseContentPart` / `renderContentPart` | — | `<xdr:contentPart>` (linked ink via `r:id`) |

There is no `<xdr:graphicFrame>` support — unlisted children of an anchor (including `graphicFrame`) are preserved raw through `_extras`.

## Elements typed

`cxnSp`, `nvCxnSpPr`, `cNvCxnSpPr`, `stCxn`, `endCxn`, `cNvPr`, `grpSp`, `grpSpPr`, `nvGrpSpPr`, `cNvGrpSpPr`, `absoluteAnchor`, `oneCellAnchor`, `twoCellAnchor`, `from`, `to`, `col`, `colOff`, `row`, `rowOff`, `ext`, `pos`, `clientData`, `style`, `contentPart`.

## Notes

- Group shapes are recursive — a group can contain other groups, connectors, shapes, or pictures.
- `absoluteAnchor` is rare; `twoCellAnchor` (in core) covers most fixtures.

## See also

- [dml-shapes-advanced](./dml-shapes-advanced.md)
