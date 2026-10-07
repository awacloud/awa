---
module: chartTyped
category: odf/extra
dependencies: [xml, odfTypedHelper]
returns: object
worker-safe: true
status: complete
---

# chartTyped (P1)

> Opt-in extra : typed parse/render of the deep `chart:*` element tree —
> title/subtitle/footer, legend, plot-area, axis, categories, grid,
> series, domain, data-point, mean-value, regression-curve,
> error-indicator, stock-gain/loss/range, wall/floor, label-separator,
> equation, data-label.

**Module** `chartTyped` | **Source** `packages/front/office/odf/src/extra/chart-typed.js`

## Helpers

`parseChart(el)` / `renderChart(obj)`, `hydrateChart(c)` /
`dehydrateChart(c)`.
