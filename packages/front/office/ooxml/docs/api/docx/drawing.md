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
// Returns: { parseDrawing, renderDrawing, image, chart, shape,
//            sniffImageType, extensionFor, toEmu,
//            EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96,
//            REL_TYPE_IMAGE,
//            WP_NS, A_NS, PIC_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseDrawing` | `(<w:drawing>) => drawing` | Typed model. |
| `renderDrawing` | `(drawing) => element` | `<w:drawing>`. |
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
    docId?, docName?, description?, title?,
    distT?, distB?, distL?, distR?,    // surrounding space
    embedRef?: string,                 // r:id of the image
    srcRect?: { l?, t?, r?, b? },      // crop, 1/1000 of a percent (a:srcRect)
    prstGeom?: string,                 // 'rect' by default
    image?: { data?: Uint8Array, contentType?: string, rId?: string },
    anchorAttrs?: object,              // verbatim
    anchorChildren?: [xmlNode],
    _extras?: [xmlNode]
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
- `image.contentType` is sniffed when absent; the bytes are stored under `pkg.parts['/word/media/imageN.<ext>']`.
- The `anchor` mode is preserved but its attributes are not typed — edit `anchorAttrs` / `anchorChildren` directly. The written `<wp:anchor>` children follow the `CT_Anchor` order whatever the order of `anchorChildren`: `simplePos`, `positionH`, `positionV`, `extent`, `effectExtent`, the wrap element, `docPr`, `cNvGraphicFramePr`, `a:graphic`, then `wp14:sizeRelH`, `wp14:sizeRelV` and any other child in the order given (an `mc:AlternateContent` takes the place of what it holds).
- For chart parts, the chart XML goes to `/word/charts/chartN.xml` with a `…/chart` relationship.

## See also

- [drawingml-shape](../drawingml/shape.md) — `spPr` typing.
- [drawingml-chart](../drawingml/chart.md) — chart spec.
- [docx](./docx.md) — `imageRun` / `chartRun` / `shapeRun` builders.
