---
module: pdfFontEmbed
category: pdf/font
dependencies: [pdfErrors, embedSubsetForPdf, embedFontDescriptor, embedCidSystemInfo, embedToUnicodeBuilder]
returns: object
worker-safe: true
status: complete
---

# pdfFontEmbed

> Adapter between `@awacloud/fonts/embed-pdf` and PDF dicts — ISO 32000-2 §9.6 / §9.7 / §9.10.

**Module** `pdfFontEmbed` | **Source** `packages/front/office/pdf/src/font/embed.js` | **Deps** `pdfErrors`, `embedSubsetForPdf`, `embedFontDescriptor`, `embedCidSystemInfo`, `embedToUnicodeBuilder` | **Worker-safe** yes

The only file in `@awacloud/pdf` that knows about `@awacloud/fonts/embed-pdf`. It takes an already-parsed font (the output of `fonts.read(bytes)`) plus a set of code points, and produces the PDF dicts needed to embed a **subset** of that font — either simple (`/TrueType` + `/WinAnsiEncoding`) or composite (`/Type0` + `/Identity-H` + `/CIDFontType2`). The subsetting itself is delegated to `subsetForPdf`; this module exists so the writer's call sites don't re-derive the wiring.

## Resolve

```js
const emb = runtime.resolve('pdfFontEmbed');
// Returns: { embedSimple, embedCid }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `embedSimple` | `(parsedFont, codePoints, opts?) => SimpleEmbed` | `/TrueType` + `/WinAnsiEncoding`. Every code point must be CP1252-representable. |
| `embedCid` | `(parsedFont, codePoints, opts?) => CidEmbed` | `/Type0` + `/Identity-H` with a `/CIDFontType2` descendant. Any Unicode code point. |

`parsedFont` must be a real parsed `Font` — `unicodeMap`, `glyphIndexForCodePoint`, `advanceWidth` and a numeric `unitsPerEm` are all read. `codePoints` is any iterable of integers; it is de-duplicated and sorted, and the sorted array is echoed back as `codePoints`. `opts` is forwarded to `subsetForPdf` (`embedCid` adds `{ cid: true }`).

The factory validates at construction that its four injected `@awacloud/fonts/embed-pdf` helpers (`subsetForPdf`, `buildFontDescriptor`, `buildCidSystemInfo`, `embedBuildToUnicode`) are functions, throwing `ContractError` otherwise.

## What the adapter consumes

`subsetForPdf(font, codePoints, opts?)` returns exactly eight keys — `subsetBytes`, `gidMap`, `glyphMap`, `encoding`, `widths`, `toUnicodeCmap`, `postScriptName`, `fontDescriptor`. The adapter reads all of them except `encoding` (always `null`: under `Identity-H` the encoding is the cmap). A unit-tier **contract-shape guard** (`src/font/embed.test.js`) resolves the REAL `embedSubsetForPdf` through a `ModuleRuntime` and asserts that key set, so the stub can never drift from the package again.

Two conversions happen here and nowhere else:

- **Widths.** `subset.widths` is indexed by NEW gid and expressed in **font units**. Everything this module emits (`/Widths`, `/W`, `widthOf`) is `round(w * 1000 / unitsPerEm)`.
- **`/ToUnicode` source.** A `/ToUnicode` CMap is keyed by *character code*. For `embedCid` the code IS the CID (= the subset's new gid), which is exactly how `subset.toUnicodeCmap` is keyed — it is used verbatim. For `embedSimple` the codes are WinAnsi **bytes**, so the gid-keyed CMap would be wrong; the adapter builds the byte-keyed map and passes it to `embedBuildToUnicode` with `{ codeBytes: 1 }`, so the CMap declares a one-byte codespace (`<00> <FF>`) and 2-hex-digit codes; `embedCid` keeps the 2-byte default. Never both for one route.

## The consumer's contract — the descriptor carries no font program

`buildFontDescriptor` puts the raw subset bytes in `FontFile2` (TrueType) or `FontFile3` (CFF). The adapter **lifts them out**: the returned `descriptor` dict has no font-program key, and the bytes come back as `fontFile` with the key name in `fontFileKey`. The consumer must:

1. allocate the font program as a **stream indirect** whose dict carries `/Length1 = fontFile.length` (the serializer adds `/Length`), and set `descriptor.entries[fontFileKey]` to that ref;
2. allocate `toUnicodeStream` as a stream indirect too and set the font dict's `ToUnicode` to that ref — `pdfSerializer` refuses an inline stream (`pdf/serializer/inline-stream`).

The font dict itself may be written inline or as an indirect; the descriptor nests fine inside it.

Do this wiring in **new** dicts — spread the result's `entries` into a fresh
`obj.dict({ … })` and add the references there — rather than by assigning into
the result's own dicts. The embed result is then left untouched and can be
reused for another document (or another page tree) as is.
[`pdfBuilder`](../document/builder.md)'s `addFont({ name, embedded })` does
exactly this wiring for you: it copies the entries into new dicts, never
mutates the result, and allocates its indirects per document.

### Shape `SimpleEmbed`

```js
{
    subtype: 'TrueType',
    fontDict:        typed dict (Type/Subtype/BaseFont/Encoding/FirstChar/LastChar/Widths/FontDescriptor/ToUnicode),
    descriptor:      typed dict — no FontFile2/FontFile3 key,
    toUnicodeStream: typed stream (byte-keyed CMap),
    fontFile:        Uint8Array — the subset font program,
    fontFileKey:     'FontFile2' | 'FontFile3',
    encode(text):    Uint8Array — one WinAnsi byte per code point,
    widthOf(cp):     number — 1000/em, 0 when the cp is not embedded,
    codePoints:      number[] — de-duplicated, ascending
}
```

`BaseFont` is the subsetter's `postScriptName` (already `ABCDEF+Family`). `FirstChar`/`LastChar` are the min/max WinAnsi bytes of the embedded set, and `Widths` covers `[FirstChar..LastChar]` with `0` in the unused slots.

### Shape `CidEmbed`

```js
{
    type0Dict:       typed dict (Type/Subtype:Type0/BaseFont/Encoding:Identity-H/DescendantFonts/ToUnicode),
    cidFontDict:     typed dict (Subtype:CIDFontType2/CIDSystemInfo/FontDescriptor/DW/W/CIDToGIDMap:Identity),
    descriptor:      typed dict — no FontFile2/FontFile3 key,
    toUnicodeStream: typed stream (CID-keyed CMap),
    fontFile:        Uint8Array,
    fontFileKey:     'FontFile2' | 'FontFile3',
    encode(text):    Uint8Array — 2 big-endian bytes (the CID) per code point;
                     an unknown cp becomes CID 0 (.notdef) and bumps `encode.missing`,
    widthOf(cp):     number — 1000/em, 0 when the cp is not embedded,
    codePoints:      number[]
}
```

The subset is renumbered, so **CID === new gid** and `/CIDToGIDMap` is `/Identity`. `/DW` is `1000`; `/W` is the compact `[c [w …] …]` form over the subset's gids.

## Examples

### Simple embed (`/TrueType` + `/WinAnsiEncoding`)

```js
const emb  = runtime.resolve('pdfFontEmbed');
const { obj } = runtime.resolve('pdfParserObj');

