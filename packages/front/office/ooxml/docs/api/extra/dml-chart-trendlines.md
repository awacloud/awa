---
module: dmlChartTrendlines
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlChartTrendlines

> DML chart — trendlines, error bars, drop / hi-low / series lines, up/down bars.

**Module** `dmlChartTrendlines` | **Source** `packages/front/office/ooxml/src/extra/dml-chart-trendlines.js` | **Deps** `xml` | **Worker-safe** yes

Adds typed parse/render for the regression / annotation overlays added on top of a chart's series.

## Resolve

```js
const ext = dmlChartTrendlines.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseTrendline` / `renderTrendline` | — | `{ name, type, order?, period?, …, dispRSqr, dispEq }` |
| `parseTrendlineLbl` / `renderTrendlineLbl` | — | the label box |
| `parseErrBars` / `renderErrBars` | — | `<c:errBars>` |
| `parseDropLines` / `renderDropLines` | — | `<c:dropLines>` |
| `parseHiLowLines` / `renderHiLowLines` | — | `<c:hiLowLines>` |
| `parseSerLines` / `renderSerLines` | — | `<c:serLines>` |
| `parseUpDownBars` / `renderUpDownBars` | — | `<c:upDownBars>` |
| `parseGapWidth` / `renderGapWidth` | — | gap width int |
| `parseGapDepth` / `renderGapDepth` | — | gap depth int |

## Elements typed

`trendline` (`type` ∈ `linear`, `log`, `exp`, `power`, `poly`, `movingAvg`), `trendlineLbl`, `errBars`, `errBarType`, `errValType`, `errDir`, `dropLines`, `hiLowLines`, `serLines`, `upDownBars`, `upBars`, `downBars`, `gapWidth`.

## Notes

- Polynomial trendlines carry `order`; moving-average ones carry `period`.
- `errBars` accepts a custom value source (`<c:plus>` / `<c:minus>` with `<c:numLit>`).

## See also

- [dml-chart-data-labels](./dml-chart-data-labels.md)
