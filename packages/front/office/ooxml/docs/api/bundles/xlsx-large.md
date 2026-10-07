---
module: xlsxLargeBundle
category: bundles
dependencies: [xlsx, smlPivotTables, smlCalculation, smlSheetConfig, smlWorkbookConfig, dmlChartDataLabels, dmlChartTrendlines, dmlChartAxesAdvanced, dmlChart3d, dmlChartOtherTypes, dmlEffects, dmlFillsAdvanced]
returns: object
worker-safe: true
status: complete
---

# xlsxLargeBundle

> Pre-wired bundle: xlsx core + P0 + P1 extras (~95% real-world xlsx coverage).

**Module** `xlsxLargeBundle` | **Source** `packages/front/office/ooxml/src/bundles/xlsx-large.js` | **Deps** `xlsx` + 11 extras | **Worker-safe** yes

## Included

- [`smlPivotTables`](../extra/sml-pivot-tables.md) — pivot tables + cache
- [`smlCalculation`](../extra/sml-calculation.md) — calcChain + calcPr
- [`smlSheetConfig`](../extra/sml-sheet-config.md) — per-sheet config
- [`smlWorkbookConfig`](../extra/sml-workbook-config.md) — workbook-level config
- [`dmlChartDataLabels`](../extra/dml-chart-data-labels.md) — dLbls / dLbl
- [`dmlChartTrendlines`](../extra/dml-chart-trendlines.md) — trendlines / errBars
- [`dmlChartAxesAdvanced`](../extra/dml-chart-axes-advanced.md) — full axis config
- [`dmlChart3d`](../extra/dml-chart-3d.md) — 3D scenes
- [`dmlChartOtherTypes`](../extra/dml-chart-other-types.md) — bubble / radar / stock / ofPie
- [`dmlEffects`](../extra/dml-effects.md) — shadow / glow / blur / 3D
- [`dmlFillsAdvanced`](../extra/dml-fills-advanced.md) — gradient / image / pattern fills

## Resolve

```js
const xl = runtime.resolve('xlsxLargeBundle');
// Returns the enriched `xlsx` instance — same shape as resolving 'xlsx'.
```

## API

Pure fw factory descriptor — register it and its dependencies in a `ModuleRuntime`, then resolve `'xlsxLargeBundle'`.

| Resolve key | Returns | Dependencies (auto-wired) |
|-------------|---------|---------------------------|
| `'xlsxLargeBundle'` | enriched `xlsx` API (same shape as [`xlsx`](../xlsx/xlsx.md)) | `xlsx`, plus every extra listed under [Included](#included) |

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { xlsxLargeBundle } from '@awacloud/ooxml/bundles/xlsx-large';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);   // the @awacloud/fw modules the package consumes
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.register(xlsxLargeBundle);

const xl     = runtime.resolve('xlsxLargeBundle');
const bytes  = new Uint8Array(/* … */);
const result = xl.read(bytes);   // → { workbook, package, unmodelledParts }

// The typed workbook lives under `result.workbook`; each sheet's `rows`
// is an array of rows, each row an array of cells.
console.log(result.workbook.sheets[0].rows[0][0]);
// → { type: 'cell', value: 'Region', t: 's' }

// Mutate cells (core API) and write back — `write` takes the WORKBOOK.
result.workbook.sheets[0].rows[0][0] = { type: 'cell', value: 'Updated' };
const out = xl.write(result.workbook);
```

Reach the extra typing helpers through the runtime and apply them to the
raw parts you care about:

```js
const pivots = runtime.resolve('smlPivotTables');
const def    = pivots.parsePivotTable(pivotTableXmlText);
```

## Notes

- `xlsx.read(bytes, readOpts?)` returns `{ workbook, package, unmodelledParts }` and `xlsx.write(workbook)` takes the workbook — there is no second options argument on the xlsx writer.
- The SpreadsheetML and chart extras in this bundle expose parse/render helpers only; none of them declares a `hydrateWorkbook` / `hydrateSheet` / `hydrateSettings` hook, so [`xlsxWalker`](../xlsx/xlsx.md) does not enrich the read result automatically. Resolve the extra and call its helpers on the relevant part.
- Pivot-table parts are reached through their own relationships — see [smlPivotTables](../extra/sml-pivot-tables.md) for the data shape.
- For ActiveX form controls and advanced shapes use [`xlsx-full`](./xlsx-full.md).

## Breaking change

The previous `buildXlsxLarge(xlsx, { xml })` imperative helper has been removed. Replace any call sites with the `ModuleRuntime` pattern shown above.

## See also

- [xlsx-full](./xlsx-full.md)
- [xlsx core](../xlsx/xlsx.md)
- [Read+write xlsx guide](../../guide/read-write-xlsx.md)
