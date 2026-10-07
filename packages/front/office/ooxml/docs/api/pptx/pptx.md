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

Reads `ppt/presentation.xml` (sldMasterIdLst, sldIdLst, sldSize), parses each slide / layout / master through [`pptx-slide`](./slide.md) and resolves the theme through [`pptx-theme`](./theme.md). On write it **auto-generates a default master, layout and theme** when none are supplied — `p.write({ slides: [{ title, body }] })` produces a valid file.

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

- `opts.maxParts`, `opts.maxUncompressed` and `opts.maxRatio` override the archive limits of [`opc.read`](../opc/package.md) (defaults kept; `0` disables a check).
- `sldSize` defaults to `{ cx: 9144000, cy: 6858000, type: 'screen4x3' }` — 10×7.5 inches, i.e. 4:3. For standard widescreen 16:9 pass `{ cx: 12192000, cy: 6858000, type: 'screen16x9' }`.
- `markupCompatibility.process(root)` is called on read with its default options — no `supportedPrefixes`, so every `mc:Choice` falls through to its Fallback branch.
- Binary images go to `/ppt/media/imageN.<ext>`; chart XML to `/ppt/charts/chartN.xml`.
- Auto-generation is deliberately minimal (one Office master, a `Title and Content` layout, the Office theme) — for custom templates supply `slideMasters` + `slideLayouts` + `theme` explicitly.
- A parsed slide has no `cSld` level: `<p:cSld>` is flattened into the slide object (`shapes`, `name`, `bg`, …).

## See also

- [pptx-slide](./slide.md) — the per-slide shape model.
- [pptx-theme](./theme.md) — clrScheme + fontScheme.
- [pptx-picture](./picture.md), [pptx-table](./table.md), [pptx-chart](./chart.md) — shape parts.
- [Bundles guide](../bundles/README.md).
