---
module: pdfBuilder
category: pdf/document
dependencies: [pdfErrors, pdfParserObj, pdfWriter]
returns: object
worker-safe: true
status: complete
---

# pdfBuilder

> Chainable constructive DSL for assembling a PDF document from scratch.

**Module** `pdfBuilder` | **Source** `packages/front/office/pdf/src/document/builder.js` | **Deps** `pdfErrors`, `pdfParserObj`, `pdfWriter` | **Worker-safe** yes

An ergonomic layer over `pdfWriter.writeDocument`: instead of hand-assembling
a typed indirect-object graph, `builder()` returns a chainable object
(`addPage` → `addContent`/`addFont`/`addImage` → … → `build()`) that tracks
pages, content streams, fonts (referenced **or** [embedded](#embedded-fonts)),
[image XObjects](#images) and the Info dict internally, then
emits `Uint8Array` bytes on `.build()`. The returned chain is closure-based
(no `class`, no `this`), so it stays worker-transportable.

## Resolve

```js
const b = runtime.resolve('pdfBuilder');
// Returns: { builder }
const doc = b.builder();
// doc: { addPage, addContent, addFont, addImage, addMetadata, setVersion, setId, build }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `builder` | `() => Builder` | Creates a fresh chainable builder (own closure state — call once per document). |

### `Builder` chain

| Method | Signature | Notes |
|--------|-----------|-------|
| `addPage` | `(opts?: { mediaBox?: number[4], cropBox?: number[4], rotate?: number, resources?: DictObj }) => Builder` | Starts a new page (default `mediaBox` is US Letter `[0,0,612,792]`); becomes the target of subsequent `addContent`/`addFont` calls. |
| `addContent` | `(data: string \| Uint8Array) => Builder` | Appends one content stream to the **current** page. |
| `addFont` | `(spec: { name: string, baseFont: string, subtype?: string, encoding?: 'WinAnsiEncoding' \| 'MacRomanEncoding' \| 'StandardEncoding' }) => Builder` | **Legacy shape** — registers a non-embedded font reference (`subtype` defaults to `Type1`) into the current page's `/Resources /Font`. The font dictionary is allocated once per distinct `(baseFont, subtype, encoding)` and shared by every page that registers it. Without `encoding` the emitted bytes are frozen. |
| `addFont` | `(spec: { name: string, embedded: SimpleEmbed \| CidEmbed }) => Builder` | **Embedded shape** — takes a [`pdfFontEmbed`](../font/embed.md) result and allocates every indirect it needs (see [Embedded fonts](#embedded-fonts)). Exactly one of `baseFont` / `embedded` must be given. |
| `addImage` | `(spec: { name, width, height, colorSpace, bitsPerComponent, data, filter?, decodeParms?, sMask? }) => Builder` | Allocates an **image XObject** as an indirect stream and registers it into the current page's `/Resources /XObject` (see [Images](#images)). Decodes nothing; emits no content operator. |
| `addMetadata` | `(meta: object) => Builder` | Merges Info-dict fields. `Title`/`Author`/`Subject`/`Keywords`/`Creator`/`Producer`/`CreationDate`/`ModDate` are always emitted as PDF strings; other keys are kept only if their value is already a string. |
| `setVersion` | `(v: string) => Builder` | Overrides the PDF header version (default `'2.0'`); must match `/^\d\.\d$/`. |
| `setId` | `(a: string \| Uint8Array, b?: string \| Uint8Array) => Builder` | Sets the `/ID` pair — hex string or raw bytes; `b` defaults to `a`. |
| `build` | `() => Uint8Array` | Assembles Catalog + Pages tree + page objects + Info (if any), then calls `pdfWriter.writeDocument`. |

Every chain method except `build` returns the same `Builder` instance.

### `addFont` spec — non-embedded shape

| Key | Type | Notes |
|-----|------|-------|
| `name` | `string` | Resource name registered under the page's `/Resources /Font` (e.g. `F1`). Required. |
| `baseFont` | `string` | `/BaseFont` name (e.g. `Helvetica`). Exactly one of `baseFont` / `embedded`. |
| `subtype` | `string` | `/Subtype`; defaults to `Type1`. |
| `encoding` | `'WinAnsiEncoding' \| 'MacRomanEncoding' \| 'StandardEncoding'` | Optional. One of the three predefined simple-font encodings of ISO 32000-1 § 9.6.6 / Annex D, emitted as `/Encoding /<name>` after the existing keys: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`. Absent (or `undefined`) emits no `/Encoding` key and the bytes are identical to a spec without the option — the default is unchanged. Any other value, or `encoding` combined with `embedded`, throws `pdf/builder/bad-font` with `{ name, encoding }` in its `context`. No `/Differences` or custom encoding dictionaries. |

**Shared dictionary.** A non-embedded font dictionary is allocated once per
distinct `(baseFont, subtype, encoding)` and shared by every page that
registers it: `subtype` is the defaulted value, so `{ baseFont: 'Helvetica' }`
and `{ baseFont: 'Helvetica', subtype: 'Type1' }` share one object. Each page
(and each resource name) still gets its own `/Resources /Font` entry; only the
referenced object is shared. A 3-page document that registers the same four
faces on every page therefore carries 4 font dictionaries, not 12. A document
that never repeats a `(baseFont, subtype, encoding)` triple is byte-identical to
one built without sharing.

## Examples

### Minimal one-page document

```js
const { builder } = runtime.resolve('pdfBuilder');
const bytes = builder()
    .addPage({ mediaBox: [0, 0, 612, 792] })
    .build();
```

### Page with a font and content stream

```js
const bytes = builder()
    .addPage({ mediaBox: [0, 0, 612, 792] })
    .addFont({ name: 'F1', baseFont: 'Helvetica', subtype: 'Type1' })
    .addContent('BT /F1 12 Tf 100 700 Td (Hello) Tj ET')
    .build();
```

### Metadata + explicit `/ID`

```js
const bytes = builder()
    .addPage()
    .addMetadata({ Title: 'Demo', Author: 'awa' })
    .setId('0102030405060708090a0b0c0d0e0f10')
    .build();
```

## Embedded fonts

`addFont({ name, embedded })` accepts a [`pdfFontEmbed`](../font/embed.md)
result — `embedSimple` (a `SimpleEmbed`: `/TrueType` + `/WinAnsiEncoding`) or
`embedCid` (a `CidEmbed`: `/Type0` + `/Identity-H` + `/CIDFontType2`). The
adapter deliberately returns **inline** dicts and leaves every indirect to its
consumer; the builder is that consumer.

An `embedded` value must carry `fontFile` (`Uint8Array`), `descriptor`,
`toUnicodeStream` and either `fontDict` **or** `type0Dict` + `cidFontDict` —
never both — else `pdf/builder/bad-font`.

### What gets allocated

Per **embed result object**, not per `addFont` call:

| # | Indirect | Content | Route |
|---|----------|---------|-------|
| 1 | font-program stream | `<< /Length1 <fontFile.length> >>` (plus `/Subtype /OpenType` when `fontFileKey` is `FontFile3`) over `embedded.fontFile` | both |
| 2 | `FontDescriptor` | `embedded.descriptor` **cloned**, with `[fontFileKey] → 1 0 R` added | both |
| 3 | `/ToUnicode` | `embedded.toUnicodeStream` (the serializer refuses an inline stream) | both |
| 4 | `CIDFont` | `embedded.cidFontDict` cloned, `/FontDescriptor → 2 0 R` | CID only |
| 5 | font object | simple: `embedded.fontDict` cloned, `/FontDescriptor → 2 0 R`, `/ToUnicode → 3 0 R` · CID: `embedded.type0Dict` cloned, `/DescendantFonts [4 0 R]`, `/ToUnicode → 3 0 R` | both |

So a simple embedding costs **4** indirects and a composite one **5** — i.e.
**+3** and **+4** over the single object a legacy `addFont` allocates. Only
the last one lands in the page's `/Resources /Font`.

**Identity cache.** The builder keeps a `WeakMap` keyed by the `embedded`
object, so registering the *same* result on several pages (under any resource
names) allocates the graph **once** and every page references the same font
object number. Two distinct results — even from the same face — are two
graphs.

**No mutation.** Every patched dict is shallow-cloned; the caller's
`descriptor` / `fontDict` / `type0Dict` / `cidFontDict` come back exactly as
`pdfFontEmbed` returned them, so one result can be reused across builders.

### Example — `pdfFontEmbed` → `addFont` → `addContent`

```js
const fontsMod = runtime.resolve('fonts');
const embed    = runtime.resolve('pdfFontEmbed');
const { builder } = runtime.resolve('pdfBuilder');

const face = fontsMod.read(ttfBytes);
const text = 'Unicode ﬁ ⁄ ⁴';
const cps  = [...new Set([...text].map(c => c.codePointAt(0)))];

const e = embed.embedCid(face, cps);           // or embedSimple for WinAnsi
const hex = [...e.encode(text)]
    .map(b => b.toString(16).padStart(2, '0')).join('');

const bytes = builder()
    .addPage({ mediaBox: [0, 0, 612, 792] })
    .addFont({ name: 'F1', embedded: e })
    .addContent(`BT /F1 12 Tf 72 700 Td <${hex}> Tj ET`)
    .build();
```

`e.encode(text)` yields the character codes the written font expects — WinAnsi
bytes for the simple route, big-endian 2-byte CIDs for `Identity-H` — and
`e.widthOf(codePoint)` gives the 1000/em advance for layout.

## Images

`addImage({ name, … })` is the image counterpart of `addFont`'s embedded
route: it allocates the image as an **indirect stream object** — the
serializer refuses an inline one — and maps `name` to it in the current
page's `/Resources /XObject`.

**The seam decodes nothing.** The caller supplies data that is *already*
encoded plus the parameters that describe it. This module does not parse a
PNG `IHDR`, a JPEG `SOF`, or anything else; it does not transcode, resample
or colour-manage, and it never inspects `data` — the bytes reach the file
verbatim. Choosing `/Filter`, `/ColorSpace` and `/BitsPerComponent`
consistently with those bytes is the caller's job.

**And it places no ink.** `addImage` makes the resource *reachable*; drawing
it is a content-stream matter, so the caller emits the operators itself (see
the snippet below).

### Spec

| Key | Type | `/Key` | Notes |
|-----|------|--------|-------|
| `name` | `string` | — | Resource name **without** the leading slash (e.g. `'Im0'`); non-empty. |
| `width` | `number` | `/Width` | Positive safe integer. |
| `height` | `number` | `/Height` | Positive safe integer. |
| `colorSpace` | `string` | `/ColorSpace` | Emitted as a **name** (e.g. `'DeviceRGB'`, `'DeviceGray'`); non-empty. |
| `bitsPerComponent` | `number` | `/BitsPerComponent` | Positive safe integer. |
| `data` | `Uint8Array` | stream body | The encoded bytes, verbatim; `/Length` is added by the serializer. |
| `filter` | `string?` | `/Filter` | Emitted as a name (e.g. `'DCTDecode'`, `'FlateDecode'`). Omit for unfiltered data — then no `/Filter` is written. |
| `decodeParms` | `DictObj?` | `/DecodeParms` | **Passthrough** — must already be a typed `obj.dict`, exactly like `addPage`'s `resources`. |
| `sMask` | `object?` | `/SMask` | A soft mask: the same spec shape **minus `name`**, and with **no nested `sMask`**. |

The emitted dict is
`<< /Type /XObject /Subtype /Image /Width … /Height … /ColorSpace … /BitsPerComponent … >>`,
plus `/Filter`, `/DecodeParms` and `/SMask` when those were given.

### Soft masks

An `sMask` is allocated **first**, as its own image XObject, and the parent's
`/SMask` holds a reference to it. It is *referenced, never named*: it does
**not** appear in the page's `/XObject` dict, so no content operator can draw
it directly. A masked image therefore costs **2** indirects instead of 1.

```js
builder().addPage()
    .addImage({
        name: 'Im0', width: w, height: h,
        colorSpace: 'DeviceRGB', bitsPerComponent: 8,
        filter: 'FlateDecode', data: rgbDeflated,
        sMask: {                       // no `name` here
            width: w, height: h,
            colorSpace: 'DeviceGray', bitsPerComponent: 8,
            filter: 'FlateDecode', data: alphaDeflated
        }
    })
    .build();
```

### Resource precedence

`/XObject` follows the pre-existing `/Font` rule exactly: `addPage`'s
`resources` passthrough is merged **after** the built resource classes and
only fills keys the builder did not produce. So on a page that called
`addImage`, a caller-supplied `/XObject` is dropped; on a page that did not,
it passes through untouched. Nothing about that rule changed.

### Example — place a JPEG on the page

```js
const bytes = builder()
    .addPage({ mediaBox: [0, 0, 612, 792] })
    .addImage({
        name: 'Im0',
        width: 800, height: 600,          // the image's own pixel size
        colorSpace: 'DeviceRGB',
        bitsPerComponent: 8,
        filter: 'DCTDecode',              // the bytes ARE a JPEG already
        data: jpegBytes
    })
    // The seam placed the resource; the caller places the ink.
    // `cm` is width height 0 0 x y in USER SPACE units, not pixels:
    // 400x300 pt with its lower-left corner at (100, 400).
    .addContent('q 400 0 0 300 100 400 cm /Im0 Do Q')
    .build();
```

`q … Q` brackets the transform so the CTM is restored afterwards; the image
XObject's own space is the unit square, which is why the `cm` matrix carries
the on-page size directly.

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/builder/no-page` | `RenderError` | `addContent`, `addFont` or `addImage` called before any `addPage`. |
| `pdf/builder/bad-bytes` | `RenderError` | `addContent` data is neither `string` nor `Uint8Array`. |
| `pdf/builder/bad-font` | `RenderError` | `addFont` spec has no `name`; or neither / both of `baseFont` and `embedded`; or an `embedded` value that is not a well-formed `pdfFontEmbed` result; or an `encoding` that is not one of the three predefined names, or is combined with `embedded`. |
| `pdf/builder/bad-image` | `RenderError` | `addImage` spec is not an object, or one of `name` / `width` / `height` / `colorSpace` / `bitsPerComponent` / `data` / `filter` / `decodeParms` is missing or ill-typed, or an `sMask` carries a nested `sMask`. `err.context.keys` lists the offending keys; `err.context.sMask` is `true` when the failure is on the mask leg. |
| `pdf/builder/bad-metadata` | `RenderError` | `addMetadata` argument is not an object. |
| `pdf/builder/bad-version` | `RenderError` | `setVersion` value doesn't match `/^\d\.\d$/`. |
| `pdf/builder/bad-id` | `RenderError` | `setId` part is neither hex string nor `Uint8Array`. |
| `pdf/builder/bad-id-hex` | `RenderError` | `setId` hex string has odd length. |
| `pdf/builder/bad-box` | `RenderError` | `mediaBox`/`cropBox` is not a 4-element array. |
| `pdf/builder/no-pages` | `RenderError` | `build()` called with zero pages added. |

It also propagates every code from [`pdfWriter`](./writer.md) (raised inside `writeDocument`).

## See also

- [`pdfWriter`](./writer.md) — the underlying emitter.
- [`pdfFontEmbed`](../font/embed.md) — produces the `embedded` value (`embedSimple` / `embedCid`).
- [`pdfParserObj`](../syntax/parser-obj.md) — typed-object constructors (`obj.dict`, `obj.ref`, …) used internally.
- [`pdfIncrementalWriter`](./incrementalWriter.md) · [`pdfEncryptedWriter`](./encryptedWriter.md)