const e = emb.embedSimple(parsedFont, [...'Hello'].map(c => c.codePointAt(0)));

// Clone, don't mutate: new dicts carry the two stream references,
// `e` itself stays reusable for another document.
const descriptor = obj.dict({ ...e.descriptor.entries, [e.fontFileKey]: obj.ref(6, 0) });
const fontDict   = obj.dict({ ...e.fontDict.entries, FontDescriptor: descriptor, ToUnicode: obj.ref(7, 0) });

const indirects = [
    /* … catalog, pages, page, contents … */
    { num: 5, gen: 0, value: fontDict },
    { num: 6, gen: 0, value: obj.stream(obj.dict({ Length1: obj.int(e.fontFile.length) }), e.fontFile) },
    { num: 7, gen: 0, value: obj.stream(obj.dict({}), e.toUnicodeStream.raw) }
];

// Content stream: the show-string is what `encode` produced.
e.encode('Hello');    // Uint8Array [0x48, 0x65, 0x6C, 0x6C, 0x6F]
e.widthOf(0x48);      // advance width of 'H' in 1000/em, never font units
```

### CID embed (composite `/Type0`)

```js
const e = emb.embedCid(parsedFont, [...'Uni é ﬁ'].map(c => c.codePointAt(0)));

const descriptor = obj.dict({ ...e.descriptor.entries, [e.fontFileKey]: obj.ref(6, 0) });
const cidFont    = obj.dict({ ...e.cidFontDict.entries, FontDescriptor: descriptor });
const type0      = obj.dict({ ...e.type0Dict.entries,
                              DescendantFonts: obj.array([cidFont]),
                              ToUnicode: obj.ref(7, 0) });
// font program at 6 and e.toUnicodeStream at 7, as in the simple route

const codes = e.encode('Uni é ﬁ');   // 2 bytes per code point, big-endian CIDs
e.encode.missing;                    // 0 — every cp was in the subset
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/embed/missing-fonts-embed` | `ContractError` | The injected `@awacloud/fonts/embed-pdf` helpers are absent or don't supply the 4 required functions (thrown at factory time). |
| `pdf/embed/bad-font` | `ContractError` | `parsedFont` is not a parsed `Font` (missing `unicodeMap` / `glyphIndexForCodePoint` / `advanceWidth` / numeric `unitsPerEm`). |
| `pdf/embed/bad-codepoints` | `ContractError` | `codePoints` is not iterable, is empty, or holds a non-integer / out-of-range value (`context.cp`). |
| `pdf/embed/not-winansi` | `ContractError` | `embedSimple` was given a code point outside CP1252 (`context.cp`) — use `embedCid`. Also thrown by `SimpleEmbed.encode` for a character outside the embedded set. |

## See also

- [`pdfFont`](./font.md) — read-side typing.
- [`pdfFontEncoding`](./encoding.md) — `/Encoding` resolution.
- [`pdfWriter`](../document/writer.md) — consumes the payload.
- [`parser-obj`](../syntax/parser-obj.md) — `obj.*` constructors.
- `tests/font-embed-real.integration.test.js` — both routes written and read back against a REAL parsed font.
