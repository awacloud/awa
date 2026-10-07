---
module: dmlChartAxesAdvanced
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlChartAxesAdvanced

> DML chart — full axis configuration: scaling, layout, major/minor gridlines, tick marks, dispUnits.

**Module** `dmlChartAxesAdvanced` | **Source** `packages/front/office/ooxml/src/extra/dml-chart-axes-advanced.js` | **Deps** `xml` | **Worker-safe** yes

Adds typed parse/render for the four axis flavours (`catAx`, `valAx`, `dateAx`, `serAx`) and their inner positioning / scaling controls.

## Resolve

```js
const ext = dmlChartAxesAdvanced.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseAxis` / `renderAxis` | `(el) => Axis` | full axis bag |
| `parseAxisByName` | `(el, name) => Axis` | dispatcher |
| `parseScaling` / `renderScaling` | — | `<c:scaling>` |
| `parseLayout` / `renderLayout` | — | `<c:layout>` |
| `parseManualLayout` / `renderManualLayout` | — | inner `<c:manualLayout>` |
| `parseGridlines` | `(el) => Gridlines` | shared |
| `renderMajorGridlines` / `renderMinorGridlines` | — | wraps |
| `parseDispUnits` / `renderDispUnits` | — | display units (k, M, …) |
| `parseDispUnitsLbl` / `renderDispUnitsLbl` | — | `<c:dispUnitsLbl>` (layout/tx/spPr/txPr) |
| `parseNumFmt` / `renderNumFmt` | — | `<c:numFmt>` (formatCode, sourceLinked) |
| `renderCatAx` / `renderValAx` / `renderDateAx` / `renderSerAx` | `(a) => xmlNode` | kind-specific convenience wrappers over `renderAxis` |
| `renderMajorTickMark` / `renderMinorTickMark` | `(v) => xmlNode` | bare `<c:majorTickMark>`/`<c:minorTickMark>` element renderers |
| `VAL_FIELDS` | `string[]` | single-`val`-attribute child names read/written uniformly by `parseAxis`/`renderAxis` |

## Elements typed

`catAx`, `valAx`, `dateAx`, `serAx`, `scaling`, `min`, `max`, `logBase`, `orientation`, `majorUnit`, `minorUnit`, `majorGridlines`, `minorGridlines`, `majorTickMark`, `minorTickMark`, `tickLblPos`, `crossAx`, `crosses`, `crossesAt`, `crossBetween`, `dispUnits`, `layout`, `manualLayout`, `lblOffset`, `lblAlgn`, `auto`, `txPr`, `numFmt`.

## Notes

- The `crossAx` element pairs axes (catAx ↔ valAx ↔ serAx) by id.
- Manual layouts use percentage sizes (`xMode='factor'` etc.).

## See also

- [dml-chart-3d](./dml-chart-3d.md)
