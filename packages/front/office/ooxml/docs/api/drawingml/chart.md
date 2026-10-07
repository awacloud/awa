---
module: drawingmlChart
category: ooxml/drawingml
dependencies: [ooxmlErrors, xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# drawingmlChart

> DrawingML chart (`<c:chartSpace>`, ECMA-376 part 1 §21.2) — read/write of a standalone chart part.

**Module** `drawingmlChart` | **Source** `packages/front/office/ooxml/src/drawingml/chart.js` | **Deps** `ooxmlErrors`, `xml`, `ooxmlShared` | **Worker-safe** yes

Covers the chart **part** (`xl/charts/chart{N}.xml`, `ppt/charts/chart{N}.xml`, `word/charts/chart{N}.xml`) independently of its host. The hosts (pptx slide, docx drawing, xlsx drawings) wrap it through their own dispatch. Builders are provided for the common types: bar/column, line, pie, scatter, doughnut.

## Resolve

```js
const ch = runtime.resolve('drawingmlChart');
// Returns: { parse, serialize, bytesOf,
//            barChart, lineChart, pieChart, scatterChart, doughnutChart,
//            renderSeries, parseSeries,
//            renderTitle, parseTitle,
//            renderLegend, parseLegend,
//            CHART_GRAPHIC_URI, REL_TYPE_CHART, CT_CHART,
//            REL_TYPE_PACKAGE, CT_EMBEDDED_XLSX, C_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text\|bytes) => chart` | Typed spec. |
| `serialize` | `(chart) => string` | `<c:chartSpace>` XML. |
| `bytesOf` | `(chart) => Uint8Array` | UTF-8 bytes. |
| `barChart` | `({series, barDirection, grouping, title?, legend?}) => chart` | Bar/column. |
| `lineChart` | `({series, title?, legend?}) => chart` | Lines. |
| `pieChart` | `({series, varyColors?, title?, legend?}) => chart` | Pie. |
| `scatterChart` | `({series, title?, legend?}) => chart` | XY scatter. |
| `doughnutChart` | `({series, holeSize?, varyColors?, title?, legend?}) => chart` | Doughnut. |
| `parseSeries` / `renderSeries` | symmetric | Round-trip of one series. |
| `parseTitle` / `renderTitle`, `parseLegend` / `renderLegend` | symmetric | Sub-elements. |
| `CHART_GRAPHIC_URI`, `REL_TYPE_CHART`, `CT_CHART` | string | Host bindings. |
| `REL_TYPE_PACKAGE`, `CT_EMBEDDED_XLSX` | string | For the embedded workbook. |
| `C_NS` | string | Chart namespace. |

## Model

```js
{
    title?: string,
    plotType: 'bar'|'line'|'pie'|'scatter'|'area'|'doughnut',
    barDirection?: 'col'|'bar',
    grouping?: 'standard'|'clustered'|'stacked'|'percentStacked',
    varyColors?: boolean,
    formatCode?: string,    // '0.00%', 'yyyy-mm-dd'
    series: [{
        name: string,
        categories?: [string|number],
        values: [number],
        xValues?: [number],   // scatter
        yValues?: [number],
        color?: 'RRGGBB'
    }],
    legend?: { position?: 'r'|'l'|'t'|'b'|'tr', overlay?: boolean },
    embeddedWorkbookRid?: string,
    _extras?: [xmlNode]
}
```

## Examples

### Simple bar chart

```js
const ch = runtime.resolve('drawingmlChart');
const spec = ch.barChart({
    barDirection: 'col',
    grouping: 'clustered',
    title: 'Q1 sales',
    series: [{
        name: 'Sales',
        categories: ['Jan', 'Feb', 'Mar'],
        values: [120, 95, 140]
    }]
});
const xmlText = ch.serialize(spec);
```

### Pie chart with a legend

```js
ch.pieChart({
    series: [{
        name: 'Share',
        categories: ['A', 'B', 'C'],
        values: [40, 35, 25]
    }],
    legend: { position: 'r' }
});
```

## Notes

- The chart part is not self-sufficient: the host needs a `…/chart` relationship plus a `<c:chart r:id="…"/>` inside `<a:graphicData>`.
- `embeddedWorkbookRid` can reference an embedded `.xlsx` (relationship `REL_TYPE_PACKAGE`, content type `CT_EMBEDDED_XLSX`); `pptx.read` resolves it into `shape.chart.embeddedWorkbook`.
- `formatCode` values are Excel number-format codes (ECMA-376 §18.8.30).
- Elements that are not modelled (3D, trendlines, advanced data labels) land in `_extras` — see the DrawingML extras for full typing.
- A root other than `<c:chartSpace>` raises `ParseError('drawingml/chart-bad-root')`; a `<c:chartSpace>` without a `<c:chart>` child raises `ParseError('drawingml/chart-missing')`.

## See also

- [drawingml](./drawingml.md) — the text bodies used in titles and labels.
- [pptx-chart](../pptx/chart.md), [xlsx-drawings](../xlsx/drawings.md), [docx-drawing](../docx/drawing.md) — host wrappers.
