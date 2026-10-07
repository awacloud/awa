---
module: dmlChartDataLabels
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlChartDataLabels

> DML chart — `<c:dLbls>` / `<c:dLbl>` with `showVal` / `showCatName` / etc.

**Module** `dmlChartDataLabels` | **Source** `packages/front/office/ooxml/src/extra/dml-chart-data-labels.js` | **Deps** `xml` | **Worker-safe** yes

Adds typed parse/render for chart data label collections, including per-point overrides, leader lines and number formats.

## Resolve

```js
const ext = dmlChartDataLabels.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseDLbls` / `renderDLbls` | — | `<c:dLbls>` collection |
| `parseDLbl` / `renderDLbl` | — | per-point label |
| `parseNumFmt` / `renderNumFmt` | — | `{ formatCode, sourceLinked }` |
| `parseTxPr` / `renderTxPr` | — | text properties |
| `parsePara` / `parseRun` / `renderPara` / `renderRun` | — | rich-text content |
| `parseLeaderLines` / `renderLeaderLines` | — | line styling |
| `FLAGS` / `DTABLE_FLAGS` | `string[]` | enumeration of show* flags |

## Elements typed

`dLbls`, `dLbl`, `numFmt`, `tx`, `txPr`, `dLblPos`, `showLegendKey`, `showVal`, `showCatName`, `showSerName`, `showPercent`, `showBubbleSize`, `separator`, `leaderLines`, `delete`.

## Notes

- Per-point `<c:dLbl>` overrides the `<c:dLbls>` defaults.
- Number formats accept both built-in IDs (`General`, `0.00%`) and custom codes.

## See also

- [dml-chart-trendlines](./dml-chart-trendlines.md)
- [dml-chart-axes-advanced](./dml-chart-axes-advanced.md)
