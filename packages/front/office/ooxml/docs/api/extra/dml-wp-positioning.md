---
module: dmlWpPositioning
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlWpPositioning

> DML/WP — anchored picture positioning (`<wp:anchor>`, positionH/V, wrap*, polygon).

**Module** `dmlWpPositioning` | **Source** `packages/front/office/ooxml/src/extra/dml-wp-positioning.js` | **Deps** `xml` | **Worker-safe** yes

Adds typed support for floating images — replacing the simple `<wp:inline>` model with `<wp:anchor>` and its position / wrap / extent children.

## Resolve

```js
const ext = dmlWpPositioning.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseAnchor` / `renderAnchor` | — | `<wp:anchor>` — `positionH`/`positionV`/`extent`/`effectExtent`/`wrap` land as nested fields (no separate top-level parsers) |
| `parseInline` / `renderInline` | — | `<wp:inline>` (same body decoder as `anchor`, minus positioning) |
| `parseWrapPolygon` / `renderWrapPolygon` | — | `<wp:wrapPolygon>` (list of `start`/`lineTo` points) |
| `renderWrap` | `(w) => xmlNode` | dispatches `{kind, attrs, polygon?}` to `wrapNone`/`wrapSquare`/`wrapTight`/`wrapThrough`/`wrapTopAndBottom` — parsing is inline in `parseAnchor`/`parseInline`, not a separate function |
| `parseXfrm` / `renderXfrm` | — | `<wp:xfrm>` (group/canvas shapes) |
| `parseCNvPr` / `renderCNvPr` | — | `<wp:cNvPr>` (id, name, descr, title, hidden) |
| `parseCNvSpPr` / `renderCNvSpPr` | — | `<wp:cNvSpPr>` (`a:spLocks`) |
| `parseCNvCnPr` / `renderCNvCnPr` | — | `<wp:cNvCnPr>` (`a:stCxn`/`a:endCxn`) |
| `parseCNvFrPr` / `renderCNvFrPr` | — | `<wp:cNvFrPr>` (`a:graphicFrameLocks`) |
| `parseCNvGrpSpPr` / `renderCNvGrpSpPr` | — | `<wp:cNvGrpSpPr>` (`a:grpSpLocks`) |
| `parseCNvContentPartPr` / `renderCNvContentPartPr` | — | `<wp:cNvContentPartPr>` (raw attrs) |
| `parseNvContentPartPr` / `renderNvContentPartPr` | — | `<wp:nvContentPartPr>` (`cNvPr` + `cNvContentPartPr`) |
| `parseExtLst` / `renderExtLst` | — | `<wp:extLst>` (raw children) |
| `parseSpPr` / `renderSpPr` | — | `<wp:spPr>` (attrs + inner DrawingML preserved raw) |
| `parseGrpSpPr` / `renderGrpSpPr` | — | `<wp:grpSpPr>` (attrs + inner DrawingML preserved raw) |
| `parseStyle` / `renderStyle` | — | `<wp:style>` (`a:lnRef`/`a:fillRef`/`a:effectRef`/`a:fontRef`) |
| `parseBodyPr` / `renderBodyPr` | — | `<wp:bodyPr>` (typed attrs + `a:prstTxWarp`/`a:normAutofit`/`a:spAutoFit`/`a:noAutofit`) |
| `parseTxbxContent` / `renderTxbxContent` | — | `<wp:txbxContent>` (raw children) |
| `parseTxbx` / `renderTxbx` | — | `<wp:txbx>` (wraps `txbxContent`) |
| `parseLinkedTxbx` / `renderLinkedTxbx` | — | `<wp:linkedTxbx>` (id, seq) |
| `parseContentPart` / `renderContentPart` | — | `<wp:contentPart>` (`r:id`, `nvContentPartPr`, `xfrm`, `extLst`) |
| `parseWsp` / `renderWsp` | — | `<wp:wsp>` (shape: `cNvPr`/`cNvSpPr`/`cNvCnPr`/`spPr`/`style`/`txbx`/`linkedTxbx`/`bodyPr`/`extLst`) |
| `parseGraphicFrame` / `renderGraphicFrame` | — | `<wp:graphicFrame>` (`cNvPr`/`cNvFrPr`/`xfrm`/`graphic`/`extLst`) |
| `parseGrpSp` / `renderGrpSp` | — | `<wp:grpSp>` (recursive — nested `wsp`/`grpSp`/`graphicFrame`/`contentPart` items) |
| `parseWgp` / `renderWgp` | — | `<wp:wgp>` (wordprocessingGroup — same shape as `grpSp`) |
| `parseWpc` / `renderWpc` | — | `<wp:wpc>` (wordprocessingCanvas — `bg`/`whole` + item list) |
| `parseWpcOrWgp` | `(el) => object` | dispatches to `parseWpc`/`parseWgp` by element name |
| `parseWhole` / `renderWhole` | — | `<wp:whole>` (`bg` + `style`) |
| `parseBg` / `renderBg` | — | `<wp:bg>` (raw children) |
| `ANCHOR_FLAGS` | `string[]` | `['simplePos', 'allowOverlap', 'behindDoc', 'locked', 'layoutInCell']` |
| `WRAP_KINDS` | `string[]` | `['wrapNone', 'wrapSquare', 'wrapTight', 'wrapThrough', 'wrapTopAndBottom']` |

This module also covers the wpg/wpc/wps group-shape family — 37 elements of `dml-wordprocessingDrawing.xsd` in total.

## Elements typed

`anchor`, `inline`, `simplePos`, `positionH`, `positionV`, `posOffset`, `align`, `extent`, `effectExtent`, `wrapNone`, `wrapSquare`, `wrapTopAndBottom`, `wrapTight`, `wrapThrough`, `wrapPolygon`, `start` (in polygon), `lineTo`, `docPr`, `cNvGraphicFramePr`, `extLst`, `wgp`, `wpc`, `wsp`, `whole`, `bg`, `txbx`, `txbxContent`, `linkedTxbx`, `bodyPr`, `xfrm`, `cNvCnPr`, `cNvFrPr`, `cNvGrpSpPr`, `cNvPr`, `cNvSpPr`, `cNvContentPartPr`, `nvContentPartPr`, `graphicFrame`, `grpSp`, `grpSpPr`, `spPr`, `style`, `contentPart`.

## Notes

- `relativeFrom` enums match ECMA-376 (`column`, `page`, `paragraph`, `margin`, `character`, `line`).
- A polygon is a closed list of `(x, y)` points in EMUs relative to the anchor.

## See also

- [docxDrawing](../docx/drawing.md)
