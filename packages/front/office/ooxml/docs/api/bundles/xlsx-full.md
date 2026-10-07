---
module: xlsxFullBundle
category: bundles
dependencies: [xlsxLargeBundle, smlFormControls, dmlShapesAdvanced, dmlXdrAdvanced, transitional, legacyVml, smlMisc, dmlChartMisc, dmlMainMisc]
returns: object
worker-safe: true
status: complete
---

# xlsxFullBundle

> Pre-wired bundle: `xlsx-large` + remaining xlsx-touching extras (every SpreadsheetML schema element typed or preserved).

**Module** `xlsxFullBundle` | **Source** `packages/front/office/ooxml/src/bundles/xlsx-full.js` | **Deps** `xlsxLargeBundle` + 8 extras | **Worker-safe** yes

## Included

Everything in [`xlsx-large`](./xlsx-large.md), plus:

- [`smlFormControls`](../extra/sml-form-controls.md) — ActiveX form controls
- [`dmlShapesAdvanced`](../extra/dml-shapes-advanced.md) — custom geometry
- [`dmlXdrAdvanced`](../extra/dml-xdr-advanced.md) — connectors / group shapes / absolute anchors
- [`transitional`](../extra/transitional.md) — part 4 namespace mapping
- [`legacyVml`](../extra/legacy-vml.md) — standalone VML
- [`smlMisc`](../extra/sml-misc.md) — SML long-tail sweeper
- [`dmlChartMisc`](../extra/dml-chart-misc.md) — chart long-tail sweeper
- [`dmlMainMisc`](../extra/dml-main-misc.md) — DrawingML long-tail sweeper

## Resolve

```js
const xl = runtime.resolve('xlsxFullBundle');
// Returns the same enriched `xlsx` instance `xlsxLargeBundle` produced.
```

## API

Depends on `xlsxLargeBundle` plus every remaining xlsx-touching extra.

| Resolve key | Returns | Dependencies (auto-wired) |
|-------------|---------|---------------------------|
| `'xlsxFullBundle'` | enriched `xlsx` API | `xlsxLargeBundle` + `smlFormControls`, `dmlShapesAdvanced`, `dmlXdrAdvanced`, `transitional`, `legacyVml`, `smlMisc`, `dmlChartMisc`, `dmlMainMisc` |

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { xlsxLargeBundle } from '@awacloud/ooxml/bundles/xlsx-large';
import { xlsxFullBundle }  from '@awacloud/ooxml/bundles/xlsx-full';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);   // the @awacloud/fw modules the package consumes
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.register(xlsxLargeBundle);   // dependency of xlsxFullBundle
runtime.register(xlsxFullBundle);

const xl     = runtime.resolve('xlsxFullBundle');
const bytes  = new Uint8Array(/* … */);
const result = xl.read(bytes);       // → { workbook, package, unmodelledParts }

// Form-control parts are reached through the extra's own helpers.
const controls = runtime.resolve('smlFormControls');
const parsed   = controls.parseControls(controlsXmlText);

const out = xl.write(result.workbook);
```

## Notes

- Comment text lives in the comments part, which the core reads and writes. The comment shapes live in a legacy VML drawing part that `read()` does not load (it is listed in `unmodelledParts`) and that `write()` generates anew from the comments model, so a source shape is not written back; the `legacyVml` extra parses and renders that VML when you need the shape itself.
- Like `xlsx-large`, none of the extras in this bundle declares a `hydrate*` walker hook, so the read result is not enriched automatically; resolve the extra and call its parse/render helpers on the part you need.
- `xlsxLargeBundle` must be registered too — it is a declared dependency of `xlsxFullBundle`.

## Breaking change

The previous `buildXlsxFull(xlsx, { xml })` imperative helper has been removed. Replace any call sites with the `ModuleRuntime` pattern shown above.

## See also

- [xlsx-large](./xlsx-large.md)
- [xlsx core](../xlsx/xlsx.md)
- [Read+write xlsx guide](../../guide/read-write-xlsx.md)
