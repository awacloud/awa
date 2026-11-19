---
module: pptxFullBundle
category: bundles
dependencies: [pptxLargeBundle, dmlShapesAdvanced, transitional, legacyVml, pmlMisc, dmlChartMisc, dmlMainMisc, mathMisc, dmlTextDetails, pmlPartDetails, pmlPackageParts]
returns: object
worker-safe: true
status: complete
---

# pptxFullBundle

> Pre-wired bundle: `pptx-large` + two extras that type a read (the text details and the theme's script fonts; the part-level transition, timing and header / footer flags) + further toolkits.

**Module** `pptxFullBundle` | **Source** `packages/front/office/ooxml/src/bundles/pptx-full.js` | **Deps** `pptxLargeBundle` + 9 extras | **Worker-safe** yes

## Included

Everything in [`pptx-large`](./pptx-large.md) — its extras that type a read and its toolkits — plus:

**Typing a read** — a walker hook runs on every `read()` / `write()`:

- [`dmlTextDetails`](../extra/dml-text-details.md) — a run's fills, effects and script fonts; a paragraph's spacing, bullets and tabs; `endParaRPr`; the theme's script fonts (in `_extras` through `pptx-large`)
- [`pmlPartDetails`](../extra/pml-part-details.md) — a slide's, layout's or master's `transition`, `timing` and `hf` (in `_extras` through `pptx-large`)
- [`pmlPackageParts`](../extra/pml-package-parts.md) — a slide's `notes`, the `notesMaster` and `handoutMaster` with their themes, and with one slide master the layouts no slide uses (in `unmodelledParts` through `pptx-large`)

**Toolkits** — parse / render functions one calls on raw nodes; a `read()` or `write()` never calls them, so they add no typed field by themselves:

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
| `'pptxFullBundle'` | enriched `pptx` API | `pptxLargeBundle` + `dmlShapesAdvanced`, `transitional`, `legacyVml`, `pmlMisc`, `dmlChartMisc`, `dmlMainMisc`, `mathMisc`, `dmlTextDetails`, `pmlPartDetails`, `pmlPackageParts` |

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
