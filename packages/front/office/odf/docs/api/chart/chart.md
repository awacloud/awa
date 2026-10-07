---
module: chartChart
category: odf/chart
dependencies: [odfErrors, odfShared, xml]
returns: object
worker-safe: true
status: complete
---

# chartChart

> `<chart:chart>` root element + content-document helpers.

**Module** `chartChart` | **Source** `packages/front/office/odf/src/chart/chart.js` | **Deps** `odfErrors`, `odfShared`, `xml` | **Worker-safe** yes

An ODF chart lives in its own package sub-directory (`Object N/content.xml`).
This module parses/renders the `<chart:chart>` element itself
and offers `bytesOf` / `parseBytes` for the corresponding content
document. It does not add the sub-document to the package's manifest
or produce a preview image.

Model:

```js
{
  type: 'chart',
  chartClass?,                          // chart:class
  title?, subtitle?, legend?,           // raw XML
  plotArea?: { axes: [...], series: [...], _extras? },
  _extras?
}
```

## Resolve

```js
const chart = runtime.resolve('chartChart');
// → { parseChart, renderChart, parseBytes, bytesOf }
```

## API

| Method | Description |
|--------|-------------|
| `parseChart(el)` / `renderChart(c)` | Roundtrip of the `<chart:chart>` element. |
| `parseBytes(bytes)` / `bytesOf(c)` | Roundtrip of the chart sub-document `content.xml`. The `office:document-content` root written by `bytesOf` declares every namespace prefix the output uses (from `odfShared.ODF_PREFIXES`); a prefix the table does not know throws `RenderError('odf/render-error/namespace')`. |

## Examples

```js
const chart = runtime.resolve('chartChart');
const bytes = chart.bytesOf({ type: 'chart', chartClass: 'chart:bar' });
const model = chart.parseBytes(bytes);
```

## Notes

- Axes, series and data-points are preserved as flat typed objects with `{ kind, attrs, children?, _extras? }`.
- Unrecognized attributes/children of `<chart:chart>` survive in `_extras`.
- `parseBytes` tolerates a raw `<chart:chart>` root as well as the full `office:document-content` wrapper.

## See also

- [API reference](../README.md)
