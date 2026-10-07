---
module: drawImage
category: odf/draw
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# drawImage

> Parse/render `<draw:image>` + image-byte magic sniffing.

**Module** `drawImage` | **Source** `packages/front/office/odf/src/draw/image.js` | **Worker-safe** yes

Model: `{ type: 'image', href, mimeType?, _extras? }`.

## API

| Method | Description |
|---------|-------------|
| `parseImage(el)` | Converts `<draw:image>`. |
| `renderImage({ href, mimeType? })` | Builds `<draw:image>` with the xlink defaults. `mimeType` is written as the ODF 1.4 `draw:mime-type` attribute. |
| `sniffImageType(bytes)` | Sniffs PNG/JPEG/GIF/BMP/WebP/TIFF/SVG. |
| `extensionFor(ct)` | Maps content-type → extension. |

## MIME type attribute

`renderImage` writes the image MIME type as `draw:mime-type`, the attribute
ODF 1.4 defines on `<draw:image>`. `parseImage` reads both `draw:mime-type`
and the LibreOffice extension `loext:mime-type` into `mimeType`; neither is
kept in `_extras`. Re-writing a document read from LibreOffice therefore
converts `loext:mime-type` into `draw:mime-type`. A hand-built model whose
`_extras.attrs` still carries `loext:mime-type` re-emits it verbatim after the
typed attribute, like any other extra.
