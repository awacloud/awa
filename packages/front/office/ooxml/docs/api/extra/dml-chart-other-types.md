---
module: dmlChartOtherTypes
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlChartOtherTypes

> DML chart — bubble, radar, stock, ofPie chart types + pivot fmt.

**Module** `dmlChartOtherTypes` | **Source** `packages/front/office/ooxml/src/extra/dml-chart-other-types.js` | **Deps** `xml` | **Worker-safe** yes

Adds typed parse/render for chart types beyond the core six (bar/line/pie/scatter/area/doughnut). Surface / 3D-surface charts are typed by [dml-chart-3d](./dml-chart-3d.md), not by this module.

## Resolve

```js
const ext = dmlChartOtherTypes.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseChartByType` | `(el) => Chart` | dispatcher on local name — falls back to `{kind, _raw: el}` for an unrecognised type |
| `renderChartByType` | `(c) => xmlNode` | back to XML |
| `parseBubbleChart` / `renderBubbleChart` | — | `<c:bubbleChart>` |
| `parseRadarChart` / `renderRadarChart` | — | `<c:radarChart>` |
| `parseStockChart` / `renderStockChart` | — | `<c:stockChart>` (open/high/low/close) |
| `parseOfPieChart` / `renderOfPieChart` | — | `<c:ofPieChart>` (pie of pie / bar of pie) |
| `parsePivotFmt` / `renderPivotFmt` | — | one `<c:pivotFmt>` |
| `parsePivotFmts` / `renderPivotFmts` | — | `<c:pivotFmts>` (list) |
| `parsePivotSource` / `renderPivotSource` | — | `<c:pivotSource>` (raw passthrough, `{_raw, attrs}`) |
| `parseDTable` / `renderDTable` | — | `<c:dTable>` (raw passthrough) |
| `parseUserShapes` / `renderUserShapes` | — | `<c:userShapes>` (raw passthrough) |
| `TYPES` | `string[]` | the 4 type names handled here: `bubbleChart`, `radarChart`, `stockChart`, `ofPieChart` |

## Elements typed

`bubbleChart`, `bubbleScale`, `sizeRepresents`, `radarChart`, `radarStyle`, `stockChart`, `surfaceChart`, `surface3DChart`, `ofPieChart`, `ofPieType`, `splitType`, `splitPos`, `secondPiePt`, `secondPieSize`, `pivotFmt`, `pivotFmts`, `pivotSource`, `dTable`, `userShapes`.

## Notes

- Stock charts require exactly four series with a fixed column order (open / high / low / close).
- `userShapes` round-trips as a raw subtree (consumers rarely modify it).

## See also

- [dml-chart-data-labels](./dml-chart-data-labels.md)
