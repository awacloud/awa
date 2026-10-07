---
module: pptxLargeBundle
category: bundles
dependencies: [pptx, pmlAnimations, pmlTransitions, pmlNotes, pmlLayoutsTyped, dmlChartDataLabels, dmlChartTrendlines, dmlChartAxesAdvanced, dmlChart3d, dmlChartOtherTypes, mathAdvanced, dmlEffects, dmlFillsAdvanced]
returns: object
worker-safe: true
status: complete
---

# pptxLargeBundle

> Pre-wired bundle: pptx core + P0 + P1 extras (~95% real-world pptx coverage).

**Module** `pptxLargeBundle` | **Source** `packages/front/office/ooxml/src/bundles/pptx-large.js` | **Deps** `pptx` + 12 extras | **Worker-safe** yes

## Included

- [`pmlAnimations`](../extra/pml-animations.md) — slide timing graph
- [`pmlTransitions`](../extra/pml-transitions.md) — slide transitions
- [`pmlNotes`](../extra/pml-notes.md) — notes / handout master
- [`pmlLayoutsTyped`](../extra/pml-layouts-typed.md) — typed layout descriptors
- [`dmlChartDataLabels`](../extra/dml-chart-data-labels.md) — dLbls / dLbl
- [`dmlChartTrendlines`](../extra/dml-chart-trendlines.md) — trendlines / errBars
- [`dmlChartAxesAdvanced`](../extra/dml-chart-axes-advanced.md) — full axis config
- [`dmlChart3d`](../extra/dml-chart-3d.md) — 3D scenes
- [`dmlChartOtherTypes`](../extra/dml-chart-other-types.md) — bubble / radar / stock / ofPie
- [`mathAdvanced`](../extra/math-advanced.md) — slide text bodies can carry OMML
- [`dmlEffects`](../extra/dml-effects.md) — shadow / glow / blur / 3D
- [`dmlFillsAdvanced`](../extra/dml-fills-advanced.md) — gradient / image / pattern fills

## Resolve

```js
const pp = runtime.resolve('pptxLargeBundle');
// Returns the enriched `pptx` instance — same shape as resolving 'pptx'.
```

## API

Pure fw factory descriptor — register it and its dependencies in a `ModuleRuntime`, then resolve `'pptxLargeBundle'`.

| Resolve key | Returns | Dependencies (auto-wired) |
|-------------|---------|---------------------------|
| `'pptxLargeBundle'` | enriched `pptx` API (same shape as [`pptx`](../pptx/pptx.md)) | `pptx`, plus every extra listed under [Included](#included) |

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { pptxLargeBundle } from '@awacloud/ooxml/bundles/pptx-large';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);   // the @awacloud/fw modules the package consumes
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.register(pptxLargeBundle);

const pp     = runtime.resolve('pptxLargeBundle');
const bytes  = new Uint8Array(/* … */);
const result = pp.read(bytes);   // → { presentation, package, unmodelledParts }

// The typed presentation lives under `result.presentation`.
const slide = result.presentation.slides[0];
console.log(slide.shapes.length);
console.log(result.presentation.slideLayouts?.length);

// Transitions and timing stay as raw elements on the slide's `_extras`
// until you decode them with the extra's own helpers:
const transitions = runtime.resolve('pmlTransitions');
const transEl     = (slide._extras || []).find(e => e.name === 'p:transition');
if (transEl) console.log(transitions.parseTransition(transEl));

// Write back — `write` takes the PRESENTATION.
const out = pp.write(result.presentation);
```

## Notes

- `pptx.read(bytes)` returns `{ presentation, package, unmodelledParts }` and `pptx.write(presentation)` takes the presentation object — a parsed slide is `{ type:'slide', shapes:[…], name?, bg?, clrMapOvr?, _extras? }`, there is no `cSld` / `spTree` level in the typed model.
- Of the 12 extras above, none declares the `hydrateRunProperties` / `hydrateParagraphProperties` / `hydrateSettings` hooks that [`pptxWalker`](../pptx/pptx.md) dispatches, so the read result is not enriched automatically; resolve the extra and call its parse/render helpers on the elements preserved in `_extras`.
- Animations and transitions attach to the slide root — masters and layouts can carry their own (rare).
- For advanced custom-geometry shapes use [`pptx-full`](./pptx-full.md).

## Breaking change

The previous `buildPptxLarge(pptx, { xml })` imperative helper has been removed. Replace any call sites with the `ModuleRuntime` pattern shown above.

## See also

- [pptx-full](./pptx-full.md)
- [pptx core](../pptx/pptx.md)
- [Read+write pptx guide](../../guide/read-write-pptx.md)
