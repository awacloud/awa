---
module: dmlChartMisc
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlChartMisc

> DML chart — long-tail sweeper for `dml-chart.xsd` elements not handled by the other `dml-chart-*` modules.

**Module** `dmlChartMisc` | **Source** `packages/front/office/ooxml/src/extra/dml-chart-misc.js` | **Deps** `xml` | **Worker-safe** yes

Bulk parser/renderer for the residual chart vocabulary: `applyToFront/Back/Sides`, `headerFooter`, `pageMargins`, `pageSetup`, `protection`, `roundedCorners`, `clrMapOvr`, `extLst`, `userShapes`, `printSettings`, etc.

## Resolve

```js
const ext = dmlChartMisc.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseElement` / `renderElement` | — | dispatcher across ~100+ tag names |
| `ELEMENTS` | `string[]` | tag names handled here |

## Elements typed

`applyToEnd`, `applyToFront`, `applyToSides`, `area3DChart`, `auto`, `barChart`, `chartObject`, `clrMapOvr`, `crossBetween`, `crosses`, `crossesAt`, `evenFooter`, `evenHeader`, `firstFooter`, `firstHeader`, `headerFooter`, `lang`, `oddFooter`, `oddHeader`, `pageMargins`, `pageSetup`, `printSettings`, `protection`, `roundedCorners`, `userInterface`, `userShapes`, … (full list in `ELEMENTS`).

## Notes

- Each element is preserved as `{ kind, attrs, children: [...] }` so unknown nested content survives untouched.
- Used by xlsx-full and pptx-full to close the chart-coverage gap.

## See also

- [dml-chart-data-labels](./dml-chart-data-labels.md)
- [xlsx-full bundle](../bundles/xlsx-full.md)
