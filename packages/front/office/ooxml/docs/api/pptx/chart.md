---
module: pptxChart
category: ooxml/pptx
dependencies: [xml, drawingmlChart, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# pptxChart

> Slide-level chart wrapper — `<p:graphicFrame>` with `<c:chart r:id=…/>` (§19.3.1.21 + §21.2).

**Module** `pptxChart` | **Source** `packages/front/office/ooxml/src/pptx/chart.js` | **Deps** `xml`, `drawingmlChart`, `ooxmlShared` | **Worker-safe** yes

Slide charts have their **own part** (`ppt/charts/chart{N}.xml`), handled by [`drawingml-chart`](../drawingml/chart.md). This module covers only the slide-side wrapper: extent, offset, `nvGraphicFramePr` and the relationship pointing at the chart part.

## Resolve

```js
const ch = runtime.resolve('pptxChart');
// Returns: { parseGraphicFrame, renderGraphicFrame,
//            CHART_URI, A_NS, R_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseGraphicFrame` | `(<p:graphicFrame>) => chartShape \| null` | Typed wrapper; `null` when the frame is not a chart. |
| `renderGraphicFrame` | `(chartShape) => element` | XML wrapper. |
| `CHART_URI` | string | `graphicData` URI for charts. |
| `A_NS`, `R_NS` | string | Namespaces. |

## Model

```js
{
    type: 'chart',
    id?, name?,
    cx, cy,                       // EMU
    offsetX?, offsetY?,
    chartRef?: string,            // r:id of the chart part (auto-assigned on write)
    chart?: chartObject,          // populated on read, the spec to write
    _extras?
}
```

## Examples

### Chart on a slide

```js
const chartMod = runtime.resolve('drawingmlChart');

const spec = chartMod.barChart({
    title: 'Sales',
    series: [{
        name: 'Q1', categories: ['Jan','Feb','Mar'], values: [10,20,15]
    }]
});

const shape = {
    type: 'chart',
    cx: 6000000, cy: 4000000,
    offsetX: 914400, offsetY: 914400,
    chart: spec
};
slide.shapes.push(shape);
// pptx.write wires the chart part and its relationship automatically.
```

### Read

```js
const r = runtime.resolve('pptx').read(bytes);
const slide = r.presentation.slides[0];
const chartShape = slide.shapes.find(s => s.type === 'chart');
console.log(chartShape.chart.plotType, chartShape.chart.series.length);
```

## Notes

- On write, when `chart` is supplied without a `chartRef`, a fresh `rId` is allocated and the `chartN.xml` part created.
- On read, `chart` is filled automatically by following the `chartRef` relationship and parsing the part with `drawingmlChart.parse`.
- When the chart embeds a workbook (`chart.embeddedWorkbookRid`), the bytes are exposed as `chart.embeddedWorkbook` (`Uint8Array`) — readable with `xlsx.read`.
- `parseGraphicFrame` returns `null` for a `<p:graphicFrame>` that is not a chart, which is how [`pptxSlide`](./slide.md) chains table → chart → verbatim fallback.

## See also

- [drawingml-chart](../drawingml/chart.md) — the chart part itself.
- [pptx-slide](./slide.md) — host (the shape tree).
- [pptx](./pptx.md) — the `chart()` convenience builder.
