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
// doc: { addPage, addContent, addFont, addImage, addMetadata, openElement, markContent, closeElement, setVersion, setId, build }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `builder` | `(opts?: { pdfA?: '4' \| '2b', outputIntent?: { profile: Uint8Array, components: 1 \| 3 \| 4, identifier: string, info?: string }, pdfUA?: 1 \| 2, lang?: string }) => Builder` | Creates a fresh chainable builder (own closure state — call once per document). `pdfA` makes the document claim that PDF/A profile (see [PDF/A](#pdfa)); `pdfUA` (with its `lang`) that PDF/UA part (see [PDF/UA](#pdfua)). |

### `Builder` chain

| Method | Signature | Notes |
|--------|-----------|-------|
| `addPage` | `(opts?: { mediaBox?: number[4], cropBox?: number[4], rotate?: number, resources?: DictObj }) => Builder` | Starts a new page (default `mediaBox` is US Letter `[0,0,612,792]`); becomes the target of subsequent `addContent`/`addFont` calls. |
| `addContent` | `(data: string \| Uint8Array) => Builder` | Appends one content stream to the **current** page. |
| `addFont` | `(spec: { name: string, baseFont: string, subtype?: string, encoding?: 'WinAnsiEncoding' \| 'MacRomanEncoding' \| 'StandardEncoding', standard14?: Standard14Lookup, encodings?: EncodingLookup }) => Builder` | **Legacy shape** — registers a non-embedded font reference (`subtype` defaults to `Type1`) into the current page's `/Resources /Font`. The font dictionary is allocated once per distinct `(baseFont, subtype, encoding)` and shared by every page that registers it. Without `encoding` the emitted bytes are frozen. |
| `addFont` | `(spec: { name: string, embedded: SimpleEmbed \| CidEmbed }) => Builder` | **Embedded shape** — takes a [`pdfFontEmbed`](../font/embed.md) result and allocates every indirect it needs (see [Embedded fonts](#embedded-fonts)). Exactly one of `baseFont` / `embedded` must be given. |
| `addImage` | `(spec: { name, width, height, colorSpace, bitsPerComponent, data, filter?, decodeParms?, sMask? }) => Builder` | Allocates an **image XObject** as an indirect stream and registers it into the current page's `/Resources /XObject` (see [Images](#images)). Decodes nothing; emits no content operator. |
| `openElement` | `(type: string, props?: { alt?: string, lang?: string, attributes?: object[] }) => Builder` | Opens a structure element of `type` under the open one, at the top when none is open (see [Tagged content](#tagged-content)). |
| `markContent` | `() => number` | Returns the current page's next MCID (0, 1, … per page), made the open element's next kid; the caller writes the marked-content sequence. |
| `closeElement` | `() => Builder` | Closes the open structure element. |
| `addMetadata` | `(meta: object) => Builder` | Merges Info-dict fields. `Title`/`Author`/`Subject`/`Keywords`/`Creator`/`Producer`/`CreationDate`/`ModDate` are always emitted as PDF strings; other keys are kept only if their value is already a string. |
| `setVersion` | `(v: string) => Builder` | Overrides the PDF header version (default `'2.0'`, `'1.7'` under `pdfA: '2b'`); must match `/^\d\.\d$/`, and under `pdfA` equal the profile's version. |
| `setId` | `(a: string \| Uint8Array, b?: string \| Uint8Array) => Builder` | Sets the `/ID` pair — hex string or raw bytes; `b` defaults to `a`. Without it, a `'2.0'` document gets an `/ID` derived from its content ([`pdfWriter`](./writer.md#derived-id)). |
| `build` | `() => Uint8Array` | Assembles Catalog + Pages tree + page objects + Info (if any) + the XMP packet (under `pdfA`), then calls `pdfWriter.writeDocument`. |

Every chain method except `markContent` and `build` returns the same `Builder` instance.

### `addFont` spec — non-embedded shape

| Key | Type | Notes |
|-----|------|-------|
| `name` | `string` | Resource name registered under the page's `/Resources /Font` (e.g. `F1`). Required. |
| `baseFont` | `string` | `/BaseFont` name (e.g. `Helvetica`). Exactly one of `baseFont` / `embedded`. |
| `subtype` | `string` | `/Subtype`; defaults to `Type1`. |
| `encoding` | `'WinAnsiEncoding' \| 'MacRomanEncoding' \| 'StandardEncoding'` | Optional. One of the three predefined simple-font encodings of ISO 32000-1 § 9.6.6 / Annex D, emitted as `/Encoding /<name>` after the existing keys: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`. Absent (or `undefined`) emits no `/Encoding` key and the bytes are identical to a spec without the option — the default is unchanged. Any other value, or `encoding` combined with `embedded`, throws `pdf/builder/bad-font` with `{ name, encoding }` in its `context`. No `/Differences` or custom encoding dictionaries. |
| `standard14` | `Standard14Lookup \| false` | The `@awacloud/fonts` `standard14Lookup` API (`isStandard14`, `lookupStandard14`), as `pdfFont.typeFont` takes it: the dictionary also carries the `FirstChar`, `LastChar`, `Widths` and `FontDescriptor` PDF 2.0 requires for every simple font (see [Standard 14 metrics](#standard-14-metrics)). **Absent, a Standard 14 Type1 face takes the builder's own lookups** (since 2.0.0); `false` writes the legacy dictionary. |
| `encodings` | `EncodingLookup` | With `standard14`, for a Latin face in `MacRomanEncoding`, `StandardEncoding` or with no `encoding`: the `@awacloud/fonts` `encodingLookup` API (`lookupEncoding`), which names each code's glyph (see [Standard 14 metrics](#standard-14-metrics)). |

**Shared dictionary.** A non-embedded font dictionary is allocated once per
distinct `(baseFont, subtype, encoding)` and shared by every page that
registers it: `subtype` is the defaulted value, so `{ baseFont: 'Helvetica' }`
and `{ baseFont: 'Helvetica', subtype: 'Type1' }` share one object. Each page
(and each resource name) still gets its own `/Resources /Font` entry; only the
referenced object is shared. A 3-page document that registers the same four
faces on every page therefore carries 4 font dictionaries, not 12. A document
that never repeats a `(baseFont, subtype, encoding)` triple is byte-identical to
one built without sharing.

### Standard 14 metrics

PDF 2.0 no longer exempts the Standard 14 faces: `FirstChar`, `LastChar`,
`Widths` and `FontDescriptor` are required in every simple font dictionary
(ISO 32000-2 Table 109). Since 2.0.0 the builder writes them by default
for a Standard 14 Type1 face (it declares the fonts `standard14Lookup` and
`encodingLookup`); `standard14: false` writes the legacy dictionary, and so
does a builder factory composed without those lookups. With them, the
dictionary gains
`/FirstChar 32 /LastChar 255`, the 224 `Widths` of the face's Adobe
Core 14 metrics (1000 units per em) and an indirect `FontDescriptor`
(`FontName`, `Flags`, `FontBBox`, `ItalicAngle`, `Ascent`, `Descent`,
`CapHeight`, `XHeight`, `StemV`, `StemH`), one per face. A caller may still
pass its own `standard14` (and `encodings`) API, as `pdfFont.typeFont`
takes them.

The metrics' width tables are per WinAnsi code for the twelve Latin faces
and per built-in code for `Symbol` and `ZapfDingbats`, so the option takes
`encoding: 'WinAnsiEncoding'` for a Latin face and no `encoding` for the two
symbolic ones as they are. A Latin face in `MacRomanEncoding`,
`StandardEncoding` or with no `encoding` (its built-in encoding,
StandardEncoding) also needs `encodings`, the `@awacloud/fonts`
`encodingLookup` API (the builder's own by default): each code 32–255 takes the width of the glyph its
encoding names there — the WinAnsi table's (through WinAnsi's glyph
names), else the record's `extraWidths` (the glyphs WinAnsi lacks: `fi`,
`fl`, `Lslash`, `dotlessi`, the accents …), else 0 (a glyph the face does
not have, or an empty code). By default, a symbolic face with an `encoding`, a `baseFont` outside
the 14 and a `subtype` other than `Type1` keep the legacy dictionary. With
a `standard14` given, a Latin face in one of those encodings without
`encodings`, a symbolic face with an `encoding`, a `baseFont` outside the
14, a `subtype` other than `Type1`, or a `standard14` or `encodings` value
that is not such an API throws `pdf/builder/bad-font`. A
registration with the option and one without it are two dictionaries.

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '@awacloud/pdf';

const runtime = new ModuleRuntime();
for (const m of [...fw_require, ...pkg_require, ...modules]) runtime.register(m);
const { builder } = runtime.resolve('pdfBuilder');
const standard14 = runtime.resolve('standard14Lookup');   // from @awacloud/fonts

const bytes = builder()
    .addPage()
    .addFont({ name: 'F1', baseFont: 'Helvetica', encoding: 'WinAnsiEncoding', standard14 })
    .addFont({ name: 'F2', baseFont: 'Symbol', standard14 })
    .addContent('BT /F1 12 Tf 72 700 Td (Hello) Tj ET')
    .build();
// F1: << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding
//        /FirstChar 32 /LastChar 255 /Widths [278 278 355 …] /FontDescriptor n 0 R >>
```

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

Without `setId`, a `'2.0'` document (the default) is still written with a
trailer `/ID`, derived from its content: both halves are the first 16 bytes of
the SHA-256 of the bytes before the trailer, so the same builder calls give the
same bytes (see [Derived `/ID`](./writer.md#derived-id)). Another `setVersion`
value without `setId` gets no `/ID`.

## Embedded fonts

`addFont({ name, embedded })` accepts a [`pdfFontEmbed`](../font/embed.md)
result — `embedSimple` (a `SimpleEmbed`: `/TrueType`, or `/Type1` for CFF
outlines, + `/WinAnsiEncoding`) or `embedCid` (a `CidEmbed`: `/Type0` +
`/Identity-H` + `/CIDFontType2`, or `/CIDFontType0` for CFF outlines). The
adapter deliberately returns **inline** dicts and leaves every indirect to its
consumer; the builder is that consumer.

An `embedded` value must carry `fontFile` (`Uint8Array`), `descriptor`,
`toUnicodeStream` and either `fontDict` **or** `type0Dict` + `cidFontDict` —
never both — else `pdf/builder/bad-font`.

A composite embedding's descendant `CIDFont` carries its `/CIDSystemInfo`
`/Registry` and `/Ordering` as strings (`(Adobe)`, `(Identity)`), as
[`pdfFontEmbed.embedCid`](../font/embed.md#shape-cidembed) writes them: every
composite embedding built through `addFont` holds these two entries as strings
where earlier releases wrote names.

### What gets allocated

Per **embed result object**, not per `addFont` call:

| # | Indirect | Content | Route |
|---|----------|---------|-------|
| 1 | font-program stream | `<< /Length1 <fontFile.length> >>` over `embedded.fontFile`, or `<< /Subtype /OpenType >>` when `fontFileKey` is `FontFile3` (no `/Length1`: ISO 32000-2 Table 125 gives it to `FontFile` and `FontFile2` only) | both |
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

## Tagged content

`openElement`, `markContent` and `closeElement` declare the logical structure of a tagged document (ISO 32000-2 § 14.7, § 14.8); the caller writes the content and its marks:

```js
const b = builder().addPage().addFont({ name: 'F1', embedded }).openElement('Document').openElement('P');
const mcid = b.markContent();
b.addContent(`/P <</MCID ${mcid}>> BDC BT /F1 12 Tf 72 720 Td <...> Tj ET EMC`);
b.closeElement().addContent('/Artifact <</Type /Pagination>> BDC ... EMC').closeElement();
```

- `type` is a structure type, a name of letters and digits (`Document`, `P`, `H1`, `L`, `LI`, `Lbl`, `LBody`, `Table`, `TR`, `TH`, `TD`, `Figure`, …); `props.alt` its alternate description, `props.lang` its language, `props.attributes` its attribute objects — each `{ O, … }`, its values strings (written as names), finite numbers or booleans, such as `{ O: 'Table', Scope: 'Column' }` or `{ O: 'List', ListNumbering: 'Unordered' }`;
- `markContent()` hands out the MCIDs of the current page; an element may hold MCIDs of several pages (content broken over a page) and elements;
- `build()` writes the catalog's `/StructTreeRoot` and `/MarkInfo << /Marked true >>`, each element (`/S`, `/P`, `/Pg` the page of its first marked content, `/K` its kids in order — an MCID on another page than `/Pg` as a `/MCR` reference — `/Alt`, `/Lang`, `/A`), the `/ParentTree` and each marked page's `/StructParents`. Under `pdfUA: 2` every element and the root's `/Namespaces` carry the PDF 2.0 namespace (`http://iso.org/pdf2/ssn`); otherwise no namespace is written (the PDF 1.7 types).

Without `openElement` nothing of this is written. An element still open at `build()` is refused.

## PDF/A

`builder({ pdfA: '4' })` or `builder({ pdfA: '2b' })` writes a document claiming PDF/A-4 (ISO 19005-4) or PDF/A-2b (ISO 19005-2):

- `build()` adds an XMP packet ([`pdfXmp.packet`](../metadata/xmp.md)) as an unfiltered `/Type /Metadata /Subtype /XML` stream named by the catalog's `/Metadata`: its `pdfaid` (part 4 and rev 2020, or part 2 and conformance B) and the `addMetadata` fields;
- under `'4'` no trailer Info is written (the fields live in the XMP only) and the version is 2.0;
- under `'2b'` the Info is written as without `pdfA`, the XMP carrying the same values, the version is 1.7 and the trailer has an `/ID` — `setId`'s, else derived from the bytes ([`pdfWriter`](./writer.md#derived-id)'s `deriveId`);
- the catalog gets `/OutputIntents` with one `GTS_PDFA1` output intent, its `/DestOutputProfile` the first-party sRGB profile ([`pdfSrgbIcc`](../prepress/srgb-icc.md), `/N 3`, `sRGB IEC61966-2.1`, registry `http://www.color.org`) — or `opts.outputIntent`'s (`profile`, `components`, `identifier`, `info`), so device colours and transparency meet the profile's colour rules.

- every font must be embedded (`addFont({ embedded })`): a page that registered a font without a program (`addFont({ baseFont })`) makes `build()` throw `pdf/builder/pdfa-font-not-embedded`.

So built, the builder's documents — a blank page, text in embedded fonts, a soft-masked image — conform to both profiles as veraPDF 1.30.3 judges them (the `verapdf-pdfa` suite of `tools/office-scorecard`).

## PDF/UA

`builder({ pdfUA: 1, lang })` or `builder({ pdfUA: 2, lang })` writes a document claiming PDF/UA-1 (ISO 14289-1) or PDF/UA-2 (ISO 14289-2), `lang` its language (a BCP 47 tag, required):

- the catalog gets `/MarkInfo << /Marked true >>`, `/Lang`, `/ViewerPreferences << /DisplayDocTitle true >>` and, as unfiltered `/Metadata`, an XMP packet with `pdfuaid` (part 1; part 2 and rev 2024) and the `addMetadata` fields — a Title is required (`dc:title`, the title a viewer displays);
- the version is 1.7 (UA-1) or 2.0 (UA-2), the trailer has an `/ID` (`setId`'s, else derived), and every font must be embedded, as under `pdfA`;
- the Info dict is written as without `pdfUA`; `pdfUA` and `pdfA` are not written together.

The logical structure is declared with [Tagged content](#tagged-content)'s methods: an untagged document claiming a part fails the structure rules (ISO 14289-1 § 7.1, ISO 14289-2 § 8.2). So tagged, the builder's documents — a paragraph; a heading, a list and a page-number artifact; a figure with its alternate description and a table — conform to both parts as veraPDF 1.30.3 judges them (the `verapdf-pdfua` suite of `tools/office-scorecard`).

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/builder/no-page` | `RenderError` | `addContent`, `addFont`, `addImage` or `markContent` called before any `addPage`. |
| `pdf/builder/bad-bytes` | `RenderError` | `addContent` data is neither `string` nor `Uint8Array`. |
| `pdf/builder/bad-font` | `RenderError` | `addFont` spec has no `name`; or neither / both of `baseFont` and `embedded`; or an `embedded` value that is not a well-formed `pdfFontEmbed` result; or an `encoding` that is not one of the three predefined names, or is combined with `embedded`; or a `standard14` option that is not a `standard14Lookup` API, names a `baseFont` outside the 14 or a `subtype` other than `Type1`, or pairs a Latin face with an `encoding` other than `WinAnsiEncoding` without an `encodings` API (or a `Symbol` / `ZapfDingbats` face with any `encoding`), or an `encodings` value that is not an `encodingLookup` API. |
| `pdf/builder/bad-image` | `RenderError` | `addImage` spec is not an object, or one of `name` / `width` / `height` / `colorSpace` / `bitsPerComponent` / `data` / `filter` / `decodeParms` is missing or ill-typed, or an `sMask` carries a nested `sMask`. `err.context.keys` lists the offending keys; `err.context.sMask` is `true` when the failure is on the mask leg. |
| `pdf/builder/bad-metadata` | `RenderError` | `addMetadata` argument is not an object. |
| `pdf/builder/bad-version` | `RenderError` | `setVersion` value doesn't match `/^\d\.\d$/`. |
| `pdf/builder/bad-id` | `RenderError` | `setId` part is neither hex string nor `Uint8Array`. |
| `pdf/builder/bad-id-hex` | `RenderError` | `setId` hex string has odd length. |
| `pdf/builder/bad-box` | `RenderError` | `mediaBox`/`cropBox` is not a 4-element array. |
| `pdf/builder/bad-pdfa` | `ContractError` | `builder`'s `opts.pdfA` is neither `'4'` nor `'2b'`. |
| `pdf/builder/pdfa-version` | `ContractError` | `setVersion` under `pdfA` with another version than the profile's. |
| `pdf/builder/pdfa-font-not-embedded` | `ContractError` | `build()` under `pdfA` or `pdfUA` when a page registered a font without an embedded program; `context.fonts` names them, `context.claim` the claim. |
| `pdf/builder/bad-pdfua` | `ContractError` | `builder`'s `opts.pdfUA` is neither 1 nor 2. |
| `pdf/builder/pdfua-lang` | `ContractError` | `opts.pdfUA` without a non-empty `opts.lang`. |
| `pdf/builder/pdfua-with-pdfa` | `ContractError` | `opts.pdfUA` with `opts.pdfA`. |
| `pdf/builder/pdfua-version` | `ContractError` | `setVersion` under `pdfUA` with another version than the part's. |
| `pdf/builder/pdfua-title` | `ContractError` | `build()` under `pdfUA` without an `addMetadata` Title. |
| `pdf/builder/bad-struct-type` | `ContractError` | `openElement`'s `type` is not a name of letters and digits. |
| `pdf/builder/bad-struct-props` | `ContractError` | `openElement`'s `props` is not an object, or `alt` / `lang` is not a string, or `attributes` is not an array of objects each with a string `O` and string, finite-number or boolean values. |
| `pdf/builder/no-open-element` | `ContractError` | `markContent` or `closeElement` with no structure element open. |
| `pdf/builder/open-element` | `ContractError` | `build()` with a structure element still open; `context.open` lists the open types. |
| `pdf/builder/bad-output-intent` | `ContractError` | `builder`'s `opts.outputIntent` is not `{ profile: Uint8Array (non-empty), components: 1 \| 3 \| 4, identifier: string (non-empty), info?: string }`, or is given without `opts.pdfA`. |
| `pdf/builder/no-pages` | `RenderError` | `build()` called with zero pages added. |

It also propagates every code from [`pdfWriter`](./writer.md) (raised inside `writeDocument`).

## See also

- [`pdfWriter`](./writer.md) — the underlying emitter.
- [`pdfFontEmbed`](../font/embed.md) — produces the `embedded` value (`embedSimple` / `embedCid`).
- [`pdfParserObj`](../syntax/parser-obj.md) — typed-object constructors (`obj.dict`, `obj.ref`, …) used internally.
- [`pdfIncrementalWriter`](./incrementalWriter.md) · [`pdfEncryptedWriter`](./encryptedWriter.md)
