---
module: pptxPicture
category: ooxml/pptx
dependencies: [xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# pptxPicture

> `<p:pic>` — slide-level pictures (§19.3.1.37).

**Module** `pptxPicture` | **Source** `packages/front/office/ooxml/src/pptx/picture.js` | **Deps** `xml`, `ooxmlShared` | **Worker-safe** yes

Lives inside `<p:spTree>` alongside `<p:sp>`. References the binary image through `<a:blip r:embed="rId…">`. The content type is sniffed automatically from the magic bytes (PNG, JPEG, GIF, BMP, WebP).

## Resolve

```js
const pic = runtime.resolve('pptxPicture');
// Returns: { parsePicture, renderPicture, image,
//            sniffImageType, extensionFor, extToContentType, toEmu,
//            EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96,
//            REL_TYPE_IMAGE, A_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parsePicture` / `renderPicture` | `(<p:pic>)` / `(pic)` | Round-trip. |
| `image` | `(bytes, opts?) => pic` | Convenience builder (defaults: `cx: '4in'`, `cy = cx * 0.75`, `prstGeom: 'rect'`). |
| `sniffImageType` | `(bytes) => 'image/png'\|…` | MIME from the magic bytes. |
| `extensionFor` | `(contentType) => 'png'\|…` | Mapping. |
| `extToContentType` | `(ext) => string` | Inverse mapping. |
| `toEmu` | `('2in'\|number\|…) => number` | EMU conversion. |
| `EMU_PER_INCH`, `EMU_PER_CM`, `EMU_PER_PT`, `EMU_PER_PX_96` | number | EMU constants. |
| `REL_TYPE_IMAGE`, `A_NS` | string | Bindings. |

## Model

```js
{
    type: 'picture',
    id?, name?, description?,        // alt text
    cx, cy,                          // EMU
    offsetX?, offsetY?,              // EMU
    prstGeom?: 'rect',               // or 'roundRect', 'ellipse' (clipping)
    embedRef?: string,               // r:embed
    linkRef?: string,                // r:link — external image (rare)
    image?: { data?: Uint8Array, contentType?: string },
    title?: string,
    _extras?
}
```

## Examples

### Inline 4×3" picture

```js
const pic = runtime.resolve('pptxPicture');
const shape = pic.image(pngBytes, {
    cx: '4in', cy: '3in',
    offsetX: '1in', offsetY: '1in',
    description: 'Company logo'
});
slide.shapes.push(shape);   // a parsed slide exposes `shapes` directly
```

### Round-trip

```js
const node = pic.parsePicture(picXmlEl);
node.cx *= 2;          // double the width
const xmlOut = pic.renderPicture(node);
```

## Notes

- Coordinates are EMU (1 inch = 914400). `toEmu('2cm')` → 720000.
- `prstGeom` lets you **clip** the picture to a shape (rounded rectangle, ellipse).
- `embedRef` is auto-assigned by `pptx.write` (a unique rId on the slide's relationships); `image(bytes, { rId })` sets it explicitly.
- When only `image.data` is supplied (no `embedRef`), a new `r:id` and media part are created on write.
- `linkRef` maps to `r:link` for externally-referenced images — those carry no `image.data`.

## See also

- [pptx-slide](./slide.md) — host (the shape tree).
- [pptx](./pptx.md) — `picture` re-exported as a convenience builder.
- [drawingml-shape](../drawingml/shape.md) — `prstGeom` presets.
