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
| `renderImage({ href, mimeType?, _mimeTypeAttr? }, opts?)` | Builds `<draw:image>` with the xlink defaults. `mimeType` is written as the ODF 1.4 `draw:mime-type` attribute. `opts.mimeTypeAsRead: true` (default absent) writes it under the attribute it was read from (`_mimeTypeAttr`, `'loext:mime-type'` for a LibreOffice file) — `odt.write` passes it under `keepVersion` for a source older than ODF 1.3, which has no `draw:mime-type` on images. |
| `sniffImageType(bytes)` | Sniffs PNG/JPEG/GIF/BMP/WebP/TIFF/SVG. |
| `extensionFor(ct)` | Maps content-type → extension. |

## MIME type attribute

`renderImage` writes the image MIME type as `draw:mime-type`, the attribute
ODF 1.4 defines on `<draw:image>`. `parseImage` reads `draw:mime-type`, else
the LibreOffice extension `loext:mime-type`, into `mimeType`; an image with
only one of the two is not kept in `_extras`, and `_mimeTypeAttr:
'loext:mime-type'` (internal) records that the `loext` one was read. Re-writing
a document read from LibreOffice therefore converts `loext:mime-type` into
`draw:mime-type`, unless the write asks for the attribute as read
(`mimeTypeAsRead`, above). An image carrying **both** attributes reads the
`draw:mime-type` value as `mimeType` and keeps `loext:mime-type` in
`_extras.attrs`, which `renderImage` re-emits verbatim after the typed
attribute, like any other extra: the write has both. (Before, such an image
read the `loext` value and wrote only `draw:mime-type`.)
