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

- `embedRef` is auto-assigned by `docx.write` (a fresh `rId` on the document's relationships part).
- `image.contentType` is sniffed when absent; the bytes are stored under `pkg.parts['/word/media/imageN.<ext>']`.
- The `anchor` mode is preserved but its attributes are not typed — edit `anchorAttrs` / `anchorChildren` directly.
- For chart parts, the chart XML goes to `/word/charts/chartN.xml` with a `…/chart` relationship.

## See also

- [drawingml-shape](../drawingml/shape.md) — `spPr` typing.
- [drawingml-chart](../drawingml/chart.md) — chart spec.
- [docx](./docx.md) — `imageRun` / `chartRun` / `shapeRun` builders.
