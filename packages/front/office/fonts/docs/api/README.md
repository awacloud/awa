# API — `@awacloud/fonts`

Reference pages for the `@awacloud/fonts` modules, organised like `src/`. Each page documents one module descriptor: what it returns when resolved, its dependencies and a usage example. The entry point is [main](./main.md), which also lists every descriptor the package root exports and marks those that have no page of their own (internal sub-modules documented through their parent module).

**Prerequisites**: the `@awacloud/fonts` package and an `@awacloud/fw` runtime — descriptors are resolved by name (`fw.runtime.resolve('<module>')`) after registering the manifest arrays; see [main](./main.md). The sections below are grouped by area; every page is current for the published surface.

## Errors
- [errors](./errors.md) — `FontError` / `ParseError` / `RenderError` / `ContractError`

## Primitives
- [primitives/fixed](./primitives/fixed.md) — Fixed 16.16 + F2Dot14
- [primitives/tag](./primitives/tag.md) — Pack/unpack 4-char tags
- [primitives/reader](./primitives/reader.md) — `BinaryReader` BE
- [primitives/writer](./primitives/writer.md) — `BinaryWriter` BE
- [primitives/checksum](./primitives/checksum.md) — OT table checksum + head adjustment
- [primitives/encoding](./primitives/encoding.md) — UTF-16BE, Mac Roman

## Containers
- [sfnt/sfnt](./sfnt/sfnt.md) — `parseSfnt` / `packSfnt`
- [sfnt/ttc](./sfnt/ttc.md) — TTC/OTC collections
- [sfnt/woff](./sfnt/woff.md) — WOFF1 (zlib)
- [sfnt/woff2](./sfnt/woff2.md) — WOFF2 (Brotli, no inverse transform)
- [_shared/](./_shared/README.md) — `fontsShared`, container constants and helpers shared by the SFNT, TTC, WOFF and WOFF2 modules

## OpenType tables (required)
- [table/head](./table/head.md)
- [table/hhea](./table/hhea.md)
- [table/maxp](./table/maxp.md)
- [table/hmtx](./table/hmtx.md)
- [table/cmap](./table/cmap.md) — formats 0 / 2 / 4 / 6 / 12 / 13 / 14
- [table/name](./table/name.md)
- [table/os2](./table/os2.md) — v0..v5
- [table/post](./table/post.md) — v1 / v2 / v3
- [table/loca](./table/loca.md)
- [table/glyf](./table/glyf.md)

## OpenType tables (optional)
- [table/cff](./table/cff.md) — CFF Type 2 charstrings
- [table/cff2](./table/cff2.md) — CFF2 (variable CFF)
- [table/kern](./table/kern.md) — legacy kerning (MS + Apple)
- [table/gasp](./table/gasp.md) — grid-fitting per ppem
- [table/hdmx](./table/hdmx.md) — horizontal device metrics
- [table/vdmx](./table/vdmx.md) — vertical device metrics
- [table/ltsh](./table/ltsh.md) — linear threshold
- [table/vhea](./table/vhea.md) [table/vmtx](./table/vmtx.md) [table/vorg](./table/vorg.md) — vertical metrics and vertical origin
- [table/base](./table/base.md)

## Variable fonts
- [table/fvar](./table/fvar.md) [table/avar](./table/avar.md) [table/stat](./table/stat.md) — axes and named instances
- [table/gvar](./table/gvar.md) [table/hvar](./table/hvar.md) [table/mvar](./table/mvar.md) — variation deltas
- [variable/](./variable/README.md) — [coordsConvert](./variable/coordsConvert.md), [instance](./variable/instance.md) — variable-font helpers

## Colour and bitmap
- [table/colr](./table/colr.md) [table/cpal](./table/cpal.md) [table/sbix](./table/sbix.md) [table/svg](./table/svg.md) [table/cbdt](./table/cbdt.md) [table/cblc](./table/cblc.md)
- [table/ebdt](./table/ebdt.md) [table/eblc](./table/eblc.md) [table/ebsc](./table/ebsc.md) — embedded bitmap strikes (EBDT data, EBLC locations, EBSC scaling)

## Glyph
- [glyph/path](./glyph/path.md) — `Path` + `pathFromSimpleGlyph`
- [glyph/glyph](./glyph/glyph.md) — `Glyph` wrapper
- [glyph/compositeResolve](./glyph/compositeResolve.md) — recursive composite resolution

## Layout
- [layout/classDefinitions](./layout/classDefinitions.md) — Coverage + ClassDef
- [table/gdef](./table/gdef.md) [table/gsub](./table/gsub.md) [table/gpos](./table/gpos.md) — layout tables

## Encodings
- [encodings/](./encodings/README.md) — winAnsi, macRoman, macExpert, standard, symbol, zapfDingbats, lookup, aglTable ([encodings/aglTable](./encodings/aglTable.md))
- [cmap/toUnicode](./cmap/toUnicode.md) — ToUnicode CMap (Adobe TN #5014)

## Embed-PDF
- [embed-pdf/](./embed-pdf/README.md) — subsetForPdf, fontDescriptor, cidSystemInfo, toUnicodeBuilder, index

## Standard 14
- [standard14/](./standard14/README.md) — Helvetica × 4, Times × 4, Courier × 4, Symbol, ZapfDingbats, lookup

## Orchestrator
- [fonts](./fonts.md) — top-level `read` + `.use()`

## Extra
- [extra/tt-hinting](./extra/tt-hinting.md) — RM05 hinting VM (opcode groups in `extra/tt-hinting/`)
- [extra/woff2-write](./extra/woff2-write.md) — WOFF2 encoder
- [extra/dsig](./extra/dsig.md) — Digital Signature
- [extra/math](./extra/math.md) [extra/jstf](./extra/jstf.md)
- [extra/shaper-arabic](./extra/shaper-arabic.md) [extra/shaper-indic](./extra/shaper-indic.md) [extra/shaper-cjk](./extra/shaper-cjk.md)
- [extra/apple-aat/](./extra/apple-aat/README.md) — morx, kerx, ankr, prop, lcar, feat, index

## Bundles
- [bundles/fonts-large](./bundles/fonts-large.md) [bundles/fonts-full](./bundles/fonts-full.md) [bundles/fonts-apple-aat](./bundles/fonts-apple-aat.md)
