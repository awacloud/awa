---
module: pdfImages
category: pdf/content
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfImages

> Typing of XObjects (Image + Form) — ISO 32000-2 §8.9 / §8.10.

**Module** `pdfImages` | **Source** `packages/front/office/pdf/src/content/images.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Types an XObject stream into a flat, ready-to-consume structure. It
distinguishes:

- **Image XObject** (`/Subtype /Image`, §8.9) — carries Width, Height,
  ColorSpace, BitsPerComponent, Filter, DecodeParms, Decode, ImageMask, Mask,
  SMask, Interpolate, Intent, Metadata.
- **Form XObject** (`/Subtype /Form`, §8.10) — carries FormType, BBox, Matrix,
  Resources, Group, Metadata, StructParent(s).

The `raw` bytes are passed through **untouched**: it is the consumer's job
(renderer) to decode the `/Filter` chain via `pdfFilterDispatch`.

## Resolve

```js
const im = runtime.resolve('pdfImages');
// Returns: { typeImageXObject, typeFormXObject, typeXObject }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeImageXObject` | `(stream) => ImageXObject` | Image typing. |
| `typeFormXObject` | `(stream) => FormXObject` | Form typing. |
| `typeXObject` | `(stream) => ImageXObject \| FormXObject \| Opaque` | Dispatch on `/Subtype`. |

### `ImageXObject` shape

```js
{
    kind: 'image',
    width, height,
    bitsPerComponent,        // int or null
    colorSpace, filter, decodeParms, decode,   // raw typed objects or null
    imageMask,               // boolean, default false
    mask, sMask,
    interpolate,             // boolean, default false
    intent,                  // name or null
    metadata,
    raw: Uint8Array, dict
}
```

### `FormXObject` shape

```js
{
    kind: 'form',
    formType: 1,             // /FormType, default 1
    bbox:   [llx,lly,urx,ury] | null,
    matrix: [1,0,0,1,0,0],   // default
    resources, group, metadata,
    structParents, structParent,   // ints or null
    raw: Uint8Array, dict
}
```

When `/Subtype` is neither `Image` nor `Form` (e.g. the PostScript XObject
deprecated in PDF 2.0), `typeXObject` returns `{ kind: <subtype>, raw, dict }`.

## Examples

### Type an XObject invoked by `Do`

```js
const im = runtime.resolve('pdfImages');
const xobjName = op.args[0].value;  // 'Im1'
const stream = doc._raw.resolve(resources.XObject[xobjName]);
const typed = im.typeXObject(stream);
if (typed.kind === 'image') console.log(typed.width, typed.height);
```

### Type an image directly

```js
const img = im.typeImageXObject(stream);
img.colorSpace;   // typed name / array / ref
img.filter;       // typed name / array
img.raw;          // Uint8Array — feed to pdfFilterDispatch
```

### Form XObject with a BBox

```js
const form = im.typeFormXObject(stream);
form.bbox;        // [0, 0, 612, 792]
form.matrix;      // [1, 0, 0, 1, 0, 0]
form.resources;   // dict — pass to typeResources
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/image/not-stream` | `ParseError` | Argument is not a typed stream. |
| `pdf/image/wrong-subtype` | `ParseError` | `/Subtype` present but not `/Image`. |
| `pdf/image/missing-dim` | `ParseError` | `/Width` or `/Height` missing. |
| `pdf/form-xobj/not-stream` | `ParseError` | Argument is not a typed stream. |
| `pdf/form-xobj/wrong-subtype` | `ParseError` | `/Subtype` present but not `/Form`. |
| `pdf/xobject/not-stream` | `ParseError` | Argument is not a typed stream. |
| `pdf/xobject/bad-type` | `ParseError` | `/Type` present but not `/XObject`. |
| `pdf/xobject/missing-subtype` | `ParseError` | `/Subtype` missing. |

## See also

- [`pdfContentStream`](./stream.md) — emits the `Do` op.
- [`pdfResources`](../document/resources.md) — resolves the named `/XObject`.
- [Filters](../syntax/filters/README.md) — decoding `raw`.
