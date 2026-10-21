---
module: pptx
category: ooxml/pptx
dependencies: [ooxmlErrors, opcPackage, xml, opcRelationships, pptxSlide, pptxTheme, markupCompatibility, pptxPicture, drawingmlChart, drawingmlShape, pptxWalker, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# pptx

> `.pptx` reader/writer (PresentationML, ECMA-376 part 1 §19) — top-level orchestrator.

**Module** `pptx` | **Source** `packages/front/office/ooxml/src/pptx/pptx.js` | **Deps** `ooxmlErrors`, `opcPackage`, `xml`, `opcRelationships`, `pptxSlide`, `pptxTheme`, `markupCompatibility`, `pptxPicture`, `drawingmlChart`, `drawingmlShape`, `pptxWalker`, `ooxmlShared` | **Worker-safe** yes

Reads `ppt/presentation.xml` (sldMasterIdLst, sldIdLst, and the slide size `p:sldSz` as `sldSize`; a `p:sldSize` written by earlier versions of this package is read too), parses each slide / layout / master through [`pptx-slide`](./slide.md) and resolves the theme through [`pptx-theme`](./theme.md). On write it **auto-generates a default master, layout and theme** when none are supplied — `p.write({ slides: [{ title, body }] })` produces a valid file.

## Resolve

```js
const p = runtime.resolve('pptx');
// Returns: { read, write, use,
//            fromTitleBody, extractTitle, extractBody,
//            picture, chart, shape,
//            PRESETS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `read` | `(bytes: Uint8Array, opts?) => { presentation, package, unmodelledParts }` | Typed model + raw package + loss record. See [Result shape](#result-shape). |
| `write` | `(presentation) => Uint8Array` | `.pptx` bytes. Single argument — no options object. |
| `use` | `(...exts) => api` | Plugs extras in. |
| `fromTitleBody` | `({ title, body: string[] }) => slide` | Title+body slide builder. Takes ONE object. |
| `extractTitle` | `(slide) => string \| null` | Text of the title placeholder. |
| `extractBody` | `(slide) => string[]` | Lines of the body placeholder (`[]` when absent). |
| `picture` | `(bytes, opts?) => slideShape` | Image shape. |
| `chart` | `(spec, opts?) => slideShape` | Chart shape. |
| `shape` | `(geom\|spec, opts?) => slideShape` | Preset shape. |
| `PRESETS` | object | Re-export of `drawingmlShape.PRESETS`. |

## Result shape

```js
{
    presentation,                               // see Model below
    package,                                    // plain OPC package { contentTypes, parts, rels }
    unmodelledParts: [{ partName, contentType }]
}
```

`unmodelledParts` is always present (`[]` when every part was consumed): the
package parts the read did not consume, sorted by `partName`, with their
content type from `[Content_Types].xml` (`null` when none is declared).
`[Content_Types].xml` and the relationship parts are never listed. `write()`
produces the parts its model carries; a part `read()` did not model is not
written back — `read()` lists it in `unmodelledParts`. The read loads the
slides, the layouts they use, the slide masters and the first master's theme;
typical entries are therefore speaker notes and the notes master, the layouts
no slide uses, any other theme, presentation and view properties, table styles,
document properties and the thumbnail. `write()` takes `result.presentation`,
not this envelope.

A picture carries its bytes as `image: { data, contentType, rId }`,
resolved through the relationships of the part that holds it: a slide, a
slide layout or a slide master. A chart is resolved on slides only.

## Model

```js
{
    type: 'presentation',
    slides: [{
        title?, body?,                 // high-level shorthand
        paragraphs?,                   // body-only shorthand
        shapes?                        // fully-typed form
    }],
    slideLayouts?: [...],   // auto-generated when absent
    slideMasters?: [...],   // auto-generated when absent
    theme?: themeObject,
    sldSize?: { cx, cy, type? }
}
```

`write` normalises each slide: a slide carrying `shapes` is used as is,
otherwise `{ title, body }` goes through `fromTitleBody` and `{ paragraphs }`
becomes a single body placeholder.

## Examples

### Minimal presentation

```js
const p = runtime.resolve('pptx');
const presentation = {
    slides: [
        p.fromTitleBody({ title: 'Slide 1', body: ['First point', 'Second point'] }),
        p.fromTitleBody({ title: 'Slide 2', body: ['Plain text'] })
    ]
};
const bytes = p.write(presentation);
// → master + layout + theme auto-generated.
```

`body` must be an **array** of lines — `fromTitleBody` maps over it.

### Slide with a picture and a chart

```js
const presentation = {
    slides: [{
        title: 'Sales Q1',
        shapes: [
            p.picture(pngBytes, { cx: '4in', cy: '3in', offsetX: '1in' }),
            p.chart(chartMod.barChart({ series: [...] }),
                    { cx: '5in', cy: '3in', offsetX: '5.5in' })
        ]
    }]
};
```

### The `.use(...)` hook

```js
const p = runtime.resolve('pptx').use(someExtension);
const r = p.read(bytes);
```

`pptxWalker` dispatches only `hydrateRunProperties`, `hydrateParagraphProperties`
and `hydrateSettings` (plus their `dehydrate*` counterparts) across slides,
layouts, masters and the presentation root. An extension that exposes none of
those names is registered but never invoked. See the
[bundles guide](../bundles/README.md).

## Notes

- `opts.maxParts`, `opts.maxUncompressed`, `opts.maxRatio` and `opts.maxDepth` override the archive limits of [`opc.read`](../opc/package.md) (defaults kept; `0` disables a check).
- `opts.typedRunColors: true` types the text-run fills that a bare `'RRGGBB'` cannot express (theme colours, colour transforms) as `rPr.color = { rgb | schemeColor, mods? }` in slides, layouts, masters and table cells; by default such fills stay verbatim in `rPr._extras` and an `srgbClr` reads as its `'RRGGBB'` (see [drawingml](../drawingml/drawingml.md#text-body-model)).
- `opts.slideExtrasByPart: true` keeps the leftovers of each slide, layout and master's `<p:cSld>` in `cSldExtras` (an array, empty when there are none) and those of its root in `_extras`. By default both go to `_extras`, and a root with leftovers of its own replaces those of `<p:cSld>` (for example a `<p:cSld>` `<p:extLst>` beside a `<p:timing>`). `write` puts a split model's elements back at the level each came from — see [pptx-slide](./slide.md#model).
- `sldSize` defaults to `{ cx: 9144000, cy: 6858000, type: 'screen4x3' }` — 10×7.5 inches, i.e. 4:3. For standard widescreen 16:9 pass `{ cx: 12192000, cy: 6858000, type: 'screen16x9' }`.
- `markupCompatibility.process(root)` is called on read with its default options — no `supportedPrefixes`, so every `mc:Choice` falls through to its Fallback branch.
- Binary images go to `/ppt/media/imageN.<ext>`; chart XML to `/ppt/charts/chartN.xml`.
- Auto-generation is deliberately minimal (one Office master, a `Title and Content` layout, the Office theme) — for custom templates supply `slideMasters` + `slideLayouts` + `theme` explicitly.
- Every written master's relationships name the written layouts `rId1`…`rIdK`, in `slideLayouts` order (the theme comes after them). Its `<p:sldLayoutIdLst>` lists exactly those: an entry of `layoutIds` naming any other `rId` is not written (a read keeps the source master's whole list, while only the layouts the slides use are read), an entry for one of them is written with its `id` in the given order, and a written layout without an entry is appended with a fresh `id` above every kept layout id and every master id. The model itself is not modified.
- A parsed slide has no `cSld` level: `<p:cSld>` is flattened into the slide object (`shapes`, `name`, `bg`, …).

## See also

- [pptx-slide](./slide.md) — the per-slide shape model.
- [pptx-theme](./theme.md) — clrScheme + fontScheme.
- [pptx-picture](./picture.md), [pptx-table](./table.md), [pptx-chart](./chart.md) — shape parts.
- [Bundles guide](../bundles/README.md).
