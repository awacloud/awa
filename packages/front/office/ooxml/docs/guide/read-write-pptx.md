# Reading and writing `.pptx`

This guide demonstrates the pptx flow, first with [`pptx-large`](../api/bundles/pptx-large.md) (animations, transitions, layouts), then with [`pptx-full`](../api/bundles/pptx-full.md) (custom-geometry shapes).

**Prerequisites**: `@awacloud/ooxml` and `@awacloud/fw` installed and the install and runtime registration of [Getting started](./getting-started.md); the bundles come from `@awacloud/ooxml/bundles/pptx-large` and `@awacloud/ooxml/bundles/pptx-full`.

## Bootstrapping with `ModuleRuntime`

`register()` takes **one** descriptor per call — use `registerAll(array)`
for a batch. The extras are **not** re-exported by name from the
`@awacloud/ooxml` root; import the whole `extras` array instead:

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { pptxLargeBundle } from '@awacloud/ooxml/bundles/pptx-large';

fw.runtime.registerAll(fw_require);
fw.runtime.registerAll(modules);
fw.runtime.registerAll(extras);   // every opt-in extra; a bundle only
                                   // resolves the ones it declares
fw.runtime.register(pptxLargeBundle);

const pp = fw.runtime.resolve('pptxLargeBundle'); // enriched pptx instance
```

## Reading

```js
const bytes  = await fetch('/sample.pptx')
    .then(r => r.arrayBuffer())
    .then(b => new Uint8Array(b));
const result = pp.read(bytes);   // → { presentation, package, unmodelledParts }
```

The typed presentation lives under `result.presentation`:

```js
{
    type: 'presentation',
    slides: [{
        title?, body?,                 // high-level shorthand
        paragraphs?,                   // body-only shorthand
        shapes?                        // fully-typed form (see below)
    }],
    slideLayouts?: [...],   // auto-generated on write when absent
    slideMasters?: [...],   // auto-generated on write when absent
    theme?: { /* clrScheme, fontScheme, fmtScheme */ },
    sldSize?: { cx, cy, type? }
}
```

## Slide model

A parsed slide has **no `cSld`/`spTree` level** — `<p:cSld>` is flattened
directly into the slide object:

```js
{
    type: 'slide',
    name?, bg?,
    shapes: [
        { type: 'shape',  placeholder?, spPr?, txBody? },   // text shape
        { type: 'picture', /* … */ },                        // <p:pic>
        { type: 'table',   /* … */ },                         // <p:graphicFrame> table
        { type: 'chart',   /* … */ }                          // <p:graphicFrame> chart
    ],
    spTreeExtras?: [xmlNode],
    clrMap?, clrMapOvr?,
    _extras?: [xmlNode]     // <p:timing>, <p:transition>, … — NOT auto-typed
}
```

See [`pptxSlide`](../api/pptx/slide.md) for the full shape union and
[`pptx`](../api/pptx/pptx.md) for the top-level orchestrator.

## Layouts (with `pptx-large`)

```js
result.presentation.slideLayouts?.length;
```

`pmlLayoutsTyped` types the layout descriptors; see
[`pmlLayoutsTyped`](../api/extra/pml-layouts-typed.md).

## Concrete input → parsed object

Input `ppt/slides/slide1.xml` excerpt:

```xml
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp><p:spPr/><p:txBody><a:p><a:r><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>
```

After `read()`:

```js
{
    type: 'slide',
    shapes: [{ type: 'shape', txBody: { paragraphs: [{ runs: [{ value: 'Title' }] }] } }]
}
```

## Transitions and animations

`pmlTransitions` and `pmlAnimations` are `parse*`/`render*` extras — they
expose **no** `hydrate*` hook, so `pptxWalker` never invokes them
automatically. `<p:transition>` and `<p:timing>` stay as raw elements on
the slide's `_extras` until you decode them explicitly:

```js
const transitions = fw.runtime.resolve('pmlTransitions');
const transEl = (result.presentation.slides[0]._extras || [])
    .find(e => e.name === 'p:transition');
if (transEl) {
    const t = transitions.parseTransition(transEl);
    t.effect;   // { kind: 'fade', attrs: {} }
}

const animations = fw.runtime.resolve('pmlAnimations');
const timingEl = (result.presentation.slides[0]._extras || [])
    .find(e => e.name === 'p:timing');
if (timingEl) animations.parseTiming(timingEl);
```

See [`pmlTransitions`](../api/extra/pml-transitions.md) and [`pmlAnimations`](../api/extra/pml-animations.md).

## Mutating + writing

```js
// Add a new slide.
result.presentation.slides.push(
    pp.fromTitleBody({ title: 'New slide', body: ['First point'] })
);

// `write` takes the PRESENTATION, not the whole read() result.
const out = pp.write(result.presentation);
const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
});
```

`write()` produces the parts its model carries; a part `read()` did not
model (speaker notes, the notes master, the layouts no slide uses,
presentation and view properties, document properties, …) is not written
back — `read()` lists it in `result.unmodelledParts`.

## Advanced shapes (with `pptx-full`)

```js
import { pptxFullBundle } from '@awacloud/ooxml/bundles/pptx-full';

// `extras` (registered above) already covers pptx-full's own extras
// (dmlShapesAdvanced, transitional, legacyVml, pmlMisc, dmlChartMisc,
// dmlMainMisc, mathMisc) — `pptxLargeBundle` is already registered too
// (a declared dependency of pptxFullBundle):
fw.runtime.register(pptxFullBundle);

const ppFull = fw.runtime.resolve('pptxFullBundle');
const result = ppFull.read(bytes);

// Custom-geometry shapes: the raw `p:spPr` element is kept on each shape.
const shapesExt = fw.runtime.resolve('dmlShapesAdvanced');
const slide = result.presentation.slides[0];
const geomEl = slide.shapes
    .map(s => s.spPr && s.spPr.children.find(c => c.name === 'a:custGeom'))
    .find(Boolean);
const custGeom = geomEl && shapesExt.parseCustGeom(geomEl);
// → { avLst?, gdLst?, pathLst, … }
```

See [`dmlShapesAdvanced`](../api/extra/dml-shapes-advanced.md).

## See also

- [pptx-large bundle](../api/bundles/pptx-large.md)
- [pptx-full bundle](../api/bundles/pptx-full.md)
- [pptx core](../api/pptx/pptx.md)
- [pptxSlide model](../api/pptx/slide.md)
- [pmlAnimations](../api/extra/pml-animations.md)
- [Extending](./extending.md)
