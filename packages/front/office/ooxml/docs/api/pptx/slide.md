---
module: pptxSlide
category: ooxml/pptx
dependencies: [ooxmlErrors, xml, drawingml, pptxPicture, pptxTable, pptxChart, drawingmlShape, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# pptxSlide

> Shape model for slide / layout / master — `<p:sp>`, `<p:cSld>` (§19.3).

**Module** `pptxSlide` | **Source** `packages/front/office/ooxml/src/pptx/slide.js` | **Deps** `ooxmlErrors`, `xml`, `drawingml`, `pptxPicture`, `pptxTable`, `pptxChart`, `drawingmlShape`, `ooxmlShared` | **Worker-safe** yes

Slide, slide layout and slide master share the same body: a `<p:cSld>` holding a `<p:spTree>` of shapes / pictures / tables / charts. This module covers `<p:sp>` (a shape with a text body) — the dominant case — and delegates the other types to their dedicated modules. Everything else is preserved verbatim in `_extras`.

## Resolve

```js
const sl = runtime.resolve('pptxSlide');
// Returns: { parseShape, renderShape,
//            parseSlide, parseSlideLayout, parseSlideMaster,
//            serializeSlide, serializeSlideLayout, serializeSlideMaster,
//            slideBytes, slideLayoutBytes, slideMasterBytes,
//            parseCSld, renderCSld,
//            parseSpTree, renderSpTree,
//            fromTitleBody, extractTitle, extractBody,
//            P_NS, A_NS, R_NS,
//            REL_TYPE_SLIDE, REL_TYPE_SLIDE_LAYOUT, REL_TYPE_SLIDE_MASTER,
//            CT_SLIDE, CT_SLIDE_LAYOUT, CT_SLIDE_MASTER }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseShape` / `renderShape` | `<p:sp>` | Shape with a typed `txBody`. |
| `parseSlide` / `serializeSlide` / `slideBytes` | `<p:sld>` | Full slide. |
| `parseSlideLayout` / `serializeSlideLayout` / `slideLayoutBytes` | `<p:sldLayout>` | Layout. |
| `parseSlideMaster` / `serializeSlideMaster` / `slideMasterBytes` | `<p:sldMaster>` | Master. |
| `parseCSld` | `(<p:cSld>) => { name?, bg?, shapes, spTreeExtras?, _extras? }` | Common slide data, flattened. |
| `renderCSld` | `(obj, defaultName?) => element` | `<p:cSld>`. |
| `parseSpTree` | `(<p:spTree>) => { shapes, extras }` | Shape tree. |
| `renderSpTree` | `(shapes, extras?) => element` | `<p:spTree>`. |
| `fromTitleBody` | `({ title, body: string[] }) => slide` | Convenience builder — takes ONE object. |
| `extractTitle` | `(slide) => string \| null` | Text of the title placeholder. |
| `extractBody` | `(slide) => string[]` | Lines of the body placeholder (`[]` when absent). |
| `P_NS`, `A_NS`, `R_NS`, `REL_TYPE_*`, `CT_*` | string | Bindings. |

## Model

```js
shape := {
    type: 'shape',
    id?, name?,
    placeholder?: { type?, idx?, sz? },     // 'title'|'body'|'subTitle'|…
    nvSpPr?: xmlNode,            // preserved verbatim (locks, cNvSpPr, …)
    spPr?: xmlNode,              // raw <p:spPr>
    shapeProps?: object,         // typed view of spPr (drawingmlShape)
    style?: xmlNode,             // <p:style>
    txBody?: textBodyObject,     // drawingml.parseTextBody
    _extras?
}

slide := {
    type: 'slide' | 'slideLayout' | 'slideMaster',
    name?, bg?,                  // from <p:cSld>
    shapes: [shape | picture | table | chart | graphicFrame],
    spTreeExtras?: [xmlNode],    // <p:nvGrpSpPr>, <p:grpSpPr>, …
    clrMap?, clrMapOvr?,         // verbatim elements
    layoutIds?: [{ id, rId }],   // slideMaster only
    txStyles?: xmlNode,          // slideMaster only
    _extras?: [xmlNode]          // <p:timing>, <p:transition>, …
}
```

There is **no `cSld` level in the typed model**: `parseCSld`'s output is merged
into the slide object. Elements such as `<p:timing>` and `<p:transition>` are
not typed by this module and stay verbatim in `_extras`.

## Examples

### Title + body slide

```js
const sl = runtime.resolve('pptxSlide');
const slide = sl.fromTitleBody({
    title: 'Quarter Review',
    body: ['Revenue +12%', 'Costs -3%', 'Profit +18%']
});
const bytes = sl.slideBytes(slide);
```

### Extract a slide's text

```js
const slide = sl.parseSlide(pkg.parts['/ppt/slides/slide1.xml']);
console.log(sl.extractTitle(slide));
console.log(sl.extractBody(slide).join('\n'));
```

### Custom shapes

```js
const slide = {
    type: 'slide',
    shapes: [
        { type: 'shape',
          placeholder: { type: 'title' },
          txBody: dml.textBodyFromString('Custom title') },
        { type: 'shape',
          spPr: shapeMod.renderShapeProperties({
              geom: 'roundRect',
              cx: 3000000, cy: 1000000,
              fill: { color: '4472C4' }
          }),
          txBody: dml.textBodyFromString('Box') }
    ]
};
```

## Notes

- `placeholder.type` values: `'title'`, `'ctrTitle'`, `'subTitle'`, `'body'`, `'pic'`, `'chart'`, `'sldNum'`, `'dt'`, `'ftr'`, `'hdr'`, `'obj'`.
- `placeholder.idx` must match the index in the layout/master for positions and formatting to be inherited. `extractBody` picks the first shape whose `placeholder.idx` is set.
- `nvSpPr` is rebuilt automatically from `id` / `name` / `placeholder`; otherwise it is preserved verbatim.
- Layout and master reuse the same `parseShape`; only the relationships differ. Their root tag drives the error code — an unexpected root raises `ParseError('pptx/<tag>-bad-root')`.

## See also

- [drawingml](../drawingml/drawingml.md) — the text body model.
- [pptx-picture](./picture.md), [pptx-table](./table.md), [pptx-chart](./chart.md) — the other shape types.
- [pptx](./pptx.md) — orchestrator.
