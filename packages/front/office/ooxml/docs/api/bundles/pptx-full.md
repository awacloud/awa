---
module: pptxFullBundle
category: bundles
dependencies: [pptxLargeBundle, dmlShapesAdvanced, transitional, legacyVml, pmlMisc, dmlChartMisc, dmlMainMisc, mathMisc]
returns: object
worker-safe: true
status: complete
---

# pptxFullBundle

> Pre-wired bundle: `pptx-large` + remaining pptx-touching extras (every PresentationML schema element typed or preserved).

**Module** `pptxFullBundle` | **Source** `packages/front/office/ooxml/src/bundles/pptx-full.js` | **Deps** `pptxLargeBundle` + 7 extras | **Worker-safe** yes

## Included

Everything in [`pptx-large`](./pptx-large.md), plus:

- [`dmlShapesAdvanced`](../extra/dml-shapes-advanced.md) — custom-geometry shapes
- [`transitional`](../extra/transitional.md) — part 4 namespace mapping
- [`legacyVml`](../extra/legacy-vml.md) — standalone VML
- [`pmlMisc`](../extra/pml-misc.md) — PML long-tail sweeper
- [`dmlChartMisc`](../extra/dml-chart-misc.md) — chart long-tail sweeper
- [`dmlMainMisc`](../extra/dml-main-misc.md) — DrawingML long-tail sweeper
- [`mathMisc`](../extra/math-misc.md) — OMML long-tail sweeper

## Resolve

```js
const pp = runtime.resolve('pptxFullBundle');
// Returns the same enriched `pptx` instance `pptxLargeBundle` produced.
```

## API

Depends on `pptxLargeBundle` plus every remaining pptx-touching extra.

| Resolve key | Returns | Dependencies (auto-wired) |
|-------------|---------|---------------------------|
| `'pptxFullBundle'` | enriched `pptx` API | `pptxLargeBundle` + `dmlShapesAdvanced`, `transitional`, `legacyVml`, `pmlMisc`, `dmlChartMisc`, `dmlMainMisc`, `mathMisc` |

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { pptxLargeBundle } from '@awacloud/ooxml/bundles/pptx-large';
import { pptxFullBundle }  from '@awacloud/ooxml/bundles/pptx-full';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);   // the @awacloud/fw modules the package consumes
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.register(pptxLargeBundle);   // dependency of pptxFullBundle
runtime.register(pptxFullBundle);

const pp     = runtime.resolve('pptxFullBundle');
const bytes  = new Uint8Array(/* … */);
const result = pp.read(bytes);   // → { presentation, package, unmodelledParts }

// Custom-geometry shapes: the raw `p:spPr` element is kept on each shape,
// so the advanced extra can decode its `<a:custGeom>` child.
const shapes = runtime.resolve('dmlShapesAdvanced');
const slide  = result.presentation.slides[0];
const geomEl = slide.shapes
    .map(s => s.spPr && s.spPr.children.find(c => c.name === 'a:custGeom'))
    .find(Boolean);
const custGeom = geomEl && shapes.parseCustGeom(geomEl);   // { avLst?, gdLst?, pathLst, … }

const out = pp.write(result.presentation);
```

## Notes

- Photo albums and custom shows live in `pml-misc` (rare).
- Use `pptx-large` if the input never contains custom geometry or VML.
- `pptxLargeBundle` must be registered too — it is a declared dependency of `pptxFullBundle`.

## Breaking change

The previous `buildPptxFull(pptx, { xml })` imperative helper has been removed. Replace any call sites with the `ModuleRuntime` pattern shown above.

## See also

- [pptx-large](./pptx-large.md)
- [pptx core](../pptx/pptx.md)
- [Read+write pptx guide](../../guide/read-write-pptx.md)
