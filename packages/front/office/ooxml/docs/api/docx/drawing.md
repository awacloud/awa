---
module: docxDrawing
category: ooxml/docx
dependencies: [xml, drawingmlShape, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# docxDrawing

> `<w:drawing>` — inline images, shapes and charts in WordprocessingML (§17.3.3).

**Module** `docxDrawing` | **Source** `packages/front/office/ooxml/src/docx/drawing.js` | **Deps** `xml`, `drawingmlShape`, `ooxmlShared` | **Worker-safe** yes

`<w:drawing>` wraps either `<wp:inline>` (in the text flow) or `<wp:anchor>` (positioned). Inline is the dominant case and is fully modelled; the anchor attributes (wrap, positioning) are preserved verbatim for round-trip fidelity. The content type is sniffed automatically from the binary signature (PNG, JPEG, GIF, BMP, WebP).

## Resolve

```js
const dr = runtime.resolve('docxDrawing');
// Returns: { parseDrawing, renderDrawing, withRelationships,
//            typedFields, keepSource, image, chart, shape,
//            sniffImageType, extensionFor, toEmu,
//            EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96,
//            REL_TYPE_IMAGE,
//            WP_NS, A_NS, PIC_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseDrawing` | `(<w:drawing>) => drawing` | Typed model. |
| `renderDrawing` | `(drawing) => element` | `<w:drawing>`: the kept source of an untouched drawing, else built from the typed fields (see Notes). |
| `renderRunChild` | `(drawing) => element` | The run child a drawing is written as: `renderDrawing`'s element, wrapped in the `mc:AlternateContent` it was read from when it carries `alternate` and was not edited (see Notes). |
| `withRelationships` | `({ links: Set, media: Set }, fn) => any` | Runs `fn` with those ids as the relationships of the part it renders (`docx.write` sets it around each part). |
| `typedFields` | `(drawing) => object` | The drawing's typed fields: all but `image`, `chart`, `alternate`, `embedRef`, `svgRef`, `chartRef`, `docId`, `_source` and `_read` (what `_read` holds a copy of). |
| `keepSource` | `(drawing, element) => drawing` | Makes `element` (a `<w:drawing>`) the drawing's source: `_source` set to it, `_read` to a copy of its current typed fields (in place). |
| `image` | `(bytes, opts?) => drawing` | Inline image builder. |
| `chart` | `(spec, opts?) => drawing` | Inline chart builder. |
| `shape` | `(spec, opts?) => drawing` | Inline shape builder (geometry preset or shapeProps). |
| `sniffImageType` | `(bytes) => string` | MIME type from the signature; `'application/octet-stream'` when unrecognised. |
| `extensionFor` | `(contentType) => 'png'\|'jpg'\|…` | Extension mapping. |
| `toEmu` | `('2in'\|number\|…) => number` | EMU conversion. |
| `EMU_PER_INCH`, `EMU_PER_CM`, `EMU_PER_PT`, `EMU_PER_PX_96` | number | EMU constants. |
| `REL_TYPE_IMAGE`, `WP_NS`, `A_NS`, `PIC_NS` | string | OPC / namespace bindings. |

## Model

```js
{
    type: 'drawing',
    mode: 'inline'|'anchor',
    cx: number, cy: number,            // EMU
    docId?, docName?, description?, title?,  // <wp:docPr>
    picName?, picId?,                  // <pic:cNvPr> of a picture
    distT?, distB?, distL?, distR?,    // surrounding space
    embedRef?: string,                 // r:id of the image
    svgRef?: string,                   // r:id of its SVG (asvg:svgBlip)
    srcRect?: { l?, t?, r?, b? },      // crop, 1/1000 of a percent (a:srcRect)
    prstGeom?: string,                 // 'rect' by default
    image?: { data?: Uint8Array, contentType?: string, rId?: string,
              svg?: { data: Uint8Array, contentType?: string, rId?: string } },
    anchorAttrs?: object,              // verbatim
    anchorChildren?: [xmlNode],
    _extras?: [xmlNode],
    alternate?: { requires: string, fallback: xmlNode|null },  // docx.read's alternateContent: 'choice'
    _source?: xmlNode,                 // the <w:drawing> element as read
    _read?: object                     // the typed fields as read
}
```

## Examples

### Inline image, 4×3 inches

```js
const dr = runtime.resolve('docxDrawing');
const drawing = dr.image(pngBytes, {
    cx: dr.toEmu('4in'), cy: dr.toEmu('3in'),
    description: 'Logo'
});
const para = {
    type: 'paragraph',
    children: [{ type: 'run', children: [drawing] }]
};
```

### Preset shape

```js
dr.shape('roundRect', {
    cx: '3in', cy: '1in',
    fill: { color: '4472C4' },
    name: 'Box'
});
```

### Inline chart

```js
const chartSpec = chartMod.barChart({ series: [...] });
dr.chart(chartSpec, { cx: '5in', cy: '3in' });
```

## Notes

- `embedRef` (and `chartRef` for a chart) is auto-assigned by `docx.write` (a fresh `rId` on the relationships part of the part holding the drawing: the document, or a header, footer, footnotes, endnotes or comments part) and patched in place on the drawing node.
- `docId` (`<wp:docPr id>`) is made unique by `docx.write` across the document body and its headers, footers, footnotes, endnotes and comments: a drawing keeps its `docId` when no drawing before it holds the same one; a later duplicate and a drawing without one get the smallest unused id from 1, patched in place like `embedRef`.
- `docName` (`<wp:docPr name>`) and `picName` (`<pic:cNvPr name>`) read as the source holds them, an empty name as `''`, and are written back as they are; a drawing with no `docName` is written as `'Picture'`, a picture with no `picName` takes its `docName`.
- `image.contentType` is sniffed when absent; the bytes are stored under `pkg.parts['/word/media/imageN.<ext>']`.
- An SVG picture is written as Word writes it: `image.data` is the PNG fallback in `a:blip`, and `image.svg.data` the SVG, written as `/word/media/imageN.svg` (`image/svg+xml`) and referenced by an `asvg:svgBlip` in the blip's `a:extLst` (the Office 2016 extension `{96DAC541-7B7A-43D3-8B79-37D633B846F1}`): Office 2016 and later draw the SVG, older readers the PNG. `image(bytes, { svg })` builds one; `docx.read` gives `svgRef` and `image.svg` for such a picture, and `docx.write` assigns `svgRef` (and `image.svg.rId`) as it does `embedRef`.
- The `anchor` mode is preserved but its attributes are not typed — edit `anchorAttrs` / `anchorChildren` directly. The written `<wp:anchor>` children follow the `CT_Anchor` order whatever the order of `anchorChildren`: `simplePos`, `positionH`, `positionV`, `extent`, `effectExtent`, the wrap element, `docPr`, `cNvGraphicFramePr`, `a:graphic`, then `wp14:sizeRelH`, `wp14:sizeRelV` and any other child in the order given (an `mc:AlternateContent` takes the place of what it holds).
- **Kept source.** `parseDrawing` keeps the `<w:drawing>` element it read in `_source`, and in `_read` a copy of the typed fields as read — all but `image`, `chart`, `embedRef`, `svgRef`, `chartRef` and `docId`, which the read resolves or the write assigns later. A drawing whose typed fields still equal `_read` is written from `_source`, so everything the model does not type stays (a picture's locks, blip state, line and fill, `cNvPr` description, extension list, a shape's style references, groups and canvases …); in it `wp:docPr id`, the picture's `a:blip r:embed`, its `asvg:svgBlip r:embed` and a chart's `c:chart r:id` are set to the drawing's `docId`, `embedRef`, `svgRef` and `chartRef`. Replacing a picture's `image.data` is not an edit: the source names the new picture. The drawing is built from its typed fields instead — losing what they do not hold, as before — when a typed field was edited, when a set id has no place in the source (a chart added to a picture, an SVG added) or a place no id, or when a relationship reference of the source names no relationship the written part holds: one of its hyperlinks, one of its carried relationships kept under its id (`docx.write`'s `carry`), or, for the typed ids, its pictures and charts. Called outside `docx.write`, `renderDrawing` holds no relationship: a source naming any other one is rebuilt. An extension may type `_source` through the walker's `hydrateDrawing` hook and write its edits back by replacing `_source` in `dehydrateDrawing` (`keepSource` sets `_source` and `_read` together; [docxWalker](./docx-walker.md)). The opt-in [dmlWpDrawing](../extra/dml-wp-drawing.md) does it for the typed fields: under it an edited drawing keeps what its source holds.
- **Alternate content.** A drawing read with `docx.read`'s `alternateContent: 'choice'` from an `mc:AlternateContent` carries `alternate`: the `Requires` of its `mc:Choice` and its `mc:Fallback` element (or `null`). `renderRunChild` writes it inside that construct again — `mc:Choice Requires` around the drawing, then the Fallback — while its typed fields equal `_read` (or when it has no `_read`); an edited drawing is written alone, as the Fallback would still show it as it was. `alternate` is not a typed field: changing it is not an edit.
- For chart parts, the chart XML goes to `/word/charts/chartN.xml` with a `…/chart` relationship.

## See also

- [drawingml-shape](../drawingml/shape.md) — `spPr` typing.
- [drawingml-chart](../drawingml/chart.md) — chart spec.
- [docx](./docx.md) — `imageRun` / `chartRun` / `shapeRun` builders.
